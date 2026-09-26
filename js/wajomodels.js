'use strict';
// Box models and painted skins of the Japanese castles' warriors: ashigaru foot soldiers (conical jingasa,
// okegawa cuirass, a sashimono banner on the back in their clan's colour — parts tagged tint: 'robe'),
// samurai and hatamoto guards (kabuto with kuwagata crest, sode, kusazuri), ninja and ochimusha (fallen
// warriors' ghosts with arrows still in their backs). models.js calls MC.wajoModels() before packing skins.
MC.wajoModels = function (kit, MODELS, SKINS) {
  const { P, noiseFill, art, pal } = kit;
  const GLOW = (hex) => [hex, 0.4, 0.04, 0, 1];
  const side = (p) => p.face !== 'py' && p.face !== 'ny';

  // ---------------------------------------------------------------- models
  const human = (pre) => [
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], pre + '_head'),
    P('body', [0, 24, 0], [-4, -12, -2, 8, 12, 4], pre + '_body'),
    P('rarm', [-6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    P('larm', [6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    P('rleg', [-2, 12, 0], [-2, -12, -2, 4, 12, 4], pre + '_leg'),
    P('lleg', [2, 12, 0], [-2, -12, -2, 4, 12, 4], pre + '_leg'),
  ];
  const ashigaru = () => [
    ...human('ash'),
    P('kasa', [0, 24, 0], [-6.5, 7.5, -6.5, 13, 1.5, 13], 'ash_kasa', { parent: 'head' }),
    P('kasa2', [0, 24, 0], [-3.5, 9, -3.5, 7, 1.5, 7], 'ash_kasa2', { parent: 'head' }),
    P('do', [0, 24, 0], [-4.4, -11, -2.4, 8.8, 10, 4.8], 'ash_do'),
    P('kusa', [0, 24, 0], [-4.7, -15, -2.7, 9.4, 5, 5.4], 'ash_kusa'),
    P('sashi', [0, 24, 0], [-0.5, -9, -3.6, 1, 27, 1], 'ash_pole'),
    P('flag', [0, 24, 0], [0.5, 7, -3.4, 5, 10, 0.5], 'ash_flag', { tint: 'robe' }),
  ];
  const samurai = (pre) => [
    ...human(pre),
    P('kabuto', [0, 24, 0], [-4.6, 4.5, -4.6, 9.2, 4.2, 9.2], pre + '_kabuto', { parent: 'head' }),
    P('shikoro', [0, 24, 0], [-5.6, 1.5, -5.6, 11.2, 3.5, 8], pre + '_shikoro', { parent: 'head' }),
    P('kuwa', [0, 24, 0], [-4, 7.5, 4.7, 8, 6, 0.4], pre + '_kuwa', { parent: 'head' }),
    P('rsode', [-6, 22, 0], [-4.2, -5, -2.7, 2, 7, 5.4], pre + '_sode', { parent: 'rarm' }),
    P('lsode', [6, 22, 0], [2.2, -5, -2.7, 2, 7, 5.4], pre + '_sode', { parent: 'larm' }),
    P('do', [0, 24, 0], [-4.5, -11.5, -2.5, 9, 11, 5], pre + '_do'),
    P('kusa', [0, 24, 0], [-4.9, -16, -2.9, 9.8, 6, 5.8], pre + '_kusa'),
    P('saya', [0, 24, 0], [4.9, -12.5, -6, 0.9, 1, 10], 'sam_saya'),
  ];
  Object.assign(MODELS, {
    ashigaru: { anim: 'biped', parts: ashigaru() },
    ashigaru_bow: { anim: 'skeleton', parts: ashigaru() },
    samurai: { anim: 'biped', parts: samurai('sam') },
    hatamoto: { anim: 'biped', parts: [...samurai('hat'), P('horo', [0, 24, 0], [-4, -10, -6.5, 8, 11, 4], 'hat_horo', { tint: 'robe' })] },
    ninja: { anim: 'biped', parts: [
      ...human('nin'),
      P('hood', [0, 24, 0], [-4.4, -0.4, -4.4, 8.8, 8.8, 8.8], 'nin_hood', { parent: 'head' }),
      P('knot', [0, 24, 0], [-1, 4, -6.4, 2, 2, 2.2], 'nin_knot', { parent: 'head' }),
      P('back', [0, 24, 0], [-3.4, -11, -3.3, 1.2, 14, 1.2], 'nin_saya'),
      P('belt', [0, 24, 0], [-4.3, -8, -2.3, 8.6, 1.5, 4.6], 'nin_belt'),
    ] },
    ochimusha: { anim: 'zombie', parts: [
      ...human('och'),
      P('hair', [0, 24, 0], [-4.5, -4, -4.6, 9, 11, 4], 'och_hair', { parent: 'head' }),
      P('do', [0, 24, 0], [-4.5, -11.5, -2.5, 9, 11, 5], 'och_do'),
      P('kusa', [0, 24, 0], [-4.9, -16, -2.9, 9.8, 5, 5.8], 'och_kusa'),
      P('rsode', [-6, 22, 0], [-4.2, -5, -2.7, 2, 7, 5.4], 'och_sode', { parent: 'rarm' }),
      P('arrow1', [0, 24, 0], [1.2, -5, -10, 0.6, 0.6, 8], 'och_arrow'),
      P('arrow2', [0, 24, 0], [-2.6, -8.5, -9, 0.6, 0.6, 7], 'och_arrow'),
      P('arrow3', [0, 24, 0], [-0.4, -2.5, -8.5, 0.6, 0.6, 6.5], 'och_arrow'),
    ] },
  });

  // ---------------------------------------------------------------- skins
  const SKIN = [0xb8865e, 0xc8966e, 0xd2a27a];
  const INDIGO = [0x1c2440, 0x222c4c, 0x283458, 0x2e3a62];
  const LACQ = [0x1c1c20, 0x242428, 0x2c2c32, 0x34343a];
  const IRON = [0x3a3c42, 0x484a52, 0x565962];
  const RED = [0x8a1a14, 0x9e2018, 0xb0261c, 0xc02c20];
  const GOLD = [0xc8901c, 0xe0aa2a, 0xf4c840];
  const NIN = [0x14161e, 0x1a1c26, 0x20222e, 0x262a36];
  const PALE = [0x8e9c9c, 0x9aa8a8, 0xa6b4b2];
  const RAGS = [0x2a2826, 0x34302c, 0x3e3934];
  const face = (p, o = {}) => {
    noiseFill(p, SKIN, 0.35);
    if (p.face === 'pz') art(p, ['', '', '', '.kk..kk.', '.kW..Wk.', '...dd...', o.beard ? '.bbbbbb.' : '..dddd..', o.beard ? '..b..b..' : ''],
      { k: 0x141010, W: 0xf0ece0, d: 0x8a5a40, b: 0x1a1412 });
    if (p.face === 'py' || p.face === 'nz') noiseFill(p, [0x141212, 0x1c1818], 0.3, 7);
    if (p.face === 'px' || p.face === 'nx') for (let y = 0; y < 3; y++) for (let x = 0; x < p.w; x++) p.set(x, y, 0x161212);
  };
  // lamellar plates: rows of lacquered scales bound with coloured lacing
  const lamellar = (p, plates, lace, rows = 3) => {
    noiseFill(p, plates, 0.3, 3);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (y % rows === rows - 1) p.set(x, y, pal(lace, MC.hash2(x, y, 5)), [0.2, 0.04]);
      else if ((x + (Math.floor(y / rows) & 1)) % 2 === 0 && y % rows === 0) p.set(x, y, plates[plates.length - 1], [0.6, 0.1]);
    }
  };
  Object.assign(SKINS, {
    // --- ashigaru
    ash_head(p) { face(p); },
    ash_body(p) { noiseFill(p, INDIGO, 0.35); if (p.face === 'pz') for (let y = 0; y < 3; y++) { p.set(3, y, SKIN[1]); p.set(4, y, SKIN[0]); } },
    ash_arm(p) {
      noiseFill(p, INDIGO, 0.35, 2);
      if (side(p)) for (let y = p.h - 5; y < p.h - 1; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(LACQ, MC.hash2(x, y, 3)));
      if (p.face === 'ny') noiseFill(p, SKIN);
    },
    ash_leg(p) {
      noiseFill(p, INDIGO, 0.35, 4);
      if (side(p)) for (let y = 4; y < p.h - 2; y++) for (let x = 0; x < p.w; x++) if ((y + x) % 3 === 0) p.set(x, y, 0xd8d0c0);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x2a2018); p.set(x, p.h - 2, 0xb8a888); }
    },
    ash_kasa(p) {
      noiseFill(p, LACQ, 0.3, 5);
      if (p.face === 'py') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (Math.hypot(x - p.w / 2 + 0.5, y - p.h / 2 + 0.5) < 2.2) p.set(x, y, 0xc8201a);
    },
    ash_kasa2(p) { noiseFill(p, LACQ, 0.3, 6); if (p.face === 'py') p.set(3, 3, GOLD[2]); },
    ash_do(p) {
      noiseFill(p, LACQ, 0.25, 2);
      for (let y = 1; y < p.h; y += 3) for (let x = 0; x < p.w; x++) p.set(x, y, 0x4a4a52, [0.6, 0.2]);
      if (p.face === 'pz') for (let y = 3; y < 7; y++) for (let x = 3; x < 6; x++) if (Math.hypot(x - 4, y - 4.5) < 1.6) p.set(x, y, 0xc8201a);
    },
    ash_kusa(p) { lamellar(p, LACQ, INDIGO, 2); },
    ash_pole(p) { noiseFill(p, [0x2a2018, 0x33281e], 0.3); },
    ash_flag(p) {
      noiseFill(p, [0xe8e8e8, 0xf4f4f4, 0xffffff], 0.3);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 2; y < 6; y++) for (let x = 1; x < 4; x++) if (Math.hypot(x - 2, y - 3.5) < 1.5) p.set(x, y, 0x202020);
        for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x303030);
      }
    },
    // --- samurai (dark blue lacing, black plates) and hatamoto (red armour, gold)
    ...(() => {
      const mk = (pre, plates, lace, trim, o = {}) => ({
        [pre + '_head'](p) {
          face(p, { beard: true });
          if (o.mask && p.face === 'pz') art(p, ['', '', '', '', '', 'mmmmmmmm', 'mWmWmWmm', 'mmmmmmmm'], { m: 0x1e1a18, W: 0xe8e4d8 });
        },
        [pre + '_body'](p) { noiseFill(p, INDIGO, 0.35, 1); },
        [pre + '_arm'](p) {
          noiseFill(p, plates, 0.3, 2);
          if (side(p)) for (let y = 0; y < p.h; y += 2) for (let x = 0; x < p.w; x++) if ((x + y) % 4 === 0) p.set(x, y, pal(lace, MC.hash2(x, y, 1)));
          if (p.face === 'ny') noiseFill(p, SKIN);
        },
        [pre + '_leg'](p) {
          noiseFill(p, INDIGO, 0.35, 4);
          if (side(p)) for (let y = 3; y < p.h - 2; y++) for (let x = 0; x < p.w; x++) if (y % 2 === 0) p.set(x, y, pal(plates, MC.hash2(x, y, 2)), [0.5, 0.1]);
          if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x1a1410); p.set(x, p.h - 2, 0x4a3a2a); }
        },
        [pre + '_kabuto'](p) {
          noiseFill(p, plates, 0.25, 5);
          for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (x % 2 === 0) p.set(x, y, plates[plates.length - 1], [0.7, 0.2]);
          if (p.face === 'pz') for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, trim); p.set(x, p.h - 2, 0x141414); }
          if (p.face === 'pz') p.set(4, 1, GOLD[2], [0.85, 0.8]);
        },
        [pre + '_shikoro'](p) { lamellar(p, plates, lace, 2); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, trim, [0.8, 0.8]); },
        [pre + '_kuwa'](p) {
          p.clear();
          if (p.face !== 'pz' && p.face !== 'nz') { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, GOLD[1], [0.85, 0.8]); return; }
          // V-shaped golden crest
          for (let y = 0; y < p.h; y++) {
            const k = Math.round(y * 0.55);
            for (const x of [k, k + 1, p.w - 1 - k, p.w - 2 - k]) p.set(x, y, pal(GOLD, MC.hash2(x, y, 9)), [0.9, 0.85, 0, o.glow || 0]);
          }
          p.set(3, p.h - 1, o.gem || 0xc8201a); p.set(4, p.h - 1, o.gem || 0xc8201a);
        },
        [pre + '_sode'](p) { lamellar(p, plates, lace, 2); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, trim, [0.8, 0.8]); },
        [pre + '_do'](p) {
          lamellar(p, plates, lace, 3);
          if (p.face === 'pz') {
            for (let x = 0; x < p.w; x++) p.set(x, 0, trim, [0.8, 0.8]);
            for (let y = 3; y < 7; y++) for (let x = 3; x < 6; x++) if (Math.hypot(x - 4, y - 4.5) < 1.6) p.set(x, y, o.mon || GOLD[2], [0.85, 0.8]);
          }
        },
        [pre + '_kusa'](p) { lamellar(p, plates, lace, 2); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, trim, [0.8, 0.8]); },
      });
      return {
        ...mk('sam', LACQ, [0x22306a, 0x2a3a7a, 0x32468a], 0xb08a3a),
        ...mk('hat', RED, [0x1a1a1a, 0x242424, 0xd8b048], 0xe0b040, { mask: true, glow: 0.3, gem: 0xf0e8d0, mon: 0x141414 }),
      };
    })(),
    sam_saya(p) { noiseFill(p, [0x141414, 0x1e1e1e], 0.3); if (side(p)) { p.set(0, 0, 0xc8a040); p.set(p.w - 1, 0, 0xe8e4d8); } },
    hat_horo(p) {
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, (y + x) % 5 === 0 ? 0xdcdcdc : 0xf4f4f4, [0.1, 0.03, 0.4]);
    },
    // --- ninja
    nin_head(p) { noiseFill(p, SKIN, 0.35); },
    nin_hood(p) {
      noiseFill(p, NIN, 0.3);
      if (p.face === 'pz') {
        for (let x = 1; x < p.w - 1; x++) { p.clear1(x, 4); }
        for (let x = 1; x < p.w - 1; x++) p.set(x, 3, 0x2e3240);
      }
    },
    nin_knot(p) { noiseFill(p, NIN, 0.3, 2); },
    nin_body(p) {
      noiseFill(p, NIN, 0.3, 1);
      if (p.face === 'pz') for (let y = 0; y < 6; y++) { p.set(3 - (y >> 2), y, 0x30344a); p.set(4 + (y >> 2), y, 0x30344a); }
    },
    nin_arm(p) {
      noiseFill(p, NIN, 0.3, 2);
      if (side(p)) for (let y = p.h - 4; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + y) % 2 === 0) p.set(x, y, 0x3a3e4c);
      if (p.face === 'ny') noiseFill(p, [0x101218, 0x181a22]);
    },
    nin_leg(p) {
      noiseFill(p, NIN, 0.3, 3);
      if (side(p)) for (let y = p.h - 6; y < p.h - 1; y++) for (let x = 0; x < p.w; x++) if ((x + y) % 2 === 0) p.set(x, y, 0x3a3e4c);
      if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x0c0d10);
    },
    nin_saya(p) { noiseFill(p, [0x0e0e10, 0x18181c], 0.3); if (p.face === 'py') p.set(0, 0, 0x5a5e68); },
    nin_belt(p) { noiseFill(p, [0x4a1a1a, 0x5a2020], 0.3); },
    // --- ochimusha
    och_head(p) {
      noiseFill(p, PALE, 0.35);
      if (p.face === 'pz') art(p, ['', '', '', '.kk..kk.', '.kG..Gk.', '...dd...', '..k..k..', '..kkkk..'], { k: 0x101414, G: GLOW(0x9ff0ff), d: 0x5a6868 });
      if (p.face === 'py') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (Math.abs(x - 3.5) > 2.2 || y > 5) p.set(x, y, 0x121212);
    },
    och_hair(p) {
      noiseFill(p, [0x0e0e0e, 0x161616, 0x1e1e1e], 0.4);
      if (p.face === 'pz') for (let y = 0; y < p.h; y++) for (let x = 2; x < p.w - 2; x++) p.clear1(x, y);
      if (p.face === 'px' || p.face === 'nx') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (MC.hash2(x, y, 3) < 0.25) p.clear1(x, y);
      if (p.face === 'ny' || p.face === 'py') p.clear();
    },
    och_body(p) { noiseFill(p, RAGS, 0.4, 1); },
    och_arm(p) { noiseFill(p, PALE, 0.35, 2); if (p.face !== 'ny') for (let y = 0; y < 5; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(RAGS, MC.hash2(x, y, 4))); },
    och_leg(p) { noiseFill(p, RAGS, 0.4, 3); if (side(p)) for (let x = 0; x < p.w; x++) if (MC.hash2(x, p.fi, 5) < 0.5) p.set(x, p.h - 1, PALE[0]); },
    och_do(p) {
      lamellar(p, IRON, [0x4a1a14, 0x5a2018, 0x3a1410], 3);
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (MC.hash3(x, y, p.fi, 7) < 0.12) p.clear1(x, y);
    },
    och_kusa(p) {
      lamellar(p, IRON, [0x4a1a14, 0x5a2018], 2);
      for (let x = 0; x < p.w; x++) if (MC.hash2(x, p.fi, 9) < 0.4) for (let y = p.h - 2; y < p.h; y++) p.clear1(x, y);
    },
    och_sode(p) { lamellar(p, IRON, [0x4a1a14, 0x5a2018], 2); },
    och_arrow(p) {
      noiseFill(p, [0x6a4a2a, 0x7a5a34], 0.3);
      if (p.face === 'px' || p.face === 'nx' || p.face === 'py' || p.face === 'ny') for (let x = 0; x < 2; x++) for (let y = 0; y < p.h; y++) p.set(x, y, 0xe8e4dc);
    },
  });
};
