'use strict';
// Castles: five kinds of small / medium medieval castles, each matched to a landscape — the fallen knights'
// castle on the plains, the necromancer's cursed castle in the forest, the sand king's fortress in the desert,
// the frost queen's castle in the snow and the fire demon's castle on scorched hills.
// Every castle has a moat and a bridge, stone curtain walls with a wall-walk, round corner towers and a
// gatehouse, a courtyard with fields, outbuildings and a well, a three-storey keep (great hall, barracks /
// library / armory, throne room with the castle's captain) and a two-level dungeon beneath it: a maze of
// prison / crypt / store rooms and, deeper down, the lord's arena in front of the sealed treasure vault.
// Plans are deterministic per grid cell, cached, and stamped chunk by chunk like villages.
(function () {
  const Str = MC.Structures;
  const CCELL = 352;
  const BI = MC.BIOME;
  const hAt = (gen, x, z) => Math.floor(gen.height(x, z));
  const bid = (k) => { const v = MC.BLOCK[k]; if (v === undefined) throw new Error('unknown castle block ' + k); return v; };

  // ---------------------------------------------------------------- themes
  const THEMES = MC.CASTLE_THEMES = {
    knight: {
      name: '黒鉄騎士団の古城', sub: '堕ちた騎士団が守る城。本丸の地下深くで黒騎士が待つ',
      wall: [['stone_bricks', 70], ['mossy_stone_bricks', 15], ['cracked_stone_bricks', 15]],
      dwall: [['stone_bricks', 50], ['mossy_stone_bricks', 22], ['cracked_stone_bricks', 22], ['cobblestone', 6]],
      dfloor: [['stone_bricks', 55], ['cobblestone', 30], ['mossy_cobblestone', 15]],
      ground: 'grass', fill: 'dirt', moatBed: 'dirt', accent: 'chiseled_stone_bricks', trim: 'smooth_stone', found: 'cobblestone', pillar: 'spruce_log',
      path: 'dirt_path', floor: 'spruce_planks', floor2: 'oak_planks', stairs: 'stone_brick_stairs', slab: 'stone_brick_slab', fence: 'spruce_fence',
      window: 'glass_pane', hutWall: 'oak_planks', hutLog: 'spruce_log', hutStairs: 'spruce_stairs', hutSlab: 'spruce_slab',
      roof: 'cone', roofBlock: 'spruce_planks', flag: 'wool_red', carpet: 'carpet_red', banner: ['wool_red', 'wool_yellow'],
      moat: 'water', bridge: 'spruce_planks', lamp: 'lantern', deco: 'dummies',
      mobs: { melee: ['undead_knight', 'undead_knight', 'zombie'], ranged: ['skeleton'], caster: [] },
      spawn: ['undead_knight', 'skeleton', 'zombie'], mid: 'knight_captain', boss: 'black_knight', vault: 'vault_knight',
    },
    necro: {
      name: '死霊術師の呪われた城', sub: '死者がさまよう呪われた城。地下では死霊王が儀式を続けている',
      wall: [['mossy_stone_bricks', 30], ['cracked_stone_bricks', 25], ['stone_bricks', 20], ['mossy_cobblestone', 15], ['cobblestone', 10]],
      dwall: [['mossy_cobblestone', 30], ['cobblestone', 30], ['cracked_stone_bricks', 25], ['mossy_stone_bricks', 15]],
      dfloor: [['cobblestone', 45], ['mossy_cobblestone', 35], ['bone_block', 5], ['cracked_stone_bricks', 15]],
      ground: [['grass', 70], ['dirt', 30]], fill: 'dirt', moatBed: 'dirt', accent: 'obsidian', trim: 'dark_bricks', found: 'mossy_cobblestone', pillar: 'bone_block',
      path: 'gravel', floor: 'spruce_planks', floor2: 'spruce_planks', stairs: 'cobblestone_stairs', slab: 'cobblestone_slab', fence: 'spruce_fence',
      window: 'iron_bars', hutWall: 'cobblestone', hutLog: 'spruce_log', hutStairs: 'spruce_stairs', hutSlab: 'spruce_slab',
      roof: 'crenel', roofBlock: 'dark_bricks', flag: 'wool_purple', carpet: 'carpet_purple', banner: ['wool_purple', 'wool_black'],
      moat: 'water', bridge: 'spruce_planks', lamp: 'jack_o_lantern', deco: 'graves', crop: 'pumpkin',
      mobs: { melee: ['ghoul', 'ghoul', 'zombie'], ranged: ['skeleton'], caster: ['cultist'] },
      spawn: ['ghoul', 'skeleton', 'zombie'], mid: 'dark_priest', boss: 'necromancer', vault: 'vault_necro',
    },
    desert: {
      name: '砂塵王の城塞', sub: '砂に埋もれた王の城塞。地下の大広間で砂塵王が目覚めを待つ',
      wall: [['sandstone', 70], ['cut_sandstone', 30]],
      dwall: [['sandstone', 50], ['cut_sandstone', 40], ['chiseled_sandstone', 10]],
      dfloor: [['cut_sandstone', 60], ['sandstone', 40]],
      ground: 'sand', fill: 'sand', moatBed: 'sand', accent: 'chiseled_sandstone', trim: 'cut_sandstone', found: 'sandstone', pillar: 'chiseled_sandstone',
      path: 'cut_sandstone', floor: 'cut_sandstone', floor2: 'smooth_stone', stairs: 'sandstone_stairs', slab: 'sandstone_slab', fence: 'oak_fence',
      window: 'glass_pane', hutWall: 'sandstone', hutLog: 'cut_sandstone', hutStairs: 'sandstone_stairs', hutSlab: 'sandstone_slab', flatRoofs: true,
      roof: 'dome', roofBlock: 'cut_sandstone', flag: 'wool_light_blue', carpet: 'carpet_yellow', banner: ['wool_light_blue', 'wool_yellow'],
      moat: 'dry', bridge: 'cut_sandstone', lamp: 'lantern', deco: 'oasis', crop: 'melon',
      mobs: { melee: ['mummy', 'mummy', 'scorpion'], ranged: ['skeleton'], caster: [] },
      spawn: ['mummy', 'scorpion', 'skeleton'], mid: 'tomb_warden', boss: 'sand_king', vault: 'vault_desert',
    },
    frost: {
      name: '氷雪の城', sub: '永久凍土に閉ざされた城。地下の氷の広間に氷の女王が君臨する',
      wall: [['frost_bricks', 78], ['packed_ice', 10], ['stone_bricks', 12]],
      dwall: [['frost_bricks', 55], ['packed_ice', 25], ['stone_bricks', 20]],
      dfloor: [['frost_bricks', 50], ['packed_ice', 50]],
      ground: 'snowy_grass', fill: 'dirt', moatBed: 'dirt', accent: 'packed_ice', trim: 'snow', found: 'stone_bricks', pillar: 'packed_ice',
      path: 'gravel', floor: 'spruce_planks', floor2: 'spruce_planks', stairs: 'frost_brick_stairs', slab: 'frost_brick_slab', fence: 'spruce_fence',
      window: 'glass_pane', hutWall: 'spruce_planks', hutLog: 'spruce_log', hutStairs: 'spruce_stairs', hutSlab: 'spruce_slab',
      roof: 'cone', roofBlock: 'packed_ice', flag: 'wool_light_blue', carpet: 'carpet_light_blue', banner: ['wool_light_blue', 'wool_white'],
      moat: 'ice', bridge: 'spruce_planks', lamp: 'lantern', deco: 'ice',
      mobs: { melee: ['frozen_zombie', 'frozen_zombie'], ranged: ['frost_skeleton'], caster: [] },
      spawn: ['frozen_zombie', 'frost_skeleton'], mid: 'ice_knight', boss: 'frost_queen', vault: 'vault_frost',
    },
    volcano: {
      name: '炎魔の城', sub: '溶岩の堀に囲まれた魔の城。地の底で炎魔イフリートが燃え盛る',
      wall: [['dark_bricks', 72], ['cracked_dark_bricks', 22], ['obsidian', 6]],
      dwall: [['dark_bricks', 50], ['cracked_dark_bricks', 32], ['obsidian', 8], ['magma_block', 10]],
      dfloor: [['dark_bricks', 55], ['cracked_dark_bricks', 30], ['magma_block', 15]],
      ground: [['gravel', 35], ['dirt', 35], ['cobblestone', 20], ['magma_block', 10]], fill: 'dirt', moatBed: 'obsidian', accent: 'obsidian', trim: 'magma_block', found: 'cracked_dark_bricks', pillar: 'obsidian',
      path: 'dark_bricks', floor: 'dark_bricks', floor2: 'spruce_planks', stairs: 'dark_brick_stairs', slab: 'dark_brick_slab', fence: 'spruce_fence',
      window: 'iron_bars', hutWall: 'dark_bricks', hutLog: 'obsidian', hutStairs: 'dark_brick_stairs', hutSlab: 'dark_brick_slab',
      roof: 'crenel', roofBlock: 'dark_bricks', flag: 'wool_red', carpet: 'carpet_black', banner: ['wool_red', 'wool_black'],
      moat: 'lava', bridge: 'dark_bricks', lamp: 'lantern', deco: 'lava',
      mobs: { melee: ['magma_brute'], ranged: ['flame_skeleton', 'flame_skeleton'], caster: [] },
      spawn: ['flame_skeleton', 'magma_brute'], mid: 'brute_chief', boss: 'fire_demon', vault: 'vault_volcano',
    },
  };
  function pickTheme(biome, h) {
    switch (biome) {
      case BI.DESERT: return 'desert';
      case BI.SNOWY: case BI.TAIGA: return 'frost';
      case BI.MOUNTAIN: return 'volcano';
      case BI.PLAINS: return h < 0.55 ? 'knight' : 'volcano';
      case BI.FOREST: case BI.BIRCH: return h < 0.68 ? 'necro' : 'knight';
    }
    return null;
  }

  // ---------------------------------------------------------------- sites
  function castleSite(gen, gx, gz) {
    const k = 'c' + gx + ',' + gz;
    if (Str._sites.has(k)) return Str._sites.get(k);
    let site = null;
    const seed = gen.seed;
    if (MC.hash2(gx, gz, seed + 9001) < 0.8) {
      const x = gx * CCELL + 72 + Math.floor(MC.hash2(gx, gz, seed + 9002) * (CCELL - 144));
      const z = gz * CCELL + 72 + Math.floor(MC.hash2(gx, gz, seed + 9003) * (CCELL - 144));
      const info = gen.columnInfo(x, z);
      const theme = pickTheme(info.biome, MC.hash2(gx, gz, seed + 9004));
      if (theme && info.h >= MC.SEA + 2 && info.h <= MC.SEA + 52) {
        const R = 18 + 2 * Math.floor(MC.hash2(gx, gz, seed + 9005) * 4);
        const hs = [];
        let water = 0;
        for (let a = 0; a < 16; a++) {
          const ang = a / 16 * Math.PI * 2;
          for (const f of [0.35, 0.7, 1.05]) {
            const h = hAt(gen, x + Math.round(Math.cos(ang) * R * f), z + Math.round(Math.sin(ang) * R * f));
            hs.push(h);
            if (h < MC.SEA) water++;
          }
        }
        hs.sort((p, q) => p - q);
        let ok = water <= 4 && hs[hs.length - 3] - hs[2] <= 18;
        for (const [vx, vz] of Str._cellsAround(x, z, Str.VCELL, 200)) {
          const v = Str.villageSite(gen, vx, vz);
          if (v && Math.hypot(v.x - x, v.z - z) < 170) ok = false;
        }
        if (ok) {
          const fy = Math.max(MC.SEA + 1, hs[hs.length >> 1]);
          site = { type: 'castle', gx, gz, x, z, h: info.h, fy, R, theme, rot: Math.floor(MC.hash2(gx, gz, seed + 9006) * 4), id: k, name: THEMES[theme].name };
        }
      }
    }
    Str._sites.set(k, site);
    return site;
  }
  function castlesAround(gen, x, z, pad) {
    const out = [];
    for (const [gx, gz] of Str._cellsAround(x, z, CCELL, pad + 40)) {
      const s = castleSite(gen, gx, gz);
      if (s && Math.abs(s.x - x) < s.R + pad && Math.abs(s.z - z) < s.R + pad) out.push(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- plan
  const plans = new Map();
  const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

  // local builder: (lx, lz) relative to the castle centre, front (gate) towards -z, rotated by r quarter turns
  function builder(cv, cx, cz, fy, r) {
    const tf = (lx, lz) => { let x = lx, z = lz; for (let i = 0; i < r; i++) { const t = x; x = -z; z = t; } return [cx + x, cz + z]; };
    const b = {
      tf,
      put(lx, ly, lz, v) { const [x, z] = tf(lx, lz); cv.put(x, fy + ly, z, v ? MC.rotateBlock(v, r) : 0); },
      get(lx, ly, lz) { const [x, z] = tf(lx, lz); return cv.get(x, fy + ly, z); },
      fill(x0, y0, z0, x1, y1, z1, v) {
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) b.put(x, y, z, typeof v === 'function' ? v(x, y, z) : v);
      },
      world(lx, ly, lz) { const [x, z] = tf(lx, lz); return [x, fy + ly, z]; },
      chest(lx, ly, lz, facing, table) {
        const [x, z] = tf(lx, lz);
        cv.put(x, fy + ly, z, MC.rotateBlock(MC.BLOCK.chest + facing, r));
        if (table) cv.loot.push([x, fy + ly, z, table]);
      },
      spawner(lx, ly, lz, type) { const [x, z] = tf(lx, lz); cv.put(x, fy + ly, z, MC.BLOCK.spawner); cv.spawners.push([x, fy + ly, z, type]); },
    };
    return b;
  }
  function materials(T, rnd) {
    const mix = (spec) => {
      if (typeof spec === 'string') { const v = bid(spec); return () => v; }
      const list = spec.map(([k, w]) => [bid(k), w]);
      const tot = list.reduce((a, e) => a + e[1], 0);
      return () => { let x = rnd() * tot; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; };
    };
    const M = { wall: mix(T.wall), dwall: mix(T.dwall), dfloor: mix(T.dfloor), ground: mix(T.ground) };
    for (const k of ['accent', 'trim', 'found', 'pillar', 'fill', 'moatBed', 'path', 'floor', 'floor2', 'stairs', 'slab', 'fence', 'window', 'hutWall', 'hutLog',
      'hutStairs', 'hutSlab', 'roofBlock', 'flag', 'carpet', 'bridge', 'lamp']) M[k] = bid(T[k]);
    M.banner = T.banner.map(bid);
    return M;
  }

  function castlePlan(gen, site) {
    const cached = plans.get(site.id);
    if (cached) return cached;
    const T = THEMES[site.theme], B = MC.BLOCK;
    const rnd = MC.mulberry32((site.gx * 50331653) ^ (site.gz * 12582917) ^ (gen.seed + 3131));
    const cv = new Str.Canvas(site.x, site.z);
    const R = site.R, fy = site.fy;
    const b = builder(cv, site.x, site.z, fy, site.rot);
    const M = materials(T, rnd);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const TR = R >= 22 ? 4 : 3;               // corner tower radius
    const WH = R >= 22 ? 9 : 8;               // curtain wall height (wall-walk surface)
    const TH = WH + 6;                        // tower roof
    const Q = R - 3;                          // courtyard half size
    const KW = R >= 22 ? 15 : 13, KD = KW;    // keep footprint
    const kx0 = -(KW - 1) / 2, kx1 = (KW - 1) / 2, kz1 = R - 4, kz0 = kz1 - KD + 1;
    const moatIn = R + TR, moatOut = moatIn + 3, EXT = moatOut + 11;
    const Y1 = -11, Y2 = -23;                 // dungeon levels (floor blocks)
    const plan = { id: site.id, type: 'castle', theme: site.theme, name: T.name, sub: T.sub, x: site.x, z: site.z, fy, R, groups: [], bosses: [] };
    const group = (name, ax, ay, az, rad, dy) => { const g = { name, at: b.world(ax, ay, az), rad, dy, mobs: [] }; plan.groups.push(g); return g; };
    const G = {
      outer: group('outer', 0, 1, 0, R + 26, 16),
      keep: group('keep', 0, 9, (kz0 + kz1) / 2, KW / 2 + 5, 11),
      b1: group('b1', 0, Y1 + 1, 0, R + 10, 6),
    };
    const mob = (g, lx, ly, lz, type) => { const [x, y, z] = b.world(lx, ly, lz); g.mobs.push([x + 0.5, y, z + 0.5, type]); };
    const melee = () => pick(T.mobs.melee), ranged = () => pick(T.mobs.ranged);
    const anyMob = () => (T.mobs.caster.length && rnd() < 0.3 ? pick(T.mobs.caster) : rnd() < 0.3 ? ranged() : melee());
    const stairs = (base, f) => base + (f & 3);
    const lamp = (lx, lz, y0 = 1) => { b.put(lx, y0, lz, M.fence); b.put(lx, y0 + 1, lz, M.fence); b.put(lx, y0 + 2, lz, M.lamp); };
    const wool = (lx, ly, lz, mid) => b.put(lx, ly, lz, mid ? M.banner[1] : M.banner[0]);

    // ================================================================ terrain: plateau, moat, blended apron
    for (let lz = -EXT; lz <= EXT; lz++) for (let lx = -EXT; lx <= EXT; lx++) {
      const d = Math.max(Math.abs(lx), Math.abs(lz));
      const [wx, wz] = b.tf(lx, lz);
      const tth = hAt(gen, wx, wz) - fy;
      let top = 0;
      if (d > moatOut + 2) top = Math.round(tth * MC.smoothstep(0, 1, (d - moatOut - 2) / (EXT - moatOut - 2)));
      for (let y = top + 1; y <= Math.max(tth, top) + 2; y++) b.put(lx, y, lz, 0);
      for (let y = tth + 1; y < top; y++) b.put(lx, y, lz, y >= top - 3 ? M.fill : B.stone);
      // the castle's ground fades into the natural surface on the outer slope
      let g = M.ground();
      if (d > moatOut + 2 && rnd() < (d - moatOut - 2) / (EXT - moatOut - 2) * 1.4) {
        const h = top + fy, cl = gen.climate(wx, wz, h), bi = gen.biome(h, cl.temp, cl.hum);
        g = bi === BI.DESERT || bi === BI.BEACH || bi === BI.OCEAN ? B.sand : bi === BI.SNOWY || bi === BI.TAIGA ? B.snowy_grass : B.grass;
      }
      b.put(lx, top, lz, g);
    }
    if (T.moat) for (let lz = -moatOut; lz <= moatOut; lz++) for (let lx = -moatOut; lx <= moatOut; lx++) {
      const d = Math.max(Math.abs(lx), Math.abs(lz));
      if (d < moatIn) continue;
      const fluid = T.moat === 'lava' ? B.lava : T.moat === 'dry' ? 0 : B.water;
      b.put(lx, -4, lz, M.moatBed);
      for (let ly = -3; ly <= -1; ly++) b.put(lx, ly, lz, fluid);
      if (T.moat === 'ice') b.put(lx, -1, lz, B.ice);
      b.put(lx, 0, lz, 0);
    }
    // bridge
    for (let lz = -(moatOut + 1); lz <= -(R + 1); lz++) for (let lx = -2; lx <= 2; lx++) {
      b.put(lx, 0, lz, M.bridge);
      if (Math.abs(lx) === 2 && lz >= -moatOut && lz <= -moatIn) b.put(lx, 1, lz, M.fence);
    }
    lamp(-2, -(moatOut + 1)); lamp(2, -(moatOut + 1));

    // ================================================================ curtain walls
    for (let lz = -R; lz <= R; lz++) for (let lx = -R; lx <= R; lx++) {
      const d = Math.max(Math.abs(lx), Math.abs(lz));
      if (d < R - 2) continue;
      for (let ly = -3; ly <= WH; ly++) b.put(lx, ly, lz, d === R && ly <= 1 ? M.found : d === R && ly === WH - 1 ? M.trim : M.wall());
      if (d === R && (Math.abs(lx) + Math.abs(lz)) % 2 === 0) b.put(lx, WH + 1, lz, M.wall());
    }
    // wall-walk lanterns and outer buttresses / heraldic banners
    for (let a = -R + 6; a <= R - 6; a += 6) {
      for (const [lx, lz] of [[a, R - 2], [-(R - 2), a], [R - 2, a]]) b.put(lx, WH + 1, lz, B.lantern);
      if (Math.abs(a) > 7) b.put(a, WH + 1, -(R - 2), B.lantern);
    }
    for (const [ux, uz, nx, nz] of [[1, 0, 0, 1], [0, 1, -1, 0], [0, 1, 1, 0]]) {
      // banner in the middle of the back / side walls
      for (let t = -1; t <= 1; t++) for (let ly = WH - 5; ly <= WH - 2; ly++) wool(ux * t + nx * R, ly, uz * t + nz * R, t === 0);
      for (let a = -R + 7; a <= R - 7; a += 7) {
        if (Math.abs(a) < 3) continue;
        const bx = ux * a + nx * (R + 1), bz = uz * a + nz * (R + 1);
        for (let ly = 0; ly <= WH - 3; ly++) b.put(bx, ly, bz, M.wall());
        b.put(bx, WH - 2, bz, M.slab);
      }
    }

    // ================================================================ corner towers
    const tower = (sx, sz) => {
      const tx = sx * (R - 2), tz = sz * (R - 2), ri = TR - 0.5, ro = TR + 0.5, a = TR - 1;
      const inT = (dx, dz) => Math.hypot(dx, dz) <= ro;
      const isShell = (dx, dz) => { const d = Math.hypot(dx, dz); return d > ri && d <= ro; };
      for (let dz = -TR; dz <= TR; dz++) for (let dx = -TR; dx <= TR; dx++) {
        if (!inT(dx, dz)) continue;
        const shell = isShell(dx, dz);
        for (let ly = -3; ly <= TH; ly++) {
          let v;
          if (shell) v = ly <= 1 ? M.found : ly === WH - 1 || ly === TH - 1 ? M.trim : M.wall();
          else v = ly < 0 ? M.wall() : ly === 0 || ly === WH || ly === TH ? M.floor : 0;
          b.put(tx + dx, ly, tz + dz, v);
        }
        if (shell && T.roof === 'crenel' && ((dx + dz) & 1) === 0) b.put(tx + dx, TH + 1, tz + dz, M.wall());
      }
      // ground door towards the courtyard, wall-walk doors towards both adjacent walls
      for (let k = 1; k <= TR + 1; k++) {
        if (isShell(-sx * k, -2 * sz)) for (let ly = 1; ly <= 2; ly++) b.put(tx - sx * k, ly, tz - 2 * sz, 0);
        for (const o of [0, 1]) {
          if (isShell(-sx * k, sz * o)) for (let ly = WH + 1; ly <= WH + 2; ly++) b.put(tx - sx * k, ly, tz + sz * o, 0);
          if (isShell(sx * o, -sz * k)) for (let ly = WH + 1; ly <= WH + 2; ly++) b.put(tx + sx * o, ly, tz - sz * k, 0);
        }
      }
      // ladder along the outer side, windows
      const lf = sx > 0 ? 3 : 1;
      for (let ly = 1; ly <= TH; ly++) b.put(tx + sx * a, ly, tz, B.ladder + lf);
      for (const ly of [3, WH + 3]) { b.put(tx + sx * TR, ly, tz + sz, M.window); b.put(tx + sx, ly, tz + sz * TR, M.window); }
      b.put(tx - sx, WH - 1, tz - sz, B.hanging_lantern);
      // roof
      if (T.roof === 'cone' || T.roof === 'dome') {
        for (let k = 0; ; k++) {
          const rr = T.roof === 'cone' ? ro + 0.6 - k * 0.9 : Math.sqrt(Math.max(0, (ro + 0.4) ** 2 - (k * 1.15) ** 2));
          const ly = TH + 1 + k;
          if (rr < 0.9) {
            b.put(tx, ly, tz, T.roof === 'dome' ? B.gold_block : M.roofBlock);
            for (let f = 1; f <= 3; f++) b.put(tx, ly + f, tz, M.fence);
            b.put(tx + 1, ly + 3, tz, M.flag); b.put(tx + 2, ly + 3, tz, M.flag); b.put(tx + 1, ly + 2, tz, M.flag);
            break;
          }
          const n = Math.ceil(rr);
          for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
            const dd = Math.hypot(dx, dz);
            if (dd <= rr && dd > rr - 1.4) b.put(tx + dx, ly, tz + dz, M.roofBlock);
          }
        }
      } else {
        b.put(tx - sx, TH + 1, tz - sz, B.lantern);
        if (rnd() < 0.4) mob(G.outer, tx - sx, TH + 1, tz, ranged());
      }
      // contents
      b.chest(tx + sx * (a - 1), 1, tz + sz * (a - 1), sx > 0 ? 1 : 3, rnd() < 0.5 ? 'castle_armory' : 'castle_barracks');
      if (rnd() < 0.7) mob(G.outer, tx, WH + 1, tz - sz, ranged());
      if (rnd() < 0.4) mob(G.outer, tx - sx, 1, tz, melee());
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(sx, sz);

    // ================================================================ gatehouse (front, -z)
    {
      const gx = 5, gz0 = -R - 2, gz1 = -R + 4, GH = WH + 3;
      for (let lz = gz0; lz <= gz1; lz++) for (let lx = -gx; lx <= gx; lx++) {
        const edge = lx === -gx || lx === gx || lz === gz0 || lz === gz1;
        for (let ly = -3; ly <= GH; ly++) {
          let v = M.wall();
          if (edge && ly <= 1) v = M.found;
          else if (edge && ly === WH - 1) v = M.trim;
          else if (!edge && ly === WH) v = M.floor;
          else if (!edge && ly > WH && ly < GH) v = 0;
          b.put(lx, ly, lz, v);
        }
        if (edge && (Math.abs(lx) + Math.abs(lz)) % 2 === 0) b.put(lx, GH + 1, lz, M.wall());
      }
      // corner turrets
      for (const cx of [-gx, gx]) for (const cz of [gz0, gz1]) {
        for (let ly = GH + 1; ly <= GH + 3; ly++) b.put(cx, ly, cz, M.accent);
        b.put(cx, GH + 4, cz, M.slab);
      }
      // gate passage, half-raised portcullis, frame
      for (let lz = gz0; lz <= gz1; lz++) for (let lx = -1; lx <= 1; lx++) { for (let ly = 1; ly <= 4; ly++) b.put(lx, ly, lz, 0); b.put(lx, 0, lz, M.path); }
      for (let lx = -1; lx <= 1; lx++) { b.put(lx, 4, gz0, B.iron_bars); b.put(lx, 5, gz0, M.accent); }
      for (let ly = 1; ly <= 5; ly++) { b.put(-2, ly, gz0, M.accent); b.put(2, ly, gz0, M.accent); }
      b.put(0, 4, gz0 + 3, B.hanging_lantern);
      for (let ly = 6; ly <= WH - 1; ly++) for (let lx = -1; lx <= 1; lx++) wool(lx, ly, gz0, lx === 0);
      // wall-walk doors, arrow slits, ladder to the roof
      for (const lx of [-gx, gx]) for (const lz of [-R + 1, -R + 2]) for (let ly = WH + 1; ly <= WH + 2; ly++) b.put(lx, ly, lz, 0);
      for (const lx of [-3, 3]) for (let ly = WH + 1; ly <= WH + 2; ly++) b.put(lx, ly, gz0, B.iron_bars);
      for (let ly = WH + 1; ly <= GH; ly++) b.put(-gx + 1, ly, gz1 - 1, B.ladder + 0);
      b.put(2, WH + 2, gz0 + 3, B.hanging_lantern);
      mob(G.outer, rnd() < 0.5 ? -2 : 2, WH + 1, gz0 + 2, ranged());
    }
    // stairs from the courtyard up to the wall-walk (both sides, along the inner face)
    for (const s of [-1, 1]) {
      const zs = -Q + TR + 1;
      for (let k = 0; k < WH; k++) {
        for (let ly = 1; ly <= k; ly++) b.put(s * Q, ly, zs + k, M.wall());
        b.put(s * Q, k + 1, zs + k, stairs(M.stairs, 0));
      }
    }

    // ================================================================ courtyard
    const frontEnd = kz0 - 2;
    for (let lz = -Q; lz <= frontEnd + 1; lz++) for (let lx = -1; lx <= 1; lx++) b.put(lx, 0, lz, M.path);
    for (let lz = -Q + 3; lz <= frontEnd - 1; lz += 5) { lamp(-2, lz); lamp(2, lz); }
    // fields (畑)
    const PW = 9, fz0 = -Q + 2, PD = Math.max(5, Math.min(9, frontEnd - fz0 - 4));
    const field = (s) => {
      const mid = fz0 + (PD >> 1);
      for (let k = 0; k < PW; k++) for (let lz = fz0; lz < fz0 + PD; lz++) {
        const lx = s * (3 + k);
        const edge = k === 0 || k === PW - 1 || lz === fz0 || lz === fz0 + PD - 1;
        if (edge) { b.put(lx, 0, lz, M.hutLog); continue; }
        if (lz === mid) { b.put(lx, 0, lz, B.water); continue; }
        b.put(lx, 0, lz, B.farmland);
        let c;
        if (T.crop === 'pumpkin' && (k + lz) % 3 === 0) c = B.pumpkin;
        else if (T.crop === 'melon' && lz === mid + 1) c = B.melon;
        else { const st = Math.floor(rnd() * 5); c = B['wheat_' + Math.min(3, st)]; }
        if (c === B.pumpkin || c === B.melon) { b.put(lx, 0, lz, B.dirt); }
        b.put(lx, 1, lz, c);
      }
      // scarecrow + hay
      const sxs = s * (3 + PW);
      b.put(sxs, 1, fz0 + 1, M.fence); b.put(sxs, 2, fz0 + 1, B.hay_bale); b.put(sxs, 3, fz0 + 1, site.theme === 'necro' ? B.jack_o_lantern : B.pumpkin);
      b.put(sxs, 1, fz0 + PD - 2, B.hay_bale); b.put(sxs, 2, fz0 + PD - 2, B.hay_bale); b.put(sxs, 1, fz0 + PD - 3, B.hay_bale);
      mob(G.outer, s * (3 + (PW >> 1)), 1, fz0 - 1, melee());
    };
    field(-1); field(1);
    // well (right) and themed corner (left) between the fields and the keep
    const wz0 = frontEnd - 3;
    {
      const x0 = 5;
      const liquid = T.moat === 'lava' ? B.lava : B.water;
      for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
        const inner = dx >= 1 && dx <= 2 && dz >= 1 && dz <= 2;
        for (let ly = -4; ly <= 0; ly++) b.put(x0 + dx, ly, wz0 + dz, inner && ly > -4 ? liquid : M.found);
        if (!inner) b.put(x0 + dx, 1, wz0 + dz, M.found);
      }
      for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) { b.put(x0 + dx, 2, wz0 + dz, M.fence); b.put(x0 + dx, 3, wz0 + dz, M.fence); }
      for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) b.put(x0 + dx, 4, wz0 + dz, M.slab);
      b.put(x0 + 1, 3, wz0 + 1, B.hanging_lantern);
    }
    {
      const x1 = -4, x0 = -12, z0 = wz0, z1 = frontEnd;
      switch (T.deco) {
        case 'dummies':
          for (const lx of [-5, -8, -11]) { b.put(lx, 1, z0 + 2, M.fence); b.put(lx, 2, z0 + 2, B.hay_bale); b.put(lx, 3, z0 + 2, B.pumpkin); }
          for (let lx = -11; lx <= -5; lx++) b.put(lx, 0, z0 + 1, B.gravel);
          break;
        case 'graves':
          for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) b.put(lx, 0, lz, rnd() < 0.5 ? B.dirt : B.gravel);
          for (let lx = x0 + 1; lx <= x1 - 1; lx += 2) for (const lz of [z0, z0 + 2]) {
            b.put(lx, 1, lz, rnd() < 0.5 ? B.cobblestone : B.mossy_cobblestone); b.put(lx, 2, lz, B.stone_brick_slab);
            b.put(lx, 1, lz + 1, rnd() < 0.35 ? B.dead_bush : 0);
          }
          b.put(x0, 1, z1, B.jack_o_lantern);
          break;
        case 'oasis':
          for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) {
            const edge = lz === z0 || lz === z1 || lx === x0 || lx === x1;
            b.put(lx, 0, lz, edge ? B.sand : B.water);
            if (edge && rnd() < 0.35) { b.put(lx, 1, lz, B.sugar_cane); b.put(lx, 2, lz, B.sugar_cane); }
          }
          for (let ly = 1; ly <= 4; ly++) b.put(x0, ly, z0, B.oak_log);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]]) b.put(x0 + dx, 5, z0 + dz, B.oak_leaves);
          b.put(x0, 5, z0, B.oak_leaves);
          break;
        case 'ice':
          for (const [lx, lz, h] of [[-5, z0 + 1, 3], [-7, z0 + 2, 5], [-9, z0, 2], [-11, z0 + 2, 4]]) for (let ly = 1; ly <= h; ly++) b.put(lx, ly, lz, ly === h ? B.snow : B.packed_ice);
          b.put(-6, 1, z1, B.snow); b.put(-6, 2, z1, B.snow); b.put(-6, 3, z1, B.pumpkin);
          break;
        case 'lava':
          for (let lz = z0; lz <= z1; lz++) for (let lx = x0 + 2; lx <= x0 + 6; lx++) {
            const edge = lz === z0 || lz === z1 || lx === x0 + 2 || lx === x0 + 6;
            b.put(lx, 0, lz, edge ? M.found : B.lava);
            if (edge) b.put(lx, 1, lz, B.iron_bars);
          }
          b.put(x0 + 8, 1, z0 + 1, B.magma_block); b.put(x0 + 8, 2, z0 + 1, B.magma_block);
          break;
      }
    }
    // outbuildings beside the keep
    const huts = [];
    const hut = (x0, z0, w, d, kind) => {
      const x1 = x0 + w - 1, z1 = z0 + d - 1, H = 4;
      huts.push({ kind, x0, z0, x1, z1 });
      for (let lz = z0; lz <= z1; lz++) for (let lx = x0; lx <= x1; lx++) {
        const edge = lx === x0 || lx === x1 || lz === z0 || lz === z1;
        const corner = (lx === x0 || lx === x1) && (lz === z0 || lz === z1);
        b.put(lx, 0, lz, M.floor2);
        for (let ly = 1; ly <= H; ly++) b.put(lx, ly, lz, edge ? (corner ? M.hutLog : ly === 1 ? M.found : M.hutWall) : 0);
      }
      for (let lz = z0 + 2; lz < z1 - 1; lz += 3) { b.put(x0, 2, lz, M.window); b.put(x1, 2, lz, M.window); }
      const mx = Math.floor((x0 + x1) / 2);
      b.put(mx, 1, z0, 0); b.put(mx, 2, z0, 0);
      b.put(mx, 0, z0 - 1, M.path);
      if (T.flatRoofs) {
        b.fill(x0 - 1, H + 1, z0 - 1, x1 + 1, H + 1, z1 + 1, M.hutSlab);
        b.fill(x0, H + 1, z0, x1, H + 1, z1, M.hutWall);
        for (let lx = x0; lx <= x1; lx += 2) { b.put(lx, H + 2, z0, M.hutSlab); b.put(lx, H + 2, z1, M.hutSlab); }
      } else {
        b.fill(x0 + 1, H + 1, z0 + 1, x1 - 1, H + 1, z1 - 1, M.floor2);
        for (let k = 0; ; k++) {
          const xa = x0 - 1 + k, xb = x1 + 1 - k, y = H + 1 + k;
          if (xa > xb) break;
          if (xa === xb) { for (let lz = z0 - 1; lz <= z1 + 1; lz++) b.put(xa, y, lz, M.hutSlab); break; }
          for (let lz = z0 - 1; lz <= z1 + 1; lz++) { b.put(xa, y, lz, stairs(M.hutStairs, 3)); b.put(xb, y, lz, stairs(M.hutStairs, 1)); }
          for (let lx = xa + 1; lx < xb; lx++) { b.put(lx, y, z0, M.hutWall); b.put(lx, y, z1, M.hutWall); }
        }
      }
      b.put(mx, H, Math.floor((z0 + z1) / 2), B.hanging_lantern);
      switch (kind) {
        case 'barracks':
          for (let lz = z0 + 2; lz + 1 < z1; lz += 3) { b.put(x0 + 1, 1, lz, MC.bedId(0, 0)); b.put(x0 + 1, 1, lz + 1, MC.bedId(0, 1)); }
          b.chest(x1 - 1, 1, z1 - 1, 1, 'castle_barracks');
          b.put(x1 - 1, 1, z0 + 1, B.crafting_table);
          break;
        case 'store':
          b.chest(x0 + 1, 1, z1 - 1, 3, 'castle_store'); b.chest(x1 - 1, 1, z1 - 1, 1, 'castle_store');
          for (let lz = z0 + 2; lz < z1 - 1; lz += 2) { b.put(x0 + 1, 1, lz, B.hay_bale); if (rnd() < 0.5) b.put(x0 + 1, 2, lz, B.hay_bale); }
          b.put(x1 - 1, 1, z0 + 2, B.pumpkin); b.put(x1 - 1, 1, z0 + 3, B.melon);
          break;
        case 'smithy':
          b.put(x0 + 1, 1, z1 - 1, B.furnace + 3); b.put(x0 + 1, 1, z1 - 2, B.furnace + 3);
          b.put(x1 - 1, 1, z0 + 2, B.iron_block); b.put(x1 - 1, 1, z0 + 3, B.crafting_table);
          b.chest(x1 - 1, 1, z1 - 1, 1, 'castle_armory');
          b.put(x0 + 2, 0, z1 - 1, B.magma_block); b.put(x0 + 2, 1, z1 - 1, B.iron_bars);
          break;
      }
      mob(G.outer, mx, 1, Math.floor((z0 + z1) / 2) + 1, melee());
    };
    {
      const hx0 = kx1 + 2, hw = Math.min(9, Q - hx0 + 1), hd = Math.min(11, Q - kz0 + 1);
      hut(-(hx0 + hw - 1), kz0, hw, hd, 'barracks');
      hut(hx0, kz0, hw, hd, R >= 22 ? 'smithy' : 'store');
      if (R >= 22) hut(-12, fz0 + PD + 1, 7, Math.min(6, wz0 - fz0 - PD - 2), 'store');
    }
    for (let i = 0; i < 2; i++) mob(G.outer, 0, 1, -Q + 5 + i * 6, melee());

    // ================================================================ keep (本丸)
    const inKeep = (lx, lz) => lx >= kx0 && lx <= kx1 && lz >= kz0 && lz <= kz1;
    for (let lz = kz0 - 1; lz <= kz1 + 1; lz++) for (let lx = kx0 - 1; lx <= kx1 + 1; lx++) {
      const inside = inKeep(lx, lz);
      const shell = inside && (lx === kx0 || lx === kx1 || lz === kz0 || lz === kz1);
      const turret = (Math.abs(lx - kx0) <= 1 || Math.abs(lx - kx1) <= 1) && (Math.abs(lz - kz0) <= 1 || Math.abs(lz - kz1) <= 1) && (!inside || shell);
      if (!inside && !turret) continue;
      for (let ly = -2; ly <= 21; ly++) {
        let v;
        if (turret) v = ly <= 1 ? M.found : ly === 6 || ly === 12 || ly === 18 ? M.trim : M.wall();
        else if (shell) { if (ly > 18) continue; v = ly <= 1 ? M.found : ly === 6 || ly === 12 ? M.trim : M.wall(); }
        else {
          if (ly > 18) continue;
          v = ly < 0 ? M.wall() : ly === 0 ? M.floor : ly === 6 || ly === 12 ? M.floor2 : ly === 18 ? M.wall() : 0;
        }
        b.put(lx, ly, lz, v);
      }
      if (turret && !inside && ((lx + lz) & 1) === 0) b.put(lx, 22, lz, M.wall());
      else if (shell && !turret && ((lx + lz) & 1) === 0) b.put(lx, 19, lz, M.wall());
    }
    // windows
    for (let t = 3; t <= KW - 4; t += 3) {
      for (const fl of [2, 8, 14]) for (const dy of [0, 1]) {
        const x = kx0 + t, z = kz0 + t;
        if (fl > 2 || Math.abs(x) > 2) b.put(x, fl + dy, kz0, M.window);
        b.put(x, fl + dy, kz1, M.window); b.put(kx0, fl + dy, z, M.window); b.put(kx1, fl + dy, z, M.window);
      }
    }
    // entrance
    for (let lx = -1; lx <= 1; lx++) { for (let ly = 1; ly <= 4; ly++) b.put(lx, ly, kz0, 0); b.put(lx, 5, kz0, M.accent); }
    for (let ly = 1; ly <= 5; ly++) { b.put(-2, ly, kz0, M.accent); b.put(2, ly, kz0, M.accent); }
    for (let ly = 7; ly <= 10; ly++) for (const lx of [-1, 0, 1]) wool(lx, ly, kz0, lx === 0);
    b.put(0, 4, kz0 - 1, B.hanging_lantern);
    b.put(-3, 1, kz0 - 1, M.lamp === B.jack_o_lantern ? B.jack_o_lantern : B.lantern);
    // --- F0 great hall
    const shX = kx1 - 3, shZ = kz1 - 3;           // spiral stairs down to the dungeon (back right corner)
    const inShaft = (lx, lz) => Math.abs(lx - shX) <= 2 && Math.abs(lz - shZ) <= 2;
    const px = kx1 - 3;
    for (let lz = kz0 + 3; lz <= kz1 - 3; lz += 3) for (const s of [-1, 1]) {
      if (inShaft(s * px, lz)) continue;
      for (const ly of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17]) b.put(s * px, ly, lz, M.pillar);
    }
    for (let lz = kz0 + 1; lz <= kz1 - 6; lz++) for (let lx = -1; lx <= 1; lx++) b.put(lx, 1, lz, M.carpet);
    for (let lz = kz0 + 3; lz <= kz1 - 3; lz += 4) b.put(0, 5, lz, B.hanging_lantern);
    for (let lz = kz0 + 3; lz <= kz1 - 6; lz += 4) { b.put(kx1 - 1, 3, lz, M.banner[0]); b.put(kx1 - 1, 4, lz, M.banner[1]); }
    {
      const hx = kx0 + 3;   // hearth on the back wall
      b.put(hx, 1, kz1 - 1, B.magma_block); b.put(hx - 1, 1, kz1 - 1, M.accent); b.put(hx + 1, 1, kz1 - 1, M.accent);
      b.put(hx, 1, kz1 - 2, B.iron_bars);
      for (let lx = hx - 1; lx <= hx + 1; lx++) { b.put(lx, 2, kz1 - 1, M.accent); b.put(lx, 3, kz1 - 1, M.slab); }
    }
    b.chest(kx1 - 1, 1, kz0 + 1, 1, 'castle_store');
    b.chest(kx0 + 2, 1, kz0 + 1, 0, 'castle_store');
    mob(G.keep, -2, 1, kz0 + 4, melee()); mob(G.keep, 2, 1, kz0 + 5, melee()); mob(G.keep, 0, 1, kz0 + 8, anyMob());
    // stairs F0 -> F1 along the left wall
    for (let k = 0; k < 6; k++) {
      b.put(kx0 + 1, 1 + k, kz0 + 2 + k, stairs(M.stairs, 0));
      if (k < 5) b.put(kx0 + 1, 6, kz0 + 2 + k, 0);
      if (k < 5) b.put(kx0 + 2, 7, kz0 + 2 + k, M.fence);
    }
    b.put(kx0 + 1, 7, kz0 + 1, M.fence);
    // --- F1 barracks / library / armory
    for (let lz = kz0 + 9; lz <= kz1 - 1; lz++) for (let ly = 7; ly <= 9; ly++) b.put(kx0 + 1, ly, lz, B.bookshelf);
    b.chest(kx0 + 2, 7, kz1 - 1, 2, 'castle_library');
    for (let lx = kx0 + 3; lx <= kx1 - 3; lx += 2) { b.put(lx, 7, kz1 - 2, MC.bedId(0, 0)); b.put(lx, 7, kz1 - 1, MC.bedId(0, 1)); }
    b.chest(1, 7, kz0 + 1, 0, 'castle_armory'); b.chest(3, 7, kz0 + 1, 0, 'castle_armory');
    b.put(-1, 7, kz0 + 1, B.iron_block); b.put(-2, 7, kz0 + 1, M.fence); b.put(-2, 8, kz0 + 1, M.fence);
    b.spawner(0, 7, kz0 + (KD >> 1), pick(T.spawn));
    for (let lz = kz0 + 3; lz <= kz1 - 3; lz += 4) b.put(0, 11, lz, B.hanging_lantern);
    mob(G.keep, -2, 7, kz0 + 4, melee()); mob(G.keep, 2, 7, kz1 - 4, anyMob());
    // stairs F1 -> F2 along the right wall
    for (let k = 0; k < 6; k++) {
      b.put(kx1 - 1, 7 + k, kz1 - 2 - k, stairs(M.stairs, 2));
      if (k < 5) b.put(kx1 - 1, 12, kz1 - 2 - k, 0);
      if (k < 5) b.put(kx1 - 2, 13, kz1 - 2 - k, M.fence);
    }
    b.put(kx1 - 1, 13, kz1 - 1, M.fence);
    // --- F2 throne room
    for (let lz = kz0 + 1; lz <= kz1 - 3; lz++) for (let lx = -1; lx <= 1; lx++) b.put(lx, 13, lz, M.carpet);
    b.put(0, 13, kz1 - 2, stairs(M.stairs, 0));
    b.put(-1, 13, kz1 - 2, B.gold_block); b.put(1, 13, kz1 - 2, B.gold_block);
    for (let ly = 13; ly <= 15; ly++) b.put(0, ly, kz1 - 1, ly === 15 ? B.gold_block : M.accent);
    b.put(-1, 14, kz1 - 1, M.accent); b.put(1, 14, kz1 - 1, M.accent);
    for (const s of [-1, 1]) for (let ly = 14; ly <= 17; ly++) { b.put(s * 3, ly, kz1 - 1, M.banner[0]); b.put(s * 2, ly, kz1 - 1, ly === 16 ? M.banner[1] : M.banner[0]); }
    b.chest(-2, 13, kz1 - 1, 2, 'castle_lord');
    for (let lz = kz0 + 3; lz <= kz1 - 3; lz += 4) { b.put(-3, 17, lz, B.hanging_lantern); b.put(3, 17, lz, B.hanging_lantern); }
    for (let ly = 13; ly <= 18; ly++) b.put(kx0 + 1, ly, kz0 + 1, B.ladder + 1);
    plan.bosses.push({ id: site.id + '/mid', type: T.mid, pos: (() => { const w = b.world(0, 13, kz1 - 6); return [w[0] + 0.5, w[1], w[2] + 0.5]; })(), r: 10, dy: 4 });
    mob(G.keep, -2, 13, kz0 + 3, melee()); mob(G.keep, 2, 13, kz0 + 3, melee());
    // --- roof: flag, archers
    const kzc = Math.floor((kz0 + kz1) / 2);
    for (let ly = 19; ly <= 23; ly++) b.put(0, ly, kzc, M.fence);
    b.put(1, 23, kzc, M.flag); b.put(2, 23, kzc, M.flag); b.put(1, 22, kzc, M.flag); b.put(2, 22, kzc, M.flag);
    b.put(0, 19, kzc + 2, B.lantern);
    mob(G.keep, kx0 + 3, 19, kz0 + 3, ranged()); mob(G.keep, kx1 - 3, 19, kz1 - 3, ranged());

    // ================================================================ dungeon B1: maze of rooms below the castle
    const GW = R >= 22 ? 4 : 3, GD = GW, CS = 11;
    const ei = Math.round((GW - 1) / 2 + shX / CS), ej = GD - 1;
    const gx0 = shX - ei * CS, gz0 = shZ - ej * CS;
    const idx = (i, j) => j * GW + i;
    const links = new Set(), seen = new Uint8Array(GW * GD), depth = new Int32Array(GW * GD);
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
    for (let k = 0; k < GW * GD * 0.3; k++) {
      const i = Math.floor(rnd() * (GW - 1)), j = Math.floor(rnd() * GD);
      if (rnd() < 0.5) links.add(idx(i, j) + ':' + idx(i + 1, j));
      else if (j < GD - 1) links.add(idx(i, j) + ':' + idx(i, j + 1));
    }
    let deep = 0;
    for (let k = 0; k < GW * GD; k++) if (depth[k] > depth[deep]) deep = k;
    const ROOMS = ['prison', 'crypt', 'store', 'armory', 'library', 'cistern', 'shrine', 'spawner', 'spawner', 'treasure', 'barracks', 'prison'];
    const rooms = [];
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      const k = idx(i, j), isEntry = i === ei && j === ej, isDeep = k === deep;
      const half = isEntry || isDeep ? 3 : 2 + Math.floor(rnd() * 2);
      rooms.push({ i, j, k, cx: gx0 + i * CS, cz: gz0 + j * CS, half, h: isEntry || isDeep ? 5 : 4 + Math.floor(rnd() * 2),
        type: isEntry ? 'entry' : isDeep ? 'descent' : ROOMS[Math.floor(rnd() * ROOMS.length)] });
    }
    const carve = (x0, z0, x1, z1, yf, h, wall, floor) => {
      for (let lz = z0 - 1; lz <= z1 + 1; lz++) for (let lx = x0 - 1; lx <= x1 + 1; lx++) {
        const inside = lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1;
        for (let y = yf; y <= yf + h + 1; y++) {
          if (inside && y > yf && y <= yf + h) b.put(lx, y, lz, 0);
          else if (b.get(lx, y, lz) !== 0) b.put(lx, y, lz, inside && y === yf ? floor() : wall());
        }
      }
    };
    const corridor = (xa, za, xb, zb, yf, deco) => {
      const alongX = za === zb;
      const a0 = alongX ? Math.min(xa, xb) : Math.min(za, zb), a1 = alongX ? Math.max(xa, xb) : Math.max(za, zb);
      for (let a = a0; a <= a1; a++) for (let p = -2; p <= 2; p++) for (let y = yf; y <= yf + 4; y++) {
        const x = alongX ? a : xa + p, z = alongX ? za + p : a;
        const inside = Math.abs(p) <= 1 && y > yf && y < yf + 4;
        if (inside) b.put(x, y, z, 0);
        else if (b.get(x, y, z) !== 0) b.put(x, y, z, y === yf && Math.abs(p) <= 1 ? M.dfloor() : M.dwall());
      }
      if (deco) for (let a = a0 + 1; a < a1; a++) {
        const x = alongX ? a : xa, z = alongX ? za : a, q = rnd();
        if (q < 0.05) b.put(alongX ? x : x + 1, yf + 3, alongX ? z + 1 : z, B.cobweb);
        else if (q < 0.08) b.put(x, yf + 3, z, B.chain);
        else if (q < 0.12) { if (alongX) b.put(x, yf + 2, z - 1, B.wall_torch + 2); else b.put(x - 1, yf + 2, z, B.wall_torch + 1); }
      }
    };
    for (const rm of rooms) carve(rm.cx - rm.half, rm.cz - rm.half, rm.cx + rm.half, rm.cz + rm.half, Y1, rm.h, M.dwall, M.dfloor);
    for (const l of links) {
      const [p, q] = l.split(':').map(Number);
      const A = rooms[p], C = rooms[q];
      if (A.j === C.j) { const [L, Rr] = A.cx < C.cx ? [A, C] : [C, A]; corridor(L.cx + L.half, L.cz, Rr.cx - Rr.half, L.cz, Y1, true); }
      else { const [N, S] = A.cz < C.cz ? [A, C] : [C, A]; corridor(N.cx, N.cz + N.half, N.cx, S.cz - S.half, Y1, true); }
    }
    for (const rm of rooms) decorateRoom(rm);
    function decorateRoom(rm) {
      const x0 = rm.cx - rm.half, x1 = rm.cx + rm.half, z0 = rm.cz - rm.half, z1 = rm.cz + rm.half, y = Y1 + 1, top = Y1 + rm.h;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (rnd() < 0.45) b.put(x, top, z, B.cobweb);
      const g = G.b1;
      switch (rm.type) {
        case 'entry':
          b.put(x0, top, z1, B.hanging_lantern); b.put(x1, top, z0, B.hanging_lantern);
          break;
        case 'descent':
          b.put(x0, top, z1, B.hanging_lantern); b.put(x1, top, z1, B.hanging_lantern);
          mob(g, x1, y, z0, melee());
          break;
        case 'prison':
          for (let lx = x0; lx <= x1; lx++) for (let ly = y; ly <= top; ly++) b.put(lx, ly, z1 - 1, lx === x0 + 1 && ly <= y + 1 ? 0 : B.iron_bars);
          for (let lx = x0; lx <= x1; lx += 3) for (let ly = y; ly <= top; ly++) b.put(lx, ly, z1, M.dwall());
          b.put(x0 + 1, top, z1, B.chain); b.put(x1 - 1, top - 1, z1, B.chain);
          mob(g, x0 + 1, y, z1, rnd() < 0.5 ? ranged() : melee());
          if (rnd() < 0.5) b.chest(x0, y, z0, 0, 'castle_dungeon');
          mob(g, rm.cx, y, z0 + 1, melee());
          break;
        case 'crypt':
          for (let lx = x0 + 1; lx < x1; lx += 2) for (const lz of [z0, z1]) b.put(lx, y, lz, site.theme === 'necro' ? B.bone_block : M.slab);
          b.spawner(rm.cx, y, rm.cz, pick(T.spawn));
          if (rnd() < 0.5) b.chest(x0, y, rm.cz, 3, 'castle_dungeon');
          break;
        case 'store':
          b.chest(x0, y, z0, 0, 'castle_store'); b.chest(x1, y, z0, 0, 'castle_dungeon');
          for (let lz = z0 + 1; lz <= z1; lz += 2) { b.put(x1, y, lz, B.hay_bale); if (rnd() < 0.5) b.put(x1, y + 1, lz, B.pumpkin); }
          mob(g, rm.cx, y, rm.cz, melee());
          break;
        case 'armory':
          b.chest(rm.cx, y, z1, 2, 'castle_armory');
          for (let lx = x0; lx <= x1; lx += 2) { b.put(lx, y, z0, M.fence); b.put(lx, y + 1, z0, M.fence); }
          b.put(x0, y, z1, B.iron_block); b.put(x1, y, z1, B.iron_block);
          mob(g, rm.cx, y, rm.cz, melee()); mob(g, rm.cx - 1, y, rm.cz, ranged());
          break;
        case 'library':
          for (let lx = x0; lx <= x1; lx++) for (let ly = y; ly <= Math.min(top, y + 2); ly++) { b.put(lx, ly, z0, B.bookshelf); b.put(lx, ly, z1, B.bookshelf); }
          b.chest(rm.cx, y, rm.cz, 0, 'castle_library');
          b.put(rm.cx, top, rm.cz + 1, B.hanging_lantern);
          mob(g, x0, y, rm.cz, T.mobs.caster.length ? pick(T.mobs.caster) : ranged());
          break;
        case 'cistern': {
          const liq = T.moat === 'lava' ? B.lava : B.water;
          for (let lz = z0 + 1; lz < z1; lz++) for (let lx = x0 + 1; lx < x1; lx++) { b.put(lx, Y1, lz, T.moat === 'ice' ? B.ice : liq); b.put(lx, Y1 - 1, lz, M.dwall()); }
          if (rnd() < 0.7) b.chest(x0, y, z0, 0, 'castle_dungeon');
          mob(g, x1, y, z1, melee());
          break;
        }
        case 'shrine':
          for (let lz = z0 + 1; lz < z1; lz++) for (let lx = x0 + 1; lx < x1; lx++) if (Math.max(Math.abs(lx - rm.cx), Math.abs(lz - rm.cz)) === 1) b.put(lx, Y1, lz, M.accent);
          b.put(rm.cx, y, rm.cz, M.accent);
          b.put(rm.cx, y + 1, rm.cz, site.theme === 'necro' ? B.jack_o_lantern : site.theme === 'volcano' ? B.magma_block : site.theme === 'frost' ? B.packed_ice : B.gold_block);
          b.put(rm.cx, top, rm.cz, B.hanging_lantern);
          b.chest(rm.cx, y, z1, 2, 'castle_dungeon');
          mob(g, rm.cx + 1, y, rm.cz - 1, T.mobs.caster.length ? pick(T.mobs.caster) : melee());
          break;
        case 'spawner':
          b.spawner(rm.cx, y, rm.cz, pick(T.spawn));
          if (rnd() < 0.5) b.chest(x0, y, rm.cz, 3, 'castle_dungeon');
          break;
        case 'treasure':
          b.spawner(rm.cx, y, rm.cz, pick(T.spawn));
          b.chest(x0, y, rm.cz, 3, 'castle_dungeon'); b.chest(x1, y, rm.cz, 1, 'castle_dungeon');
          b.put(rm.cx, top, rm.cz, B.hanging_lantern);
          break;
        case 'barracks':
          for (let lx = x0; lx + 1 <= x1; lx += 2) { b.put(lx, y, z1 - 1, MC.bedId(0, 0)); b.put(lx, y, z1, MC.bedId(0, 1)); }
          b.chest(x1, y, z0, 2, 'castle_barracks');
          mob(g, rm.cx, y, z0, melee()); mob(g, rm.cx + 1, y, z0 + 1, anyMob());
          break;
      }
    }

    // spiral staircase in a 5x5 shaft: floor of the upper room at yF, floor of the lower room at yL (height hL)
    const spiral = (cx, cz, yF, yL, hL, upper) => {
      const n = yF - yL - 1, steps = new Map(), head = new Set();
      const floor = () => (upper === 'walls' ? M.floor : M.dfloor());
      for (let s = 1; s <= n; s++) {
        const k = s % 8, [dx, dz] = RING[k], [px2, pz2] = RING[(s + 7) % 8];
        const f = MC.DIRS.findIndex((d) => d[0] === px2 - dx && d[2] === pz2 - dz);
        steps.set(k + ',' + (yF - s), f);
        for (let h = 1; h <= 3; h++) head.add(k + ',' + (yF - s + h));
      }
      const top = yF + (upper === 'walls' ? 5 : 3);
      for (let y = yL + 1; y <= top; y++) {
        const inRoom = y <= yL + hL;
        b.put(cx, y, cz, M.accent);
        for (let k = 0; k < 8; k++) {
          const [dx, dz] = RING[k], key = k + ',' + y;
          if (steps.has(key)) b.put(cx + dx, y, cz + dz, stairs(M.stairs, steps.get(key)));
          else if (inRoom || y > yF || head.has(key)) b.put(cx + dx, y, cz + dz, 0);
          else b.put(cx + dx, y, cz + dz, y === yF ? floor() : M.dwall());
        }
        if (inRoom) continue;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
          const door = (dx === -2 && dz === -1) || (dx === -1 && dz === -2);
          if (y < yF) b.put(cx + dx, y, cz + dz, M.dwall());
          else if (y > yF && upper === 'walls') b.put(cx + dx, y, cz + dz, door && y <= yF + 3 ? 0 : M.wall());
          else if (y === yF + 1 && upper === 'rail' && !door) b.put(cx + dx, y, cz + dz, M.fence);
        }
      }
      b.put(cx - 1, yF, cz - 1, floor());
    };
    spiral(shX, shZ, 0, Y1, 5, 'walls');
    b.put(shX - 1, 4, shZ - 3, B.hanging_lantern);

    // ================================================================ dungeon B2: descent, arena, sealed vault
    const D = rooms[deep];
    const vx = D.cx, vz = D.cz, dirz = vz > 0 ? -1 : 1;
    const ax = vx, az = vz + dirz * 18, AH = 8, AHT = 8;
    const dfl = () => M.dfloor();
    carve(vx - 3, vz - 3, vx + 3, vz + 3, Y2, 5, M.dwall, dfl);
    corridor(vx, vz + dirz * 4, vx, az - dirz * (AH + 1), Y2, true);
    carve(ax - AH, az - AH, ax + AH, az + AH, Y2, AHT, M.dwall, dfl);
    const vz0 = az + dirz * (AH + 2), vz1 = az + dirz * (AH + 6);
    {
      // the vault: unbreakable rune stone (two layers, and the arena wall around the seal), so the only way
      // in is through the seal that breaks when the lord falls
      const lo = Math.min(vz0, vz1), hi = Math.max(vz0, vz1);
      for (let lz = lo - 2; lz <= hi + 2; lz++) for (let lx = ax - 6; lx <= ax + 6; lx++) for (let ly = Y2 - 2; ly <= Y2 + 7; ly++) {
        if (dirz < 0 ? lz > hi + 1 : lz < lo - 1) continue;   // not into the arena
        b.put(lx, ly, lz, B.vault_stone);
      }
      for (let lx = ax - 5; lx <= ax + 5; lx++) for (let ly = Y2; ly <= Y2 + AHT + 1; ly++) b.put(lx, ly, az + dirz * (AH + 1), B.vault_stone);
      for (let lz = lo; lz <= hi; lz++) for (let lx = ax - 4; lx <= ax + 4; lx++) for (let ly = Y2 + 1; ly <= Y2 + 4; ly++) b.put(lx, ly, lz, 0);
    }
    spiral(vx, vz, Y1, Y2, 5, 'rail');
    b.put(vx + 3, Y2 + 5, vz + 3, B.hanging_lantern);
    // arena: dais, pillars, lights, themed hazards
    for (let lz = az - AH; lz <= az + AH; lz++) for (let lx = ax - AH; lx <= ax + AH; lx++) {
      const d = Math.max(Math.abs(lx - ax), Math.abs(lz - az));
      if (d <= 2) b.put(lx, Y2, lz, M.accent);
      else if (d === 3 || d === AH) b.put(lx, Y2, lz, M.trim === B.snow ? B.packed_ice : M.trim);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let ly = Y2 + 1; ly <= Y2 + AHT; ly++) b.put(ax + sx * 5, ly, az + sz * 5, M.pillar);
      b.put(ax + sx * 5, Y2 + AHT, az + sz * 4, B.hanging_lantern);
      if (site.theme === 'volcano') for (let q = 0; q < 2; q++) for (let w = 0; w < 2; w++) b.put(ax + sx * (7 - q), Y2, az + sz * (1 + w), B.lava);
      if (site.theme === 'necro') b.put(ax + sx * 6, Y2 + AHT, az + sz * 6, B.cobweb);
      if (site.theme === 'frost') for (let ly = Y2 + 1; ly <= Y2 + 3; ly++) b.put(ax + sx * 7, ly, az + sz * 7, B.packed_ice);
      if (site.theme === 'desert') b.put(ax + sx * 7, Y2 + 1, az + sz * 7, B.gold_block);
    }
    b.put(ax, Y2 + AHT, az, B.hanging_lantern);
    for (let lz = az - dirz * AH; lz !== az; lz += dirz) b.put(ax, Y2 + 1, lz, M.carpet);
    for (const s of [-1, 1]) for (let ly = Y2 + 2; ly <= Y2 + 6; ly++) { b.put(ax + s * 7, ly, az + dirz * (AH + 1), M.banner[ly === Y2 + 4 ? 1 : 0]); }
    // the seal between the arena and the vault
    const seal = [];
    for (let lx = ax - 1; lx <= ax + 1; lx++) for (let ly = Y2 + 1; ly <= Y2 + 3; ly++) {
      const lz = az + dirz * (AH + 1);
      b.put(lx, ly, lz, B.seal_bars);
      seal.push(b.world(lx, ly, lz));
    }
    // vault
    const vf = dirz < 0 ? 0 : 2, vback = vz1;
    b.put(ax, Y2, vback, B.gold_block);
    b.chest(ax, Y2 + 1, vback, vf, T.vault);
    b.chest(ax - 3, Y2 + 1, vback, vf, 'castle_lord'); b.chest(ax + 3, Y2 + 1, vback, vf, 'castle_dungeon');
    for (const s of [-1, 1]) {
      b.put(ax + s * 4, Y2 + 1, vback, B.gold_block); b.put(ax + s * 4, Y2 + 2, vback, B.gold_block);
      b.put(ax + s * 4, Y2 + 1, vz0, s < 0 ? B.diamond_block : B.emerald_block);
      b.put(ax + s * 2, Y2 + 4, (vz0 + vz1) / 2, B.hanging_lantern);
    }
    const bp = b.world(ax, Y2 + 1, az);
    plan.bosses.push({ id: site.id + '/boss', type: T.boss, pos: [bp[0] + 0.5, bp[1], bp[2] + 0.5], r: 14, dy: 6, seal });
    G.b2 = group('b2', vx, Y2 + 1, (vz + az) / 2, 16, 6);
    mob(G.b2, vx - 1, Y2 + 1, vz + dirz * 6, melee()); mob(G.b2, vx + 1, Y2 + 1, vz + dirz * 7, rnd() < 0.5 ? ranged() : melee());
    mob(G.b2, vx + 2, Y2 + 1, vz + 2, anyMob());

    // landmarks for the kingdom founded here once the lord has fallen (kingdom.js): gate, throne, posts...
    {
      const P3 = (lx, ly, lz) => { const w = b.world(lx, ly, lz); return [w[0] + 0.5, w[1], w[2] + 0.5]; };
      const rect = (lx0, lz0, lx1, lz1, ly) => {
        const [ax, az] = b.tf(lx0, lz0), [bx, bz] = b.tf(lx1, lz1);
        return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), fy + ly];
      };
      const [gx, gz] = b.tf(0, -1), [ox, oz] = b.tf(0, 0);
      const hutInfo = huts.map((h) => ({ kind: h.kind, at: P3(Math.round((h.x0 + h.x1) / 2), 1, Math.round((h.z0 + h.z1) / 2)) }));
      plan.k = {
        R, TR, WH, moatIn, moatOut, EXT, rot: site.rot, dir: [gx - ox, gz - oz],
        gate: P3(0, 1, -(moatOut + 2)), gateIn: P3(0, 1, -Q + 2), court: P3(0, 1, frontEnd - 1), keepDoor: P3(0, 1, kz0 - 2),
        hall: P3(-2, 1, kz0 + 4), throne: b.world(0, 13, kz1 - 2),
        wallPosts: [P3(-(R - 1), WH + 1, 0), P3(R - 1, WH + 1, 0), P3(0, WH + 1, R - 1), P3(-9, WH + 1, -(R - 1)), P3(9, WH + 1, -(R - 1))],
        huts: hutInfo,
        fields: [-1, 1].map((s) => ({ rect: rect(s * 4, fz0 + 1, s * (3 + PW - 2), fz0 + PD - 2, 0), chest: b.world(s * 3, 1, fz0), stand: P3(s * (3 + (PW >> 1)), 1, fz0 - 1) })),
        patrol: [P3(0, 1, -Q + 4), P3(-3, 1, frontEnd - 2), P3(3, 1, frontEnd - 2), P3(-Q + 2, 1, 0), P3(Q - 2, 1, 0)],
      };
    }

    plan.byChunk = cv.finalize();
    plans.set(site.id, plan);
    if (plans.size > 8) plans.delete(plans.keys().next().value);
    return plan;
  }

  // ---------------------------------------------------------------- queries
  Object.assign(Str, {
    CCELL,
    castleSite,
    castlePlan,
    castlesAround,
    // is (x, z) inside (pad = 0) or near any castle footprint (+ margin)?
    castleNear(gen, x, z, dist, margin = 0) {
      for (const [gx, gz] of Str._cellsAround(x, z, CCELL, dist + 60)) {
        const s = castleSite(gen, gx, gz);
        if (!s) continue;
        if (dist ? Math.hypot(s.x - x, s.z - z) < dist : Math.max(Math.abs(s.x - x), Math.abs(s.z - z)) < s.R + 18 + margin) return true;
      }
      return false;
    },
    // castle whose walls (plus pad) contain (x, z)
    castleAt(gen, x, z, pad = 6) {
      for (const [gx, gz] of Str._cellsAround(x, z, CCELL, 40)) {
        const s = castleSite(gen, gx, gz);
        if (s && Math.abs(s.x - x) <= s.R + pad && Math.abs(s.z - z) <= s.R + pad) return s;
      }
      return null;
    },
    nearestCastle(gen, x, z, rad, theme) {
      let best = null, bd = Infinity;
      const gx0 = Math.floor(x / CCELL), gz0 = Math.floor(z / CCELL);
      for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) {
        const s = castleSite(gen, gx, gz);
        if (!s || (theme && s.theme !== theme)) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
  });
  MC.WorldGen.prototype.nearestCastle = function (x, z, rad, theme) { return Str.nearestCastle(this, x, z, rad, theme); };
})();
