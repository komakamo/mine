'use strict';
// Chunk mesher: flood-fill sky/block light over a padded 3x3-chunk region, then emit quads with
// smooth lighting + per-vertex ambient occlusion. Vertex layout (16 bytes):
//   u16 x4: x*64, y*64, z*64 (quarter-pixel precision), tile
//   u8  x4: u(0..16), v(0..16), normal | ao<<3, material
//   u8  x4: sky light (0..255), block light (0..255), climate, tint mode
MC.Mesher = class {
  constructor() {
    const P = this.P = 15;
    this.RW = 16 + 2 * P;
    this.RY = MC.HEIGHT + 2;
    this.SY = this.RW * this.RW;
    const N = this.SY * this.RY;
    this.blocks = new Uint8Array(N);
    this.sky = new Uint8Array(N);
    this.blk = new Uint8Array(N);
    this.colTop = new Int32Array(this.SY);
    this.QN = 1 << 20; this.QM = this.QN - 1;
    this.queue = new Int32Array(this.QN);
    this.emitters = new Int32Array(1 << 17);
    this.layers = [this._layer(32768), this._layer(8192), this._layer(4096)];
    this._initFaces();
    // fluid surface heights per block id (block units)
    this.FH = new Float32Array(MC.NB);
    for (let id = 0; id < MC.NB; id++) if (MC.B_FLUID[id]) this.FH[id] = MC.fluidHeight(id);
  }

  _layer(cap) {
    const buf = new ArrayBuffer(cap * 64);
    return { buf, u16: new Uint16Array(buf), u8: new Uint8Array(buf), cap, count: 0 };
  }
  _grow(L) {
    const nl = this._layer(L.cap * 2);
    nl.u8.set(L.u8); nl.count = L.count;
    Object.assign(L, nl);
  }

  _initFaces() {
    const RW = this.RW, SY = this.SY;
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const C = MC.Mesher.FACE_CORNERS;
    const d = (x, y, z) => x + z * RW + y * SY;
    this.faceN = N.map((n) => d(n[0], n[1], n[2]));
    this.faceCorners = C;
    this.dirOff = MC.DIRS.map((v) => v[0] + v[2] * RW);
    // For each face & vertex: region deltas (relative to the face cell) of side1, side2, corner
    this.faceAO = [];
    for (let f = 0; f < 6; f++) {
      const axis = N[f][0] ? 0 : N[f][1] ? 1 : 2;
      const pa = [0, 1, 2].filter((a) => a !== axis);
      const arr = [];
      for (let v = 0; v < 4; v++) {
        const c = C[f][v];
        const s1 = [0, 0, 0], s2 = [0, 0, 0];
        s1[pa[0]] = c[pa[0]] ? 1 : -1;
        s2[pa[1]] = c[pa[1]] ? 1 : -1;
        arr.push(d(...s1), d(...s2), d(s1[0] + s2[0], s1[1] + s2[1], s1[2] + s2[2]));
      }
      this.faceAO.push(arr);
    }
  }

  // chunks: 3x3 array (index (dz+1)*3+(dx+1)), all generated
  mesh(chunks) {
    const center = chunks[4];
    let maxY = 0;
    for (const c of chunks) if (c.maxY > maxY) maxY = c.maxY;
    const top = Math.min(MC.HEIGHT - 1, maxY + 1);
    this._fill(chunks, top);
    this._light(top);
    this._exportLight(center, top);
    return this._build(center, top);
  }

  // packed light of the centre chunk (sky << 4 | block) for entity lighting / spawning
  _exportLight(chunk, top) {
    const P = this.P, RW = this.RW, SY = this.SY, sky = this.sky, blk = this.blk;
    const n = 256 * (top + 1);
    let L = chunk.light;
    if (!L || L.length < n) L = chunk.light = new Uint8Array(256 * Math.min(MC.HEIGHT, top + 17));
    for (let y = 0; y <= top; y++) {
      for (let z = 0; z < 16; z++) {
        let i = (y + 1) * SY + (z + P) * RW + P, o = y * 256 + z * 16;
        for (let x = 0; x < 16; x++, i++, o++) L[o] = (sky[i] << 4) | blk[i];
      }
    }
    chunk.lightTop = top;
  }

  _fill(chunks, top) {
    const P = this.P, RW = this.RW, SY = this.SY, R = this.blocks, EMIT = MC.B_EMIT;
    const used = (top + 3) * SY;
    this.sky.fill(0, 0, used); this.blk.fill(0, 0, used);
    R.fill(MC.BLOCK.bedrock, 0, SY);                       // y = -1
    R.fill(0, (top + 2) * SY, (top + 3) * SY);              // air layer above everything
    this.sky.fill(15, (top + 2) * SY, (top + 3) * SY);
    let ne = 0;
    const em = this.emitters;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const src = chunks[(dz + 1) * 3 + (dx + 1)].blocks;
      const xa = dx === -1 ? 16 - P : 0, xb = dx === 1 ? P : 16;
      const za = dz === -1 ? 16 - P : 0, zb = dz === 1 ? P : 16;
      const rxo = dx * 16 + P, rzo = dz * 16 + P;
      for (let y = 0; y <= top; y++) {
        const sy = y * 256, ry = (y + 1) * SY;
        for (let z = za; z < zb; z++) {
          let si = sy + z * 16 + xa, ri = ry + (z + rzo) * RW + xa + rxo;
          for (let x = xa; x < xb; x++, si++, ri++) {
            const b = src[si];
            R[ri] = b;
            if (EMIT[b] && ne < em.length) { em[ne++] = ri; }
          }
        }
      }
    }
    this.numEmitters = ne;
  }

  _light(top) {
    const RW = this.RW, SY = this.SY, R = this.blocks, sky = this.sky, blk = this.blk, OP = MC.B_OPACITY;
    const q = this.queue, QM = this.QM, colTop = this.colTop;
    const RT = top + 1; // highest ry that is propagated
    let head = 0, tail = 0;
    // --- skylight: vertical columns
    for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) {
      let lv = 15, ry = RT, i = ry * SY + rz * RW + rx;
      for (; ry >= 1; ry--, i -= SY) {
        const op = OP[R[i]];
        if (op >= 15) break;
        lv -= op;
        if (lv <= 0) break;
        sky[i] = lv;
      }
      colTop[rz * RW + rx] = ry;
    }
    // seeds: lit cells beside darker neighbouring columns
    for (let rz = 0; rz < RW; rz++) for (let rx = 0; rx < RW; rx++) {
      const ct = colTop[rz * RW + rx];
      let mx = ct;
      if (rx > 0) mx = Math.max(mx, colTop[rz * RW + rx - 1]);
      if (rx < RW - 1) mx = Math.max(mx, colTop[rz * RW + rx + 1]);
      if (rz > 0) mx = Math.max(mx, colTop[(rz - 1) * RW + rx]);
      if (rz < RW - 1) mx = Math.max(mx, colTop[(rz + 1) * RW + rx]);
      for (let ry = ct + 1; ry <= mx && ry <= RT; ry++) {
        const i = ry * SY + rz * RW + rx;
        if (sky[i] > 1) { q[tail] = i; tail = (tail + 1) & QM; }
      }
    }
    tail = this._bfs(sky, head, tail, RT, true);
    // --- block light
    head = 0; tail = 0;
    const em = this.emitters, EMIT = MC.B_EMIT;
    for (let k = 0; k < this.numEmitters; k++) {
      const i = em[k];
      blk[i] = EMIT[R[i]];
      q[tail] = i; tail = (tail + 1) & QM;
    }
    this._bfs(blk, 0, tail, RT, false);
  }

  _bfs(L, head, tail, RT, isSky) {
    const RW = this.RW, SY = this.SY, R = this.blocks, OP = MC.B_OPACITY, q = this.queue, QM = this.QM;
    while (head !== tail) {
      const i = q[head]; head = (head + 1) & QM;
      const lv = L[i];
      if (lv <= 1) continue;
      const rx = i % RW, rest = (i - rx) / RW, rz = rest % RW, ry = (rest - rz) / RW;
      const nl = lv - 1;
      let n, v;
      if (rx > 0) { n = i - 1; v = nl - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
      if (rx < RW - 1) { n = i + 1; v = nl - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
      if (rz > 0) { n = i - RW; v = nl - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
      if (rz < RW - 1) { n = i + RW; v = nl - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
      if (ry > 1) { n = i - SY; v = (isSky && lv === 15 ? 15 : nl) - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
      if (ry < RT) { n = i + SY; v = nl - OP[R[n]]; if (v > L[n]) { L[n] = v; q[tail] = n; tail = (tail + 1) & QM; } }
    }
    return tail;
  }

  _build(chunk, top) {
    const P = this.P, RW = this.RW, SY = this.SY, R = this.blocks, sky = this.sky, blk = this.blk;
    const OPQ = MC.B_OPAQUE, SHAPE = MC.B_SHAPE, LAYER = MC.B_LAYER, MAT = MC.B_MAT, TEX = MC.B_TEX, TINT = MC.B_TINT;
    const AOB = MC.B_AO, CULL = MC.B_CULLSAME, S = MC.SHAPE, FLUID = MC.B_FLUID, SOLID = MC.B_SOLID, FH = this.FH;
    const CACTUS = MC.BLOCK.cactus;
    for (const L of this.layers) L.count = 0;
    const climate = chunk.climate;
    const faceN = this.faceN, faceAO = this.faceAO, FC = this.faceCorners, dirOff = this.dirOff;
    const self = this;
    const ao4 = [0, 0, 0, 0], sk4 = [0, 0, 0, 0], bl4 = [0, 0, 0, 0];
    const vx = [0, 0, 0, 0], vy = [0, 0, 0, 0], vz = [0, 0, 0, 0], vu = [0, 0, 0, 0], vv = [0, 0, 0, 0];
    const vao = [0, 0, 0, 0], vsk = [0, 0, 0, 0], vbl = [0, 0, 0, 0];
    let maxGeomY = 0;

    function quad(L, nrm, mat, tile, clim, tint, flip) {
      if (L.count >= L.cap) self._grow(L);
      const u16 = L.u16, u8 = L.u8;
      let vi = L.count * 4;
      for (let k = 0; k < 4; k++, vi++) {
        const j = flip ? (k + 1) & 3 : k;
        const o16 = vi * 8, o8 = vi * 16;
        u16[o16] = Math.round(vx[j] * 4); u16[o16 + 1] = Math.round(vy[j] * 4); u16[o16 + 2] = Math.round(vz[j] * 4); u16[o16 + 3] = tile;
        u8[o8 + 8] = vu[j]; u8[o8 + 9] = vv[j]; u8[o8 + 10] = nrm | (ao4[j] << 3); u8[o8 + 11] = mat;
        u8[o8 + 12] = sk4[j]; u8[o8 + 13] = bl4[j]; u8[o8 + 14] = clim; u8[o8 + 15] = tint;
      }
      L.count++;
    }
    const aoFlip = () => (ao4[0] + ao4[2] < ao4[1] + ao4[3]) ||
      ((ao4[0] + ao4[2] === ao4[1] + ao4[3]) && (sk4[0] + sk4[2] + bl4[0] + bl4[2] < sk4[1] + sk4[3] + bl4[1] + bl4[3]));
    // smooth light + AO for a cube-aligned face; fills ao4/sk4/bl4
    function faceLight(fi, f, doAO) {
      const aoD = faceAO[f];
      for (let v = 0; v < 4; v++) {
        const a = fi + aoD[v * 3], b = fi + aoD[v * 3 + 1], c = fi + aoD[v * 3 + 2];
        const oa = OPQ[R[a]], ob = OPQ[R[b]], oc = OPQ[R[c]];
        let s = sky[fi], l = blk[fi], n = 1;
        if (!oa) { s += sky[a]; l += blk[a]; n++; }
        if (!ob) { s += sky[b]; l += blk[b]; n++; }
        if (!oc && !(oa && ob)) { s += sky[c]; l += blk[c]; n++; }
        sk4[v] = Math.round((s / n) * 17); bl4[v] = Math.round((l / n) * 17);
        if (doAO) {
          const s1 = AOB[R[a]], s2 = AOB[R[b]], cr = AOB[R[c]];
          ao4[v] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
        } else ao4[v] = 3;
      }
    }
    function flatLight(i) {
      const s = sky[i] * 17, l = blk[i] * 17;
      for (let v = 0; v < 4; v++) { sk4[v] = s; bl4[v] = l; ao4[v] = 3; }
    }
    function setVerts(list, ox, oy, oz) {
      for (let v = 0; v < 4; v++) {
        const p = list[v];
        vx[v] = ox + p[0]; vy[v] = oy + p[1]; vz[v] = oz + p[2]; vu[v] = p[3]; vv[v] = p[4];
      }
    }
    // auto uv (texel units) of a point on face f
    function autoUV(f, x, y, z, out) {
      switch (f) {
        case 0: out[0] = 16 - z; out[1] = 16 - y; break;
        case 1: out[0] = z; out[1] = 16 - y; break;
        case 2: out[0] = x; out[1] = z; break;
        case 3: out[0] = x; out[1] = 16 - z; break;
        case 4: out[0] = x; out[1] = 16 - y; break;
        default: out[0] = 16 - x; out[1] = 16 - y;
      }
    }
    const uvT = [0, 0];
    // emit one face of an axis-aligned box (px units inside the cell)
    function boxFace(L, i, f, b, x0, y0, z0, x1, y1, z1, ox, oy, oz, clim, tile, tint, uvRot, vOff, mat) {
      const ni = i + faceN[f];
      faceLight(ni, f, true);
      // corner values of the full cell face, interpolated at the box vertices
      for (let v = 0; v < 4; v++) { vao[v] = ao4[v]; vsk[v] = sk4[v]; vbl[v] = bl4[v]; }
      const cs = FC[f];
      for (let v = 0; v < 4; v++) {
        const c = cs[v];
        const px = c[0] ? x1 : x0, py = c[1] ? y1 : y0, pz = c[2] ? z1 : z0;
        vx[v] = ox + px; vy[v] = oy + py; vz[v] = oz + pz;
        autoUV(f, px, py, pz, uvT);
        const s = uvT[0] / 16, t = uvT[1] / 16;
        const w0 = (1 - s) * (1 - t), w1 = s * (1 - t), w2 = s * t, w3 = (1 - s) * t;
        sk4[v] = Math.round(vsk[0] * w0 + vsk[1] * w1 + vsk[2] * w2 + vsk[3] * w3);
        bl4[v] = Math.round(vbl[0] * w0 + vbl[1] * w1 + vbl[2] * w2 + vbl[3] * w3);
        ao4[v] = Math.round(vao[0] * w0 + vao[1] * w1 + vao[2] * w2 + vao[3] * w3);
        let u = uvT[0], w = uvT[1];
        if (f === 2 || f === 3) { for (let r = 0; r < uvRot; r++) { const t2 = u; u = w; w = 16 - t2; } }
        else if (vOff) w += vOff;
        vu[v] = u; vv[v] = w;
      }
      quad(L, f, mat, tile, clim, tint, aoFlip());
    }
    function emitBoxes(L, i, b, boxes, ox, oy, oz, clim, sameShapeCull) {
      const mat = MAT[b];
      for (let k = 0; k < boxes.length; k++) {
        const bx = boxes[k];
        const bb = bx.b || bx;
        const x0 = bb[0], y0 = bb[1], z0 = bb[2], x1 = bb[3], y1 = bb[4], z1 = bb[5];
        for (let f = 0; f < 6; f++) {
          let boundary;
          switch (f) {
            case 0: boundary = x1 === 16; break; case 1: boundary = x0 === 0; break;
            case 2: boundary = y1 === 16; break; case 3: boundary = y0 === 0; break;
            case 4: boundary = z1 === 16; break; default: boundary = z0 === 0;
          }
          if (boundary) {
            const nb = R[i + faceN[f]];
            if (OPQ[nb]) continue;
            if (sameShapeCull && SHAPE[nb] === SHAPE[b] && f !== 2 && f !== 3) continue;
          }
          const tile = bx.tex && bx.tex[f] !== null && bx.tex[f] !== undefined ? bx.tex[f] : TEX[b * 6 + f];
          boxFace(L, i, f, b, x0, y0, z0, x1, y1, z1, ox, oy, oz, clim, tile, TINT[b * 6 + f], bx.uvRot || 0, bx.vOff || 0, mat);
        }
      }
    }
    // fluid corner height (px) at corner (cx, cz) of cell i for fluid type ft
    function cornerH(i, cx, cz, ft, own) {
      let sum = 0, w = 0;
      for (let oz = cz - 1; oz <= cz; oz++) for (let ox = cx - 1; ox <= cx; ox++) {
        const j = i + ox + oz * RW;
        if (FLUID[R[j + SY]] === ft) return 16;
        const bj = R[j];
        if (FLUID[bj] === ft) {
          const h = FH[bj];
          if (h >= 0.8) { sum += h * 10; w += 10; } else { sum += h; w += 1; }
        } else if (!SOLID[bj]) w += 1;
      }
      return Math.round((w ? sum / w : own) * 16);
    }
    const ch = [0, 0, 0, 0]; // corner heights: [x0z0, x1z0, x1z1, x0z1]

    const maxY = Math.min(chunk.maxY, top);
    for (let y = 0; y <= maxY; y++) {
      for (let z = 0; z < 16; z++) {
        let i = (y + 1) * SY + (z + P) * RW + P;
        for (let x = 0; x < 16; x++, i++) {
          const b = R[i];
          if (b === 0) continue;
          const shape = SHAPE[b];
          const ox = x * 16, oy = y * 16, oz = z * 16;
          const clim = climate[z * 16 + x];
          const mat = MAT[b];
          if (shape === S.CUBE) {
            const L = this.layers[LAYER[b]];
            for (let f = 0; f < 6; f++) {
              const ni = i + faceN[f];
              const nb = R[ni];
              if (OPQ[nb]) continue;
              if (nb === b && CULL[b]) continue;
              faceLight(ni, f, true);
              const cs = FC[f];
              for (let v = 0; v < 4; v++) {
                const c = cs[v];
                vx[v] = ox + c[0] * 16; vy[v] = oy + c[1] * 16; vz[v] = oz + c[2] * 16;
                vu[v] = (v === 1 || v === 2) ? 16 : 0; vv[v] = v >= 2 ? 16 : 0;
              }
              quad(L, f, mat, TEX[b * 6 + f], clim, TINT[b * 6 + f], aoFlip());
              if (y > maxGeomY) maxGeomY = y;
            }
          } else if (shape === S.LIQUID) {
            const ft = FLUID[b];
            const L = this.layers[LAYER[b]];
            const own = FH[b];
            if (FLUID[R[i + SY]] === ft) { ch[0] = ch[1] = ch[2] = ch[3] = 16; }
            else {
              ch[0] = cornerH(i, 0, 0, ft, own); ch[1] = cornerH(i, 1, 0, ft, own);
              ch[2] = cornerH(i, 1, 1, ft, own); ch[3] = cornerH(i, 0, 1, ft, own);
            }
            for (let f = 0; f < 6; f++) {
              const ni = i + faceN[f];
              const nb = R[ni];
              if (OPQ[nb]) continue;
              if (FLUID[nb] === ft) continue;
              faceLight(ni, f, false);
              const cs = FC[f];
              for (let v = 0; v < 4; v++) {
                const c = cs[v];
                const hh = c[1] ? ch[c[2] ? (c[0] ? 2 : 3) : (c[0] ? 1 : 0)] : 0;
                vx[v] = ox + c[0] * 16; vy[v] = oy + hh; vz[v] = oz + c[2] * 16;
                vu[v] = (v === 1 || v === 2) ? 16 : 0; vv[v] = f === 2 || f === 3 ? (v >= 2 ? 16 : 0) : 16 - hh;
              }
              quad(L, f, mat, TEX[b * 6 + f], clim, TINT[b * 6 + f], false);
              if (y > maxGeomY) maxGeomY = y;
            }
          } else if (shape === S.BOXES) {
            emitBoxes(this.layers[LAYER[b]], i, b, MC.B_BOXES[b], ox, oy, oz, clim, false);
            if (y > maxGeomY) maxGeomY = y;
          } else if (shape === S.FENCE || shape === S.PANE) {
            let mask = 0;
            const conn = shape === S.FENCE ? MC.connectsFence : MC.connectsPane;
            for (let f = 0; f < 4; f++) if (conn(R[i + dirOff[f]])) mask |= 1 << f;
            emitBoxes(this.layers[LAYER[b]], i, b, MC.Mesher.connectCache(shape, mask), ox, oy, oz, clim, true);
            if (y > maxGeomY) maxGeomY = y;
          } else if (shape === S.CROSS) {
            flatLight(i);
            const L = this.layers[0], tile = TEX[b * 6], tint = TINT[b * 6];
            for (const q of MC.Mesher.CROSS) { setVerts(q, ox, oy, oz); quad(L, 6, mat, tile, clim, tint, false); }
            if (y > maxGeomY) maxGeomY = y;
          } else if (shape === S.CROP) {
            flatLight(i);
            const L = this.layers[0], tile = TEX[b * 6], tint = TINT[b * 6];
            for (const q of MC.Mesher.CROP) { setVerts(q, ox, oy, oz); quad(L, 6, mat, tile, clim, tint, false); }
            if (y > maxGeomY) maxGeomY = y;
          } else if (shape === S.TORCH) {
            flatLight(i);
            const L = this.layers[0], tile = TEX[b * 6];
            const fc = MC.B_FACING[b];
            const faces = fc >= 0 ? MC.Mesher.WALL_TORCH[fc] : MC.Mesher.TORCH;
            for (let f = 0; f < 6; f++) { setVerts(faces[f], ox, oy, oz); quad(L, fc >= 0 ? MC.Mesher.WALL_TORCH_N[fc][f] : f, mat, tile, clim, 0, false); }
            if (y > maxGeomY) maxGeomY = y;
          } else if (shape === S.CACTUS) {
            const L = this.layers[0];
            for (let f = 0; f < 6; f++) {
              const ni = i + faceN[f], nb = R[ni];
              if (f === 2 || f === 3) {
                if (OPQ[nb] || nb === CACTUS) continue;
                faceLight(ni, f, false);
                const cs = FC[f];
                for (let v = 0; v < 4; v++) {
                  const c = cs[v];
                  vx[v] = ox + c[0] * 16; vy[v] = oy + c[1] * 16; vz[v] = oz + c[2] * 16;
                  vu[v] = (v === 1 || v === 2) ? 16 : 0; vv[v] = v >= 2 ? 16 : 0;
                }
              } else {
                flatLight(i);
                setVerts(MC.Mesher.CACTUS_SIDES[f > 3 ? f - 2 : f], ox, oy, oz);
              }
              quad(L, f, mat, TEX[b * 6 + f], clim, 0, false);
            }
            if (y > maxGeomY) maxGeomY = y;
          }
        }
      }
    }
    const out = this.layers.map((L) => ({ u8: L.u8, quads: L.count }));
    out.maxY = maxGeomY + 1;
    return out;
  }
};

// Face corners (unit cube) per face +x,-x,+y,-y,+z,-z in order TL, TR, BR, BL seen from outside
MC.Mesher.FACE_CORNERS = [
  [[1, 1, 1], [1, 1, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [0, 1, 1], [0, 0, 1], [0, 0, 0]],
  [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]],
  [[1, 1, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0]],
];
// Special shapes: vertex lists [x16, y16, z16, u, v] in order TL, TR, BR, BL
MC.Mesher.CROSS = [
  [[1, 16, 1, 0, 0], [15, 16, 15, 16, 0], [15, 0, 15, 16, 16], [1, 0, 1, 0, 16]],
  [[15, 16, 15, 0, 0], [1, 16, 1, 16, 0], [1, 0, 1, 16, 16], [15, 0, 15, 0, 16]],
  [[1, 16, 15, 0, 0], [15, 16, 1, 16, 0], [15, 0, 1, 16, 16], [1, 0, 15, 0, 16]],
  [[15, 16, 1, 0, 0], [1, 16, 15, 16, 0], [1, 0, 15, 16, 16], [15, 0, 1, 0, 16]],
];
// crops: four planes (x = 4, 12 and z = 4, 12), both sides
MC.Mesher.CROP = (() => {
  const out = [];
  for (const p of [4, 12]) {
    out.push([[p, 16, 16, 0, 0], [p, 16, 0, 16, 0], [p, 0, 0, 16, 16], [p, 0, 16, 0, 16]]);
    out.push([[p, 16, 0, 0, 0], [p, 16, 16, 16, 0], [p, 0, 16, 16, 16], [p, 0, 0, 0, 16]]);
    out.push([[0, 16, p, 0, 0], [16, 16, p, 16, 0], [16, 0, p, 16, 16], [0, 0, p, 0, 16]]);
    out.push([[16, 16, p, 0, 0], [0, 16, p, 16, 0], [0, 0, p, 16, 16], [16, 0, p, 0, 16]]);
  }
  return out;
})();
// torch faces in face order +x,-x,+y,(-y skipped -> index 3 unused),+z,-z  — stored as a list with matching normals
MC.Mesher.TORCH = (() => {
  const sv = (a, b, c, d) => [a, b, c, d];
  const faces = [];
  faces[0] = sv([9, 10, 9, 7, 6], [9, 10, 7, 9, 6], [9, 0, 7, 9, 16], [9, 0, 9, 7, 16]);
  faces[1] = sv([7, 10, 7, 7, 6], [7, 10, 9, 9, 6], [7, 0, 9, 9, 16], [7, 0, 7, 7, 16]);
  faces[2] = sv([7, 10, 7, 7, 6], [9, 10, 7, 9, 6], [9, 10, 9, 9, 8], [7, 10, 9, 7, 8]);
  faces[3] = sv([7, 0, 9, 7, 14], [9, 0, 9, 9, 14], [9, 0, 7, 9, 16], [7, 0, 7, 7, 16]);
  faces[4] = sv([7, 10, 9, 7, 6], [9, 10, 9, 9, 6], [9, 0, 9, 9, 16], [7, 0, 9, 7, 16]);
  faces[5] = sv([9, 10, 7, 7, 6], [7, 10, 7, 9, 6], [7, 0, 7, 9, 16], [9, 0, 7, 7, 16]);
  return faces;
})();
// wall torches: the standing torch tilted 22.5° away from the wall, base against the wall (facing = wall side)
MC.Mesher.WALL_TORCH = [];
MC.Mesher.WALL_TORCH_N = [];
(() => {
  const th = -0.3927, c = Math.cos(th), s = Math.sin(th);
  for (let r = 0; r < 4; r++) {
    MC.Mesher.WALL_TORCH.push(MC.Mesher.TORCH.map((face) => face.map(([x, y, z, u, v]) => {
      let px = x - 8, py = y, pz = z - 8;
      const ny = py * c - pz * s, nz = py * s + pz * c;
      px += 8; py = ny + 3.5; pz = nz + 14.8;
      for (let k = 0; k < r; k++) { const t = px; px = 16 - pz; pz = t; }
      return [px, py, pz, u, v];
    })));
    // face normals rotate with the facing (the tilt is small enough to keep axis normals)
    MC.Mesher.WALL_TORCH_N.push([0, 1, 2, 3, 4, 5].map((f) => MC.rotFace(f, r)));
  }
})();
// cactus side faces (+x, -x, +z, -z), inset by one pixel
MC.Mesher.CACTUS_SIDES = [
  [[15, 16, 16, 0, 0], [15, 16, 0, 16, 0], [15, 0, 0, 16, 16], [15, 0, 16, 0, 16]],
  [[1, 16, 0, 0, 0], [1, 16, 16, 16, 0], [1, 0, 16, 16, 16], [1, 0, 0, 0, 16]],
  [[0, 16, 15, 0, 0], [16, 16, 15, 16, 0], [16, 0, 15, 16, 16], [0, 0, 15, 0, 16]],
  [[16, 16, 1, 0, 0], [0, 16, 1, 16, 0], [0, 0, 1, 16, 16], [16, 0, 1, 0, 16]],
];
// connection boxes cache for fences / panes (render variant)
MC.Mesher._conn = {};
MC.Mesher.connectCache = function (shape, mask) {
  const k = shape * 16 + mask;
  return MC.Mesher._conn[k] || (MC.Mesher._conn[k] = MC.connectBoxes(shape, mask, false));
};
