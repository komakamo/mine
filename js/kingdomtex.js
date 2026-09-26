'use strict';
// Item sprites of the kingdom's people: the mounted knights' lance and the blacksmith's hammer.
(function () {
  const T = MC.TexGen, H = MC.col.hex;
  function grid() {
    const g = new Array(256).fill(null);
    g.set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y * 16 + x] = ch; };
    g.at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? null : g[y * 16 + x]);
    return g;
  }
  // pal: ch -> hex | [hex, smooth, f0, emit]; dark outline around every filled pixel
  function render(c, g, P, outline) {
    for (let i = 0; i < 256; i++) { c.px(i & 15, i >> 4, 0, 0, 0, 0); c.h(i & 15, i >> 4, 0.5); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (g.at(x, y) || !(g.at(x, y - 1) || g.at(x - 1, y) || g.at(x + 1, y) || g.at(x, y + 1))) continue;
      c.pxc(x, y, H(outline)); c.h(x, y, 0.35); c.s(x, y, 0.1, 0.04);
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ch = g.at(x, y);
      if (!ch) continue;
      let e = P[ch];
      if (!Array.isArray(e)) e = [e];
      const col = H(e[0]);
      c.pxc(x, y, col);
      c.h(x, y, 0.55 + 0.4 * (0.3 * col[0] + 0.55 * col[1] + 0.15 * col[2]));
      c.s(x, y, e[1] !== undefined ? e[1] : 0.2, e[2] !== undefined ? e[2] : 0.04, 0, e[3] || 0);
    }
  }
  const def = (name, fn) => T.define(name, { cutout: true, normal: 0.12 }, fn);

  def('k_lance', (c) => {
    const g = grid();
    // long ash shaft along the diagonal, steel tip, conical vamplate and a pennant below the tip
    for (let i = 0; i < 13; i++) { g.set(i, 15 - i, 's'); if (i < 12) g.set(i + 1, 15 - i, 'k'); }
    for (const [x, y] of [[13, 2], [14, 1], [15, 0], [14, 2], [13, 1]]) g.set(x, y, 'T');
    g.set(15, 1, 't'); g.set(14, 0, 't');
    for (const [x, y] of [[3, 10], [4, 11], [5, 12], [2, 11], [3, 12], [4, 13]]) g.set(x, y, 'V');
    for (const [x, y] of [[11, 5], [12, 5], [12, 6], [13, 6], [12, 7], [11, 6]]) g.set(x, y, 'p');
    g.set(13, 7, 'P'); g.set(14, 7, 'P');
    render(c, g, { s: 0xb08a58, k: 0x7a5a34, T: [0xe8ecf2, 0.85, 0.6], t: [0xffffff, 0.9, 0.6], V: [0x9aa2ae, 0.8, 0.6], p: 0xf2f2f2, P: 0xd8d8d8 }, 0x1e1a16);
  });
  def('k_hammer', (c) => {
    const g = grid();
    for (let i = 0; i < 9; i++) { g.set(1 + i, 14 - i, 's'); g.set(2 + i, 14 - i, 'k'); }
    g.set(0, 15, 'p');
    // heavy square head across the handle's end
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const u = ((x - 11.5) + (y - 3.5)) / Math.SQRT2, v = ((x - 11.5) - (y - 3.5)) / Math.SQRT2;
      if (Math.abs(u) > 1.9 || Math.abs(v) > 4.3) continue;
      g.set(x, y, Math.abs(v) > 3.4 ? 'F' : Math.abs(u) > 1.2 ? 'D' : 'M');
    }
    render(c, g, { s: 0x8a6a3a, k: 0x5e4526, p: 0x3a2a18, M: [0x7c828c, 0.6, 0.5], D: [0x4e525a, 0.55, 0.5], F: [0xb8bec8, 0.8, 0.6] }, 0x16161a);
  });
})();
