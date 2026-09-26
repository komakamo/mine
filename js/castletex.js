'use strict';
// Textures for the castle content: building blocks (dark / frost bricks, packed ice, desert stone, magma,
// bone, the magic seal) and the item sprites of the legendary rewards.
(function () {
  const T = MC.TexGen, H = MC.col.hex, mix = MC.col.mix, pal = MC.col.pal;
  const S = 16;

  // ---------------------------------------------------------------- blocks
  // bricks in rows of h px, each w px long; P brick shades, mortar colour
  function bricks(c, P, mortarCol, w, h, o = {}) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = Math.floor(y / h), off = (row & 1) * (w >> 1);
      const mortar = y % h === h - 1 || (x + off) % w === w - 1;
      const id = Math.floor((x + off) / w) + row * 7;
      if (mortar) { c.pxc(x, y, mortarCol); c.h(x, y, 0.12); c.s(x, y, 0.06, 0.03); continue; }
      const n = MC.hash2(id, 5, c.seed) * 0.55 + c.fbm(x, y, 4, 2, 3) * 0.25 + c.hashp(x, y) * 0.2;
      const edge = y % h === 0 || (x + off) % w === 0;
      let col = pal(P, MC.clamp(n, 0, 0.99));
      if (edge && o.bevel) col = mix(col, o.bevel, 0.35);
      c.pxc(x, y, col); c.h(x, y, edge ? 0.92 : 0.68 + n * 0.22);
      c.s(x, y, (o.smooth || 0.15) + n * 0.1, o.f0 || 0.04, o.sss || 0);
    }
  }
  function cracks(c, col, n = 4) {
    for (let k = 0; k < n; k++) {
      let x = Math.floor(c.rand() * 16), y = Math.floor(c.rand() * 16);
      for (let i = 0; i < 7; i++) {
        c.pxc(x, y, col); c.h(x, y, 0.06);
        if (c.rand() < 0.5) x += c.rand() < 0.5 ? -1 : 1; else y += c.rand() < 0.6 ? 1 : -1;
      }
    }
  }
  const DARK = [H(0x2a1419), H(0x33181e), H(0x3d1c24), H(0x47212a), H(0x522630)];
  T.define('dark_bricks', { normal: 1.3 }, (c) => bricks(c, DARK, H(0x120709), 8, 4, { bevel: H(0x6a3440) }));
  T.define('cracked_dark_bricks', { normal: 1.4 }, (c) => { bricks(c, DARK, H(0x120709), 8, 4, { bevel: H(0x6a3440) }); cracks(c, H(0x0a0405), 5); });
  const FROST = [H(0x93acc0), H(0xa2bacd), H(0xb2c9da), H(0xc2d7e6), H(0xd2e5f1)];
  T.define('frost_bricks', { normal: 1.2 }, (c) => {
    bricks(c, FROST, H(0x5f7a90), 16, 8, { bevel: H(0xeaf6ff), smooth: 0.45, f0: 0.05 });
    // frost rime along the mortar lines
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (y % 8 === 0 && c.hashp(x, y, 9) < 0.45) { c.pxc(x, y, H(0xf2fbff)); c.s(x, y, 0.7, 0.05); }
    }
  });
  T.define('packed_ice', { normal: 0.7 }, (c) => {
    const P = [H(0x98bce8), H(0xa6c8ee), H(0xb4d2f2), H(0xc2dcf6)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 21) * 0.7 + c.hashp(x, y) * 0.3;
      c.pxc(x, y, pal(P, n)); c.h(x, y, 0.7 + n * 0.2); c.s(x, y, 0.88, 0.05);
    }
    for (let k = 0; k < 3; k++) {
      let x = Math.floor(c.rand() * 16), y = Math.floor(c.rand() * 16);
      const dx = c.rand() < 0.5 ? 1 : -1;
      for (let i = 0; i < 6; i++) { c.pxc(x & 15, y & 15, H(0xd8ecff)); c.h(x & 15, y & 15, 0.5); x += dx; y += c.rand() < 0.5 ? 1 : 0; }
    }
  });
  const SAND = [H(0xcdb983), H(0xd6c38e), H(0xdecd9a), H(0xe5d6a6)];
  T.define('cut_sandstone', { normal: 0.9 }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 7) * 0.5 + c.hashp(x, y) * 0.5;
      const e = Math.min(x, y, 15 - x, 15 - y);
      let col = pal(SAND, n), h = 0.72;
      if (e === 0) { col = mix(col, H(0xa48f5c), 0.6); h = 0.3; }
      else if (y === 7 || y === 8) { col = mix(col, H(0xb9a26d), 0.35); h = 0.5; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.12, 0.03);
    }
  });
  T.define('chiseled_sandstone', { normal: 1.2 }, (c) => {
    const glyph = [
      '................',
      '.OOOOOOOOOOOOOO.',
      '.O............O.',
      '.O...GGGGGG...O.',
      '.O..G......G..O.',
      '.O..G.GGGG.G..O.',
      '.O..G.G..G.G..O.',
      '.O..G.GGGG.G..O.',
      '.O..G......G..O.',
      '.O...GG..GG...O.',
      '.O.....GG.....O.',
      '.O....GGGG....O.',
      '.O.....GG.....O.',
      '.O............O.',
      '.OOOOOOOOOOOOOO.',
      '................',
    ];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 9) * 0.5 + c.hashp(x, y) * 0.5;
      const ch = glyph[y][x];
      let col = pal(SAND, n), h = 0.75;
      if (ch === 'O') { col = mix(col, H(0xa48f5c), 0.55); h = 0.35; }
      else if (ch === 'G') { col = mix(col, H(0x8f7a48), 0.65); h = 0.25; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.12, 0.03);
    }
  });
  T.define('magma', { normal: 1.2 }, (c) => {
    const pts = c.randPoints(9);
    const P = [H(0x2a0e06), H(0x3a1308), H(0x4c1a0a), H(0x5e220c)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = c.voronoi(x + 0.5, y + 0.5, pts);
      const b = v.d2 - v.d1;
      if (b < 1.1) {
        const k = 1 - b / 1.1;
        c.pxc(x, y, mix(H(0xd8520c), H(0xffb02a), k)); c.h(x, y, 0.2); c.s(x, y, 0.3, 0.04, 0, 0.55 + k * 0.45);
      } else {
        const n = MC.clamp(c.hashp(x, y) * 0.6 + MC.clamp(b / 4, 0, 1) * 0.4, 0, 0.99);
        c.pxc(x, y, pal(P, n)); c.h(x, y, 0.55 + n * 0.4); c.s(x, y, 0.2, 0.04, 0, 0.05);
      }
    }
  });
  const BONE = [H(0xd9d2b8), H(0xe2dcc4), H(0xebe6d0), H(0xf2eedc)];
  T.define('bone_block_side', { normal: 1.0 }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const groove = x === 3 || x === 7 || x === 11 || x === 15;
      const n = c.vnoise(x * 2, y * 0.3, 8, 5) * 0.6 + c.hashp(x, y) * 0.4;
      c.pxc(x, y, groove ? mix(pal(BONE, n), H(0x9a927a), 0.55) : pal(BONE, n));
      c.h(x, y, groove ? 0.3 : 0.7 + n * 0.2); c.s(x, y, 0.3, 0.04);
    }
  });
  T.define('bone_block_top', { normal: 1.0 }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      const r = Math.hypot(x - 7.5, y - 7.5);
      const n = c.hashp(x, y) * 0.5 + 0.3;
      let col = pal(BONE, n), h = 0.75;
      if (e === 0) { col = mix(col, H(0x9a927a), 0.5); h = 0.3; }
      else if (r < 3.2) { col = mix(col, H(0xb0a888), 0.5 + (r < 1.5 ? 0.3 : 0)); h = 0.4; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.3, 0.04);
    }
  });
  T.define('vault_stone', { normal: 1.3 }, (c) => {
    bricks(c, [H(0x2a2a30), H(0x303038), H(0x36363f), H(0x3c3c46)], H(0x16161a), 8, 8, { bevel: H(0x5a5a66), smooth: 0.35 });
    // gold runes along the mortar
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [11, 11], [12, 11], [12, 12], [11, 4], [4, 11], [7, 7], [8, 8]]) {
      c.pxc(x, y, H(0xf0c040)); c.h(x, y, 0.4); c.s(x, y, 0.8, 0.8, 0, 0.7);
    }
  });
  T.define('seal_bars', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const vb = x === 2 || x === 3 || x === 7 || x === 8 || x === 12 || x === 13;
      const hb = y === 2 || y === 8 || y === 13;
      const rune = (x === 5 || x === 10) && (y === 5 || y === 11);
      if (!vb && !hb && !rune) { c.px(x, y, 0, 0, 0, 0); continue; }
      const hi = x === 2 || x === 7 || x === 12 || y === 2;
      const g = rune ? 1 : 0.55 + c.hashp(x, y) * 0.25;
      c.pxc(x, y, rune ? H(0xffd0ff) : mix(H(0x6a2a9a), H(0xd070ff), hi ? g : g * 0.6));
      c.h(x, y, hi ? 1 : 0.8); c.s(x, y, 0.6, 0.6, 0, rune ? 1 : 0.55);
    }
  });

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
  // diagonal handle from (x0, y0) up-right, n px
  const handle = (g, x0, y0, n, a, b) => { for (let i = 0; i < n; i++) { g.set(x0 + i, y0 - i, a); g.set(x0 + i + 1, y0 - i, b); } };
  // a sword: 3 px blade along the anti-diagonal, guard, grip, pommel
  function sword(g, o) {
    for (let y = o.tipY || 1; y <= 9; y++) { g.set(14 - y, y, 'E'); g.set(15 - y, y, 'M'); g.set(16 - y, y, 'd'); }
    g.set(15, 0, 'E'); g.set(14, 0, 'E'); g.set(15, 1, 'M');
    if (o.fuller) for (let y = 3; y <= 8; y++) g.set(15 - y, y, 'f');
    for (let i = -o.guard; i <= o.guard; i++) g.set(5 + i, 10 + i, 'g');
    for (let i = 0; i < 4; i++) g.set(4 - i, 11 + i, i % 2 ? 'k' : 's');
    g.set(0, 15, 'p');
  }

  def('holy_sword', (c) => {
    const g = grid();
    sword(g, { guard: 3, fuller: true });
    g.set(2, 8, 'g'); g.set(8, 12, 'g');
    render(c, g, {
      E: [0xffffff, 0.9, 0.5, 0.35], M: [0xd8dde8, 0.85, 0.6, 0.1], d: [0x8f96a8, 0.8, 0.6], f: [0xffd24a, 0.85, 0.7, 0.45],
      g: [0xf2c037, 0.85, 0.8, 0.15], s: 0x3a4aa8, k: 0x24307a, p: [0x5ab0ff, 0.95, 0.2, 0.8],
    }, 0x1a1a24);
  });
  def('frost_blade', (c) => {
    const g = grid();
    sword(g, { guard: 2, fuller: true });
    for (const y of [2, 5, 8]) g.set(17 - y, y, 'I');
    g.set(3, 7, 'I'); g.set(7, 11, 'I');
    render(c, g, {
      E: [0xf0ffff, 0.95, 0.1, 0.45], M: [0xa6ecff, 0.95, 0.08, 0.25], d: [0x3aa6d8, 0.9, 0.08, 0.1], f: [0xe8ffff, 0.95, 0.1, 0.7],
      I: [0xd8fbff, 0.95, 0.1, 0.5], g: [0x9ab8d8, 0.8, 0.6], s: 0x2a3a6a, k: 0x1a2448, p: [0x7ff0ff, 0.95, 0.1, 0.9],
    }, 0x0c2238);
  });
  def('demon_hammer', (c) => {
    const g = grid();
    handle(g, 1, 14, 8, 's', 'k');
    g.set(0, 15, 'p');
    const cx = 10.5, cy = 4.5;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const u = ((x - cx) + (y - cy)) / Math.SQRT2, v = ((x - cx) - (y - cy)) / Math.SQRT2;
      if (Math.abs(u) > 4.7 || Math.abs(v) > 2.3) continue;
      const edge = Math.abs(u) > 3.9 || Math.abs(v) > 1.6;
      const crack = !edge && MC.hash2(x, y, 77) < 0.32;
      g.set(x, y, edge ? 'D' : crack ? 'r' : 'H');
    }
    g.set(9, 6, 'b'); g.set(8, 7, 'b');
    render(c, g, {
      H: [0x3a3036, 0.55, 0.3], D: [0x1e1a1e, 0.5, 0.3], r: [0xff7a1a, 0.4, 0.04, 0.95], b: [0xc8a040, 0.8, 0.8],
      s: 0x5a2e1e, k: 0x3a1c10, p: [0xff5020, 0.5, 0.04, 0.8],
    }, 0x0e0808);
  });
  def('necro_staff', (c) => {
    const g = grid();
    handle(g, 1, 14, 10, 'w', 'W');
    g.set(0, 15, 'b');
    // bone claws holding a soul orb
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 12.5, y - 3.5);
      if (d < 2.4) g.set(x, y, d < 1.2 ? 'O' : 'o');
    }
    for (const [x, y] of [[10, 6], [9, 5], [9, 4], [13, 7], [14, 6], [15, 5], [10, 0], [11, 0]]) g.set(x, y, 'b');
    render(c, g, {
      w: 0x3a2632, W: 0x2a1822, b: [0xe8e2c8, 0.3, 0.04], o: [0x9a3aff, 0.9, 0.1, 0.8], O: [0xf0c8ff, 0.95, 0.1, 1.0],
    }, 0x120812);
  });
  def('sun_bow', (c) => {
    const g = grid([
      '................', '...bbbb.........', '....ssbbb.......', '....s...bb......', '.....s...bb.....',
      '......s...b.....', '.......s...bS...', '........s..bSS..', '.........s.bS...', '..........sb....',
      '...........b....', '..........b.....', '.........bb.....', '........bb......', '.......bb.......',
    ]);
    g.set(12, 6, 'R'); g.set(14, 7, 'R'); g.set(12, 8, 'R');
    render(c, g, { b: [0xf2c037, 0.85, 0.8, 0.1], s: [0xffd890, 0.3, 0.04, 0.4], S: [0xfff2a0, 0.9, 0.4, 0.9], R: [0xffa020, 0.6, 0.1, 0.8] }, 0x3a2204);
  });
  def('life_crystal', (c) => {
    const g = grid([
      '................', '................', '...rrr...rrr....', '..rWWrr.rrrrr...', '.rWWrrrrrrrrrr..',
      '.rWrrrrrrrrrdr..', '.rrrrrrrrrrrdr..', '..rrrrrrrrrdd...', '...rrrrrrrdd....', '....rrrrrdd.....',
      '.....rrrdd......', '......rdd.......', '.......d........',
    ]);
    render(c, g, { r: [0xe8263a, 0.95, 0.1, 0.45], W: [0xffd0d8, 0.95, 0.1, 0.8], d: [0x9a1020, 0.9, 0.1, 0.25] }, 0x3a0610);
  });
  def('healing_potion', (c) => {
    const g = grid([
      '................', '.......cc.......', '.......gg.......', '.......gg.......', '......gggg......',
      '.....gLLLLg.....', '....gLWLLLLg....', '....gLWLLLLg....', '....gLLLLLLg....', '....gLLLLLLg....',
      '....gLLLLLLg....', '.....gLLLLg.....', '......gggg......',
    ]);
    render(c, g, { c: 0x8a5a2a, g: [0xcfe6f2, 0.95, 0.05], L: [0xe0203a, 0.9, 0.05, 0.3], W: [0xffe0e6, 0.95, 0.05, 0.5] }, 0x1e2630);
  });
  def('sand_scepter', (c) => {
    const g = grid();
    handle(g, 1, 14, 9, 'G', 'g');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 12.5, y - 3.5);
      if (d > 1.2 && d < 2.6) g.set(x, y, 'G');
      else if (d <= 1.2) g.set(x, y, 'B');
    }
    render(c, g, { G: [0xf2c037, 0.85, 0.8], g: [0xb8861a, 0.8, 0.8], B: [0x2a6ae8, 0.9, 0.1, 0.6] }, 0x3a2204);
  });
  def('ice_staff', (c) => {
    const g = grid();
    handle(g, 1, 14, 9, 'w', 'W');
    for (const [x, y] of [[11, 4], [12, 3], [13, 2], [14, 1], [12, 4], [13, 3], [11, 2], [12, 1], [13, 5], [14, 4], [10, 3], [14, 3]]) g.set(x, y, 'I');
    g.set(12, 2, 'O'); g.set(13, 4, 'O');
    render(c, g, { w: 0xb8d8f0, W: 0x8ab0d0, I: [0x9fe8ff, 0.95, 0.08, 0.5], O: [0xf0ffff, 0.95, 0.08, 0.9] }, 0x0c2238);
  });
})();
