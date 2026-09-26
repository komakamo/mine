'use strict';
// Box models and painted skins of the kingdom's people: swordsmen, archers, mounted knights (rider and
// barded horse in one model), farmers, blacksmiths, master builders, merchants, priests and townsfolk.
// Parts tagged tint: 'robe' are multiplied by the entity's colour — the kingdom's colour for tabards,
// shields, plumes and caparisons, a personal colour for the townsfolk's clothes. models.js calls
// MC.kingdomModels() before it packs every skin into texture tiles.
MC.kingdomModels = function (kit, MODELS, SKINS) {
  const { P, noiseFill, art, pal } = kit;
  const T = { tint: 'robe' };

  // ---------------------------------------------------------------- models
  // human with separate arm / body skins; o.bodyTint / o.armTint colour the clothes
  const human = (pre, o = {}) => [
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], o.head || pre + '_head'),
    P('body', [0, 24, 0], [-4, -12, -2, 8, 12, 4], pre + '_body', o.bodyTint ? T : {}),
    P('rarm', [-6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm', o.armTint ? T : {}),
    P('larm', [6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm', o.armTint ? T : {}),
    ...(o.noLegs ? [] : [
      P('rleg', [-2, 12, 0], [-2, -12, -2, 4, 12, 4], pre + '_leg'),
      P('lleg', [2, 12, 0], [-2, -12, -2, 4, 12, 4], pre + '_leg'),
    ]),
  ];
  // long robe (merchant, priest): 16 px body, short legs
  const robed = (pre, o = {}) => [
    P('head', [0, 24, 0], [-4, 0, -4, 8, 8, 8], pre + '_head'),
    P('body', [0, 24, 0], [-4, -16, -3, 8, 16, 6], pre + '_robe', o.tint ? T : {}),
    P('rarm', [-6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    P('larm', [6, 22, 0], [-2, -10, -2, 4, 12, 4], pre + '_arm'),
    P('rleg', [-2, 8, 0], [-2, -8, -2, 4, 8, 4], pre + '_leg'),
    P('lleg', [2, 8, 0], [-2, -8, -2, 4, 8, 4], pre + '_leg'),
  ];
  const shield = (px, py, pz) => P('shield', [px, py, pz], [2, -10, -3.5, 1.2, 9, 7], 'k_shield', { parent: 'larm', tint: 'robe' });
  const tabard = (py, pz = 0) => P('tabard', [0, py, pz], [-4.3, -11, -2.3, 8.6, 11, 4.6], 'k_tabard', T);
  const hair = (skin) => P('hair', [0, 24, 0], [-4.5, -4, -4.6, 9, 12, 3], skin, { parent: 'head' });

  Object.assign(MODELS, {
    k_swordsman: { anim: 'biped', parts: [
      ...human('ksw'),
      P('helm', [0, 24, 0], [-4.5, 5, -4.5, 9, 4, 9], 'ksw_helm', { parent: 'head' }),
      P('brim', [0, 24, 0], [-5.5, 5, -5.5, 11, 1, 11], 'ksw_brim', { parent: 'head' }),
      tabard(24), shield(6, 22, 0),
    ] },
    k_archer: { anim: 'skeleton', parts: [
      ...human('kar'),
      P('hood', [0, 24, 0], [-4.5, -0.5, -4.5, 9, 9.5, 9], 'kar_hood', { parent: 'head' }),
      P('vest', [0, 24, 0], [-4.3, -11.5, -2.3, 8.6, 10, 4.6], 'kar_vest', T),
      P('quiver', [0, 24, 0], [0.5, -11, -4.2, 3, 11, 2], 'kar_quiver'),
    ] },
    k_knight: { anim: 'horse', parts: [
      // horse
      ...[[-3, 8], [3, 8], [-3, -8], [3, -8]].map((p, i) => P('hleg' + i, [p[0], 11, p[1]], [-1.75, -11, -1.75, 3.5, 11, 3.5], 'kh_leg')),
      P('cloth1', [0, 11, 0], [-5.5, -2.5, 0, 11, 13, 11.5], 'kh_cloth1', T),
      P('cloth2', [0, 11, 0], [-5.5, -2.5, -11.5, 11, 13, 11.5], 'kh_cloth2', T),
      P('hneck', [0, 19, 9], [-2, -1, -2, 4, 12, 5], 'kh_neck'),
      P('hhead', [0, 19, 9], [-2.5, 8.5, -1, 5, 5, 10], 'kh_head', { parent: 'hneck' }),
      P('hmane', [0, 19, 9], [-0.75, 1, -3.2, 1.5, 12.5, 1.5], 'kh_mane', { parent: 'hneck' }),
      P('hearl', [0, 19, 9], [-2, 13.5, -0.5, 1, 2, 1], 'kh_ear', { parent: 'hneck' }),
      P('hearr', [0, 19, 9], [1, 13.5, -0.5, 1, 2, 1], 'kh_ear', { parent: 'hneck' }),
      P('htail', [0, 20, -11.6], [-1, -10, -2, 2, 10, 2], 'kh_tail'),
      // rider
      P('body', [0, 34, -1], [-4, -12, -2, 8, 12, 4], 'kn_body'),
      tabard(34, -1),
      P('head', [0, 34, -1], [-4, 0, -4, 8, 8, 8], 'kn_head'),
      P('plume', [0, 34, -1], [-1, 8, -3, 2, 3, 7], 'kn_plume', { parent: 'head', tint: 'robe' }),
      P('rarm', [-6, 32, -1], [-2, -10, -2, 4, 12, 4], 'kn_arm'),
      P('larm', [6, 32, -1], [-2, -10, -2, 4, 12, 4], 'kn_arm'),
      shield(6, 32, -1),
      P('rleg', [-6, 23, 0], [-2, -11, -2, 4, 11, 4], 'kn_leg'),
      P('lleg', [6, 23, 0], [-2, -11, -2, 4, 11, 4], 'kn_leg'),
    ] },
    k_farmer: { anim: 'biped', parts: [
      ...human('kfa', { bodyTint: true }),
      P('brim', [0, 24, 0], [-6, 6.5, -6, 12, 1, 12], 'kfa_brim', { parent: 'head' }),
      P('crown', [0, 24, 0], [-4, 7, -4, 8, 3, 8], 'kfa_crown', { parent: 'head' }),
    ] },
    k_smith: { anim: 'biped', parts: [
      ...human('ksm'),
      P('apron', [0, 24, 0], [-4.3, -12.5, -2.3, 8.6, 11.5, 4.6], 'ksm_apron'),
    ] },
    k_builder: { anim: 'biped', parts: [
      ...human('kbu'),
      P('cap', [0, 24, 0], [-4.5, 6, -4.5, 9, 2.5, 9], 'kbu_cap', { parent: 'head' }),
      P('visor', [0, 24, 0], [-3, 6, 4.5, 6, 1, 3], 'kbu_visor', { parent: 'head' }),
      P('belt', [0, 24, 0], [-4.3, -11, -2.3, 8.6, 2, 4.6], 'kbu_belt'),
    ] },
    k_folk_m1: { anim: 'biped', parts: human('kfm', { head: 'kfm_head1', bodyTint: true }) },
    k_folk_m2: { anim: 'biped', parts: human('kfm', { head: 'kfm_head2', bodyTint: true }) },
    k_folk_f1: { anim: 'biped', parts: [
      ...human('kff', { head: 'kff_head1', bodyTint: true, noLegs: true }), hair('kff_hair1'),
      P('skirt', [0, 12, 0], [-4.5, -12, -3, 9, 13, 6], 'kff_skirt', T),
    ] },
    k_folk_f2: { anim: 'biped', parts: [
      ...human('kff', { head: 'kff_head2', bodyTint: true, noLegs: true }), hair('kff_hair2'),
      P('skirt', [0, 12, 0], [-4.5, -12, -3, 9, 13, 6], 'kff_skirt', T),
    ] },
    k_merchant: { anim: 'biped', parts: [
      ...robed('kme', { tint: true }),
      P('hat', [0, 24, 0], [-5, 6.5, -5, 10, 2, 10], 'kme_hat', { parent: 'head' }),
      P('feather', [0, 24, 0], [3, 8, -3, 1, 5, 1], 'kme_feather', { parent: 'head' }),
    ] },
    k_priest: { anim: 'biped', parts: [
      ...robed('kpr'),
      P('mitre', [0, 24, 0], [-3, 7.5, -2, 6, 5, 4], 'kpr_mitre', { parent: 'head' }),
    ] },
  });

  // ---------------------------------------------------------------- skins
  const side = (p) => p.face !== 'py' && p.face !== 'ny';
  const SKIN = [0xc8966e, 0xd4a27a, 0xdcac84];
  const HAIR_BROWN = [0x4a3020, 0x5a3a26, 0x6a4630];
  const HAIR_BLOND = [0xc8a050, 0xd8b460, 0xe8c878];
  const HAIR_BLACK = [0x1e1a18, 0x2a2420, 0x342c26];
  const HAIR_AUBURN = [0x7a2e16, 0x8e3a1c, 0xa04824];
  const HAIR_GREY = [0x9a9690, 0xaaa6a0, 0xbab6b0];
  const MAIL = [0x6a6e76, 0x7a7e86, 0x8a8e96, 0x9aa0a8];
  const STEEL = [0x7c828c, 0x8e95a0, 0xa3aab4, 0xb8bec8];
  const LEATHER = [0x5a3a22, 0x6a4428, 0x7a4e2e];
  const GREEN = [0x2e4a22, 0x3a5a2a, 0x46682f];
  const CLOTH = [0xcfcfcf, 0xdcdcdc, 0xe8e8e8, 0xf4f4f4];   // tinted by the entity colour
  const TROUSER = [0x4a3a2e, 0x54443a, 0x5e4e42];
  const STRAW = [0xc8a850, 0xd8b860, 0xe4c870, 0xeed888];
  const COAT = [0x6a4428, 0x7a4e2e, 0x8a5a34, 0x9a6640];

  // face on the +z side of an 8x8x8 head; hair on top / back / upper sides
  function head(p, hairPal, o = {}) {
    noiseFill(p, SKIN, 0.35);
    const HR = (x, y) => p.set(x, y, pal(hairPal, MC.hash2(x, y + p.fi * 7, 3)));
    if (p.face === 'ny') return;
    if (p.face === 'py' || p.face === 'nz') { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.face === 'py' || y < (o.long ? 8 : 5)) HR(x, y); return; }
    if (p.face === 'pz') {
      for (let x = 0; x < 8; x++) { HR(x, 0); if (o.fringe || x === 0 || x === 7) HR(x, 1); }
      if (o.long) for (let y = 1; y < 7; y++) { HR(0, y); HR(7, y); }
      art(p, ['', '', '', '', '.Wb..bW.', '', '...nn...', '..mmmm..'], { W: 0xf2f2f2, b: o.eye || 0x3a5a8a, n: 0xb07e5e, m: o.lips || 0x8a4a3a });
      if (o.beard) art(p, ['', '', '', '', '', 'B......B', 'BB.nn.BB', 'BBmmmmBB'], { B: o.beard, n: 0xb07e5e, m: 0x6a3a2a });
      return;
    }
    for (let y = 0; y < (o.long ? 8 : 3); y++) for (let x = 0; x < p.w; x++) HR(x, y);
    for (let x = 0; x < 3; x++) HR(p.face === 'px' ? x : 7 - x, 3);
    if (!o.long) p.set(p.face === 'px' ? 3 : 4, 4, 0xb07e5e);
  }
  // mail texture: small interlocking rings
  const mail = (p, seed = 0) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const ring = ((x + (y & 1)) & 1) === 0;
      p.set(x, y, pal(MAIL, (ring ? 0.7 : 0.15) + MC.hash3(x, y, p.fi + seed, 5) * 0.28), [0.55, 0.45]);
    }
  };
  const armSkin = (p, sleeve, cuff) => {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const skin = p.face === 'ny' || (p.face !== 'py' && y >= (cuff === undefined ? 8 : cuff));
      p.set(x, y, skin ? pal(SKIN, MC.hash2(x, y, 2)) : pal(sleeve, MC.hash3(x, y, p.fi, 4)));
    }
  };
  const legSkin = (p, P2, boot = 0x2e2218) => {
    noiseFill(p, P2, 0.3, 4);
    if (side(p)) for (let y = p.h - 3; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y === p.h - 3 ? 0x4a3424 : boot);
    if (p.face === 'ny') noiseFill(p, [boot, 0x241a12]);
  };

  Object.assign(SKINS, {
    // --- shared: tabard (kingdom colour), heater shield
    k_tabard(p) {
      if (p.face === 'px' || p.face === 'nx' || p.face === 'ny') { p.clear(); return; }
      noiseFill(p, CLOTH, 0.25);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 0; y < p.h; y++) { p.set(0, y, 0xa8a8a8); p.set(p.w - 1, y, 0xa8a8a8); }
        for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x9a9a9a);
        // lion / cross emblem in light cloth
        if (p.face === 'pz') for (const [x, y] of [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [3, 3], [5, 3], [2, 4], [6, 4], [3, 7], [5, 7]]) p.set(x, y, 0xffffff, [0.4, 0.1]);
        for (let x = 1; x < p.w - 1; x++) p.set(x, 8, 0x5a4a3a);
      }
    },
    k_shield(p) {
      noiseFill(p, CLOTH, 0.2);
      const w = p.w, h = p.h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = Math.abs(x - (w - 1) / 2);
        if (y > h - 4 && cx > (h - 1 - y) * 1.3 + 0.5) { p.clear1(x, y); continue; }   // pointed heater shape
        if (x === 0 || x === w - 1 || y === 0) p.set(x, y, 0x8a8e96, [0.6, 0.5]);
      }
      if (p.face === 'px' || p.face === 'nx') for (let y = 2; y < h - 2; y++) p.set(Math.floor(w / 2), y, 0xffffff);
    },
    // --- swordsman
    ksw_head(p) { head(p, MAIL, { eye: 0x2a3a5a, beard: MC.hash2(p.seed, 3, 1) < 0.5 ? 0x5a3a26 : null }); if (p.face === 'pz') for (let x = 0; x < 8; x++) p.set(x, 2, pal(MAIL, MC.hash2(x, 2, 9))); },
    ksw_helm(p) {
      noiseFill(p, STEEL, 0.3);
      if (p.face === 'ny') { for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y); }
      if (p.face === 'py') for (let x = 0; x < p.w; x++) p.set(x, 4, 0xd0d6de, [0.8, 0.6]);
    },
    ksw_brim(p) { noiseFill(p, STEEL, 0.25, 3); if (p.face === 'py' || p.face === 'ny') for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y); },
    ksw_body(p) { mail(p); },
    ksw_arm(p) { mail(p, 3); if (p.face !== 'py') for (let y = p.h - 3; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, pal(LEATHER, MC.hash2(x, y, 3))); },
    ksw_leg(p) { noiseFill(p, STEEL, 0.3, 5); if (side(p)) { for (let x = 0; x < p.w; x++) { p.set(x, 5, 0xc8ced8, [0.8, 0.6]); p.set(x, 0, 0x3a3e46); } } legSkin(p, STEEL.slice(0, 3)); },
    // --- archer
    kar_head(p) { head(p, HAIR_BROWN, { fringe: true, eye: 0x3a6a2a }); },
    kar_hood(p) {
      noiseFill(p, GREEN, 0.35);
      if (p.face === 'pz') for (let y = 2; y < p.h; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y);
      if (p.face === 'ny') for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y);
    },
    kar_body(p) { noiseFill(p, LEATHER, 0.35); if (p.face === 'pz') for (let y = 0; y < p.h; y++) p.set(((y >> 1) + 1) % p.w, y, 0x3a2414); },
    kar_vest(p) {
      if (p.face === 'px' || p.face === 'nx' || p.face === 'ny') { p.clear(); return; }
      noiseFill(p, CLOTH, 0.25);
      if (p.face === 'pz') { for (let y = 0; y < p.h; y++) { p.clear1(3, y); p.clear1(4, y); } for (let x = 0; x < p.w; x++) p.set(x, 6, 0x4a3020); }
    },
    kar_arm(p) { armSkin(p, GREEN, 9); },
    kar_leg(p) { legSkin(p, [0x3a3a2a, 0x44443a, 0x4e4e44], 0x3a2616); },
    kar_quiver(p) {
      noiseFill(p, LEATHER, 0.3, 2);
      if (p.face === 'py') for (let x = 0; x < p.w; x++) p.set(x, (x & 1), x % 2 ? 0xe8e8e8 : 0xc84030);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 2, 0x3a2414); p.set(x, p.h - 3, 0x3a2414); }
    },
    // --- mounted knight: horse
    kh_leg(p) {
      noiseFill(p, COAT, 0.35, 3);
      if (side(p)) for (let y = p.h - 3; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y === p.h - 1 ? 0x2a2420 : 0xe8e0d0);
      if (p.face === 'ny') noiseFill(p, [0x2a2420, 0x34302a]);
    },
    kh_cloth1(p) { SKINS._caparison(p, true); },
    kh_cloth2(p) { SKINS._caparison(p, false); },
    _caparison(p, front) {
      noiseFill(p, CLOTH, 0.25, front ? 1 : 2);
      if (p.face === 'ny') { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.clear1(x, y); return; }
      if (side(p)) {
        // scalloped hem, gold trim, chequered pattern
        for (let x = 0; x < p.w; x++) {
          if (x % 3 === 1) p.clear1(x, p.h - 1);
          p.set(x, p.h - 3, 0xf2e0a0, [0.6, 0.5]);
          if (!(x % 3 === 1)) p.set(x, p.h - 1, 0xe8e8e8);
        }
        for (let y = 3; y < p.h - 4; y++) for (let x = 0; x < p.w; x++) if (((x >> 2) + (y >> 2)) % 2 === 0) p.set(x, y, 0xffffff);
        if ((p.face === 'pz' && front) || (p.face === 'nz' && !front)) for (let y = 0; y < 4; y++) for (let x = 3; x < p.w - 3; x++) p.set(x, y, pal(COAT, MC.hash2(x, y, 7)));
      }
      if (p.face === 'py') { for (let y = 0; y < p.h; y++) for (let x = 2; x < p.w - 2; x++) if (front ? y < 5 : y > p.h - 5) p.set(x, y, pal(LEATHER, MC.hash2(x, y, 8))); }
    },
    kh_neck(p) { noiseFill(p, COAT, 0.35, 4); if (p.face === 'pz') for (let y = 0; y < 5; y++) for (let x = 0; x < p.w; x++) p.set(x, y, 0xe8e8e8); },
    kh_head(p) {
      noiseFill(p, COAT, 0.35, 5);
      if (p.face === 'pz') for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x2a2420); p.set(x, p.h - 2, 0x3a302a); }
      if (p.face === 'px' || p.face === 'nx') { const ex = p.face === 'px' ? p.w - 7 : 6; p.set(ex, 1, 0x101010); p.set(ex, 2, 0x2a2420); for (let x = 0; x < p.w; x++) p.set(x, 3, x > p.w - 5 || x < 4 ? 0x3a2414 : pal(COAT, 0.5)); }
      if (p.face === 'py') for (let y = 0; y < p.h; y++) p.set(2, y, 0xe8e8e8);
    },
    kh_mane(p) { noiseFill(p, [0x1e1612, 0x2a201a, 0x34281e], 0.4, 6); },
    kh_ear(p) { noiseFill(p, COAT, 0.2, 7); },
    kh_tail(p) { noiseFill(p, [0x1e1612, 0x2a201a, 0x34281e], 0.4, 8); },
    // --- mounted knight: rider (steel plate)
    kn_body(p) { noiseFill(p, STEEL, 0.3, 2); if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 0, 0xd0d6de, [0.8, 0.6]); p.set(x, 8, 0x3a2614); } },
    kn_head(p) {
      noiseFill(p, STEEL, 0.3);
      if (p.face === 'pz') {
        for (let x = 1; x < 7; x++) p.set(x, 3, 0x14161a);
        for (const [x, y] of [[3, 5], [4, 5], [2, 6], [5, 6], [3, 6], [4, 6]]) p.set(x, y, 0x2a2e36);
        for (let y = 0; y < 8; y++) if (y !== 3) p.set(3, y, 0xd8dee6, [0.85, 0.6]);
      }
      if (p.face === 'py') for (let x = 0; x < p.w; x++) p.set(x, 3, 0xd8dee6, [0.85, 0.6]);
    },
    kn_plume(p) { noiseFill(p, CLOTH, 0.3, 4); },
    kn_arm(p) { noiseFill(p, STEEL, 0.3, 3); if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 4, 0xd0d6de, [0.8, 0.6]); p.set(x, p.h - 2, 0x3a2614); p.set(x, p.h - 1, 0x2a1a0e); } },
    kn_leg(p) { noiseFill(p, STEEL, 0.3, 5); if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 4, 0xd0d6de, [0.8, 0.6]); p.set(x, p.h - 1, 0x2a2a2e); } },
    // --- farmer
    kfa_head(p) { head(p, HAIR_BROWN, { beard: 0x6a4630, eye: 0x3a2a1a }); },
    kfa_body(p) {
      noiseFill(p, CLOTH, 0.3);
      if (p.face === 'pz' || p.face === 'nz') for (let y = 0; y < p.h; y++) { p.set(2, y, 0x6a5a48); p.set(5, y, 0x6a5a48); }
      if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 3, 0x4a3424);
    },
    kfa_arm(p) { armSkin(p, [0xd8d0c0, 0xe4dccc], 6); },
    kfa_leg(p) { legSkin(p, [0x5a6a8a, 0x64748e, 0x6e7e98], 0x4a3020); },
    kfa_brim(p) { noiseFill(p, STRAW, 0.4); for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + y) % 3 === 0) p.set(x, y, STRAW[0]); },
    kfa_crown(p) { noiseFill(p, STRAW, 0.4, 2); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0x8a3a2a); },
    // --- blacksmith
    ksm_head(p) {
      head(p, HAIR_BLACK, { beard: 0x2a2018, eye: 0x2a1a10 });
      if (p.face === 'py') noiseFill(p, SKIN, 0.3, 9);
      if (p.face === 'pz') for (let x = 0; x < 8; x++) { p.set(x, 0, pal(SKIN, 0.4)); p.set(x, 1, pal(SKIN, 0.6)); }
    },
    ksm_body(p) { noiseFill(p, [0x9a948a, 0xa8a298, 0xb4aea4], 0.3); },
    ksm_arm(p) { armSkin(p, [0x9a948a, 0xa8a298], 4); },
    ksm_leg(p) { legSkin(p, [0x2e2a28, 0x383430, 0x423c38], 0x1e1612); },
    ksm_apron(p) {
      if (p.face !== 'pz' && p.face !== 'py') { p.clear(); return; }
      noiseFill(p, [0x3a2616, 0x44301e, 0x4e3824], 0.35);
      if (p.face === 'py') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (x !== 1 && x !== p.w - 2) p.clear1(x, y);
      if (p.face === 'pz') { for (let x = 1; x < p.w - 1; x++) p.set(x, 4, 0x2a1a0e); p.set(2, 6, 0x8a8e96, [0.7, 0.6]); p.set(5, 7, 0x8a8e96, [0.7, 0.6]); }
    },
    // --- master builder
    kbu_head(p) { head(p, HAIR_AUBURN, { eye: 0x3a5a2a, beard: 0x7a2e16 }); },
    kbu_body(p) {
      noiseFill(p, [0xb08a58, 0xbe9864, 0xcaa470], 0.3);
      if (p.face === 'pz') for (let y = 0; y < p.h; y++) { p.set(3, y, 0x8a6a40); }
    },
    kbu_arm(p) { armSkin(p, [0xe0d8c8, 0xece4d4], 7); },
    kbu_leg(p) { legSkin(p, [0x4a3e30, 0x544638, 0x5e5040], 0x2a1e14); },
    kbu_cap(p) { noiseFill(p, [0x8a2a1e, 0x9a3424, 0xa83e2a], 0.3); if (p.face === 'ny') for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) p.clear1(x, y); },
    kbu_visor(p) { noiseFill(p, [0x6a2016, 0x7a2a1e], 0.3); },
    kbu_belt(p) {
      if (!side(p)) { p.clear(); return; }
      noiseFill(p, [0x3a2414, 0x44301e], 0.3);
      if (p.face === 'pz') { p.set(1, 0, 0x9aa0a8, [0.7, 0.6]); p.set(1, 1, 0x6a4a2a); p.set(6, 0, 0xc8a040, [0.7, 0.6]); p.set(6, 1, 0x9aa0a8, [0.7, 0.6]); p.set(4, 0, 0xc8a040, [0.7, 0.6]); }
    },
    // --- townsfolk (clothes tinted per person)
    kfm_head1(p) { head(p, HAIR_BROWN, { fringe: true, eye: 0x3a5a8a }); },
    kfm_head2(p) { head(p, HAIR_BLOND, { eye: 0x3a6aa8, beard: 0xb8904a }); },
    kfm_body(p) {
      noiseFill(p, CLOTH, 0.3);
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 4, 0x4a3020); p.set(x, p.h - 3, 0x5a3a26); }
      if (p.face === 'pz') { p.set(3, 0, 0xa8a8a8); p.set(4, 0, 0xa8a8a8); p.set(3, 1, 0xb8b8b8); }
    },
    kfm_arm(p) { armSkin(p, [0xd8d0c0, 0xe4dccc], 8); },
    kfm_leg(p) { legSkin(p, TROUSER, 0x2e2218); },
    kff_head1(p) { head(p, HAIR_AUBURN, { long: true, fringe: true, eye: 0x3a6a3a, lips: 0xb04a4a }); },
    kff_head2(p) { head(p, HAIR_BLOND, { long: true, fringe: true, eye: 0x3a6aa8, lips: 0xb04a4a }); },
    kff_hair1(p) { noiseFill(p, HAIR_AUBURN, 0.4, 2); if (p.face === 'pz') p.clear(); },
    kff_hair2(p) { noiseFill(p, HAIR_BLOND, 0.4, 2); if (p.face === 'pz') p.clear(); },
    kff_body(p) {
      noiseFill(p, CLOTH, 0.3);
      if (p.face === 'pz') { for (let x = 2; x < 6; x++) p.set(x, 0, pal(SKIN, 0.5)); for (let y = 3; y < 8; y++) { p.set(3, y, 0x9a9a9a); p.set(4, y, 0x9a9a9a); } }
    },
    kff_arm(p) { armSkin(p, [0xf0ece4, 0xfaf6ee], 9); },
    kff_skirt(p) {
      noiseFill(p, CLOTH, 0.3, 3);
      if (p.face === 'ny') { p.clear(); return; }
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, p.h - 1, 0x9a9a9a); if (x % 3 === 0) for (let y = 2; y < p.h - 1; y++) p.set(x, y, 0xb4b4b4); }
    },
    // --- merchant
    kme_head(p) { head(p, HAIR_BLACK, { beard: 0x2a2420, eye: 0x4a3a1a }); },
    kme_robe(p) {
      noiseFill(p, CLOTH, 0.3);
      if (p.face === 'pz') { for (let y = 0; y < p.h; y++) { p.set(3, y, 0xf2e0a0, [0.6, 0.5]); } for (const y of [3, 6, 9]) p.set(4, y, 0xf2e0a0, [0.7, 0.6]); }
      if (side(p)) for (let x = 0; x < p.w; x++) { p.set(x, 7, 0x3a2414); p.set(x, p.h - 1, 0xf2e0a0, [0.6, 0.5]); }
    },
    kme_arm(p) { armSkin(p, [0x3a2a4a, 0x4a3a5a], 9); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, 8, 0xe8c040, [0.7, 0.6]); },
    kme_leg(p) { legSkin(p, [0x2a2a3a, 0x343444], 0x1e1612); },
    kme_hat(p) { noiseFill(p, [0x3a1a4a, 0x4a2258, 0x542a64], 0.3); if (p.face === 'ny') for (let y = 2; y < p.h - 2; y++) for (let x = 2; x < p.w - 2; x++) p.clear1(x, y); if (side(p)) for (let x = 0; x < p.w; x++) p.set(x, 1, 0xe8c040, [0.7, 0.6]); },
    kme_feather(p) { noiseFill(p, [0xe84030, 0xf05a40], 0.3); },
    // --- priest
    kpr_head(p) { head(p, HAIR_GREY, { beard: 0xc8c4bc, eye: 0x4a5a6a }); },
    kpr_mitre(p) {
      noiseFill(p, [0xf2eee4, 0xfaf6ee], 0.2);
      if (p.face === 'pz' || p.face === 'nz') { for (let y = 0; y < p.h; y++) p.set(Math.floor(p.w / 2), y, 0xe8c040, [0.8, 0.7]); for (let x = 0; x < p.w; x++) p.set(x, p.h - 1, 0xe8c040, [0.8, 0.7]); p.clear1(0, 0); p.clear1(p.w - 1, 0); }
    },
    kpr_robe(p) {
      noiseFill(p, [0xeae6dc, 0xf2eee4, 0xfaf6ee], 0.3);
      if (p.face === 'pz' || p.face === 'nz') {
        for (let y = 0; y < p.h; y++) { p.set(2, y, 0xc8a040, [0.7, 0.6]); p.set(5, y, 0xc8a040, [0.7, 0.6]); }
        if (p.face === 'pz') { for (let y = 4; y < 10; y++) { p.set(3, y, 0xe8c040, [0.8, 0.7]); p.set(4, y, 0xe8c040, [0.8, 0.7]); } for (let x = 2; x < 6; x++) p.set(x, 6, 0xe8c040, [0.8, 0.7]); }
      }
    },
    kpr_arm(p) { armSkin(p, [0xeae6dc, 0xf2eee4], 10); },
    kpr_leg(p) { legSkin(p, [0xeae6dc, 0xf2eee4], 0x3a2a1a); },
  });
};
