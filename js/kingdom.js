'use strict';
// Kingdom: once the lord of a castle has fallen, the conquered castle can become the seat of the player's own
// kingdom. The kingdom grows through construction orders (materials handed to the master builder): houses,
// farms, barracks, watchtowers, stables, a forge, a market, a chapel, plazas and a town wall. Every order
// searches its own site around the castle — scoring slope, water, height, distance to the streets and to
// the town centre, with a good dose of chance — so no two kingdoms grow alike, and each follows its land:
// stone plinths and dug terraces on slopes, winding streets that avoid hills, step up with slabs and bridge
// rivers, walls whose towers climb the ridges. Building sizes, roofs and materials are rolled per order
// from a style chosen when the kingdom is founded (matching the castle's landscape). The builders lay the
// blocks a few dozen per second; they are stored as ordinary world edits.
// People and raids: kingdommobs.js, screens / HUD: kingdomui.js, catalogue: kingdomcontent.js.
(function () {
  const Str = MC.Structures;
  const BL = MC.BLOCK;
  const OCC = { BLD: 1, ROAD: 2, WALL: 3, GATE: 4, FARM: 5, LAMP: 6 };
  const key2 = (x, z) => (x + 1048576) * 2097152 + (z + 1048576);
  const rndi = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pickR = (rnd, a) => a[Math.floor(rnd() * a.length)];
  const mixer = (spec, rnd = Math.random) => {
    const list = spec.map(([k, w]) => [BL[k], w]);
    const tot = list.reduce((a, e) => a + e[1], 0);
    return () => { let x = rnd() * tot; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; };
  };
  const facingTo = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2));

  // ---------------------------------------------------------------- terrain
  // NATURE: removable growth that is ignored when looking for the ground; GROUND: natural surface blocks
  const NATURE = new Uint8Array(MC.NB), GROUND = new Uint8Array(MC.NB);
  for (let id = 1; id < MC.NB; id++) {
    const d = MC.BLOCKS[id];
    if (!d) continue;
    if (MC.B_MAT[id] === MC.MAT.LEAVES || MC.B_MAT[id] === MC.MAT.PLANT || MC.B_SHAPE[id] === MC.SHAPE.CROSS || MC.B_SHAPE[id] === MC.SHAPE.CACTUS) NATURE[id] = 1;
  }
  for (const k of ['oak_log', 'birch_log', 'spruce_log', 'pumpkin', 'melon', 'cobweb', 'snow_layer']) if (BL[k]) NATURE[BL[k]] = 1;
  for (const k of ['grass', 'dirt', 'sand', 'gravel', 'stone', 'snowy_grass', 'snow', 'clay', 'sandstone', 'cobblestone', 'mossy_cobblestone', 'magma_block',
    'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'bedrock', 'dirt_path', 'obsidian', 'packed_ice']) GROUND[BL[k]] = 1;
  const SURFACE = new Set([BL.grass, BL.snowy_grass, BL.sand, BL.dirt, BL.gravel]);
  const isBuilt = (b) => b && !NATURE[b] && !GROUND[b] && !MC.B_FLUID[b];

  // top of the ground at (x, z): { y, water, top, built, far }
  function groundAt(W, x, z) {
    const c = W.getChunk(x >> 4, z >> 4);
    if (!c) {
      const h = Math.floor(W.gen.height(x, z));
      return h < MC.SEA - 1 ? { y: MC.SEA - 1, water: true, top: BL.water, far: true } : { y: h, water: false, top: BL.grass, far: true };
    }
    const bl = c.blocks, li = (x & 15) + (z & 15) * 16;
    for (let y = Math.min(c.maxY, MC.HEIGHT - 2); y > 0; y--) {
      const b = bl[li + y * 256];
      if (!b || NATURE[b]) continue;
      if (MC.B_FLUID[b] || b === BL.ice) return { y, water: true, lava: MC.B_FLUID[b] === MC.FLUID.LAVA, top: b };
      return { y, water: false, top: b, built: !GROUND[b] };
    }
    return { y: 1, water: false, top: BL.stone };
  }
  function groundCache(W) {
    const m = new Map();
    return (x, z) => { const k = key2(x, z); let g = m.get(k); if (!g) { g = groundAt(W, x, z); m.set(k, g); } return g; };
  }

  // ---------------------------------------------------------------- block plans
  // world-space block collector; later puts win. ph: 0 clear, 1 ground, 2 structure, 3 roof, 4 details, 5 streets
  class Plan {
    constructor() { this.m = new Map(); }
    put(x, y, z, id, ph = 2, seq = 0) { if (y < 1 || y >= MC.HEIGHT - 1) return; this.m.set(MC.posKey(x, y, z), [x, y, z, id, ph, seq]); }
    get(x, y, z) { const e = this.m.get(MC.posKey(x, y, z)); return e ? e[3] : undefined; }
    queue() {
      const a = [...this.m.values()];
      // clearing goes top-down, everything else bottom-up; streets in the order they are walked
      a.sort((p, q) => p[4] - q[4] || p[5] - q[5] || (p[4] === 0 ? q[1] - p[1] : p[1] - q[1]) || p[0] - q[0] || p[2] - q[2]);
      const out = new Array(a.length * 4);
      a.forEach((e, i) => { out[i * 4] = e[0]; out[i * 4 + 1] = e[1]; out[i * 4 + 2] = e[2]; out[i * 4 + 3] = e[3]; });
      return out;
    }
  }
  // local frame like the villages': (lx, lz) in [0,w) x [0,d), front edge lz = 0 facing -z, r quarter turns
  function frame(P, ox, oy, oz, w, d, r) {
    const tf = (lx, lz) => {
      let x = lx, z = lz, Wd = w, Dd = d;
      for (let i = 0; i < r; i++) { const nx = Dd - 1 - z, nz = x; x = nx; z = nz; const t = Wd; Wd = Dd; Dd = t; }
      return [ox + x, oz + z];
    };
    const L = {
      w, d, r, tf, oy,
      put(lx, ly, lz, id, ph = 2) { const [x, z] = tf(lx, lz); P.put(x, oy + ly, z, id ? MC.rotateBlock(id, r) : 0, ph); },
      box(x0, y0, z0, x1, y1, z1, id, ph = 2) {
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) L.put(x, y, z, typeof id === 'function' ? id(x, y, z) : id, ph);
      },
      world(lx, ly, lz) { const [x, z] = tf(lx, lz); return [x, oy + ly, z]; },
      pos(lx, ly, lz) { const [x, z] = tf(lx, lz); return [x + 0.5, oy + ly, z + 0.5]; },
    };
    return L;
  }

  // ---------------------------------------------------------------- styles & palettes
  // rolled once per kingdom: wood, roofs, wall styles of the houses, stone mixes, street surfaces
  function rollStyle(theme, rnd = Math.random) {
    const P = (a) => pickR(rnd, a);
    const w = (a, b) => Math.round(a + rnd() * (b - a));
    switch (theme) {
      case 'desert': return { wood: 'oak', roof: 'sandstone', flat: true, house: [['sand', w(4, 8)], ['sandtimber', w(1, 4)]], plaster: 'cut_sandstone',
        stone: [['sandstone', 6], ['cut_sandstone', 3]], found: [['cut_sandstone', 1]], road0: [['cut_sandstone', 5], ['smooth_stone', w(1, 3)], ['sandstone', 2]],
        road: [['sandstone', 4], ['gravel', w(1, 3)]], ground: 'sand' };
      case 'frost': return { wood: 'spruce', roof: P(['spruce', 'spruce', 'stone_brick']), house: [['timber', w(2, 6)], ['plank', w(2, 6)], ['stone', w(1, 4)]],
        plaster: P(['wool_white', 'birch_planks']), stone: [['stone_bricks', 6], ['cobblestone', 3], ['mossy_stone_bricks', 1]], found: [['stone_bricks', 3], ['cobblestone', 2]],
        road0: [['stone_bricks', 4], ['cobblestone', 3], ['gravel', 2]], road: [['gravel', 5], ['cobblestone', 2]], ground: 'snowy_grass' };
      case 'volcano': return { wood: P(['spruce', 'oak']), roof: P(['dark_brick', 'spruce', 'dark_brick']), house: [['stone', w(3, 6)], ['brick', w(1, 4)], ['plank', w(1, 3)]],
        plaster: 'bricks', stone: [['cobblestone', 4], ['stone_bricks', 3], ['dark_bricks', w(1, 3)]], found: [['dark_bricks', 2], ['cobblestone', 2]],
        road0: [['dark_bricks', 3], ['cobblestone', 4], ['gravel', 2]], road: [['gravel', 4], ['cobblestone', 2], ['dirt_path', 1]], ground: 'grass' };
      case 'necro': return { wood: P(['spruce', 'oak', 'birch']), roof: P(['spruce', 'cobblestone', 'oak']), house: [['timber', w(2, 6)], ['plank', w(2, 5)], ['stone', w(1, 4)]],
        plaster: P(['wool_white', 'birch_planks', 'spruce_planks']), stone: [['cobblestone', 5], ['mossy_cobblestone', 3], ['stone_bricks', 2]],
        found: [['mossy_cobblestone', 2], ['cobblestone', 3]], road0: [['cobblestone', 4], ['mossy_cobblestone', 2], ['gravel', 2]], road: [['dirt_path', 5], ['gravel', 2]], ground: 'grass' };
      default: return { wood: P(['oak', 'spruce', 'birch', 'oak']), roof: P(['oak', 'spruce', 'stone_brick', 'cobblestone', 'spruce']),
        house: [['timber', w(1, 7)], ['plank', w(1, 5)], ['stone', w(0, 4)], ['brick', w(0, 3)]], plaster: P(['wool_white', 'wool_white', 'birch_planks', 'smooth_stone']),
        stone: [['cobblestone', 5], ['stone_bricks', w(1, 5)], ['mossy_cobblestone', 1]], found: [['cobblestone', 3], ['stone_bricks', w(0, 3)]],
        road0: P([[['cobblestone', 5], ['gravel', 2], ['stone_bricks', 2]], [['stone_bricks', 5], ['cracked_stone_bricks', 1], ['cobblestone', 2]], [['gravel', 4], ['cobblestone', 3]]]),
        road: P([[['dirt_path', 6], ['gravel', 1]], [['gravel', 4], ['dirt_path', 3]], [['dirt_path', 4], ['cobblestone', 1]]]), ground: 'grass' };
    }
  }
  const ROOFS = {
    oak: ['oak_stairs', 'oak_slab'], spruce: ['spruce_stairs', 'spruce_slab'], cobblestone: ['cobblestone_stairs', 'cobblestone_slab'],
    stone_brick: ['stone_brick_stairs', 'stone_brick_slab'], dark_brick: ['dark_brick_stairs', 'dark_brick_slab'], sandstone: ['sandstone_stairs', 'sandstone_slab'],
  };
  function palette(k, rnd) {
    const s = k.style, wood = s.wood, wk = wood === 'spruce' ? 'spruce' : 'oak';
    const roof = ROOFS[s.roof] || ROOFS.oak;
    const theme = MC.CASTLE_THEMES[k.theme] || MC.CASTLE_THEMES.knight;
    const color = k.color;
    return {
      flat: !!s.flat,
      planks: BL[wood + '_planks'], log: BL[wood + '_log'], fence: BL[wk + '_fence'], woodStairs: BL[wk + '_stairs'], woodSlab: BL[wk + '_slab'],
      floor: s.flat ? BL.smooth_stone : BL[wood + '_planks'],
      roofStairs: BL[roof[0]], roofSlab: BL[roof[1]],
      stoneStairs: s.roof === 'sandstone' ? BL.sandstone_stairs : BL.stone_brick_stairs, stoneSlab: s.roof === 'sandstone' ? BL.sandstone_slab : BL.stone_brick_slab,
      plaster: BL[s.plaster] || BL.wool_white,
      stone: mixer(s.stone, rnd), found: mixer(s.found, rnd), road0: mixer(s.road0, rnd), road: mixer(s.road, rnd),
      roadSlab: s.flat ? BL.sandstone_slab : BL.cobblestone_slab, bridge: BL[wood + '_planks'],
      wallMix: mixer(theme.wall, rnd), wallTrim: BL[theme.trim] || BL.smooth_stone,
      ground: BL[s.ground] || BL.grass, path: s.flat ? BL.cut_sandstone : BL.dirt_path,
      glass: BL.glass_pane, wool: BL['wool_' + color] || BL.wool_red, wool2: color === 'white' ? BL.wool_yellow : BL.wool_white,
      carpet: BL['carpet_' + color] || BL.carpet_red,
    };
  }
  // the house style mixer returns names, not ids
  function styleMixer(list, rnd) {
    const l = list.filter((e) => e[1] > 0);
    const tot = l.reduce((a, e) => a + e[1], 0);
    return () => { let x = rnd() * tot; for (const [n, v] of l) { x -= v; if (x <= 0) return n; } return l[0][0]; };
  }

  // ---------------------------------------------------------------- roofs
  // gable roof over the local rectangle, eaves one block out, lowest layer at y; ridge along x or z
  function roofGable(L, x0, z0, x1, z1, y, alongX, st, sl, fill) {
    let top = y;
    for (let k = 0; ; k++) {
      const yy = y + k;
      if (alongX) {
        const za = z0 - 1 + k, zb = z1 + 1 - k;
        if (za > zb) break;
        top = yy;
        if (za === zb) { for (let x = x0 - 1; x <= x1 + 1; x++) L.put(x, yy, za, sl, 3); break; }
        for (let x = x0 - 1; x <= x1 + 1; x++) { L.put(x, yy, za, st + 0, 3); L.put(x, yy, zb, st + 2, 3); }
        for (let z = za + 1; z < zb; z++) { L.put(x0, yy, z, fill(), 3); L.put(x1, yy, z, fill(), 3); }
      } else {
        const xa = x0 - 1 + k, xb = x1 + 1 - k;
        if (xa > xb) break;
        top = yy;
        if (xa === xb) { for (let z = z0 - 1; z <= z1 + 1; z++) L.put(xa, yy, z, sl, 3); break; }
        for (let z = z0 - 1; z <= z1 + 1; z++) { L.put(xa, yy, z, st + 3, 3); L.put(xb, yy, z, st + 1, 3); }
        for (let x = xa + 1; x < xb; x++) { L.put(x, yy, z0, fill(), 3); L.put(x, yy, z1, fill(), 3); }
      }
    }
    return top;
  }
  function roofHip(L, x0, z0, x1, z1, y, st, sl) {
    let top = y;
    for (let k = 0; ; k++) {
      const xa = x0 - 1 + k, xb = x1 + 1 - k, za = z0 - 1 + k, zb = z1 + 1 - k, yy = y + k;
      if (xa > xb || za > zb) break;
      top = yy;
      if (xa === xb || za === zb) { for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) L.put(x, yy, z, sl, 3); break; }
      for (let x = xa; x <= xb; x++) { L.put(x, yy, za, st + 0, 3); L.put(x, yy, zb, st + 2, 3); }
      for (let z = za + 1; z < zb; z++) { L.put(xa, yy, z, st + 3, 3); L.put(xb, yy, z, st + 1, 3); }
    }
    return top;
  }
  function roofFlat(L, x0, z0, x1, z1, y, slab, fill) {
    L.box(x0 - 1, y, z0 - 1, x1 + 1, y, z1 + 1, slab, 3);
    L.box(x0, y, z0, x1, y, z1, fill, 3);
    for (let x = x0; x <= x1; x += 2) { L.put(x, y + 1, z0, slab, 3); L.put(x, y + 1, z1, slab, 3); }
    for (let z = z0 + 2; z < z1; z += 2) { L.put(x0, y + 1, z, slab, 3); L.put(x1, y + 1, z, slab, 3); }
    return y + 1;
  }
  // roof surface height over a local column (for chimneys)
  const roofAt = (x, z, w, d, base, alongX) => base + (alongX ? Math.min(z + 1, d - z) : Math.min(x + 1, w - x));

  const FLOWERS = ['poppy', 'dandelion', 'cornflower', 'allium', 'oxeye_daisy', 'tall_grass', 'poppy', 'dandelion'];

  // ---------------------------------------------------------------- generator context
  function context(k, W, G, P, L, site, rnd) {
    const pal = palette(k, rnd);
    const C = {
      k, W, G, P, L, rnd, pal, fy: site.fy, opt: site.opt || {},
      meta: { people: [], posts: [], chimneys: [], smoke: [] },
      surface(g) { return SURFACE.has(g.top) ? g.top : pal.ground; },
      // footprint [lx0..lx1] x [lz0..lz1]: stone plinth down to the ground, everything above cleared up to
      // clearH, the one-block rim brought to floor level (fill on the low side, cut into the slope uphill)
      site(lx0, lz0, lx1, lz1, clearH) {
        const fy = C.fy;
        for (let lz = lz0 - 1; lz <= lz1 + 1; lz++) for (let lx = lx0 - 1; lx <= lx1 + 1; lx++) {
          const [x, z] = L.tf(lx, lz);
          const g = G(x, z);
          const inside = lx >= lx0 && lx <= lx1 && lz >= lz0 && lz <= lz1;
          for (let y = fy + 1, t = Math.max(g.y, fy) + clearH; y <= t; y++) P.put(x, y, z, 0, 0);
          if (inside) {
            for (let y = Math.min(g.y, fy - 1); y < fy; y++) P.put(x, y, z, pal.found(), 1);
            P.put(x, fy, z, pal.found(), 1);
          } else {
            for (let y = g.y + 1; y < fy; y++) P.put(x, y, z, fy - y > 2 ? pal.found() : BL.dirt, 1);
            P.put(x, fy, z, C.surface(g), 1);
          }
        }
      },
      windows(rows, skip) {
        const w = L.w, d = L.d, mx = w >> 1;
        for (const wy of rows) {
          const ph = rnd() < 0.5 ? 0 : 1;
          for (let x = 1; x < w - 1; x++) if ((x + ph) % 2 === 0) { if (Math.abs(x - mx) > 1) L.put(x, wy, 0, pal.glass); L.put(x, wy, d - 1, pal.glass); }
          for (let z = 1; z < d - 1; z++) if ((z + ph) % 2 === 0 && !(skip && skip(z))) { L.put(0, wy, z, pal.glass); L.put(w - 1, wy, z, pal.glass); }
        }
      },
      door(x, z = 0) {
        L.put(x, 1, z, MC.doorId(2, 0, 1)); L.put(x, 2, z, MC.doorId(2, 1, 1));
        L.put(x, 0, z - 1, pal.path, 1);
        for (let y = 1; y <= 3; y++) L.put(x, y, z - 1, 0, 0);
      },
      lampPost(x, z, ly = 1) { L.put(x, ly, z, pal.fence, 4); L.put(x, ly + 1, z, pal.fence, 4); L.put(x, ly + 2, z, BL.lantern, 4); },
      flowers(cells) {
        if (pal.ground !== BL.grass && pal.ground !== BL.snowy_grass) return;
        for (const [x, z] of cells) if (rnd() < 0.45) L.put(x, 1, z, BL[pickR(rnd, FLOWERS)], 4);
      },
      person(type, home, o = {}) { C.meta.people.push(Object.assign({ type, home }, o)); },
    };
    return C;
  }

  // ---------------------------------------------------------------- buildings
  const GEN = {};
  GEN.house = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1;
    const style = C.opt.style, two = C.opt.two, H1 = C.opt.H1;
    const top = two ? H1 + 4 : H1;
    const alongX = w > d ? true : w < d ? false : rnd() < 0.5;
    const flat = pal.flat;
    C.site(0, 0, w - 1, d - 1, top + (flat ? 3 : Math.ceil((alongX ? d : w) / 2) + 3));
    L.box(0, 0, 0, w - 1, 0, d - 1, pal.floor);
    const wallAt = (x, y, z, corner, pos) => {
      switch (style) {
        case 'timber': if (corner || y === H1 || y === top || pos % 3 === 0) return pal.log; return y === 1 ? pal.found() : pal.plaster;
        case 'stone': if (y <= (two ? H1 : top)) return pal.stone(); return corner ? pal.log : pal.planks;
        case 'brick': if (corner) return pal.log; return y === 1 ? pal.found() : BL.bricks;
        case 'sand': return corner || y === top ? BL.cut_sandstone : pal.stone();
        case 'sandtimber': if (y <= H1) return corner ? BL.cut_sandstone : BL.sandstone; return corner ? pal.log : pal.planks;
        default: if (corner || y === top) return pal.log; return y === 1 ? pal.found() : pal.planks;
      }
    };
    for (let y = 1; y <= top; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      if (!edge) { if (two && y === H1 + 1) L.put(x, y, z, pal.floor); continue; }
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      L.put(x, y, z, wallAt(x, y, z, corner, x === 0 || x === w - 1 ? z : x));
    }
    C.windows(two ? [2, H1 + 3] : [2], (z) => two && z === 1);
    C.door(mx);
    // roof (gable along the long side, hip on some square houses, flat terraces in the desert)
    const fill = () => (style === 'timber' ? pal.plaster : style === 'stone' && !two ? pal.stone() : style === 'sand' ? pal.stone() : pal.planks);
    const rs = pal.roofStairs, rsl = pal.roofSlab;
    let hip = false;
    if (flat) roofFlat(L, 0, 0, w - 1, d - 1, top + 1, rsl, BL.cut_sandstone);
    else if (w === d && rnd() < 0.5) { hip = true; roofHip(L, 0, 0, w - 1, d - 1, top + 1, rs, rsl); }
    else roofGable(L, 0, 0, w - 1, d - 1, top + 1, alongX, rs, rsl, fill);
    // chimney with a hearth
    const chim = !flat && rnd() < 0.55;
    const cx = w - 2, cz = d - 2;
    if (chim) {
      const ry = hip ? top + 1 + Math.min(cx + 1, w - cx, cz + 1, d - cz) : roofAt(cx, cz, w, d, top, alongX);
      L.put(cx, 1, cz, BL.furnace + 2);
      for (let y = 2; y <= ry + 1; y++) L.put(cx, y, cz, rnd() < 0.3 ? BL.bricks : pal.stone(), y > top ? 3 : 2);
      C.meta.chimneys.push(L.world(cx, ry + 2, cz));
    }
    // interior
    L.put(1, 1, d - 3, MC.bedId(0, 0)); L.put(1, 1, d - 2, MC.bedId(0, 1));
    if (w >= 6 && !(chim && cx === 2)) { L.put(2, 1, d - 3, MC.bedId(0, 0)); L.put(2, 1, d - 2, MC.bedId(0, 1)); }
    L.put(w - 2, 1, 1, BL.chest + 1);
    if (!chim) L.put(w - 2, 1, d - 2, BL.crafting_table);
    if (w >= 7 && d >= 6) { L.put(w - 2, 1, 2, BL.bookshelf); L.put(mx + 1, 1, d >> 1, pal.fence); L.put(mx + 1, 2, d >> 1, pal.woodSlab); }
    for (let z = 2; z < d - 3; z++) for (let x = Math.max(1, mx - 1); x <= Math.min(w - 2, mx); x++) L.put(x, 1, z, pal.carpet, 4);
    if (two) {
      for (let y = 1; y <= H1 + 1; y++) L.put(1, y, 1, BL.ladder + 1, 4);
      L.put(mx, H1, d >> 1, BL.hanging_lantern, 4);
      L.put(w - 2, H1 + 2, d - 3, MC.bedId(0, 0)); L.put(w - 2, H1 + 2, d - 2, MC.bedId(0, 1));
      L.put(1, H1 + 2, d - 2, BL.bookshelf); L.put(mx, H1 + 4, 0 + 1, 0);
      L.put(w - 2, H1 + 3, 1, BL.wall_torch + 3, 4);
    } else if (!flat) {
      const bz = d >> 1;
      for (let x = 1; x < w - 1; x++) L.put(x, top, bz, pal.log);
      L.put(mx, top - 1, bz, BL.hanging_lantern, 4);
    } else L.put(mx, top, d >> 1, BL.hanging_lantern, 4);
    // outside: porch or a torch by the door, flower beds, a wood pile / hay
    if (w >= 6 && rnd() < 0.3) {
      for (const x of [mx - 1, mx + 1]) { L.put(x, 1, -1, pal.fence, 4); L.put(x, 2, -1, pal.fence, 4); }
      for (let x = mx - 1; x <= mx + 1; x++) L.put(x, 3, -1, pal.woodSlab, 4);
    } else L.put(mx + 1, 2, -1, BL.wall_torch + 0, 4);
    const beds = [];
    for (let x = 0; x < w; x++) if (Math.abs(x - mx) > 1) beds.push([x, -1]);
    C.flowers(beds);
    if (rnd() < 0.45) { const z = rndi(rnd, 1, d - 2); L.put(-1, 1, z, rnd() < 0.5 ? BL.hay_bale : pal.log, 4); if (rnd() < 0.5) L.put(-1, 2, z, pal.log, 4); }
    C.person('k_citizen', L.pos(mx, 1, 1), { g: 'm' });
    C.person('k_citizen', L.pos(mx, 1, 2), { g: 'f' });
  };

  GEN.farm = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1;
    C.site(0, 0, w - 1, d - 1, 4);
    const mid = d >> 1, water = new Set();
    for (let z = mid; z > 0; z -= 4) water.add(z);
    for (let z = mid + 4; z < d - 1; z += 4) water.add(z);
    const special = rnd() < 0.35 ? pickR(rnd, ['pumpkin', 'melon']) : null;
    const specialRow = special ? pickR(rnd, [...Array(d - 2).keys()].map((i) => i + 1).filter((z) => !water.has(z))) : -1;
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      if (edge) { L.put(x, 0, z, pal.log); continue; }
      if (water.has(z)) { L.put(x, 0, z, BL.water); continue; }
      if (z === specialRow && x % 2 === 1) { L.put(x, 0, z, BL.dirt); L.put(x, 1, z, BL[special], 4); continue; }
      L.put(x, 0, z, BL.farmland);
      L.put(x, 1, z, BL['wheat_' + Math.min(3, Math.floor(rnd() * 4.4))], 4);
    }
    // fence around (gate in front), scarecrow, produce chest, lamp
    for (let z = -1; z <= d; z++) for (let x = -1; x <= w; x++) {
      if (!(x === -1 || z === -1 || x === w || z === d)) continue;
      if (z === -1 && Math.abs(x - mx) <= 1) continue;
      L.put(x, 1, z, pal.fence, 4);
    }
    L.put(0, 1, d - 1, pal.fence, 4); L.put(0, 2, d - 1, BL.hay_bale, 4); L.put(0, 3, d - 1, rnd() < 0.3 ? BL.jack_o_lantern : BL.pumpkin, 4);
    L.put(w - 1, 1, 0, BL.chest + 2, 4);
    C.lampPost(0, 0);
    const [ax, az] = L.tf(1, 1), [bx, bz] = L.tf(w - 2, d - 2);
    C.meta.farm = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), C.fy];
    C.meta.chest = L.world(w - 1, 1, 0);
    C.person('k_farmer', L.pos(mx, 1, -1));
  };

  GEN.barracks = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1, yd = 4, z0 = yd, z1 = d - 1, H = 4;
    C.site(0, 0, w - 1, d - 1, 10);
    for (let z = 0; z < yd; z++) for (let x = 0; x < w; x++) L.put(x, 0, z, rnd() < 0.5 ? BL.gravel : pal.path, 1);
    L.box(0, 0, z0, w - 1, 0, z1, pal.planks);
    const timber = rnd() < 0.5;
    for (let y = 1; y <= H; y++) for (let z = z0; z <= z1; z++) for (let x = 0; x < w; x++) {
      if (!(x === 0 || x === w - 1 || z === z0 || z === z1)) continue;
      const corner = (x === 0 || x === w - 1) && (z === z0 || z === z1);
      L.put(x, y, z, corner ? pal.log : y <= 2 ? pal.stone() : timber && x % 3 === 0 ? pal.log : pal.planks);
    }
    for (let x = 2; x < w - 2; x += 2) if (x !== mx) { L.put(x, 3, z0, pal.glass); L.put(x, 3, z1, pal.glass); }
    for (let z = z0 + 2; z < z1 - 1; z += 2) { L.put(0, 3, z, pal.glass); L.put(w - 1, 3, z, pal.glass); }
    L.put(mx, 1, z0, MC.doorId(2, 0, 1)); L.put(mx, 2, z0, MC.doorId(2, 1, 1));
    roofGable(L, 0, z0, w - 1, z1, H + 1, true, pal.roofStairs, pal.roofSlab, () => pal.planks);
    const bz = (z0 + z1) >> 1;
    for (let x = 1; x < w - 1; x++) L.put(x, H, bz, pal.log);
    for (let x = 2; x < w - 1; x += 4) L.put(x, H - 1, bz, BL.hanging_lantern, 4);
    for (let x = 1; x <= w - 2; x += 2) { L.put(x, 1, z1 - 2, MC.bedId(0, 0)); L.put(x, 1, z1 - 1, MC.bedId(0, 1)); }
    L.put(w - 2, 1, z0 + 1, BL.chest + 1); L.put(1, 1, z0 + 1, BL.crafting_table);
    // training yard: straw dummies, an archery butt, the kingdom's flag
    for (const x of [1, w - 2]) { L.put(x, 1, 1, pal.fence, 4); L.put(x, 2, 1, BL.hay_bale, 4); L.put(x, 3, 1, BL.pumpkin, 4); }
    if (w >= 11) { L.put(mx + 3, 1, 2, BL.hay_bale, 4); L.put(mx + 3, 2, 2, pal.wool, 4); }
    for (let y = 1; y <= 5; y++) L.put(0, y, 0, pal.fence, 4);
    for (const [x, y] of [[1, 5], [2, 5], [1, 4], [2, 4]]) L.put(x, y, 0, x === 2 && y === 4 ? pal.wool2 : pal.wool, 4);
    for (let i = 0; i < 3; i++) C.person('k_swordsman', L.pos(mx + (i - 1), 1, z0 + 2), { post: L.pos(mx, 1, 2) });
  };

  GEN.tower = (C) => {
    const { L, rnd, pal } = C, Ht = C.opt.Ht;
    C.site(0, 0, 4, 4, Ht + 7);
    L.box(0, 0, 0, 4, 0, 4, pal.stone);
    for (let y = 1; y <= Ht; y++) for (let z = 0; z <= 4; z++) for (let x = 0; x <= 4; x++) {
      if (x === 0 || z === 0 || x === 4 || z === 4) L.put(x, y, z, y <= 2 ? pal.found() : pal.stone());
    }
    for (let y = 1; y <= Ht; y++) L.put(2, y, 3, BL.ladder + 0, 4);
    for (let z = 1; z <= 3; z++) for (let x = 1; x <= 3; x++) if (!(x === 2 && z === 3)) L.put(x, Ht, z, pal.planks);
    C.door(2);
    for (const y of [5, Ht - 2]) { L.put(0, y, 2, 0); L.put(4, y, 2, 0); if (y > 4) L.put(2, y, 0, 0); }
    const roofed = rnd() < 0.5;
    for (let z = 0; z <= 4; z++) for (let x = 0; x <= 4; x++) {
      if (!(x === 0 || z === 0 || x === 4 || z === 4)) continue;
      const corner = (x === 0 || x === 4) && (z === 0 || z === 4);
      if (roofed && corner) { L.put(x, Ht + 1, z, pal.fence); L.put(x, Ht + 2, z, pal.fence); }
      else if (((x + z) & 1) === 0) L.put(x, Ht + 1, z, pal.stone());
    }
    if (roofed) roofHip(L, 0, 0, 4, 4, Ht + 3, pal.roofStairs, pal.roofSlab);
    else { L.put(0, Ht + 2, 0, BL.lantern, 4); L.put(4, Ht + 2, 4, BL.lantern, 4); }
    if (roofed) L.put(2, Ht + 2, 2, BL.hanging_lantern, 4);
    for (let y = Ht - 3; y <= Ht - 1; y++) L.put(2, y, -1, y === Ht - 2 ? pal.wool2 : pal.wool, 4);
    C.person('k_archer', L.pos(2, 1, 1), { post: L.pos(1, Ht + 1, 1) });
    C.person('k_archer', L.pos(2, 1, 2), { post: L.pos(3, Ht + 1, 2) });
  };

  GEN.stable = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1, pd = C.opt.pd, z0 = pd, z1 = d - 1, H = 4;
    C.site(0, 0, w - 1, d - 1, 11);
    for (let z = 0; z < pd; z++) for (let x = 0; x < w; x++) L.put(x, 0, z, C.surface(C.G(...L.tf(x, z))), 1);
    for (let z = 0; z < pd; z++) { L.put(0, 1, z, pal.fence, 4); L.put(w - 1, 1, z, pal.fence, 4); }
    for (let x = 1; x < w - 1; x++) if (Math.abs(x - mx) > 1) L.put(x, 1, 0, pal.fence, 4);
    for (let z = z0; z <= z1; z++) for (let x = 0; x < w; x++) L.put(x, 0, z, rnd() < 0.3 ? BL.hay_bale : BL.dirt);
    for (let y = 1; y <= H; y++) {
      for (let x = 0; x < w; x++) L.put(x, y, z1, x === 0 || x === w - 1 ? pal.log : pal.planks);
      for (let z = z0; z < z1; z++) { L.put(0, y, z, z === z0 ? pal.log : pal.planks); L.put(w - 1, y, z, z === z0 ? pal.log : pal.planks); }
      for (let x = 3; x < w - 1; x += 3) L.put(x, y, z0, pal.log);
    }
    for (let x = 3; x < w - 1; x += 3) for (let z = z1 - 2; z < z1; z++) L.put(x, 1, z, pal.fence, 4);
    for (let x = 1; x < w - 1; x++) {
      if (x % 3 === 0) continue;
      if (x % 3 === 1 && rnd() < 0.7) L.put(x, 1, z1 - 1, BL.hay_bale, 4);
      else if (x % 3 === 2) L.put(x, 0, z1 - 1, BL.water);
    }
    roofGable(L, 0, z0, w - 1, z1, H + 1, true, pal.roofStairs, pal.roofSlab, () => pal.planks);
    for (let x = 3; x < w - 1; x += 3) L.put(x, 3, z0 - 1, BL.wall_torch + 0, 4);
    C.person('k_knight', L.pos(mx - 1, 1, pd >> 1), { post: L.pos(mx, 1, 1) });
    C.person('k_knight', L.pos(mx + 1, 1, pd >> 1), { post: L.pos(mx, 1, 1) });
  };

  GEN.forge = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1, H = 4;
    C.site(0, 0, w - 1, d - 1, 12);
    L.box(0, 0, 0, w - 1, 0, d - 1, () => (rnd() < 0.5 ? BL.cobblestone : pal.stone()));
    for (let y = 1; y <= H; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      if (!(x === 0 || z === 0 || x === w - 1 || z === d - 1)) continue;
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      L.put(x, y, z, corner ? pal.log : pal.stone());
    }
    // open workshop front with timber posts
    for (let y = 1; y <= 3; y++) for (let x = mx - 1; x <= mx + 1; x++) L.put(x, y, 0, 0);
    for (let y = 1; y <= 3; y++) { L.put(mx - 2, y, 0, pal.log); L.put(mx + 2, y, 0, pal.log); }
    L.put(mx, 0, -1, pal.path, 1);
    for (let z = 2; z < d - 2; z += 2) { L.put(0, 2, z, BL.iron_bars); L.put(w - 1, 2, z, BL.iron_bars); }
    // lava pit, furnaces, anvil, chest, workbench, chimney
    L.put(1, 0, 2, BL.lava); L.put(1, 1, 2, BL.iron_bars);
    if (w >= 8) { L.put(2, 0, 2, BL.lava); L.put(2, 1, 2, BL.iron_bars); }
    L.put(1, 1, d - 2, BL.furnace + 2); L.put(2, 1, d - 2, BL.furnace + 2);
    L.put(w - 3, 1, 2, BL.iron_block);
    L.put(w - 2, 1, d - 2, BL.chest + 1); L.put(w - 2, 1, 1, BL.crafting_table);
    const stoneRoof = rnd() < 0.5;
    roofGable(L, 0, 0, w - 1, d - 1, H + 1, true, stoneRoof ? BL.cobblestone_stairs : pal.roofStairs, stoneRoof ? BL.cobblestone_slab : pal.roofSlab, () => pal.stone());
    const ry = roofAt(1, d - 1, w, d, H, true);
    for (let y = H + 1; y <= ry + 2; y++) L.put(1, y, d - 1, BL.bricks, 3);
    L.put(mx, H, d >> 1, BL.hanging_lantern, 4);
    C.meta.chimneys.push(L.world(1, ry + 3, d - 1));
    C.meta.smoke.push(L.world(1, 1, 2));
    C.person('k_smith', L.pos(mx, 1, (d >> 1)), { work: L.pos(w - 3, 1, 3) });
  };

  GEN.market = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1;
    C.site(0, 0, w - 1, d - 1, 7);
    L.box(0, 0, 0, w - 1, 0, d - 1, () => pal.road0(), 1);
    const woolKeys = ['red', 'yellow', 'light_blue', 'lime', 'orange', 'purple', 'white'];
    const zs = d - 3;
    let first = null;
    for (let xs = 1; xs + 2 <= w - 2; xs += 4) {
      const ca = BL['wool_' + pickR(rnd, woolKeys)], cb = rnd() < 0.5 ? BL.wool_white : pal.wool;
      for (const [x, z] of [[xs, zs], [xs + 2, zs], [xs, zs + 1], [xs + 2, zs + 1]]) { L.put(x, 1, z, pal.fence, 4); L.put(x, 2, z, pal.fence, 4); }
      for (let z = zs; z <= zs + 1; z++) for (let x = xs; x <= xs + 2; x++) L.put(x, 3, z, (x - xs) % 2 ? cb : ca, 4);
      L.put(xs + 1, 1, zs, pickR(rnd, [pal.woodSlab, BL.hay_bale, BL.pumpkin, BL.melon, BL.chest + 2, pal.woodSlab]), 4);
      if (!first) first = L.pos(xs + 1, 1, zs + 1);
    }
    C.lampPost(mx, (d >> 1) - 1);
    for (const x of [mx - 2, mx + 2]) L.put(x, 1, (d >> 1) - 1, pal.woodStairs + (x < mx ? 3 : 1), 4);
    C.person('k_merchant', first || L.pos(mx, 1, d - 2), { post: first || L.pos(mx, 1, d - 2) });
  };

  GEN.chapel = (C) => {
    const { L, rnd, pal } = C, w = L.w, d = L.d, mx = w >> 1, H = 6;
    C.site(-1, 0, w, d - 1, H + 16);
    L.box(0, 0, 0, w - 1, 0, d - 1, () => (rnd() < 0.7 ? BL.smooth_stone : BL.stone_bricks));
    for (let y = 1; y <= H; y++) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      if (!(x === 0 || z === 0 || x === w - 1 || z === d - 1)) continue;
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      L.put(x, y, z, corner ? BL.chiseled_stone_bricks : pal.stone());
    }
    for (let z = 2; z < d - 1; z += 3) for (let y = 1; y <= 3; y++) { L.put(-1, y, z, pal.stone()); L.put(w, y, z, pal.stone()); }
    for (let z = 3; z < d - 2; z += 3) for (let y = 2; y <= 4; y++) { L.put(0, y, z, pal.glass); L.put(w - 1, y, z, pal.glass); }
    for (let y = 3; y <= 5; y++) L.put(mx, y, d - 1, pal.glass);
    C.door(mx);
    L.put(mx, 4, 0, pal.glass);
    const rt = roofGable(L, 0, 0, w - 1, d - 1, H + 1, false, pal.roofStairs, pal.roofSlab, () => pal.stone());
    // bell tower over the entrance
    const T = rt + 4;
    for (let y = H + 1; y <= T; y++) for (let z = 0; z <= 2; z++) for (let x = mx - 1; x <= mx + 1; x++) {
      const shell = x !== mx || z !== 1;
      const open = y >= T - 2 && y <= T - 1 && (x === mx || z === 1);
      L.put(x, y, z, shell && !open ? pal.stone() : 0, 3);
    }
    L.put(mx, T - 1, 1, BL.gold_block, 4);
    roofHip(L, mx - 1, 0, mx + 1, 2, T + 1, pal.stoneStairs, pal.stoneSlab);
    for (let z = 3; z <= d - 4; z += 2) for (const x of [1, 2, w - 3, w - 2]) if (x !== mx) L.put(x, 1, z, pal.woodStairs + 2, 4);
    for (let z = 1; z <= d - 3; z++) L.put(mx, 1, z, pal.carpet, 4);
    L.put(mx, 1, d - 2, BL.gold_block); L.put(mx - 1, 1, d - 2, BL.lantern, 4); L.put(mx + 1, 1, d - 2, BL.lantern, 4);
    for (let z = 2; z < d - 2; z += 3) { L.put(1, 3, z, BL.wall_torch + 1, 4); L.put(w - 2, 3, z, BL.wall_torch + 3, 4); }
    C.person('k_priest', L.pos(mx, 1, d - 3), { post: L.pos(mx, 1, d - 3) });
  };

  GEN.plaza = (C) => {
    const { L, rnd, pal, k } = C, w = L.w, r = (w - 1) / 2, c = r;
    C.site(0, 0, w - 1, w - 1, 9);
    const ringMat = rnd() < 0.5;
    for (let z = 0; z < w; z++) for (let x = 0; x < w; x++) {
      const dd = Math.hypot(x - c, z - c);
      if (dd <= r + 0.35) L.put(x, 0, z, ringMat && Math.floor(dd) % 2 ? pal.stone() : pal.road0(), 1);
      else { L.put(x, 0, z, C.surface(C.G(...L.tf(x, z))), 1); if (rnd() < 0.4 && (pal.ground === BL.grass)) L.put(x, 1, z, BL[pickR(rnd, FLOWERS)], 4); }
    }
    const feature = C.opt.feature;
    if (feature === 'well') {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) { for (let y = -3; y <= 0; y++) L.put(c, y, c, BL.water); continue; }
        L.put(c + dx, 0, c + dz, pal.stone()); L.put(c + dx, -1, c + dz, pal.stone());
        L.put(c + dx, 1, c + dz, pal.stone());
        if (dx && dz) { L.put(c + dx, 2, c + dz, pal.fence); L.put(c + dx, 3, c + dz, pal.fence); }
        L.put(c + dx, 4, c + dz, pal.woodSlab, 3);
      }
      L.put(c, 4, c, pal.woodSlab, 3); L.put(c, 3, c, BL.hanging_lantern, 4);
    } else if (feature === 'fountain') {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const rim = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
        L.put(c + dx, -1, c + dz, pal.stone());
        if (rim) { L.put(c + dx, 0, c + dz, pal.stone()); L.put(c + dx, 1, c + dz, pal.stoneSlab); } else L.put(c + dx, 0, c + dz, BL.water);
      }
      for (let y = 0; y <= 2; y++) L.put(c, y, c, y === 2 ? BL.chiseled_stone_bricks : pal.stone());
      L.put(c, 3, c, BL.lantern, 4);
    } else if (feature === 'tree') {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) L.put(c + dx, 0, c + dz, BL.grass);
      const [tx, ty, tz] = L.world(c, 1, c);
      const P = C.P;
      C.W.gen.buildTree((x, y, z, id) => P.put(x, y, z, id, 4), rnd() < 0.3 ? 'birch' : 'oak', tx, ty, tz, rnd());
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && (dx + dz) % 2 === 0) L.put(c + dx, 1, c + dz, BL.poppy, 4);
    } else {
      L.put(c, 1, c, BL.chiseled_stone_bricks); L.put(c, 2, c, pal.stone()); L.put(c, 3, c, BL.gold_block);
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) L.put(c + dx, 1, c + dz, BL.lantern, 4);
    }
    if (r >= 4) {
      const off = feature === 'fountain' ? 3 : 3;
      L.put(c, 1, c - off, pal.woodStairs + 2, 4); L.put(c, 1, c + off, pal.woodStairs + 0, 4);
      L.put(c - off, 1, c, pal.woodStairs + 1, 4); L.put(c + off, 1, c, pal.woodStairs + 3, 4);
    }
    const q = Math.max(2, Math.round(r) - 1);
    for (const [dx, dz] of [[-q, -q], [q, -q], [-q, q], [q, q]]) if (Math.hypot(dx, dz) <= r + 1.5) C.lampPost(c + dx, c + dz);
    C.meta.center = L.pos(c, 1, c - (feature === 'fountain' ? 3 : 2));
    if (!k.center) C.meta.setCenter = true;
  };

  // per-type site requirements and preferences
  //   w/d size ranges, slope max, near: stick to streets, center: close to the town centre, far: periphery,
  //   high / low: altitude relative to the castle, water: next to water, rank: street width of its road
  const SPEC = {
    house: { w: [5, 9], d: [5, 8], slope: 5, near: 1.2, center: 0.25 },
    farm: { w: [7, 13], d: [7, 11], slope: 3, near: 0.5, low: 0.5, water: 0.9, out: true },
    barracks: { w: [9, 13], d: [10, 11], slope: 4, near: 1, gate: 1, rank: 0 },
    tower: { w: [5, 5], d: [5, 5], slope: 7, far: 0.9, high: 1.3, near: 0.2 },
    stable: { w: [9, 13], d: [11, 12], slope: 3, far: 0.5, near: 0.6, out: true },
    forge: { w: [7, 9], d: [6, 8], slope: 5, near: 1.2, center: 0.3 },
    market: { w: [11, 13], d: [9, 11], slope: 3, center: 1.3, near: 1, rank: 0 },
    chapel: { w: [7, 7], d: [11, 13], slope: 4, high: 0.8, center: 0.6, near: 0.8, rank: 0 },
    plaza: { w: [11, 15], d: [11, 15], square: true, odd: true, slope: 3, center: 1.2, near: 1, rank: 0 },
  };
  function rollOpt(type, k, rnd, fy) {
    switch (type) {
      case 'house': {
        const pal = palette(k, rnd);
        const style = styleMixer(k.style.house, rnd)();
        return { style, two: rnd() < 0.35, H1: pal.flat || rnd() < 0.5 ? 3 : 4 };
      }
      case 'tower': return { Ht: 9 + rndi(rnd, 0, 3) + MC.clamp(Math.round((k.fy - fy) * 0.5), 0, 4) };
      case 'stable': return { pd: rndi(rnd, 5, 6) };
      case 'plaza': return { feature: pickR(rnd, ['well', 'fountain', 'tree', 'statue', 'fountain', 'well']) };
    }
    return {};
  }

  // ---------------------------------------------------------------- site search
  const inCore = (k, x, z, pad = 1) => Math.max(Math.abs(x - k.cx), Math.abs(z - k.cz)) <= k.EXT + pad;
  function nearestRoad(k, x, z) {
    let best = null, bd = Infinity;
    for (const r of k._roadList) { const d = (r[0] - x) ** 2 + (r[1] - z) ** 2; if (d < bd) { bd = d; best = r; } }
    return best ? { r: best, d: Math.sqrt(bd) } : null;
  }
  function insideRing(k, x, z) {
    const v = k.walls && k.walls.verts;
    if (!v) return false;
    let inside = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      const [xi, zi] = v[i], [xj, zj] = v[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  function findSite(k, W, G, type, o = {}) {
    const spec = SPEC[type], rnd = Math.random;
    const center = k.center || k.gate;
    const roads = k._roadList;
    let best = null;
    const tries = o.tries || 120;
    for (let n = 0; n < tries; n++) {
      let w = rndi(rnd, spec.w[0], spec.w[1]), d = spec.square ? w : rndi(rnd, spec.d[0], spec.d[1]);
      if (spec.odd) { w |= 1; if (spec.square) d = w; }
      let fx, fz, F;
      if (o.anchor) {
        fx = Math.round(o.anchor[0] + (rnd() - 0.5) * 16); fz = Math.round(o.anchor[1] + (rnd() - 0.5) * 16);
        F = facingTo(k.gate[0] - fx, k.gate[2] - fz);
      } else if (roads.length && rnd() < 0.62) {
        const rc = roads[Math.floor(rnd() * roads.length)];
        const alongX = k._occ.get(key2(rc[0] + 1, rc[1])) === OCC.ROAD || k._occ.get(key2(rc[0] - 1, rc[1])) === OCC.ROAD;
        const s = rnd() < 0.5 ? 1 : -1, off = 2 + (rc[3] === 0 ? 1 : 0) + Math.floor(rnd() * 2);
        if (alongX) { fx = rc[0] + rndi(rnd, -2, 2); fz = rc[1] + s * off; F = s > 0 ? 2 : 0; }
        else { fx = rc[0] + s * off; fz = rc[1] + rndi(rnd, -2, 2); F = s > 0 ? 1 : 3; }
      } else {
        const a = rnd() * Math.PI * 2;
        // the town grows outwards from the castle, but never sprawls beyond a day's walk
        const rMin = k.EXT + 8, rMax = Math.min(k.EXT + 92, Math.max(rMin + 24, K.townRadius(k) + (spec.far ? 22 : 14)));
        const rr = rMin + Math.sqrt(rnd()) * (rMax - rMin);
        fx = Math.round(k.cx + Math.cos(a) * rr); fz = Math.round(k.cz + Math.sin(a) * rr);
        const nr = nearestRoad(k, fx, fz);
        const tgt = nr ? [nr.r[0], nr.r[1]] : [k.gate[0], k.gate[2]];
        F = facingTo(tgt[0] - fx, tgt[1] - fz);
      }
      const r = (F - 2 + 4) & 3, mx = w >> 1;
      // origin such that the cell in front of the door lands on (fx, fz)
      const L0 = frame(null, 0, 0, 0, w, d, r);
      const [px, pz] = L0.tf(mx, -1);
      const ox = fx - px, oz = fz - pz;
      const L = frame(null, ox, 0, oz, w, d, r);
      const [ax, az] = L.tf(0, 0), [bx, bz] = L.tf(w - 1, d - 1);
      const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, z0 = Math.min(az, bz) - 1, z1 = Math.max(az, bz) + 1;
      // not over the castle, other buildings, streets or walls
      if (x1 >= k.cx - k.EXT - 1 && x0 <= k.cx + k.EXT + 1 && z1 >= k.cz - k.EXT - 1 && z0 <= k.cz + k.EXT + 1) continue;
      let bad = false;
      for (let z = z0; z <= z1 && !bad; z++) for (let x = x0; x <= x1; x++) if (k._occ.has(key2(x, z))) { bad = true; break; }
      if (bad) continue;
      const [sx, sz] = L.tf(mx, -2);
      const so = k._occ.get(key2(sx, sz));
      if (so === OCC.BLD || so === OCC.FARM || so === OCC.WALL || inCore(k, sx, sz, -8)) continue;
      // terrain: slope, water, somebody else's building
      let gmin = Infinity, gmax = -Infinity, far = false;
      const hs = [];
      for (let z = z0; z <= z1 && !bad; z++) for (let x = x0; x <= x1; x++) {
        const g = G(x, z);
        const inside = x > x0 && x < x1 && z > z0 && z < z1;
        if (g.far) far = true;
        if (g.lava || (g.water && inside) || g.built) { bad = true; break; }
        if (!g.water) { gmin = Math.min(gmin, g.y); gmax = Math.max(gmax, g.y); if (inside) hs.push(g.y); }
        for (let y = g.y + 1; y <= g.y + 5; y++) if (isBuilt(W.getBlock(x, y, z))) { bad = true; break; }
      }
      if (bad || far || !hs.length || gmax - gmin > spec.slope + (o.relax || 0)) continue;
      hs.sort((a, b) => a - b);
      const fy = hs[hs.length >> 1];
      if (fy < MC.SEA - 1) continue;
      let cut = 0;
      for (const h of hs) cut += Math.abs(h - fy);
      let s = -(gmax - gmin) * 2.2 - cut * 0.08 + rnd() * 7;
      const dc = Math.hypot(fx - center[0], fz - center[2]);
      if (spec.center) s -= dc * 0.3 * spec.center;
      if (spec.far) s += Math.min(dc, 70) * 0.25 * spec.far;
      if (Math.hypot(fx - k.cx, fz - k.cz) > k.EXT + 100) continue;
      if (spec.gate) s -= Math.hypot(fx - k.gate[0], fz - k.gate[2]) * 0.2 * spec.gate;
      if (spec.near && roads.length) { const nr = nearestRoad(k, fx, fz); if (nr.d > 46) continue; s -= nr.d * 0.45 * spec.near; }
      if (spec.high) s += (fy - k.fy) * 0.7 * spec.high;
      if (spec.low) s -= (fy - k.fy) * 0.5 * spec.low;
      if (spec.water) {
        let wet = false;
        for (let a = 0; a < 12 && !wet; a++) { const g = G(Math.round(fx + Math.cos(a / 12 * Math.PI * 2) * 8), Math.round(fz + Math.sin(a / 12 * Math.PI * 2) * 8)); if (g.water && !g.lava) wet = true; }
        if (wet) s += 7 * spec.water;
      }
      if (k.walls && k.walls.built.some(Boolean)) s += insideRing(k, fx, fz) ? (spec.out ? 0 : 8) : (spec.out ? 2 : -5);
      if (o.anchor) s -= Math.hypot(fx - o.anchor[0], fz - o.anchor[1]) * 0.6;
      if (!best || s > best.score) best = { score: s, w, d, rot: r, ox, oz, fy, rect: [x0, z0, x1, z1], start: [sx, sz] };
    }
    return best;
  }

  // ---------------------------------------------------------------- streets
  // A* over the terrain from (sx, sz) to the nearest street (or the castle gate): gentle slopes, few
  // bridges, existing streets are cheap, buildings and the castle are in the way, walls get a gate
  function roadPath(k, W, G, sx, sz, sy) {
    const roads = k._roadList;
    let goal, gy;
    if (roads.length) { const nr = nearestRoad(k, sx, sz); goal = [nr.r[0], nr.r[1]]; gy = nr.r[2]; }
    else { goal = [Math.floor(k.gate[0]), Math.floor(k.gate[2])]; gy = Math.round(k.gate[1]) - 1; }
    const box = [Math.min(sx, goal[0]) - 36, Math.min(sz, goal[1]) - 36, Math.max(sx, goal[0]) + 36, Math.max(sz, goal[1]) + 36];
    const nodes = new Map(), open = new MC.Heap();
    const h = (x, z) => Math.abs(x - goal[0]) + Math.abs(z - goal[1]);
    const start = { x: sx, z: sz, y: sy, g: 0, f: h(sx, sz), p: null, closed: false };
    nodes.set(key2(sx, sz), start);
    open.push(start);
    const coreR = k.moatOut + 1;
    let end = null, count = 0;
    const isGoal = (x, z) => (roads.length ? (k._occ.get(key2(x, z)) === OCC.ROAD || k._occ.get(key2(x, z)) === OCC.GATE) : x === goal[0] && z === goal[1]);
    while (open.size() && count < 26000) {
      const cur = open.pop();
      if (cur.closed) continue;
      cur.closed = true; count++;
      if (cur !== start && isGoal(cur.x, cur.z)) { end = cur; break; }
      for (const dd of MC.DIRS) {
        const nx = cur.x + dd[0], nz = cur.z + dd[2];
        if (nx < box[0] || nx > box[2] || nz < box[1] || nz > box[3]) continue;
        if (Math.max(Math.abs(nx - k.cx), Math.abs(nz - k.cz)) <= coreR) continue;
        const oc = k._occ.get(key2(nx, nz));
        if (oc === OCC.BLD || oc === OCC.FARM || oc === OCC.LAMP) continue;
        const g = G(nx, nz);
        if (g.lava) continue;
        const ny = g.water ? MC.SEA - 1 : g.y;
        const dh = Math.abs(ny - cur.y);
        if (dh > 3) continue;
        let c = oc === OCC.ROAD || oc === OCC.GATE ? 0.35 : 1 + [0, 1.2, 5, 14][dh] + MC.hash2(nx, nz, k.seed) * 0.8;
        if (g.water) c += 9;
        if (g.built && oc !== OCC.ROAD) c += 30;
        if (oc === OCC.WALL) c += 40;
        const kk = key2(nx, nz), gg = cur.g + c;
        let n = nodes.get(kk);
        if (n) { if (n.closed || gg >= n.g) continue; n.g = gg; n.f = gg + h(nx, nz); n.p = cur; n.y = ny; open.push(n); continue; }
        n = { x: nx, z: nz, y: ny, g: gg, f: gg + h(nx, nz), p: cur, closed: false };
        nodes.set(kk, n); open.push(n);
      }
    }
    if (!end) return null;
    const path = [];
    for (let n = end; n; n = n.p) path.push([n.x, n.z, n.y]);
    path.reverse();
    const endY = roads.length ? (k._roads.get(key2(end.x, end.z)) || { y: gy }).y : gy;
    return { path, endY: Math.floor(endY) };
  }
  // street surface heights along a path: fixed at both ends, never more than one block per step
  function smoothHeights(path, y0, y1, G) {
    const n = path.length, hs = path.map((p) => p[2]);
    const isW = path.map((p) => G(p[0], p[1]).water);
    hs[0] = y0; hs[n - 1] = y1;
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n - 1; i++) { hs[i] = MC.clamp(hs[i], hs[i - 1] - 1, hs[i - 1] + 1); if (isW[i]) hs[i] = Math.max(hs[i], MC.SEA - 1); }
      for (let i = n - 2; i > 0; i--) { hs[i] = MC.clamp(hs[i], hs[i + 1] - 1, hs[i + 1] + 1); if (isW[i]) hs[i] = Math.max(hs[i], MC.SEA - 1); }
    }
    return hs;
  }
  // pave a street into the plan: cut / fill to the smoothed heights, slabs on the steps, plank bridges
  // with rails and posts over water, lamp posts along the way; registers the cells with the kingdom
  function pave(k, W, G, P, pal, path, hs, rank, seq0) {
    const n = path.length, offs = rank === 0 ? [-1, 0, 1] : [0, 1];
    const lampEvery = 9 + Math.floor(Math.random() * 4), lampSide = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const [x, z] = path[i], yr = hs[i], seq = seq0 + i;
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      if (Math.abs(dx) >= Math.abs(dz)) { dx = Math.sign(dx) || 1; dz = 0; } else { dz = Math.sign(dz); dx = 0; }
      const px = -dz, pz = dx;
      const step = (i + 1 < n && hs[i + 1] === yr + 1) || (i > 0 && hs[i - 1] === yr + 1);
      for (const o of offs) {
        const cx = x + px * o, cz = z + pz * o, kk = key2(cx, cz);
        const oc = k._occ.get(kk);
        if (oc === OCC.BLD || oc === OCC.FARM || oc === OCC.LAMP) continue;
        if ((oc === OCC.ROAD || oc === OCC.GATE) && (o !== 0 || i > n - 3)) continue;
        if (Math.max(Math.abs(cx - k.cx), Math.abs(cz - k.cz)) <= k.moatOut + 1) continue;
        const g = G(cx, cz);
        if (g.lava) continue;
        if (oc === OCC.WALL) for (let y = yr + 1; y <= yr + 4; y++) P.put(cx, y, cz, 0, 5, seq);
        if (g.water) {
          P.put(cx, yr, cz, pal.bridge, 5, seq);
          if (o === offs[0] || o === offs[offs.length - 1]) P.put(cx, yr + 1, cz, pal.fence, 5, seq);
          if (i % 4 === 0 && o === 0) for (let y = yr - 1; y > yr - 9; y--) { const bb = W.getBlock(cx, y, cz); if (bb && !MC.B_FLUID[bb]) break; P.put(cx, y, cz, pal.log, 5, seq); }
        } else {
          for (let y = g.y + 1; y < yr; y++) P.put(cx, y, cz, yr - y > 2 ? pal.found() : BL.dirt, 5, seq);
          for (let y = yr + 1, t = Math.max(g.y, yr) + 3; y <= t; y++) if (!isBuilt(W.getBlock(cx, y, cz))) P.put(cx, y, cz, 0, 5, seq);
          P.put(cx, yr, cz, rank === 0 ? pal.road0() : pal.road(), 5, seq);
          if (step) P.put(cx, yr + 1, cz, pal.roadSlab, 5, seq);
        }
        const isGate = oc === OCC.WALL || oc === OCC.GATE;
        k._occ.set(kk, isGate ? OCC.GATE : OCC.ROAD);
        if (!k._roads.has(kk)) { const e = [cx, cz, yr, rank]; k._roads.set(kk, { y: yr, rank }); k._roadList.push(e); k.roads.push(cx, cz, yr, rank); }
      }
      // lamp posts
      if (i % lampEvery === lampEvery - 1 && i > 2 && i < n - 2) {
        const o = lampSide > 0 ? offs[offs.length - 1] + 1 : offs[0] - 1;
        const lx = x + px * o, lz = z + pz * o, kk = key2(lx, lz);
        const g = G(lx, lz);
        if (!k._occ.has(kk) && !g.water && !g.built && Math.abs(g.y - yr) <= 1 && !inCore(k, lx, lz, -6)) {
          for (let y = g.y + 1; y <= g.y + 4; y++) if (!isBuilt(W.getBlock(lx, y, lz))) P.put(lx, y, lz, 0, 5, seq);
          P.put(lx, g.y + 1, lz, pal.fence, 5, seq); P.put(lx, g.y + 2, lz, pal.fence, 5, seq); P.put(lx, g.y + 3, lz, BL.lantern, 5, seq);
          k._occ.set(kk, OCC.LAMP); k.lamps.push(lx, lz);
        }
      }
    }
    k._rad = 0;
  }
  function road(k, W, G, P, pal, sx, sz, sy, rank, seq0 = 0) {
    const r = roadPath(k, W, G, sx, sz, sy);
    if (!r) return 0;
    const hs = smoothHeights(r.path, sy, r.endY, G);
    pave(k, W, G, P, pal, r.path, hs, rank, seq0);
    return r.path.length;
  }

  // ---------------------------------------------------------------- town wall
  function planRing(k, W, G) {
    const rnd = Math.random;
    let ext = k.EXT + 24;
    for (const b of k.buildings) for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) ext = Math.max(ext, Math.hypot(x - k.cx, z - k.cz) + 6);
    ext = Math.min(ext, k.EXT + 78);
    const K = 6 + Math.floor(rnd() * 3), a0 = Math.atan2(k.gate[2] - k.cz, k.gate[0] - k.cx) + Math.PI / K;
    const verts = [];
    for (let i = 0; i < K; i++) {
      const a = a0 + i / K * Math.PI * 2 + (rnd() - 0.5) * 0.45 * (Math.PI * 2 / K);
      let best = null;
      for (let r = ext - 4; r <= ext + 14; r += 2) {
        const x = Math.round(k.cx + Math.cos(a) * r), z = Math.round(k.cz + Math.sin(a) * r);
        let s = -Math.abs(r - ext) * 0.3 + rnd() * 2, bad = false;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const oc = k._occ.get(key2(x + dx, z + dz));
          if (oc === OCC.BLD || oc === OCC.FARM) bad = true;
        }
        const g = G(x, z);
        if (g.water) s -= 60;
        s += MC.clamp(g.y - k.fy, -8, 10) * 0.8;   // towers like the ridges, but not the peaks
        let lo = g.y, hi = g.y;
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const h = G(x + dx, z + dz).y; lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > 5) s -= (hi - lo - 5) * 3;
        if (bad) s -= 80;
        if (!best || s > best.s) best = { s, x, z };
      }
      verts.push([best.x, best.z]);
    }
    k.walls = { verts, built: new Array(K).fill(false), towers: new Array(K).fill(null) };
  }
  // one wall section: from vertex i to i+1, the tower at vertex i, openings where streets cross
  function genWall(k, W, G, P, pal, i) {
    const v = k.walls.verts, K = v.length, [ax, az] = v[i], [bx, bz] = v[(i + 1) % K];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    let nx = -uz, nz = ux;
    if (((ax + bx) / 2 - k.cx) * nx + ((az + bz) / 2 - k.cz) * nz < 0) { nx = -nx; nz = -nz; }
    const cells = [];
    const n = Math.ceil(len);
    const prof = new Array(n + 1).fill(-Infinity);
    for (let z = Math.min(az, bz) - 3; z <= Math.max(az, bz) + 3; z++) for (let x = Math.min(ax, bx) - 3; x <= Math.max(ax, bx) + 3; x++) {
      const rx = x + 0.5 - ax - 0.5, rz = z + 0.5 - az - 0.5;
      const t = rx * ux + rz * uz, s = rx * nx + rz * nz;
      if (t < -0.5 || t > len + 0.5 || Math.abs(s) > 1.45) continue;
      if (Math.hypot(x - ax, z - az) < 2.5 || Math.hypot(x - bx, z - bz) < 2.5) continue;
      const oc = k._occ.get(key2(x, z));
      if (oc === OCC.BLD || oc === OCC.FARM || inCore(k, x, z, 2)) continue;
      const ti = MC.clamp(Math.round(t), 0, n);
      const g = G(x, z);
      cells.push({ x, z, ti, s, g, oc });
      prof[ti] = Math.max(prof[ti], g.water ? MC.SEA - 1 : g.y);
    }
    // walkway height: 5 above the local ground maximum, rising / falling at most one per block
    const top = prof.map((p, t) => { let m = -Infinity; for (let j = Math.max(0, t - 2); j <= Math.min(n, t + 2); j++) m = Math.max(m, prof[j]); return m === -Infinity ? k.fy : m + 5; });
    for (let it = 0; it < 3; it++) {
      for (let t = 1; t <= n; t++) top[t] = Math.max(top[t], top[t - 1] - 1);
      for (let t = n - 1; t >= 0; t--) top[t] = Math.max(top[t], top[t + 1] - 1);
    }
    const gates = new Set();
    for (const c of cells) if (c.oc === OCC.ROAD || c.oc === OCC.GATE) for (let d = -1; d <= 1; d++) gates.add(c.ti + d);
    for (const c of cells) {
      const T = top[c.ti];
      let base = c.g.y;
      if (c.g.water) { base = MC.SEA - 1; for (let y = MC.SEA - 2; y > MC.SEA - 12; y--) { const bb = W.getBlock(c.x, y, c.z); if (bb && !MC.B_FLUID[bb]) break; base = y; } }
      const road = k._roads.get(key2(c.x, c.z));
      const gy = road ? road.y : c.g.y;
      for (let y = base - 1; y <= T; y++) {
        const hole = gates.has(c.ti) && y > gy && y <= gy + 4;
        if (hole) { P.put(c.x, y, c.z, 0, 2, c.ti); continue; }
        if (y <= c.g.y && !c.g.water && road && y === gy) continue;
        P.put(c.x, y, c.z, y === T - 1 && c.s > 0.5 ? pal.wallTrim : pal.wallMix(), 2, c.ti);
      }
      for (let y = T + 1; y <= T + 3; y++) P.put(c.x, y, c.z, 0, 0);
      if (c.s > 0.5 && ((c.x + c.z) & 1) === 0) P.put(c.x, T + 1, c.z, pal.wallMix(), 2, c.ti);
      if (c.s < -0.5 && c.ti % 9 === 4 && !gates.has(c.ti)) P.put(c.x, T + 1, c.z, BL.lantern, 4, c.ti);
      if (!road) k._occ.set(key2(c.x, c.z), gates.has(c.ti) ? OCC.GATE : OCC.WALL);
      else k._occ.set(key2(c.x, c.z), OCC.GATE);
    }
    // towers: the one at vertex i opens onto this section (and onto the previous one if it stands), the one
    // at vertex i + 1 is opened towards this section if it already stands
    const w = k.walls;
    if (!w.sec) w.sec = [];
    w.sec[i] = { t0: top[0], t1: top[n], ux, uz };
    const post = genTower(k, W, G, P, pal, i, top[0], nx, nz);
    openTower(k, P, i, top[0], -ux, -uz);
    const ip = (i - 1 + K) % K, j = (i + 1) % K;
    if (w.sec[ip] && ip !== i) openTower(k, P, i, w.sec[ip].t1, w.sec[ip].ux, w.sec[ip].uz);
    if (w.towers[j]) openTower(k, P, j, top[n], ux, uz);
    return post;
  }
  // round tower (5 wide) at a wall vertex: hollow shaft with a ladder against the outer side, a door
  // towards the town, a platform with merlons on top, the kingdom's banner outside
  function genTower(k, W, G, P, pal, i, wallTop, nx, nz) {
    const [vx, vz] = k.walls.verts[i];
    const cells = [];
    let gmin = Infinity, gmax = -Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const dd = Math.hypot(dx, dz);
      if (dd > 2.9) continue;
      const g = G(vx + dx, vz + dz);
      const y = g.water ? MC.SEA - 1 : g.y;
      gmin = Math.min(gmin, y); gmax = Math.max(gmax, y);
      cells.push({ dx, dz, dd, g, y });
    }
    const fy = gmax, T = Math.max(wallTop + 4, fy + 9);
    for (const c of cells) {
      const x = vx + c.dx, z = vz + c.dz, shell = c.dd > 1.9;
      for (let y = Math.min(c.y, gmin) - 1; y <= T; y++) {
        if (!shell && y > fy && y < T) P.put(x, y, z, 0, 2);
        else P.put(x, y, z, y === T && !shell ? pal.planks : y === wallTop - 1 && shell ? pal.wallTrim : pal.wallMix(), 2);
      }
      if (shell && ((c.dx + c.dz) & 1) === 0) P.put(x, T + 1, z, pal.wallMix(), 2);
      else P.put(x, T + 1, z, 0, 0);
      for (let y = T + 2; y <= T + 3; y++) P.put(x, y, z, 0, 0);
      k._occ.set(key2(x, z), OCC.WALL);
    }
    // outward / inward axis (the dominant component of the wall normal)
    const ox = Math.abs(nx) >= Math.abs(nz) ? Math.sign(nx) : 0, oz = Math.abs(nx) >= Math.abs(nz) ? 0 : Math.sign(nz);
    const f = Math.max(0, MC.DIRS.findIndex((d) => d[0] === ox && d[2] === oz));
    const lad = [vx + ox, vz + oz];
    for (let y = fy + 1; y <= T; y++) P.put(lad[0], y, lad[1], BL.ladder + f, 4);
    for (let s = 2; s <= 3; s++) for (let y = fy + 1; y <= fy + 2; y++) P.put(vx - ox * s, y, vz - oz * s, 0, 2);
    P.put(vx - ox * 3, fy, vz - oz * 3, pal.found(), 2);
    P.put(vx - ox, T + 1, vz - oz, BL.lantern, 4);
    for (let y = T - 3; y <= T - 1; y++) P.put(vx + ox * 3, y, vz + oz * 3, y === T - 2 ? pal.wool2 : pal.wool, 4);
    k.walls.towers[i] = { at: [vx, T, vz], fy, top: T, lad };
    return [vx + 0.5 - ox, T + 1, vz + 0.5 - oz];
  }
  // doorway from a tower onto a wall-walk at height wallTop (the walk continues towards -u), with a
  // plank landing inside the shaft at that height
  function openTower(k, P, j, wallTop, ux, uz) {
    const tw = k.walls.towers[j];
    if (!tw) return;
    const [vx, , vz] = tw.at;
    for (let s = 2; s <= 3; s++) for (let y = wallTop + 1; y <= wallTop + 2; y++) P.put(Math.round(vx - ux * s), y, Math.round(vz - uz * s), 0, 2);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (tw.lad && vx + dx === tw.lad[0] && vz + dz === tw.lad[1]) continue;
      if (wallTop > tw.fy && wallTop < tw.top) P.put(vx + dx, wallTop, vz + dz, BL.spruce_slab, 2);
    }
  }

  // ---------------------------------------------------------------- the kingdom
  const K = MC.Kingdom = {
    OCC, groundAt, isBuilt,

    siteById(gen, id) {
      const m = /^c(-?\d+),(-?\d+)$/.exec(id || '');
      return m ? Str.castleSite(gen, +m[1], +m[2]) : null;
    },
    conquered(W, id) { return W.bossesDefeated.has(id + '/boss'); },
    // conquered castle whose grounds contain (x, z)
    conqueredCastleAt(game, x, z, pad = 30) {
      const s = Str.castleAt && Str.castleAt(game.world.gen, x, z, pad);
      return s && K.conquered(game.world, s.id) ? s : null;
    },
    townRadius(k) {
      if (k._rad) return k._rad;
      let r = k.EXT + 10;
      for (const b of k.buildings) for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) r = Math.max(r, Math.hypot(x - k.cx, z - k.cz));
      for (const e of k._roadList) r = Math.max(r, Math.hypot(e[0] - k.cx, e[1] - k.cz));
      k._rad = r;
      return r;
    },
    radius(k) { return Math.min(k.EXT + 130, Math.max(k.EXT + 36, K.townRadius(k) + 18)); },
    protects(game, x, z) {
      const k = game.kingdom;
      return !!k && Math.hypot(x - k.cx, z - k.cz) < K.radius(k);
    },
    rank(k) {
      const n = k.buildings.filter((b) => b.done).length;
      let r = MC.KINGDOM_RANKS[0];
      for (const e of MC.KINGDOM_RANKS) if (n >= e[0]) r = e;
      return { name: r[1], stars: r[2], n };
    },

    // ---- founding
    found(game, site, name, color) {
      const W = game.world, plan = Str.castlePlan(W.gen, site), c = plan.k;
      const k = game.kingdom = {
        v: 1, id: site.id, name, color, theme: site.theme, cx: site.x, cz: site.z, fy: site.fy, R: site.R, rot: site.rot,
        EXT: c.EXT, moatOut: c.moatOut, gate: c.gate, dir: c.dir,
        castle: { gateIn: c.gateIn, court: c.court, keepDoor: c.keepDoor, hall: c.hall, throne: c.throne, wallPosts: c.wallPosts, huts: c.huts, fields: c.fields, patrol: c.patrol },
        seed: Math.floor(Math.random() * 1e9), style: rollStyle(site.theme),
        t: 0, dusks: 0, lastHours: game.hours, lastRaid: -1, raidsWon: 0, raidsLost: 0, fame: 0, nextUid: 1, nextBid: 1,
        buildings: [], roads: [], lamps: [], walls: null, npcs: [], center: null,
      };
      K._index(k);
      K.recolorCastle(game, k, plan, site);
      // the castle's own people: builder, guards at the gate, archers on the walls, a farmer, a smith
      const P = MC.KingdomPeople;
      if (P) {
        P.enlist(game, k, 'k_builder', { home: c.court, bld: 0 });
        P.enlist(game, k, 'k_swordsman', { home: c.gateIn, post: c.gateIn, bld: 0 });
        P.enlist(game, k, 'k_swordsman', { home: c.court, post: c.patrol[0], bld: 0 });
        P.enlist(game, k, 'k_archer', { home: c.wallPosts[0], post: c.wallPosts[0], bld: 0 });
        P.enlist(game, k, 'k_archer', { home: c.wallPosts[1], post: c.wallPosts[1], bld: 0 });
        const f = c.fields[Math.random() < 0.5 ? 0 : 1];
        P.enlist(game, k, 'k_farmer', { home: f.stand, bld: 0, farm: f.rect, chest: f.chest });
        K.place(W, f.chest[0], f.chest[1], f.chest[2], BL.chest + ((c.rot + 2) & 3));
        const smithy = c.huts.find((h) => h.kind === 'smithy');
        if (smithy) P.enlist(game, k, 'k_smith', { home: smithy.at, work: smithy.at, bld: 0 });
      }
      // the builders start with a plaza in front of the gate and the main street leading to it
      const dist = 20 + Math.random() * 10, side = (Math.random() - 0.5) * 18;
      const anchor = [k.gate[0] + k.dir[0] * dist - k.dir[1] * side, k.gate[2] + k.dir[1] * dist + k.dir[0] * side];
      if (!K.order(game, 'plaza', { free: true, anchor, silent: true }).ok) K.order(game, 'plaza', { free: true, silent: true });
      game.world.editsDirty = true;
      return k;
    },
    // flags, banners and carpets of the castle take the kingdom's colours
    recolorCastle(game, k, plan, site) {
      const W = game.world, T = MC.CASTLE_THEMES[site.theme];
      const nw = BL['wool_' + k.color], sec = k.color === 'white' ? BL.wool_yellow : k.color === 'yellow' ? BL.wool_white : BL.wool_yellow;
      const map = new Map([[BL[T.flag], nw], [BL[T.banner[0]], nw], [BL[T.banner[1]], sec]]);
      if (BL['carpet_' + k.color]) map.set(BL[T.carpet], BL['carpet_' + k.color]);
      for (const [ck, e] of plan.byChunk) {
        const cx = Math.floor(ck / 65536) - 32768, cz = (ck % 65536) - 32768;
        for (const v of e.cells) {
          const id = v >>> 16, to = map.get(id);
          if (to === undefined || to === id) continue;
          const li = v & 0xffff, x = cx * 16 + (li & 15), z = cz * 16 + ((li >> 4) & 15), y = li >> 8;
          const c = W.getChunk(cx, cz);
          if (c && c.blocks[li] !== id) continue;
          K.place(W, x, y, z, to);
        }
      }
    },

    // ---- construction orders
    count(k, type, done) { return k.buildings.filter((b) => b.type === type && (!done || b.done)).length; },
    maxOf(k, type) { return type === 'wall' ? (k.walls ? k.walls.verts.length : 9) : MC.KINGDOM_BUILDINGS[type].max; },
    // what stops an order right now (null = fine)
    blocker(game, type, o = {}) {
      const k = game.kingdom, def = MC.KINGDOM_BUILDINGS[type], p = game.player;
      if (!k || !def) return '王国がない';
      if (K.count(k, type) >= K.maxOf(k, type)) return type === 'wall' ? '城壁はすべて築かれた' : 'これ以上建てられない';
      if (def.need) for (const t in def.need) if (K.count(k, t, true) < def.need[t]) return `${MC.KINGDOM_BUILDINGS[t].name}が${def.need[t]}つ必要`;
      if (k.buildings.filter((b) => !b.done).length >= 4) return '依頼中の工事が多すぎる';
      if (!o.free && !p.creative) for (const [key, n] of def.cost) if (p.inv.count(MC.Crafting.matcher(key)) < n) return '資材が足りない';
      return null;
    },
    order(game, type, o = {}) {
      const k = game.kingdom, W = game.world, def = MC.KINGDOM_BUILDINGS[type], p = game.player;
      const why = K.blocker(game, type, o);
      if (why) return { ok: false, msg: why };
      const G = groundCache(W);
      const P = new Plan(), rnd = Math.random;
      let bld;
      if (type === 'wall') {
        if (!k.walls) planRing(k, W, G);
        const i = k.walls.built.findIndex((b, j) => !b && !k.buildings.some((q) => q.type === 'wall' && q.seg === j));
        if (i < 0) return { ok: false, msg: '城壁はすべて築かれた' };
        const pal = palette(k, rnd);
        const post = genWall(k, W, G, P, pal, i);
        const [vx, vz] = k.walls.verts[i];
        bld = { type, seg: i, x0: vx - 3, z0: vz - 3, x1: vx + 3, z1: vz + 3, fy: post[1], center: post, people: [{ type: 'k_archer', home: post, post }] };
      } else {
        // strict first; on rough land accept steeper sites (plinths and terraces take up the slope)
        let site = findSite(k, W, G, type, o);
        if (!site) site = findSite(k, W, G, type, Object.assign({}, o, { relax: 3, tries: 200 }));
        if (!site) site = findSite(k, W, G, type, Object.assign({}, o, { relax: 6, tries: 260 }));
        if (!site) return { ok: false, msg: '適した土地が見つからなかった' };
        site.opt = rollOpt(type, k, rnd, site.fy);
        const L = frame(P, site.ox, site.fy, site.oz, site.w, site.d, site.rot);
        const C = context(k, W, G, P, L, site, rnd);
        GEN[type](C);
        const [x0, z0, x1, z1] = site.rect;
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) k._occ.set(key2(x, z), type === 'farm' ? OCC.FARM : OCC.BLD);
        road(k, W, G, P, C.pal, site.start[0], site.start[1], site.fy, SPEC[type].rank === 0 ? 0 : 1);
        bld = { type, x0, z0, x1, z1, fy: site.fy, rot: site.rot, w: site.w, d: site.d, center: L.pos(site.w >> 1, 1, site.d >> 1), door: L.pos(site.w >> 1, 1, -1),
          people: C.meta.people, chimneys: C.meta.chimneys, smoke: C.meta.smoke, farm: C.meta.farm || null, chest: C.meta.chest || null };
        if (C.meta.setCenter) k.center = C.meta.center;
        if (C.meta.center) bld.plaza = C.meta.center;
      }
      if (!o.free && !p.creative) for (const [key, n] of def.cost) p.inv.remove(MC.Crafting.matcher(key), n);
      bld.id = k.nextBid++;
      bld.done = false; bld.q = P.queue(); bld.qi = 0;
      k.buildings.push(bld);
      k._rad = 0;
      if (p.onChange) p.onChange();
      if (!o.silent && game.ui) game.ui.toast(`${def.name}の建設が始まった`, '建築家が資材を受け取り、工事に取りかかった');
      if (MC.Audio) MC.Audio.play('hammer', null, 0.6);
      game.world.editsDirty = true;
      return { ok: true, b: bld };
    },

    // ---- block placement (loaded chunks directly, others through the saved edits)
    place(W, x, y, z, id) {
      if (y < 1 || y >= MC.HEIGHT - 1) return false;
      const c = W.getChunk(x >> 4, z >> 4);
      if (c) {
        const old = c.blocks[(x & 15) + (z & 15) * 16 + y * 256];
        if (old === id) return false;
        if (MC.B_HARD[old] < 0 && !MC.B_FLUID[old]) return false;   // bedrock, the vault's rune stone
        W.setBlock(x, y, z, id, MC.SB.DEFER | MC.SB.NOUPDATE);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = W.getChunk((x >> 4) + dx, (z >> 4) + dz); if (n) n.simDirty = true; }
        return true;
      }
      const ck = MC.World.key(x >> 4, z >> 4);
      if (!W.edits.has(ck)) W.edits.set(ck, new Map());
      W.edits.get(ck).set((x & 15) + (z & 15) * 16 + y * 256, id);
      W.editsDirty = true;
      return true;
    },
    current(k) { return k.buildings.find((b) => !b.done) || null; },
    progress(b) { return b.done ? 1 : b.q && b.q.length ? b.qi / (b.q.length / 4) : 0; },
    _construct(game, k, dt) {
      const b = K.current(k);
      if (!b) return;
      const W = game.world, q = b.q, n = q.length / 4;
      const builder = MC.KingdomPeople && MC.KingdomPeople.builderAt(k, b);
      const rate = 22 * (game.player.creative ? 3 : 1) * (builder ? 1.5 : 1);
      b._acc = (b._acc || 0) + dt * rate;
      let budget = Math.floor(b._acc), iter = 0, last = null;
      b._acc -= budget;
      while (budget > 0 && b.qi < n && iter++ < 5000) {
        const i = b.qi++ * 4;
        if (K.place(W, q[i], q[i + 1], q[i + 2], q[i + 3])) { budget--; last = i; }
      }
      k._fxT = (k._fxT || 0) - dt;
      if (last !== null && k._fxT <= 0) {
        k._fxT = 0.22;
        const x = q[last] + 0.5, y = q[last + 1] + 0.5, z = q[last + 2] + 0.5, id = q[last + 3];
        if (game.particles) game.particles.smoke(x, y, z, 1, 0.6);
        if (MC.Audio) { if (id) MC.Audio.block('place', MC.B_SOUND[id], [x, y, z], 0.45); if (Math.random() < 0.35) MC.Audio.play('hammer', [x, y, z], 0.5); }
      }
      if (b.qi >= n) K._complete(game, k, b);
    },
    _complete(game, k, b) {
      b.done = true; b.q = null; b.qi = 0;
      const def = MC.KINGDOM_BUILDINGS[b.type];
      k.fame += def.fame || 3;
      if (b.type === 'wall') k.walls.built[b.seg] = true;
      if (b.type === 'forge') k.bonus = 2;
      const P = MC.KingdomPeople;
      const names = [];
      if (P) for (const pp of b.people || []) { const e = P.enlist(game, k, pp.type, Object.assign({}, pp, { bld: b.id })); if (e) names.push(MC.MOB_TYPES[pp.type].name); }
      const sub = names.length ? `${[...new Set(names)].map((nm) => nm + '×' + names.filter((x) => x === nm).length).join('・')} が王国に加わった` : '王国の名声が高まった';
      if (game.ui) game.ui.toast(`${def.name}が完成した！`, sub);
      if (MC.Audio) MC.Audio.play('levelup', b.center, 1);
      if (game.particles && b.center) game.particles.sparkle(b.center[0], b.center[1] + 1, b.center[2], 24, [1.2, 1, 0.5]);
      game.world.editsDirty = true;
    },

    // ---- per frame
    // the lord of a castle fell: announce the conquest, then offer to found the kingdom there
    onConquer(game, id) {
      game.pendingFound = { id, t: 5.5, toasted: false };
      game.world.editsDirty = true;
    },
    update(game, dt) {
      const pf = game.pendingFound;
      if (pf) {
        pf.t -= dt;
        if (!pf.toasted && pf.t <= 3) {
          pf.toasted = true;
          const site = K.siteById(game.world.gen, pf.id);
          if (game.ui) game.ui.toast(`${site ? site.name : '城'}を制圧した！`, game.kingdom ? '城に残っていた魔物たちは逃げ去った' : '玉座の間で、またはLキーで建国を宣言できる');
          if (MC.Audio) MC.Audio.play('horn', null, 0.8, 1.2);
        }
        if (pf.t <= 0 && game.state === 'playing' && !game.player.dead) {
          game.pendingFound = null;
          if (!game.kingdom && MC.KingdomUI) MC.KingdomUI.openFound(game, pf.id);
        }
      }
      const k = game.kingdom;
      if (!k) return;
      k.t += dt;
      K._construct(game, k, dt);
      if (MC.KingdomPeople) MC.KingdomPeople.update(game, k, dt);
      // chimney smoke and the forge's glow
      k._smokeT = (k._smokeT || 0) - dt;
      if (k._smokeT <= 0 && game.particles) {
        k._smokeT = 0.35;
        const P = game.player.pos;
        for (const b of k.buildings) {
          if (!b.done || Math.hypot(b.center[0] - P[0], b.center[2] - P[2]) > 72) continue;
          for (const c of b.chimneys || []) if (Math.random() < 0.6) game.particles.smoke(c[0] + 0.5, c[1], c[2] + 0.5, 1, 0.9);
          for (const c of b.smoke || []) if (Math.random() < 0.4) game.particles.flame(c[0] + 0.3 + Math.random() * 0.4, c[1] + 0.1, c[2] + 0.5, 1);
        }
      }
    },

    // ---- occupancy / street index (rebuilt after loading)
    _index(k) {
      k._occ = new Map(); k._roads = new Map(); k._roadList = []; k._rad = 0;
      for (const b of k.buildings) {
        if (b.type === 'wall') continue;
        for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) k._occ.set(key2(x, z), b.type === 'farm' ? OCC.FARM : OCC.BLD);
      }
      const r = k.roads;
      for (let i = 0; i < r.length; i += 4) {
        const kk = key2(r[i], r[i + 1]);
        k._roads.set(kk, { y: r[i + 2], rank: r[i + 3] });
        k._roadList.push([r[i], r[i + 1], r[i + 2], r[i + 3]]);
        k._occ.set(kk, OCC.ROAD);
      }
      for (let i = 0; i < k.lamps.length; i += 2) k._occ.set(key2(k.lamps[i], k.lamps[i + 1]), OCC.LAMP);
      if (k.walls) for (const c of k.walls.cells || []) k._occ.set(key2(c[0], c[1]), c[2]);
    },

    // ---- save / load
    serialize(game) {
      const k = game.kingdom;
      if (!k) return null;
      if (MC.KingdomPeople) MC.KingdomPeople.sync(game, k);
      const out = {};
      for (const key in k) if (key[0] !== '_' && key !== 'raid') out[key] = k[key];
      out.buildings = k.buildings.map((b) => {
        const o = Object.assign({}, b);
        for (const kk in o) if (kk[0] === '_') delete o[kk];
        if (b.q) {
          const s = [];
          for (let i = 0; i < b.q.length; i += 4) s.push((((b.q[i] - b.x0 + 2048) * 4096 + (b.q[i + 2] - b.z0 + 2048)) * 65536 + b.q[i + 1] * 256 + b.q[i + 3]).toString(36));
          o.q = s.join(',');
        }
        return o;
      });
      if (k.walls) {
        const cells = [];
        for (const [kk, v] of k._occ) if (v === OCC.WALL || v === OCC.GATE) {
          const x = Math.floor(kk / 2097152) - 1048576, z = (kk % 2097152) - 1048576;
          if (v === OCC.GATE && k._roads.has(kk)) continue;
          cells.push([x, z, v]);
        }
        out.walls = Object.assign({}, k.walls, { cells });
      }
      return out;
    },
    load(game, data) {
      if (!data || !data.id) return;
      const k = data;
      k.lamps = k.lamps || [];
      k.roads = k.roads || [];
      for (const b of k.buildings) {
        if (typeof b.q === 'string') {
          const q = [];
          for (const s of b.q.split(',')) {
            const n = parseInt(s, 36), id = n % 256, y = Math.floor(n / 256) % 256, r = Math.floor(n / 65536);
            q.push(Math.floor(r / 4096) - 2048 + b.x0, y, (r % 4096) - 2048 + b.z0, id);
          }
          b.q = q;
        }
      }
      K._index(k);
      game.kingdom = k;
      if (MC.KingdomPeople) MC.KingdomPeople.loaded(game, k);
    },

    // ---- helpers for the people
    randomStreet(k, near, maxD) {
      const list = k._roadList;
      if (!list.length) return null;
      for (let t = 0; t < 12; t++) {
        const r = list[Math.floor(Math.random() * list.length)];
        if (!near || Math.hypot(r[0] - near[0], r[1] - near[2]) <= maxD) return [r[0] + 0.5, r[2] + 1, r[1] + 0.5];
      }
      return null;
    },
    home(k) { return k.castle.hall || k.castle.keepDoor; },
    meetingPoint(k) { return k.center || k.gate; },
  };
})();
