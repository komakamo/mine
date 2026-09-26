'use strict';
// Box models for mobs (units: model pixels, 16 px = 1 block, feet at y = 0, facing +z) and their
// procedurally painted skins. Every face of every box gets a rectangle (1 texel per model pixel) that is
// packed into 16x16 texture tiles, so mobs share the terrain texture arrays (albedo / normal / specular).
(function () {
  const H = MC.col.hex;
  // ---------------------------------------------------------------- model definitions
  // part: [name, pivot[x,y,z], box[x,y,z,w,h,d] relative to pivot, skin key, options]
  const P = (name, pivot, box, skin, o = {}) => Object.assign({ name, pivot, box, skin }, o);
  const biped = (pre, limbW, o = {}) => [
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], pre + '_head'),
    P('body', [0, 24, 0], [-4, -12, -2, 8, 12, 4], pre + '_body', o.body),
    P('rarm', [-4 - limbW / 2, 22, 0], [-limbW / 2, -10, -limbW / 2, limbW, 12, limbW], pre + '_arm'),
    P('larm', [4 + limbW / 2, 22, 0], [-limbW / 2, -10, -limbW / 2, limbW, 12, limbW], pre + '_arm'),
    P('rleg', [-2, 12, 0], [-limbW / 2, -12, -limbW / 2, limbW, 12, limbW], pre + '_leg'),
    P('lleg', [2, 12, 0], [-limbW / 2, -12, -limbW / 2, limbW, 12, limbW], pre + '_leg'),
  ];
  const quad = (pre, legH, legPos) => legPos.map((p, i) => P('leg' + i, [p[0], legH, p[1]], [-2, -legH, -2, 4, legH, 4], pre + '_leg'));
  MC.MOB_MODELS = {
    zombie: { parts: biped('zombie', 4) },
    skeleton: { parts: biped('skeleton', 2) },
    creeper: { parts: [
      P('head', [0, 18, 0], [-4, 0, -4, 8, 8, 8], 'creeper_head'),
      P('body', [0, 18, 0], [-4, -12, -2, 8, 12, 4], 'creeper_body'),
      ...quad('creeper', 6, [[-2, 4], [2, 4], [-2, -4], [2, -4]]),
    ] },
    spider: { parts: [
      P('head', [0, 9, 3], [-4, -4, 0, 8, 8, 8], 'spider_head'),
      P('neck', [0, 9, 0], [-3, -3, -3, 6, 6, 6], 'spider_neck'),
      P('body', [0, 9, -3], [-5, -4, -12, 10, 8, 12], 'spider_body'),
      ...[2, 0.7, -0.7, -2].flatMap((z, i) => [
        P('rleg' + i, [-3, 9, z], [-16, -1, -1, 16, 2, 2], 'spider_leg'),
        P('lleg' + i, [3, 9, z], [0, -1, -1, 16, 2, 2], 'spider_leg'),
      ]),
    ] },
    pig: { parts: [
      P('body', [0, 9, 0], [-5, -4, -8, 10, 8, 16], 'pig_body'),
      P('head', [0, 12, 8], [-4, -4, 0, 8, 8, 8], 'pig_head'),
      P('snout', [0, 12, 8], [-2, -3, 8, 4, 3, 1], 'pig_snout', { parent: 'head' }),
      ...quad('pig', 6, [[-3, 5], [3, 5], [-3, -5], [3, -5]]),
    ] },
    cow: { parts: [
      P('body', [0, 17, 0], [-6, -5, -8, 12, 10, 16], 'cow_body'),
      P('head', [0, 20, 8], [-4, -4, 0, 8, 8, 6], 'cow_head'),
      P('rhorn', [0, 20, 8], [-5, 3, 1, 1, 3, 1], 'cow_horn', { parent: 'head' }),
      P('lhorn', [0, 20, 8], [4, 3, 1, 1, 3, 1], 'cow_horn', { parent: 'head' }),
      ...quad('cow', 12, [[-4, 6], [4, 6], [-4, -6], [4, -6]]),
    ] },
    sheep: { parts: [
      P('body', [0, 16, 0], [-5, -5, -8, 10, 10, 16], 'sheep_wool', { tint: 'wool' }),
      P('head', [0, 18, 8], [-3, -3, 0, 6, 6, 8], 'sheep_head'),
      ...quad('sheep', 12, [[-3, 5], [3, 5], [-3, -5], [3, -5]]),
    ] },
    chicken: { parts: [
      P('body', [0, 8, 0], [-3, -3, -4, 6, 6, 8], 'chicken_body'),
      P('head', [0, 9, 4], [-2, 0, -1, 4, 6, 3], 'chicken_head'),
      P('beak', [0, 9, 4], [-2, 2, 2, 4, 2, 2], 'chicken_beak', { parent: 'head' }),
      P('wattle', [0, 9, 4], [-1, 0, 2, 2, 2, 2], 'chicken_wattle', { parent: 'head' }),
      P('rwing', [-3, 11, 0], [-1, -4, -3, 1, 4, 6], 'chicken_wing'),
      P('lwing', [3, 11, 0], [0, -4, -3, 1, 4, 6], 'chicken_wing'),
      P('rleg', [-1.5, 5, 0.5], [-1, -5, -1, 2, 5, 2], 'chicken_leg'),
      P('lleg', [1.5, 5, 0.5], [-1, -5, -1, 2, 5, 2], 'chicken_leg'),
    ] },
    villager: { parts: [
      P('head', [0, 24, 0], [-4, 0, -4, 8, 10, 8], 'villager_head'),
      P('nose', [0, 24, 0], [-1, 1, 4, 2, 4, 2], 'villager_nose', { parent: 'head' }),
      P('body', [0, 24, 0], [-4, -16, -3, 8, 16, 6], 'villager_robe', { tint: 'robe' }),
      P('arms', [0, 21, 1], [-4, -6, -2, 8, 4, 4], 'villager_armmid', { tint: 'robe' }),
      P('rarm', [0, 21, 1], [-8, -6, -2, 4, 8, 4], 'villager_arm', { tint: 'robe', parent: 'arms' }),
      P('larm', [0, 21, 1], [4, -6, -2, 4, 8, 4], 'villager_arm', { tint: 'robe', parent: 'arms' }),
      P('rleg', [-2, 8, 0], [-2, -8, -2, 4, 8, 4], 'villager_leg'),
      P('lleg', [2, 8, 0], [-2, -8, -2, 4, 8, 4], 'villager_leg'),
    ] },
    player_arm: { parts: [P('arm', [0, 0, 0], [0, 0, 0, 4, 12, 4], 'player_arm')] },
  };

  // ---------------------------------------------------------------- skin painters
  // p: { w, h, face, set(x, y, hex, spec?), fill(pal, k), get(x,y) }  spec = [smooth, f0, sss, emit]
  const pal = MC.col.pal;
  function noiseFill(p, P, k = 0.5, seed = 0) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const n = MC.hash3(x, y, p.fi * 17 + seed, p.seed) * (1 - k) + MC.hash3(x >> 1, y >> 1, p.fi + seed + 5, p.seed) * k;
      p.set(x, y, pal(P, n));
    }
  }
  const art = (p, rows, map, ox = 0, oy = 0) => {
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (map[ch] !== undefined) { const e = map[ch]; if (Array.isArray(e)) p.set(x + ox, y + oy, e[0], e.slice(1)); else p.set(x + ox, y + oy, e); }
    }
  };
  const ZSKIN = [0x3f7a30, 0x4a8a38, 0x55963f, 0x62a34a];
  const ZSHIRT = [0x1f8a8f, 0x24989d, 0x2aa5aa, 0x33b2b5];
  const ZPANTS = [0x363a8a, 0x3c4196, 0x444aa2];
  const BONE = [0xa8a8a8, 0xb8b8b8, 0xc8c8c8, 0xd6d6d6];
  const CREEP = [0x2e7a22, 0x3f9a32, 0x55b246, 0x6cc85a, 0x8ad87a, 0xb8e8a8];
  const SPIDER = [0x221e1a, 0x2c2622, 0x362e28, 0x40372f];
  const PIG = [0xe8948c, 0xee9e96, 0xf2a8a0, 0xf6b2aa];
  const COW_B = [0x2a221e, 0x332a24, 0x3c322a];
  const COW_W = [0xd8d4ce, 0xe6e2dc, 0xf0ece6];
  const WOOL = [0xd6d6d6, 0xe2e2e2, 0xececec, 0xf8f8f8];
  const CHICK = [0xe0e0e0, 0xececec, 0xf6f6f6, 0xffffff];
  const VSKIN = [0xa87a5c, 0xb5896c, 0xbf957a];
  const ROBE = [0xb8b8b8, 0xc4c4c4, 0xd0d0d0, 0xdcdcdc];
  const eye = { k: 0x101010, w: 0xf0f0f0, g: 0x2a8a3a, d: 0x2a1a10, r: [0xe0201a, 0.4, 0.04, 0, 1], R: [0xff5040, 0.4, 0.04, 0, 1] };

  const SKINS = {
    zombie_head(p) {
      noiseFill(p, ZSKIN, 0.4);
      if (p.face === 'pz') art(p, ['', '', '', '', '.kk..kk.', '...dd...', '..dddd..'], { k: 0x0e1a0c, d: 0x2e5a22 });
      if (p.face === 'py') noiseFill(p, [0x2e5a22, 0x366a2a, 0x3f7a30], 0.3, 3);
      if (p.face !== 'py' && p.face !== 'ny') for (let x = 0; x < p.w; x++) { p.set(x, 0, 0x2e5a22); if (MC.hash2(x, p.fi, 7) < 0.5) p.set(x, 1, 0x366a2a); }
    },
    zombie_body(p) {
      noiseFill(p, ZSHIRT, 0.3);
      if (p.face === 'pz' || p.face === 'nz') for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x2a2a6a); p.set(x, p.h - 2, 0x363a8a); }
    },
    zombie_arm(p) {
      noiseFill(p, ZSKIN, 0.4);
      if (p.face !== 'ny') for (let y = 0; y < (p.face === 'py' ? p.h : 4); y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(ZSHIRT, MC.hash2(x, y, 3)));
    },
    zombie_leg(p) {
      noiseFill(p, ZPANTS, 0.3);
      if (p.face !== 'py' && p.face !== 'ny') for (let y = p.h - 2; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal([0x3a3a3a, 0x4a4a4a], MC.hash2(x, y, 5)));
      if (p.face === 'ny') noiseFill(p, [0x3a3a3a, 0x4a4a4a]);
    },
    skeleton_head(p) {
      noiseFill(p, BONE, 0.3);
      if (p.face === 'pz') art(p, ['', '', '', '.kk..kk.', '.kk..kk.', '...kk...', '.kkkkkk.', '.k.k.k..'], { k: 0x202020 });
    },
    skeleton_body(p) {
      p.clear();
      if (p.face === 'pz' || p.face === 'nz') {
        for (let x = 0; x < 8; x++) { p.set(x, 0, pal(BONE, MC.hash2(x, 0, 2))); }
        for (let y = 1; y < 12; y++) { p.set(3, y, BONE[2]); p.set(4, y, BONE[1]); }
        for (const y of [2, 4, 6]) for (let x = 1; x < 7; x++) p.set(x, y, pal(BONE, MC.hash2(x, y, 4)));
        for (let x = 1; x < 7; x++) { p.set(x, 10, BONE[2]); p.set(x, 11, BONE[1]); }
      } else if (p.face === 'py' || p.face === 'ny') {
        noiseFill(p, BONE);
      } else {
        for (let y = 0; y < 12; y++) p.set(1, y, BONE[1]);
        for (const y of [0, 2, 4, 6, 10, 11]) for (let x = 0; x < 4; x++) p.set(x, y, BONE[2]);
      }
    },
    skeleton_arm(p) { noiseFill(p, BONE, 0.2); },
    skeleton_leg(p) { noiseFill(p, BONE, 0.2); },
    creeper_head(p) {
      noiseFill(p, CREEP, 0.35);
      if (p.face === 'pz') art(p, ['', '', '.kk..kk.', '.kk..kk.', '...kk...', '..kkkk..', '..kkkk..', '..k..k..'], { k: 0x0a0a0a });
    },
    creeper_body(p) { noiseFill(p, CREEP, 0.35, 2); },
    creeper_leg(p) { noiseFill(p, CREEP, 0.35, 4); if (p.face === 'ny') noiseFill(p, [0x1a3a12, 0x224a18]); },
    spider_head(p) {
      noiseFill(p, SPIDER, 0.3);
      if (p.face === 'pz') art(p, ['', '', '.r.rr.r.', '..RR.RR.', '..RR.RR.', '.r....r.', '', '..k..k..'], { r: eye.r, R: eye.R, k: 0x0a0806 });
    },
    spider_neck(p) { noiseFill(p, SPIDER, 0.3, 1); },
    spider_body(p) {
      noiseFill(p, SPIDER, 0.3, 2);
      if (p.face === 'py') for (let y = 2; y < p.h - 2; y++) for (let x = 3; x < p.w - 3; x++) if ((x + y) % 3 === 0) p.set(x, y, 0x4a3a2a);
    },
    spider_leg(p) { noiseFill(p, SPIDER, 0.2, 3); for (let x = 0; x < p.w; x += 3) p.set(x, 0, 0x4a4038); },
    pig_body(p) { noiseFill(p, PIG, 0.3); },
    pig_head(p) {
      noiseFill(p, PIG, 0.3, 1);
      if (p.face === 'pz') art(p, ['', '', '', 'wk....kw', '', '', '..dddd..'], { k: 0x101010, w: 0xf0f0f0, d: 0xd88080 });
    },
    pig_snout(p) { noiseFill(p, [0xf0a8a8, 0xf6b8b8]); if (p.face === 'pz') { p.set(0, 1, 0x8a3a3a); p.set(3, 1, 0x8a3a3a); } },
    pig_leg(p) { noiseFill(p, PIG, 0.3, 2); if (p.face !== 'py' && p.face !== 'ny') for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0xa86a60); if (p.face === 'ny') noiseFill(p, [0xa86a60]); },
    cow_body(p) {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const n = MC.hash3(x >> 2, y >> 2, p.fi, 991) * 0.7 + MC.hash3(x, y, p.fi, 13) * 0.3;
        p.set(x, y, n > 0.62 ? pal(COW_W, MC.hash2(x, y, 3)) : pal(COW_B, MC.hash2(x, y, 4)));
      }
    },
    cow_head(p) {
      noiseFill(p, COW_B, 0.3);
      if (p.face === 'pz') art(p, ['..wwww..', '.wwwwww.', 'wkwwwwkw', 'k......k', '.pppppp.', '.pnppnp.', '.pppppp.', '.pppppp.'], { w: COW_W[2], k: 0x101010, p: 0xb8a8a0, n: 0x4a3a3a });
    },
    cow_horn(p) { noiseFill(p, [0xc8c0b0, 0xd8d0c0]); p.set(0, 0, 0x8a8278); },
    cow_leg(p) {
      noiseFill(p, COW_B, 0.3, 5);
      if (p.face !== 'py' && p.face !== 'ny') for (let y = 6; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y >= p.h - 2 ? 0x3a3028 : pal(COW_W, MC.hash2(x, y, 6)));
    },
    sheep_wool(p) {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const n = MC.hash3(x, y, p.fi, 17) * 0.5 + (((x + y * 2) % 3) === 0 ? 0 : 0.35);
        p.set(x, y, pal(WOOL, n), [0.05, 0.02, 0.4]);
      }
    },
    sheep_head(p) {
      noiseFill(p, [0xc8b89e, 0xd4c4aa, 0xdecfb6], 0.3);
      if (p.face === 'pz') art(p, ['wwwwww', '', 'wk..kw', '', '..nn..', '.pppp.'], { w: WOOL[2], k: 0x101010, n: 0x8a6a5a, p: 0xe0b8b0 });
      if (p.face === 'py' || p.face === 'px' || p.face === 'nx') for (let x = 0; x < p.w; x++) for (let y = 0; y < (p.face === 'py' ? p.h : 2); y++) p.set(x, y, pal(WOOL, MC.hash2(x, y, 9)));
    },
    sheep_leg(p) {
      noiseFill(p, [0xc8b89e, 0xd4c4aa], 0.3);
      if (p.face !== 'ny') for (let y = 0; y < (p.face === 'py' ? p.h : 6); y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(WOOL, MC.hash2(x, y, 11)));
    },
    chicken_body(p) { noiseFill(p, CHICK, 0.3); },
    chicken_head(p) { noiseFill(p, CHICK, 0.3, 1); if (p.face === 'pz') art(p, ['', 'k..k'], { k: 0x101010 }); if (p.face === 'px' || p.face === 'nx') p.set(1, 1, 0x101010); },
    chicken_beak(p) { noiseFill(p, [0xe8a020, 0xf0b030]); },
    chicken_wattle(p) { noiseFill(p, [0xc81e1e, 0xe02a2a]); },
    chicken_wing(p) { noiseFill(p, CHICK, 0.3, 3); if (p.face === 'px' || p.face === 'nx') for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0xd0d0d0); },
    chicken_leg(p) { noiseFill(p, [0xe8a020, 0xd89018]); },
    villager_head(p) {
      noiseFill(p, VSKIN, 0.35);
      if (p.face === 'pz') art(p, ['', '', '', '.dddddd.', '.wg..gw.', '', '', '', '.mmmmmm.', ''], { d: 0x3a2418, w: 0xf0f0f0, g: 0x2a8a3a, m: 0x8a5a44 });
      if (p.face === 'py') noiseFill(p, [0x9a6c50, 0xa87a5c], 0.3, 4);
    },
    villager_nose(p) { noiseFill(p, [0x9a6c50, 0xa87a5c]); },
    villager_robe(p) {
      noiseFill(p, ROBE, 0.3);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 0; y < p.h; y++) p.set(Math.floor(p.w / 2), y, 0xa8a8a8);
        for (let x = 0; x < p.w; x++) { p.set(x, 11, 0x5a5a5a); }
      }
      if (p.face !== 'py' && p.face !== 'ny') for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x9a9a9a);
    },
    villager_armmid(p) { noiseFill(p, ROBE, 0.3, 2); if (p.face === 'pz') for (let x = 0; x < p.w; x++) { p.set(x, 1, VSKIN[1]); p.set(x, 2, VSKIN[0]); } },
    villager_arm(p) { noiseFill(p, ROBE, 0.3, 3); },
    villager_leg(p) { noiseFill(p, [0x4a3a2e, 0x54443a, 0x5e4e42], 0.3); },
    player_arm(p) {
      noiseFill(p, [0xc8966e, 0xd4a27a, 0xdcac84], 0.4);
      for (let y = 0; y < (p.face === 'py' ? p.h : 4); y++) for (let x = 0; x < p.w; x++) if (p.face !== 'ny') p.set(x, y, pal([0x2e8ab0, 0x3496bc, 0x3ca2c8], MC.hash2(x, y, 1)));
    },
  };

  // castle mobs and bosses (castlemodels.js)
  if (MC.castleModels) MC.castleModels({ P, biped, quad, noiseFill, art, pal, eye }, MC.MOB_MODELS, SKINS);
  // the kingdom's people (kingdommodels.js)
  if (MC.kingdomModels) MC.kingdomModels({ P, biped, quad, noiseFill, art, pal, eye }, MC.MOB_MODELS, SKINS);
  // warriors of the Japanese castles (wajomodels.js)
  if (MC.wajoModels) MC.wajoModels({ P, biped, quad, noiseFill, art, pal, eye }, MC.MOB_MODELS, SKINS);

  // ---------------------------------------------------------------- skin packing
  const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const faceSize = (f, w, h, d) => (f < 2 ? [d, h] : f < 4 ? [w, d] : [w, h]);
  const skinBoxes = {};   // skin key -> [w,h,d]
  for (const type in MC.MOB_MODELS) for (const part of MC.MOB_MODELS[type].parts) {
    const [, , , w, h, d] = part.box;
    skinBoxes[part.skin] = [w, h, d];
  }
  // shelf packer over 16x16 tiles
  const rects = [];
  for (const sk in skinBoxes) {
    const [w, h, d] = skinBoxes[sk];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = faceSize(f, w, h, d);
      rects.push({ sk, f, w: Math.max(1, Math.ceil(fw)), h: Math.max(1, Math.ceil(fh)), fw, fh });
    }
  }
  rects.sort((a, b) => b.h - a.h || b.w - a.w);
  const tiles = [];   // { name, shelves: [{y, h, x}] , rects: [] }
  const place = (r) => {
    for (const t of tiles) {
      for (const s of t.shelves) if (r.h <= s.h && s.x + r.w <= 16) { r.x = s.x; r.y = s.y; s.x += r.w; t.rects.push(r); return t; }
      const top = t.shelves.reduce((a, s) => Math.max(a, s.y + s.h), 0);
      if (top + r.h <= 16) { const s = { y: top, h: r.h, x: r.w }; t.shelves.push(s); r.x = 0; r.y = top; t.rects.push(r); return t; }
    }
    const t = { name: 'mobskin_' + tiles.length, shelves: [{ y: 0, h: r.h, x: r.w }], rects: [r] };
    r.x = 0; r.y = 0;
    tiles.push(t);
    return t;
  };
  const faceRect = {};   // skin key -> [6] {tile, u0, v0, fw, fh}
  for (const r of rects) {
    const t = place(r);
    r.tileName = t.name;
    (faceRect[r.sk] || (faceRect[r.sk] = []))[r.f] = r;
  }
  for (const t of tiles) {
    MC.addTile(t.name);
    MC.TexGen.define(t.name, { cutout: true, normal: 0.45 }, (c) => {
      for (let i = 0; i < 256; i++) { c.px(i & 15, i >> 4, 0.5, 0.5, 0.5, 0); c.s(i & 15, i >> 4, 0.1, 0.03); }
      for (const r of t.rects) {
        const p = {
          w: r.w, h: r.h, face: FACE_KEYS[r.f], fi: r.f, seed: c.seed,
          set(x, y, hex, spec) {
            if (x < 0 || y < 0 || x >= r.w || y >= r.h) return;
            const col = H(hex);
            c.px(r.x + x, r.y + y, col[0], col[1], col[2], 1);
            c.h(r.x + x, r.y + y, 0.45 + 0.4 * (0.3 * col[0] + 0.55 * col[1] + 0.15 * col[2]));
            if (spec) c.s(r.x + x, r.y + y, spec[0], spec[1], spec[2] || 0, spec[3] || 0); else c.s(r.x + x, r.y + y, 0.12, 0.03, 0.1, 0);
          },
          clear() { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) c.px(r.x + x, r.y + y, 0.5, 0.5, 0.5, 0); },
          clear1(x, y) { if (x >= 0 && y >= 0 && x < r.w && y < r.h) c.px(r.x + x, r.y + y, 0.5, 0.5, 0.5, 0); },
        };
        SKINS[r.sk](p);
      }
    });
  }
  // resolve per-part face uv rects (tile index resolved lazily after all tiles exist)
  for (const type in MC.MOB_MODELS) for (const part of MC.MOB_MODELS[type].parts) {
    part.faces = faceRect[part.skin].map((r) => ({ tileName: r.tileName, u0: r.x, v0: r.y, fw: r.fw, fh: r.fh }));
  }
  MC.resolveModelTiles = function () {
    for (const type in MC.MOB_MODELS) for (const part of MC.MOB_MODELS[type].parts) for (const f of part.faces) f.tile = MC.TILE[f.tileName];
  };
  MC.resolveModelTiles();
})();
