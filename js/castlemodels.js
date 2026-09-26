'use strict';
// Box models and painted skins of the castle mobs and bosses. models.js calls MC.castleModels() before it
// packs every skin into texture tiles, so these share the mob texture pipeline (albedo / normal / specular,
// emissive pixels for glowing eyes, runes and lava cracks).
MC.castleModels = function (kit, MODELS, SKINS) {
  const { P, biped, noiseFill, art, pal } = kit;
  const GLOW = (hex) => [hex, 0.4, 0.04, 0, 1];

  // ---------------------------------------------------------------- models
  const knightParts = (pre) => [
    ...biped(pre, 4),
    P('plume', [0, 24, 0], [-1, 8, -3, 2, 3, 7], pre + '_plume', { parent: 'head' }),
    P('rpad', [-6, 22, 0], [-3.5, -1.5, -3, 5, 4, 6], pre + '_pad', { parent: 'rarm' }),
    P('lpad', [6, 22, 0], [-1.5, -1.5, -3, 5, 4, 6], pre + '_pad', { parent: 'larm' }),
  ];
  const robed = (pre, o = {}) => [
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], pre + '_head'),
    P('hood', [0, 24, 0], [-4.5, -0.5, -4.5, 9, 9.5, 9], pre + '_hood', { parent: 'head' }),
    P('body', [0, 24, 0], [-4, -16, -3, 8, 16, 6], pre + '_robe'),
    P('rarm', [-6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    P('larm', [6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    ...(o.skirt ? [P('skirt', [0, 24, 0], [-5, -24, -4, 10, 10, 8], pre + '_skirt')] : [
      P('rleg', [-2, 8, 0], [-2, -8, -2, 4, 8, 4], pre + '_leg'),
      P('lleg', [2, 8, 0], [-2, -8, -2, 4, 8, 4], pre + '_leg'),
    ]),
  ];
  Object.assign(MODELS, {
    knight: { anim: 'biped', parts: knightParts('knight') },
    ghoul: { anim: 'zombie', parts: biped('ghoul', 4) },
    frozen: { anim: 'zombie', parts: biped('frozen', 4) },
    mummy: { anim: 'zombie', parts: biped('mummy', 4) },
    cultist: { anim: 'caster', parts: robed('cultist') },
    necromancer: { anim: 'caster', parts: [...robed('necro'), P('collar', [0, 24, 0], [-5, -3, -3.5, 10, 3, 7], 'necro_collar')] },
    pharaoh: { anim: 'caster', parts: [
      ...biped('pharaoh', 4).filter((p) => p.name !== 'head'),
      P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], 'pharaoh_head'),
      P('nemes', [0, 24, 0], [-5, -5, -5, 10, 14, 9], 'pharaoh_nemes', { parent: 'head' }),
      P('uraeus', [0, 24, 0], [-1, 7, 3.5, 2, 3, 2], 'pharaoh_uraeus', { parent: 'head' }),
    ] },
    frost_queen: { anim: 'caster', parts: [
      ...robed('queen', { skirt: true }).filter((p) => p.name !== 'hood'),
      P('hair', [0, 24, 0], [-4.5, -6, -4.8, 9, 14.5, 3], 'queen_hair', { parent: 'head' }),
      P('crown', [0, 24, 0], [-4.5, 7, -4.5, 9, 4, 9], 'queen_crown', { parent: 'head' }),
    ] },
    scorpion: { anim: 'scorpion', parts: [
      P('body', [0, 6, 0], [-5, -3, -9, 10, 6, 16], 'scorp_body'),
      P('head', [0, 6, 7], [-4, -2, 0, 8, 5, 5], 'scorp_head'),
      P('rclaw', [-4, 6, 10], [-2, -1.5, 0, 3, 3, 6], 'scorp_claw'),
      P('lclaw', [4, 6, 10], [-1, -1.5, 0, 3, 3, 6], 'scorp_claw'),
      P('rpincer', [-4, 6, 10], [-3, -2, 6, 5, 4, 4], 'scorp_pincer', { parent: 'rclaw' }),
      P('lpincer', [4, 6, 10], [-2, -2, 6, 5, 4, 4], 'scorp_pincer', { parent: 'lclaw' }),
      P('tail', [0, 7, -9], [-2, -1, -6, 4, 4, 6], 'scorp_tail'),
      P('tail1', [0, 7, -9], [-1.5, 3, -7, 3, 6, 3], 'scorp_tail1', { parent: 'tail' }),
      P('tail2', [0, 7, -9], [-1.5, 8, -6, 3, 3, 4], 'scorp_tail2', { parent: 'tail' }),
      P('sting', [0, 7, -9], [-1, 9, -2, 2, 2, 4], 'scorp_sting', { parent: 'tail' }),
      ...[4, 0, -4].flatMap((z, i) => [
        P('rleg' + i, [-4, 5, z], [-10, -1, -1, 10, 2, 2], 'scorp_leg'),
        P('lleg' + i, [4, 5, z], [0, -1, -1, 10, 2, 2], 'scorp_leg'),
      ]),
    ] },
    brute: { anim: 'brute', heldY: -13, parts: [
      P('body', [0, 26, 0], [-6, -12, -4, 12, 12, 8], 'brute_body'),
      P('head', [0, 26, -1], [-4, -2, -4, 8, 8, 7], 'brute_head'),
      P('rhorn', [0, 26, -1], [-6, 3, -1, 2, 5, 2], 'brute_horn', { parent: 'head' }),
      P('lhorn', [0, 26, -1], [4, 3, -1, 2, 5, 2], 'brute_horn', { parent: 'head' }),
      P('rarm', [-9, 24, 0], [-3, -14, -3, 6, 16, 6], 'brute_arm'),
      P('larm', [9, 24, 0], [-3, -14, -3, 6, 16, 6], 'brute_arm'),
      P('rleg', [-3, 14, 0], [-3, -14, -3, 6, 14, 6], 'brute_leg'),
      P('lleg', [3, 14, 0], [-3, -14, -3, 6, 14, 6], 'brute_leg'),
    ] },
    demon: { anim: 'brute', heldY: -13, parts: [
      P('body', [0, 26, 0], [-6, -12, -4, 12, 12, 8], 'demon_body'),
      P('head', [0, 26, -1], [-4, -2, -4, 8, 8, 7], 'demon_head'),
      P('rhorn', [0, 26, -1], [-7, 3, -2, 3, 3, 2], 'demon_horn', { parent: 'head' }),
      P('lhorn', [0, 26, -1], [4, 3, -2, 3, 3, 2], 'demon_horn', { parent: 'head' }),
      P('rhorn2', [0, 26, -1], [-8, 6, -2, 2, 4, 2], 'demon_horn2', { parent: 'head' }),
      P('lhorn2', [0, 26, -1], [6, 6, -2, 2, 4, 2], 'demon_horn2', { parent: 'head' }),
      P('rwing', [-2, 25, -4], [-16, -5, -1, 16, 16, 1], 'demon_wing'),
      P('lwing', [2, 25, -4], [0, -5, -1, 16, 16, 1], 'demon_wing'),
      P('rarm', [-9, 24, 0], [-3, -14, -3, 6, 16, 6], 'demon_arm'),
      P('larm', [9, 24, 0], [-3, -14, -3, 6, 16, 6], 'demon_arm'),
      P('rleg', [-3, 14, 0], [-3, -14, -3, 6, 14, 6], 'demon_leg'),
      P('lleg', [3, 14, 0], [-3, -14, -3, 6, 14, 6], 'demon_leg'),
    ] },
  });

  // ---------------------------------------------------------------- skins
  const side = (p) => p.face !== 'py' && p.face !== 'ny';
  const STEEL = [0x5a5f68, 0x6b717b, 0x7c838e, 0x8e95a0, 0xa3aab4];
  const RED = [0x7a1616, 0x941c1c, 0xa82222];
  const GHOUL = [0x6f7a6c, 0x7d8a78, 0x8b9886, 0x98a593];
  const RAGS = [0x2e2a26, 0x3a3430, 0x4a4238];
  const FROZ = [0x62829a, 0x7090a8, 0x7e9eb6, 0x8cacc4];
  const ROBE_P = [0x2a1a3a, 0x341f48, 0x3e2554, 0x482b60];
  const NECRO = [0x121016, 0x18161e, 0x201d28, 0x28242f];
  const BAND = [0xa89a78, 0xb8ab88, 0xc9bc98, 0xd6caa8, 0xe2d8ba];
  const GOLD = [0xc08a18, 0xd8a020, 0xf0c030, 0xffd84a];
  const LAPIS = [0x1e3a8a, 0x24489e, 0x2c56b4];
  const CHITIN = [0x7a5a30, 0x8a6a3a, 0x9c7a44, 0xae8a4e, 0xc09a5a];
  const BASALT = [0x241f1f, 0x2d2727, 0x363030, 0x403a3a];
  const DEMON = [0x4a100c, 0x5a1410, 0x6e1a14, 0x821f18];
  const GOWN = [0x9cbce0, 0xa8c8e8, 0xbcd6f0, 0xd0e4f8];
  const QSKIN = [0xbcd2ea, 0xc8dcf0, 0xd4e6f8];
  const HAIR = [0xd0e0f4, 0xdce8f8, 0xe8f0ff];
  const ICE = [0x9fe8ff, 0.9, 0.08, 0, 0.6];
  // glowing crack pattern (lava veins)
  const veins = (p, seed, col, emit = 1) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const v = MC.hash3(x >> 1, y, p.fi + seed, 5) < 0.18 && MC.hash3(x, y, p.fi + seed, 9) < 0.55;
      if (v) p.set(x, y, col, [0.3, 0.04, 0, emit]);
    }
  };

  Object.assign(SKINS, {
    // --- knight
    knight_head(p) {
      noiseFill(p, STEEL, 0.4);
      if (p.face === 'pz') {
        for (let x = 1; x < 7; x++) p.set(x, 3, 0x101014);
        p.set(2, 3, GLOW(0xff3020)); p.set(5, 3, GLOW(0xff3020));
        for (let y = 0; y < 8; y++) if (y !== 3) p.set(3, y, STEEL[4]);
        for (const [x, y] of [[1, 5], [2, 6], [5, 5], [6, 6], [2, 5], [5, 6]]) p.set(x, y, 0x202228);
      }
      if (p.face === 'py') for (let x = 0; x < p.w; x++) p.set(x, 3, STEEL[4]);
    },
    knight_plume(p) { noiseFill(p, RED, 0.3); },
    knight_body(p) {
      noiseFill(p, STEEL, 0.35, 2);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 2; y < 12; y++) for (let x = 2; x < 6; x++) p.set(x, y, pal(RED, MC.hash2(x, y, 3)));
        if (p.face === 'pz') { for (let y = 4; y < 9; y++) p.set(3, y, 0xe8c040); for (let x = 2; x < 6; x++) p.set(x, 5, 0xe8c040); }
        for (let x = 0; x < p.w; x++) p.set(x, 8, 0x3a2614);
        if (p.face === 'pz') p.set(4, 8, 0xe8c040);
      }
    },
    knight_arm(p) {
      noiseFill(p, STEEL, 0.35, 3);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 3, 0x3a3e46); p.set(x, 4, STEEL[4]); }
    },
    knight_leg(p) {
      noiseFill(p, STEEL, 0.35, 4);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 5, STEEL[4]); p.set(x, p.h - 1, 0x2a2a2e); p.set(x, p.h - 2, 0x33343a); }
    },
    knight_pad(p) { noiseFill(p, [0x7c838e, 0x8e95a0, 0xa3aab4], 0.3, 5); if (p.face === 'py') for (let x = 0; x < p.w; x += 2) p.set(x, 1, 0xd0d4dc); },
    // --- ghoul
    ghoul_head(p) {
      noiseFill(p, GHOUL, 0.45);
      if (p.face === 'pz') art(p, ['', '', '.kk..kk.', '.kW..Wk.', '', '..dddd..', '..wkwk..', '...dd...'], { k: 0x0a0c0a, W: GLOW(0xd8ffb0), d: 0x3a4436, w: 0xd8d4c0 });
      if (p.face === 'py') noiseFill(p, [0x3a3e36, 0x464a40], 0.4, 3);
    },
    ghoul_body(p) {
      noiseFill(p, RAGS, 0.4);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (MC.hash3(x, y, p.fi, 31) < 0.18) p.set(x, y, pal(GHOUL, MC.hash2(x, y, 2)));
    },
    ghoul_arm(p) { noiseFill(p, GHOUL, 0.45, 2); if (p.face !== 'ny') for (let y = 0; y < 3; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(RAGS, MC.hash2(x, y, 4))); },
    ghoul_leg(p) { noiseFill(p, RAGS, 0.4, 3); if (side(p)) for (let y = p.h - 4; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(GHOUL, MC.hash2(x, y, 6))); },
    // --- frozen dead
    frozen_head(p) {
      noiseFill(p, FROZ, 0.45);
      if (p.face === 'pz') art(p, ['', '', '', '.kk..kk.', '.kW..Wk.', '...dd...', '..dddd..'], { k: 0x0c1824, W: GLOW(0x9ff0ff), d: 0x3a5a70 });
      for (let x = 0; x < p.w; x++) if (MC.hash2(x, p.fi, 11) < 0.6) p.set(x, 0, 0xeaf6ff);
    },
    frozen_body(p) {
      noiseFill(p, [0x1e2a44, 0x243252, 0x2a3a5e], 0.35);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (MC.hash3(x, y, p.fi, 41) < 0.14) p.set(x, y, 0xe8f6ff, [0.8, 0.05]);
    },
    frozen_arm(p) { noiseFill(p, FROZ, 0.45, 2); for (let x = 0; x < p.w; x++) if (MC.hash2(x, p.fi, 13) < 0.5) p.set(x, p.h - 1, 0xeaf6ff); },
    frozen_leg(p) { noiseFill(p, [0x1e2a44, 0x243252], 0.35, 3); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x1a1e28); },
    // --- mummy
    mummy_head(p) {
      noiseFill(p, BAND, 0.3);
      for (let y = 1; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.set(x, y, BAND[0]);
      if (p.face === 'pz') art(p, ['', '', '', '.kY..Yk.', '', '', '..kkkk..'], { k: 0x1a140c, Y: GLOW(0xffd040) });
    },
    mummy_body(p) {
      noiseFill(p, BAND, 0.3, 2);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + y * 2 + p.fi) % 5 === 0) p.set(x, y, BAND[0]);
      if (p.face === 'pz') for (let y = 3; y < 7; y++) p.set(3 + (y & 1), y, 0x3a2e1e);
    },
    mummy_arm(p) { noiseFill(p, BAND, 0.3, 3); for (let y = 0; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.set(x, y, BAND[0]); },
    mummy_leg(p) { noiseFill(p, BAND, 0.3, 4); for (let y = 1; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.set(x, y, BAND[0]); },
    // --- cultist
    cultist_head(p) {
      noiseFill(p, [0x141018, 0x1a141e], 0.3);
      if (p.face === 'pz') { p.set(2, 4, GLOW(0xc070ff)); p.set(5, 4, GLOW(0xc070ff)); }
    },
    cultist_hood(p) {
      noiseFill(p, ROBE_P, 0.35);
      if (p.face === 'pz') for (let y = 2; y < p.h; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y);
    },
    cultist_robe(p) {
      noiseFill(p, ROBE_P, 0.35, 2);
      if (p.face === 'pz') { for (let y = 0; y < p.h; y++) p.set(3, y, 0xc8a040); for (let x = 1; x < 7; x++) p.set(x, 10, 0xc8a040); p.set(3, 4, GLOW(0xc070ff)); p.set(4, 4, GLOW(0xc070ff)); }
    },
    cultist_arm(p) { noiseFill(p, ROBE_P, 0.35, 3); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, 0xc8a040); if (p.face === 'ny') noiseFill(p, [0xa8866c, 0xb89478]); },
    cultist_leg(p) { noiseFill(p, [0x1a141e, 0x221a28], 0.3, 4); },
    // --- necromancer
    necro_head(p) {
      noiseFill(p, [0xd8d2bc, 0xe4dec8, 0xece6d2], 0.3);
      if (p.face === 'pz') art(p, ['', '', '.kk..kk.', '.kG..Gk.', '...kk...', '', '.k.k.k..', '..k.k.k.'], { k: 0x101010, G: GLOW(0x60ff90) });
    },
    necro_hood(p) {
      noiseFill(p, NECRO, 0.3);
      if (p.face === 'pz') for (let y = 2; y < p.h; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y);
      if (side(p) && p.face !== 'pz') for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x6a2a9a);
    },
    necro_robe(p) {
      noiseFill(p, NECRO, 0.3, 2);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 0; y < p.h; y++) { p.set(0, y, 0x4a1a6a); p.set(p.w - 1, y, 0x4a1a6a); }
        for (const [x, y] of [[3, 5], [4, 6], [3, 7], [4, 9], [3, 11], [4, 12]]) p.set(x, y, GLOW(0xa040ff));
      }
    },
    necro_arm(p) { noiseFill(p, NECRO, 0.3, 3); if (p.face === 'ny') noiseFill(p, [0xd8d2bc, 0xe4dec8]); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, 0x4a1a6a); },
    necro_leg(p) { noiseFill(p, NECRO, 0.3, 4); },
    necro_collar(p) {
      noiseFill(p, [0xd8d2bc, 0xe4dec8], 0.3);
      for (let x = 0; x < p.w; x += 2) p.set(x, 0, 0x6a6048);
    },
    // --- pharaoh (sand king)
    pharaoh_head(p) {
      noiseFill(p, GOLD, 0.25);
      if (p.face === 'pz') art(p, ['', '', 'LLL..LLL', '.LY..YL.', '...gg...', '...gg...', '..gddg..', '...dd...'], { L: LAPIS[1], Y: GLOW(0x80e0ff), g: GOLD[3], d: 0x8a5a10 });
    },
    pharaoh_nemes(p) {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, (y >> 1) % 2 ? LAPIS[1] : GOLD[2], [0.6, 0.5]);
      if (p.face === 'pz') for (let y = 1; y < p.h; y++) for (let x = 1; x < p.w - 1; x++) if (y < 9) p.clear1(x, y);
      if (p.face === 'ny') for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y);
    },
    pharaoh_uraeus(p) { noiseFill(p, GOLD, 0.2); if (p.face === 'pz') p.set(0, 0, GLOW(0xff4020)); },
    pharaoh_body(p) {
      noiseFill(p, BAND, 0.3, 2);
      if (side(p)) for (let y = 0; y < 4; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y % 2 ? LAPIS[2] : GOLD[2], [0.7, 0.5]);
      if (p.face === 'pz') for (let y = 8; y < 12; y++) for (let x = 2; x < 6; x++) p.set(x, y, (x + y) % 2 ? GOLD[1] : LAPIS[1]);
    },
    pharaoh_arm(p) { noiseFill(p, BAND, 0.3, 3); if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 6, GOLD[2]); p.set(x, 7, GOLD[3]); } },
    pharaoh_leg(p) { noiseFill(p, BAND, 0.3, 4); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, GOLD[1]); },
    // --- frost queen
    queen_head(p) {
      noiseFill(p, QSKIN, 0.3);
      if (p.face === 'pz') art(p, ['hhhhhhhh', 'h......h', '', '.bC..Cb.', '', '', '...dd...', ''], { h: HAIR[2], b: 0x2a3a6a, C: GLOW(0x80f0ff), d: 0x3a5a9a });
      if (p.face === 'py' || p.face === 'nz') noiseFill(p, HAIR, 0.3, 5);
      if (p.face === 'px' || p.face === 'nx') for (let y = 0; y < 3; y++) for (let x = 0; x < p.w; x++) p.set(x, y, HAIR[1]);
    },
    queen_hair(p) { noiseFill(p, HAIR, 0.35, 2); for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + p.fi) % 3 === 0) p.set(x, y, 0xc0d4ec); },
    queen_crown(p) {
      if (side(p)) for (let x = 0; x < p.w; x++) {
        const spike = x % 3 === 1 ? 0 : x % 3 === 0 ? 1 : 2;
        for (let y = spike; y < p.h; y++) p.set(x, y, y === p.h - 1 ? 0xd8f4ff : ICE[0], [0.9, 0.08, 0, y < 2 ? 0.9 : 0.5]);
      }
    },
    queen_robe(p) {
      noiseFill(p, GOWN, 0.35, 2);
      if (p.face === 'pz') { for (let y = 0; y < p.h; y++) p.set(3, y, 0xeaf6ff); for (const [x, y] of [[2, 3], [5, 3], [3, 1]]) p.set(x, y, ICE); }
    },
    queen_arm(p) { noiseFill(p, GOWN, 0.35, 3); if (p.face === 'ny') noiseFill(p, QSKIN); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, 0xeaf6ff); },
    queen_skirt(p) {
      noiseFill(p, GOWN, 0.35, 4);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x7a9cc8); if (x % 3 === 0) p.set(x, p.h - 3, ICE); }
    },
    // --- scorpion
    scorp_body(p) {
      noiseFill(p, CHITIN, 0.35);
      if (p.face === 'py') for (let y = 0; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.set(x, y, CHITIN[0]);
    },
    scorp_head(p) {
      noiseFill(p, CHITIN, 0.35, 1);
      if (p.face === 'pz') art(p, ['', '.k.kk.k.', '..kRRk..', '........'], { k: 0x100c08, R: GLOW(0xff4020) });
    },
    scorp_claw(p) { noiseFill(p, CHITIN, 0.3, 2); },
    scorp_pincer(p) { noiseFill(p, [0x6a4a26, 0x7a5a30, 0x8a6a3a], 0.3, 3); if (p.face === 'pz') for (let y = 1; y < 3; y++) p.set(2, y, 0x100c08); },
    scorp_tail(p) { noiseFill(p, CHITIN, 0.35, 4); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, 0, CHITIN[0]); },
    scorp_tail1(p) { SKINS.scorp_tail(p); },
    scorp_tail2(p) { SKINS.scorp_tail(p); },
    scorp_sting(p) { noiseFill(p, [0x3a1010, 0x5a1414], 0.3); if (p.face === 'pz') p.set(0, 0, GLOW(0xff6030)); },
    scorp_leg(p) { noiseFill(p, CHITIN, 0.3, 5); for (let x = 0; x < p.w; x += 4) p.set(x, 0, CHITIN[0]); },
    // --- magma brute
    brute_body(p) { noiseFill(p, BASALT, 0.4); veins(p, 1, 0xff7a1a); if (p.face === 'pz') for (let y = 4; y < 8; y++) for (let x = 5; x < 7; x++) p.set(x, y, 0xffb040, [0.3, 0.04, 0, 1]); },
    brute_head(p) {
      noiseFill(p, BASALT, 0.4, 1);
      if (p.face === 'pz') art(p, ['', '', '.kYk.kYk', '', '..kkkk..', '..kOOk..', '..kkkk..'], { k: 0x120e0e, Y: GLOW(0xffd040), O: GLOW(0xff6a10) });
    },
    brute_horn(p) { noiseFill(p, [0x3a3030, 0x4a3e3a, 0x5a4c46], 0.3); },
    brute_arm(p) { noiseFill(p, BASALT, 0.4, 2); veins(p, 3, 0xff7a1a); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x181414); },
    brute_leg(p) { noiseFill(p, BASALT, 0.4, 3); veins(p, 5, 0xff7a1a); },
    // --- fire demon
    demon_body(p) {
      noiseFill(p, DEMON, 0.4);
      veins(p, 7, 0xffc040);
      if (p.face === 'pz') for (let y = 3; y < 9; y++) for (let x = 4; x < 8; x++) if ((x + y) % 2) p.set(x, y, 0xffd060, [0.3, 0.04, 0, 1]);
    },
    demon_head(p) {
      noiseFill(p, DEMON, 0.4, 1);
      if (p.face === 'pz') art(p, ['', 'k......k', '.kYY.YYk', '', '.kwkkwk.', '..kOOk..', '..kkkk..'], { k: 0x160606, Y: GLOW(0xffe060), O: GLOW(0xff7a10), w: 0xe8e0c8 });
    },
    demon_horn(p) { noiseFill(p, [0x141010, 0x1e1818, 0x2a2222], 0.3); if (p.face === 'py') p.set(0, 0, 0x5a4a40); },
    demon_horn2(p) { SKINS.demon_horn(p); },
    demon_wing(p) {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
        const rib = x % 5 === 0 || y === 0;
        const edge = y > p.h - 1 - Math.floor(((x % 5) + 1) * 0.8);
        if (edge && !rib) continue;
        p.set(x, y, rib ? 0x2a1414 : pal([0x5a1410, 0x6a1a14, 0x7a2018], MC.hash2(x, y, 3)), rib ? null : [0.2, 0.04, 0.5, 0]);
      }
    },
    demon_arm(p) { noiseFill(p, DEMON, 0.4, 2); veins(p, 9, 0xffc040); if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x140404); p.set(x, p.h - 2, 0x201010); } },
    demon_leg(p) { noiseFill(p, DEMON, 0.4, 3); veins(p, 11, 0xffc040); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x140404); },
  });
};
