'use strict';
// Procedural texture framework: every tile produces albedo (sRGB), height -> normal map, and a
// "specular" map (R smoothness, G F0 / metal, B subsurface, A emission) — like a PBR resource pack.

MC.TexGen = {
  S: 16,
  gens: {},
  define(name, opts, fn) {
    if (typeof opts === 'function') { fn = opts; opts = {}; }
    this.gens[name] = { fn, opts };
  },

  // Paint a 16x16 ASCII sprite. pal: char -> hex colour | [hex, height, smooth, f0, sss, emit]. '.' / ' ' = transparent.
  art(c, rows, pal, opts = {}) {
    const H = MC.col.hex;
    for (let y = 0; y < 16; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < 16; x++) {
        const ch = row[x] || '.';
        if (ch === '.' || ch === ' ') {
          if (!opts.keep) { c.px(x, y, 0, 0, 0, 0); c.h(x, y, 0.5); }
          continue;
        }
        let e = pal[ch];
        if (e === undefined) continue;
        if (!Array.isArray(e)) e = [e];
        const col = typeof e[0] === 'number' ? H(e[0]) : e[0];
        const jit = opts.noise ? (c.hashp(x, y, 71) - 0.5) * opts.noise : 0;
        c.px(x, y, MC.clamp(col[0] + jit, 0, 1), MC.clamp(col[1] + jit, 0, 1), MC.clamp(col[2] + jit, 0, 1), 1);
        c.h(x, y, e[1] !== undefined ? e[1] : 0.7);
        c.s(x, y, e[2] !== undefined ? e[2] : 0.15, e[3] !== undefined ? e[3] : 0.04, e[4] || 0, e[5] || 0);
      }
    }
  },

  // Build all tiles listed in MC.TILE_NAMES
  build() {
    const S = this.S, N = MC.TILE_NAMES.length, px = S * S;
    const albedo = new Uint8Array(N * px * 4);
    const normal = new Uint8Array(N * px * 4);
    const specular = new Uint8Array(N * px * 4);
    const tileCanvases = [];
    for (let t = 0; t < N; t++) {
      const name = MC.TILE_NAMES[t];
      const g = this.gens[name];
      const ctx = this._makeCtx(t * 7919 + 1234);
      if (g) g.fn(ctx); else console.warn('Missing texture generator', name);
      this._finish(ctx, g ? g.opts : {});
      albedo.set(ctx.outA, t * px * 4);
      normal.set(ctx.outN, t * px * 4);
      specular.set(ctx.outS, t * px * 4);
      tileCanvases.push(this._tileCanvas(ctx.outA));
    }
    this.albedo = albedo; this.normal = normal; this.specular = specular;
    this.tileCanvases = tileCanvases;
    return { albedo, normal, specular, count: N, size: S };
  },

  _makeCtx(seed) {
    const S = this.S;
    const rnd = MC.mulberry32(seed);
    const c = {
      S,
      col: new Float32Array(S * S * 4),   // rgba
      hgt: new Float32Array(S * S).fill(-1),
      spc: new Float32Array(S * S * 4),   // smooth, f0, sss, emit
      normalStrength: 1.0,
      rand: rnd,
      seed,
      px(x, y, r, g, b, a = 1) {
        const i = ((y & 15) * S + (x & 15)) * 4;
        this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b; this.col[i + 3] = a;
      },
      pxc(x, y, c3, a = 1) { this.px(x, y, c3[0], c3[1], c3[2], a); },
      get(x, y) { const i = ((y & 15) * S + (x & 15)) * 4; return [this.col[i], this.col[i + 1], this.col[i + 2], this.col[i + 3]]; },
      h(x, y, v) { this.hgt[(y & 15) * S + (x & 15)] = v; },
      gh(x, y) { return this.hgt[(y & 15) * S + (x & 15)]; },
      s(x, y, smooth, f0 = 0.04, sss = 0, emit = 0) {
        const i = ((y & 15) * S + (x & 15)) * 4;
        this.spc[i] = smooth; this.spc[i + 1] = f0; this.spc[i + 2] = sss; this.spc[i + 3] = emit;
      },
      // tileable noises in tile pixel space (period = 16 px)
      vnoise(x, y, cells, sd = 0) { return MC.periodicValueNoise(x * cells / S, y * cells / S, cells, seed + sd); },
      fbm(x, y, cells, oct, sd = 0) {
        let a = 0.5, s = 0, n = 0, c2 = cells;
        for (let o = 0; o < oct; o++) { s += a * this.vnoise(x, y, c2, sd + o * 31); n += a; a *= 0.5; c2 *= 2; }
        return s / n;
      },
      hashp(x, y, sd = 0) { return MC.hash2(x & 15, y & 15, seed + sd); },
      // periodic voronoi: returns {d1, d2, id, cx, cy}
      voronoi(x, y, pts) {
        let d1 = 1e9, d2 = 1e9, id = 0;
        for (let i = 0; i < pts.length; i++) {
          let dx = Math.abs(x - pts[i][0]), dy = Math.abs(y - pts[i][1]);
          dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
        }
        return { d1, d2, id };
      },
      randPoints(n) { const p = []; for (let i = 0; i < n; i++) p.push([rnd() * S, rnd() * S]); return p; },
    };
    return c;
  },

  _finish(c, opts) {
    const S = this.S;
    const outA = new Uint8Array(S * S * 4), outN = new Uint8Array(S * S * 4), outS = new Uint8Array(S * S * 4);
    // default height from luminance
    for (let i = 0; i < S * S; i++) {
      if (c.hgt[i] < 0) {
        const r = c.col[i * 4], g = c.col[i * 4 + 1], b = c.col[i * 4 + 2];
        c.hgt[i] = 0.3 + 0.6 * (0.3 * r + 0.55 * g + 0.15 * b);
      }
    }
    // cutout tiles: fill transparent texels with average opaque colour (clean mipmaps)
    if (opts.cutout) {
      let ar = 0, ag = 0, ab = 0, n = 0;
      for (let i = 0; i < S * S; i++) if (c.col[i * 4 + 3] > 0.5) { ar += c.col[i * 4]; ag += c.col[i * 4 + 1]; ab += c.col[i * 4 + 2]; n++; }
      if (n) { ar /= n; ag /= n; ab /= n; }
      for (let i = 0; i < S * S; i++) if (c.col[i * 4 + 3] <= 0.5) { c.col[i * 4] = ar; c.col[i * 4 + 1] = ag; c.col[i * 4 + 2] = ab; c.col[i * 4 + 3] = 0; }
    }
    const k = 2.2 * (opts.normal !== undefined ? opts.normal : c.normalStrength);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      for (let ch = 0; ch < 4; ch++) outA[i * 4 + ch] = Math.round(MC.clamp(c.col[i * 4 + ch], 0, 1) * 255);
      // normal from height (wrapping) — tangent space: x = +u, y = +v (down the texture)
      const hl = c.hgt[y * S + ((x + S - 1) % S)], hr = c.hgt[y * S + ((x + 1) % S)];
      const hu = c.hgt[((y + S - 1) % S) * S + x], hd = c.hgt[((y + 1) % S) * S + x];
      let nx = -(hr - hl) * k, ny = -(hd - hu) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      outN[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      outN[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outN[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outN[i * 4 + 3] = Math.round(MC.clamp(c.hgt[i], 0, 1) * 255);
      for (let ch = 0; ch < 4; ch++) outS[i * 4 + ch] = Math.round(MC.clamp(c.spc[i * 4 + ch], 0, 1) * 255);
    }
    c.outA = outA; c.outN = outN; c.outS = outS;
  },

  _tileCanvas(rgba, mul = 1, tint = null, maskTint = false) {
    const S = this.S;
    const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      let r = rgba[i * 4], gg = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
      if (tint) {
        const m = maskTint ? a / 255 : 1;
        r *= MC.lerp(1, tint[0], m); gg *= MC.lerp(1, tint[1], m); b *= MC.lerp(1, tint[2], m);
        if (maskTint) a = 255;
      }
      img.data[i * 4] = r * mul; img.data[i * 4 + 1] = gg * mul; img.data[i * 4 + 2] = b * mul; img.data[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return cv;
  },

  // Isometric inventory icons for every block
  buildIcons() {
    const S = this.S, icons = {};
    const tintCol = (mode) => {
      switch (mode) {
        case MC.TINT.GRASS: case MC.TINT.GRASS_MASKED: return [0.52, 0.78, 0.32];
        case MC.TINT.FOLIAGE: return [0.40, 0.66, 0.22];
        case MC.TINT.BIRCH: return [0.50, 0.66, 0.33];
        case MC.TINT.SPRUCE: return [0.34, 0.52, 0.36];
        default: return null;
      }
    };
    const faceCanvas = (id, f, mul) => {
      const tile = MC.B_TEX[id * 6 + f], tm = MC.B_TINT[id * 6 + f];
      const rgba = this.albedo.subarray(tile * S * S * 4, (tile + 1) * S * S * 4);
      return this._tileCanvas(rgba, mul, tintCol(tm), tm === MC.TINT.GRASS_MASKED);
    };
    const tileCanvas = (tile, tm, mul) => {
      const rgba = this.albedo.subarray(tile * S * S * 4, (tile + 1) * S * S * 4);
      return this._tileCanvas(rgba, mul, tintCol(tm), tm === MC.TINT.GRASS_MASKED);
    };
    // isometric boxes (px units) with per-face tiles
    const isoBoxes = (g, id, boxes) => {
      const list = boxes.map((bx) => ({ b: bx.b || bx, tex: bx.tex || null, uvRot: bx.uvRot || 0, vOff: bx.vOff || 0 }))
        .sort((p, q) => (p.b[1] + p.b[0] + p.b[2]) - (q.b[1] + q.b[0] + q.b[2]));
      for (const bx of list) {
        const [x0, y0, z0, x1, y1, z1] = bx.b;
        const tile = (f) => (bx.tex && bx.tex[f] !== null && bx.tex[f] !== undefined ? bx.tex[f] : MC.B_TEX[id * 6 + f]);
        const tm = (f) => MC.B_TINT[id * 6 + f];
        g.setTransform(1.625, 0.8125, -1.625, 0.8125, 32, 6 + (16 - y1) * 1.625);
        g.drawImage(tileCanvas(tile(2), tm(2), 1.0), x0, z0, x1 - x0, z1 - z0, x0, z0, x1 - x0, z1 - z0);
        g.setTransform(1.625, 0.8125, 0, 1.625, 32 - 1.625 * z1, 6 + 0.8125 * z1);
        g.drawImage(tileCanvas(tile(4), tm(4), 0.78), x0, 16 - y1 + bx.vOff, x1 - x0, y1 - y0, x0, 16 - y1, x1 - x0, y1 - y0);
        g.setTransform(1.625, -0.8125, 0, 1.625, 6 + 1.625 * x1, 19 + 0.8125 * x1);
        g.drawImage(tileCanvas(tile(0), tm(0), 0.6), 16 - z1, 16 - y1 + bx.vOff, z1 - z0, y1 - y0, 16 - z1, 16 - y1, z1 - z0, y1 - y0);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    };
    for (const d of MC.BLOCKS) {
      if (!d || d.id === 0) continue;
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const SH = MC.SHAPE;
      if (d.shape === SH.CROSS || d.shape === SH.TORCH || d.shape === SH.CROP || d.climb) {
        g.drawImage(faceCanvas(d.id, 0, 1), 8, 8, 48, 48);
      } else if (d.door) {
        g.drawImage(tileCanvas(MC.TILE.door_top, 0, 1), 16, 2, 30, 30);
        g.drawImage(tileCanvas(MC.TILE.door_bottom, 0, 1), 16, 32, 30, 30);
      } else if (d.shape === SH.BOXES) {
        const boxes = d.key.includes('stairs') ? MC.B_BOXES[MC.withFacing(d.id, 2)] : MC.B_BOXES[d.id];
        isoBoxes(g, d.id, boxes);
      } else if (d.shape === SH.FENCE || d.shape === SH.PANE) {
        g.globalAlpha = d.layer === MC.LAYER.OPAQUE ? 1 : 0.85;
        isoBoxes(g, d.id, MC.connectBoxes(d.shape, 2 | 8, false).map((b) => ({ b })));
      } else {
        const alpha = d.layer === MC.LAYER.OPAQUE ? 1 : 0.85;
        g.globalAlpha = alpha;
        g.setTransform(1.625, 0.8125, -1.625, 0.8125, 32, 6);
        g.drawImage(faceCanvas(d.id, 2, 1.0), 0, 0);
        g.setTransform(1.625, 0.8125, 0, 1.625, 6, 19);
        g.drawImage(faceCanvas(d.id, 4, 0.78), 0, 0);
        g.setTransform(1.625, -0.8125, 0, 1.625, 32, 32);
        g.drawImage(faceCanvas(d.id, 0, 0.6), 0, 0);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      icons[d.id] = cv.toDataURL();
    }
    // items: flat sprites
    for (let id = MC.ITEM_BASE; id < MC.ITEM_COUNT; id++) {
      const it = MC.ITEMS[id];
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(tileCanvas(MC.TILE[it.tile], 0, 1), 4, 4, 56, 56);
      icons[id] = cv.toDataURL();
    }
    this.icons = icons;
    return icons;
  },
};

// Small colour helpers for tile generators (sRGB 0..1)
MC.col = {
  hex(h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; },
  mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; },
  // choose from a palette by value v in [0,1]
  pal(p, v) { return p[Math.max(0, Math.min(p.length - 1, Math.floor(v * p.length)))]; },
};
