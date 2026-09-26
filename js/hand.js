'use strict';
MC.HAND_TUNE = {
  tool: { ry: 0.35, rz: 1.35, rx: -0.25, x: 0.56, y: -0.38, z: -0.8, s: 0.72 },
  bow: { ry: -0.25, rz: 0.15, rx: 0, x: 0.45, y: -0.35, z: -0.85, s: 0.7 },
  arm: { ry: 0.6, rx: 2.3, rz: 0, x: 0.72, y: -0.82, z: -0.38, s: 1.0 },
};
// First-person held item / arm. Drawn into the G-buffer (compressed depth range) so it receives the same
// deferred lighting, shadows and bloom as the world. Uses the terrain vertex format with a model matrix;
// uvs are stored with sub-texel precision (u8 / 240 = tile uv).
MC.Hand = class {
  constructor(renderer) {
    const gl = this.gl = renderer.gl;
    this.maxQ = 1024;
    this.buf = new ArrayBuffer(this.maxQ * 64);
    this.u16 = new Uint16Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_SHORT, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_BYTE, 16, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_BYTE, 16, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderer.ibo);
    gl.bindVertexArray(null);
    this.quads = 0;
    this.key = '';
    this.swing = 1;
    this.model = new Float32Array(16);
    this.normalMat = new Float32Array(9);
    this.kind = 'block';
    this.equip = 1;       // 0..1 raise animation when switching items
    this.lastId = -1;
    this.use = 0;         // eating / drawing progress 0..1
    this.useKind = null;
  }

  startSwing() { this.swing = 0; }

  _armQuads() {
    const part = MC.MOB_MODELS.player_arm.parts[0];
    const C = MC.Mesher.FACE_CORNERS, [bx, by, bz, w, h, d] = part.box;
    const out = [];
    for (let f = 0; f < 6; f++) {
      const fr = part.faces[f], p = [];
      for (let v = 0; v < 4; v++) { const c = C[f][v]; p.push(bx + c[0] * w + 6, by + c[1] * h, bz + c[2] * d + 6); }
      out.push({ p, uv: [fr.u0, fr.v0, fr.u0 + fr.fw, fr.v0, fr.u0 + fr.fw, fr.v0 + fr.fh, fr.u0, fr.v0 + fr.fh], f, tile: fr.tile, tint: 0, mat: 0 });
    }
    return out;
  }

  build(id, sky, block) {
    const key = id + ':' + sky + ':' + block;
    if (id !== this.lastId) { this.lastId = id; this.equip = 0; }
    if (key === this.key) return;
    this.key = key;
    this.quads = 0;
    let quads;
    if (!id) { quads = this._armQuads(); this.kind = 'arm'; }
    else {
      const m = MC.ItemModels.get(id);
      quads = m.quads;
      const it = MC.itemDef(id);
      this.kind = m.sprite ? (it && (it.held === 'tool' || it.held === 'bow') ? it.held : 'sprite') : 'block';
    }
    const u16 = this.u16, u8 = this.u8;
    let q = 0;
    for (const qd of quads) {
      if (q >= this.maxQ) break;
      for (let k = 0; k < 4; k++) {
        const vi = q * 4 + k, o16 = vi * 8, o8 = vi * 16;
        u16[o16] = Math.round(qd.p[k * 3] * 4); u16[o16 + 1] = Math.round(qd.p[k * 3 + 1] * 4); u16[o16 + 2] = Math.round(qd.p[k * 3 + 2] * 4); u16[o16 + 3] = qd.tile;
        u8[o8 + 8] = Math.round(qd.uv[k * 2] * 15); u8[o8 + 9] = Math.round(qd.uv[k * 2 + 1] * 15);
        u8[o8 + 10] = qd.f | (3 << 3); u8[o8 + 11] = qd.mat || 0;
        u8[o8 + 12] = sky * 17; u8[o8 + 13] = block * 17; u8[o8 + 14] = 128; u8[o8 + 15] = qd.tint || 0;
      }
      q++;
    }
    this.quads = q;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.u8, 0, q * 64);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // Camera-relative model matrix (and its rotation) for the held item
  update(dt, fwd, bob, moving, useProgress = 0, useKind = null) {
    const M = MC.mat4;
    this.swing = Math.min(1, this.swing + dt * 4.5);
    this.equip = Math.min(1, this.equip + dt * 5);
    this.use = useProgress; this.useKind = useKind;
    const up0 = [0, 1, 0];
    const right = MC.vec3.normalize([0, 0, 0], MC.vec3.cross([0, 0, 0], fwd, up0));
    const up = MC.vec3.cross([0, 0, 0], right, fwd);
    const C = new Float32Array([right[0], right[1], right[2], 0, up[0], up[1], up[2], 0, -fwd[0], -fwd[1], -fwd[2], 0, 0, 0, 0, 1]);
    const s = Math.sin(this.swing * Math.PI), s2 = Math.sin(Math.sqrt(this.swing) * Math.PI);
    const bx = moving ? Math.cos(bob * Math.PI) * 0.025 : 0, by = moving ? -Math.abs(Math.sin(bob * Math.PI)) * 0.035 : 0;
    const drop = (1 - this.equip) * -0.5;
    const T = (x, y, z) => { const m = M.create(); m[12] = x; m[13] = y; m[14] = z; return m; };
    const Rx = (a) => { const m = M.create(); m[5] = Math.cos(a); m[6] = Math.sin(a); m[9] = -Math.sin(a); m[10] = Math.cos(a); return m; };
    const Ry = (a) => { const m = M.create(); m[0] = Math.cos(a); m[2] = -Math.sin(a); m[8] = Math.sin(a); m[10] = Math.cos(a); return m; };
    const Rz = (a) => { const m = M.create(); m[0] = Math.cos(a); m[1] = Math.sin(a); m[4] = -Math.sin(a); m[5] = Math.cos(a); return m; };
    const S = (k) => { const m = M.create(); m[0] = m[5] = m[10] = k; return m; };
    const mul = (a, b) => M.multiply(M.create(), a, b);
    // eating: bob towards the mouth; bow: pull back
    let ex = 0, ey = 0, ez = 0, erx = 0, ery = 0;
    if (useKind === 'eat' && useProgress > 0) {
      const k = Math.min(1, useProgress * 6);
      ex = -0.28 * k; ey = 0.1 * k + Math.abs(Math.sin(useProgress * 40)) * 0.04 * k; ez = 0.25 * k; ery = 0.6 * k; erx = -0.3 * k;
    } else if (useKind === 'bow' && useProgress > 0) {
      const k = Math.min(1, useProgress);
      ex = -0.3; ey = 0.08; ez = 0.15 + k * 0.12; ery = 0.25;
      ex += (Math.random() - 0.5) * 0.004 * k; ey += (Math.random() - 0.5) * 0.004 * k;
    }
    let m, R;
    const base = T(0.5 + bx - s2 * 0.2 + ex, -0.42 + by + s2 * 0.1 + drop + ey, -0.95 - s * 0.25 + ez);
    const swingR = Rx(-s * 0.9);
    if (this.kind === 'arm') {
      const k = MC.HAND_TUNE.arm;
      R = mul(mul(mul(swingR, Ry(k.ry)), Rx(k.rx)), Rz(k.rz));
      m = mul(mul(C, T(k.x + bx - s2 * 0.2, k.y + by + s2 * 0.12 + drop, k.z - s * 0.25)), R);
      m = mul(m, S(k.s));
      m = mul(m, T(-0.5, -0.75, -0.5));
      R = mul(C, R);
    } else if (this.kind === 'tool' || this.kind === 'bow') {
      const k = MC.HAND_TUNE[this.kind];
      const inner = mul(mul(mul(Ry(k.ry + ery), Rz(k.rz)), Rx(k.rx + erx)), M.create());
      R = mul(swingR, inner);
      m = mul(mul(C, T(k.x + bx - s2 * 0.2 + ex, k.y + by + s2 * 0.1 + drop + ey, k.z - s * 0.25 + ez)), R);
      m = mul(m, S(k.s));
      m = mul(m, T(-0.5, -0.3, -0.5));
      R = mul(C, R);
    } else if (this.kind === 'sprite') {
      R = mul(mul(swingR, Ry(-0.35 + ery)), Rx(erx));
      m = mul(mul(C, base), R);
      m = mul(m, S(0.45));
      m = mul(m, T(-0.5, -0.5, -0.5));
      R = mul(C, R);
    } else {
      R = mul(mul(mul(swingR, Ry(0.78 + ery)), Rx(0.18 + erx)), M.create());
      m = mul(mul(C, base), R);
      m = mul(m, S(0.3));
      m = mul(m, T(-0.5, -0.5, -0.5));
      R = mul(C, R);
    }
    this.model.set(m);
    const n = this.normalMat;
    n[0] = R[0]; n[1] = R[1]; n[2] = R[2]; n[3] = R[4]; n[4] = R[5]; n[5] = R[6]; n[6] = R[8]; n[7] = R[9]; n[8] = R[10];
  }

  draw() {
    if (!this.quads) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.quads * 6, gl.UNSIGNED_INT, 0);
  }
};
