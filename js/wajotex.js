'use strict';
// Textures of the Japanese castles: fitted stone walls, dressed granite, white plaster (with loopholes),
// namako tiles, black weatherboards, clay / copper roof tiles, thatch, tatami, shoji, lattice windows, the
// golden shachihoko, lanterns, gate leaves and the banners — plus the item sprites of the samurai gear.
(function () {
  const T = MC.TexGen, H = MC.col.hex, mix = MC.col.mix, pal = MC.col.pal;
  const S = 16;
  const each = (fn) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) fn(x, y); };

  // ---------------------------------------------------------------- stone
  const STONES = [H(0x6f6d68), H(0x7a7872), H(0x86837c), H(0x928f87), H(0x9d9a91), H(0x8a8a86), H(0x7e7a70)];
  T.define('ishigaki', { normal: 1.6 }, (c) => {
    // jittered grid of stone centres -> irregular fitted stones with dark joints
    const pts = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) pts.push([(i + 0.2 + c.rand() * 0.6) * 16 / 3, (j + 0.2 + c.rand() * 0.6) * 16 / 3]);
    each((x, y) => {
      const v = c.voronoi(x + 0.5, y + 0.5, pts), b = v.d2 - v.d1;
      if (b < 0.85) {
        const moss = c.hashp(x, y, 3) < 0.12;
        c.pxc(x, y, moss ? H(0x46552e) : mix(H(0x2c2b28), H(0x3c3a36), c.hashp(x, y, 5))); c.h(x, y, 0.08); c.s(x, y, 0.05, 0.03);
        return;
      }
      const k = MC.clamp(b / 3.2, 0, 1), n = c.hashp(x, y) * 0.5 + c.fbm(x, y, 4, 2, 11) * 0.5;
      let col = mix(STONES[Math.floor(MC.hash2(v.id, 3, c.seed) * STONES.length)], H(0xb6b3aa), n * 0.28);
      col = mix(H(0x3e3d39), col, 0.55 + 0.45 * k);
      if (c.hashp(x, y, 9) < 0.05) col = mix(col, H(0x5e6a3a), 0.5);
      c.pxc(x, y, col); c.h(x, y, 0.35 + 0.55 * k + n * 0.08); c.s(x, y, 0.12 + n * 0.08, 0.04);
    });
  });
  const granite = (c, x, y, base) => {
    const n = c.hashp(x, y), f = c.fbm(x, y, 4, 2, 17);
    let col = mix(base, H(0xcfccc4), f * 0.35);
    if (n < 0.12) col = mix(col, H(0x5e5c58), 0.6); else if (n > 0.93) col = mix(col, H(0xe6e4de), 0.6);
    return col;
  };
  T.define('kirishi', { normal: 1.1 }, (c) => {
    each((x, y) => {
      const row = y >> 3, jx = row ? 7 : 15;
      const joint = y % 8 === 7 || x === jx;
      if (joint) { c.pxc(x, y, H(0x55534f)); c.h(x, y, 0.25); c.s(x, y, 0.08, 0.04); return; }
      const edge = y % 8 === 0 || x === (jx + 1) % 16;
      const col = granite(c, x, y, H(0xa9a69e));
      c.pxc(x, y, edge ? mix(col, H(0xd8d6d0), 0.25) : col); c.h(x, y, edge ? 0.9 : 0.75); c.s(x, y, 0.22, 0.04);
    });
  });
  T.define('kirishi_top', { normal: 0.9 }, (c) => {
    each((x, y) => {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const col = granite(c, x, y, H(0xaeaba3));
      c.pxc(x, y, e === 0 ? mix(col, H(0x5e5c58), 0.55) : col); c.h(x, y, e === 0 ? 0.3 : 0.75); c.s(x, y, 0.24, 0.04);
    });
  });

  // ---------------------------------------------------------------- walls
  const plaster = (c, x, y) => {
    const n = c.fbm(x, y, 4, 3, 21) * 0.6 + c.hashp(x, y) * 0.4;
    return mix(H(0xe2e0da), H(0xf6f5f1), n);
  };
  T.define('shikkui', { normal: 0.35 }, (c) => each((x, y) => { c.pxc(x, y, plaster(c, x, y)); c.h(x, y, 0.7 + c.hashp(x, y) * 0.05); c.s(x, y, 0.3, 0.04, 0.05); }));
  T.define('hazama', { normal: 0.9 }, (c) => each((x, y) => {
    // rectangular arrow loophole with a dark throat and a lighter lip
    const inHole = x >= 7 && x <= 8 && y >= 5 && y <= 10, lip = x >= 6 && x <= 9 && y >= 4 && y <= 11;
    if (inHole) { c.pxc(x, y, H(0x121212)); c.h(x, y, 0.05); c.s(x, y, 0.02, 0.03); return; }
    c.pxc(x, y, lip ? mix(plaster(c, x, y), H(0xa8a6a0), 0.5) : plaster(c, x, y)); c.h(x, y, lip ? 0.55 : 0.72); c.s(x, y, 0.3, 0.04, 0.05);
  }));
  T.define('namako', { normal: 1.2 }, (c) => each((x, y) => {
    const u = (x + y) & 7, w = (x - y + 16) & 7;
    if (u === 0 || w === 0) { c.pxc(x, y, H(0xeeece6)); c.h(x, y, 1); c.s(x, y, 0.3, 0.04); return; }
    if (u === 1 || w === 1 || u === 7 || w === 7) { c.pxc(x, y, H(0xb8b6b0)); c.h(x, y, 0.7); c.s(x, y, 0.25, 0.04); return; }
    const n = c.hashp(x, y) * 0.5 + c.fbm(x, y, 4, 2, 5) * 0.5;
    c.pxc(x, y, mix(H(0x2e3237), H(0x464b53), n)); c.h(x, y, 0.45); c.s(x, y, 0.4, 0.05);
  }));
  T.define('kuro_itabari', { normal: 1.1 }, (c) => each((x, y) => {
    const batten = x === 4 || x === 12;
    const g = c.vnoise(x * 0.25, y * 2, 16, 7) * 0.6 + c.hashp(x, y) * 0.4;
    let col = mix(H(0x1a1817), H(0x2c2826), g), h = 0.6;
    if (y % 4 === 3) { col = H(0x0c0b0b); h = 0.2; } else if (y % 4 === 0) { col = mix(col, H(0x45403c), 0.5); h = 0.8; }
    if (batten) { col = mix(H(0x2a2624), H(0x3a3532), c.hashp(x, y, 4)); h = 0.95; }
    c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.42, 0.04);
  }));
  T.define('kuro_itabari_top', { normal: 0.8 }, (c) => each((x, y) => {
    const g = c.vnoise(x * 2, y * 0.3, 8, 3) * 0.6 + c.hashp(x, y) * 0.4;
    c.pxc(x, y, x % 4 === 3 ? H(0x151312) : mix(H(0x2a2522), H(0x3c3530), g)); c.h(x, y, x % 4 === 3 ? 0.3 : 0.7); c.s(x, y, 0.3, 0.04);
  }));

  // ---------------------------------------------------------------- roofs
  // rows of round tiles: ridges every 4 px, tile ends every 8 px
  function tiles(c, P, o) {
    each((x, y) => {
      const k = x & 3, n = c.hashp(x, y) * 0.35 + c.fbm(x, y, 4, 2, 13) * 0.25;
      let col = k === 0 ? P[0] : k === 2 ? P[3] : P[k === 1 ? 1 : 2], h = k === 0 ? 0.2 : k === 2 ? 1 : 0.7;
      if ((y & 7) === 7) { col = P[0]; h = 0.3; } else if ((y & 7) === 0 && k !== 0) { col = mix(col, P[3], 0.5); h = Math.max(h, 0.9); }
      col = mix(col, P[4], n * 0.4);
      if (o.spots && c.hashp(x, y, 6) < o.spots) col = mix(col, o.spotCol, 0.55);
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, o.smooth, o.f0);
    });
  }
  T.define('kawara', { normal: 1.3 }, (c) => tiles(c, [H(0x23282e), H(0x3d444d), H(0x4a525c), H(0x68717c), H(0x7a838e)], { smooth: 0.55, f0: 0.06 }));
  T.define('dogawara', { normal: 1.2 }, (c) => tiles(c, [H(0x2a5448), H(0x468672), H(0x55977f), H(0x7cc0a6), H(0x9ad6be)], { smooth: 0.42, f0: 0.12, spots: 0.1, spotCol: H(0x3a6a5a) }));
  const STRAW = [H(0x6e5f38), H(0x85744a), H(0x9a8754), H(0xae9a60), H(0xbfa96c)];
  T.define('kaya', { normal: 1.4 }, (c) => each((x, y) => {
    const strand = c.vnoise(x * 3, y * 0.35, 16, 3) * 0.7 + c.hashp(x, y) * 0.3;
    const gap = c.hashp(x, y >> 2, 8) < 0.16;
    let col = gap ? H(0x4a3f24) : pal(STRAW, strand);
    if (y >= 14) col = mix(col, H(0x4a3f24), 0.45);
    c.pxc(x, y, col); c.h(x, y, gap ? 0.2 : 0.5 + strand * 0.45); c.s(x, y, 0.06, 0.03, 0.15);
  }));
  T.define('kaya_top', { normal: 1.3 }, (c) => each((x, y) => {
    const strand = c.vnoise(x * 0.4, y * 3, 16, 9) * 0.7 + c.hashp(x, y) * 0.3;
    c.pxc(x, y, pal(STRAW, strand)); c.h(x, y, 0.4 + strand * 0.5); c.s(x, y, 0.06, 0.03, 0.15);
  }));

  // ---------------------------------------------------------------- interior
  T.define('tatami', { normal: 0.7 }, (c) => each((x, y) => {
    if (x <= 1 || x >= 14) {
      const band = x === 1 || x === 14;
      c.pxc(x, y, band ? mix(H(0x1a2a1c), H(0x2a3a2a), c.hashp(x, y)) : H(0x121a12)); c.h(x, y, 0.55); c.s(x, y, 0.25, 0.04); return;
    }
    const weave = y & 1, n = c.hashp(x, y) * 0.4 + c.vnoise(x * 0.2, y, 16, 2) * 0.6;
    c.pxc(x, y, mix(weave ? H(0xa7ab6c) : H(0xb9b879), H(0xc9c486), n * 0.6)); c.h(x, y, weave ? 0.55 : 0.75); c.s(x, y, 0.2, 0.04, 0.1);
  }));
  T.define('tatami_side', { normal: 0.6 }, (c) => each((x, y) => {
    if (y <= 2) { c.pxc(x, y, mix(H(0x1a2a1c), H(0x2a3a2a), c.hashp(x, y))); c.h(x, y, 0.6); return; }
    const n = c.hashp(x, y) * 0.5 + c.vnoise(x, y * 0.3, 16, 5) * 0.5;
    c.pxc(x, y, mix(H(0x9a9460), H(0xb6ae72), n)); c.h(x, y, 0.5 + n * 0.3); c.s(x, y, 0.1, 0.04, 0.1);
  }));
  T.define('shoji', { cutout: true, normal: 0.8 }, (c) => each((x, y) => {
    const frame = x === 0 || x === 15 || y === 0 || y === 15;
    const lattice = x % 5 === 0 || y % 4 === 0;
    if (frame) { c.pxc(x, y, mix(H(0x5a3e24), H(0x6e4c2e), c.hashp(x, y))); c.h(x, y, 1); c.s(x, y, 0.3, 0.04); return; }
    if (lattice) { c.pxc(x, y, mix(H(0x9c7a4e), H(0xb08c5c), c.hashp(x, y))); c.h(x, y, 0.85); c.s(x, y, 0.25, 0.04); return; }
    c.pxc(x, y, mix(H(0xece6d4), H(0xf6f2e6), c.fbm(x, y, 4, 2, 3))); c.h(x, y, 0.5); c.s(x, y, 0.08, 0.04, 0.45);
  }));
  T.define('shoji_edge', { normal: 0.5 }, (c) => each((x, y) => { c.pxc(x, y, mix(H(0x5a3e24), H(0x6e4c2e), c.hashp(x, y))); c.s(x, y, 0.3, 0.04); }));
  T.define('renji', { cutout: true, normal: 0.9 }, (c) => each((x, y) => {
    const rail = y === 0 || y === 15, bar = (x & 3) === 1 || (x & 3) === 2;
    if (!rail && !bar) { c.px(x, y, 0, 0, 0, 0); return; }
    const hi = (x & 3) === 1 && !rail;
    c.pxc(x, y, hi ? H(0x4a3a2c) : mix(H(0x241a14), H(0x30241a), c.hashp(x, y))); c.h(x, y, hi ? 1 : 0.8); c.s(x, y, 0.35, 0.04);
  }));
  T.define('renji_edge', { normal: 0.5 }, (c) => each((x, y) => { c.pxc(x, y, mix(H(0x241a14), H(0x30241a), c.hashp(x, y))); c.s(x, y, 0.3, 0.04); }));
  T.define('mon_door', { normal: 1.2 }, (c) => each((x, y) => {
    const band = (y >= 3 && y <= 4) || (y >= 11 && y <= 12);
    const stud = band && (x === 3 || x === 8 || x === 13) && (y === 3 || y === 11);
    if (stud) { c.pxc(x, y, H(0xd0a848)); c.h(x, y, 1); c.s(x, y, 0.75, 0.8); return; }
    if (band) { c.pxc(x, y, mix(H(0x26262a), H(0x35353a), c.hashp(x, y))); c.h(x, y, 0.85); c.s(x, y, 0.5, 0.5); return; }
    const seam = x % 4 === 0, g = c.vnoise(x, y * 0.25, 16, 12) * 0.6 + c.hashp(x, y) * 0.4;
    c.pxc(x, y, seam ? H(0x1e140c) : mix(H(0x3a2818), H(0x4e3622), g)); c.h(x, y, seam ? 0.2 : 0.6); c.s(x, y, 0.18, 0.04);
  }));

  // ---------------------------------------------------------------- ornaments & lights
  T.define('shachi', { normal: 1.0 }, (c) => each((x, y) => {
    const n = c.hashp(x, y) * 0.5 + c.fbm(x, y, 4, 2, 4) * 0.5;
    let col = mix(H(0xc8901c), H(0xffd84a), n), h = 0.7;
    if ((x === 7 || x === 9) && y === 12) { col = H(0x101010); h = 0.3; }
    else if (y === 14 && x >= 6 && x <= 10) { col = H(0x8a5a10); h = 0.4; }
    else if ((x + y) % 3 === 0 && y < 11) { col = mix(col, H(0xa87410), 0.45); h = 0.5; }
    c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.8, 0.85);
  }));
  T.define('toro_fire', { normal: 0.9 }, (c) => each((x, y) => {
    const win = x >= 6 && x <= 9 && y >= 4 && y <= 7;
    if (win) { c.pxc(x, y, mix(H(0xffb040), H(0xffe7a0), c.hashp(x, y))); c.h(x, y, 0.2); c.s(x, y, 0.3, 0.04, 0, 1); return; }
    c.pxc(x, y, granite(c, x, y, H(0xa29f97))); c.h(x, y, 0.75); c.s(x, y, 0.2, 0.04);
  }));
  T.define('chochin', { normal: 0.7 }, (c) => each((x, y) => {
    const band = y === 3 || y === 4 || y === 12 || y === 13, rib = y % 2 === 0;
    const crest = Math.hypot(x - 7.5, y - 8) < 2.2 && Math.hypot(x - 7.5, y - 8) > 1.1;
    if (band) { c.pxc(x, y, H(0x141212)); c.h(x, y, 0.8); c.s(x, y, 0.5, 0.04, 0, 0.05); return; }
    if (crest) { c.pxc(x, y, H(0xf8f0e0)); c.h(x, y, 0.6); c.s(x, y, 0.1, 0.04, 0.4, 0.9); return; }
    c.pxc(x, y, rib ? H(0xa81812) : H(0xe03022)); c.h(x, y, rib ? 0.4 : 0.7); c.s(x, y, 0.1, 0.04, 0.5, rib ? 0.45 : 0.85);
  }));
  T.define('chochin_cap', { normal: 0.6 }, (c) => each((x, y) => { c.pxc(x, y, mix(H(0x121010), H(0x221c18), c.hashp(x, y))); c.s(x, y, 0.6, 0.05); }));
  T.define('hata_pole', { normal: 0.6 }, (c) => each((x, y) => {
    const n = c.vnoise(x, y * 0.2, 16, 1);
    c.pxc(x, y, x % 4 === 0 ? mix(H(0x3a3230), H(0x4a403c), n) : mix(H(0x141110), H(0x241e1c), n)); c.s(x, y, 0.55, 0.05);
  }));
  // standard: white field, black band at the top, the lord's crest (丸に二つ引) above the character 大
  const CLOTH = (c, x, y) => mix(H(0xeeebe2), H(0xfaf8f2), c.fbm(x, y, 4, 2, 2));
  T.define('hata_upper', { cutout: true, normal: 0.3 }, (c) => each((x, y) => {
    let col = CLOTH(c, x, y);
    const d = Math.hypot(x - 8.5, y - 9.5);
    const ring = d > 3.2 && d < 4.8, bar = d < 3.3 && ((y >= 8 && y <= 8) || (y >= 11 && y <= 11));
    if (y === 2 || y === 3) col = H(0x161616);
    else if (ring || bar) col = H(0x151515);
    c.pxc(x, y, col); c.h(x, y, 0.6); c.s(x, y, 0.06, 0.03, 0.5);
  }));
  T.define('hata_lower', { cutout: true, normal: 0.3 }, (c) => {
    const GLYPH = [
      '................', '........X.......', '........X.......', '....XXXXXXXXX...', '........X.......', '........X.......',
      '.......X.X......', '......X...X.....', '.....X.....X....', '....X.......X...', '...X.........X..', '................',
      '................', '................', '................', '................',
    ];
    each((x, y) => {
      let col = CLOTH(c, x, y);
      if (GLYPH[y][x] === 'X') col = H(0x141414);
      if (y >= 13) col = H(0xb01c18);
      c.pxc(x, y, col); c.h(x, y, 0.6); c.s(x, y, 0.06, 0.03, 0.5);
    });
  });
  T.define('nobori', { cutout: true, normal: 0.3 }, (c) => each((x, y) => {
    let col = mix(H(0xa01c18), H(0xb82420), c.fbm(x, y, 4, 2, 6));
    if (x <= 4) col = mix(H(0xeeebe2), H(0xfaf8f2), c.hashp(x, y));
    const d = Math.hypot(x - 8.5, y - 4.5);
    if (d > 1.6 && d < 2.8) col = H(0xf6f2e6);
    if (y >= 14) col = H(0x6a0e0c);
    c.pxc(x, y, col); c.h(x, y, 0.6); c.s(x, y, 0.06, 0.03, 0.45);
  }));

  // ---------------------------------------------------------------- item sprites (outlined pixel art)
  function grid(rows) {
    const g = new Array(256).fill(null);
    if (rows) for (let y = 0; y < 16; y++) {
      const r = rows[y] || '';
      for (let x = 0; x < 16; x++) { const ch = r[x]; if (ch && ch !== '.' && ch !== ' ') g[y * 16 + x] = ch; }
    }
    g.set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y * 16 + x] = ch; };
    g.at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? null : g[y * 16 + x]);
    return g;
  }
  // pal: ch -> hex | [hex, smooth, f0, emit]
  function render(c, g, P, outline = 0x1a1a1a) {
    for (let i = 0; i < 256; i++) { c.px(i & 15, i >> 4, 0, 0, 0, 0); c.h(i & 15, i >> 4, 0.5); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (g.at(x, y)) continue;
      if (!(g.at(x, y - 1) || g.at(x - 1, y) || g.at(x + 1, y) || g.at(x, y + 1))) continue;
      c.pxc(x, y, H(outline)); c.h(x, y, 0.35); c.s(x, y, 0.1, 0.04);
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ch = g.at(x, y);
      if (!ch) continue;
      let e = P[ch];
      if (e === undefined) e = 0xff00ff;
      if (!Array.isArray(e)) e = [e];
      const col = H(e[0]);
      c.pxc(x, y, col);
      c.h(x, y, 0.55 + 0.4 * (0.3 * col[0] + 0.55 * col[1] + 0.15 * col[2]));
      c.s(x, y, e[1] !== undefined ? e[1] : 0.2, e[2] !== undefined ? e[2] : 0.04, 0, e[3] || 0);
    }
  }
  const def = (name, fn) => T.define(name, { cutout: true, normal: 0.12 }, fn);
  // a slightly curved Japanese blade from the lower left to the upper right: blade, habaki, tsuba, tsuka
  function blade(g, o = {}) {
    for (let i = 0; i < 10; i++) {
      const x = 5 + i, y = 10 - i - (i > 5 ? 0 : 0);
      const sag = i >= 3 && i <= 7 ? 1 : 0;   // gentle sori
      g.set(x, y + sag - 1, 'E'); g.set(x, y + sag, 'M'); if (!o.thin) g.set(x + 1, y + sag, 'd');
    }
    g.set(15, 0, 'E'); g.set(14, 1, 'E');
    if (o.hamon) for (let i = 1; i < 9; i += 2) g.set(5 + i, 10 - i - (i >= 3 && i <= 7 ? 0 : 1), 'h');
    g.set(4, 11, 'b');                        // habaki
    for (const [x, y] of [[3, 10], [4, 10], [5, 11], [5, 12], [3, 12], [4, 12], [2, 11], [3, 11]]) g.set(x, y, 'g');   // tsuba
    for (let i = 0; i < 4; i++) g.set(3 - i, 13 + i - (i > 2 ? 1 : 0), i % 2 ? 'K' : 'k');
    g.set(2, 13, 'k'); g.set(1, 14, 'K'); g.set(0, 15, 'p');
  }
  const handle = (g, x0, y0, n, a, b) => { for (let i = 0; i < n; i++) { g.set(x0 + i, y0 - i, a); g.set(x0 + i + 1, y0 - i, b); } };

  def('tamahagane', (c) => {
    const g = grid(['', '', '', '', '.....aaab.......', '...aaMMMaab.....', '..aMMWMMMMab....', '..aMMMMMdMMab...', '.aMMdMMMMMMMa...',
      '.aMMMMMMWMMda...', '..adMMMMMMdaa...', '...aadMMMdaa....', '.....aaaaa......']);
    render(c, g, { a: [0x5a5e66, 0.6, 0.6], b: [0x8a8e98, 0.7, 0.7], M: [0xa8b0bc, 0.8, 0.8], W: [0xf0f4ff, 0.95, 0.9, 0.1], d: [0x6a707a, 0.7, 0.7] }, 0x15161a);
  });
  def('onigiri', (c) => {
    const g = grid(['', '', '.......ww.......', '......wwWw......', '.....wwwwwW.....', '.....wwwwwww....', '....wwwwwwwww...', '....wwwwwwwww...',
      '...wwwwwwwwwww..', '...wwnnnnnnwww..', '..wwwnnnnnnwwww.', '..wwwnnnnnnwwww.', '..wwwnnnnnnwwww.', '...wwnnnnnnwww..']);
    render(c, g, { w: [0xf2f0e8, 0.15, 0.04], W: 0xffffff, n: [0x1e2a1e, 0.35, 0.04] }, 0x2a2a26);
  });
  def('katana', (c) => {
    const g = grid(); blade(g, { hamon: true });
    render(c, g, { E: [0xffffff, 0.95, 0.6], M: [0xc8ced8, 0.9, 0.7], d: [0x7c8494, 0.85, 0.7], h: [0xeef2f8, 0.95, 0.6], b: [0xd8b048, 0.8, 0.8],
      g: [0x2a2a2e, 0.6, 0.5], k: 0x1a1a22, K: 0xe8e4d8, p: 0x3a2a1a }, 0x121216);
  });
  def('yari', (c) => {
    const g = grid();
    handle(g, 0, 15, 11, 's', 'S');
    for (const [x, y, ch] of [[11, 4, 'b'], [12, 4, 'b'], [12, 3, 'M'], [13, 3, 'M'], [13, 2, 'E'], [14, 2, 'M'], [14, 1, 'E'], [15, 0, 'E'], [13, 1, 'E'], [12, 2, 'd']]) g.set(x, y, ch);
    render(c, g, { s: 0x7a2a1a, S: 0x4a180e, b: [0xc8a040, 0.8, 0.8], M: [0xc0c8d4, 0.9, 0.7], E: [0xffffff, 0.95, 0.6], d: [0x7a8290, 0.85, 0.7] }, 0x140e0c);
  });
  def('yumi', (c) => {
    const g = grid(['..bb............', '...bb...........', '....b...........', '....bs..........', '.....bs.........', '.....b.s........',
      '......b.s.......', '......r..s......', '......b...s.....', '......b....s....', '.....b.....s....', '.....r....s.....', '....b....s......',
      '....b..ss.......', '...bbss.........', '..bb............']);
    render(c, g, { b: [0x201814, 0.5, 0.05], r: 0xc03020, s: [0xf0ece0, 0.3, 0.04] }, 0x0e0a08);
  });
  def('shuriken', (c) => {
    const g = grid(['', '', '.......M........', '.......MM.......', '.......MM.......', '......MMM.......', '.MMMMMMdMM......', '..MMMdd.ddMMMMM.',
      '......MMdMMM....', '.......MMM......', '.......MM.......', '.......MM.......', '........M.......']);
    g.set(8, 7, null);
    render(c, g, { M: [0x9aa2ae, 0.85, 0.75], d: [0x5a606a, 0.8, 0.7] }, 0x121418);
  });
  const armorSprite = (P, crest) => (c) => {
    const g = grid(['', '...SS......SS...', '..SSSS....SSSS..', '..SSSSaaaaSSSS..', '..SSSaaaaaaSSS..', '...SaLLLLLLaS...', '....aPPPPPPa....',
      '....aLLLLLLa....', '....aPPPPPPa....', '....aLLLLLLa....', '....aPPPPPPa....', '...aKKKKKKKKa...', '...KkKkKkKkKK...', '...KkKkKkKkKK...', '...KKKKKKKKKK...']);
    if (crest) for (const [x, y] of [[7, 5], [8, 5], [7, 7], [8, 7]]) g.set(x, y, 'G');
    render(c, g, P, 0x100c0c);
  };
  def('domaru', armorSprite({ S: [0x3a3e48, 0.5, 0.5], a: [0x5a5e68, 0.6, 0.6], L: [0x2a3a6a, 0.3, 0.04], P: [0x6a707c, 0.6, 0.6], K: [0x3a3e48, 0.5, 0.5], k: 0x2a3a6a }));
  def('gusoku', armorSprite({ S: [0x8a1a14, 0.7, 0.2], a: [0xc8a040, 0.8, 0.8], L: [0x2a1e3a, 0.3, 0.04], P: [0xa82018, 0.75, 0.2], K: [0x8a1a14, 0.7, 0.2], k: 0x141414, G: [0xf0c848, 0.85, 0.8] }, true));
  def('kuroito', armorSprite({ S: [0x16161a, 0.75, 0.2], a: [0xd8b048, 0.85, 0.85], L: [0x0e0e10, 0.3, 0.04], P: [0x26262c, 0.8, 0.25], K: [0x16161a, 0.75, 0.2], k: 0xa81c18,
    G: [0xffd850, 0.9, 0.85, 0.2] }, true));
  def('gekko', (c) => {
    const g = grid(); blade(g, { hamon: true });
    g.set(13, 5, 'm'); g.set(12, 6, 'm'); g.set(11, 7, 'm');
    render(c, g, { E: [0xffffff, 0.95, 0.4, 0.5], M: [0xdce8ff, 0.95, 0.5, 0.25], d: [0x8aa0c8, 0.9, 0.6, 0.1], h: [0xf4f8ff, 0.95, 0.4, 0.6], m: [0xf8f0c0, 0.95, 0.3, 0.8],
      b: [0xf0d060, 0.85, 0.8], g: [0xe8c040, 0.85, 0.8], k: 0x1e2a6a, K: 0xdce4ff, p: [0xf0d060, 0.85, 0.8] }, 0x0e1224);
  });
  def('murasame', (c) => {
    const g = grid(); blade(g, { hamon: true });
    render(c, g, { E: [0xff80c0, 0.9, 0.3, 0.7], M: [0x4a3050, 0.9, 0.6], d: [0x2a1a30, 0.85, 0.6], h: [0xd040ff, 0.9, 0.3, 0.9],
      b: [0x8a2020, 0.7, 0.5], g: [0x1a1016, 0.6, 0.5], k: 0x3a0e2a, K: 0x8a1a4a, p: [0xff3060, 0.6, 0.1, 0.8] }, 0x100812);
  });
  def('ninjato', (c) => {
    const g = grid();
    for (let i = 0; i < 9; i++) { g.set(5 + i, 9 - i, 'M'); g.set(6 + i, 9 - i, 'd'); }
    g.set(14, 0, 'M');
    for (const [x, y] of [[3, 10], [4, 10], [5, 10], [3, 11], [5, 11], [3, 12], [4, 12], [5, 12]]) g.set(x, y, 'g');
    handle(g, 0, 15, 3, 'k', 'K');
    render(c, g, { M: [0x8a909a, 0.8, 0.7], d: [0x4a4e56, 0.75, 0.6], g: [0x1a1a1a, 0.5, 0.4], k: 0x141414, K: 0x2a2a2a }, 0x0a0a0c);
  });
  def('tengu_yari', (c) => {
    const g = grid();
    handle(g, 0, 15, 10, 's', 'S');
    // jumonji head: straight point plus two side blades
    for (const [x, y, ch] of [[10, 5, 'b'], [11, 4, 'b'], [12, 3, 'M'], [13, 2, 'M'], [14, 1, 'E'], [15, 0, 'E'], [11, 2, 'M'], [10, 1, 'E'], [13, 4, 'M'], [14, 5, 'E'],
      [12, 4, 'd'], [12, 2, 'd']]) g.set(x, y, ch);
    for (const [x, y] of [[8, 5], [7, 5], [8, 6], [9, 6], [7, 6]]) g.set(x, y, 'w');
    render(c, g, { s: 0x9a1c14, S: 0x5a0e0a, b: [0xf0c848, 0.85, 0.8], M: [0xd8e0ea, 0.95, 0.7, 0.1], E: [0xffffff, 0.95, 0.6, 0.3], d: [0x8a92a0, 0.85, 0.7], w: 0xf4f4f4 }, 0x140a08);
  });
  const gun = (P) => (c) => {
    const g = grid();
    for (let i = 0; i < 11; i++) { g.set(4 + i, 11 - i, 'B'); g.set(5 + i, 11 - i, 'b'); }
    g.set(15, 0, 'B');
    for (const [x, y] of [[0, 15], [1, 15], [0, 14], [1, 14], [2, 14], [1, 13], [2, 13], [3, 13], [2, 12], [3, 12], [4, 12], [3, 11], [4, 11], [5, 12], [4, 13]]) g.set(x, y, 'W');
    for (const [x, y] of [[6, 10], [9, 7], [12, 4]]) g.set(x, y, 'r');
    g.set(5, 13, 'm'); g.set(6, 13, 'M');
    render(c, g, P, 0x100c0a);
  };
  def('tanegashima', gun({ B: [0x3a3a40, 0.7, 0.6], b: [0x22222a, 0.6, 0.5], W: 0x9a4a1e, r: [0xe8c050, 0.85, 0.85], m: 0x5a3a1a, M: [0xff5010, 0.4, 0.04, 1] }));
  def('teppo', gun({ B: [0x3a3a40, 0.7, 0.6], b: [0x22222a, 0.6, 0.5], W: 0x6a3a1c, r: [0x8a8a90, 0.7, 0.6], m: 0x4a2e16, M: [0xff5010, 0.4, 0.04, 1] }));
})();
