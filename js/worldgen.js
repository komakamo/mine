'use strict';
// Terrain generation: continents, ridged mountains, biomes, caves, ores, trees and plants.
MC.BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6, BIRCH: 7, TAIGA: 8 };

MC.WorldGen = class {
  constructor(seed) {
    this.seed = seed | 0;
    const n = (k) => new MC.Noise(this.seed * 31 + k);
    this.nCont = n(1); this.nMount = n(2); this.nRidge = n(3); this.nDetail = n(4);
    this.nTemp = n(5); this.nHum = n(6); this.nCave1 = n(7); this.nCave2 = n(8); this.nCheese = n(9); this.nMisc = n(10);
    this.heights = new Float32Array(18 * 18);
    this.colBiome = new Uint8Array(256);
    this.colTemp = new Float32Array(256);
    this.caveG1 = new Float32Array(25 * 52);
    this.caveG2 = new Float32Array(25 * 52);
    this.caveG3 = new Float32Array(25 * 52);
  }

  height(x, z) {
    const SEA = MC.SEA;
    const cont = this.nCont.fbm2(x * 0.0012, z * 0.0012, 5);
    let h = SEA + 4 + cont * 30;
    h += this.nDetail.fbm2(x * 0.008, z * 0.008, 4) * 7;
    const land = MC.smoothstep(-0.12, 0.1, cont);
    const m = this.nMount.fbm2(x * 0.0021 + 31.7, z * 0.0021 - 17.3, 4);
    const mf = MC.smoothstep(0.05, 0.45, m) * land;
    if (mf > 0) {
      const r = 1 - Math.abs(this.nRidge.fbm2(x * 0.006, z * 0.006, 5));
      h += mf * (r * r * r * 82 + 12);
    }
    h += this.nDetail.noise2(x * 0.06, z * 0.06) * 1.2;
    return MC.clamp(h, 4, MC.HEIGHT - 14);
  }

  climate(x, z, h) {
    const temp = this.nTemp.fbm2(x * 0.0009, z * 0.0009, 3) * 1.4 - Math.max(0, h - MC.SEA - 30) * 0.008;
    const hum = this.nHum.fbm2(x * 0.0011 + 100, z * 0.0011 - 100, 3) * 1.4;
    return { temp, hum };
  }

  biome(h, temp, hum) {
    const B = MC.BIOME, SEA = MC.SEA;
    if (h < SEA - 1) return B.OCEAN;
    if (temp < -0.3) return hum > 0.1 ? B.TAIGA : B.SNOWY;
    if (h <= SEA + 1) return B.BEACH;
    if (h > SEA + 52) return B.MOUNTAIN;
    if (temp > 0.3 && hum < 0.08) return B.DESERT;
    if (hum > 0.22) return temp < 0.0 ? B.TAIGA : (hum > 0.45 ? B.BIRCH : B.FOREST);
    return B.PLAINS;
  }

  columnInfo(x, z) {
    const h = Math.floor(this.height(x, z));
    const c = this.climate(x, z, h);
    return { h, biome: this.biome(h, c.temp, c.hum), temp: c.temp, hum: c.hum };
  }

  generate(chunk) {
    const B = MC.BLOCK, BI = MC.BIOME, SEA = MC.SEA, H = MC.HEIGHT;
    const blocks = chunk.blocks;
    const x0 = chunk.cx * 16, z0 = chunk.cz * 16;
    const hs = this.heights;
    for (let z = -1; z < 17; z++) for (let x = -1; x < 17; x++) hs[(z + 1) * 18 + x + 1] = Math.floor(this.height(x0 + x, z0 + z));

    const colBiome = this.colBiome, colTemp = this.colTemp;
    let maxH = 0;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = hs[(z + 1) * 18 + x + 1];
      const cl = this.climate(wx, wz, h);
      const biome = this.biome(h, cl.temp, cl.hum);
      colBiome[z * 16 + x] = biome; colTemp[z * 16 + x] = cl.temp;
      chunk.climate[z * 16 + x] = Math.round(MC.clamp(0.5 + cl.temp * 0.55 - cl.hum * 0.25, 0, 1) * 255);
      if (h > maxH) maxH = h;
      const slope = Math.abs(hs[(z + 1) * 18 + x + 2] - hs[(z + 1) * 18 + x]) + Math.abs(hs[(z + 2) * 18 + x + 1] - hs[z * 18 + x + 1]);
      const rnd = MC.hash2(wx, wz, this.seed);

      let top = B.grass, sub = B.dirt, subDepth = 3 + (rnd < 0.5 ? 1 : 0), deep = B.stone;
      switch (biome) {
        case BI.OCEAN: {
          const n = this.nMisc.noise2(wx * 0.05, wz * 0.05);
          top = h > SEA - 7 ? B.sand : (n > 0.35 ? B.clay : n < -0.3 ? B.gravel : B.dirt);
          sub = top === B.clay ? B.clay : B.sand; subDepth = 3; break;
        }
        case BI.BEACH: top = B.sand; sub = B.sand; subDepth = 3; deep = B.sandstone; break;
        case BI.DESERT: top = B.sand; sub = B.sand; subDepth = 4; break;
        case BI.SNOWY: case BI.TAIGA: top = B.snowy_grass; break;
        case BI.MOUNTAIN:
          if (h > 148) { top = B.snow; sub = B.stone; }
          else if (h > 120 || slope > 5) { top = rnd < 0.15 ? B.gravel : B.stone; sub = B.stone; }
          break;
      }
      if (slope > 7 && biome !== BI.OCEAN && biome !== BI.DESERT && h > SEA + 3) { top = B.stone; sub = B.stone; }

      let i = x + z * 16;
      blocks[i] = B.bedrock;
      for (let y = 1; y <= h; y++) {
        i = x + z * 16 + y * 256;
        let b;
        if (y < 4 && MC.hash3(wx, y, wz, this.seed) < 0.5 - y * 0.12) b = B.bedrock;
        else if (y === h) b = top;
        else if (y > h - subDepth) b = sub;
        else if (y > h - subDepth - 3 && deep === B.sandstone) b = B.sandstone;
        else if (y > h - subDepth - 3 && biome === BI.DESERT) b = B.sandstone;
        else b = B.stone;
        blocks[i] = b;
      }
      for (let y = h + 1; y < SEA; y++) {
        const cold = colTemp[z * 16 + x] < -0.3;
        blocks[x + z * 16 + y * 256] = (y === SEA - 1 && cold) ? B.ice : B.water;
      }
    }
    maxH = Math.max(maxH, SEA);

    this.carveCaves(chunk, hs, maxH);
    this.placeOres(chunk);
    this.placeSprings(chunk, hs);
    this.placePlants(chunk, hs, colBiome);
    this.placeCavePlants(chunk, hs);
    this.placeTrees(chunk);
    if (MC.Structures) MC.Structures.stamp(this, chunk, hs);

    // bookkeeping: highest non-air block
    let top = 0;
    for (let y = H - 1; y >= 0 && !top; y--) {
      const base = y * 256;
      for (let k = 0; k < 256; k++) if (blocks[base + k]) { top = y; break; }
    }
    chunk.maxY = top;
  }

  carveCaves(chunk, hs, maxH) {
    const B = MC.BLOCK, SEA = MC.SEA;
    const blocks = chunk.blocks;
    const x0 = chunk.cx * 16, z0 = chunk.cz * 16;
    const NY = Math.ceil((maxH + 2) / 4) + 1;
    const g1 = this.caveG1, g2 = this.caveG2, g3 = this.caveG3;
    for (let gy = 0; gy < NY; gy++) for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) {
      const wx = x0 + gx * 4, wy = gy * 4, wz = z0 + gz * 4, k = (gy * 5 + gz) * 5 + gx;
      g1[k] = this.nCave1.noise3(wx * 0.016, wy * 0.028, wz * 0.016);
      g2[k] = this.nCave2.noise3(wx * 0.016, wy * 0.028, wz * 0.016);
      g3[k] = wy < 60 ? this.nCheese.fbm3(wx * 0.011, wy * 0.02, wz * 0.011, 2) : -1;
    }
    const tri = (g, fx, fy, fz, ix, iy, iz) => {
      const k = (iy * 5 + iz) * 5 + ix;
      const a = g[k] + (g[k + 1] - g[k]) * fx, b = g[k + 5] + (g[k + 6] - g[k + 5]) * fx;
      const c = g[k + 25] + (g[k + 26] - g[k + 25]) * fx, d = g[k + 30] + (g[k + 31] - g[k + 30]) * fx;
      const e = a + (b - a) * fz, f = c + (d - c) * fz;
      return e + (f - e) * fy;
    };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hs[(z + 1) * 18 + x + 1];
      const wet = h < SEA + 4;
      const yMax = wet ? h - 6 : h;
      const ix = x >> 2, iz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
      for (let y = 4; y <= yMax; y++) {
        const iy = y >> 2, fy = (y & 3) / 4;
        const n1 = tri(g1, fx, fy, fz, ix, iy, iz), n2 = tri(g2, fx, fy, fz, ix, iy, iz);
        const depthF = MC.clamp((h - y) / 12, 0.4, 1);
        let cave = n1 * n1 + n2 * n2 < 0.0042 * depthF;
        if (!cave && y < 58) {
          const n3 = tri(g3, fx, fy, fz, ix, iy, iz);
          cave = n3 > 0.42 + Math.max(0, y - 30) * 0.008;
        }
        if (cave) {
          const i = x + z * 16 + y * 256;
          const b = blocks[i];
          if (b === B.water || b === B.bedrock || b === B.ice) continue;
          // never open a hole directly under or beside sea water
          if (y < 250 && blocks[i + 256] === B.water) continue;
          if (y < SEA) {
            const k = (z + 1) * 18 + x + 1;
            if (hs[k - 1] < y || hs[k + 1] < y || hs[k - 18] < y || hs[k + 18] < y) continue;
          }
          blocks[i] = y <= 10 ? B.lava : B.air;
        }
      }
    }
  }

  placeOres(chunk) {
    const B = MC.BLOCK;
    const rnd = MC.mulberry32((chunk.cx * 73856093) ^ (chunk.cz * 19349663) ^ this.seed);
    const blocks = chunk.blocks;
    const veins = [[B.coal_ore, 14, 9, 5, 130], [B.iron_ore, 9, 6, 5, 70], [B.gold_ore, 3, 5, 5, 34], [B.diamond_ore, 2, 4, 5, 16], [B.emerald_ore, 1, 2, 30, 110]];
    for (const [ore, count, size, y0, y1] of veins) {
      for (let v = 0; v < count; v++) {
        let x = Math.floor(rnd() * 16), z = Math.floor(rnd() * 16), y = y0 + Math.floor(rnd() * (y1 - y0));
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < MC.HEIGHT) {
            const i = x + z * 16 + y * 256;
            if (blocks[i] === B.stone) blocks[i] = ore;
          }
          const r = rnd();
          if (r < 0.33) x += rnd() < 0.5 ? -1 : 1; else if (r < 0.66) z += rnd() < 0.5 ? -1 : 1; else y += rnd() < 0.5 ? -1 : 1;
        }
      }
    }
  }

  placePlants(chunk, hs, colBiome) {
    const B = MC.BLOCK, BI = MC.BIOME, SEA = MC.SEA;
    const blocks = chunk.blocks;
    const x0 = chunk.cx * 16, z0 = chunk.cz * 16;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hs[(z + 1) * 18 + x + 1];
      if (h + 4 >= MC.HEIGHT) continue;
      const i = x + z * 16 + h * 256;
      const below = blocks[i], above = blocks[i + 256];
      if (above !== B.air) continue;
      const r = MC.hash2(x0 + x, z0 + z, this.seed + 50);
      const r2 = MC.hash2(x0 + x, z0 + z, this.seed + 51);
      const biome = colBiome[z * 16 + x];
      let p = 0;
      // sugar cane on shores next to water
      if ((below === B.sand || below === B.grass || below === B.dirt) && h >= SEA - 1 && h <= SEA + 1 && r2 < 0.12) {
        const wet = hs[(z + 1) * 18 + x] < SEA - 1 || hs[(z + 1) * 18 + x + 2] < SEA - 1 || hs[z * 18 + x + 1] < SEA - 1 || hs[(z + 2) * 18 + x + 1] < SEA - 1;
        if (wet && this.nMisc.noise2((x0 + x) * 0.05, (z0 + z) * 0.05) > 0.1) {
          const n = 1 + Math.floor(r * 3);
          for (let k = 1; k <= n; k++) blocks[i + 256 * k] = B.sugar_cane;
          continue;
        }
      }
      if (below === B.grass) {
        const dens = this.nMisc.noise2((x0 + x) * 0.03, (z0 + z) * 0.03) * 0.5 + 0.5;
        if (biome === BI.PLAINS) {
          if (r < 0.1 + dens * 0.35) p = B.tall_grass;
          else if (r < 0.47 + dens * 0.02) p = r < 0.462 ? B.dandelion : r < 0.466 ? B.poppy : r < 0.468 ? B.oxeye_daisy : B.cornflower;
          else if (r > 0.9985) p = B.pumpkin;
        } else if (biome === BI.FOREST || biome === BI.BIRCH) {
          if (r < 0.12 + dens * 0.15) p = r2 < 0.15 ? B.fern : B.tall_grass;
          else if (r > 0.985) p = r > 0.996 ? B.poppy : r > 0.993 ? (biome === BI.BIRCH ? B.allium : B.cornflower) : r > 0.99 ? (r2 < 0.5 ? B.brown_mushroom : B.red_mushroom) : B.dandelion;
          else if (r > 0.9795 && r2 < 0.1) p = B.melon;
        } else if (r < 0.1) p = B.tall_grass;
      } else if (below === B.sand && biome === BI.DESERT && r < 0.008) p = B.dead_bush;
      else if (below === B.snowy_grass && r < 0.05) p = r < 0.03 ? B.fern : B.tall_grass;
      if (p) blocks[i + 256] = p;
    }
  }

  // mushrooms on dark cave floors
  placeCavePlants(chunk, hs) {
    const B = MC.BLOCK, blocks = chunk.blocks;
    const rnd = MC.mulberry32((chunk.cx * 92821) ^ (chunk.cz * 68917) ^ (this.seed + 31));
    for (let k = 0; k < 6; k++) {
      const x = Math.floor(rnd() * 16), z = Math.floor(rnd() * 16);
      const h = hs[(z + 1) * 18 + x + 1];
      for (let y = Math.min(h - 6, 60); y > 6; y--) {
        const i = x + z * 16 + y * 256;
        if (blocks[i] === 0 && blocks[i - 256] === B.stone) {
          if (rnd() < 0.35) blocks[i] = rnd() < 0.6 ? B.brown_mushroom : B.red_mushroom;
          break;
        }
      }
    }
  }

  // single source blocks in stone walls with exactly one open side: they turn into waterfalls / lava falls
  placeSprings(chunk, hs) {
    const B = MC.BLOCK, blocks = chunk.blocks;
    const rnd = MC.mulberry32((chunk.cx * 49157) ^ (chunk.cz * 7919) ^ (this.seed + 977));
    // cliff springs: a source in the face of a steep drop -> visible waterfall (rarely lava)
    if (rnd() < 0.4) {
      for (let k = 0; k < 8; k++) {
        const x = 1 + Math.floor(rnd() * 14), z = 1 + Math.floor(rnd() * 14);
        const h = hs[(z + 1) * 18 + x + 1];
        if (h < MC.SEA + 6) continue;
        const d = MC.DIRS[Math.floor(rnd() * 4)];
        const nh = hs[(z + 1 + d[2]) * 18 + x + 1 + d[0]];
        if (h - nh < 4) continue;
        const y = nh + 2 + Math.floor(rnd() * Math.max(1, h - nh - 3));
        const i = x + z * 16 + y * 256, o = d[0] + d[2] * 16;
        if (!MC.B_OPAQUE[blocks[i]] || !MC.B_OPAQUE[blocks[i + 256]] || !MC.B_OPAQUE[blocks[i - 256]] || blocks[i + o] !== 0) continue;
        blocks[i] = rnd() < 0.1 && h > MC.SEA + 30 ? B.lava : B.water;
        (chunk.pending || (chunk.pending = [])).push(i);
        break;
      }
    }
    for (let k = 0; k < 10; k++) {
      const water = k < 8;
      const x = 1 + Math.floor(rnd() * 14), z = 1 + Math.floor(rnd() * 14);
      const h = hs[(z + 1) * 18 + x + 1];
      const y = water ? 14 + Math.floor(rnd() * Math.max(1, h - 14)) : 8 + Math.floor(rnd() * 28);
      if (y < 5 || y >= h - 1) continue;
      const i = x + z * 16 + y * 256;
      if (blocks[i] !== B.stone || blocks[i + 256] !== B.stone || blocks[i - 256] !== B.stone) continue;
      let air = 0, st = 0;
      for (const o of [1, -1, 16, -16]) { const n = blocks[i + o]; if (n === 0) air++; else if (n === B.stone || MC.B_OPAQUE[n]) st++; }
      if (air !== 1 || st !== 3) continue;
      blocks[i] = water ? B.water : B.lava;
      (chunk.pending || (chunk.pending = [])).push(i);
    }
  }

  placeTrees(chunk) {
    const BI = MC.BIOME, CELL = 5;
    const x0 = chunk.cx * 16, z0 = chunk.cz * 16;
    const gx0 = Math.floor((x0 - 3) / CELL), gx1 = Math.floor((x0 + 18) / CELL);
    const gz0 = Math.floor((z0 - 3) / CELL), gz1 = Math.floor((z0 + 18) / CELL);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const tx = gx * CELL + Math.floor(MC.hash2(gx, gz, this.seed + 101) * CELL);
      const tz = gz * CELL + Math.floor(MC.hash2(gx, gz, this.seed + 202) * CELL);
      if (tx < x0 - 3 || tx > x0 + 18 || tz < z0 - 3 || tz > z0 + 18) continue;
      const info = this.columnInfo(tx, tz);
      const r = MC.hash2(gx, gz, this.seed + 303), r2 = MC.hash2(gx, gz, this.seed + 404);
      if (info.h < MC.SEA) continue;
      let prob = 0, kind = 'oak';
      switch (info.biome) {
        case BI.FOREST: prob = 0.8; kind = r2 < 0.25 ? 'birch' : 'oak'; break;
        case BI.BIRCH: prob = 0.8; kind = r2 < 0.8 ? 'birch' : 'oak'; break;
        case BI.PLAINS: prob = 0.07; break;
        case BI.TAIGA: prob = 0.75; kind = 'spruce'; break;
        case BI.SNOWY: prob = 0.18; kind = 'spruce'; break;
        case BI.MOUNTAIN: prob = info.h < 118 ? 0.25 : 0; kind = 'spruce'; break;
        case BI.DESERT: prob = 0.18; kind = 'cactus'; break;
      }
      if (r >= prob) continue;
      // steep terrain has exposed stone: skip
      const hN = Math.floor(this.height(tx + 1, tz)), hS = Math.floor(this.height(tx - 1, tz));
      if (Math.abs(hN - hS) > 3) continue;
      if (MC.Structures && MC.Structures.blocksTree(this, tx, tz)) continue;
      this.growTree(chunk, kind, tx, info.h + 1, tz, MC.hash2(gx, gz, this.seed + 505));
    }
  }

  growTree(chunk, kind, wx, wy, wz, rnd) {
    const B = MC.BLOCK;
    const blocks = chunk.blocks, x0 = chunk.cx * 16, z0 = chunk.cz * 16;
    const set = (x, y, z, b, force) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= MC.HEIGHT) return;
      const i = lx + lz * 16 + y * 256;
      const cur = blocks[i];
      if (force ? (cur === B.air || MC.B_REPLACEABLE[cur] || MC.B_MAT[cur] === MC.MAT.LEAVES) && !MC.B_FLUID[cur] : (cur === B.air || (MC.B_REPLACEABLE[cur] && !MC.B_FLUID[cur]))) blocks[i] = b;
    };
    const inChunk = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
    if (inChunk(wx, wz)) {
      const ground = blocks[(wx - x0) + (wz - z0) * 16 + (wy - 1) * 256];
      if (kind === 'cactus' ? ground !== B.sand : (ground !== B.grass && ground !== B.snowy_grass && ground !== B.dirt)) return;
    }
    this.buildTree(set, kind, wx, wy, wz, rnd);
  }

  // tree shapes through a setter set(x, y, z, id, force) (shared by world generation and saplings)
  buildTree(set, kind, wx, wy, wz, rnd) {
    const B = MC.BLOCK;
    if (kind === 'cactus') {
      const hgt = 1 + Math.floor(rnd * 3);
      for (let i = 0; i < hgt; i++) set(wx, wy + i, wz, B.cactus, true);
      return;
    }
    const hr = (a, b, c) => MC.hash3(a, b, c, this.seed + 606);
    if (kind === 'spruce') {
      const th = 6 + Math.floor(rnd * 4), top = wy + th - 1;
      for (let y = top + 1; y >= wy + 2; y--) {
        const k = top + 1 - y;
        let r = k === 0 ? 0 : k === 1 ? 1 : (k % 2 === 0 ? Math.min(3, 1 + (k >> 2) + 1) : Math.min(2, 1 + (k >> 2)));
        if (y <= wy + 2) r = Math.min(r, 2);
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
          if (dx === 0 && dz === 0 && y <= top) continue;
          set(wx + dx, y, wz + dz, B.spruce_leaves, false);
        }
      }
      for (let y = wy; y <= top; y++) set(wx, y, wz, B.spruce_log, true);
      return;
    }
    const birch = kind === 'birch';
    const th = (birch ? 5 : 4) + Math.floor(rnd * 3), top = wy + th - 1;
    const log = birch ? B.birch_log : B.oak_log, leaf = birch ? B.birch_leaves : B.oak_leaves;
    for (let y = top - 2; y <= top + 1; y++) {
      const r = y <= top - 1 ? 2 : 1;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && (y === top + 1 || hr(wx + dx, y, wz + dz) < 0.55)) continue;
        if (dx === 0 && dz === 0 && y <= top) continue;
        set(wx + dx, y, wz + dz, leaf, false);
      }
    }
    for (let y = wy; y <= top; y++) set(wx, y, wz, log, true);
  }
};
