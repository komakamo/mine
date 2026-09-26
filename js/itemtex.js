'use strict';
// Item sprites (16x16 pixel art). Sprites are written as fill-only character grids; a dark outline is
// generated automatically around every filled pixel (Minecraft-style item art).
(function () {
  const T = MC.TexGen, H = MC.col.hex;

  // grid helpers
  function grid(rows) {
    const g = new Array(256).fill(null);
    if (rows) for (let y = 0; y < 16; y++) {
      const r = rows[y] || '';
      for (let x = 0; x < 16; x++) { const ch = r[x]; if (ch && ch !== '.' && ch !== ' ') g[y * 16 + x] = ch; }
    }
    g.set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y * 16 + x] = ch; };
    return g;
  }
  // stick / handle: diagonal band from (x0, y0) up-right, n pixels
  function handle(g, x0, y0, n, a = 's', b = 'k') {
    for (let i = 0; i < n; i++) { g.set(x0 + i, y0 - i, a); g.set(x0 + i + 1, y0 - i, b); }
  }
  // pal: ch -> hex | [hex, smooth, f0, emit]; outl: ch -> outline hex (default outl._)
  function render(c, g, pal, outl = {}) {
    for (let i = 0; i < 256; i++) { c.px(i & 15, i >> 4, 0, 0, 0, 0); c.h(i & 15, i >> 4, 0.5); }
    const at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? null : g[y * 16 + x]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (at(x, y)) continue;
      const n = at(x, y - 1) || at(x - 1, y) || at(x + 1, y) || at(x, y + 1);
      if (!n || outl[n] === null) continue;
      const oc = outl[n] !== undefined ? outl[n] : outl._ !== undefined ? outl._ : 0x1a1a1a;
      if (oc === null) continue;
      c.pxc(x, y, H(oc)); c.h(x, y, 0.35); c.s(x, y, 0.1, 0.04);
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ch = at(x, y);
      if (!ch) continue;
      let e = pal[ch];
      if (e === undefined) e = 0xff00ff;
      if (!Array.isArray(e)) e = [e];
      const col = H(e[0]);
      c.pxc(x, y, col);
      c.h(x, y, 0.55 + 0.4 * (0.3 * col[0] + 0.55 * col[1] + 0.15 * col[2]));
      c.s(x, y, e[1] !== undefined ? e[1] : 0.2, e[2] !== undefined ? e[2] : 0.04, 0, e[3] || 0);
    }
  }
  const def = (name, fn) => T.define(name, { cutout: true, normal: 0.12 }, fn);
  const simple = (name, rows, pal, outl) => def(name, (c) => render(c, grid(rows), pal, outl));

  const STICK = { s: 0x8a6a3a, k: 0x5e4526 };
  const STICK_O = { s: 0x2e2012, k: 0x2e2012 };

  // ---------------------------------------------------------------- tools
  const MATS = {
    wooden: { M: 0xc49a5c, m: 0x9a7a4a, d: 0x6b4f2c, o: 0x2e2012, sm: 0.2, f0: 0.04 },
    stone: { M: 0xa8a8a8, m: 0x808080, d: 0x5c5c5c, o: 0x262626, sm: 0.25, f0: 0.04 },
    iron: { M: 0xffffff, m: 0xd8d8d8, d: 0x9a9a9a, o: 0x3a3a3a, sm: 0.7, f0: 0.3 },
    diamond: { M: 0xc8fff4, m: 0x4ae8d0, d: 0x1d9c8c, o: 0x0b3a35, sm: 0.9, f0: 0.17 },
  };
  const HEADS = {
    pickaxe: [
      '................',
      '...MMMMMMm......',
      '..MmmmmmmmMd....',
      '...dd....dmmd...',
      '..........dmMd..',
      '...........dmd..',
      '...........dmMd.',
      '............dMd.',
      '............dmd.',
      '.............d..',
    ],
    axe: [
      '................',
      '......mMM.......',
      '.....mMMMm......',
      '....mMMMMd......',
      '...mMMMmmd......',
      '...dmmmd........',
      '....ddd.........',
    ],
    shovel: [
      '................',
      '...........mMM..',
      '..........mMMMM.',
      '..........mMMMm.',
      '..........dmmmd.',
      '...........ddd..',
    ],
    hoe: [
      '................',
      '.......MMMMm....',
      '......MmmmmMd...',
      '...........md...',
      '................',
    ],
  };
  for (const mat in MATS) {
    const P = MATS[mat];
    const pal = {
      M: [P.M, P.sm, P.f0], m: [P.m, P.sm, P.f0], d: [P.d, P.sm, P.f0], s: STICK.s, k: STICK.k,
    };
    const outl = { M: P.o, m: P.o, d: P.o, s: STICK_O.s, k: STICK_O.k };
    for (const t in HEADS) {
      def(mat + '_' + t, (c) => {
        const g = grid();
        if (t === 'pickaxe') handle(g, 2, 13, 8);
        else if (t === 'axe') handle(g, 2, 13, 8);
        else if (t === 'shovel') handle(g, 2, 13, 8);
        else handle(g, 2, 13, 9);
        const head = grid(HEADS[t]);
        for (let i = 0; i < 256; i++) if (head[i]) g[i] = head[i];
        render(c, g, pal, outl);
      });
    }
    def(mat + '_sword', (c) => {
      const g = grid();
      // blade: 3 px wide band along the anti-diagonal, light edge on top
      for (let y = 1; y <= 9; y++) { g.set(14 - y, y, 'M'); g.set(15 - y, y, 'm'); g.set(16 - y, y, 'd'); }
      g.set(15, 0, 'M'); g.set(14, 0, 'M'); g.set(15, 1, 'm');
      // guard
      for (let i = -2; i <= 2; i++) g.set(5 + i, 10 + i, 'g');
      // grip + pommel
      for (let i = 0; i < 4; i++) g.set(4 - i, 11 + i, i % 2 ? 'k' : 's');
      g.set(0, 15, 'p');
      const pal2 = Object.assign({}, pal, { g: mat === 'wooden' ? STICK.k : P.d, p: mat === 'wooden' ? STICK.s : P.m });
      render(c, g, pal2, Object.assign({}, outl, { g: 0x1e1e1e, p: 0x1e1e1e }));
    });
  }

  // ---------------------------------------------------------------- materials
  def('stick', (c) => { const g = grid(); handle(g, 3, 13, 10); render(c, g, STICK, STICK_O); });
  const LUMP = [
    '................', '................', '................', '......cC........', '....cCCWcc......',
    '...cCCCCccc.....', '...cCCcccccc....', '..cccccccccdc...', '..ccccccccddd...', '...cccccccddd...',
    '...cccccddd.....', '....ccdddd......', '......dd........',
  ];
  simple('coal', LUMP, { C: 0x4a4a4a, W: 0x6e6e6e, c: 0x2a2a2a, d: 0x151515 }, { _: 0x050505 });
  simple('charcoal', LUMP, { C: 0x4a3c30, W: 0x6a5a48, c: 0x2e241c, d: 0x1a140e }, { _: 0x0a0806 });
  const INGOT = [
    '................', '................', '................', '................', '................',
    '.....MMMMMMM....', '....MMWWMMMmd...', '...MMMMMMMmdd...', '..mmmmmmmmddd...', '..mmmmmmmmdd....',
    '..ddddddddd.....',
  ];
  simple('iron_ingot', INGOT, { M: [0xe6e6e6, 0.7, 0.3], W: [0xffffff, 0.8, 0.3], m: [0xbdbdbd, 0.7, 0.3], d: [0x8a8a8a, 0.6, 0.3] }, { _: 0x3a3a3a });
  simple('gold_ingot', INGOT, { M: [0xfad64a, 0.8, 0.3], W: [0xfff5b0, 0.9, 0.3], m: [0xe8b020, 0.8, 0.3], d: [0xb07810, 0.7, 0.3] }, { _: 0x5a3a08 });
  simple('diamond', [
    '................', '................', '................', '.....cccccc.....', '....cWWccccd....',
    '...cWccccccdd...', '..cccccccccddd..', '...dcccccccdd...', '....dccccccd....', '.....dccccd.....',
    '......dccd......', '.......dd.......',
  ], { W: [0xe8fffb, 0.95, 0.17, 0.1], c: [0x4ae8d0, 0.95, 0.17], d: [0x1d9c8c, 0.9, 0.17] }, { _: 0x0b3a35 });
  simple('emerald', [
    '................', '................', '.......gg.......', '......gWgg......', '.....gWgggg.....',
    '.....gWgggd.....', '....ggggggdd....', '....ggggggdd....', '....gggggddd....', '.....ggggdd.....',
    '.....gggddd.....', '......ggdd......', '.......dd.......',
  ], { W: [0xc0ffd8, 0.95, 0.17, 0.1], g: [0x41d97a, 0.95, 0.17], d: [0x17a54a, 0.9, 0.17] }, { _: 0x06401c });
  simple('flint', [
    '................', '................', '................', '.......ff.......', '......fFff......',
    '.....fFFfff.....', '....fFFffffd....', '....fFffffdd....', '...ffffffddd....', '...fffffddd.....',
    '....ffffdd......', '.....fddd.......',
  ], { F: 0x6a6a72, f: 0x3e3e46, d: 0x24242a }, { _: 0x0e0e12 });
  simple('string', [
    '................', '................', '..........ww....', '.........w..w...', '.........w......',
    '..........w.....', '...........w....', '..........w.....', '.......www......', '......w.........',
    '.....w..........', '......w.........', '.......ww.......', '.........w......',
  ], { w: 0xf0f0f0 }, { _: null });
  simple('feather', [
    '................', '.............ww.', '...........wwWw.', '..........wwWwg.', '.........wwWwg..',
    '........wwWwg...', '.......wwWwg....', '......wwWwg.....', '.....wwWwg......', '.....wWwg.......',
    '....wWgg........', '...sW...........', '..s.............', '.s..............',
  ], { w: 0xe8e8e8, W: 0xffffff, g: 0xb8b8c0, s: 0x9a9a9a }, { _: 0x3a3a40, s: null });
  simple('leather', [
    '................', '................', '...ll....ll.....', '...lLLllLLll....', '....lLLLLLLl....',
    '....lLLLLLLl....', '...lLLLLLLLll...', '...lLLLLLLLLl...', '...lLLLLLLLdl...', '....lLLLLLdl....',
    '....lLLLLLdl....', '...lldLLLddll...', '...ll.lll..ll...',
  ], { l: 0x7a4a24, L: 0x9c6230, d: 0x6a3e1c }, { _: 0x2a160a });
  simple('bone', [
    '................', '...........bb...', '..........bWWb..', '..........bWWbb.', '.........WWbbb..',
    '........WWb.....', '.......WWb......', '......WWb.......', '.....WWb........', '....WWb.........',
    '..bbWb..........', '.bWWbb..........', '..bWbb..........', '...bb...........',
  ], { W: 0xf4f0e0, b: 0xcfc8b0 }, { _: 0x4a4638 });
  const PILE = [
    '................', '................', '................', '................', '................',
    '................', '.......pp.......', '.....pPPpp......', '....pPPPpppp....', '...pPPppppppp...',
    '..pppppppppppd..', '..ppppppppppdd..', '...pppppppddd...',
  ];
  simple('bone_meal', PILE, { P: 0xffffff, p: 0xe6e2d6, d: 0xbdb8a8 }, { _: 0x5a5648 });
  simple('gunpowder', PILE.map((r, y) => r.replace(/p/g, (m, x) => ((x * 7 + y * 3) % 5 === 0 ? 'k' : 'p'))), { P: 0x9a9a9a, p: 0x6a6a6a, d: 0x4a4a4a, k: 0x2a2a2a }, { _: 0x1a1a1a });
  simple('paper', [
    '................', '................', '...wwwwwwwww....', '...wWWWWWWWw....', '...wWgggggWw....',
    '...wWWWWWWWw....', '...wWgggggWw....', '...wWWWWWWWw....', '...wWggggWWw....', '...wWWWWWWWw....',
    '...wWgggggWw....', '...wWWWWWWWw....', '...wwwwwwwww....',
  ], { w: 0xd8d4c4, W: 0xf6f2e4, g: 0xb8b4a4 }, { _: 0x5a5648 });
  simple('book', [
    '................', '................', '....bbbbbbbbb...', '...bBBBBBBBBpw..', '...bBBBBBBBBpw..',
    '...bBBggggBBpw..', '...bBBBBBBBBpw..', '...bBBBBBBBBpw..', '...bBBBBBBBBpw..', '...bBBBBBBBBpw..',
    '...bBBBBBBBBpw..', '...bbbbbbbbbpw..', '....dddddddddd..',
  ], { b: 0x5a2a14, B: 0x7a3a1c, g: 0xd8b040, p: 0xf0ece0, w: 0xd0ccc0, d: 0x3a1a0a }, { _: 0x1e0e06 });
  simple('wheat', [
    '................', '.........y..y...', '......y..Yy.yY..', '.....yYy.yY.Yy..', '......Yy.Yy.y...',
    '......yY.yY.Y...', '.......y.Yy.y...', '.......s.s..s...', '........sss.s...', '........ssss....',
    '.........ss.....', '........ssss....', '.......ss..ss...', '......s......s..',
  ], { y: 0xc8a04a, Y: 0xe8c86a, s: 0x9a8a3a }, { _: 0x4a3a14 });
  simple('wheat_seeds', [
    '................', '................', '................', '................', '................',
    '.....g....s.....', '....gG...sS.....', '....g.....s.....', '........g.......', '..s....gG....g..',
    '..sS....g...gG..', '..s..........g..', '......s.........', '......sS........',
  ], { g: 0x3f8a2a, G: 0x6ab83a, s: 0x7a8a2a, S: 0xa8b848 }, { _: null });
  simple('arrow', [
    '................', '............ttt.', '............tTt.', '............ttt.', '...........s....',
    '..........s.....', '.........s......', '........s.......', '.......s........', '......s.........',
    '..f..s..........', '..ffs...........', '...fff..........', '..f.f...........', '.f..............',
  ], { t: 0x6a6a72, T: 0xa8a8b0, s: 0x8a6a3a, f: 0xe8e8e8 }, { _: 0x1e1e22, s: 0x2e2012 });
  simple('bow', [
    '................', '...bbbb.........', '....ssbbb.......', '....s...bb......', '.....s...bb.....',
    '......s...b.....', '.......s...b....', '........s..b....', '.........s.b....', '..........sb....',
    '...........b....', '..........b.....', '.........bb.....', '........bb......', '.......bb.......',
  ], { b: 0x8a6030, s: 0xe8e8e8 }, { _: 0x2e1c0c, s: null });
  simple('flint_and_steel', [
    '................', '................', '...mmmmm........', '..mMMMMMm.......', '..mM...Mm.......',
    '..mM....m.......', '..mM............', '..mM.......ff...', '..mMm.....fFff..', '...mm....fFfff..',
    '.........ffffd..', '..........fdd...',
  ], { m: [0x8a8a8a, 0.6, 0.3], M: [0xd0d0d0, 0.7, 0.3], f: 0x3e3e46, F: 0x6a6a72, d: 0x24242a }, { _: 0x1e1e1e });
  simple('compass', [
    '................', '................', '.....oooooo.....', '....oMMMMMMo....', '...oMwwwwwwMo...',
    '...oMwwwrwwMo...', '...oMwwrRwwMo...', '...oMwwrwwwMo...', '...oMwwWwwwMo...', '...oMwWwwwwMo...',
    '...oMwwwwwwMo...', '....oMMMMMMo....', '.....oooooo.....',
  ], { o: [0x5a5a5a, 0.5, 0.3], M: [0xa8a8a8, 0.7, 0.3], w: 0xe8e0c8, r: 0xc42020, R: 0xff4040, W: 0x9a9a9a }, { _: 0x1e1e1e });
  const BUCKET = [
    '................', '................', '................', '...mmmmmmmmmm...', '..mMLLLLLLLLMm..',
    '..mMLLLLLLLLMm..', '...mMMMMMMMMm...', '...mMMMMMMMmm...', '...mMMMMMMMdm...', '....mMMMMMMd....',
    '....mMMMMMmd....', '....mmmmmmmd....', '.....dddddd.....',
  ];
  const bucketPal = (L, emit = 0) => ({ m: [0x8a8a8a, 0.6, 0.3], M: [0xc8c8c8, 0.7, 0.3], d: [0x5a5a5a, 0.5, 0.3], L: [L, 0.9, 0.04, emit] });
  simple('bucket', BUCKET.map((r) => r.replace(/L/g, 'd')), bucketPal(0), { _: 0x262626 });
  simple('water_bucket', BUCKET, bucketPal(0x3a6ae8), { _: 0x262626 });
  simple('lava_bucket', BUCKET, bucketPal(0xff8a1a, 0.9), { _: 0x262626 });

  // ---------------------------------------------------------------- food
  const APPLE = [
    '................', '........k.......', '.......k.gg.....', '.......kgG......', '....rrrkrrr.....',
    '...rRRrrrrrr....', '..rRWRrrrrrrr...', '..rRRrrrrrrrr...', '..rrrrrrrrrrd...', '..rrrrrrrrrdd...',
    '...rrrrrrrdd....', '...rrrrrrddd....', '....rrrdddd.....', '.....rr..dd.....',
  ];
  simple('apple', APPLE, { k: 0x5a3a1a, g: 0x3f8a2a, G: 0x6ab83a, r: 0xd02a1a, R: 0xf05a3a, W: 0xffc0a0, d: 0x9a1a10 }, { _: 0x3a0806, k: 0x1e1008, g: 0x163a0e, G: 0x163a0e });
  simple('golden_apple', APPLE, { k: 0x5a3a1a, g: 0x3f8a2a, G: 0x6ab83a, r: [0xf0c030, 0.8, 0.3, 0.15], R: [0xfff080, 0.85, 0.3, 0.2], W: [0xffffff, 0.9, 0.3, 0.3], d: [0xc08010, 0.8, 0.3, 0.1] }, { _: 0x5a3a06, k: 0x1e1008, g: 0x163a0e, G: 0x163a0e });
  simple('bread', [
    '................', '................', '................', '................', '................',
    '.....bbbbbbb....', '...bbBBbBBbBb...', '..bBBbBBbBBbBb..', '..bBbBBbBBbBbbb.', '.bbbbbbbbbbbbbd.',
    '.dbbbbbbbbbbbdd.', '..ddddddddddd...',
  ], { b: 0xb07a30, B: 0xd8a050, d: 0x7a4a18 }, { _: 0x3a2008 });
  const CHOP = [
    '................', '................', '................', '......pppp......', '....ppPPPPpp....',
    '...pPPPPPPPPp...', '..pPPWPPPPPPPp..', '..pPPPPPPPPPPp..', '..pPPPPPPPPPpp..', '...pPPPPPPPpff..',
    '....ppPPPpfff...', '......ppfff.....',
  ];
  simple('porkchop', CHOP, { p: 0xd06a6a, P: 0xf09a9a, W: 0xffd0d0, f: 0xf8e8e0 }, { _: 0x5a1e1e });
  simple('cooked_porkchop', CHOP, { p: 0x8a4a20, P: 0xb87038, W: 0xe0a060, f: 0xe8d0a0 }, { _: 0x3a1a08 });
  const STEAK = [
    '................', '................', '................', '.....rrrrrr.....', '...rrRRRRRRrr...',
    '..rRRWRRfRRRRr..', '..rRRRRffRRRRr..', '..rRRRRRRRRRrr..', '..rrRRRRRRRRr...', '...rrRRRRRrrf...',
    '....rrrrrrrff...', '.......ffff.....',
  ];
  simple('beef', STEAK, { r: 0xa81e1e, R: 0xd83a3a, W: 0xff8a8a, f: 0xf0e0d8 }, { _: 0x4a0808 });
  simple('cooked_beef', STEAK, { r: 0x5a3018, R: 0x8a4a24, W: 0xb87040, f: 0xd8c098 }, { _: 0x24120a });
  const BIRD = [
    '................', '................', '................', '.....cccc.......', '....cCCCCcc.....',
    '...cCCWCCCCc....', '...cCCCCCCCc....', '...cCCCCCCCcb...', '....cCCCCCcbbb..', '.....ccCccbbbb..',
    '.......cc..bb...', '..........bbb...', '..........b.b...',
  ];
  simple('chicken', BIRD, { c: 0xe0a8a0, C: 0xf8d8d0, W: 0xffffff, b: 0xe8e0d8 }, { _: 0x5a3a36 });
  simple('cooked_chicken', BIRD, { c: 0xa86a28, C: 0xd8983c, W: 0xf0c070, b: 0xe8e0d0 }, { _: 0x3a2008 });
  const MUT = [
    '................', '................', '................', '......mmmm......', '....mmMMMMm.....',
    '...mMMWMMMMm....', '...mMMMMMMMm....', '...mMMMMMMMmb...', '....mmMMMMmbbb..', '......mmmmbbWb..',
    '...........bbb..',
  ];
  simple('mutton', MUT, { m: 0xb83a3a, M: 0xe06060, W: 0xffc0c0, b: 0xe8e0d8 }, { _: 0x4a1010 });
  simple('cooked_mutton', MUT, { m: 0x6a3418, M: 0x9a5a2a, W: 0xc88a50, b: 0xe8e0d8 }, { _: 0x2a1408 });
  simple('rotten_flesh', [
    '................', '................', '................', '.....rr.........', '...rrRRrrg......',
    '..rRRgRRRrr.....', '..rRRRRgRRRr....', '...rRRRRRRRgr...', '...grRRgRRRRr...', '....rrRRRRrr....',
    '......rgRrr.....', '........rr......',
  ], { r: 0x7a5a2a, R: 0x9a7a3a, g: 0x5a8a3a }, { _: 0x2a1e0a });
  simple('melon_slice', [
    '................', '................', '................', '................', '................',
    '..rrrrrrrrrrrr..', '..rRkRRRkRRRkr..', '...rRRRRRRRRr...', '....rRkRRRkr....', '.....rRRRRr.....',
    '......wwww......', '.......gg.......',
  ], { r: 0xd83a3a, R: 0xf06a5a, k: 0x1a1a1a, w: 0xe8f0c0, g: 0x4a8a2a }, { _: 0x3a1010 });
})();
