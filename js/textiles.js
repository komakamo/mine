'use strict';
// Tile generators (16x16 pixel-art textures with height + material maps)
(function () {
  const T = MC.TexGen, H = MC.col.hex, mix = MC.col.mix, pal = MC.col.pal;
  const S = 16;

  function stoneBase(c) {
    const P = [H(0x5f5f5f), H(0x6c6c6c), H(0x777777), H(0x818181), H(0x8d8d8d), H(0x979797)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 3) * 0.75 + c.hashp(x, y, 5) * 0.25;
      c.pxc(x, y, pal(P, n));
      c.h(x, y, 0.35 + n * 0.55);
      c.s(x, y, 0.12 + n * 0.12, 0.04);
    }
  }
  function ore(c, cols, clusters, smooth, f0, emit = 0) {
    stoneBase(c);
    for (let k = 0; k < clusters; k++) {
      let x = Math.floor(c.rand() * S), y = Math.floor(c.rand() * S);
      const n = 3 + Math.floor(c.rand() * 4);
      for (let i = 0; i < n; i++) {
        const v = c.rand();
        c.pxc(x, y, pal(cols, v));
        c.h(x, y, 0.85 + v * 0.15);
        c.s(x, y, smooth, f0, 0, emit * v);
        x += Math.floor(c.rand() * 3) - 1; y += Math.floor(c.rand() * 3) - 1;
      }
    }
  }
  function dirtBase(c) {
    const P = [H(0x5a3d27), H(0x6b4930), H(0x795336), H(0x86603f), H(0x93704f)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 3) * 0.55 + c.hashp(x, y, 9) * 0.45;
      c.pxc(x, y, pal(P, n));
      c.h(x, y, 0.3 + n * 0.5);
      c.s(x, y, 0.04, 0.02);
    }
  }
  const OAK_P = [H(0x8c6c40), H(0x9a7a4a), H(0xa4834f), H(0xb08d58), H(0xba9862)];
  function planksBase(c, P = OAK_P, seamCol = H(0x5c4428)) {
    for (let y = 0; y < S; y++) {
      const plank = y >> 2, seamX = Math.floor(MC.hash2(plank, 1, c.seed) * 16);
      const shade = MC.hash2(plank, 7, c.seed) * 0.25;
      for (let x = 0; x < S; x++) {
        const grain = c.vnoise(x * 0.25, y * 2, 8, plank) * 0.6 + c.hashp(x, y, 3) * 0.25;
        let col = pal(P, MC.clamp(grain + shade, 0, 0.99));
        let h = 0.75 + grain * 0.15;
        if ((y & 3) === 3) { col = mix(col, seamCol, 0.7); h = 0.25; }
        if (x === seamX) { col = mix(col, seamCol, 0.55); h = 0.35; }
        c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.18 + grain * 0.1, 0.04);
      }
    }
  }
  function leaves(c, holes) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 8, 2, 2) * 0.5 + c.hashp(x, y, 1) * 0.5;
      const hole = c.hashp(x, y, 77) < holes;
      const v = 0.42 + n * 0.45;
      c.px(x, y, v, v, v, hole ? 0 : 1);
      c.h(x, y, 0.3 + n * 0.7);
      c.s(x, y, 0.28 + n * 0.1, 0.03, 0.85);
    }
  }
  function logSide(c, P, grooveCol) {
    for (let x = 0; x < S; x++) {
      const colv = MC.hash2(x, 3, c.seed);
      for (let y = 0; y < S; y++) {
        const n = c.vnoise(x * 3, y * 0.4, 16, 5) * 0.6 + colv * 0.4;
        const groove = c.vnoise(x * 2, y * 0.25, 8, 11) < 0.33;
        let col = pal(P, n);
        if (groove) col = mix(col, grooveCol, 0.6);
        c.pxc(x, y, col); c.h(x, y, groove ? 0.25 : 0.6 + n * 0.4); c.s(x, y, 0.08, 0.03);
      }
    }
  }
  function logTop(c, bark, rings) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const edge = Math.max(Math.abs(dx), Math.abs(dy));
      if (edge > 6.5) { c.pxc(x, y, pal(bark, c.hashp(x, y))); c.h(x, y, 0.55); c.s(x, y, 0.08); continue; }
      const r = Math.sqrt(dx * dx + dy * dy) + c.hashp(x, y, 4) * 0.8;
      const ring = Math.floor(r * 0.9) % 2;
      c.pxc(x, y, mix(rings[ring], rings[2], c.hashp(x, y, 8) * 0.4));
      c.h(x, y, ring ? 0.7 : 0.8); c.s(x, y, 0.2, 0.04);
    }
  }
  function cobble(c, mossy) {
    const pts = c.randPoints(10);
    const shades = pts.map(() => c.rand());
    const P = [H(0x5a5a5a), H(0x6a6a6a), H(0x7a7a7a), H(0x8b8b8b), H(0x9b9b9b)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = c.voronoi(x + 0.5, y + 0.5, pts);
      const border = v.d2 - v.d1;
      const inner = MC.clamp(border / 2.6, 0, 1);
      let col = pal(P, MC.clamp(shades[v.id] * 0.6 + inner * 0.35 + c.hashp(x, y) * 0.15, 0, 0.99));
      let h = 0.2 + inner * 0.8;
      if (border < 0.9) { col = H(0x404040); h = 0.05; }
      if (mossy && c.fbm(x, y, 3, 2, 50) > 0.52) {
        col = mix(col, pal([H(0x3f6b2a), H(0x4f7f33), H(0x5f8f3a)], c.hashp(x, y, 2)), 0.85);
      }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.1 + inner * 0.12, 0.04);
    }
  }

  T.define('stone', stoneBase);
  T.define('cobblestone', { normal: 1.3 }, (c) => cobble(c, false));
  T.define('mossy_cobblestone', { normal: 1.3 }, (c) => cobble(c, true));
  T.define('dirt', dirtBase);

  T.define('grass_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 8, 2, 1) * 0.4 + c.hashp(x, y, 2) * 0.6;
      const v = 0.56 + n * 0.36;
      c.px(x, y, v, v, v); c.h(x, y, 0.4 + n * 0.6); c.s(x, y, 0.16, 0.03, 0.25);
    }
  });
  T.define('grass_side', (c) => {
    dirtBase(c);
    for (let x = 0; x < S; x++) {
      const d = 3 + (c.hashp(x, 0, 4) < 0.5 ? 1 : 0) + (c.hashp(x, 0, 6) < 0.25 ? 1 : 0);
      for (let y = 0; y < d; y++) {
        const v = 0.55 + c.hashp(x, y, 3) * 0.35;
        c.px(x, y, v, v, v, 1); c.h(x, y, 0.8); c.s(x, y, 0.16, 0.03, 0.25);
      }
      for (let y = d; y < S; y++) { const q = c.get(x, y); c.px(x, y, q[0], q[1], q[2], 0); }
    }
  });
  T.define('grass_side_snowed', (c) => {
    dirtBase(c);
    for (let x = 0; x < S; x++) {
      const d = 3 + (c.hashp(x, 0, 4) < 0.5 ? 1 : 0) + (c.hashp(x, 0, 6) < 0.3 ? 1 : 0);
      for (let y = 0; y < d; y++) {
        const v = 0.9 + c.hashp(x, y, 3) * 0.1;
        c.px(x, y, v * 0.97, v * 0.99, v); c.h(x, y, 0.9); c.s(x, y, 0.35, 0.03, 0.5);
      }
    }
  });
  T.define('sand', { normal: 0.6 }, (c) => {
    const P = [H(0xcdbb86), H(0xd6c592), H(0xdccb99), H(0xe2d3a3), H(0xe9dbad)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 7) * 0.4 + c.hashp(x, y) * 0.6;
      c.pxc(x, y, pal(P, n)); c.h(x, y, 0.5 + n * 0.3); c.s(x, y, 0.08, 0.03);
    }
  });
  T.define('gravel', { normal: 1.2 }, (c) => {
    const pts = c.randPoints(18), sh = pts.map(() => c.rand());
    const P = [H(0x5c5656), H(0x6d6666), H(0x7e7777), H(0x8f8787), H(0xa09898), H(0x857566)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = c.voronoi(x + 0.5, y + 0.5, pts);
      const inner = MC.clamp((v.d2 - v.d1) / 1.8, 0, 1);
      c.pxc(x, y, mix(pal(P, sh[v.id]), H(0x4a4444), inner < 0.25 ? 0.6 : 0));
      c.h(x, y, 0.2 + inner * 0.8); c.s(x, y, 0.1 + inner * 0.1, 0.04);
    }
  });
  T.define('bedrock', { normal: 1.6 }, (c) => {
    const P = [H(0x161616), H(0x2a2a2a), H(0x3e3e3e), H(0x565656), H(0x6e6e6e)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 3) * 0.5 + c.hashp(x, y) * 0.5;
      c.pxc(x, y, pal(P, n)); c.h(x, y, n); c.s(x, y, 0.1, 0.04);
    }
  });

  T.define('oak_log', { normal: 1.2 }, (c) => logSide(c, [H(0x3f2f1b), H(0x4e3a22), H(0x5d4529), H(0x6a5031)], H(0x2a1f12)));
  T.define('spruce_log', { normal: 1.2 }, (c) => logSide(c, [H(0x2b1e10), H(0x3b2a18), H(0x46321d), H(0x523b23)], H(0x1c140a)));
  T.define('birch_log', (c) => {
    const P = [H(0xc9c6bd), H(0xd8d6cf), H(0xe3e1da), H(0xeceae4)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.hashp(x, y) * 0.5 + c.vnoise(x * 0.5, y * 2, 8, 3) * 0.5;
      c.pxc(x, y, pal(P, n)); c.h(x, y, 0.7); c.s(x, y, 0.15, 0.03);
    }
    for (let k = 0; k < 7; k++) {
      const x0 = Math.floor(c.rand() * S), y0 = Math.floor(c.rand() * S), w = 2 + Math.floor(c.rand() * 3);
      for (let i = 0; i < w; i++) { c.pxc(x0 + i, y0, H(0x2f2f2a)); c.h(x0 + i, y0, 0.3); }
    }
  });
  T.define('oak_log_top', (c) => logTop(c, [H(0x4e3a22), H(0x5d4529)], [H(0xa8844f), H(0x957243), H(0xb8925b)]));
  T.define('birch_log_top', (c) => logTop(c, [H(0xd8d6cf), H(0xc9c6bd)], [H(0xc9ad76), H(0xb89a63), H(0xd6bd88)]));
  T.define('spruce_log_top', (c) => logTop(c, [H(0x3b2a18), H(0x46321d)], [H(0x8a6a3e), H(0x765830), H(0x9a7849)]));

  T.define('oak_leaves', { cutout: true, normal: 1.4 }, (c) => leaves(c, 0.22));
  T.define('birch_leaves', { cutout: true, normal: 1.4 }, (c) => leaves(c, 0.2));
  T.define('spruce_leaves', { cutout: true, normal: 1.4 }, (c) => leaves(c, 0.14));
  T.define('oak_planks', planksBase);

  T.define('glass', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const streak = (x + y === 11 || x + y === 12 || x + y === 20) && x > 2 && x < 13 && y > 2 && y < 13;
      if (edge) c.px(x, y, 0.82, 0.9, 0.95, 0.85);
      else if (streak) c.px(x, y, 0.95, 0.98, 1.0, 0.32);
      else c.px(x, y, 0.8, 0.9, 1.0, 0.07);
      c.h(x, y, edge ? 0.9 : 0.8); c.s(x, y, 0.96, 0.04);
    }
  });
  T.define('water', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2);
      c.px(x, y, 0.16 + n * 0.1, 0.36 + n * 0.12, 0.78 + n * 0.1, 0.75); c.h(x, y, n); c.s(x, y, 0.97, 0.02);
    }
  });
  T.define('lava', { normal: 0.8 }, (c) => {
    const P = [H(0xc22e00), H(0xe45500), H(0xff7a0a), H(0xff9c1a), H(0xffc03a), H(0xffe27a)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 3, 21);
      const v = MC.clamp(n * 1.3 - 0.1, 0, 0.99);
      c.pxc(x, y, pal(P, v)); c.h(x, y, v); c.s(x, y, 0.5, 0.04, 0, 0.55 + v * 0.45);
    }
  });

  T.define('coal_ore', (c) => ore(c, [H(0x1e1e1e), H(0x2e2e2e), H(0x3e3e3e)], 5, 0.35, 0.04));
  T.define('iron_ore', (c) => ore(c, [H(0xb8917a), H(0xd8af93), H(0xe8c7ae)], 5, 0.55, 0.3));
  T.define('gold_ore', (c) => ore(c, [H(0xd9a31f), H(0xfcdd4b), H(0xfff29a)], 5, 0.75, 1.0));
  T.define('diamond_ore', (c) => ore(c, [H(0x2fc6cf), H(0x5decf5), H(0xbafcff)], 5, 0.92, 0.17, 0.12));

  T.define('snow', { normal: 0.6 }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2) * 0.5 + c.hashp(x, y) * 0.5;
      const v = 0.9 + n * 0.1;
      c.px(x, y, v * 0.96, v * 0.98, v); c.h(x, y, 0.5 + n * 0.3); c.s(x, y, 0.35 + n * 0.1, 0.03, 0.55);
    }
  });
  T.define('ice', { normal: 0.7 }, (c) => {
    const pts = c.randPoints(6);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = c.voronoi(x + 0.5, y + 0.5, pts);
      const crack = v.d2 - v.d1 < 0.6;
      const n = c.hashp(x, y) * 0.15;
      if (crack) c.px(x, y, 0.85, 0.93, 1.0, 0.8);
      else c.px(x, y, 0.55 + n, 0.72 + n, 0.97, 0.62);
      c.h(x, y, crack ? 0.6 : 0.9); c.s(x, y, 0.94, 0.02);
    }
  });
  T.define('cactus_side', (c) => {
    const P = [H(0x1f5e1c), H(0x2b7327), H(0x378532), H(0x46973e)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ridge = (x % 4 === 1);
      const n = c.hashp(x, y) * 0.5 + (ridge ? 0.45 : 0.2);
      let col = pal(P, n);
      const spike = (x % 4 === 3) && (y % 5 === (x >> 2) % 5);
      if (spike) col = H(0xd9d4a0);
      c.pxc(x, y, col); c.h(x, y, ridge ? 0.9 : 0.55); c.s(x, y, 0.35, 0.04, 0.2);
    }
  });
  T.define('cactus_top', (c) => {
    const P = [H(0x2b7327), H(0x378532), H(0x4a9c40), H(0x6aae55)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.floor(r) % 3 === 0;
      c.pxc(x, y, pal(P, ring ? 0.8 : c.hashp(x, y) * 0.6)); c.h(x, y, ring ? 0.8 : 0.6); c.s(x, y, 0.35, 0.04, 0.2);
    }
  });

  function plantClear(c) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { c.px(x, y, 0, 0, 0, 0); c.h(x, y, 0.5); c.s(x, y, 0.2, 0.03, 0.8); } }
  T.define('tall_grass', { cutout: true }, (c) => {
    plantClear(c);
    for (let b = 0; b < 9; b++) {
      let x = 1 + Math.floor(c.rand() * 14);
      const hgt = 6 + Math.floor(c.rand() * 9);
      for (let i = 0; i < hgt; i++) {
        const y = 15 - i;
        const v = 0.5 + (i / hgt) * 0.35 + c.rand() * 0.1;
        c.px(x, y, v, v, v, 1); c.h(x, y, 0.4 + i / hgt * 0.6);
        if (c.rand() < 0.18) x = MC.clamp(x + (c.rand() < 0.5 ? -1 : 1), 0, 15);
      }
    }
  });
  function flower(c, petal, petalDark, center) {
    plantClear(c);
    const stem = H(0x3f8a2a), leaf = H(0x4f9a33);
    for (let y = 7; y < 16; y++) c.pxc(7, y, stem);
    c.pxc(6, 12, leaf); c.pxc(5, 11, leaf); c.pxc(8, 13, leaf); c.pxc(9, 12, leaf);
    for (let y = 3; y < 8; y++) for (let x = 5; x < 10; x++) {
      const d = Math.abs(x - 7) + Math.abs(y - 5);
      if (d <= 2 || (d === 3 && c.rand() < 0.5)) { c.pxc(x, y, d <= 1 ? center : (d === 3 ? petalDark : petal)); c.h(x, y, 1 - d * 0.15); }
    }
  }
  T.define('dandelion', { cutout: true }, (c) => flower(c, H(0xf5d316), H(0xc9a60e), H(0xffe95c)));
  T.define('poppy', { cutout: true }, (c) => flower(c, H(0xd4231c), H(0x8f1512), H(0x2a1a10)));
  T.define('dead_bush', { cutout: true }, (c) => {
    plantClear(c);
    const P = [H(0x6b4a22), H(0x7a5a2e), H(0x94703b)];
    const branch = (x, y, dx, len) => {
      for (let i = 0; i < len; i++) {
        c.pxc(x, y, pal(P, c.rand())); y--; if (c.rand() < 0.6) x += dx;
        if (x < 0 || x > 15 || y < 0) break;
      }
    };
    branch(7, 15, 0, 5); branch(7, 11, -1, 7); branch(8, 11, 1, 7); branch(7, 12, 1, 5); branch(6, 13, -1, 4);
  });
  T.define('torch', { cutout: true }, (c) => {
    plantClear(c);
    for (let y = 8; y < 16; y++) for (let x = 7; x < 9; x++) {
      c.pxc(x, y, x === 7 ? H(0x866236) : H(0x6b4f2c)); c.h(x, y, 0.7); c.s(x, y, 0.15, 0.03, 0, 0);
    }
    const fl = [[7, 6, H(0xffd84a)], [8, 6, H(0xfff2b0)], [7, 7, H(0xffa42a)], [8, 7, H(0xffd84a)]];
    for (const [x, y, col] of fl) { c.pxc(x, y, col); c.h(x, y, 1); c.s(x, y, 0.2, 0.03, 0, 1.0); }
  });
  T.define('glowstone', { normal: 1.3 }, (c) => {
    const pts = c.randPoints(9), sh = pts.map(() => c.rand());
    const P = [H(0x9a6128), H(0xc88a3f), H(0xe8b25a), H(0xf8d27e), H(0xfff0b8)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = c.voronoi(x + 0.5, y + 0.5, pts);
      const inner = MC.clamp((v.d2 - v.d1) / 2.2, 0, 1);
      const b = MC.clamp(sh[v.id] * 0.5 + inner * 0.5 + c.hashp(x, y) * 0.1, 0, 0.99);
      c.pxc(x, y, pal(P, b)); c.h(x, y, 0.3 + inner * 0.7); c.s(x, y, 0.4, 0.04, 0, 0.35 + b * 0.65);
    }
  });
  T.define('bricks', { normal: 1.3 }, (c) => {
    const P = [H(0x7f3a2e), H(0x8b4034), H(0x96483a), H(0xa4523f), H(0xb05e49)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = y >> 2, off = (row & 1) * 4;
      const mortar = (y & 3) === 3 || ((x + off) & 7) === 7;
      const brickId = Math.floor((x + off) / 8) + row * 3;
      if (mortar) { c.pxc(x, y, mix(H(0x9b928a), H(0xb3aba2), c.hashp(x, y))); c.h(x, y, 0.15); c.s(x, y, 0.08); }
      else {
        const n = MC.hash2(brickId, 3, c.seed) * 0.6 + c.hashp(x, y) * 0.4;
        c.pxc(x, y, pal(P, n)); c.h(x, y, 0.75 + c.hashp(x, y, 4) * 0.2); c.s(x, y, 0.15, 0.04);
      }
    }
  });
  T.define('sandstone', (c) => {
    const P = [H(0xc9b67f), H(0xd3c18b), H(0xdccb97), H(0xe3d4a3)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const band = y < 3 ? 0.85 : y > 12 ? 0.2 : 0.5 + Math.sin(y * 1.3) * 0.15;
      const n = MC.clamp(band * 0.7 + c.hashp(x, y) * 0.3, 0, 0.99);
      let col = pal(P, n);
      if (y === 3 || y === 12) col = mix(col, H(0xa89565), 0.5);
      c.pxc(x, y, col); c.h(x, y, y === 3 || y === 12 ? 0.3 : 0.6 + n * 0.3); c.s(x, y, 0.1, 0.03);
    }
  });
  T.define('sandstone_top', { normal: 0.6 }, (c) => {
    const P = [H(0xd6c592), H(0xdccb99), H(0xe2d3a3)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2) * 0.5 + c.hashp(x, y) * 0.5;
      c.pxc(x, y, pal(P, n)); c.h(x, y, 0.6 + n * 0.2); c.s(x, y, 0.1, 0.03);
    }
  });
  T.define('stone_bricks', { normal: 1.3 }, (c) => stoneBricksBase(c));
  function stoneBricksBase(c) {
    const P = [H(0x6f6f6f), H(0x797979), H(0x828282), H(0x8c8c8c)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = y >> 3, off = (row & 1) * 8;
      const mortar = (y & 7) === 7 || ((x + off) & 15) === 15;
      if (mortar) { c.pxc(x, y, H(0x4e4e4e)); c.h(x, y, 0.1); c.s(x, y, 0.05); continue; }
      const n = c.fbm(x, y, 4, 2, 9) * 0.6 + c.hashp(x, y) * 0.4;
      const edge = (y & 7) === 0 || ((x + off) & 15) === 0;
      c.pxc(x, y, edge ? mix(pal(P, n), H(0x9a9a9a), 0.4) : pal(P, n));
      c.h(x, y, edge ? 0.95 : 0.7 + n * 0.2); c.s(x, y, 0.18, 0.04);
    }
    // a crack
    let x = 3, y = 9;
    for (let i = 0; i < 6; i++) { c.pxc(x, y, H(0x505050)); c.h(x, y, 0.3); x++; y += c.rand() < 0.5 ? 1 : 0; }
  }
  function metal(c, P, smooth, f0, bevel) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.vnoise(x, y * 0.3, 8, 4) * 0.5 + c.hashp(x, y) * 0.2 + 0.2;
      const e = Math.min(x, y, 15 - x, 15 - y);
      let col = pal(P, MC.clamp(n + (e === 0 ? -0.3 : e === 1 ? 0.25 : 0), 0, 0.99));
      c.pxc(x, y, col); c.h(x, y, e === 0 ? 0.3 : e === 1 && bevel ? 0.85 : 0.75); c.s(x, y, smooth + n * 0.1, f0);
    }
  }
  T.define('iron_block', (c) => metal(c, [H(0xa8a8a8), H(0xbdbdbd), H(0xcfcfcf), H(0xdcdcdc), H(0xececec)], 0.72, 1.0, true));
  T.define('gold_block', (c) => metal(c, [H(0xc98d17), H(0xd9a31f), H(0xf5c531), H(0xfad64a), H(0xffe98a)], 0.8, 1.0, true));
  T.define('diamond_block', (c) => metal(c, [H(0x2cb4ad), H(0x4cd8d0), H(0x62ede4), H(0x8ff5ef), H(0xc6fffb)], 0.88, 0.17, true));
  T.define('obsidian', (c) => {
    const P = [H(0x0e0b14), H(0x14101c), H(0x1d1628), H(0x2a1f3a), H(0x3b2b52)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 3, 13);
      const v = MC.clamp(Math.pow(n, 1.6) * 1.4, 0, 0.99);
      c.pxc(x, y, pal(P, v)); c.h(x, y, 0.6 + v * 0.3); c.s(x, y, 0.82, 0.05);
    }
  });
  T.define('clay', { normal: 0.5 }, (c) => {
    const P = [H(0x959aa7), H(0x9fa4b1), H(0xa6abb8), H(0xaeb3c0)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2) * 0.6 + c.hashp(x, y) * 0.4;
      c.pxc(x, y, pal(P, n)); c.h(x, y, 0.6 + n * 0.2); c.s(x, y, 0.25, 0.03);
    }
  });
  T.define('bookshelf', (c) => {
    planksBase(c);
    const books = [H(0x6e2b21), H(0x2d4f7a), H(0x3a6b35), H(0x8a6d2c), H(0x5a3a6a), H(0x7a4a24)];
    for (const [y0, y1] of [[1, 7], [9, 15]]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(c.rand() * 2), col = pal(books, c.rand()), top = y0 + Math.floor(c.rand() * 2);
        for (let i = 0; i < w && x < 15; i++, x++) for (let y = y0; y < y1; y++) {
          if (y < top) { c.pxc(x, y, H(0x2a1d10)); c.h(x, y, 0.15); continue; }
          c.pxc(x, y, mix(col, H(0xffffff), (y === top + 1 ? 0.25 : 0))); c.h(x, y, 0.55); c.s(x, y, 0.2, 0.04);
        }
      }
    }
  });

  // ------------------------------------------------------------------ added block tiles
  const MOSS = [H(0x3f6b2a), H(0x4f7f33), H(0x5f8f3a)];
  const SPRUCE_P = [H(0x5a3f22), H(0x654828), H(0x6f502c), H(0x7a5932), H(0x836238)];
  T.define('spruce_planks', (c) => planksBase(c, SPRUCE_P, H(0x3a2814)));
  T.define('birch_planks', (c) => planksBase(c, [H(0xb8a56f), H(0xc2af78), H(0xcab880), H(0xd3c189), H(0xdccb93)], H(0x8c7a4a)));
  T.define('mossy_stone_bricks', { normal: 1.3 }, (c) => {
    stoneBricksBase(c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const m = c.fbm(x, y, 3, 2, 40) + (y > 9 ? 0.07 : 0);
      if (m > 0.54) { c.pxc(x, y, mix(c.get(x, y), pal(MOSS, c.hashp(x, y, 2)), 0.85)); c.s(x, y, 0.1, 0.03, 0.3); }
    }
  });
  T.define('cracked_stone_bricks', { normal: 1.4 }, (c) => {
    stoneBricksBase(c);
    for (let k = 0; k < 4; k++) {
      let x = Math.floor(c.rand() * 16), y = Math.floor(c.rand() * 16);
      for (let i = 0; i < 7; i++) {
        c.pxc(x, y, H(0x3e3e3e)); c.h(x, y, 0.08);
        if (c.rand() < 0.5) x += c.rand() < 0.5 ? -1 : 1; else y += c.rand() < 0.6 ? 1 : -1;
      }
    }
  });
  T.define('chiseled_stone_bricks', { normal: 1.4 }, (c) => {
    const P = [H(0x6f6f6f), H(0x797979), H(0x828282), H(0x8c8c8c)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 9) * 0.6 + c.hashp(x, y) * 0.4;
      const e = Math.min(x, y, 15 - x, 15 - y);
      const r = Math.hypot(x - 7.5, y - 7.5);
      let col = pal(P, n), h = 0.7;
      if (e === 0) { col = H(0x4e4e4e); h = 0.1; }
      else if (e === 1) { col = mix(col, H(0xa2a2a2), 0.4); h = 0.95; }
      else if (e === 3) { col = mix(col, H(0x5a5a5a), 0.6); h = 0.35; }
      if (r < 2.4) { col = mix(col, H(0x9a9a9a), 0.35); h = 0.9; } else if (r < 3.3 && e > 3) { col = mix(col, H(0x5a5a5a), 0.55); h = 0.35; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.18, 0.04);
    }
  });
  function smoothStone(c, slabLine) {
    const P = [H(0x9c9c9c), H(0xa3a3a3), H(0xa9a9a9), H(0xafafaf)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 13) * 0.6 + c.hashp(x, y) * 0.4;
      const e = Math.min(x, y, 15 - x, 15 - y);
      let col = pal(P, n), h = 0.75;
      if (e === 0 || (slabLine && (y === 7 || y === 8))) { col = mix(col, H(0x6e6e6e), 0.6); h = 0.4; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.3, 0.04);
    }
  }
  T.define('smooth_stone', (c) => smoothStone(c, false));
  T.define('smooth_stone_side', (c) => smoothStone(c, true));

  const TOOLS_ART = {
    // saw + hammer on the side of the crafting table
    front: [
      '................',
      '................',
      '................',
      '................',
      '..gg.......bb...',
      '..ggg......bbb..',
      '..gggg......w...',
      '...gggg.....w...',
      '....gggw....w...',
      '.....ggww...w...',
      '......gww.......',
      '................',
    ],
    side: [
      '................',
      '................',
      '................',
      '................',
      '...bbbbbb.......',
      '...bbbbbb.......',
      '......w.........',
      '......w....tttt.',
      '......w....t..t.',
      '......w....tttt.',
      '......w.........',
      '................',
    ],
  };
  function craftSide(c, which) {
    planksBase(c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (y < 3) { c.pxc(x, y, mix(c.get(x, y), H(0x4a3520), y === 2 ? 0.75 : 0.35)); c.h(x, y, y === 2 ? 0.2 : 0.8); }
      if (x === 0 || x === 15) { c.pxc(x, y, mix(c.get(x, y), H(0x3c2a18), 0.55)); c.h(x, y, 0.4); }
    }
    T.art(c, TOOLS_ART[which], { g: [0xb8b8b8, 0.9, 0.5, 0.6], b: [0x6a6a6a, 0.9, 0.4, 0.6], w: [0x6b4f2c, 0.8], t: [0x3a2a18, 0.6] }, { keep: true });
  }
  T.define('crafting_table_front', (c) => craftSide(c, 'front'));
  T.define('crafting_table_side', (c) => craftSide(c, 'side'));
  T.define('crafting_table_top', (c) => {
    planksBase(c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      if (e <= 1) { c.pxc(x, y, mix(c.get(x, y), H(0x4a3520), e === 0 ? 0.8 : 0.5)); c.h(x, y, e === 0 ? 0.3 : 0.9); }
      else if ((x === 6 || x === 10 || y === 6 || y === 10) && e > 2) { c.pxc(x, y, mix(c.get(x, y), H(0x5c4428), 0.6)); c.h(x, y, 0.35); }
    }
  });

  function stoneFrame(c) {
    const P = [H(0x5c5c5c), H(0x676767), H(0x717171), H(0x7c7c7c), H(0x878787)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 17) * 0.55 + c.hashp(x, y) * 0.45;
      const e = Math.min(x, y, 15 - x, 15 - y);
      let col = pal(P, n), h = 0.7;
      if (e === 0) { col = mix(col, H(0x3c3c3c), 0.5); h = 0.4; } else if (e === 1) { col = mix(col, H(0x9a9a9a), 0.3); h = 0.9; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.15, 0.04);
    }
  }
  T.define('furnace_side', stoneFrame);
  T.define('furnace_top', (c) => {
    stoneFrame(c);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) { if (x === 4 || y === 4 || x === 11 || y === 11) { c.pxc(x, y, mix(c.get(x, y), H(0x3c3c3c), 0.5)); c.h(x, y, 0.4); } }
  });
  T.define('furnace_front', (c) => {
    stoneFrame(c);
    for (let y = 3; y < 7; y++) for (let x = 4; x < 12; x++) { c.pxc(x, y, mix(c.get(x, y), H(0x3a3a3a), 0.45)); c.h(x, y, 0.5); }
    for (let y = 9; y < 14; y++) for (let x = 3; x < 13; x++) {
      const edge = y === 9 || x === 3 || x === 12 || y === 13;
      if (edge) { c.pxc(x, y, H(0x2e2e2e)); c.h(x, y, 0.55); }
      else { const g = (x & 1) === 0 && y < 12; c.pxc(x, y, g ? H(0x3a3a3a) : H(0x121212)); c.h(x, y, 0.1); c.s(x, y, 0.05, 0.04); }
    }
  });

  const CHEST_P = [H(0x8f5a1f), H(0x9c6424), H(0xa86d29), H(0xb4782f)];
  function chestBase(c, latch, top) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.vnoise(x * 0.3, y * 2, 8, 3) * 0.6 + c.hashp(x, y) * 0.4;
      let col = pal(CHEST_P, n), h = 0.65;
      const lo = top ? 1 : 2;
      const border = x <= 1 || x >= 14 || y <= lo || y >= 14;
      if (border) { col = mix(col, H(0x3b2410), x === 1 || x === 14 || y === lo || y === 14 ? 0.8 : 0.3); h = 0.8; }
      if (!top && (y === 7 || y === 8)) { col = mix(col, H(0x3b2410), y === 7 ? 0.8 : 0.4); h = y === 7 ? 0.3 : 0.8; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.2, 0.04);
    }
    if (latch) {
      for (let y = 5; y < 10; y++) for (let x = 7; x < 9; x++) {
        const e = y === 5 || y === 9;
        c.pxc(x, y, e ? H(0x4a4a4a) : H(0xc8c8c8)); c.h(x, y, 1.0); c.s(x, y, 0.6, 0.9);
      }
    }
  }
  T.define('chest_front', (c) => chestBase(c, true, false));
  T.define('chest_side', (c) => chestBase(c, false, false));
  T.define('chest_top', (c) => chestBase(c, false, true));

  T.define('tnt_side', (c) => {
    const L = ['###.#..#.###', '.#..##.#..#.', '.#..#.##..#.', '.#..#..#..#.', '.#..#..#..#.'];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let col, h = 0.6;
      if (y >= 5 && y <= 10) { col = mix(H(0xe8e8e0), H(0xd0d0c8), c.hashp(x, y)); h = 0.75; }
      else { col = mix(H(0xb3261e), H(0xd83a2a), c.hashp(x, y) * 0.5 + ((x & 3) === 0 ? 0 : 0.4)); if ((x & 3) === 0) { col = mix(col, H(0x6a1410), 0.6); h = 0.3; } }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.1, 0.03);
    }
    for (let r = 0; r < 5; r++) for (let i = 0; i < 12; i++) if (L[r][i] === '#') { c.pxc(i + 2, r + 6, H(0x1a1a1a)); c.h(i + 2, r + 6, 0.4); }
  });
  T.define('tnt_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5);
      let col = mix(H(0xb3261e), H(0xd83a2a), c.hashp(x, y));
      if (Math.min(x, y, 15 - x, 15 - y) === 0) col = mix(col, H(0x6a1410), 0.5);
      if (r < 3) col = mix(H(0x9a9a92), H(0xc8c8c0), c.hashp(x, y, 3));
      if (r < 1.2) col = H(0x2a2a2a);
      c.pxc(x, y, col); c.h(x, y, r < 3 ? 0.8 : 0.6);
    }
  });
  T.define('tnt_bottom', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { c.pxc(x, y, mix(H(0x8f1f18), H(0xa82a20), c.hashp(x, y))); c.h(x, y, 0.6); }
  });
  T.define('spawner', { cutout: true, normal: 1.4 }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const bar = x % 5 === 0 || y % 5 === 0;
      if (!bar) { c.px(x, y, 0, 0, 0, 0); c.h(x, y, 0.2); continue; }
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const v = 0.14 + c.hashp(x, y) * 0.08 + (edge ? 0.06 : 0);
      c.px(x, y, v * 0.9, v, v * 1.3, 1); c.h(x, y, 0.8); c.s(x, y, 0.55, 0.6);
    }
  });
  T.define('iron_bars', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const vb = x === 1 || x === 2 || x === 7 || x === 8 || x === 13 || x === 14;
      const hb = y === 1 || y === 14;
      if (!vb && !hb) { c.px(x, y, 0, 0, 0, 0); continue; }
      const hi = x === 1 || x === 7 || x === 13 || y === 1;
      const v = hi ? 0.62 : 0.42;
      c.px(x, y, v, v, v * 1.02, 1); c.h(x, y, hi ? 1 : 0.8); c.s(x, y, 0.5, 0.8);
    }
  });
  T.define('glass_pane_edge', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { c.px(x, y, 0.78, 0.86, 0.9, 0.9); c.h(x, y, 0.8); c.s(x, y, 0.9, 0.04); }
  });
  const DOOR_P = [H(0x7a5530), H(0x876036), H(0x93693b), H(0x9e7442)];
  function doorBase(c, top) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const board = Math.floor(x / 4);
      const n = c.vnoise(x * 2, y * 0.3, 8, board) * 0.6 + MC.hash2(board, 3, c.seed) * 0.4;
      let col = pal(DOOR_P, n), h = 0.65;
      if ((x & 3) === 3) { col = mix(col, H(0x4a3219), 0.5); h = 0.35; }
      const e = Math.min(x, 15 - x);
      if (e <= 1 || (top ? y === 0 : y === 15)) { col = mix(pal(DOOR_P, 0.3), H(0x5a3c1f), e === 0 ? 0.5 : 0.2); h = 0.85; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.2, 0.04);
    }
    if (top) {
      for (const [x0, x1] of [[3, 7], [9, 13]]) for (let y = 3; y < 9; y++) for (let x = x0; x < x1; x++) { c.px(x, y, 0, 0, 0, 0); }
    } else {
      for (const [y0, y1] of [[2, 7], [9, 14]]) for (let y = y0; y < y1; y++) for (let x = 3; x < 13; x++) {
        const edge = y === y0 || x === 3; const low = y === y1 - 1 || x === 12;
        if (edge || low) { c.pxc(x, y, mix(c.get(x, y), edge ? H(0x2e1f10) : H(0xc09060), 0.4)); c.h(x, y, edge ? 0.3 : 0.9); }
      }
      c.pxc(12, 0, H(0x3a3a3a)); c.pxc(12, 1, H(0x3a3a3a)); c.pxc(13, 0, H(0x8a8a8a)); c.pxc(13, 1, H(0x8a8a8a));
      c.s(12, 0, 0.6, 0.8); c.s(13, 0, 0.6, 0.8); c.s(12, 1, 0.6, 0.8); c.s(13, 1, 0.6, 0.8);
    }
  }
  T.define('door_bottom', { cutout: true }, (c) => doorBase(c, false));
  T.define('door_top', { cutout: true }, (c) => doorBase(c, true));
  T.define('ladder', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rail = x === 2 || x === 3 || x === 12 || x === 13;
      const rung = (y % 4 === 2) && x > 3 && x < 12;
      if (!rail && !rung) { c.px(x, y, 0, 0, 0, 0); continue; }
      const col = pal(DOOR_P, c.hashp(x, y) * 0.5 + (x === 2 || x === 12 || rung ? 0.5 : 0.1));
      c.pxc(x, y, col); c.h(x, y, rung ? 0.8 : 0.9); c.s(x, y, 0.2, 0.04);
    }
  });
  const RED = [H(0x8f1e1e), H(0xa12424), H(0xb22b2b), H(0xbf3333)];
  T.define('bed_foot_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 5) * 0.5 + c.hashp(x, y) * 0.5;
      let col = pal(RED, n);
      if (x === 0 || x === 15 || y === 0) col = mix(col, H(0x5a1010), 0.5);
      c.pxc(x, y, col); c.h(x, y, 0.6 + n * 0.2); c.s(x, y, 0.08, 0.03, 0.2);
    }
  });
  T.define('bed_head_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 5) * 0.5 + c.hashp(x, y) * 0.5;
      let col = pal(RED, n), h = 0.6;
      if (y === 7 || y === 8) { col = mix(H(0xe8e8e8), H(0xffffff), n); h = 0.75; }
      if (y >= 9) { col = y >= 10 && y <= 14 && x >= 2 && x <= 13 ? mix(H(0xdedede), H(0xfafafa), n) : mix(H(0xcfcfcf), H(0xe6e6e6), n); h = y >= 10 && y <= 14 && x >= 2 && x <= 13 ? 0.95 : 0.7; }
      if (x === 0 || x === 15) col = mix(col, H(0x5a1010), 0.3);
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.08, 0.03, 0.2);
    }
  });
  T.define('bed_side', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.hashp(x, y);
      let col, h = 0.6;
      if (y >= 13) { col = pal(DOOR_P, n * 0.7); h = 0.7; if (y === 13) col = mix(col, H(0x3a2614), 0.4); }
      else if (y === 12) col = mix(pal(RED, n), H(0x5a1010), 0.5);
      else col = pal(RED, 0.3 + n * 0.6);
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.08, 0.03, 0.2);
    }
  });
  const WOOL_COL = { white: 0xe9ecec, orange: 0xf07613, yellow: 0xf8c627, lime: 0x70b919, light_blue: 0x3aafd9, red: 0xa12722, purple: 0x7a2aad, black: 0x1d1d21 };
  for (const k in WOOL_COL) {
    T.define('wool_' + k, { normal: 0.9 }, (c) => {
      const base = H(WOOL_COL[k]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = c.fbm(x, y, 8, 2, 3) * 0.5 + c.hashp(x, y) * 0.5;
        const weave = ((x + y * 3) % 4 === 0 ? -0.06 : 0) + ((x * 3 + y) % 5 === 0 ? 0.04 : 0);
        const k2 = 0.85 + n * 0.25 + weave;
        c.px(x, y, MC.clamp(base[0] * k2, 0, 1), MC.clamp(base[1] * k2, 0, 1), MC.clamp(base[2] * k2, 0, 1));
        c.h(x, y, 0.4 + n * 0.5); c.s(x, y, 0.05, 0.02, 0.35);
      }
    });
  }
  T.define('lantern_side', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) c.px(x, y, 0, 0, 0, 0);
    for (let y = 9; y < 16; y++) for (let x = 5; x < 11; x++) {
      const frame = x === 5 || x === 10 || y === 9 || y === 15 || y === 10;
      if (frame) { const v = 0.18 + c.hashp(x, y) * 0.06; c.px(x, y, v, v, v * 1.1); c.h(x, y, 0.9); c.s(x, y, 0.45, 0.6); }
      else { const g = 0.8 + c.hashp(x, y) * 0.2; c.px(x, y, 1.0 * g, 0.78 * g, 0.38 * g); c.h(x, y, 0.6); c.s(x, y, 0.4, 0.04, 0, 1.0); }
    }
    for (let y = 7; y < 9; y++) for (let x = 6; x < 10; x++) { const v = 0.2 + c.hashp(x, y) * 0.05; c.px(x, y, v, v, v * 1.1); c.h(x, y, 0.9); c.s(x, y, 0.45, 0.6); }
  });
  T.define('lantern_top', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const inR = x >= 5 && x <= 10 && y >= 5 && y <= 10;
      if (!inR) { c.px(x, y, 0, 0, 0, 0); continue; }
      const hole = x >= 7 && x <= 8 && y >= 7 && y <= 8;
      const v = hole ? 0.08 : 0.2 + c.hashp(x, y) * 0.06;
      c.px(x, y, v, v, v * 1.1); c.h(x, y, hole ? 0.3 : 0.9); c.s(x, y, 0.45, 0.6);
    }
  });
  T.define('chain', { cutout: true }, (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const on = (x === 7 || x === 8) && ((y % 4 !== 3) || x === 7);
      if (!on) { c.px(x, y, 0, 0, 0, 0); continue; }
      const v = (y % 4 === 0 ? 0.45 : 0.3) + c.hashp(x, y) * 0.05;
      c.px(x, y, v, v, v * 1.1); c.h(x, y, 0.8); c.s(x, y, 0.5, 0.7);
    }
  });
  const HAY = [H(0xa88a1c), H(0xbd9c22), H(0xcfae2d), H(0xdcbd3e), H(0xe6cc56)];
  T.define('hay_side', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.vnoise(x * 2.5, y * 0.25, 16, 3) * 0.6 + c.hashp(x, y) * 0.4;
      let col = pal(HAY, n), h = 0.4 + n * 0.5;
      if (y === 3 || y === 4 || y === 11 || y === 12) { col = mix(col, H(0x7a4a14), 0.55); h = 0.8; }
      c.pxc(x, y, col); c.h(x, y, h); c.s(x, y, 0.1, 0.03, 0.2);
    }
  });
  T.define('hay_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5);
      const n = c.hashp(x, y) * 0.6 + (Math.floor(r) % 2) * 0.3;
      let col = pal(HAY, n);
      if (Math.min(x, y, 15 - x, 15 - y) === 0) col = mix(col, H(0x7a4a14), 0.4);
      c.pxc(x, y, col); c.h(x, y, 0.3 + n * 0.6); c.s(x, y, 0.1, 0.03, 0.2);
    }
  });
  const PUMP = [H(0xb35a0c), H(0xc76a12), H(0xd97a18), H(0xe38a22), H(0xec9a36)];
  function pumpkinSide(c) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const rib = x % 5 === 0;
      const n = c.vnoise(x, y * 0.3, 8, 5) * 0.5 + c.hashp(x, y) * 0.3 + (rib ? 0 : 0.2 + Math.sin((x % 5) / 5 * Math.PI) * 0.2);
      let col = pal(PUMP, MC.clamp(n, 0, 0.99));
      if (rib) col = mix(col, H(0x7a3a06), 0.5);
      c.pxc(x, y, col); c.h(x, y, rib ? 0.3 : 0.6 + n * 0.3); c.s(x, y, 0.3, 0.04, 0.1);
    }
  }
  T.define('pumpkin_side', pumpkinSide);
  T.define('pumpkin_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = Math.atan2(y - 7.5, x - 7.5), r = Math.hypot(x - 7.5, y - 7.5);
      const rib = Math.abs(Math.sin(a * 4)) < 0.2 && r > 2;
      let col = pal(PUMP, c.hashp(x, y) * 0.6 + 0.2);
      if (rib) col = mix(col, H(0x7a3a06), 0.45);
      if (r < 1.6) col = mix(H(0x4a6a1a), H(0x6a8a2a), c.hashp(x, y, 4));
      c.pxc(x, y, col); c.h(x, y, r < 1.6 ? 1 : rib ? 0.35 : 0.65); c.s(x, y, 0.3, 0.04);
    }
  });
  T.define('jack_o_lantern', (c) => {
    pumpkinSide(c);
    const face = [
      '................', '................', '................', '................',
      '...##......##...', '..####....####..', '..####....####..', '................',
      '................', '..#..........#..', '..###.####.###..', '...##########...', '....###..###....', '................',
    ];
    for (let y = 0; y < face.length; y++) for (let x = 0; x < 16; x++) if (face[y][x] === '#') {
      const g = 0.85 + c.hashp(x, y) * 0.15;
      c.px(x, y, 1.0 * g, 0.82 * g, 0.3 * g); c.h(x, y, 0.2); c.s(x, y, 0.2, 0.04, 0, 1.0);
    }
  });
  const MEL = [H(0x3a6a12), H(0x4a7e18), H(0x5a9020), H(0x6aa22a), H(0x86b83a)];
  T.define('melon_side', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const stripe = (x + Math.floor(c.vnoise(x, y, 4, 2) * 3)) % 4 === 0;
      const n = c.hashp(x, y) * 0.5 + (stripe ? 0 : 0.45);
      c.pxc(x, y, pal(MEL, n)); c.h(x, y, stripe ? 0.4 : 0.7); c.s(x, y, 0.35, 0.04);
    }
  });
  T.define('melon_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - 7.5, y - 7.5);
      const n = c.hashp(x, y) * 0.5 + (Math.floor(r * 0.8) % 2) * 0.35;
      c.pxc(x, y, pal(MEL, n)); c.h(x, y, 0.5 + n * 0.3); c.s(x, y, 0.35, 0.04);
    }
  });
  T.define('farmland_top', { normal: 1.3 }, (c) => {
    const P = [H(0x3b2616), H(0x45301c), H(0x503821), H(0x5a4127)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 7) * 0.5 + c.hashp(x, y) * 0.5;
      const furrow = y % 4 === 0;
      let col = pal(P, n);
      if (furrow) col = mix(col, H(0x24160c), 0.6);
      c.pxc(x, y, col); c.h(x, y, furrow ? 0.2 : 0.55 + n * 0.3); c.s(x, y, 0.25, 0.03);
    }
  });
  const PATH = [H(0x8a6e42), H(0x957948), H(0xa0844f), H(0xab8f58)];
  T.define('path_top', (c) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = c.fbm(x, y, 4, 2, 11) * 0.5 + c.hashp(x, y) * 0.5;
      let col = pal(PATH, n);
      if (c.hashp(x, y, 21) < 0.06) col = mix(col, H(0x77705f), 0.6);
      c.pxc(x, y, col); c.h(x, y, 0.45 + n * 0.3); c.s(x, y, 0.06, 0.03);
    }
  });
  T.define('path_side', (c) => {
    dirtBase(c);
    for (let x = 0; x < S; x++) for (let y = 0; y < 3; y++) { c.pxc(x, y, pal(PATH, c.hashp(x, y))); c.h(x, y, 0.7); }
  });
  function cropArt(c, stage) {
    plantClear(c);
    const stalkG = [H(0x3f8a2a), H(0x5aa032), H(0x8fae3a), H(0xb89a3a)][stage];
    const headG = [H(0x5aa032), H(0x7aa83a), H(0xb0a044), H(0xc8a24a)][stage];
    const hgt = [4, 8, 12, 14][stage];
    for (let b = 0; b < 7; b++) {
      let x = 1 + ((b * 5 + 2) % 14);
      const hh = hgt - Math.floor(c.rand() * 3);
      for (let i = 0; i < hh; i++) {
        const y = 15 - i;
        const top = i >= hh - (stage >= 2 ? 4 : 1);
        const col = top ? headG : stalkG;
        c.pxc(x, y, mix(col, H(0x000000), c.rand() * 0.15)); c.h(x, y, 0.4 + i / hh * 0.6);
        if (top && stage === 3) { c.pxc(x + 1, y, mix(headG, H(0x8a6a1a), 0.3)); c.h(x + 1, y, 0.8); }
        if (c.rand() < 0.15) x = MC.clamp(x + (c.rand() < 0.5 ? -1 : 1), 0, 14);
      }
    }
  }
  for (let st = 0; st < 4; st++) T.define('wheat_' + st, { cutout: true }, (c) => cropArt(c, st));
  function sapling(c, trunk, leafP) {
    plantClear(c);
    for (let y = 9; y < 16; y++) { c.pxc(7, y, trunk); c.pxc(8, y, mix(trunk, H(0x000000), 0.2)); c.h(7, y, 0.7); c.h(8, y, 0.7); }
    for (let y = 1; y < 11; y++) for (let x = 2; x < 14; x++) {
      const d = Math.hypot((x - 7.5) * 1.1, (y - 5.5) * 1.2);
      if (d < 5 + c.hashp(x, y) * 1.5 && c.hashp(x, y, 9) > 0.2) { c.pxc(x, y, pal(leafP, c.hashp(x, y, 3))); c.h(x, y, 0.5 + c.hashp(x, y) * 0.5); c.s(x, y, 0.25, 0.03, 0.8); }
    }
  }
  T.define('oak_sapling', { cutout: true }, (c) => sapling(c, H(0x6b4f2c), [H(0x3f7a22), H(0x4f8f2a), H(0x5fa032)]));
  T.define('birch_sapling', { cutout: true }, (c) => sapling(c, H(0xd8d6cf), [H(0x5f8f3a), H(0x70a044), H(0x82b050)]));
  T.define('spruce_sapling', { cutout: true }, (c) => {
    plantClear(c);
    for (let y = 11; y < 16; y++) { c.pxc(7, y, H(0x3b2a18)); c.pxc(8, y, H(0x2b1e10)); }
    for (let y = 1; y < 13; y++) {
      const w = Math.floor((y % 4 + y / 3) * 0.9);
      for (let x = 7 - w; x <= 8 + w; x++) if (x >= 0 && x < 16 && c.hashp(x, y, 4) > 0.15) { c.pxc(x, y, pal([H(0x21452a), H(0x2c5a35), H(0x386a40)], c.hashp(x, y))); c.h(x, y, 0.6); c.s(x, y, 0.25, 0.03, 0.8); }
    }
  });
  T.define('cobweb', { cutout: true }, (c) => {
    plantClear(c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const spoke = Math.abs(Math.sin(a * 4)) < 0.12 + 0.3 / (r + 1);
      const ring = Math.abs(r - 3) < 0.45 || Math.abs(r - 6) < 0.45 || Math.abs(r - 8.6) < 0.5;
      if ((spoke || ring) && c.hashp(x, y, 5) > 0.12) { const v = 0.82 + c.hashp(x, y) * 0.15; c.px(x, y, v, v, v); c.h(x, y, 0.7); c.s(x, y, 0.3, 0.03, 0.3); }
    }
  });
  T.define('emerald_ore', (c) => ore(c, [H(0x17a54a), H(0x41d97a), H(0x9ff5c0)], 4, 0.9, 0.15, 0.04));
  T.define('emerald_block', (c) => metal(c, [H(0x0f8a3a), H(0x17a54a), H(0x2cc462), H(0x41d97a), H(0x80f0a8)], 0.86, 0.17, true));
  T.define('coal_block', (c) => metal(c, [H(0x111111), H(0x181818), H(0x202020), H(0x2a2a2a), H(0x353535)], 0.3, 0.04, true));
  T.define('sugar_cane', { cutout: true }, (c) => {
    plantClear(c);
    const P = [H(0x6a9a2c), H(0x7fb238), H(0x96c44a), H(0xaad26b)];
    for (const x0 of [2, 7, 12]) {
      const off = x0 * 3;
      for (let y = 0; y < 16; y++) {
        const node = (y + off) % 5 === 0;
        c.pxc(x0, y, pal(P, node ? 0.9 : 0.35 + c.hashp(x0, y) * 0.3)); c.pxc(x0 + 1, y, pal(P, node ? 0.7 : 0.15 + c.hashp(x0 + 1, y) * 0.2));
        c.h(x0, y, node ? 1 : 0.7); c.h(x0 + 1, y, node ? 0.9 : 0.6);
        c.s(x0, y, 0.3, 0.03, 0.4); c.s(x0 + 1, y, 0.3, 0.03, 0.4);
      }
      c.pxc(x0 - 1, (off + 3) % 16, P[1]); c.pxc(x0 + 2, (off + 8) % 16, P[1]);
    }
  });
  T.define('brown_mushroom', { cutout: true }, (c) => T.art(c, [
    '', '', '', '', '', '', '',
    '.....bbbbbb.....', '....bBBBBBBb....', '....bBBBBBBb....', '.....bbbbbb.....',
    '.......ss.......', '.......ss.......', '.......ss.......', '.......Ss.......', '.......Ss.......',
  ], { b: 0x8a6446, B: 0xa47b56, s: 0xd8d0c0, S: 0xb8b0a0 }));
  T.define('red_mushroom', { cutout: true }, (c) => T.art(c, [
    '', '', '', '', '', '',
    '.....rrrrrr.....', '....rrwrrrwr....', '...rrrrrrwrrr...', '...rwrrrrrrrr...', '....rrrrrrrr....',
    '.......ss.......', '.......ss.......', '.......ss.......', '.......Ss.......', '.......Ss.......',
  ], { r: 0xc42a22, w: 0xf0e8e0, s: 0xd8d0c0, S: 0xb8b0a0 }));
  T.define('cornflower', { cutout: true }, (c) => flower(c, H(0x4a6ee0), H(0x2a44a8), H(0x8aa6ff)));
  T.define('oxeye_daisy', { cutout: true }, (c) => flower(c, H(0xf2f2f2), H(0xc8c8c8), H(0xf5c21a)));
  T.define('allium', { cutout: true }, (c) => {
    plantClear(c);
    for (let y = 7; y < 16; y++) c.pxc(7, y, H(0x3f8a2a));
    c.pxc(6, 12, H(0x4f9a33)); c.pxc(8, 11, H(0x4f9a33));
    for (let y = 1; y < 8; y++) for (let x = 4; x < 11; x++) {
      const d = Math.hypot(x - 7, y - 4);
      if (d < 3.3 && c.hashp(x, y) > 0.1) { c.pxc(x, y, pal([H(0x8a3ab8), H(0xa85ad0), H(0xc07ae0)], c.hashp(x, y, 2))); c.h(x, y, 1 - d * 0.15); }
    }
  });
  T.define('fern', { cutout: true }, (c) => {
    plantClear(c);
    const leaf = (x0, dir, len, y0) => {
      let x = x0, y = y0;
      for (let i = 0; i < len; i++) {
        const v = 0.5 + i / len * 0.35;
        c.px(x, y, v, v, v, 1); c.h(x, y, 0.5 + i / len * 0.4);
        if (i % 2 === 1) { c.px(x, y - 1, v * 0.9, v * 0.9, v * 0.9, 1); }
        x += dir; if (i % 2 === 0) y--;
      }
    };
    leaf(7, -1, 7, 15); leaf(8, 1, 7, 15); leaf(7, 0, 12, 15); leaf(6, -1, 5, 11); leaf(9, 1, 5, 11);
  });

  // ------------------------------------------------------------------ overlays / particles
  // crack overlay: alpha stores the break progress at which a crack pixel appears (0 = never)
  T.define('destroy', (c) => {
    plantClear(c);
    const rnd = c.rand;
    for (let k = 0; k < 9; k++) {
      let x = 7.5, y = 7.5;
      const a = k / 9 * Math.PI * 2 + rnd() * 0.5;
      let dx = Math.cos(a), dy = Math.sin(a);
      for (let i = 0; i < 12; i++) {
        const ix = Math.floor(x), iy = Math.floor(y);
        if (ix < 0 || iy < 0 || ix > 15 || iy > 15) break;
        const t = MC.clamp(0.08 + i * 0.075 + k * 0.004, 0.05, 0.98);
        const cur = c.get(ix, iy)[3];
        if (!cur || cur > t) c.px(ix, iy, 0.1, 0.1, 0.1, t);
        x += dx; y += dy;
        dx += (rnd() - 0.5) * 0.6; dy += (rnd() - 0.5) * 0.6;
        const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      }
    }
  });
  T.define('particle_smoke', { cutout: true }, (c) => T.art(c, [
    '', '', '',
    '.....aaaaa......', '...aabbbbbaa....', '..abbbccccbba...', '..abbccccccba...', '.abbccddccccba..',
    '.abbcddddcccba..', '.abbccddccccba..', '..abbccccccba...', '..abbbccccbba...', '...aabbbbbaa....', '.....aaaaa......',
  ], { a: 0x6a6a6a, b: 0x8a8a8a, c: 0xa6a6a6, d: 0xbdbdbd }));
  T.define('particle_flame', { cutout: true }, (c) => T.art(c, [
    '', '', '', '',
    '.......y........', '.......y........', '......yyy.......', '......yoy.......', '.....yooyy......',
    '.....yoOoy......', '....yoOWOoy.....', '....yoOWWOy.....', '....yoOWWOoy....', '.....yoOOoy.....', '......yooy......', '.......yy.......',
  ], { y: [0xffa21a, 0.5, 0.2, 0.04, 0, 1], o: [0xffc23a, 0.6, 0.2, 0.04, 0, 1], O: [0xffe27a, 0.8, 0.2, 0.04, 0, 1], W: [0xfff6d0, 1, 0.2, 0.04, 0, 1] }));
  T.define('particle_heart', { cutout: true }, (c) => T.art(c, [
    '', '', '',
    '...rrr...rrr....', '..rRRRr.rRRRr...', '.rRWRRRrRRRRRr..', '.rRRRRRRRRRRRr..', '.rRRRRRRRRRRRr..',
    '..rRRRRRRRRRr...', '...rRRRRRRRr....', '....rRRRRRr.....', '.....rRRRr......', '......rRr.......', '.......r........',
  ], { r: 0x8a0e0e, R: 0xe02a2a, W: 0xffc0c0 }));
  T.define('particle_crit', { cutout: true }, (c) => T.art(c, [
    '', '', '', '',
    '.......w........', '.......w........', '..w....w....w...', '...w...w...w....', '....w..w..w.....',
    '.....wwwww......', 'wwwwwwwWwwwwwww.', '.....wwwww......', '....w..w..w.....', '...w...w...w....', '..w....w....w...', '.......w........',
  ], { w: [0xcfe6ff, 0.8, 0.3, 0.04, 0, 0.6], W: [0xffffff, 1, 0.3, 0.04, 0, 1] }));
  T.define('particle_bubble', { cutout: true }, (c) => T.art(c, [
    '', '', '', '', '',
    '......bbbb......', '.....bwwccb.....', '....bwccccbb....', '....bccccccb....', '....bccccccb....',
    '....bbccccbb....', '.....bbccbb.....', '......bbbb......',
  ], { b: [0x6aa8e0, 0.6, 0.9, 0.04], c: [0x9cd0f8, 0.4, 0.9, 0.04], w: [0xffffff, 0.9, 0.9, 0.04] }));
  T.define('particle_explosion', { cutout: true }, (c) => {
    plantClear(c);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) + (c.fbm(x, y, 4, 2, 3) - 0.5) * 5;
      if (d > 7.2) continue;
      const v = 0.55 + (1 - d / 7.2) * 0.35 + c.hashp(x, y) * 0.1;
      c.px(x, y, v, v * 0.97, v * 0.93, 1); c.h(x, y, 1 - d / 8); c.s(x, y, 0.05, 0.02);
    }
  });
  T.define('particle_spark', { cutout: true }, (c) => T.art(c, [
    '', '', '', '', '', '',
    '.......o........', '......oyo.......', '.....oyWyo......', '......oyo.......', '.......o........',
  ], { o: [0xffb040, 0.5, 0.2, 0.04, 0, 1], y: [0xffe070, 0.8, 0.2, 0.04, 0, 1], W: [0xffffff, 1, 0.2, 0.04, 0, 1] }));
})();
