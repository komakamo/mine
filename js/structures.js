'use strict';
// Structures: villages (houses, farms, pens, well, lamp posts, roads) and dungeons (underground rooms
// and corridors with spawners and loot chests, entered through a spiral staircase below a surface
// ruin), plus small monster rooms in caves. Plans are generated deterministically per grid cell and
// cached; each chunk stamps the part of every plan that overlaps it.
(function () {
  const B = () => MC.BLOCK;
  const VCELL = 256, DCELL = 208;

  // ---------------------------------------------------------------- block canvas
  class Canvas {
    constructor(ox, oz) { this.ox = ox; this.oz = oz; this.m = new Map(); this.spawners = []; this.loot = []; }
    key(x, y, z) { return ((x - this.ox + 1024) * 2048 + (z - this.oz + 1024)) * 256 + y; }
    put(x, y, z, id) { if (y < 1 || y >= MC.HEIGHT) return; this.m.set(this.key(x, y, z), id); }
    get(x, y, z) { return this.m.get(this.key(x, y, z)); }
    finalize() {
      const byChunk = new Map();
      const entry = (x, z) => {
        const ck = MC.World.key(x >> 4, z >> 4);
        let e = byChunk.get(ck);
        if (!e) byChunk.set(ck, e = { cells: [], spawners: [], loot: [] });
        return e;
      };
      for (const [k, id] of this.m) {
        const y = k % 256, r = (k - y) / 256;
        const z = (r % 2048) - 1024 + this.oz, x = Math.floor(r / 2048) - 1024 + this.ox;
        entry(x, z).cells.push(((x & 15) + (z & 15) * 16 + y * 256) | (id << 16));
      }
      for (const [x, y, z, t] of this.spawners) entry(x, z).spawners.push([(x & 15) + (z & 15) * 16 + y * 256, t]);
      for (const [x, y, z, t] of this.loot) entry(x, z).loot.push([(x & 15) + (z & 15) * 16 + y * 256, t]);
      for (const e of byChunk.values()) e.cells = Int32Array.from(e.cells);
      this.m = null;
      return byChunk;
    }
  }

  // local builder: (lx, lz) in [0,w) x [0,d), front at lz = 0 facing -z; rotated by r quarter turns
  function local(cv, ox, oy, oz, w, d, r) {
    const tf = (lx, lz) => {
      let x = lx, z = lz, W = w, D = d;
      for (let i = 0; i < r; i++) { const nx = D - 1 - z, nz = x; x = nx; z = nz; const t = W; W = D; D = t; }
      return [ox + x, oz + z];
    };
    const L = {
      w, d, r,
      tf,
      put(lx, ly, lz, id) { const [x, z] = tf(lx, lz); cv.put(x, oy + ly, z, MC.rotateBlock(id, r)); },
      box(x0, y0, z0, x1, y1, z1, id) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) L.put(x, y, z, id); },
      spawner(lx, ly, lz, type) { const [x, z] = tf(lx, lz); cv.put(x, oy + ly, z, MC.BLOCK.spawner); cv.spawners.push([x, oy + ly, z, type]); },
      chest(lx, ly, lz, facing, table) { const [x, z] = tf(lx, lz); cv.put(x, oy + ly, z, MC.rotateBlock(MC.BLOCK.chest + facing, r)); if (table) cv.loot.push([x, oy + ly, z, table]); },
      world(lx, ly, lz) { const [x, z] = tf(lx, lz); return [x, oy + ly, z]; },
    };
    return L;
  }

  // ---------------------------------------------------------------- styles
  const STYLES = {
    plains: { log: 'oak_log', wall: 'oak_planks', floor: 'oak_planks', stairs: 'oak_stairs', slab: 'oak_slab', fence: 'oak_fence', found: 'cobblestone', flat: false },
    taiga: { log: 'spruce_log', wall: 'spruce_planks', floor: 'spruce_planks', stairs: 'spruce_stairs', slab: 'spruce_slab', fence: 'spruce_fence', found: 'cobblestone', flat: false },
    desert: { log: 'sandstone', wall: 'sandstone', floor: 'smooth_stone', stairs: 'sandstone_stairs', slab: 'sandstone_slab', fence: 'oak_fence', found: 'sandstone', flat: true },
  };
  const S = (st) => { const o = {}; for (const k in st) o[k] = typeof st[k] === 'string' ? MC.BLOCK[st[k]] : st[k]; return o; };

  // ---------------------------------------------------------------- village buildings (local coords)
  function roof(L, P, wallH) {
    const w = L.w, d = L.d;
    if (P.flat) {
      L.box(-1, wallH + 1, -1, w, wallH + 1, d, P.slab);
      L.box(0, wallH + 1, 0, w - 1, wallH + 1, d - 1, P.wall);
      for (let x = 0; x < w; x += 2) { L.put(x, wallH + 2, 0, P.slab); L.put(x, wallH + 2, d - 1, P.slab); }
      return wallH + 2;
    }
    let top = wallH + 1;
    for (let k = 0; ; k++) {
      const zf = -1 + k, zb = d - k, y = wallH + 1 + k;
      if (zf > zb) break;
      top = y;
      if (zf === zb) { for (let x = -1; x <= w; x++) L.put(x, y, zf, P.slab); break; }
      for (let x = -1; x <= w; x++) { L.put(x, y, zf, P.stairs + 0); L.put(x, y, zb, P.stairs + 2); }
      for (let z = zf + 1; z < zb; z++) { L.put(0, y, z, P.wall); L.put(w - 1, y, z, P.wall); }
    }
    return top;
  }
  function shell(L, P, wallH, o = {}) {
    const w = L.w, d = L.d, M = MC.BLOCK;
    L.box(0, 0, 0, w - 1, 0, d - 1, o.floor || P.floor);
    for (let y = 1; y <= wallH; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      if (!edge) continue;
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      L.put(x, y, z, corner ? (o.corner || P.log) : (y === 1 && o.base ? o.base : (o.wall || P.wall)));
    }
    // windows
    const win = M.glass_pane;
    const mz = Math.floor(d / 2), mx = Math.floor(w / 2);
    for (const wy of o.winY || [2]) {
      L.put(0, wy, mz, win); L.put(w - 1, wy, mz, win);
      if (d >= 7) { L.put(0, wy, mz - 2, win); L.put(w - 1, wy, mz - 2, win); L.put(0, wy, mz + 2, win); L.put(w - 1, wy, mz + 2, win); }
      L.put(mx, wy, d - 1, win);
      if (w >= 7) { L.put(1, wy, 0, win); L.put(w - 2, wy, 0, win); L.put(mx - 2, wy, d - 1, win); L.put(mx + 2, wy, d - 1, win); }
    }
    // door
    L.put(mx, 1, 0, MC.doorId(2, 0, 0)); L.put(mx, 2, 0, MC.doorId(2, 1, 0));
    if (o.noBeam) return;
    // ceiling beam + hanging lantern
    if (!P.flat) for (let x = 1; x < w - 1; x++) L.put(x, wallH, mz, P.log);
    L.put(mx, P.flat ? wallH : wallH - 1, mz, M.hanging_lantern);
  }
  const BUILD = {
    house(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d, wallH = 4;
      shell(L, P, wallH, { base: P.found });
      meta.top = roof(L, P, wallH);
      L.put(1, 1, d - 3, MC.bedId(0, 0)); L.put(1, 1, d - 2, MC.bedId(0, 1));
      L.put(w - 2, 1, d - 2, M.crafting_table);
      L.chest(w - 2, 1, 1, 1, 'village');
      if (w >= 7) { L.put(w - 2, 1, 2, M.bookshelf); L.put(1, 1, 1, M.furnace + 3); }
      meta.spots.push([Math.floor(w / 2), 1, Math.floor(d / 2)]);
    },
    small(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d, wallH = 3;
      shell(L, P, wallH);
      meta.top = roof(L, P, wallH);
      L.put(1, 1, 2, MC.bedId(0, 0)); L.put(1, 1, 3, MC.bedId(0, 1));
      L.put(3, 1, 3, M.crafting_table);
      meta.spots.push([2, 1, 2]);
    },
    library(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d, wallH = 5;
      shell(L, P, wallH, { winY: [3], base: P.found });
      meta.top = roof(L, P, wallH);
      for (let x = 1; x < w - 1; x++) for (let y = 1; y <= 3; y++) L.put(x, y, d - 2, M.bookshelf);
      for (let z = 2; z < d - 2; z++) for (let y = 1; y <= 2; y++) { L.put(1, y, z, M.bookshelf); L.put(w - 2, y, z, M.bookshelf); }
      L.put(Math.floor(w / 2) - 1, 1, 3, M.crafting_table);
      L.chest(Math.floor(w / 2) + 1, 1, 3, 2, 'library');
      L.put(2, wallH - 1, 2, M.hanging_lantern);
      meta.spots.push([Math.floor(w / 2), 1, 2]);
      meta.prof = 'librarian';
    },
    smith(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d, wallH = 4;
      const C = { ...P, wall: M.cobblestone, floor: M.cobblestone, log: M.stone_bricks };
      shell(L, C, wallH, { winY: [2] });
      meta.top = roof(L, { ...P, stairs: M.cobblestone_stairs, slab: M.cobblestone_slab, wall: M.cobblestone, flat: P.flat }, wallH);
      // open forge corner
      for (let y = 1; y <= 3; y++) for (let x = 1; x < 4; x++) L.put(x, y, 0, 0);
      L.put(0, 1, 0, C.log); L.put(0, 2, 0, M.oak_fence); L.put(0, 3, 0, M.oak_fence); L.put(4, 1, 0, C.log);
      L.put(1, 0, 2, M.lava); L.put(2, 0, 2, M.lava); L.put(1, 1, 2, M.iron_bars); L.put(2, 1, 2, M.iron_bars);
      L.put(1, 1, d - 2, M.furnace + 2); L.put(2, 1, d - 2, M.furnace + 2);
      L.chest(w - 2, 1, d - 2, 2, 'blacksmith');
      L.put(w - 2, 1, 1, M.crafting_table);
      L.put(w - 3, 1, d - 2, M.iron_block);
      meta.spots.push([Math.floor(w / 2), 1, 2]);
      meta.prof = 'smith';
    },
    tower(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d, wallH = 11;
      shell(L, P, wallH, { wall: M.cobblestone, corner: M.stone_bricks, floor: M.cobblestone, winY: [4, 8], noBeam: true });
      for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) L.put(x, wallH + 1, z, M.cobblestone_slab);
      for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if ((x === 0 || z === 0 || x === w - 1 || z === d - 1) && (x + z) % 2 === 0) L.put(x, wallH + 2, z, M.cobblestone);
      for (let y = 1; y <= wallH + 1; y++) L.put(2, y, 3, M.ladder + 0);
      L.put(1, wallH + 2, 1, M.lantern);
      L.put(1, 5, 1, M.torch);
      meta.top = wallH + 3;
      meta.spots.push([1, 1, 1]);
      meta.prof = 'cleric';
    },
    farm(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d;
      for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
        const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
        if (edge) { L.put(x, 0, z, P.log); continue; }
        if (z === Math.floor(d / 2)) { L.put(x, 0, z, M.water); continue; }
        L.put(x, 0, z, M.farmland);
        const st = Math.floor(rnd() * 4.6);
        L.put(x, 1, z, st >= 4 ? 0 : M['wheat_' + Math.min(3, st)]);
      }
      meta.top = 2;
      meta.spots.push([-1, 1, 1]);
      meta.prof = 'farmer';
      meta.noClearAbove = false;
    },
    pen(L, P, rnd, meta) {
      const M = MC.BLOCK, w = L.w, d = L.d;
      for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
        L.put(x, 0, z, M.grass);
        if (x === 0 || z === 0 || x === w - 1 || z === d - 1) L.put(x, 1, z, P.fence);
      }
      L.put(Math.floor(w / 2), 1, 0, 0);
      L.put(w - 2, 1, d - 2, M.hay_bale);
      L.put(1, 1, d - 2, M.hay_bale); L.put(1, 2, d - 2, M.hay_bale);
      meta.top = 2;
      const kinds = ['pig', 'cow', 'sheep', 'chicken'];
      const kind = kinds[Math.floor(rnd() * 4)];
      for (let i = 0; i < 3; i++) meta.animals.push([2 + i, 1, 3, kind]);
      meta.spots.push([Math.floor(w / 2), 1, -1]);
      meta.prof = kind === 'sheep' ? 'shepherd' : 'butcher';
    },
  };
  const TYPES = [
    ['house', 7, 6, 30], ['small', 5, 5, 22], ['farm', 9, 7, 16], ['library', 9, 7, 7], ['smith', 9, 7, 7],
    ['tower', 5, 5, 4], ['pen', 9, 9, 8], ['farm', 13, 9, 6],
  ];

  // ---------------------------------------------------------------- terrain helpers
  const hAt = (gen, x, z) => Math.floor(gen.height(x, z));
  // foundation + clearing for a rectangle at floor level fy
  function prepare(gen, cv, x0, z0, x1, z1, fy, top, found) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const th = hAt(gen, x, z);
      for (let y = Math.min(th, fy - 1); y < fy; y++) cv.put(x, y, z, found);
      for (let y = fy + 1; y <= Math.max(th + 2, top + 1); y++) cv.put(x, y, z, 0);
    }
  }

  // ---------------------------------------------------------------- village
  const Str = MC.Structures = {
    VCELL, DCELL, Canvas,
    _sites: new Map(),
    _plans: new Map(),

    villageSite(gen, gx, gz) {
      const k = 'v' + gx + ',' + gz;
      if (this._sites.has(k)) return this._sites.get(k);
      let site = null;
      const seed = gen.seed;
      if (MC.hash2(gx, gz, seed + 1234) < 0.62) {
        const x = gx * VCELL + 56 + Math.floor(MC.hash2(gx, gz, seed + 1235) * (VCELL - 112));
        const z = gz * VCELL + 56 + Math.floor(MC.hash2(gx, gz, seed + 1236) * (VCELL - 112));
        const info = gen.columnInfo(x, z);
        const BI = MC.BIOME;
        const okBiome = [BI.PLAINS, BI.DESERT, BI.SNOWY, BI.TAIGA, BI.FOREST, BI.BIRCH].includes(info.biome);
        if (okBiome && info.h >= MC.SEA + 2 && info.h <= MC.SEA + 26) {
          let flat = true, water = 0;
          for (let a = 0; a < 10 && flat; a++) {
            const ang = a / 10 * Math.PI * 2;
            for (const rr of [14, 28]) {
              const h = hAt(gen, x + Math.round(Math.cos(ang) * rr), z + Math.round(Math.sin(ang) * rr));
              if (Math.abs(h - info.h) > (rr > 20 ? 9 : 5)) flat = false;
              if (h < MC.SEA) water++;
            }
          }
          if (flat && water < 5) {
            const style = info.biome === BI.DESERT ? 'desert' : (info.biome === BI.SNOWY || info.biome === BI.TAIGA) ? 'taiga' : 'plains';
            site = { type: 'village', gx, gz, x, z, h: info.h, style, r: 52, id: 'v' + gx + ',' + gz };
          }
        }
      }
      this._sites.set(k, site);
      return site;
    },

    villagePlan(gen, site) {
      if (this._plans.has(site.id)) return this._plans.get(site.id);
      const M = MC.BLOCK;
      const rnd = MC.mulberry32((site.gx * 73856093) ^ (site.gz * 19349663) ^ (gen.seed + 4242));
      const P = S(STYLES[site.style]);
      const cv = new Canvas(site.x, site.z);
      const rects = [];   // occupied [x0,z0,x1,z1]
      const free = (x0, z0, x1, z1) => rects.every((r) => x1 < r[0] - 1 || x0 > r[2] + 1 || z1 < r[1] - 1 || z0 > r[3] + 1);
      const plan = { id: site.id, type: 'village', x: site.x, z: site.z, r: 30, villagers: [], animals: [], houses: 0 };
      const cx = site.x, cz = site.z, cy = site.h;
      // well
      rects.push([cx - 3, cz - 3, cx + 2, cz + 2]);
      // roads
      const dirs = [0, 1, 2, 3].sort(() => rnd() - 0.5).slice(0, 3 + (rnd() < 0.55 ? 1 : 0));
      const roads = [];
      for (const dr of dirs) {
        const u = MC.DIRS[dr], len = 22 + Math.floor(rnd() * 20);
        roads.push({ dr, u, len });
        const v = MC.DIRS[(dr + 1) & 3];
        const ax = cx + u[0] * 3, az = cz + u[2] * 3, bx = cx + u[0] * len, bz = cz + u[2] * len;
        const px = Math.abs(v[0]), pz = Math.abs(v[2]);
        rects.push([Math.min(ax, bx) - px, Math.min(az, bz) - pz, Math.max(ax, bx) + px, Math.max(az, bz) + pz]);
      }
      // spawn point for new worlds: just past the end of the longest road
      {
        const rd = roads.reduce((a, b) => (b.len > a.len ? b : a));
        plan.spawn = [cx + rd.u[0] * (rd.len + 3), cz + rd.u[2] * (rd.len + 3)];
      }
      const buildings = [];
      let towers = 0;
      for (const rd of roads) {
        const { dr, u, len } = rd;
        let t = 6;
        let side = rnd() < 0.5 ? 1 : -1;
        while (t < len - 2) {
          // pick a type
          let tot = 0;
          for (const ty of TYPES) tot += ty[3];
          let pick = rnd() * tot, T = TYPES[0];
          for (const ty of TYPES) { pick -= ty[3]; if (pick <= 0) { T = ty; break; } }
          if (T[0] === 'tower' && towers >= 1) T = TYPES[0];
          const [kind, w, d] = T;
          const v = MC.DIRS[side > 0 ? (dr + 1) & 3 : (dr + 3) & 3];
          const F = (side > 0 ? (dr + 3) & 3 : (dr + 1) & 3);  // front faces the road
          const rot = (F - 2 + 4) & 3;
          const a0 = t, a1 = t + w - 1, p0 = 3, p1 = 3 + d - 1;
          const pts = [[a0, p0], [a1, p0], [a0, p1], [a1, p1]].map(([a, p]) => [cx + u[0] * a + v[0] * p, cz + u[2] * a + v[2] * p]);
          const x0 = Math.min(...pts.map((q) => q[0])), x1 = Math.max(...pts.map((q) => q[0]));
          const z0 = Math.min(...pts.map((q) => q[1])), z1 = Math.max(...pts.map((q) => q[1]));
          if (free(x0, z0, x1, z1)) {
            // floor height: median of samples, reject steep spots
            const hs = [hAt(gen, (x0 + x1) >> 1, (z0 + z1) >> 1), hAt(gen, x0, z0), hAt(gen, x1, z0), hAt(gen, x0, z1), hAt(gen, x1, z1)];
            const sorted = hs.slice().sort((a, b) => a - b);
            const fy = sorted[2];
            if (sorted[4] - sorted[0] <= 6 && fy >= MC.SEA - 1) {
              rects.push([x0, z0, x1, z1]);
              buildings.push({ kind, w, d, rot, x0, z0, x1, z1, fy });
              if (kind === 'tower') towers++;
              t += w + 2;
              side = -side;
              continue;
            }
          }
          t += 2;
          side = -side;
        }
      }
      // --- paths (drawn first; buildings override)
      for (const { dr, u, len } of roads) {
        const v = MC.DIRS[(dr + 1) & 3];
        for (let a = 2; a <= len; a++) for (let p = -1; p <= 1; p++) {
          const x = cx + u[0] * a + v[0] * p, z = cz + u[2] * a + v[2] * p;
          const th = hAt(gen, x, z);
          if (th < MC.SEA - 1) { cv.put(x, MC.SEA - 1, z, P.wall === M.sandstone ? M.sandstone_slab : P.slab); for (let y = MC.SEA; y < MC.SEA + 3; y++) cv.put(x, y, z, 0); continue; }
          cv.put(x, th, z, M.dirt_path);
          for (let y = th + 1; y < th + 4; y++) cv.put(x, y, z, 0);
        }
        // lamp posts
        for (let a = 9; a <= len; a += 11) {
          const p = (a % 22 < 11) ? 2 : -2;
          const x = cx + u[0] * a + v[0] * p, z = cz + u[2] * a + v[2] * p;
          if (!free(x, z, x, z)) continue;
          const th = hAt(gen, x, z);
          if (th < MC.SEA) continue;
          cv.put(x, th, z, P.found); cv.put(x, th + 1, z, P.fence); cv.put(x, th + 2, z, P.fence); cv.put(x, th + 3, z, M.lantern);
        }
      }
      // --- well
      {
        const L = local(cv, cx - 3, cy, cz - 3, 6, 6, 0);
        prepare(gen, cv, cx - 3, cz - 3, cx + 2, cz + 2, cy, cy + 5, P.found);
        for (let z = 0; z < 6; z++) for (let x = 0; x < 6; x++) {
          const ring = x === 0 || z === 0 || x === 5 || z === 5;
          if (ring) { L.put(x, 0, z, M.dirt_path); continue; }
          const inner = x >= 2 && x <= 3 && z >= 2 && z <= 3;
          for (let y = -4; y <= 0; y++) L.put(x, y, z, inner && y > -4 ? M.water : M.cobblestone);
          if (!inner) L.put(x, 1, z, M.cobblestone);
        }
        for (const [x, z] of [[1, 1], [4, 1], [1, 4], [4, 4]]) { L.put(x, 2, z, P.fence); L.put(x, 3, z, P.fence); }
        for (let z = 1; z <= 4; z++) for (let x = 1; x <= 4; x++) L.put(x, 4, z, M.cobblestone_slab);
        L.put(2, 4, 2, M.cobblestone); L.put(3, 4, 3, M.cobblestone); L.put(2, 4, 3, M.cobblestone); L.put(3, 4, 2, M.cobblestone);
        L.put(2, 3, 2, M.hanging_lantern);
        plan.villagers.push({ x: cx + 3.5, y: cy + 1, z: cz + 0.5, prof: null });
      }
      // --- buildings
      const profs = ['farmer', 'butcher', 'shepherd', 'fletcher', 'librarian', 'cleric', 'smith'];
      for (const bd of buildings) {
        const meta = { spots: [], animals: [], top: 6, prof: null };
        const L = local(cv, bd.x0, bd.fy, bd.z0, bd.w, bd.d, bd.rot);
        const clearTop = bd.fy + (bd.kind === 'tower' ? 16 : bd.kind === 'farm' || bd.kind === 'pen' ? 3 : 4 + Math.ceil(bd.d / 2) + 2);
        // footprint incl. overhang and step row
        const ext = [];
        for (const [lx, lz] of [[-1, -2], [bd.w, -2], [-1, bd.d], [bd.w, bd.d]]) ext.push(L.tf(lx, lz));
        const ex0 = Math.min(...ext.map((q) => q[0])), ex1 = Math.max(...ext.map((q) => q[0]));
        const ez0 = Math.min(...ext.map((q) => q[1])), ez1 = Math.max(...ext.map((q) => q[1]));
        prepare(gen, cv, ex0, ez0, ex1, ez1, bd.fy, clearTop, bd.kind === 'pen' || bd.kind === 'farm' ? M.dirt : P.found);
        // grass around (the prepared rim), path at the step
        for (let z = ez0; z <= ez1; z++) for (let x = ex0; x <= ex1; x++) if (cv.get(x, bd.fy, z) === undefined) cv.put(x, bd.fy, z, site.style === 'desert' ? M.sand : M.grass);
        BUILD[bd.kind](L, P, rnd, meta);
        if (bd.kind !== 'farm' && bd.kind !== 'pen') { L.put(Math.floor(bd.w / 2), 0, -1, M.dirt_path); L.put(Math.floor(bd.w / 2), 0, -2, M.dirt_path); }
        for (const s of meta.spots) {
          const [x, y, z] = L.world(s[0], s[1], s[2]);
          plan.villagers.push({ x: x + 0.5, y, z: z + 0.5, prof: meta.prof || profs[Math.floor(rnd() * 4)] });
        }
        for (const a of meta.animals) { const [x, y, z] = L.world(a[0], a[1], a[2]); plan.animals.push({ x: x + 0.5, y, z: z + 0.5, type: a[3] }); }
        plan.houses++;
      }
      let rMax = 20;
      for (const r of rects) rMax = Math.max(rMax, Math.abs(r[0] - cx), Math.abs(r[2] - cx), Math.abs(r[1] - cz), Math.abs(r[3] - cz));
      plan.r = rMax + 4;
      plan.byChunk = cv.finalize();
      this._cachePlan(plan);
      return plan;
    },

    // ---------------------------------------------------------------- dungeon
    dungeonSite(gen, gx, gz) {
      const k = 'd' + gx + ',' + gz;
      if (this._sites.has(k)) return this._sites.get(k);
      let site = null;
      const seed = gen.seed;
      if (MC.hash2(gx, gz, seed + 777) < 0.75) {
        const x = gx * DCELL + 40 + Math.floor(MC.hash2(gx, gz, seed + 778) * (DCELL - 80));
        const z = gz * DCELL + 40 + Math.floor(MC.hash2(gx, gz, seed + 779) * (DCELL - 80));
        const info = gen.columnInfo(x, z);
        if (info.h >= MC.SEA + 1 && info.h <= MC.SEA + 40) {
          let nearVillage = false;
          const vgx = Math.floor(x / VCELL), vgz = Math.floor(z / VCELL);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const v = this.villageSite(gen, vgx + a, vgz + b);
            if (v && Math.hypot(v.x - x, v.z - z) < 90) nearVillage = true;
          }
          if (this.castleNear && this.castleNear(gen, x, z, 110)) nearVillage = true;
          if (this.wajoNear && this.wajoNear(gen, x, z, 40)) nearVillage = true;
          if (!nearVillage) {
            const y0 = MC.clamp(info.h - 30, 12, 34);
            site = { type: 'dungeon', gx, gz, x, z, h: info.h, y0, id: 'd' + gx + ',' + gz, r: 8 };
          }
        }
      }
      this._sites.set(k, site);
      return site;
    },

    dungeonPlan(gen, site) {
      if (this._plans.has(site.id)) return this._plans.get(site.id);
      const M = MC.BLOCK;
      const rnd = MC.mulberry32((site.gx * 83492791) ^ (site.gz * 2971215073) ^ (gen.seed + 99));
      const cv = new Canvas(site.x, site.z);
      const GW = 4 + Math.floor(rnd() * 2), GD = 4 + Math.floor(rnd() * 2), CS = 13;
      const ei = Math.floor(rnd() * GW), ej = Math.floor(rnd() * GD);
      const gx0 = site.x - (ei * CS + 6), gz0 = site.z - (ej * CS + 6);
      const y0 = site.y0;
      const brick = () => { const r = rnd(); return r < 0.18 ? M.mossy_stone_bricks : r < 0.3 ? M.cracked_stone_bricks : M.stone_bricks; };
      // maze over the room grid
      const idx = (i, j) => j * GW + i;
      const links = new Set();
      const seen = new Uint8Array(GW * GD);
      const depth = new Int32Array(GW * GD);
      const stack = [[ei, ej]];
      seen[idx(ei, ej)] = 1;
      while (stack.length) {
        const [i, j] = stack[stack.length - 1];
        const nb = [];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni >= 0 && nj >= 0 && ni < GW && nj < GD && !seen[idx(ni, nj)]) nb.push([ni, nj]);
        }
        if (!nb.length) { stack.pop(); continue; }
        const [ni, nj] = nb[Math.floor(rnd() * nb.length)];
        seen[idx(ni, nj)] = 1;
        depth[idx(ni, nj)] = depth[idx(i, j)] + 1;
        links.add(Math.min(idx(i, j), idx(ni, nj)) + ':' + Math.max(idx(i, j), idx(ni, nj)));
        stack.push([ni, nj]);
      }
      for (let k = 0; k < GW * GD * 0.25; k++) {
        const i = Math.floor(rnd() * (GW - 1)), j = Math.floor(rnd() * GD);
        if (rnd() < 0.5) links.add(idx(i, j) + ':' + idx(i + 1, j));
        else if (j < GD - 1) links.add(idx(i, j) + ':' + idx(i, j + 1));
      }
      let boss = 0;
      for (let k = 0; k < GW * GD; k++) if (depth[k] > depth[boss]) boss = k;
      // rooms
      const rooms = [];
      const types = ['spawner', 'spawner', 'treasure', 'library', 'prison', 'flooded', 'lava', 'crypt', 'spawner', 'empty'];
      for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
        const k = idx(i, j);
        const isBoss = k === boss, isEntry = i === ei && j === ej;
        const sz = isBoss ? 11 : isEntry ? 9 : 5 + 2 * Math.floor(rnd() * 3);
        const hgt = isBoss ? 7 : 4 + Math.floor(rnd() * 2);
        const cxr = gx0 + i * CS + 6, czr = gz0 + j * CS + 6;
        rooms.push({ i, j, k, cx: cxr, cz: czr, half: (sz - 1) / 2, h: hgt, type: isBoss ? 'boss' : isEntry ? 'entry' : types[Math.floor(rnd() * types.length)] });
      }
      // carve a room / corridor shell: walls, floor, ceiling and air inside
      // carve a room: air inside, brick shell (never walls over air carved earlier)
      const carve = (x0, z0, x1, z1, h) => {
        for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
          const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
          for (let y = y0; y <= y0 + h + 1; y++) {
            if (inside && y > y0 && y <= y0 + h) cv.put(x, y, z, 0);
            else if (cv.get(x, y, z) !== 0) cv.put(x, y, z, brick());
          }
        }
      };
      for (const r of rooms) carve(r.cx - r.half, r.cz - r.half, r.cx + r.half, r.cz + r.half, r.h);
      // corridors (3 wide, 3 high)
      for (const l of links) {
        const [a, b] = l.split(':').map(Number);
        const A = rooms[a], Bm = rooms[b];
        if (A.j === Bm.j) { // along x
          const [L, R] = A.cx < Bm.cx ? [A, Bm] : [Bm, A];
          corridor(cv, L.cx + L.half, L.cz, R.cx - R.half, L.cz, y0, brick, rnd);
        } else {
          const [T, D] = A.cz < Bm.cz ? [A, Bm] : [Bm, A];
          corridor(cv, T.cx, T.cz + T.half, T.cx, D.cz - D.half, y0, brick, rnd);
        }
      }
      // room contents
      let bossPos = null;
      const mobs = ['zombie', 'zombie', 'skeleton', 'skeleton', 'spider'];
      const mob = () => mobs[Math.floor(rnd() * mobs.length)];
      for (const r of rooms) {
        const x0 = r.cx - r.half, x1 = r.cx + r.half, z0 = r.cz - r.half, z1 = r.cz + r.half, fy = y0 + 1;
        const chestAt = (x, z, f, table) => { cv.put(x, fy, z, M.chest + f); cv.loot.push([x, fy, z, table]); };
        const spawnerAt = (x, y, z, t) => { cv.put(x, y, z, M.spawner); cv.spawners.push([x, y, z, t]); };
        // cobwebs in upper corners
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (rnd() < 0.5) cv.put(x, y0 + r.h, z, M.cobweb);
        switch (r.type) {
          case 'spawner':
            spawnerAt(r.cx, fy, r.cz, mob());
            if (rnd() < 0.6) chestAt(x0, r.cz, 3, 'dungeon');
            break;
          case 'treasure':
            spawnerAt(r.cx, fy, r.cz, mob());
            chestAt(x0, r.cz, 3, 'dungeon'); chestAt(x1, r.cz, 1, 'dungeon');
            cv.put(r.cx, y0 + r.h, r.cz, M.hanging_lantern);
            break;
          case 'library':
            for (let x = x0; x <= x1; x++) for (let y = fy; y < fy + 3 && y <= y0 + r.h; y++) { cv.put(x, y, z0, M.bookshelf); cv.put(x, y, z1, M.bookshelf); }
            chestAt(r.cx, r.cz, 0, 'library');
            cv.put(r.cx, y0 + r.h, r.cz + 1, M.hanging_lantern);
            if (rnd() < 0.5) spawnerAt(x0, fy, r.cz, 'skeleton');
            break;
          case 'prison':
            for (let x = x0; x <= x1; x++) for (let y = fy; y <= y0 + r.h; y++) cv.put(x, y, z0 + 1, (x - x0) % 3 === 1 && y === fy ? 0 : M.iron_bars);
            for (let x = x0; x <= x1; x += 3) for (let y = fy; y <= y0 + r.h; y++) cv.put(x, y, z0, M.stone_bricks);
            spawnerAt(r.cx, fy, r.cz + 1, 'skeleton');
            if (rnd() < 0.5) chestAt(x0 + 1, z0, 0, 'dungeon');
            break;
          case 'flooded':
            for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1; x < x1; x++) { cv.put(x, y0, z, M.water); cv.put(x, y0 - 1, z, brick()); }
            if (rnd() < 0.7) chestAt(r.cx, r.cz, 0, 'dungeon');
            spawnerAt(x0, fy, z0, 'zombie');
            break;
          case 'lava':
            for (let z = r.cz - 1; z <= r.cz + 1; z++) for (let x = r.cx - 1; x <= r.cx + 1; x++) { cv.put(x, y0, z, M.lava); cv.put(x, y0 - 1, z, brick()); }
            for (let z = r.cz - 2; z <= r.cz + 2; z++) for (let x = r.cx - 2; x <= r.cx + 2; x++) if (Math.abs(x - r.cx) === 2 || Math.abs(z - r.cz) === 2) cv.put(x, fy, z, M.stone_brick_slab);
            chestAt(x0, z0, 0, 'dungeon');
            break;
          case 'crypt':
            for (let x = x0 + 1; x < x1; x += 2) { cv.put(x, fy, z0 + 1, M.stone_brick_slab); cv.put(x, fy, z1 - 1, M.stone_brick_slab); }
            spawnerAt(r.cx, fy, r.cz, 'zombie');
            break;
          case 'entry':
            cv.put(x0, y0 + r.h, z0, M.hanging_lantern); cv.put(x1, y0 + r.h, z1, M.hanging_lantern);
            break;
          case 'boss': {
            for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
              for (let y = fy; y <= y0 + r.h; y++) cv.put(x, y, z, M.chiseled_stone_bricks);
            }
            spawnerAt(x0 + 2, fy, z0 + 2, 'skeleton'); spawnerAt(x1 - 2, fy, z1 - 2, 'zombie');
            spawnerAt(x0 + 2, fy, z1 - 2, 'spider'); spawnerAt(x1 - 2, fy, z0 + 2, 'zombie');
            for (let z = r.cz - 2; z <= r.cz + 2; z++) for (let x = r.cx - 2; x <= r.cx + 2; x++) cv.put(x, fy, z, M.stone_bricks);
            for (let z = r.cz - 2; z <= r.cz + 2; z++) for (let x = r.cx - 2; x <= r.cx + 2; x++) if (Math.abs(x - r.cx) === 2 || Math.abs(z - r.cz) === 2) cv.put(x, fy + 1, z, M.stone_brick_slab);
            cv.put(r.cx, fy + 1, r.cz, M.chest + 2); cv.loot.push([r.cx, fy + 1, r.cz, 'treasure']);
            cv.put(r.cx - 1, fy + 1, r.cz, M.gold_block); cv.put(r.cx + 1, fy + 1, r.cz, M.gold_block);
            cv.put(r.cx, y0 + r.h, r.cz, M.hanging_lantern);
            cv.put(r.cx - 3, y0 + r.h, r.cz - 3, M.hanging_lantern); cv.put(r.cx + 3, y0 + r.h, r.cz + 3, M.hanging_lantern);
            bossPos = [r.cx + 0.5, fy, r.cz + 3.5];
            break;
          }
        }
      }
      // spiral staircase from the entry room up to the surface + ruin
      const entry = rooms[idx(ei, ej)];
      const sx = entry.cx, sz = entry.cz;
      const surf = site.h;
      const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
      const topY = surf + 1;
      // shaft walls and interior air
      for (let y = y0 + entry.h + 1; y <= surf + 3; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        if (edge) { if (y <= surf) cv.put(sx + dx, y, sz + dz, brick()); }
        else if (dx === 0 && dz === 0) { if (y <= surf + 1) cv.put(sx, y, sz, M.stone_bricks); }
        else cv.put(sx + dx, y, sz + dz, 0);
      }
      for (let y = y0 + 1; y <= y0 + entry.h; y++) cv.put(sx, y, sz, M.stone_bricks);
      const steps = topY - (y0 + 1);
      for (let s = 0; s < steps; s++) {
        const [dx, dz] = ring[s % 8];
        const [px, pz] = ring[(s + 7) % 8];
        const up = [px - dx, pz - dz];
        const f = MC.DIRS.findIndex((d) => d[0] === up[0] && d[2] === up[1]);
        const y = topY - 1 - s;
        cv.put(sx + dx, y, sz + dz, MC.BLOCK.stone_brick_stairs + (f < 0 ? 0 : f));
        if (y > y0 + entry.h) cv.put(sx + dx, y - 1, sz + dz, brick());
      }
      // surface ruin around the shaft top
      for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
        const x = sx + dx, z = sz + dz;
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) continue;
        const th = hAt(gen, x, z);
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        for (let y = Math.min(th, surf) - 1; y <= surf; y++) cv.put(x, y, z, y === surf ? (rnd() < 0.2 ? M.mossy_cobblestone : brick()) : M.cobblestone);
        for (let y = surf + 1; y <= Math.max(th + 1, surf + 4); y++) cv.put(x, y, z, 0);
        if (d === 5) {
          const wallH = (Math.abs(dx) === 5 && Math.abs(dz) === 5) ? 4 : Math.floor(rnd() * 3.2);
          for (let y = 1; y <= wallH; y++) cv.put(x, surf + y, z, brick());
        }
      }
      for (const [dx, dz] of [[-2, -3], [2, 3], [3, -2], [-3, 2]]) cv.put(sx + dx, surf + 1, sz + dz, M.cobweb);
      cv.put(sx - 4, surf + 1, sz - 4, M.lantern); cv.put(sx + 4, surf + 1, sz + 4, M.lantern);
      // stairs opening at the surface: remove the wall ring above ground
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
        cv.put(sx + dx, surf, sz + dz, brick());
        if ((dx === 2 && dz === 0) || (dx === -2 && dz === 0)) cv.put(sx + dx, surf + 1, sz + dz, M.chiseled_stone_bricks);
      }
      const plan = { id: site.id, type: 'dungeon', x: site.x, z: site.z, y0, r: Math.max(GW, GD) * CS, entry: [sx, surf + 1, sz], boss: bossPos,
        bounds: [gx0 - 2, gz0 - 2, gx0 + GW * CS + 2, gz0 + GD * CS + 2] };
      plan.byChunk = cv.finalize();
      this._cachePlan(plan);
      return plan;
    },

    _cachePlan(plan) {
      this._plans.set(plan.id, plan);
      if (this._plans.size > 24) this._plans.delete(this._plans.keys().next().value);
    },

    // ---------------------------------------------------------------- queries
    _cellsAround(x, z, cell, pad) {
      const out = [];
      for (let gz = Math.floor((z - pad) / cell); gz <= Math.floor((z + pad) / cell); gz++)
        for (let gx = Math.floor((x - pad) / cell); gx <= Math.floor((x + pad) / cell); gx++) out.push([gx, gz]);
      return out;
    },
    blocksTree(gen, x, z) {
      for (const [gx, gz] of this._cellsAround(x, z, VCELL, 90)) {
        const s = this.villageSite(gen, gx, gz);
        if (s && Math.abs(s.x - x) < 75 && Math.abs(s.z - z) < 75) {
          const p = this.villagePlan(gen, s);
          if (Math.abs(x - s.x) <= p.r + 3 && Math.abs(z - s.z) <= p.r + 3) return true;
        }
      }
      for (const [gx, gz] of this._cellsAround(x, z, DCELL, 12)) {
        const s = this.dungeonSite(gen, gx, gz);
        if (s && Math.abs(s.x - x) < 9 && Math.abs(s.z - z) < 9) return true;
      }
      if (this.castleNear && this.castleNear(gen, x, z, 0, 4)) return true;
      if (this.wajoNear && this.wajoNear(gen, x, z, 3)) return true;
      return false;
    },
    nearest(gen, kind, x, z, rad) {
      const cell = kind === 'village' ? VCELL : DCELL;
      let best = null, bd = Infinity;
      const gx0 = Math.floor(x / cell), gz0 = Math.floor(z / cell);
      for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) {
        const s = kind === 'village' ? this.villageSite(gen, gx, gz) : this.dungeonSite(gen, gx, gz);
        if (!s) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    villagesNear(gen, x, z, dist) {
      const out = [];
      for (const [gx, gz] of this._cellsAround(x, z, VCELL, dist)) {
        const s = this.villageSite(gen, gx, gz);
        if (s && Math.hypot(s.x - x, s.z - z) < dist) out.push(this.villagePlan(gen, s));
      }
      return out;
    },

    // ---------------------------------------------------------------- stamping
    stamp(gen, chunk, hs) {
      const x0 = chunk.cx * 16, z0 = chunk.cz * 16;
      const ck = MC.World.key(chunk.cx, chunk.cz);
      const apply = (plan) => {
        const e = plan.byChunk.get(ck);
        if (!e) return;
        const bl = chunk.blocks, cells = e.cells;
        for (let k = 0; k < cells.length; k++) {
          const v = cells[k], li = v & 0xffff, id = v >>> 16;
          if (bl[li] === MC.BLOCK.bedrock && (li >> 8) < 4) continue;
          bl[li] = id;
        }
        if (e.spawners.length) (chunk.spawners || (chunk.spawners = [])).push(...e.spawners);
        if (e.loot.length) { if (!chunk.loot) chunk.loot = new Map(); for (const [li, t] of e.loot) chunk.loot.set(li, t); }
      };
      for (const [gx, gz] of this._cellsAround(x0 + 8, z0 + 8, VCELL, 110)) {
        const s = this.villageSite(gen, gx, gz);
        if (s && Math.abs(s.x - x0 - 8) < 110 && Math.abs(s.z - z0 - 8) < 110) apply(this.villagePlan(gen, s));
      }
      for (const [gx, gz] of this._cellsAround(x0 + 8, z0 + 8, DCELL, 90)) {
        const s = this.dungeonSite(gen, gx, gz);
        if (s && Math.abs(s.x - x0 - 8) < 90 && Math.abs(s.z - z0 - 8) < 90) apply(this.dungeonPlan(gen, s));
      }
      const castles = this.castlesAround ? this.castlesAround(gen, x0 + 8, z0 + 8, 96) : [];
      for (const s of castles) apply(this.castlePlan(gen, s));
      const wajo = this.wajoAround ? this.wajoAround(gen, x0 + 8, z0 + 8, 16) : [];
      for (const s of wajo) apply(this.wajoPlan(gen, s));
      if (!castles.length && !wajo.length) this.monsterRoom(gen, chunk, hs);
    },

    // classic small cave dungeon fully inside one chunk
    monsterRoom(gen, chunk, hs) {
      const M = MC.BLOCK;
      const rnd = MC.mulberry32((chunk.cx * 341873128) ^ (chunk.cz * 132897987) ^ (gen.seed + 5));
      if (rnd() > 0.1) return;
      const lx = 2 + Math.floor(rnd() * 6), lz = 2 + Math.floor(rnd() * 6);
      const h = hs[(lz + 4) * 18 + lx + 4];
      const y = 12 + Math.floor(rnd() * Math.max(1, Math.min(34, h - 20)));
      if (y + 6 > h - 4) return;
      const bl = chunk.blocks;
      for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) for (let k = 0; k < 6; k++) {
        const li = (lx + x) + (lz + z) * 16 + (y + k) * 256;
        const wall = x === 0 || z === 0 || x === 6 || z === 6 || k === 0 || k === 5;
        if (wall) { if (MC.B_SOLID[bl[li]] || k === 0 || bl[li] === 0) bl[li] = k === 0 && rnd() < 0.6 ? M.mossy_cobblestone : M.cobblestone; }
        else bl[li] = 0;
      }
      const sli = (lx + 3) + (lz + 3) * 16 + (y + 1) * 256;
      bl[sli] = M.spawner;
      const types = ['zombie', 'zombie', 'skeleton', 'spider'];
      (chunk.spawners || (chunk.spawners = [])).push([sli, types[Math.floor(rnd() * 4)]]);
      const n = 1 + Math.floor(rnd() * 2);
      for (let c = 0; c < n; c++) {
        const side = Math.floor(rnd() * 4);
        const px = side === 0 ? 1 : side === 1 ? 5 : 1 + Math.floor(rnd() * 5);
        const pz = side === 2 ? 1 : side === 3 ? 5 : 1 + Math.floor(rnd() * 5);
        const li = (lx + px) + (lz + pz) * 16 + (y + 1) * 256;
        if (bl[li] !== 0) continue;
        bl[li] = M.chest + [3, 1, 0, 2][side];
        if (!chunk.loot) chunk.loot = new Map();
        chunk.loot.set(li, 'monster_room');
      }
    },
  };

  function corridor(cv, xa, za, xb, zb, y0, brick, rnd) {
    const M = MC.BLOCK;
    const alongX = za === zb;
    const a0 = alongX ? Math.min(xa, xb) : Math.min(za, zb), a1 = alongX ? Math.max(xa, xb) : Math.max(za, zb);
    for (let a = a0; a <= a1; a++) for (let p = -2; p <= 2; p++) for (let y = y0; y <= y0 + 4; y++) {
      const x = alongX ? a : xa + p, z = alongX ? za + p : a;
      const inside = Math.abs(p) <= 1 && y > y0 && y < y0 + 4;
      if (inside) cv.put(x, y, z, 0);
      else if (cv.get(x, y, z) !== 0) cv.put(x, y, z, brick());
    }
    // occasional cobwebs / wall torches
    for (let a = a0 + 1; a < a1; a += 1) {
      const x = alongX ? a : xa, z = alongX ? za : a;
      const r = rnd();
      if (r < 0.06) cv.put(alongX ? x : x + 1, y0 + 3, alongX ? z + 1 : z, M.cobweb);
      else if (r < 0.085) {
        // torch on the corridor's side wall (facing = towards that wall)
        if (alongX) cv.put(x, y0 + 2, z - 1, M.wall_torch + 2);
        else cv.put(x - 1, y0 + 2, z, M.wall_torch + 1);
      }
    }
  }

  MC.WorldGen.prototype.nearestVillage = function (x, z, rad) { return Str.nearest(this, 'village', x, z, rad); };
  MC.WorldGen.prototype.nearestDungeon = function (x, z, rad) { return Str.nearest(this, 'dungeon', x, z, rad); };
})();
