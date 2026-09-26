'use strict';
// Seeded simplex noise (2D / 3D) based on Stefan Gustavson's public-domain implementation.
MC.Noise = class {
  constructor(seed) {
    const rnd = MC.mulberry32(seed | 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2(xin, yin) {
    const perm = this.perm, pm = this.permMod12, G = MC.Noise.GRAD3;
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const g = pm[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (G[g] * x0 + G[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const g = pm[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (G[g] * x1 + G[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const g = pm[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  noise3(xin, yin, zin) {
    const perm = this.perm, pm = this.permMod12, G = MC.Noise.GRAD3;
    const F3 = 1 / 3, G3 = 1 / 6;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) { const g = pm[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (G[g] * x0 + G[g + 1] * y0 + G[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (G[g] * x1 + G[g + 1] * y1 + G[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (G[g] * x2 + G[g + 1] * y2 + G[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (G[g] * x3 + G[g + 1] * y3 + G[g + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }

  // Fractal sums, normalized to roughly [-1, 1]
  fbm2(x, y, oct, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise2(x * f, y * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  fbm3(x, y, z, oct, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise3(x * f, y * f, z * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
};
MC.Noise.GRAD3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

// ---- Tileable noise helpers used for procedural textures and GPU noise textures ----
// Periodic value noise on an integer lattice with period `per` (in lattice cells).
MC.periodicValueNoise = function (x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const m = (v) => ((v % per) + per) % per;
  const a = MC.hash2(m(xi), m(yi), seed), b = MC.hash2(m(xi + 1), m(yi), seed);
  const c = MC.hash2(m(xi), m(yi + 1), seed), d = MC.hash2(m(xi + 1), m(yi + 1), seed);
  return MC.lerp(MC.lerp(a, b, ux), MC.lerp(c, d, ux), uy);
};
// Periodic gradient (Perlin) noise in 2D, returns ~[-1,1]
MC.periodicPerlin2 = function (x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const m = (v) => ((v % per) + per) % per;
  const grad = (ix, iy, dx, dy) => {
    const a = MC.hash2(m(ix), m(iy), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = grad(xi, yi, fx, fy), n10 = grad(xi + 1, yi, fx - 1, fy);
  const n01 = grad(xi, yi + 1, fx, fy - 1), n11 = grad(xi + 1, yi + 1, fx - 1, fy - 1);
  return MC.lerp(MC.lerp(n00, n10, ux), MC.lerp(n01, n11, ux), uy) * 1.41;
};
// Periodic 3D gradient noise
MC.periodicPerlin3 = function (x, y, z, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const m = (v) => ((v % per) + per) % per;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (ix, iy, iz, dx, dy, dz) => {
    const h1 = MC.hash3(m(ix), m(iy), m(iz), seed), h2 = MC.hash3(m(ix), m(iy), m(iz), seed + 17);
    const th = h1 * Math.PI * 2, ph = Math.acos(2 * h2 - 1);
    const s = Math.sin(ph);
    return Math.cos(th) * s * dx + Math.sin(th) * s * dy + Math.cos(ph) * dz;
  };
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const lerp = MC.lerp;
  const x00 = lerp(grad(xi, yi, zi, fx, fy, fz), grad(xi + 1, yi, zi, fx - 1, fy, fz), u);
  const x10 = lerp(grad(xi, yi + 1, zi, fx, fy - 1, fz), grad(xi + 1, yi + 1, zi, fx - 1, fy - 1, fz), u);
  const x01 = lerp(grad(xi, yi, zi + 1, fx, fy, fz - 1), grad(xi + 1, yi, zi + 1, fx - 1, fy, fz - 1), u);
  const x11 = lerp(grad(xi, yi + 1, zi + 1, fx, fy - 1, fz - 1), grad(xi + 1, yi + 1, zi + 1, fx - 1, fy - 1, fz - 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 1.5;
};
// Periodic Worley (cellular) F1 distance in 3D, cells per period = per. Returns distance in cell units.
MC.periodicWorley3 = function (x, y, z, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const mx = ((cx % per) + per) % per, my = ((cy % per) + per) % per, mz = ((cz % per) + per) % per;
    const px = cx + MC.hash3(mx, my, mz, seed), py = cy + MC.hash3(mx, my, mz, seed + 1), pz = cz + MC.hash3(mx, my, mz, seed + 2);
    const d = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
};
