'use strict';
// CPU-side geometry for everything that moves: mobs (animated box models), dropped items, arrows,
// falling blocks, primed TNT, spawner cages' spinning mobs and particles. Everything is written into one
// dynamic vertex buffer per frame (camera relative floats) and drawn into the G-buffer / shadow map.
(function () {
  const FC = () => MC.Mesher.FACE_CORNERS;
  const FN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const FT = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
  const STRIDE = 19;

  // ---------------------------------------------------------------- affine 3x4 matrices (column major)
  const Mx = {
    ident() { return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]); },
    copy(a) { return new Float64Array(a); },
    // m = m * T
    tr(m, x, y, z) { m[9] += m[0] * x + m[3] * y + m[6] * z; m[10] += m[1] * x + m[4] * y + m[7] * z; m[11] += m[2] * x + m[5] * y + m[8] * z; return m; },
    sc(m, s, t = s, u = s) { for (let i = 0; i < 3; i++) { m[i] *= s; m[3 + i] *= t; m[6 + i] *= u; } return m; },
    // m = m * R (rotation about axis)
    rx(m, a) { if (!a) return m; const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 3; i++) { const y = m[3 + i], z = m[6 + i]; m[3 + i] = y * c + z * s; m[6 + i] = -y * s + z * c; } return m; },
    ry(m, a) { if (!a) return m; const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 3; i++) { const x = m[i], z = m[6 + i]; m[i] = x * c - z * s; m[6 + i] = x * s + z * c; } return m; },
    rz(m, a) { if (!a) return m; const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 3; i++) { const x = m[i], y = m[3 + i]; m[i] = x * c + y * s; m[3 + i] = -x * s + y * c; } return m; },
  };
  MC.Mx = Mx;

  // ---------------------------------------------------------------- item / block models (px space)
  // quad: { p: [12], uv: [8] (texels), f, tile, tint (mode), mat }
  function uvStd() { return [0, 0, 16, 0, 16, 16, 0, 16]; }
  function boxQuads(out, bx, tiles, tints, mat, blockId) {
    const b = bx.b || bx;
    const C = FC();
    for (let f = 0; f < 6; f++) {
      const p = [], uv = [];
      for (let v = 0; v < 4; v++) {
        const c = C[f][v];
        const x = c[0] ? b[3] : b[0], y = c[1] ? b[4] : b[1], z = c[2] ? b[5] : b[2];
        p.push(x, y, z);
        let u, w;
        switch (f) {
          case 0: u = 16 - z; w = 16 - y; break; case 1: u = z; w = 16 - y; break;
          case 2: u = x; w = z; break; case 3: u = x; w = 16 - z; break;
          case 4: u = x; w = 16 - y; break; default: u = 16 - x; w = 16 - y;
        }
        if ((f === 2 || f === 3) && bx.uvRot) for (let r = 0; r < bx.uvRot; r++) { const t = u; u = w; w = 16 - t; }
        else if (bx.vOff) w += bx.vOff;
        uv.push(u, w);
      }
      const tile = bx.tex && bx.tex[f] !== null && bx.tex[f] !== undefined ? bx.tex[f] : tiles[f];
      out.push({ p, uv, f, tile, tint: tints[f], mat });
    }
    void blockId;
  }
  MC.ItemModels = {
    cache: new Map(),
    get(id) {
      let m = this.cache.get(id);
      if (!m) { m = this._build(id); this.cache.set(id, m); }
      return m;
    },
    _build(id) {
      if (id >= MC.ITEM_BASE) return { quads: this.sprite(MC.TILE[MC.ITEMS[id].tile], 0), sprite: true };
      const S = MC.SHAPE, sh = MC.B_SHAPE[id], d = MC.BLOCKS[id];
      const tiles = [], tints = [];
      for (let f = 0; f < 6; f++) { tiles.push(MC.B_TEX[id * 6 + f]); tints.push(MC.B_TINT[id * 6 + f]); }
      const mat = MC.B_MAT[id] === MC.MAT.LEAVES ? MC.MAT.CUTOUT : (MC.B_MAT[id] === MC.MAT.EMISSIVE || MC.B_MAT[id] === MC.MAT.CUTOUT) ? MC.MAT.CUTOUT : 0;
      const out = [];
      if (sh === S.CROSS || sh === S.TORCH || sh === S.CROP || d.climb || d.door) {
        const tile = d.door ? MC.TILE.door_bottom : tiles[0];
        return { quads: this.sprite(tile, tints[0]), sprite: true };
      }
      if (sh === S.BOXES) { for (const bx of MC.B_BOXES[id]) boxQuads(out, bx, tiles, tints, mat, id); }
      else if (sh === S.FENCE || sh === S.PANE) { for (const b of MC.connectBoxes(sh, 2 | 8, false)) boxQuads(out, b, tiles, tints, mat, id); }
      else boxQuads(out, [0, 0, 0, 16, 16, 16], tiles, tints, mat, id);
      return { quads: out, sprite: false };
    },
    // extruded sprite (1 px thick) from a tile's alpha
    sprite(tile, tint) {
      const A = MC.TexGen.albedo, base = tile * 256 * 4;
      const op = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && A[base + (y * 16 + x) * 4 + 3] > 110;
      const out = [];
      const M = MC.MAT.CUTOUT;
      const zf = 8.5, zb = 7.5;
      out.push({ p: [0, 16, zf, 16, 16, zf, 16, 0, zf, 0, 0, zf], uv: uvStd(), f: 4, tile, tint, mat: M });
      out.push({ p: [16, 16, zb, 0, 16, zb, 0, 0, zb, 16, 0, zb], uv: uvStd(), f: 5, tile, tint, mat: M });
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (!op(x, y)) continue;
        const y0 = 15 - y, y1 = 16 - y;
        const uv = [x + 0.15, y + 0.15, x + 0.85, y + 0.15, x + 0.85, y + 0.85, x + 0.15, y + 0.85];
        if (!op(x - 1, y)) out.push({ p: [x, y1, zb, x, y1, zf, x, y0, zf, x, y0, zb], uv, f: 1, tile, tint, mat: M });
        if (!op(x + 1, y)) out.push({ p: [x + 1, y1, zf, x + 1, y1, zb, x + 1, y0, zb, x + 1, y0, zf], uv, f: 0, tile, tint, mat: M });
        if (!op(x, y - 1)) out.push({ p: [x, y1, zb, x + 1, y1, zb, x + 1, y1, zf, x, y1, zf], uv, f: 2, tile, tint, mat: M });
        if (!op(x, y + 1)) out.push({ p: [x, y0, zf, x + 1, y0, zf, x + 1, y0, zb, x, y0, zb], uv, f: 3, tile, tint, mat: M });
      }
      return out;
    },
  };
  // default tint colours for tint modes (linear)
  const TINT_RGB = [null, [0.52, 0.78, 0.32], [0.40, 0.66, 0.22], [0.52, 0.78, 0.32], [0.50, 0.66, 0.33], [0.34, 0.52, 0.36]].map((c) => c && c.map((v) => Math.pow(v, 2.2)));

  // ---------------------------------------------------------------- the batch
  MC.EntityBatch = class {
    constructor(renderer) {
      const gl = this.gl = renderer.gl;
      this.cap = 1 << 15;
      this.data = new Float32Array(this.cap * STRIDE);
      this.n = 0;
      this.shadowN = 0;
      this.vao = gl.createVertexArray();
      this.vbo = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
      const B = STRIDE * 4;
      const attr = (loc, n, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, B, off * 4); };
      attr(0, 3, 0); attr(1, 3, 3); attr(2, 3, 6); attr(3, 3, 9); attr(4, 2, 12); attr(5, 4, 14); attr(6, 1, 18);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.ibo);
      gl.bindVertexArray(null);
      this.cam = [0, 0, 0];
      this.light = [1, 0];
      this.tint = [1, 1, 1, 0];
      this.tmp = new Float64Array(3);
    }
    begin(cam) { this.n = 0; this.cam = cam; this.shadowN = 0; }
    markShadowEnd() { this.shadowN = this.n; }
    _ensure(k) {
      if (this.n + k <= this.cap) return true;
      if (this.cap >= (1 << 18)) return false;
      const nd = new Float32Array(this.cap * 2 * STRIDE);
      nd.set(this.data);
      this.data = nd; this.cap *= 2;
      return true;
    }
    // emit a quad transformed by m (px -> world camera-relative)
    quad(m, q, tintRGB) {
      if (!this._ensure(4)) return;
      const d = this.data, L = this.light, T = this.tint;
      const n = FN[q.f], t = FT[q.f];
      let nx = m[0] * n[0] + m[3] * n[1] + m[6] * n[2], ny = m[1] * n[0] + m[4] * n[1] + m[7] * n[2], nz = m[2] * n[0] + m[5] * n[1] + m[8] * n[2];
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const tx = m[0] * t[0] + m[3] * t[1] + m[6] * t[2], ty = m[1] * t[0] + m[4] * t[1] + m[7] * t[2], tz = m[2] * t[0] + m[5] * t[1] + m[8] * t[2];
      let r = T[0], g = T[1], b = T[2];
      const tr = q.tint ? TINT_RGB[q.tint] : tintRGB;
      if (tr) { r *= tr[0]; g *= tr[1]; b *= tr[2]; }
      const p = q.p, uv = q.uv;
      let o = this.n * STRIDE;
      for (let v = 0; v < 4; v++, o += STRIDE) {
        const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
        d[o] = m[0] * x + m[3] * y + m[6] * z + m[9];
        d[o + 1] = m[1] * x + m[4] * y + m[7] * z + m[10];
        d[o + 2] = m[2] * x + m[5] * y + m[8] * z + m[11];
        d[o + 3] = uv[v * 2] / 16; d[o + 4] = uv[v * 2 + 1] / 16; d[o + 5] = q.tile;
        d[o + 6] = nx; d[o + 7] = ny; d[o + 8] = nz;
        d[o + 9] = tx; d[o + 10] = ty; d[o + 11] = tz;
        d[o + 12] = L[0]; d[o + 13] = L[1];
        d[o + 14] = r; d[o + 15] = g; d[o + 16] = b; d[o + 17] = T[3];
        d[o + 18] = q.mat || 0;
      }
      this.n += 4;
    }
    model(m, model, tintRGB) { for (const q of model.quads) this.quad(m, q, tintRGB); }
    // world transform for an object at world position (x, y, z)
    base(x, y, z) { const m = Mx.ident(); m[9] = x - this.cam[0]; m[10] = y - this.cam[1]; m[11] = z - this.cam[2]; return m; }
    setLight(W, x, y, z) {
      let v = W.lightRaw(Math.floor(x), Math.floor(y), Math.floor(z));
      if (MC.B_OPAQUE[W.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))]) v = Math.max(v, W.lightRaw(Math.floor(x), Math.floor(y) + 1, Math.floor(z)));
      this.light[0] = (v >> 4) / 15; this.light[1] = (v & 15) / 15;
    }
    setTint(r, g, b, e = 0) { this.tint[0] = r; this.tint[1] = g; this.tint[2] = b; this.tint[3] = e; }
    // billboard particle
    billboard(x, y, z, size, tile, u0, v0, u1, v1, right, up, rgb, emit, rot) {
      if (!this._ensure(4)) return;
      const d = this.data, cx = x - this.cam[0], cy = y - this.cam[1], cz = z - this.cam[2];
      let rx = right[0] * size, ry = right[1] * size, rz = right[2] * size, ux = up[0] * size, uy = up[1] * size, uz = up[2] * size;
      if (rot) {
        const c = Math.cos(rot), s = Math.sin(rot);
        const ax = rx * c + ux * s, ay = ry * c + uy * s, az = rz * c + uz * s;
        ux = -rx * s + ux * c; uy = -ry * s + uy * c; uz = -rz * s + uz * c; rx = ax; ry = ay; rz = az;
      }
      const nx = up[1] * right[2] - up[2] * right[1], ny = up[2] * right[0] - up[0] * right[2], nz = up[0] * right[1] - up[1] * right[0];
      const P = [[-1, 1, u0, v0], [1, 1, u1, v0], [1, -1, u1, v1], [-1, -1, u0, v1]];
      let o = this.n * STRIDE;
      for (let v = 0; v < 4; v++, o += STRIDE) {
        const [a, b, u, w] = P[v];
        d[o] = cx + rx * a + ux * b; d[o + 1] = cy + ry * a + uy * b; d[o + 2] = cz + rz * a + uz * b;
        d[o + 3] = u; d[o + 4] = w; d[o + 5] = tile;
        d[o + 6] = nx; d[o + 7] = ny; d[o + 8] = nz;
        d[o + 9] = right[0]; d[o + 10] = right[1]; d[o + 11] = right[2];
        d[o + 12] = this.light[0]; d[o + 13] = this.light[1];
        d[o + 14] = rgb[0]; d[o + 15] = rgb[1]; d[o + 16] = rgb[2]; d[o + 17] = emit;
        d[o + 18] = 0;
      }
      this.n += 4;
    }
    upload() {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      if (this.data.byteLength > (this._gpuBytes || 0)) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW); this._gpuBytes = this.data.byteLength; }
      if (this.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    draw(count) {
      const gl = this.gl;
      const q = Math.floor(count / 4);
      if (!q) return;
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, q * 6, gl.UNSIGNED_INT, 0);
    }
  };

  // ---------------------------------------------------------------- mob geometry
  const WOOL_TINT = {
    white: [1, 1, 1], orange: [0.95, 0.45, 0.08], yellow: [0.97, 0.78, 0.15], lime: [0.44, 0.73, 0.1],
    light_blue: [0.23, 0.69, 0.85], red: [0.63, 0.15, 0.13], purple: [0.48, 0.16, 0.68], black: [0.11, 0.11, 0.13],
  };
  MC.WOOL_TINT = WOOL_TINT;
  const lin = (c) => c.map((v) => Math.pow(v, 2.2));
  const faceQuad = { p: new Float64Array(12), uv: new Float64Array(8), f: 0, tile: 0, tint: 0, mat: 0 };
  function emitBox(batch, m, part, tintRGB, mat, inflate = 0) {
    const [bx, by, bz, w, h, d] = part.box;
    const C = FC();
    const x0 = bx - inflate, y0 = by - inflate, z0 = bz - inflate, W = w + inflate * 2, Hh = h + inflate * 2, D = d + inflate * 2;
    for (let f = 0; f < 6; f++) {
      const fr = part.faces[f];
      const q = faceQuad;
      for (let v = 0; v < 4; v++) {
        const c = C[f][v];
        q.p[v * 3] = x0 + c[0] * W; q.p[v * 3 + 1] = y0 + c[1] * Hh; q.p[v * 3 + 2] = z0 + c[2] * D;
      }
      q.uv[0] = fr.u0; q.uv[1] = fr.v0; q.uv[2] = fr.u0 + fr.fw; q.uv[3] = fr.v0;
      q.uv[4] = fr.u0 + fr.fw; q.uv[5] = fr.v0 + fr.fh; q.uv[6] = fr.u0; q.uv[7] = fr.v0 + fr.fh;
      q.f = f; q.tile = fr.tile; q.tint = 0; q.mat = mat;
      batch.quad(m, q, tintRGB);
    }
  }

  // pose: { yaw (body), headYaw, headPitch, walk (phase), amp, t (time), attack, aim, fuse, death, scale, flap }
  MC.renderMob = function (batch, type, x, y, z, pose, extra = {}) {
    const model = MC.MOB_MODELS[type];
    if (!model) return;
    const base = batch.base(x, y, z);
    Mx.ry(base, Math.PI - pose.yaw);
    if (pose.death) { Mx.rz(base, Math.min(1, pose.death / 0.5) * Math.PI / 2); }
    const sc = (pose.scale || 1) / 16;
    Mx.sc(base, sc, sc, sc);
    const ph = pose.walk || 0, amp = pose.amp || 0, t = pose.t || 0;
    const sw = Math.cos(ph * 0.6662 * 2) * amp;
    const rot = {};
    const set = (n, rx = 0, ry = 0, rz = 0) => { rot[n] = [rx, ry, rz]; };
    const headYaw = MC.clamp(pose.headYaw || 0, -1.2, 1.2), headPitch = MC.clamp(pose.headPitch || 0, -1, 1);
    set('head', headPitch, headYaw);
    const atk = pose.attack || 0;
    switch (model.anim || type) {
      case 'biped':
        if (pose.aim) set('rarm', -2.7 + Math.sin(t * 18) * 0.05, 0, 0.1);
        else set('rarm', -sw * 0.9 - atk * 2.2 - 0.1, 0, 0);
        set('larm', sw * 0.9 - (pose.aim ? 0.6 : 0), 0, 0);
        set('rleg', sw * 1.1); set('lleg', -sw * 1.1);
        break;
      case 'caster':
        if (pose.aim) { const w = Math.sin(t * 14) * 0.12; set('rarm', -2.6 + w, 0, -0.25); set('larm', -2.6 - w, 0, 0.25); }
        else { set('rarm', -0.35 - sw * 0.4 - atk * 1.6); set('larm', sw * 0.4 - atk * 0.6); }
        set('rleg', sw * 1.0); set('lleg', -sw * 1.0);
        break;
      case 'brute': {
        const aimUp = pose.aim ? -2.9 : 0;
        set('rarm', aimUp || (-sw * 0.6 - atk * 2.4), 0, 0.12); set('larm', aimUp || (sw * 0.6 - atk * 2.4), 0, -0.12);
        set('rleg', sw * 0.9); set('lleg', -sw * 0.9);
        const fl = Math.sin(t * (pose.aim ? 9 : 3)) * (pose.aim ? 0.45 : 0.2);
        set('rwing', 0, -0.35 - fl, 0.15); set('lwing', 0, 0.35 + fl, -0.15);
        break;
      }
      case 'scorpion': {
        const spread = [0.6, 0, -0.6];
        for (let i = 0; i < 3; i++) {
          const k = Math.sin(ph * 1.4 + i * 2.1) * amp;
          set('rleg' + i, 0, spread[i] + k * 0.4, 0.55 + Math.max(0, k) * 0.3);
          set('lleg' + i, 0, -spread[i] - k * 0.4, -0.55 - Math.max(0, -k) * 0.3);
        }
        const snap = Math.sin(t * 10) * 0.12 * (pose.aim ? 1 : 0.3);
        set('rclaw', 0, 0.35 + snap + atk * 0.3, 0); set('lclaw', 0, -0.35 - snap - atk * 0.3, 0);
        set('tail', -0.1 + Math.sin(t * 2.2) * 0.07 + atk * 0.7, Math.sin(t * 1.3) * 0.08, 0);
        break;
      }
      case 'horse': {
        // gallop (diagonal leg pairs), nodding neck, swishing tail; the rider couches the lance and strikes
        const g = sw * 1.15;
        set('hleg0', g); set('hleg1', -g); set('hleg2', -g); set('hleg3', g);
        set('hneck', 0.42 + Math.sin(t * 2.1) * 0.04 + Math.abs(sw) * 0.18);
        set('htail', 0.35 + Math.sin(t * 2.7) * 0.12 + amp * 0.35, Math.sin(t * 1.9) * 0.15);
        set('rarm', -0.7 - atk * 1.9 + Math.abs(sw) * 0.1, 0, 0.1); set('larm', -0.45 + Math.abs(sw) * 0.1, 0, -0.08);
        set('rleg', -0.3, 0, 0.14); set('lleg', -0.3, 0, -0.14);
        break;
      }
      case 'zombie':
        set('rarm', -Math.PI / 2 + Math.sin(t * 2) * 0.05 - (pose.attack || 0) * 0.8, 0.1, 0);
        set('larm', -Math.PI / 2 + Math.sin(t * 2 + 1) * 0.05 - (pose.attack || 0) * 0.8, -0.1, 0);
        set('rleg', sw * 1.1); set('lleg', -sw * 1.1);
        break;
      case 'skeleton':
        if (pose.aim) { set('rarm', -Math.PI / 2 + headPitch, headYaw - 0.1); set('larm', -Math.PI / 2 + headPitch, headYaw + 0.5); }
        else { set('rarm', -sw * 1.0); set('larm', sw * 1.0); }
        set('rleg', sw * 1.1); set('lleg', -sw * 1.1);
        break;
      case 'villager':
        set('arms', -0.75); set('rleg', sw * 1.1); set('lleg', -sw * 1.1);
        break;
      case 'creeper': case 'pig': case 'cow': case 'sheep':
        set('leg0', sw * 1.2); set('leg1', -sw * 1.2); set('leg2', -sw * 1.2); set('leg3', sw * 1.2);
        if (type === 'sheep' && pose.graze) set('head', 1.2 * pose.graze, 0);
        break;
      case 'chicken': {
        set('rleg', sw * 1.2); set('lleg', -sw * 1.2);
        const fl = pose.flap ? Math.abs(Math.sin(t * 18)) * 1.2 : 0;
        set('rwing', 0, 0, fl); set('lwing', 0, 0, -fl);
        break;
      }
      case 'spider': {
        const spread = [0.7, 0.25, -0.25, -0.7];
        for (let i = 0; i < 4; i++) {
          const k = Math.sin(ph * 1.3 + i * Math.PI / 2) * amp;
          set('rleg' + i, 0, spread[i] + k * 0.4, 0.62 + Math.max(0, k) * 0.3);
          set('lleg' + i, 0, -spread[i] - k * 0.4, -0.62 - Math.max(0, -k) * 0.3);
        }
        break;
      }
    }
    // creeper fuse swell
    if (pose.fuse) {
      const s = 1 + pose.fuse * 0.25 + Math.sin(pose.fuse * 40) * 0.03 * pose.fuse;
      Mx.sc(base, s, 1 + pose.fuse * 0.1, s);
    }
    const partMat = {};
    for (const part of model.parts) {
      const m = Mx.copy(base);
      Mx.tr(m, part.pivot[0], part.pivot[1], part.pivot[2]);
      const pr = part.parent ? rot[part.parent] : null;
      if (pr) { Mx.rz(m, pr[2]); Mx.ry(m, pr[1]); Mx.rx(m, pr[0]); }
      const r = rot[part.name];
      if (r) { Mx.rz(m, r[2]); Mx.ry(m, r[1]); Mx.rx(m, r[0]); }
      partMat[part.name] = m;
      let tint = null;
      if (part.tint === 'wool') tint = extra.wool ? lin(WOOL_TINT[extra.wool] || [1, 1, 1]) : null;
      else if (part.tint === 'robe') tint = extra.robe ? lin(extra.robe) : null;
      const mat = type === 'skeleton' && part.name === 'body' ? MC.MAT.CUTOUT : 0;
      emitBox(batch, m, part, tint, mat, part.tint === 'wool' ? 0.5 : 0);
    }
    // held item (skeleton bow, knights' swords, casters' staves)
    if (extra.held && partMat.rarm) {
      const m = Mx.copy(partMat.rarm);
      Mx.tr(m, 0, model.heldY || -9, 0);
      Mx.rx(m, -Math.PI / 2); Mx.ry(m, Math.PI / 2);
      Mx.sc(m, 0.9, 0.9, 0.9);
      Mx.tr(m, -8, -8, -8);
      batch.model(m, MC.ItemModels.get(extra.held));
    }
  };

  // item on the ground / in the air
  MC.renderItem = function (batch, id, count, x, y, z, spin, bob) {
    const model = MC.ItemModels.get(id);
    const copies = count > 16 ? 3 : count > 1 ? 2 : 1;
    for (let k = 0; k < copies; k++) {
      const m = batch.base(x + (k ? (k * 0.07) : 0), y + bob + (model.sprite ? 0.14 : 0) + k * 0.03, z + (k ? k * 0.05 : 0));
      Mx.ry(m, spin + k * 0.4);
      if (model.sprite) { Mx.sc(m, 0.5 / 16); Mx.tr(m, -8, -8, -8); }
      else { Mx.sc(m, 0.25 / 16); Mx.tr(m, -8, 0, -8); }
      batch.model(m, model);
    }
  };
})();
