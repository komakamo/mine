'use strict';
// Renderer resources: programs, texture arrays, noise textures, render targets and chunk meshes.
MC.Renderer = class {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const gl = this.gl = MC.GL.init(canvas);
    this.frame = 0;
    this.histIndex = 0;
    this.histValid = false;
    this.expIndex = 0;
    this.prevViewProjNJ = MC.mat4.create();
    this.prevCamPos = [0, 0, 0];
    this.chunkList = [];
    this.stats = { chunks: 0, drawn: 0, shadowDrawn: 0, quads: 0 };
    this._compilePrograms();
    this._initStatic();
    this.hand = new MC.Hand(this);
    this.entityBatch = new MC.EntityBatch(this);
    this.resize(true);
    if (new URLSearchParams(location.search).has('glcheck')) this._installGLCheck();
  }

  // Debug aid: record GL errors per program / framebuffer (enabled with ?glcheck=1)
  _installGLCheck() {
    const gl = this.gl, self = this;
    this.glErrors = {};
    for (const fn of ['drawArrays', 'drawElements']) {
      const orig = gl[fn].bind(gl);
      gl[fn] = function (...a) {
        orig(...a);
        const e = gl.getError();
        if (!e) return;
        let prog = '?', fb = 'screen';
        for (const k in self.P) if (self.P[k].p === gl.getParameter(gl.CURRENT_PROGRAM)) prog = k;
        const cur = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        for (const k in self.F) { const v = self.F[k]; (Array.isArray(v) ? v : [v]).forEach((f, i) => { if (f === cur) fb = k + (Array.isArray(v) ? i : ''); }); }
        if (cur === self.shadowFBO) fb = 'shadow';
        const key = `${prog}:${fn}:${fb}:${e} @frame${self.frame}`;
        self.glErrors[key] = (self.glErrors[key] || 0) + 1;
      };
    }
  }

  _compilePrograms() {
    const S = MC.SH, G = MC.GL;
    const fsq = (fs, n) => G.program(S.fsqVS, fs, n);
    this.P = {
      shadow: G.program(S.shadowVS, S.shadowFS, 'shadow'),
      gbuffer: G.program(S.gbufferVS, S.gbufferFS, 'gbuffer'),
      hand: G.program(S.handVS, S.handFS, 'hand'),
      water: G.program(S.waterVS, S.waterFS, 'water'),
      outline: G.program(S.outlineVS, S.outlineFS, 'outline'),
      entity: G.program(S.entityVS, S.entityFS, 'entity'),
      shadowEntity: G.program(S.shadowEntityVS, S.shadowEntityFS, 'shadowEntity'),
      crack: G.program(S.crackVS, S.crackFS, 'crack'),
      skyLut: fsq(S.skyLutFS, 'skyLut'),
      clouds: fsq(S.cloudsFS, 'clouds'),
      deferred: fsq(S.deferredFS, 'deferred'),
      volumetric: fsq(S.volumetricFS, 'volumetric'),
      composite: fsq(S.compositeFS, 'composite'),
      taa: fsq(S.taaFS, 'taa'),
      bloomDown: fsq(S.bloomDownFS, 'bloomDown'),
      bloomUp: fsq(S.bloomUpFS, 'bloomUp'),
      exposure: fsq(S.exposureFS, 'exposure'),
      final: fsq(S.finalFS, 'final'),
      fxaa: fsq(S.fxaaFS, 'fxaa'),
      blit: fsq(S.blitFS, 'blit'),
    };
  }

  _initStatic() {
    const gl = this.gl, G = MC.GL;
    // --- block texture arrays
    const tex = MC.TexGen.build();
    const arr = (data, internal) => G.texture({
      target: gl.TEXTURE_2D_ARRAY, w: tex.size, h: tex.size, d: tex.count, internal, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      data, filter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR, wrap: gl.REPEAT, mips: true, aniso: true,
    });
    this.texAlbedo = arr(tex.albedo, gl.SRGB8_ALPHA8);
    this.texNormal = arr(tex.normal, gl.RGBA8);
    this.texSpec = arr(tex.specular, gl.RGBA8);
    // --- noise textures
    this.noise2D = G.texture({ w: 256, h: 256, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: this._noise2D(256), wrap: gl.REPEAT, minFilter: gl.LINEAR_MIPMAP_LINEAR, mips: true });
    this.noise3D = G.texture({ target: gl.TEXTURE_3D, w: 32, h: 32, d: 32, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: this._noise3D(32), wrap: gl.REPEAT });
    // --- sky LUT
    this.skyLUT = G.rt(256, 128, 'rgba16f');
    gl.bindTexture(gl.TEXTURE_2D, this.skyLUT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.skyFBO = G.fbo([this.skyLUT], null);
    // --- shadow samplers
    this.cmpSampler = gl.createSampler();
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.cmpSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.rawSampler = gl.createSampler();
    gl.samplerParameteri(this.rawSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.rawSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(this.rawSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(this.rawSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._makeShadowMap(this.settings.shadowRes);
    // --- shared quad index buffer
    const MAXQ = this.MAXQ = 1 << 18;
    const idx = new Uint32Array(MAXQ * 6);
    for (let q = 0, i = 0; q < MAXQ; q++, i += 6) {
      const v = q * 4;
      idx[i] = v; idx[i + 1] = v + 3; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 1;
    }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // --- empty VAO for full-screen passes
    this.fsqVAO = gl.createVertexArray();
    // --- selection outline (12 edges)
    const e = 0.002, a = -e, b = 1 + e;
    const P = [];
    const c = [[a, a, a], [b, a, a], [b, a, b], [a, a, b], [a, b, a], [b, b, a], [b, b, b], [a, b, b]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) P.push(...c[i], ...c[j]);
    this.outlineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.outlineVAO);
    const ob = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ob);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // crack overlay cube (36 vertices: pos3 + uv2)
    {
      const C = MC.Mesher.FACE_CORNERS, v = [];
      const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let f = 0; f < 6; f++) for (const k of [0, 3, 2, 0, 2, 1]) v.push(...C[f][k], ...UV[k]);
      this.crackVAO = gl.createVertexArray();
      gl.bindVertexArray(this.crackVAO);
      const cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      gl.bindVertexArray(null);
    }
    // rain occlusion height map (R32F, world block heights)
    this.rainMap = G.texture({ w: 128, h: 128, internal: gl.R32F, format: gl.RED, type: gl.FLOAT, filter: gl.NEAREST });
    this.rainOrigin = [0, 0]; this.rainMapTime = -1e9; this.rainMapVer = -1;
    // exposure ping-pong
    this.expTex = [G.rt(1, 1, 'rgba16f', gl.NEAREST), G.rt(1, 1, 'rgba16f', gl.NEAREST)];
    this.expFBO = this.expTex.map((t) => G.fbo([t], null));
    for (const f of this.expFBO) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _makeShadowMap(size) {
    const gl = this.gl, G = MC.GL;
    if (this.shadowFBO) {
      gl.deleteFramebuffer(this.shadowFBO); gl.deleteTexture(this.shadowDepth); gl.deleteTexture(this.shadowWater);
    }
    this.shadowSize = size;
    this.shadowDepth = G.rt(size, size, 'depth24');
    this.shadowWater = G.rt(size, size, 'r32f');
    this.shadowFBO = G.fbo([this.shadowWater], this.shadowDepth);
  }

  _noise2D(N) {
    const d = new Uint8Array(N * N * 4);
    const pers = [8, 16, 32, 64];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      for (let c = 0; c < 4; c++) {
        const per = pers[c];
        let v = MC.periodicPerlin2(x / N * per, y / N * per, per, 911 + c * 37) * 0.7;
        v += MC.periodicPerlin2(x / N * per * 2, y / N * per * 2, per * 2, 1911 + c * 37) * 0.3;
        d[(y * N + x) * 4 + c] = Math.round(MC.clamp(v * 0.5 + 0.5, 0, 1) * 255);
      }
    }
    return d;
  }

  _noise3D(N) {
    // periodic worley with precomputed feature points
    const worley = (per, seed) => {
      const pts = new Float32Array(per * per * per * 3);
      for (let i = 0; i < per * per * per; i++) {
        pts[i * 3] = MC.hash2(i, 1, seed); pts[i * 3 + 1] = MC.hash2(i, 2, seed); pts[i * 3 + 2] = MC.hash2(i, 3, seed);
      }
      return (x, y, z) => {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        let best = 9;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = xi + dx, cy = yi + dy, cz = zi + dz;
          const k = ((((cz % per) + per) % per) * per + (((cy % per) + per) % per)) * per + (((cx % per) + per) % per);
          const px = cx + pts[k * 3] - x, py = cy + pts[k * 3 + 1] - y, pz = cz + pts[k * 3 + 2] - z;
          const dd = px * px + py * py + pz * pz;
          if (dd < best) best = dd;
        }
        return Math.min(1, Math.sqrt(best));
      };
    };
    const w4 = worley(4, 11), w8 = worley(8, 12), w16 = worley(16, 13);
    const d = new Uint8Array(N * N * N * 4);
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, w = z / N;
      let p = MC.periodicPerlin3(u * 4, v * 4, w * 4, 4, 5) * 0.6 + MC.periodicPerlin3(u * 8, v * 8, w * 8, 8, 6) * 0.3 + MC.periodicPerlin3(u * 16, v * 16, w * 16, 16, 7) * 0.1;
      p = MC.clamp(p * 0.5 + 0.5, 0, 1);
      const wf = (1 - w4(u * 4, v * 4, w * 4)) * 0.625 + (1 - w8(u * 8, v * 8, w * 8)) * 0.25 + (1 - w16(u * 16, v * 16, w * 16)) * 0.125;
      // Perlin-Worley (remap perlin by worley)
      const pw = MC.clamp((p - (1 - wf)) / (1 - (1 - wf) * 0.4) * 0.6 + wf * 0.45, 0, 1);
      const det = (1 - w8(u * 8, v * 8, w * 8)) * 0.6 + (1 - w16(u * 16, v * 16, w * 16)) * 0.4;
      const cov = MC.clamp(MC.periodicPerlin3(u * 2, v * 2, w * 2, 2, 9) * 0.6 + 0.5 + MC.periodicPerlin3(u * 4, v * 4, w * 4, 4, 10) * 0.25, 0, 1);
      const i = ((z * N + y) * N + x) * 4;
      d[i] = pw * 255; d[i + 1] = det * 255; d[i + 2] = wf * 255; d[i + 3] = cov * 255;
    }
    return d;
  }

  resize(force) {
    const gl = this.gl, G = MC.GL, s = this.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    const W = Math.max(1, Math.floor(cw * s.renderScale)), H = Math.max(1, Math.floor(ch * s.renderScale));
    if (!force && this.W === W && this.H === H && this.canvas.width === cw && this.canvas.height === ch) return;
    this.canvas.width = cw; this.canvas.height = ch;
    this.W = W; this.H = H;
    this._freeTargets();
    const T = this.T = {};
    const list = this._targets = [];
    const rt = (w, h, f, filt) => { const t = G.rt(w, h, f, filt); list.push(t); return t; };
    T.gAlbedo = rt(W, H, 'srgba8', gl.NEAREST); T.gNormal = rt(W, H, 'rgba16f', gl.NEAREST);
    T.gMat = rt(W, H, 'rgba8', gl.NEAREST); T.gDepth = rt(W, H, 'depth');
    T.hdr = rt(W, H, 'rgba16f'); T.sceneCopy = rt(W, H, 'rgba16f'); T.depthCopy = rt(W, H, 'depth');
    T.composite = rt(W, H, 'rgba16f'); T.hist = [rt(W, H, 'rgba16f'), rt(W, H, 'rgba16f')];
    T.ldr = rt(W, H, 'rgba8');
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
    T.clouds = rt(hw, hh, 'rgba16f'); T.vl = rt(hw, hh, 'rgba16f');
    const F = this.F = {};
    const fl = this._fbos = [];
    const fb = (c, d) => { const f = G.fbo(c, d); fl.push(f); return f; };
    F.gbuf = fb([T.gAlbedo, T.gNormal, T.gMat], T.gDepth);
    F.hdr = fb([T.hdr], null);
    F.trans = fb([T.hdr], T.gDepth);
    F.sceneCopy = fb([T.sceneCopy], null);
    F.depthCopy = fb([], T.depthCopy);
    F.composite = fb([T.composite], null);
    F.hist = [fb([T.hist[0]], null), fb([T.hist[1]], null)];
    F.ldr = fb([T.ldr], null);
    F.clouds = fb([T.clouds], null); F.vl = fb([T.vl], null);
    T.bloom = []; F.bloom = [];
    let bw = W, bh = H;
    for (let i = 0; i < 6; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      const t = rt(bw, bh, 'rgba16f');
      T.bloom.push(t); F.bloom.push(fb([t], null));
    }
    this.histValid = false;
  }

  _freeTargets() {
    const gl = this.gl;
    if (this._targets) for (const t of this._targets) gl.deleteTexture(t);
    if (this._fbos) for (const f of this._fbos) gl.deleteFramebuffer(f);
    this._targets = []; this._fbos = [];
  }

  // ---- chunk meshes
  uploadChunk(chunk, out) {
    const gl = this.gl;
    if (!chunk.gpu) chunk.gpu = [null, null, null];
    for (let l = 0; l < 3; l++) {
      const m = out[l];
      let g = chunk.gpu[l];
      if (m.quads === 0) {
        if (g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vbo); chunk.gpu[l] = null; }
        continue;
      }
      if (!g) {
        g = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), quads: 0 };
        gl.bindVertexArray(g.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
        gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 16, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_BYTE, 16, 8);
        gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 16, 12);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        gl.bindVertexArray(null);
        chunk.gpu[l] = g;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, m.u8, gl.STATIC_DRAW, 0, m.quads * 64);
      g.quads = Math.min(m.quads, this.MAXQ);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  freeChunk(chunk) {
    const gl = this.gl;
    if (!chunk.gpu) return;
    for (const g of chunk.gpu) if (g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vbo); }
    chunk.gpu = null;
  }
};
