'use strict';
// Per-frame render pipeline:
// sky LUT -> shadow map -> clouds -> G-buffer -> deferred lighting -> translucent (water/glass)
// -> volumetric light -> composite -> TAA -> bloom -> auto exposure -> tonemap (+FXAA)
(function () {
  const M = MC.mat4;
  const tmp = {
    view: M.create(), proj: M.create(), projNJ: M.create(), vp: M.create(), vpNJ: M.create(),
    ivp: M.create(), ivpNJ: M.create(), sView: M.create(), sProj: M.create(), sMat: M.create(),
    planes: null, splanes: null,
  };

  MC.Renderer.prototype.drawFSQ = function () {
    const gl = this.gl;
    gl.bindVertexArray(this.fsqVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Height of the highest rain-blocking block for a 128x128 area around the camera (rain occlusion)
  MC.Renderer.prototype.updateRainMap = function (world, px, pz) {
    const now = performance.now();
    const N = 128, ox = Math.floor(px) - 64, oz = Math.floor(pz) - 64;
    const moved = Math.abs(ox - this.rainOrigin[0]) > 8 || Math.abs(oz - this.rainOrigin[1]) > 8;
    if (!moved && now - this.rainMapTime < 700 && this.rainMapVer === world.editVersion) return;
    this.rainMapTime = now; this.rainMapVer = world.editVersion;
    this.rainOrigin = [ox, oz];
    const data = this.rainData || (this.rainData = new Float32Array(N * N));
    const SH = MC.B_SHAPE, CROSS = MC.SHAPE.CROSS, TORCH = MC.SHAPE.TORCH;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const wx = ox + x, wz = oz + z;
      const c = world.getChunk(wx >> 4, wz >> 4);
      let h = 0;
      if (c) {
        const b0 = (wx & 15) + (wz & 15) * 16, B = c.blocks;
        for (let y = c.maxY; y >= 0; y--) {
          const b = B[b0 + y * 256];
          if (b && SH[b] !== CROSS && SH[b] !== TORCH) { h = y + 1; break; }
        }
      }
      data[z * N + x] = h;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.rainMap);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RED, gl.FLOAT, data);
  };

  MC.Renderer.prototype.render = function (cam, world, sky, dt, info) {
    // resize first: it recreates the render targets referenced below
    this.resize(false);
    if (this.shadowSize !== this.settings.shadowRes) this._makeShadowMap(this.settings.shadowRes);
    const gl = this.gl, s = this.settings, P = this.P, T = this.T, F = this.F;
    const W = this.W, H = this.H, hw = T.clouds.w, hh = T.clouds.h;
    this.frame++;
    const time = info.time;
    const camX = cam.pos[0], camY = cam.pos[1], camZ = cam.pos[2];

    // ---------- camera
    const cp = Math.cos(cam.pitch);
    const fwd = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
    M.lookAt(tmp.view, [0, 0, 0], fwd, [0, 1, 0]);
    const near = 0.06, far = Math.max(800, s.renderDist * 16 * 2.5);
    M.perspective(tmp.projNJ, cam.fov * Math.PI / 180, W / H, near, far);
    tmp.proj.set(tmp.projNJ);
    if (s.taa) {
      const k = (this.frame % 16) + 1;
      tmp.proj[8] += (MC.halton(k, 2) - 0.5) * 2 / W;
      tmp.proj[9] += (MC.halton(k, 3) - 0.5) * 2 / H;
    }
    M.multiply(tmp.vp, tmp.proj, tmp.view);
    M.multiply(tmp.vpNJ, tmp.projNJ, tmp.view);
    M.invert(tmp.ivp, tmp.vp);
    M.invert(tmp.ivpNJ, tmp.vpNJ);
    tmp.planes = MC.frustumPlanes(tmp.vpNJ, tmp.planes);

    // ---------- shadow matrix (camera centred, distorted in the shader)
    const L = sky.lightDir;
    const up = Math.abs(L[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    M.lookAt(tmp.sView, [L[0], L[1], L[2]], [0, 0, 0], up);
    const half = s.shadowDist, range = 480;
    M.ortho(tmp.sProj, -half, half, -half, half, -range / 2, range / 2);
    M.multiply(tmp.sMat, tmp.sProj, tmp.sView);
    tmp.splanes = MC.frustumPlanes(tmp.sMat, tmp.splanes);

    // ---------- visible chunk lists
    const vis = [], shadowList = [];
    let quads = 0;
    for (const c of world.chunks.values()) {
      if (!c.gpu) continue;
      const x0 = c.cx * 16 - camX, z0 = c.cz * 16 - camZ, y0 = -camY, y1 = c.meshMaxY + 1 - camY;
      const dx = x0 + 8, dz = z0 + 8;
      if (MC.boxInFrustum(tmp.planes, x0, y0, z0, x0 + 16, y1, z0 + 16)) {
        vis.push({ c, d: dx * dx + dz * dz });
        for (const g of c.gpu) if (g) quads += g.quads;
      }
      if (dx * dx + dz * dz < (half + 24) * (half + 24) && MC.boxInFrustum(tmp.splanes, x0, y0, z0, x0 + 16, y1, z0 + 16)) shadowList.push({ c });
    }
    vis.sort((a, b) => a.d - b.d);
    this.stats.drawn = vis.length; this.stats.shadowDrawn = shadowList.length; this.stats.quads = quads;
    this.stats.chunks = world.chunks.size;

    const drawLayer = (prog, list, layer) => {
      for (const it of list) {
        const c = it.c, g = c.gpu && c.gpu[layer];
        if (!g) continue;
        prog.f3('u_chunkOffset', c.cx * 16 - camX, -camY, c.cz * 16 - camZ);
        gl.bindVertexArray(g.vao);
        gl.drawElements(gl.TRIANGLES, g.quads * 6, gl.UNSIGNED_INT, 0);
      }
    };

    const sunAngle = (sky.hours - 6) / 24 * Math.PI * 2;
    // weather: overcast light, greyer ambient, denser fog and clouds
    const rain = info.rain || 0, wet = info.wet || 0;
    const lightColor = sky.lightColor.map((v) => v * (1 - 0.82 * rain));
    const grey = (c) => { const l = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2; return c.map((v) => MC.lerp(v, l * 0.8, rain * 0.75)); };
    const ambUp = grey(sky.ambUp), ambSide = grey(sky.ambSide), ambDown = grey(sky.ambDown);
    const lightI = Math.max(lightColor[0], lightColor[1], lightColor[2]);
    const vlDensity = (0.0005 + sky.duskF * 0.0016 + (1 - sky.dayF) * 0.0012) * s.vlStrength * (1 - 0.6 * rain);
    const cloudCover = MC.lerp(s.cloudCover + Math.sin(time * 0.013) * 0.05, 0.93, rain);
    if (rain > 0.001) this.updateRainMap(world, camX, camZ);
    const common = (p) => {
      p.f3('u_camPos', camX, camY, camZ).f1('u_time', time).f1('u_frame', this.frame % 64);
      p.v3('u_sunDir', sky.sunDir).v3('u_moonDir', sky.moonDir).v3('u_sunTrans', sky.sunTrans).v3('u_moonTrans', sky.moonTrans);
      p.f1('u_starF', sky.starF).f1('u_sunAngle', sunAngle);
      p.f1('u_fogDensity', sky.fogDensity * s.fog + rain * 0.0038).f1('u_mist', (sky.mist + rain * 0.6) * s.fog).f1('u_renderDist', s.renderDist * 16);
      p.v3('u_lightDir', sky.lightDir).v3('u_lightColor', lightColor);
      p.v3('u_ambUp', ambUp).v3('u_ambSide', ambSide).v3('u_ambDown', ambDown);
      p.f1('u_rain', rain).f1('u_wet', wet);
      p.f3('u_seaColor', ambUp[0] * 0.03 + lightColor[0] * 0.004, ambUp[1] * 0.09 + lightColor[1] * 0.014, ambUp[2] * 0.14 + lightColor[2] * 0.02);
      p.f3('u_cloudWind', time * 0.0035, 0, time * 0.0012).f1('u_cloudCover', cloudCover).f1('u_cloudsOn', s.clouds ? 1 : 0);
      p.f1('u_handLight', info.handLight).f1('u_underwater', info.underwater ? 1 : 0);
      p.m4('u_shadowMat', tmp.sMat).f1('u_shadowHalf', half).f1('u_shadowRes', this.shadowSize).f1('u_shadowRange', range);
      p.i1('u_shadowQuality', s.softShadows ? 1 : 0);
    };

    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    // ---------- sky LUT
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFBO);
    gl.viewport(0, 0, 256, 128);
    P.skyLut.use().v3('u_sunDir', sky.sunDir).v3('u_moonDir', sky.moonDir);
    this.drawFSQ();

    // ---------- shadow map
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clearBufferfv(gl.COLOR, 0, [1, 1, 1, 1]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
    if (lightI > 1e-4) {
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.2, 2.0);
      P.shadow.use(); common(P.shadow);
      P.shadow.tex('u_texAlbedo', this.texAlbedo);
      gl.colorMask(false, false, false, false);
      drawLayer(P.shadow, shadowList, 0);
      const EB = this.entityBatch;
      if (info.entities && EB.shadowN) {
        const Se = P.shadowEntity.use();
        Se.m4('u_shadowMat', tmp.sMat).tex('u_texAlbedo', this.texAlbedo);
        gl.disable(gl.CULL_FACE);
        EB.draw(EB.shadowN);
      }
      P.shadow.use();
      gl.colorMask(true, false, false, false); gl.depthMask(false);
      drawLayer(P.shadow, shadowList, 1);
      gl.colorMask(true, true, true, true); gl.depthMask(true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---------- clouds (half resolution)
    gl.disable(gl.DEPTH_TEST);
    if (s.clouds) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.clouds);
      gl.viewport(0, 0, hw, hh);
      P.clouds.use(); common(P.clouds);
      P.clouds.m4('u_invViewProj', tmp.ivp).tex('u_noise3D', this.noise3D);
      this.drawFSQ();
    }

    // ---------- G-buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.gbuf);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    P.gbuffer.use(); common(P.gbuffer);
    P.gbuffer.m4('u_viewProj', tmp.vp).f1('u_pomDepth', s.pom ? 0.14 : 0)
      .tex('u_texAlbedo', this.texAlbedo).tex('u_texNormal', this.texNormal).tex('u_texSpec', this.texSpec);
    drawLayer(P.gbuffer, vis, 0);
    if (info.entities && this.entityBatch.n) {
      const E = P.entity.use();
      E.m4('u_viewProj', tmp.vp).tex('u_texAlbedo', this.texAlbedo).tex('u_texNormal', this.texNormal).tex('u_texSpec', this.texSpec);
      this.entityBatch.draw(this.entityBatch.n);
    }
    if (info.hand && this.hand.quads) {
      // held item: compressed depth range keeps it in front of the world
      gl.depthRange(0.0, 0.08);
      const Hp = P.hand.use();
      common(Hp);
      Hp.m4('u_viewProj', tmp.vp).m4('u_model', this.hand.model).m3('u_normalMat', this.hand.normalMat).f1('u_pomDepth', 0)
        .tex('u_texAlbedo', this.texAlbedo).tex('u_texNormal', this.texNormal).tex('u_texSpec', this.texSpec);
      this.hand.draw();
      gl.depthRange(0.0, 1.0);
    }
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);

    // ---------- deferred lighting
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.hdr);
    const D = P.deferred.use();
    common(D);
    D.m4('u_invViewProj', tmp.ivp)
      .tex('u_albedo', T.gAlbedo).tex('u_normal', T.gNormal).tex('u_mat', T.gMat).tex('u_depth', T.gDepth)
      .tex('u_clouds', T.clouds).tex('u_shadowDepth', this.shadowDepth, this.rawSampler)
      .tex('u_shadowCmp', this.shadowDepth, this.cmpSampler).tex('u_shadowWater', this.shadowWater)
      .tex('u_skyLUT', this.skyLUT).tex('u_noise2D', this.noise2D).tex('u_noise3D', this.noise3D);
    this.drawFSQ();

    // ---------- copies for refraction / SSR
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, F.gbuf);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, F.depthCopy);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, F.hdr);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, F.sceneCopy);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    // ---------- translucent: water, then glass/ice (back to front), then selection outline
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.trans);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const Wp = P.water.use();
    common(Wp);
    Wp.m4('u_viewProj', tmp.vp).f2('u_resolution', W, H).f1('u_near', near).f1('u_far', far).i1('u_ssr', s.ssr ? 1 : 0)
      .tex('u_sceneCopy', T.sceneCopy).tex('u_depthCopy', T.depthCopy).tex('u_texAlbedo', this.texAlbedo)
      .tex('u_shadowCmp', this.shadowDepth, this.cmpSampler).tex('u_skyLUT', this.skyLUT)
      .tex('u_noise2D', this.noise2D).tex('u_noise3D', this.noise3D);
    drawLayer(Wp, vis, 1);
    const back = vis.slice().reverse();
    drawLayer(Wp, back, 2);
    if (info.crack && info.crack.stage > 0) {
      const k = info.crack;
      gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
      gl.enable(gl.CULL_FACE);
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);
      P.crack.use().m4('u_viewProj', tmp.vp).f3('u_offset', k.x - camX, k.y - camY, k.z - camZ).f3('u_size', k.sx, k.sy, k.sz)
        .f1('u_tile', MC.TILE.destroy).f1('u_stage', k.stage).tex('u_texAlbedo', this.texAlbedo);
      gl.bindVertexArray(this.crackVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
      gl.disable(gl.CULL_FACE);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true); gl.depthFunc(gl.LESS);
    }
    if (info.target) {
      const t = info.target;
      gl.depthFunc(gl.LEQUAL);
      P.outline.use().m4('u_viewProj', tmp.vp).f3('u_offset', t[0] - camX, t[1] - camY, t[2] - camZ).f3('u_size', t[3] || 1, t[4] || 1, t[5] || 1);
      gl.bindVertexArray(this.outlineVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.depthFunc(gl.LESS);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // ---------- volumetric light (half resolution)
    if (s.volumetric && lightI > 1e-4) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.vl);
      gl.viewport(0, 0, hw, hh);
      const V = P.volumetric.use();
      common(V);
      V.m4('u_invViewProj', tmp.ivp).f1('u_vlDensity', vlDensity)
        .tex('u_depth', T.gDepth).tex('u_shadowCmp', this.shadowDepth, this.cmpSampler)
        .tex('u_shadowWater', this.shadowWater).tex('u_noise2D', this.noise2D);
      this.drawFSQ();
    }

    // ---------- composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.composite);
    gl.viewport(0, 0, W, H);
    const C = P.composite.use();
    common(C);
    C.m4('u_invViewProj', tmp.ivp).f1('u_vlOn', s.volumetric && lightI > 1e-4 ? 1 : 0)
      .tex('u_scene', T.hdr).tex('u_vl', T.vl).tex('u_depth', T.gDepth);
    this.drawFSQ();

    // ---------- TAA
    let src = T.composite;
    if (s.taa) {
      const w = this.histIndex, r = 1 - w;
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.hist[w]);
      P.taa.use().m4('u_invViewProjNJ', tmp.ivpNJ).m4('u_prevViewProj', this.prevViewProjNJ)
        .f3('u_camDelta', camX - this.prevCamPos[0], camY - this.prevCamPos[1], camZ - this.prevCamPos[2])
        .f2('u_res', W, H).f1('u_histValid', this.histValid ? 1 : 0)
        .tex('u_cur', T.composite).tex('u_hist', T.hist[r]).tex('u_depth', T.gDepth);
      this.drawFSQ();
      src = T.hist[w];
      this.histIndex = r;
      this.histValid = true;
    } else this.histValid = false;
    this.prevViewProjNJ.set(tmp.vpNJ);
    this.prevCamPos = [camX, camY, camZ];

    // ---------- bloom
    const BD = P.bloomDown.use();
    let bsrc = src, bw = W, bh = H;
    for (let i = 0; i < T.bloom.length; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.bloom[i]);
      gl.viewport(0, 0, T.bloom[i].w, T.bloom[i].h);
      BD.tex('u_src', bsrc).f2('u_srcRes', bw, bh).f1('u_karis', i === 0 ? 1 : 0);
      this.drawFSQ();
      bsrc = T.bloom[i]; bw = T.bloom[i].w; bh = T.bloom[i].h;
    }
    // exposure reads the smallest (pure downsample) level before the upsample chain modifies larger ones
    const ew = this.expIndex, er = 1 - ew;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.expFBO[ew]);
    gl.viewport(0, 0, 1, 1);
    P.exposure.use().tex('u_small', T.bloom[T.bloom.length - 1]).tex('u_prev', this.expTex[er])
      .f1('u_dt', Math.min(dt, 0.1)).f1('u_minExp', 0.4).f1('u_maxExp', 3.2);
    this.drawFSQ();
    this.expIndex = er;
    const expTex = this.expTex[ew];
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const BU = P.bloomUp.use();
    for (let i = T.bloom.length - 2; i >= 0; i--) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.bloom[i]);
      gl.viewport(0, 0, T.bloom[i].w, T.bloom[i].h);
      BU.tex('u_src', T.bloom[i + 1]).f2('u_srcRes', T.bloom[i + 1].w, T.bloom[i + 1].h).f1('u_radius', 1.0);
      this.drawFSQ();
    }
    gl.disable(gl.BLEND);

    // ---------- tonemap / output
    const useFXAA = !s.taa && s.fxaa;
    const Fi = P.final.use();
    Fi.f1('u_rain', rain).m4('u_invViewProj', tmp.ivp).f3('u_camPos', camX, camY, camZ)
      .f2('u_rainOrigin', this.rainOrigin[0], this.rainOrigin[1])
      .v3('u_rainColor', [ambUp[0] * 1.6 + lightColor[0] * 0.25, ambUp[1] * 1.6 + lightColor[1] * 0.25, ambUp[2] * 1.6 + lightColor[2] * 0.25])
      .tex('u_depth', T.gDepth).tex('u_rainMap', this.rainMap);
    Fi.tex('u_scene', src).tex('u_bloom', T.bloom[0]).tex('u_exposure', expTex)
      .f2('u_res', W, H).f1('u_bloomStrength', s.bloom).f1('u_exposureBias', s.exposure)
      .f1('u_saturation', s.saturation).f1('u_vignette', s.vignette).f1('u_sharpen', s.taa ? 0.22 : 0)
      .f1('u_time', time).f1('u_underwater', info.underwater ? 1 : 0);
    if (useFXAA) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.ldr);
      gl.viewport(0, 0, W, H);
      this.drawFSQ();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      P.fxaa.use().tex('u_tex', T.ldr).f2('u_res', W, H);
      this.drawFSQ();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.drawFSQ();
    }
    gl.bindVertexArray(null);
  };
})();
