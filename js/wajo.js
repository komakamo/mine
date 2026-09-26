'use strict';
// Japanese castles (和城): five kinds of small / medium castles, each chosen by the lie of the land.
//   平城   (hirajiro) on flat plains — concentric 輪郭式 plan: 本丸 in the middle ringed by a water moat, the
//          二の丸 around it inside an outer water moat, a 枡形 gate, corner turrets and a five-tier 天守.
//   平山城 (hirayama) on a hill — 梯郭式: 本丸 on the summit, the 二の丸 wrapping it one stone terrace lower,
//          the 三の丸 below that with a dry moat, a black four-tier 天守.
//   山城   (yamajiro) on a mountain top — 連郭式: 曲輪 terraces strung down the ridge, cut apart by 堀切
//          trenches, 腰曲輪, 竪堀, palisades, a watchtower and a thatched main hall instead of a keep.
//   海城   (umijiro) on the coast — the sea is the moat: 本丸 rising from the water with a water gate and a
//          three-tier 天守 roofed in green copper, the 二の丸 on the shore.
//   砦     (toride) in flat forests / snow — a small square fort: dry moat, earthen rampart with palisade,
//          thatched hall, storehouse and watchtower, haunted by fallen warriors.
// The general's standard (大将の旗印) stands in the 本丸's innermost room; breaking it captures the castle
// (wajomobs.js). Plans are deterministic per grid cell, cached, and stamped chunk by chunk like villages.
(function () {
  const Str = MC.Structures;
  const WCELL = 336;
  const BI = MC.BIOME, SEA = MC.SEA;
  const hAt = (gen, x, z) => Math.floor(gen.height(x, z));
  const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // world direction of the local front (-z) for rotation r

  // ---------------------------------------------------------------- kinds
  const TYPES = MC.WAJO_TYPES = {
    hirajiro: { name: '白鷺城', kind: '平城', R: 74, clan: [0.2, 0.34, 0.8], sub: '水堀に囲まれた平城。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['ashigaru', 'ashigaru', 'yumi_ashigaru', 'samurai', 'teppo_ashigaru'] },
    hirayama: { name: '墨染城', kind: '平山城', R: 74, clan: [0.16, 0.16, 0.18], sub: '丘に石垣を重ねた黒い城。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['ashigaru', 'samurai', 'yumi_ashigaru', 'samurai', 'teppo_ashigaru'] },
    yamajiro: { name: '鷹ノ巣城', kind: '山城', R: 72, clan: [0.8, 0.14, 0.1], sub: '尾根に曲輪と堀切を連ねた山の要害。本丸の天守閣にある大将の旗印を倒せば制圧',
      spawn: ['ashigaru', 'ninja', 'yumi_ashigaru', 'ninja', 'samurai'] },
    yamajiro_unkai: { name: '雲海城', kind: '山城', R: 70, clan: [0.35, 0.55, 0.82], sub: '雲海を見下ろす高石垣の天空城。本丸の天守閣にある大将の旗印を倒せば制圧',
      spawn: ['samurai', 'yumi_ashigaru', 'ashigaru', 'teppo_ashigaru', 'samurai'] },
    yamajiro_kinka: { name: '金華城', kind: '山城', R: 68, clan: [0.78, 0.62, 0.15], sub: '孤峰山頂に四重天守を戴く覇王の城。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['samurai', 'samurai', 'teppo_ashigaru', 'yumi_ashigaru', 'hatamoto'] },
    umijiro: { name: '潮見城', kind: '海城', R: 58, clan: [0.1, 0.5, 0.48], sub: '海を堀とする水城。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['samurai', 'teppo_ashigaru', 'ashigaru', 'yumi_ashigaru', 'teppo_ashigaru'] },
    umijiro_ukifune: { name: '浮舟城', kind: '海城', R: 64, clan: [0.2, 0.42, 0.72], sub: '潮入り堀に浮かぶ波除石垣の水城。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['ashigaru', 'yumi_ashigaru', 'samurai', 'teppo_ashigaru', 'samurai'] },
    umijiro_kuroshio: { name: '黒潮城', kind: '海城', R: 62, clan: [0.12, 0.22, 0.38], sub: '海食断崖の上に聳える水軍の要塞。天守の最上階にある大将の旗印を倒せば制圧',
      spawn: ['samurai', 'teppo_ashigaru', 'teppo_ashigaru', 'ninja', 'samurai'] },
    toride: { name: '朽木砦', kind: '砦', R: 42, clan: [0.86, 0.86, 0.8], sub: '落ち武者の亡霊が守る打ち捨てられた砦。主殿の大将の旗印を倒せば制圧',
      spawn: ['ochimusha', 'ochimusha', 'ninja', 'ochimusha'] },
  };

  // ---------------------------------------------------------------- site selection
  function survey(gen, x, z, r, n = 12) {
    const out = [];
    for (let a = 0; a < n; a++) {
      const t = a / n * Math.PI * 2;
      out.push(hAt(gen, x + Math.round(Math.cos(t) * r), z + Math.round(Math.sin(t) * r)));
    }
    return out;
  }
  const median = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];

  // walk uphill to the local summit
  function climb(gen, x, z, step, n) {
    let h = hAt(gen, x, z);
    for (let i = 0; i < n; i++) {
      let bx = x, bz = z, bh = h;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const hh = hAt(gen, x + dx * step, z + dz * step);
        if (hh > bh) { bh = hh; bx = x + dx * step; bz = z + dz * step; }
      }
      if (bx === x && bz === z) break;
      x = bx; z = bz; h = bh;
    }
    return [x, z, h];
  }

  const HILLY = [BI.PLAINS, BI.FOREST, BI.BIRCH, BI.TAIGA, BI.SNOWY];

  // 1. 海城 (Umijiro): 岬・半島・海側開放度・陸地アプローチ・両翼水堀・海崖評価（3種類選定）
  function evalUmijiro(gen, x, z, h0) {
    if (h0 < SEA || h0 > SEA + 22) return null;
    const r30 = survey(gen, x, z, 30, 8);
    const wet30 = r30.filter((h) => h < SEA).length;
    if (wet30 < 2 || wet30 > 6) return null; // 岬・海岸・海崖として適度な水陸境界

    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const [dx, dz] = DIR4[rot]; // 陸地側（大手・-z方向）

      // 海側（本丸・+z方向）の開口度
      let seaWater = 0, seaTotal = 0;
      for (const f of [18, 36]) {
        for (const o of [-0.5, 0, 0.5]) {
          const sx = x - Math.round((dx - dz * o) * f);
          const sz = z - Math.round((dz + dx * o) * f);
          if (hAt(gen, sx, sz) < SEA) seaWater++;
          seaTotal++;
        }
      }
      const seaRatio = seaWater / seaTotal;
      if (seaRatio < 0.6) continue;

      // 陸地側（二の丸・大手門・-z方向）の安定度
      let landCount = 0, landTotal = 0;
      let minLandH = 999, maxLandH = -999;
      for (const f of [18, 36]) {
        for (const o of [-0.4, 0, 0.4]) {
          const lx = x + Math.round((dx - dz * o) * f);
          const lz = z + Math.round((dz + dx * o) * f);
          const h = hAt(gen, lx, lz);
          if (h >= SEA) landCount++;
          if (h < minLandH) minLandH = h;
          if (h > maxLandH) maxLandH = h;
          landTotal++;
        }
      }
      const landRatio = landCount / landTotal;
      if (landRatio < 0.75) continue;
      const landSlope = maxLandH - minLandH;
      if (landSlope > 14) continue;

      // 左右両翼の海域（天然の海堀）
      let flankWater = 0;
      for (const o of [-1, 1]) {
        for (const f of [20, 32]) {
          const fx = x + Math.round(-dz * o * f);
          const fz = z + Math.round(dx * o * f);
          if (hAt(gen, fx, fz) < SEA) flankWater++;
        }
      }
      if (flankWater < 1) continue;

      const score = 30 + seaRatio * 35 + landRatio * 25 + flankWater * 5 - landSlope * 1.5;
      if (!best || score > best.score) {
        let kind = 'umijiro';
        let fy = Math.max(SEA + 2, Math.min(SEA + 4, h0));
        const uhash = Math.floor(MC.hash2(x * 19, z * 31, gen.seed + 6013) * 3);
        if (h0 >= SEA + 6) {
          kind = 'umijiro_kuroshio';
          fy = h0;
        } else if (uhash === 1) {
          kind = 'umijiro_ukifune';
        } else if (uhash === 2) {
          kind = 'umijiro_kuroshio';
          fy = Math.max(SEA + 8, h0 + 6);
        } else {
          kind = 'umijiro';
        }
        best = { kind, rot, score, fy, sx: x, sz: z };
      }
    }
    return best;
  }

  // 2. 山城 (Yamajiro): 山頂卓越度・主尾根降下ライン・両翼急崖（天然切岸）評価（3種類選定）
  function evalYamajiro(gen, x, z, h0, info) {
    if (info.biome !== BI.MOUNTAIN && h0 < SEA + 30) return null;
    const [cx, cz, ch] = climb(gen, x, z, 5, 25);
    if (ch > MC.HEIGHT - 28 || ch < SEA + 30) return null;

    // 山頂の卓越性（周囲に覆いかぶさる高山がないこと）
    const r40 = survey(gen, cx, cz, 40, 10);
    if (Math.max(...r40) > ch + 2) return null;
    const med40 = median(r40);
    if (ch - med40 < 9) return null; // 四方に対する明瞭な比高

    // 主尾根筋の検出
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const [dx, dz] = DIR4[rot]; // 尾根降下方向（大手・-z方向）
      const h18 = hAt(gen, cx + dx * 18, cz + dz * 18);
      const h36 = hAt(gen, cx + dx * 36, cz + dz * 36);
      const h50 = hAt(gen, cx + dx * 50, cz + dz * 50);
      if (h18 > ch - 1 || h36 > h18 + 2 || h50 > h36 + 2) continue;
      if (ch - h50 > 24 || ch - h50 < 6) continue; // 三連曲輪に適した緩やかな降下

      // 尾根の左右両翼が険しい急斜面（天然の切岸）であること
      let flankDrop = 0;
      for (const o of [-1, 1]) {
        const hf1 = hAt(gen, cx + Math.round(-dz * o * 18), cz + Math.round(dx * o * 18));
        const hf2 = hAt(gen, cx + Math.round(dx * 24 - dz * o * 18), cz + Math.round(dz * 24 + dx * o * 18));
        flankDrop += (ch - hf1) + (h18 - hf2);
      }
      const score = 30 + (ch - med40) * 1.5 + flankDrop * 0.5;
      if (!best || score > best.score) {
        const yhash = Math.floor(MC.hash2(cx * 37, cz * 43, gen.seed + 7019) * 3);
        let kind = 'yamajiro';
        if (flankDrop > 28 && yhash === 1) kind = 'yamajiro_unkai';
        else if (ch - med40 >= 14 && yhash === 2) kind = 'yamajiro_kinka';
        else kind = ['yamajiro', 'yamajiro_unkai', 'yamajiro_kinka'][yhash];
        best = { kind, rot, score, fy: ch, sx: cx, sz: cz };
      }
    }
    return best;
  }

  // 3. 平山城 (Hirayama): 孤立丘陵・頂上平坦度・平野下降勾配評価
  function evalHirayama(gen, x, z, h0, info) {
    if (!HILLY.includes(info.biome) || h0 < SEA + 6 || h0 > SEA + 36) return null;
    const [cx, cz, ch] = climb(gen, x, z, 4, 12);
    if (ch < SEA + 8 || ch > SEA + 42) return null;

    const r20 = survey(gen, cx, cz, 20, 8);
    const r44 = survey(gen, cx, cz, 44, 10);
    const sDiff = Math.max(...r20) - Math.min(...r20);
    if (sDiff > 5) return null; // 本丸を置く山頂部の適度な平坦さ

    const med44 = median(r44);
    const rel = ch - med44;
    if (rel < 6 || rel > 22) return null; // 平野から際立つ孤立丘の高さ
    if (Math.max(...r44) > ch) return null;
    if (r44.filter((h) => h < SEA).length > 2) return null; // 海に囲まれた山は除外

    // 大手側（-z方向）への自然な下降勾配
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const [dx, dz] = DIR4[rot];
      const hDown = hAt(gen, cx + dx * 44, cz + dz * 44);
      const hBack = hAt(gen, cx - dx * 30, cz - dz * 30);
      if (hDown >= ch - 2) continue;
      const slope = (ch - hDown) - Math.abs(ch - hBack);
      const score = 30 + rel * 2.5 + slope * 1.5 - sDiff * 2;
      if (!best || score > best.score) {
        best = { kind: 'hirayama', rot, score, fy: ch, sx: cx, sz: cz };
      }
    }
    return best;
  }

  // 4. 平城 (Hirajiro): 広域平坦度（diff<=8）・平野純度・水系近接度評価
  function evalHirajiro(gen, x, z, h0, info) {
    if (info.biome !== BI.PLAINS || h0 < SEA + 2 || h0 > SEA + 28) return null;
    const r24 = survey(gen, x, z, 24, 8);
    const r44 = survey(gen, x, z, 44, 8);
    const r60 = survey(gen, x, z, 60, 8);
    const all = r24.concat(r44, r60);
    const lo = Math.min(...all), hi = Math.max(...all);
    const diff = hi - lo;
    if (diff > 8 || lo < SEA) return null; // 二重水堀が平地と完全に調和する平坦地

    const r80 = survey(gen, x, z, 76, 8);
    const nearWater = r80.some((h) => h < SEA) ? 10 : 0; // 天然河川・水系の近接ボーナス
    const score = 55 - diff * 4 + nearWater;
    const rot = Math.floor(MC.hash2(x, z, gen.seed + 7107) * 4);
    return { kind: 'hirajiro', rot, score, fy: median(all), sx: x, sz: z };
  }

  // 5. 砦 (Toride): 微高地隆起度・見晴らし・戦術的優位度評価
  function evalToride(gen, x, z, h0, info) {
    if (!HILLY.includes(info.biome) || h0 < SEA + 3 || h0 > SEA + 46) return null;
    const r20 = survey(gen, x, z, 20, 8);
    const r32 = survey(gen, x, z, 32, 8);
    const med32 = median(r32);
    const knollRise = h0 - med32;
    if (knollRise < 1.5 || knollRise > 6) return null; // 周囲を見下ろす微高地・マウンド
    const diff = Math.max(...r20) - Math.min(...r20);
    if (diff > 4) return null;

    const score = 25 + knollRise * 4 - diff * 2;
    const rot = Math.floor(MC.hash2(x, z, gen.seed + 7107) * 4);
    return { kind: 'toride', rot, score, fy: h0, sx: x, sz: z };
  }

  function validLocation(gen, kind, sx, sz) {
    const T = TYPES[kind];
    for (const [cgx, cgz] of Str._cellsAround(sx, sz, Str.CCELL, 270)) {
      const c = Str.castleSite(gen, cgx, cgz);
      if (c && Math.hypot(c.x - sx, c.z - sz) < 260) return false;
    }
    for (const [vgx, vgz] of Str._cellsAround(sx, sz, Str.VCELL, T.R + 110)) {
      const v = Str.villageSite(gen, vgx, vgz);
      if (v && Math.hypot(v.x - sx, v.z - sz) < T.R + 90) return false;
    }
    return true;
  }

  const PRIO_MULT = {
    umijiro: 1.05, umijiro_ukifune: 1.05, umijiro_kuroshio: 1.05,
    hirajiro: 1.15, hirayama: 1.05,
    yamajiro: 1.0, yamajiro_unkai: 1.0, yamajiro_kinka: 1.0,
    toride: 0.85
  };

  function trySite(gen, gx, gz, x, z) {
    const info = gen.columnInfo(x, z);
    if (info.biome === BI.DESERT || info.biome === BI.OCEAN) return null;
    const h0 = info.h;

    const candidates = [];
    const u = evalUmijiro(gen, x, z, h0); if (u) candidates.push(u);
    const y = evalYamajiro(gen, x, z, h0, info); if (y) candidates.push(y);
    const h = evalHirayama(gen, x, z, h0, info); if (h) candidates.push(h);
    const p = evalHirajiro(gen, x, z, h0, info); if (p) candidates.push(p);
    const t = evalToride(gen, x, z, h0, info); if (t) candidates.push(t);
    if (!candidates.length) return null;

    candidates.sort((a, b) => (b.score * PRIO_MULT[b.kind]) - (a.score * PRIO_MULT[a.kind]));
    for (const best of candidates) {
      if (!validLocation(gen, best.kind, best.sx, best.sz)) continue;
      const T = TYPES[best.kind];
      const snowy = info.biome === BI.SNOWY || info.biome === BI.TAIGA || (best.kind.startsWith('yamajiro') && best.fy > 150);
      return {
        type: 'wajo', kind: best.kind, gx, gz,
        x: best.sx, z: best.sz, fy: best.fy, rot: best.rot,
        R: T.R, id: 'w' + gx + ',' + gz, name: T.name, snowy, score: best.score
      };
    }
    return null;
  }

  function wajoSite(gen, gx, gz) {
    const k = 'w' + gx + ',' + gz;
    if (Str._sites.has(k)) return Str._sites.get(k);
    let site = null;
    if (MC.hash2(gx, gz, gen.seed + 7101) < 0.9) {
      const candidates = [];
      for (let tz = 0; tz < 3; tz++) {
        for (let tx = 0; tx < 3; tx++) {
          const rx = Math.floor(MC.hash2(gx * 11 + tx, gz * 13 + tz, gen.seed + 7102) * 28) - 14;
          const rz = Math.floor(MC.hash2(gx * 17 + tx, gz * 19 + tz, gen.seed + 7103) * 28) - 14;
          const x = gx * WCELL + 68 + tx * 100 + rx;
          const z = gz * WCELL + 68 + tz * 100 + rz;
          const s = trySite(gen, gx, gz, x, z);
          if (s) candidates.push(s);
        }
      }
      if (candidates.length) {
        candidates.sort((a, b) => (b.score * PRIO_MULT[b.kind]) - (a.score * PRIO_MULT[a.kind]));
        site = candidates[0];
      }
    }
    Str._sites.set(k, site);
    return site;
  }

  // ---------------------------------------------------------------- builders
  const BL = () => MC.BLOCK;
  // local builder: (lx, lz) relative to the site centre, the front (大手) towards -z, rotated by r; absolute y
  function makeBuilder(gen, cv, site) {
    const r = site.rot, cx = site.x, cz = site.z;
    const tf = (lx, lz) => { let x = lx, z = lz; for (let i = 0; i < r; i++) { const t = x; x = -z; z = t; } return [cx + x, cz + z]; };
    const natC = new Map();
    const b = {
      put(lx, y, lz, v) { const [x, z] = tf(lx, lz); cv.put(x, y, z, v ? MC.rotateBlock(v, r) : 0); },
      get(lx, y, lz) { const [x, z] = tf(lx, lz); return cv.get(x, y, z); },
      nat(lx, lz) {
        const k = (lx + 2048) * 4096 + lz + 2048;
        let h = natC.get(k);
        if (h === undefined) { const [x, z] = tf(lx, lz); h = hAt(gen, x, z); natC.set(k, h); }
        return h;
      },
      world(lx, y, lz) { const [x, z] = tf(lx, lz); return [x, y, z]; },
      chest(lx, y, lz, facing, table) {
        const [x, z] = tf(lx, lz);
        cv.put(x, y, z, MC.rotateBlock(MC.BLOCK.chest + (facing & 3), r));
        if (table) cv.loot.push([x, y, z, table]);
      },
    };
    b.fill = fillFn(b);
    return b;
  }
  function fillFn(f) {
    return (x0, y0, z0, x1, y1, z1, v) => {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) f.put(x, y, z, typeof v === 'function' ? v(x, y, z) : v);
    };
  }
  // sub-frame: local (x, z) rotated by q quarter turns around (ox, oz) of the parent; block facings follow
  function frame(p, ox, oz, q = 0) {
    const tf = (x, z) => { for (let i = 0; i < q; i++) { const t = x; x = -z; z = t; } return [ox + x, oz + z]; };
    const f = {
      put(x, y, z, v) { const [a, c] = tf(x, z); p.put(a, y, c, v ? MC.rotateBlock(v, q) : 0); },
      get(x, y, z) { const [a, c] = tf(x, z); return p.get(a, y, c); },
      chest(x, y, z, facing, table) { const [a, c] = tf(x, z); p.chest(a, y, c, (facing + q) & 3, table); },
      world(x, y, z) { const [a, c] = tf(x, z); return p.world(a, y, c); },
    };
    f.fill = fillFn(f);
    return f;
  }
  // frame covering the parent rect [px0..px1] x [pz0..pz1] whose front (local z = 0, facing -z) looks along q
  function placeRect(p, px0, pz0, px1, pz1, q) {
    const w = px1 - px0 + 1, d = pz1 - pz0 + 1;
    switch (q & 3) {
      case 0: return { f: frame(p, px0, pz0, 0), W: w, D: d };
      case 1: return { f: frame(p, px1, pz0, 1), W: d, D: w };
      case 2: return { f: frame(p, px1, pz1, 2), W: w, D: d };
      default: return { f: frame(p, px0, pz1, 3), W: d, D: w };
    }
  }
  // signed chebyshev distances (<= 0 inside) of rectangles, rings and the outside of a rectangle
  const rectSd = (x0, z0, x1, z1) => (x, z) => Math.max(x0 - x, x - x1, z0 - z, z - z1);
  const ringSd = (O, H) => { const so = rectSd(...O), sh = rectSd(...H); return (x, z) => Math.max(so(x, z), 1 - sh(x, z)); };
  const outSd = (Q) => { const s = rectSd(...Q); return (x, z) => 1 - s(x, z); };
  // corner stones of a rectangle, laid alternately long and short (算木積み)
  const corners = (x0, z0, x1, z1) => (x, z, e, y) => {
    const ax = Math.max(x0 - x, x - x1), az = Math.max(z0 - z, z - z1);
    return y & 1 ? ax >= e - 2 && az >= e - 1 : ax >= e - 1 && az >= e - 2;
  };

  // ---------------------------------------------------------------- terrain
  // a column levelled to `top`: surface, a few blocks of dirt, stone below; clears what stood above
  function ground(b, x, z, top, surf, o = {}) {
    const B = BL(), nh = b.nat(x, z);
    for (let y = Math.min(nh, top); y <= top; y++) b.put(x, y, z, y === top ? surf : y > top - 3 ? (o.sub || B.dirt) : B.stone);
    const hi = Math.max(nh, top) + (o.clear === undefined ? 7 : o.clear);
    for (let y = top + 1; y <= hi; y++) b.put(x, y, z, 0);
  }
  // Stone-walled terrace (曲輪): columns with sd <= 0 form the flat top at `top`. The battered face (扇の勾配: nearly
  // vertical at the top, flaring towards the foot) stands e(y) = A * ((top - y) / (top - base))^1.8 outside at height y.
  // out(y) gives the block in front of the face (water / air), or -1 to leave it.
  function terrace(b, o) {
    const B = BL(), { A, top, base, sd } = o;
    const [x0, z0, x1, z1] = o.box;
    const Hh = Math.max(1, top - base), surf = o.surf, fillB = o.fill || B.dirt;
    for (let lz = z0 - A - 1; lz <= z1 + A + 1; lz++) for (let lx = x0 - A - 1; lx <= x1 + A + 1; lx++) {
      const s = sd(lx, lz);
      if (s > A) continue;
      const nh = b.nat(lx, lz);
      for (let y = Math.min(nh, base); y < base; y++) b.put(lx, y, lz, s > A - 2 ? B.ishigaki : B.stone);
      for (let y = base; y <= top; y++) {
        const e = Math.round(A * Math.pow((top - y) / Hh, 1.8));
        if (s > e) { if (o.out) { const v = o.out(y, lx, lz); if (v >= 0) b.put(lx, y, lz, v); } continue; }
        let v;
        if (y === top) v = s === 0 ? B.kirishi : (o.surfAt ? o.surfAt(lx, lz) : surf);
        else if (s > e - 2) v = o.corner && o.corner(lx, lz, e, y) ? B.kirishi : B.ishigaki;
        else v = y > top - 3 ? fillB : B.stone;
        b.put(lx, y, lz, v);
      }
      if (s <= 0) for (let y = top + 1; y <= Math.max(nh, top) + 7; y++) b.put(lx, y, lz, 0);
    }
  }
  // water column (moat): bed, water up to `water`, air above
  function moatCol(b, x, z, bed, water, bedBlock) {
    const nh = b.nat(x, z);
    if (nh > bed || !bedBlock) b.put(x, Math.min(bed, nh), z, bedBlock || BL().dirt);
    for (let y = Math.min(bed, nh) + 1; y <= water; y++) b.put(x, y, z, BL().water);
    for (let y = water + 1; y <= Math.max(nh, water) + 7; y++) b.put(x, y, z, 0);
  }
  // natural surface block for the site's climate
  const surfOf = (site, nh) => (nh < SEA + 1 ? BL().sand : site.snowy ? BL().snowy_grass : BL().grass);
  // ground held between `level` and `hi` next to the castle, blending into the natural terrain as dist(x, z)
  // goes from 0 to 1
  function apron(b, site, x0, z0, x1, z1, level, dist, skip, hi = level) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (skip && skip(x, z)) continue;
      const t = MC.clamp(dist(x, z), 0, 1);
      if (t >= 1) continue;
      const nh = b.nat(x, z), k = MC.smoothstep(0, 1, t), near = MC.clamp(nh, level, hi);
      const top = Math.round(near + (nh - near) * k);
      ground(b, x, z, top, surfOf(site, top), { clear: 7 - Math.round(k * 6) });
    }
  }

  // ---------------------------------------------------------------- architecture
  // hip / irimoya / gable roof over the wall rect [x0..x1] x [z0..z1], first course at y, overhang ov
  function roof(f, o) {
    const B = BL(), st = o.m.st, sl = o.m.sl, bl = o.m.bl;
    const alongX = o.x1 - o.x0 >= o.z1 - o.z0;
    const U0 = alongX ? o.x0 : o.z0, U1 = alongX ? o.x1 : o.z1, V0 = alongX ? o.z0 : o.x0, V1 = alongX ? o.z1 : o.x1;
    const P = (u, y, v, id) => (alongX ? f.put(u, y, v, id) : f.put(v, y, u, id));
    const F = alongX ? { vp: 0, vm: 2, up: 3, um: 1 } : { vp: 3, vm: 1, up: 0, um: 2 };
    const ov = o.ov === undefined ? 1 : o.ov;
    const layers = Math.floor((V1 - V0 + 2 * ov) / 2) + 1;
    const kg = o.type === 'hip' ? 1e9 : o.type === 'gable' ? 0 : Math.max(1, Math.floor(layers * 0.45));
    let ua = U0 - ov, ub = U1 + ov, ridgeY = o.y, ridge = null;
    for (let k = 0; k < 64; k++) {
      const y = o.y + k, va = V0 - ov + k, vb = V1 + ov - k;
      const hip = k < kg;
      if (hip) { ua = U0 - ov + k; ub = U1 + ov - k; }
      if (ua > ub) { ua = ub = Math.round((U0 + U1) / 2); }
      if (va > vb) { for (let u = ua; u <= ub; u++) { P(u, y, vb, sl); P(u, y, va, sl); } ridgeY = y; ridge = [vb, va]; break; }
      if (va === vb) { for (let u = ua; u <= ub; u++) P(u, y, va, bl); ridgeY = y; ridge = [va, va]; break; }
      for (let u = ua; u <= ub; u++) { P(u, y, va, st + F.vp); P(u, y, vb, st + F.vm); }
      if (hip) for (let v = va + 1; v < vb; v++) { P(ua, y, v, st + F.up); P(ub, y, v, st + F.um); }
      else for (let v = va + 1; v < vb; v++) {
        // gable wall, with a gilded ornament (懸魚) at its apex
        const apex = o.crest && va + 1 === vb - 1;
        P(ua + 1, y, v, apex ? B.gold_block : o.gw || B.shikkui); P(ub - 1, y, v, apex ? B.gold_block : o.gw || B.shikkui);
      }
    }
    if (o.shachi && ridge) {
      const gab = o.type === 'hip' ? 0 : 1;
      P(ua + gab, ridgeY + 1, ridge[0], B.shachihoko + F.um);
      P(ub - gab, ridgeY + 1, ridge[0], B.shachihoko + F.up);
    }
    return ridgeY;
  }
  // perimeter cells of a rect with the direction of the side they face (0: -z, 1: +x, 2: +z, 3: -x)
  function perimeter(x0, z0, x1, z1) {
    const out = [];
    for (let x = x0; x <= x1; x++) { out.push([x, z0, 0, x - x0]); if (z1 !== z0) out.push([x, z1, 2, x - x0]); }
    for (let z = z0 + 1; z < z1; z++) { out.push([x0, z, 3, z - z0]); if (x1 !== x0) out.push([x1, z, 1, z - z0]); }
    return out;
  }
  const INWARD = [0, 3, 2, 1];   // stairs facing (high side) pointing into the rect from each side
  const OUT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  // one storey of a tower: floor at y, walls y+1..y+3 with windows; skirt roof unless it is the top storey
  function storey(f, o) {
    const B = BL(), { x0, z0, x1, z1, y } = o;
    f.fill(x0, y, z0, x1, y, z1, o.floor || B.spruce_planks);
    f.fill(x0 + 1, y + 1, z0 + 1, x1 - 1, y + 3, z1 - 1, 0);
    const w = x1 - x0, d = z1 - z0;
    for (const [x, z, s, i] of perimeter(x0, z0, x1, z1)) {
      const len = s === 0 || s === 2 ? w : d;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      for (let dy = 1; dy <= 3; dy++) {
        let v = dy === 1 && o.low ? o.low : o.wall;
        if (dy === 3 && o.band) v = o.band;
        // windows every third block, symmetric about the middle of the side; loopholes between them
        if (!corner && dy === 2 && i > 0 && i < len) {
          if (i % 3 === (2 * len) % 3) v = o.win || B.renji;
          else if (o.hazama && i % 3 === (2 * len + 1) % 3) v = B.hazama;
        }
        f.put(x, y + dy, z, v);
      }
    }
    if (!o.top) {
      for (const [x, z, s] of perimeter(x0 - 1, z0 - 1, x1 + 1, z1 + 1)) f.put(x, y + 3, z, o.m.sl);
      for (const [x, z, s] of perimeter(x0, z0, x1, z1)) f.put(x, y + 4, z, o.m.st + INWARD[s]);
    }
  }
  // stacked storeys shrinking by one block per side, irimoya roof on top; returns the floor heights
  function tiers(f, o) {
    const ys = [];
    for (let i = 0; i < o.n; i++) {
      const y = o.y + 4 * i, top = i === o.n - 1;
      const rect = { x0: o.x0 + i, z0: o.z0 + i, x1: o.x1 - i, z1: o.z1 - i };
      storey(f, { ...rect, y, top, m: o.m, wall: o.wall, low: o.low, band: o.band, win: o.win, hazama: o.hazama && i === 0, floor: o.floor });
      if (top) roof(f, { ...rect, y: y + 4, type: o.roofType || 'irimoya', m: o.m, shachi: o.shachi, gw: o.gw, crest: true });
      ys.push(y);
    }
    return ys;
  }
  // small gable (千鳥破風) projecting from a skirt roof: centred on u = c along the side facing `side`
  function chidori(f, x0, z0, x1, z1, y, side, c, m, wall) {
    const B = BL();
    // side frame: u along the side, n outwards
    const pos = (u, n) => (side === 0 ? [u, z0 - n] : side === 2 ? [u, z1 + n] : side === 1 ? [x1 + n, u] : [x0 - n, u]);
    const P = (u, n, yy, v) => { const [x, z] = pos(u, n); f.put(x, yy, z, v); };
    const along = side === 0 || side === 2;
    const fu = along ? 3 : 0, fd = along ? 1 : 2;   // stairs rising towards +u / -u
    for (const n of [0, 1]) {
      P(c - 2, n, y, m.st + fu); P(c + 2, n, y, m.st + fd);
      P(c - 1, n, y + 1, m.st + fu); P(c + 1, n, y + 1, m.st + fd);
      P(c, n, y + 2, m.bl);
    }
    for (let u = c - 1; u <= c + 1; u++) P(u, 0, y, wall);
    P(c, 0, y + 1, B.gold_block);
  }
  // straight flight of wooden stairs along x from floor yFrom up n blocks (dir +1 / -1)
  function flight(f, x, z, dir, yFrom, n, st) {
    for (let k = 0; k < n; k++) {
      const y = yFrom + 1 + k, xx = x + dir * k;
      f.put(xx, y, z, st + (dir > 0 ? 3 : 1));
      for (let h = 1; h <= 2; h++) if (y + h <= yFrom + n) f.put(xx, y + h, z, 0);
    }
    f.put(x + dir * (n - 3), yFrom + n, z, 0);
    f.put(x + dir * (n - 2), yFrom + n, z, 0);
  }

  // 天守: stone base with a basement (穴蔵) entered from the front, tiers of rooms joined by stairs,
  // skirt roofs, chidori gables and an irimoya roof with golden shachihoko; the standard on the top floor
  function tenshu(f, ctx, o) {
    const B = BL(), { X0, Z0, X1, Z1, g, n } = o;
    const bh = o.baseH || 4, m = o.m;
    const cxm = Math.round((X0 + X1) / 2);
    // base
    terrace(f, { box: [X0 - 1, Z0 - 1, X1 + 1, Z1 + 1], A: 1, top: g + bh, base: g, sd: rectSd(X0 - 1, Z0 - 1, X1 + 1, Z1 + 1), surf: B.kirishi,
      corner: corners(X0 - 1, Z0 - 1, X1 + 1, Z1 + 1), out: (y) => (y > g ? 0 : -1) });
    // basement and the entrance tunnel
    f.fill(X0 + 1, g + 1, Z0 + 1, X1 - 1, g + bh - 1, Z1 - 1, 0);
    f.fill(X0 + 1, g, Z0 + 1, X1 - 1, g, Z1 - 1, B.cobblestone);
    f.fill(cxm - 1, g + 1, Z0 - 3, cxm + 1, g + 3, Z0, 0);
    f.fill(cxm - 1, g, Z0 - 3, cxm + 1, g, Z0, B.gravel);
    f.put(cxm, g + 3, Z0 + 2, B.chochin);
    const ys = tiers(f, { x0: X0, z0: Z0, x1: X1, z1: Z1, y: g + bh, n, m, wall: o.wall, low: o.low, band: o.band, hazama: true, shachi: true, gw: o.gw });
    const top = n - 1, tx0 = X0 + top, tz0 = Z0 + top, tx1 = X1 - top, tz1 = Z1 - top, ty = ys[top];
    f.fill(tx0 + 1, ty, tz0 + 1, tx1 - 1, ty, tz1 - 1, B.tatami);
    // basement stairs, then one flight per storey (alternating rows)
    flight(f, X1 - 1, Z1 - 1, -1, g, bh, B.spruce_stairs);
    for (let i = 0; i < n - 1; i++) {
      if (i % 2 === 0) flight(f, X0 + i + 2, Z0 + i + 2, 1, ys[i], 4, B.spruce_stairs);
      else flight(f, X1 - i - 2, Z1 - i - 2, -1, ys[i], 4, B.spruce_stairs);
    }
    // chidori gables on the skirts
    for (const [i, sides] of o.chidori || []) {
      const x0 = X0 + i, z0 = Z0 + i, x1 = X1 - i, z1 = Z1 - i, y = ys[i] + 4;
      for (const s of sides) chidori(f, x0, z0, x1, z1, y, s, s === 0 || s === 2 ? cxm : Math.round((z0 + z1) / 2), m, o.gw || B.shikkui);
    }
    // furnishing: lanterns, chests, the standard on the top floor
    for (let i = 0; i < n; i++) {
      const x0 = X0 + i, z0 = Z0 + i, x1 = X1 - i, z1 = Z1 - i, y = ys[i];
      if (i < n - 1) f.put(cxm, y + 3, Math.round((z0 + z1) / 2), B.chochin);
      if (i === 0) { f.chest(x0 + 1, y + 1, z1 - 2, 3, 'wajo_armory'); f.chest(x1 - 1, y + 1, z0 + 1, 1, 'wajo_armory'); }
      else if (i === Math.floor(n / 2)) f.chest(x1 - 1, y + 1, z0 + 1 + (i % 2 ? 0 : 1), 1, 'wajo_kura');
    }
    // the standard on the top floor, on the row opposite the arrival of the last flight
    const lastOdd = (n - 2) % 2 === 1;
    const bz = lastOdd ? tz0 + 1 : tz1 - 1;
    banner(f, ctx, cxm, ty + 1, bz, lastOdd ? 2 : 0);
    f.chest(tx0 + 1, ty + 1, bz, lastOdd ? 0 : 2, 'wajo_tenshu');
    f.chest(tx1 - 1, ty + 1, bz, lastOdd ? 0 : 2, 'wajo_tenshu');
    return { ys, cx: cxm, top: [tx0, tz0, tx1, tz1] };
  }
  // the general's standard: two blocks, the cloth facing along `facing`
  function banner(f, ctx, x, y, z, facing) {
    const B = BL();
    f.put(x, y, z, B.hatajirushi + facing);
    f.put(x, y + 1, z, B.hatajirushi_top + facing);
    ctx.plan.banner = f.world(x, y, z);
  }

  // plastered earthen wall (土塀) along the given cells, capped with tiles, a loophole every few blocks
  function dobei(f, cells, y, o) {
    const B = BL();
    for (const [x, z, , i] of cells) {
      f.put(x, y + 1, z, o.low || B.shikkui);
      f.put(x, y + 2, z, i % 4 === 2 ? B.hazama : B.shikkui);
      f.put(x, y + 3, z, o.cap || B.kawara_slab);
    }
  }
  // wooden palisade (柵)
  function saku(f, cells, y, o = {}) {
    const B = BL();
    for (const [x, z, , i] of cells) {
      const yy = o.ground ? o.ground(x, z) : y;
      if (i % 4 === 0) { for (let h = 1; h <= 3; h++) f.put(x, yy + h, z, B.spruce_log); }
      else if (!(o.broken && MC.hash2(x * 3, z * 7, 91) < o.broken)) { f.put(x, yy + 1, z, B.spruce_fence); f.put(x, yy + 2, z, B.spruce_fence); }
    }
  }
  // 高麗門: two pillars, a tiled gable over the lintel, the leaves swung open inwards (+z); opening x -2..2 at z 0
  function koraimon(f, y, o = {}) {
    const B = BL(), m = o.m;
    f.fill(-2, y + 1, -1, 2, y + 4, 1, 0);
    f.fill(-2, y, -1, 2, y, 1, o.path || B.gravel);
    for (const x of [-3, 3]) for (let h = 1; h <= 4; h++) f.put(x, y + h, 0, B.kuro_itabari);
    for (let x = -4; x <= 4; x++) {
      f.put(x, y + 5, 0, B.kuro_itabari);
      f.put(x, y + 5, -1, m.sl); f.put(x, y + 5, 1, m.sl);
      f.put(x, y + 6, -1, m.st + 0); f.put(x, y + 6, 1, m.st + 2); f.put(x, y + 6, 0, m.bl);
    }
    for (const x of [-2, 2]) for (let h = 1; h <= 3; h++) f.put(x, y + h, 1, B.mon_door);
  }
  // 冠木門: log posts and crossbeam with a small thatched cap (山城 / 砦)
  function kabukimon(f, y, o = {}) {
    const B = BL();
    f.fill(-2, y + 1, 0, 2, y + 4, 0, 0);
    for (const x of [-3, 3]) for (let h = 1; h <= 4; h++) f.put(x, y + h, 0, B.spruce_log);
    for (let x = -3; x <= 3; x++) { f.put(x, y + 5, 0, B.spruce_planks); f.put(x, y + 6, 0, o.cap || B.kaya_slab); }
    for (const x of [-2, 2]) for (let h = 1; h <= 3; h++) f.put(x, y + h, 1, o.broken && x > 0 ? 0 : B.mon_door);
  }
  // 櫓門: a two-storey gate — stone flanks, a 5-wide passage under a turret; passage along z, front at -z
  function yaguramon(f, y, o) {
    const B = BL(), m = o.m;
    for (const s of [-1, 1]) for (let x = 3; x <= 6; x++) for (let z = -2; z <= 2; z++) for (let h = 1; h <= 4; h++) {
      const corner = x === 6 && (z === -2 || z === 2);
      f.put(s * x, y + h, z, corner ? B.kirishi : B.ishigaki);
    }
    f.fill(-2, y + 1, -2, 2, y + 4, 2, 0);
    f.fill(-2, y, -2, 2, y, 2, o.path || B.gravel);
    f.fill(-6, y + 5, -2, 6, y + 5, 2, B.spruce_planks);
    storey(f, { x0: -6, z0: -2, x1: 6, z1: 2, y: y + 5, top: true, m, wall: o.wall, low: o.low, band: o.band, hazama: true });
    roof(f, { x0: -6, z0: -2, x1: 6, z1: 2, y: y + 9, type: 'irimoya', m, gw: o.gw });
    for (const x of [-2, 2]) for (let h = 1; h <= 3; h++) f.put(x, y + h, -1, B.mon_door);
    f.put(0, y + 4, 0, B.chochin);
  }
  // 御殿 / 主殿: raised hall with an open veranda, shoji walls, tatami, a gilded screen and a big roof
  // (canonical: x 0..W-1, z 0..D-1, entrance at z = 0)
  function goten(f, W, D, y, o) {
    const B = BL(), m = o.m;
    f.fill(0, y, 0, W - 1, y, D - 1, B.spruce_planks);
    f.fill(2, y, 2, W - 3, y, D - 3, B.tatami);
    f.fill(0, y + 1, 0, W - 1, y + 3, D - 1, 0);
    const mid = Math.floor(W / 2);
    for (const [x, z, s, i] of perimeter(1, 1, W - 2, D - 2)) {
      const post = i % 3 === 0 || (x === 1 || x === W - 2) && (z === 1 || z === D - 2);
      for (let h = 1; h <= 2; h++) f.put(x, y + h, z, post ? B.spruce_log : s === 2 ? (o.back || B.shikkui) : B.shoji);
      f.put(x, y + 3, z, post ? B.spruce_log : B.spruce_planks);
    }
    for (let x = mid - 1; x <= mid + 1; x++) for (let h = 1; h <= 2; h++) f.put(x, y + h, 1, 0);
    // gilded screen and the seat of honour
    for (let x = mid - 2; x <= mid + 2; x++) { f.put(x, y + 1, D - 3, B.gold_block); f.put(x, y + 2, D - 3, B.gold_block); }
    f.fill(0, y + 4, 0, W - 1, y + 4, D - 1, B.spruce_planks);
    roof(f, { x0: 0, z0: 0, x1: W - 1, z1: D - 1, y: y + 4, type: 'irimoya', m, shachi: o.shachi, gw: o.gw, crest: true });
    for (const [x, z] of [[mid, 3], [2, Math.floor(D / 2)], [W - 3, Math.floor(D / 2)], [0, 0], [W - 1, 0]]) f.put(x, y + 3, z, B.chochin);
    if (o.loot) { f.chest(2, y + 1, D - 3, 0, o.loot); f.chest(W - 3, y + 1, D - 3, 0, o.loot); }
  }
  // 蔵: storehouse with namako walls under white plaster and a tiled gable roof (canonical, door at z = 0)
  function kura(f, W, D, y, o) {
    const B = BL(), m = o.m;
    f.fill(0, y, 0, W - 1, y, D - 1, B.spruce_planks);
    f.fill(1, y + 1, 1, W - 2, y + 4, D - 2, 0);
    for (const [x, z] of perimeter(0, 0, W - 1, D - 1)) for (let h = 1; h <= 4; h++) f.put(x, y + h, z, h <= (o.lowH || 2) ? (o.low || B.namako) : (o.wall || B.shikkui));
    const mid = Math.floor(W / 2);
    f.put(mid, y + 1, 0, 0); f.put(mid, y + 2, 0, 0);
    for (let x = mid - 1; x <= mid + 1; x++) f.put(x, y + 3, -1, m.sl);
    f.put(0, y + 3, Math.floor(D / 2), B.renji); f.put(W - 1, y + 3, Math.floor(D / 2), B.renji);
    f.fill(0, y + 5, 0, W - 1, y + 5, D - 1, B.spruce_planks);
    roof(f, { x0: 0, z0: 0, x1: W - 1, z1: D - 1, y: y + 5, type: 'gable', m, gw: o.wall || B.shikkui });
    f.chest(1, y + 1, D - 2, 0, o.loot || 'wajo_kura');
    if (W > 4) f.chest(W - 2, y + 1, D - 2, 0, o.loot || 'wajo_kura');
    for (let z = 2; z < D - 2; z += 2) { f.put(1, y + 1, z, B.hay_bale); if (W > 4) f.put(W - 2, y + 1, z, z % 4 ? B.pumpkin : B.hay_bale); }
    f.put(mid, y + 4, Math.floor(D / 2), B.chochin);
  }
  // 長屋: long barracks with black board walls, doors along the front, bunks inside (canonical, front z = 0)
  function nagaya(f, W, D, y, o) {
    const B = BL(), m = o.m;
    f.fill(0, y, 0, W - 1, y, D - 1, B.spruce_planks);
    f.fill(1, y + 1, 1, W - 2, y + 3, D - 2, 0);
    for (const [x, z, s, i] of perimeter(0, 0, W - 1, D - 1)) {
      for (let h = 1; h <= 3; h++) f.put(x, y + h, z, h === 3 ? (o.band || B.shikkui) : (o.low || B.kuro_itabari));
      if ((s === 0 || s === 2) && i % 4 === 2 && x > 0 && x < W - 1) f.put(x, y + 2, z, B.renji);
    }
    for (let x = 3; x < W - 2; x += 6) { f.put(x, y + 1, 0, 0); f.put(x, y + 2, 0, 0); }
    f.fill(0, y + 4, 0, W - 1, y + 4, D - 1, B.spruce_planks);
    roof(f, { x0: 0, z0: 0, x1: W - 1, z1: D - 1, y: y + 4, type: 'gable', m, gw: o.band || B.shikkui });
    for (let x = 1; x + 1 < W - 1; x += 3) { f.put(x, y + 1, D - 2, MC.bedId(3, 0)); f.put(x + 1, y + 1, D - 2, MC.bedId(3, 1)); }
    f.chest(W - 2, y + 1, 1, 3, 'wajo_barracks');
    f.chest(1, y + 1, 1, 1, 'wajo_barracks');
    for (let x = 4; x < W - 2; x += 6) f.put(x, y + 3, Math.floor(D / 2), B.chochin);
  }
  // 櫓: corner turret of one or two storeys (canonical, door at z = 0)
  function yagura(f, W, D, y, o) {
    const B = BL();
    tiers(f, { x0: 0, z0: 0, x1: W - 1, z1: D - 1, y, n: o.n || 2, m: o.m, wall: o.wall, low: o.low, band: o.band, hazama: true, shachi: o.shachi, gw: o.gw });
    const mid = Math.floor(W / 2);
    f.put(mid, y + 1, 0, 0); f.put(mid, y + 2, 0, 0);
    f.chest(1, y + 1, D - 2, 0, 'wajo_armory');
    f.put(mid, y + 3, Math.floor(D / 2), B.chochin);
    void B;
  }
  // 物見櫓: open wooden watchtower on log posts with a ladder and a thatched hip roof (canonical 5x5)
  function monomi(f, y, o = {}) {
    const B = BL();
    for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4], [2, 4]]) for (let h = 1; h <= 9; h++) f.put(x, y + h, z, B.spruce_log);
    f.fill(0, y + 7, 0, 4, y + 7, 4, B.spruce_planks);
    for (const [x, z] of perimeter(0, 0, 4, 4)) if (!((x === 0 || x === 4) && (z === 0 || z === 4)) && !(x === 2 && z === 4)) f.put(x, y + 8, z, B.spruce_fence);
    for (let h = 1; h <= 7; h++) f.put(2, y + h, 3, B.ladder + 0);
    roof(f, { x0: 0, z0: 0, x1: 4, z1: 4, y: y + 10, type: 'hip', m: o.m });
    for (const [x, z] of [[1, 1], [3, 3]]) f.put(x, y + 1, z, B.hay_bale);
  }
  // 松: a garden pine — leaning trunk and flat layered crowns
  function matsu(f, x, y, z, rnd) {
    const B = BL(), h = 4 + Math.floor(rnd() * 3), lean = rnd() < 0.5 ? 1 : -1;
    let tx = x;
    for (let k = 1; k <= h; k++) { if (k === Math.floor(h / 2) + 1) tx += lean; f.put(tx, y + k, z, B.spruce_log); }
    const pads = [[tx, y + h + 1, z, 2], [tx - lean * 2, y + h - 1, z + 1, 2], [tx + lean, y + h - 2, z - 1, 1]];
    for (const [px, py, pz, r] of pads) for (let dz = -r; dz <= r; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
      if (f.get(px + dx, py, pz + dz) === B.spruce_log) continue;
      f.put(px + dx, py, pz + dz, B.oak_leaves);
    }
  }
  const well = (f, x, y, z) => {
    const B = BL();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = !dx && !dz;
      for (let yy = y - 4; yy <= y; yy++) f.put(x + dx, yy, z + dz, c && yy > y - 4 ? B.water : B.cobblestone);
      if (!c) f.put(x + dx, y + 1, z + dz, B.spruce_slab);
    }
    for (const [dx, dz] of [[-1, -1], [1, 1]]) for (let h = 2; h <= 3; h++) f.put(x + dx, y + h, z + dz, B.spruce_fence);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) f.put(x + dx, y + 4, z + dz, B.kawara_slab);
  };
  // stairs along z from yLow+1 (at z0) rising n blocks, then `land` level blocks at the top; o.side: parapet block
  const stepsUp = (f, x0, x1, z0, dir, yLow, n, st, under, o = {}) => {
    const land = o.land || 0;
    for (let k = 0; k < n + land; k++) {
      const z = z0 + dir * k, y = yLow + 1 + Math.min(k, n - 1);
      for (let x = x0; x <= x1; x++) {
        for (let yy = yLow; yy < y; yy++) f.put(x, yy, z, under);
        f.put(x, y, z, k < n ? st + (dir > 0 ? 0 : 2) : o.top || BL().kirishi);
        for (let h = 1; h <= 4; h++) f.put(x, y + h, z, 0);
      }
      if (o.side) for (const x of [x0 - 1, x1 + 1]) for (let yy = yLow + 1; yy <= y + 1; yy++) f.put(x, yy, z, o.side);
    }
  };
  // wooden bridge along z at deck height y (walkway x -1..1), posts down to `foot`
  function bridge(f, x, z0, z1, y, foot) {
    const B = BL();
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      for (let dx = -2; dx <= 2; dx++) { f.put(x + dx, y, z, B.spruce_planks); for (let h = 1; h <= 3; h++) f.put(x + dx, y + h, z, 0); }
      f.put(x - 2, y + 1, z, B.spruce_fence); f.put(x + 2, y + 1, z, B.spruce_fence);
      if (z % 3 === 0) for (const dx of [-2, 2]) for (let yy = foot; yy < y; yy++) f.put(x + dx, yy, z, B.spruce_log);
    }
  }

  // ---------------------------------------------------------------- plans
  const plans = new Map();
  function wajoPlan(gen, site) {
    const cached = plans.get(site.id);
    if (cached) return cached;
    const cv = new Str.Canvas(site.x, site.z);
    const b = makeBuilder(gen, cv, site);
    const rnd = MC.mulberry32((site.gx * 60493) ^ (site.gz * 19990303) ^ (gen.seed + 5151));
    const T = TYPES[site.kind];
    const plan = { id: site.id, type: 'wajo', kind: site.kind, name: T.name, x: site.x, z: site.z, fy: site.fy, R: site.R, rot: site.rot, groups: [], banner: null, clan: T.clan };
    const ctx = {
      plan, rnd, site,
      pick: (a) => a[Math.floor(rnd() * a.length)],
      group(name, f, x, y, z, rad, dy) { const g = { name, at: f.world(x, y, z), rad, dy, mobs: [] }; plan.groups.push(g); return g; },
      mob(g, f, x, y, z, type) { const [wx, wy, wz] = f.world(x, y, z); g.mobs.push([wx + 0.5, wy, wz + 0.5, type]); },
    };
    BUILD[site.kind](b, ctx, site);
    plan.byChunk = cv.finalize();
    plans.set(site.id, plan);
    if (plans.size > 6) plans.delete(plans.keys().next().value);
    return plan;
  }

  const KAWARA = () => ({ st: BL().kawara_stairs, sl: BL().kawara_slab, bl: BL().kawara });
  const DOGAWARA = () => ({ st: BL().dogawara_stairs, sl: BL().dogawara_slab, bl: BL().dogawara });
  const KAYA = () => ({ st: BL().kaya_stairs, sl: BL().kaya_slab, bl: BL().kaya });

  const BUILD = {
    // ============================================================ 平城: concentric enclosures in water moats
    hirajiro(b, ctx, site) {
      const B = BL(), m = KAWARA(), fy = site.fy, rnd = ctx.rnd;
      const WL = fy - 3, MB = fy - 6, NT = fy + 1, HT = fy + 7;
      const H = [-18, -17, 18, 15];                    // 本丸
      const O = [-41, -44, 41, 38], HO = [-28, -28, 28, 26];   // 二の丸 (ring)
      const Q = [-51, -54, 51, 48];                    // outer moat (water at ground level)
      const EXT = 74;
      const sq = (x, z) => Math.max(Math.max(Q[0] - x, x - Q[2]), Math.max(Q[1] - z, z - Q[3]));
      // ground around, blending out; everything inside the outer moat is dug to water first
      apron(b, site, -EXT, -EXT, EXT, EXT, fy, (x, z) => (sq(x, z) - 4) / (EXT - Q[2] - 4), (x, z) => sq(x, z) <= 0);
      for (let z = Q[1]; z <= Q[3]; z++) for (let x = Q[0]; x <= Q[2]; x++) moatCol(b, x, z, MB, WL);
      const water = (y) => (y <= MB ? -1 : y <= WL ? B.water : 0);
      terrace(b, { box: [Q[0] - 3, Q[1] - 3, Q[2] + 3, Q[3] + 3], A: 2, top: fy, base: MB, sd: outSd(Q), surfAt: (x, z) => surfOf(site, fy), out: water });
      const G = site.snowy ? B.snowy_grass : B.grass;
      terrace(b, { box: O, A: 2, top: NT, base: MB, sd: ringSd(O, HO), surf: G, corner: corners(...O), out: water });
      terrace(b, { box: H, A: 3, top: HT, base: MB, sd: rectSd(...H), surf: G, corner: corners(...H), out: water });

      // ---- 二の丸: walls, corner turrets, masugata gate, barracks, storehouses, hall
      const skipN = (x, z) => (Math.abs(x) >= 34 && (z <= -37 || z >= 31));
      dobei(b, perimeter(...O).filter(([x, z]) => !skipN(x, z)), NT, {});
      for (const [x0, z0, q] of [[-41, -44, 2], [35, -44, 2], [-41, 32, 0], [35, 32, 0]]) {
        const { f, W, D } = placeRect(b, x0, z0, x0 + 6, z0 + 6, q);
        yagura(f, W, D, NT, { m, wall: B.shikkui, n: 2, shachi: false });
      }
      // masugata (front left): outer koraimon on the edge, square court, inner yaguramon turning east
      {
        const f = frame(b, -22, -44, 0);
        f.fill(1, NT + 1, 1, 10, NT + 4, 11, 0);
        f.fill(1, NT, 1, 10, NT, 11, B.gravel);
        dobei(f, perimeter(0, 0, 0, 12).concat(perimeter(0, 12, 11, 12)), NT, {});
        koraimon(frame(f, 5, 0, 0), NT, { m });
        yaguramon(frame(f, 11, 6, 3), NT, { m, wall: B.shikkui });
        for (let x = -10; x <= 5; x++) for (let z = -39; z <= -37; z++) b.put(x, NT, z, B.gravel);
      }
      bridge(b, -17, -58, -45, NT, MB);
      for (let x = -19; x <= -15; x++) { b.put(x, fy, -59, B.gravel); b.put(x, NT, -59, B.cobblestone_stairs + 0); }
      // stone steps up to the bridge across the inner moat, then the honmaru's yaguramon
      stepsUp(b, -2, 2, -36, 1, NT, HT - NT, B.stone_brick_stairs, B.ishigaki, { land: 2, side: B.kirishi });
      bridge(b, 0, -28, -18, HT, MB);
      yaguramon(frame(b, 0, -15, 0), HT, { m, wall: B.shikkui });
      // buildings
      for (const [z0, z1] of [[-24, -8], [-4, 12]]) { const { f, W, D } = placeRect(b, -39, z0, -33, z1, 1); nagaya(f, W, D, NT, { m }); }
      for (const z0 of [-22, -12, -2, 8]) { const { f, W, D } = placeRect(b, 34, z0, 38, z0 + 6, 3); kura(f, W, D, NT, { m }); }
      { const { f, W, D } = placeRect(b, -9, 29, 9, 35, 0); goten(f, W, D, NT, { m, loot: 'wajo_palace' }); }
      for (const [x, z] of [[14, -40], [20, -40], [26, -40], [14, -33], [20, -33]]) { b.put(x, NT + 1, z, B.spruce_fence); b.put(x, NT + 2, z, B.hay_bale); }
      for (const z of [-24, -18, -12, -6, 0, 6, 12]) { b.put(29, NT + 1, z, B.nobori + 3); b.put(29, NT + 2, z, B.nobori + 3); }
      well(b, 20, NT, 30);
      // ---- 本丸
      const skipH = (x, z) => (Math.abs(x) >= 12 && (z <= -11 || z >= 9)) || (Math.abs(x) <= 6 && z === H[1]) || (Math.abs(x) <= 9 && z === H[3]);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), HT, {});
      for (const [x0, z0, q] of [[-18, -17, 1], [12, -17, 3], [-18, 9, 1], [12, 9, 3]]) {
        const { f, W, D } = placeRect(b, x0, z0, x0 + 6, z0 + 6, q);
        yagura(f, W, D, HT, { m, wall: B.shikkui, n: 2 });
      }
      for (let z = -12; z <= -2; z++) for (let x = -1; x <= 1; x++) b.put(x, HT, z, B.gravel);
      { const { f, W, D } = placeRect(b, -15, -10, -5, -4, 0); goten(f, W, D, HT, { m, shachi: true, loot: 'wajo_palace' }); }
      // garden with a pond, stone lanterns and pines
      for (let z = -9; z <= -5; z++) for (let x = 8; x <= 13; x++) { b.put(x, HT - 1, z, B.clay); b.put(x, HT, z, B.water); }
      for (const [x, z] of [[5, -10], [15, -4], [5, -4]]) b.put(x, HT + 1, z, B.toro);
      matsu(b, 15, HT, -9, rnd); matsu(b, 10, HT, -3, rnd);
      const t = tenshu(b, ctx, { X0: -7, Z0: 1, X1: 7, Z1: 13, g: HT, n: 5, m, wall: B.shikkui, chidori: [[1, [0, 2]], [3, [1, 3]], [0, [0]]] });

      // ---- garrison
      const g1 = ctx.group('ote', b, -16, NT + 1, -38, 42, 12);
      for (const [x, z, ty] of [[-15, -36, 'ashigaru'], [-15, -40, 'ashigaru'], [-6, -38, 'samurai'], [-17, -46, 'yumi_ashigaru']]) ctx.mob(g1, b, x, NT + 1, z, ty);
      const g2 = ctx.group('front', b, 14, NT + 1, -36, 40, 12);
      for (const [x, z, ty] of [[12, -36, 'teppo_ashigaru'], [22, -36, 'teppo_ashigaru'], [18, -31, 'ashigaru'], [6, -33, 'yumi_ashigaru']]) ctx.mob(g2, b, x, NT + 1, z, ty);
      const g3 = ctx.group('west', b, -35, NT + 1, 0, 38, 12);
      for (const [x, z, ty] of [[-31, -14, 'ashigaru'], [-31, 4, 'ashigaru'], [-31, -2, 'samurai']]) ctx.mob(g3, b, x, NT + 1, z, ty);
      const g4 = ctx.group('east', b, 34, NT + 1, 0, 38, 12);
      for (const [x, z, ty] of [[31, -16, 'ashigaru'], [31, 6, 'yumi_ashigaru'], [31, -4, 'ashigaru']]) ctx.mob(g4, b, x, NT + 1, z, ty);
      const g5 = ctx.group('back', b, 0, NT + 1, 32, 38, 12);
      for (const [x, z, ty] of [[-14, 30, 'ashigaru'], [14, 31, 'teppo_ashigaru'], [0, 28, 'ashigaru']]) ctx.mob(g5, b, x, NT + 1, z, ty);
      const g6 = ctx.group('honmaru', b, 0, HT + 1, -6, 30, 6);
      for (const [x, z, ty] of [[-3, -11, 'samurai'], [3, -11, 'samurai'], [8, -11, 'yumi_ashigaru'], [14, -6, 'yumi_ashigaru'], [-10, -2, 'ashigaru'], [-3, -3, 'teppo_ashigaru']]) {
        ctx.mob(g6, b, x, HT + 1, z, ty);
      }
      tenshuGarrison(ctx, b, t, [['samurai', 'samurai'], ['samurai', 'ashigaru'], ['ninja', 'yumi_ashigaru'], ['samurai'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-17, fy + 1, -62);
    },

    // ============================================================ 平山城: stone terraces stepping down a hill
    hirayama(b, ctx, site) {
      const B = BL(), m = KAWARA(), rnd = ctx.rnd;
      const HT = site.fy, NT = HT - 6, ST = NT - 5;
      const H = [-14, -4, 14, 22], O = [-30, -24, 30, 30], HO = [-17, -7, 17, 25], S3 = [-34, -46, 34, -27];
      const G = site.snowy ? B.snowy_grass : B.grass;
      // lowest natural ground along a rect's outline (the foot of its wall), bounded
      const footOf = (R, lo) => {
        let mn = Infinity;
        for (const [x, z] of perimeter(R[0] - 3, R[1] - 3, R[2] + 3, R[3] + 3)) mn = Math.min(mn, b.nat(x, z));
        return MC.clamp(mn, lo, lo + 8) - 1;
      };
      const baseN = Math.min(ST, footOf(O, ST - 9)), baseS = Math.min(ST - 1, footOf(S3, ST - 12));
      // dry moat in front of the lowest terrace
      const EXT = 74;
      const sdAll = (x, z) => Math.min(rectSd(O[0] - 3, O[1] - 3, O[2] + 3, O[3] + 3)(x, z), rectSd(S3[0] - 3, S3[1] - 8, S3[2] + 3, S3[3])(x, z));
      apron(b, site, -EXT, -EXT, EXT, EXT, baseS + 1, (x, z) => (sdAll(x, z) - 2) / 20, (x, z) => sdAll(x, z) <= 0, ST - 2);
      const air = (y) => (y > baseS ? 0 : -1);
      // 空堀 in front of the sannomaru, an earthen causeway (土橋) left standing at the gate
      for (let z = S3[1] - 8; z <= S3[1] - 3; z++) for (let x = S3[0] - 3; x <= S3[2] + 3; x++) {
        if (Math.abs(x) <= 2) { ground(b, x, z, ST, B.dirt_path); continue; }
        if (z > S3[1] - 4) continue;
        const nh = Math.max(b.nat(x, z), baseS + 1);
        for (let y = baseS - 3; y <= nh + 6; y++) b.put(x, y, z, y === baseS - 3 ? B.gravel : 0);
      }
      // 大手坂: a stone stairway from the causeway down the hillside until it meets the ground
      let rampEnd = S3[1] - 9;
      {
        const topAt = (x, z) => { for (let y = ST + 12; y > ST - 40; y--) { const v = b.get(x, y, z); if (v) return y; if (v === undefined && y <= b.nat(x, z)) return y; } return ST - 40; };
        for (let k = 1, y = ST; k <= 40; k++) {
          const z = S3[1] - 8 - k;
          const gnd = Math.max(topAt(-2, z), topAt(0, z), topAt(2, z));
          if (y - 1 <= gnd) { rampEnd = z; break; }
          y--;
          for (let x = -2; x <= 2; x++) {
            for (let yy = Math.min(b.nat(x, z), y) - 1; yy < y; yy++) b.put(x, yy, z, B.cobblestone);
            b.put(x, y, z, B.cobblestone_stairs + 0);
            for (let h = 1; h <= 4; h++) b.put(x, y + h, z, 0);
          }
          for (const x of [-3, 3]) for (let yy = Math.min(b.nat(x, z), y) - 1; yy <= y; yy++) b.put(x, yy, z, B.ishigaki);
          rampEnd = z - 1;
        }
      }
      terrace(b, { box: S3, A: 2, top: ST, base: baseS, sd: rectSd(...S3), surf: G, corner: corners(...S3), out: air });
      for (let z = S3[1] - 8; z <= S3[1] - 1; z++) for (let x = -2; x <= 2; x++) ground(b, x, z, ST, B.dirt_path);
      terrace(b, { box: O, A: 2, top: NT, base: baseN, sd: ringSd(O, HO), surf: G, corner: corners(...O), out: (y) => (y > baseN ? 0 : -1) });
      terrace(b, { box: H, A: 3, top: HT, base: NT, sd: rectSd(...H), surf: G, corner: corners(...H), out: (y) => (y > NT ? 0 : -1) });
      // ---- 三の丸: main gate, barracks, storehouses
      dobei(b, perimeter(...S3).filter(([x, z]) => z !== S3[3] && !(z === S3[1] && Math.abs(x) <= 3)), ST, { low: B.kuro_itabari });
      koraimon(frame(b, 0, S3[1], 0), ST, { m, path: B.dirt_path });
      for (let z = S3[1]; z <= -32; z++) for (let x = -1; x <= 1; x++) b.put(x, ST, z, B.dirt_path);
      for (let x = 2; x <= 8; x++) for (let z = -34; z <= -32; z++) b.put(x, ST, z, B.dirt_path);
      { const { f, W, D } = placeRect(b, -31, -43, -13, -35, 2); nagaya(f, W, D, ST, { m }); }
      { const { f, W, D } = placeRect(b, 18, -44, 24, -38, 2); kura(f, W, D, ST, { m, low: B.kuro_itabari }); }
      { const { f, W, D } = placeRect(b, 26, -44, 32, -38, 2); kura(f, W, D, ST, { m, low: B.kuro_itabari }); }
      // ---- 二の丸: gate up from the sannomaru (east), walls, turrets, hall
      stepsUp(b, 6, 10, -31, 1, ST, NT - ST, B.stone_brick_stairs, B.ishigaki, { land: 2, side: B.kirishi });
      yaguramon(frame(b, 8, -22, 0), NT, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });
      const skipN = (x, z) => (z === O[1] && x >= 1 && x <= 15) || (Math.abs(x) >= 24 && z <= -18);
      dobei(b, perimeter(...O).filter(([x, z]) => !skipN(x, z)), NT, { low: B.kuro_itabari });
      for (const x0 of [-30, 24]) { const { f, W, D } = placeRect(b, x0, -24, x0 + 6, -18, 2); yagura(f, W, D, NT, { m, wall: B.kuro_itabari, band: B.shikkui, n: 2, gw: B.kuro_itabari }); }
      { const { f, W, D } = placeRect(b, -28, -2, -20, 20, 1); nagaya(f, W, D, NT, { m }); }
      { const { f, W, D } = placeRect(b, 20, 0, 28, 10, 3); goten(f, W, D, NT, { m, loot: 'wajo_palace' }); }
      well(b, 24, NT, 16);
      for (let z = -21; z <= -9; z++) for (let x = -8; x <= 8; x++) if (Math.abs(x + 6) <= 1 || z <= -18 && x >= -8) b.put(x, NT, z, B.gravel);
      // ---- 本丸: gate up from the ninomaru (west of centre), turret, tenshu with its black walls
      stepsUp(b, -8, -4, -12, 1, NT, HT - NT, B.stone_brick_stairs, B.ishigaki, { land: 2, side: B.kirishi });
      yaguramon(frame(b, -6, -2, 0), HT, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });
      const skipH = (x, z) => (z === H[1] && x >= -12 && x <= 0) || (x >= 8 && z <= 2);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), HT, { low: B.kuro_itabari });
      { const { f, W, D } = placeRect(b, 8, -4, 14, 2, 3); yagura(f, W, D, HT, { m, wall: B.kuro_itabari, band: B.shikkui, n: 3, shachi: true, gw: B.kuro_itabari }); }
      for (const [x, z] of [[-11, 2], [4, 3]]) b.put(x, HT + 1, z, B.toro);
      matsu(b, -11, HT, 8, rnd); matsu(b, 11, HT, 18, rnd);
      const t = tenshu(b, ctx, { X0: -6, Z0: 7, X1: 6, Z1: 17, g: HT, n: 4, m, wall: B.kuro_itabari, low: B.kuro_itabari, band: B.shikkui, gw: B.kuro_itabari,
        chidori: [[0, [1, 3]], [2, [0, 2]]] });
      // ---- garrison
      const g1 = ctx.group('sannomaru', b, 0, ST + 1, -36, 40, 10);
      for (const [x, z, ty] of [[-4, -40, 'ashigaru'], [4, -40, 'ashigaru'], [12, -33, 'teppo_ashigaru'], [-10, -33, 'yumi_ashigaru'], [20, -34, 'samurai']]) ctx.mob(g1, b, x, ST + 1, z, ty);
      const g2 = ctx.group('ninomaru', b, 0, NT + 1, -14, 40, 8);
      for (const [x, z, ty] of [[6, -16, 'samurai'], [-12, -14, 'ashigaru'], [22, -14, 'yumi_ashigaru'], [-19, 10, 'ashigaru'], [24, 20, 'teppo_ashigaru']]) ctx.mob(g2, b, x, NT + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, HT + 1, 4, 28, 6);
      for (const [x, z, ty] of [[-6, 3, 'samurai'], [-3, 3, 'samurai'], [10, 6, 'yumi_ashigaru'], [-10, 14, 'teppo_ashigaru']]) ctx.mob(g3, b, x, HT + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'ashigaru'], ['samurai', 'yumi_ashigaru'], ['ninja', 'samurai'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(0, ST + 1, rampEnd - 1);
    },

    // ============================================================ 山城: terraces down a mountain ridge
    yamajiro(b, ctx, site) {
      const B = BL(), m = KAYA();
      // 山頂の主峰を本丸（T1）とし、尾根筋の実際の標高に沿って二の丸（T2）、三の丸（T3）を段状に連ねる（連郭式）
      const T1 = site.fy;
      const T2 = MC.clamp(Math.round(b.nat(0, -18)), T1 - 7, T1 - 3);
      const T3 = MC.clamp(Math.round(b.nat(0, -36)), T2 - 7, T2 - 3);
      const K1 = [-8, -7, 8, 7], K2 = [-7, -24, 7, -13], K3 = [-8, -42, 8, -30];
      const surf = site.snowy ? B.snowy_grass : B.grass;
      const kuruwa = [[K1, T1], [K2, T2], [K3, T3]];
      // terrain: flat enclosures; around them the mountain is cut back, or built up into steep earthen slopes
      // (切岸) falling two blocks per block until they meet the natural slope
      const TH = new Map(), key = (x, z) => (x + 512) * 1024 + z + 512;
      for (let z = -66; z <= 32; z++) for (let x = -36; x <= 36; x++) {
        const nh = b.nat(x, z);
        let h = nh, inside = false, dMin = 99;
        for (const [R, t] of kuruwa) if (rectSd(...R)(x, z) <= 0) { h = t; inside = true; }
        if (!inside) {
          // slope rate: two blocks per block near the edge, steeper and ragged further down
          const jit = MC.hash2(x, z, 4401) * 1.6 + MC.hash2(x >> 2, z >> 2, 4402) * 1.4;
          const drop = (d) => Math.round(2 * d + (d > 2 ? (d - 2) * 0.6 + jit : 0));
          for (const [R, t] of kuruwa) { const d = rectSd(...R)(x, z); dMin = Math.min(dMin, d); if (d <= 10 && h > t + drop(d)) h = t + drop(d); }
          for (const [R, t] of kuruwa) { const d = rectSd(...R)(x, z); if (h < t - drop(d)) h = t - drop(d); }
          // 腰曲輪: a narrow ledge around the honmaru's sides and back
          const dk = rectSd(...K1)(x, z);
          if ((dk === 2 || dk === 3) && z > K1[1] + 1) h = T1 - 4;
        }
        TH.set(key(x, z), h);
        if (h === nh && !inside) continue;
        // steep man-made faces are bare rock like the mountain's own cliffs, with a little grass
        const bare = !inside && dMin > 1 && Math.abs(h - nh) > 2 && MC.hash2(x, z, 4403) > 0.22;
        ground(b, x, z, h, bare ? (MC.hash2(x, z, 4404) < 0.2 ? B.gravel : B.stone) : surf, { clear: inside ? 10 : 6, sub: bare ? B.stone : undefined });
      }
      const th = (x, z) => { const v = TH.get(key(x, z)); return v === undefined ? b.nat(x, z) : v; };
      // 堀切: 尾根を直角に断ち切る空堀溝。両翼の竪堀と一体化
      const trench = (z0, z1, bottom) => {
        for (let z = z0; z <= z1; z++) for (let x = -30; x <= 30; x++) {
          const t = th(x, z);
          if (Math.abs(x) <= 12) { for (let y = Math.min(bottom, t); y <= Math.max(t, T1) + 2; y++) b.put(x, y, z, y === Math.min(bottom, t) ? B.dirt : 0); }
          else if (z > z0 && z < z1) { for (let y = t - 2; y <= t + 2; y++) b.put(x, y, z, y === t - 2 ? B.dirt : 0); }
        }
      };
      trench(-12, -10, T2 - 4);
      trench(-29, -27, T3 - 4);
      // 堀切を渡る木橋、高位曲輪（虎口）へ登る木階段
      bridge(b, 0, -13, -9, T2, T2 - 4);
      stepsUp(b, -1, 1, -8, 1, T2, T1 - T2, B.spruce_stairs, B.dirt, { land: 1, top: B.dirt_path });
      bridge(b, 0, -30, -26, T3, T3 - 4);
      stepsUp(b, -1, 1, -25, 1, T3, T2 - T3, B.spruce_stairs, B.dirt, { land: 1, top: B.dirt_path });
      // 大手道: 三の丸冠木門から尾根の背骨に沿って滑らかに降下する切通しの土坂・石段
      for (let k = 1, y = T3; k <= 44; k++) {
        const z = K3[1] - k, nh = Math.max(b.nat(-1, z), b.nat(0, z), b.nat(1, z));
        const cut = nh >= y;
        if (!cut) y = Math.max(y - 1, nh);
        for (let dx = -1; dx <= 1; dx++) ground(b, dx, z, y, B.dirt_path, { clear: 4 });
        if (!cut && y <= nh && k > 12) break;
      }
      // ---- palisades and gates
      const edge = (R, skip) => perimeter(...R).filter(([x, z]) => !skip(x, z));
      saku(b, edge(K1, (x, z) => Math.abs(x) <= 2 && z === K1[1]), T1);
      saku(b, edge(K2, (x, z) => Math.abs(x) <= 2 && (z === K2[1] || z === K2[3])), T2);
      saku(b, edge(K3, (x, z) => Math.abs(x) <= 2 && (z === K3[1] || z === K3[3])), T3);
      kabukimon(frame(b, 0, -8 + (T1 - T2), 0), T1, { cap: B.kaya_slab });
      kabukimon(frame(b, 0, -25 + (T2 - T3), 0), T2, { cap: B.kaya_slab });
      kabukimon(frame(b, 0, K3[1], 0), T3, { cap: B.kaya_slab });
      // ---- 本丸: 三重天守（黒下見板張り・白漆喰帯・瓦葺き・千鳥破風・金の鯱）
      const t = tenshu(b, ctx, {
        X0: -6, Z0: -1, X1: 6, Z1: 7, g: T1, n: 3, baseH: 3, m: KAWARA(),
        wall: B.kuro_itabari, low: B.kuro_itabari, band: B.shikkui, gw: B.kuro_itabari,
        chidori: [[0, [0, 2]], [1, [1, 3]]]
      });
      { const { f, W, D } = placeRect(b, 4, -6, 8, -2, 3); kura(f, W, D, T1, { m, low: B.kuro_itabari, wall: B.kuro_itabari, lowH: 3 }); }
      for (let z = -7 + (T1 - T2); z <= -2; z++) for (let x = -1; x <= 1; x++) b.put(x, T1, z, B.gravel);
      b.put(-4, T1 + 1, -5, B.toro); b.put(4, T1 + 1, -5, B.toro);
      // ---- 二の丸: barracks, well; 三の丸: barracks, watchtower, banners
      { const { f, W, D } = placeRect(b, -7, -24, -3, -19, 1); nagaya(f, W, D, T2, { m, low: B.kuro_itabari, band: B.kuro_itabari }); }
      well(b, 5, T2, -15);
      monomi(frame(b, 3, -41, 0), T3, { m });
      { const { f, W, D } = placeRect(b, -8, -40, -4, -31, 1); nagaya(f, W, D, T3, { m, low: B.kuro_itabari, band: B.kuro_itabari }); }
      for (const z of [-34, -32]) { b.put(6, T3 + 1, z, B.nobori + 1); b.put(6, T3 + 2, z, B.nobori + 1); }
      // ---- garrison
      const g3 = ctx.group('sannomaru', b, 0, T3 + 1, -36, 30, 8);
      for (const [x, z, ty] of [[-2, -39, 'ashigaru'], [3, -33, 'ashigaru'], [0, -36, 'ninja'], [-2, -32, 'yumi_ashigaru']]) ctx.mob(g3, b, x, T3 + 1, z, ty);
      ctx.mob(g3, b, 5, T3 + 8, -39, 'yumi_ashigaru');
      const g2 = ctx.group('ninomaru', b, 0, T2 + 1, -18, 26, 8);
      // (clear of the gate, whose place depends on the drop between the enclosures)
      for (const [x, z, ty] of [[5, -22, 'ashigaru'], [-5, -16, 'samurai'], [6, -19, 'ninja'], [1, -14, 'ashigaru']]) ctx.mob(g2, b, x, T2 + 1, z, ty);
      const g1 = ctx.group('honmaru', b, 0, T1 + 1, -3, 24, 8);
      for (const [x, z, ty] of [[-5, -5, 'samurai'], [5, -5, 'samurai'], [-6, -3, 'ninja'], [-5, -1, 'yumi_ashigaru']]) ctx.mob(g1, b, x, T1 + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'ashigaru'], ['ninja', 'yumi_ashigaru'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(0, T3 + 1, K3[1] - 5);
    },

    // ============================================================ 山城②: 雲海城 (梯郭式・天空高石垣城)
    yamajiro_unkai(b, ctx, site) {
      const B = BL(), m = KAWARA(), rnd = ctx.rnd;
      const T1 = site.fy;
      const T2 = T1 - 6;
      const T3 = T2 - 6;
      const H = [-12, -4, 12, 16];                  // 本丸
      const N2 = [-26, -34, 18, -10];               // 二の丸
      const surf = site.snowy ? B.snowy_grass : B.grass;

      // 険しい岩山の削平と高石垣（切岸・急斜面整形）
      const kuruwa = [[H, T1], [N2, T2]];
      const EXT = 66;
      for (let z = -EXT; z <= EXT; z++) for (let x = -EXT; x <= EXT; x++) {
        const nh = b.nat(x, z);
        let h = nh, inside = false, dMin = 99;
        for (const [R, t] of kuruwa) if (rectSd(...R)(x, z) <= 0) { h = t; inside = true; }
        if (!inside) {
          const jit = MC.hash2(x, z, 5501) * 1.5;
          const drop = (d) => Math.round(2 * d + (d > 2 ? (d - 2) * 0.7 + jit : 0));
          for (const [R, t] of kuruwa) { const d = rectSd(...R)(x, z); dMin = Math.min(dMin, d); if (d <= 12 && h > t + drop(d)) h = t + drop(d); }
          for (const [R, t] of kuruwa) { const d = rectSd(...R)(x, z); if (h < t - drop(d)) h = t - drop(d); }
        }
        if (h !== nh || inside) {
          const bare = !inside && dMin > 1 && Math.abs(h - nh) > 2;
          ground(b, x, z, h, bare ? (MC.hash2(x, z, 5503) < 0.25 ? B.gravel : B.stone) : surf, { clear: inside ? 10 : 5 });
        }
      }

      // 高石垣テラス（扇の勾配）
      terrace(b, { box: N2, A: 3, top: T2, base: T3 - 2, sd: rectSd(...N2), surf, corner: corners(...N2) });
      terrace(b, { box: H, A: 3, top: T1, base: T2 - 2, sd: rectSd(...H), surf, corner: corners(...H) });

      // ---- 二の丸（一段低いテラス）: 枡形門、二の丸御殿、武具長屋、土蔵、井戸
      const skipN = (x, z) => (z === N2[1] && x >= -22 && x <= -10) || (x >= 12 && z >= -14 && z <= -10);
      dobei(b, perimeter(...N2).filter(([x, z]) => !skipN(x, z)), T2, { low: B.kirishi });
      {
        const f = frame(b, -22, -34, 0);
        f.fill(1, T2 + 1, 1, 10, T2 + 4, 11, 0);
        f.fill(1, T2, 1, 10, T2, 11, B.gravel);
        dobei(f, perimeter(0, 0, 0, 12).concat(perimeter(0, 12, 11, 12)), T2, { low: B.kirishi });
        koraimon(frame(f, 5, 0, 0), T2, { m });
        yaguramon(frame(f, 11, 6, 3), T2, { m, wall: B.shikkui });
      }
      { const { f, W, D } = placeRect(b, -6, -26, 8, -16, 0); goten(f, W, D, T2, { m, shachi: true, loot: 'wajo_palace' }); }
      { const { f, W, D } = placeRect(b, -24, -20, -14, -12, 1); nagaya(f, W, D, T2, { m }); }
      { const { f, W, D } = placeRect(b, 10, -26, 16, -20, 3); kura(f, W, D, T2, { m }); }
      well(b, 13, T2, -15);
      for (let z = -32; z <= -12; z++) for (let x = -10; x <= -6; x++) b.put(x, T2, z, B.gravel);
      for (let x = -6; x <= 0; x++) for (let z = -14; z <= -12; z++) b.put(x, T2, z, B.gravel);

      // 二の丸から本丸へ登る石段と本丸櫓門
      stepsUp(b, -2, 2, -10, 1, T2, T1 - T2, B.stone_brick_stairs, B.ishigaki, { land: 2, side: B.kirishi });
      yaguramon(frame(b, 0, -4, 0), T1, { m, wall: B.shikkui });

      // ---- 本丸（山頂テラス）: 白漆喰三重天守、渡り櫓、附櫓、庭園
      const skipH = (x, z) => (z === H[1] && Math.abs(x) <= 4);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), T1, { low: B.kirishi });
      const t = tenshu(b, ctx, {
        X0: -5, Z0: 4, X1: 5, Z1: 14, g: T1, n: 3, baseH: 4, m,
        wall: B.shikkui, low: B.shikkui, band: B.shikkui, gw: B.shikkui,
        chidori: [[0, [0, 2]], [1, [1, 3]]]
      });
      // 渡り櫓と附櫓（本丸東側）
      {
        const { f, W, D } = placeRect(b, 5, 7, 10, 11, 1);
        nagaya(f, W, D, T1, { m, band: B.shikkui });
      }
      {
        const { f, W, D } = placeRect(b, 8, 9, 13, 14, 0);
        yagura(f, W, D, T1, { m, wall: B.shikkui, n: 2 });
      }
      for (let z = -2; z <= 2; z++) for (let x = -1; x <= 1; x++) b.put(x, T1, z, B.gravel);
      for (const [x, z] of [[-8, -1], [8, -1], [-8, 8]]) b.put(x, T1 + 1, z, B.toro);
      matsu(b, -8, T1, 3, rnd); matsu(b, -8, T1, 12, rnd);

      // 七曲がり登城石段（大手坂）
      let rampEnd = -38;
      for (let k = 1, y = T2; k <= 36; k++) {
        const z = -34 - k;
        const nh = b.nat(-17, z);
        if (y - 1 <= nh) { rampEnd = z; break; }
        y--;
        for (let x = -19; x <= -15; x++) {
          b.put(x, y, z, B.cobblestone_stairs + 0);
          for (let h = 1; h <= 4; h++) b.put(x, y + h, z, 0);
        }
        rampEnd = z - 1;
      }

      // ---- garrison
      const g1 = ctx.group('ote', b, -17, T2 + 1, -34, 38, 10);
      for (const [x, z, ty] of [[-17, -30, 'ashigaru'], [-12, -28, 'samurai'], [-20, -24, 'yumi_ashigaru']]) ctx.mob(g1, b, x, T2 + 1, z, ty);
      const g2 = ctx.group('ninomaru', b, 0, T2 + 1, -20, 36, 8);
      for (const [x, z, ty] of [[0, -24, 'samurai'], [-18, -16, 'ashigaru'], [12, -18, 'teppo_ashigaru'], [6, -14, 'yumi_ashigaru']]) ctx.mob(g2, b, x, T2 + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, T1 + 1, 0, 26, 6);
      for (const [x, z, ty] of [[-3, -1, 'samurai'], [3, -1, 'samurai'], [-6, 6, 'teppo_ashigaru'], [6, 4, 'yumi_ashigaru']]) ctx.mob(g3, b, x, T1 + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'yumi_ashigaru'], ['samurai', 'teppo_ashigaru'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-17, T2 + 1, rampEnd);
    },

    // ============================================================ 山城③: 金華城 (輪郭式・孤峰天険城)
    yamajiro_kinka(b, ctx, site) {
      const B = BL(), m = KAWARA(), rnd = ctx.rnd;
      const T1 = site.fy;
      const T2 = T1 - 7;
      const H = [-11, -10, 11, 14];                 // 山頂本丸
      const O = [-28, -34, 28, 28], HO = [-15, -13, 15, 17]; // 同心円帯曲輪（二の丸）
      const surf = site.snowy ? B.snowy_grass : B.grass;

      // 孤峰山頂の整形と切岸
      const EXT = 64;
      for (let z = -EXT; z <= EXT; z++) for (let x = -EXT; x <= EXT; x++) {
        const nh = b.nat(x, z);
        const inH = rectSd(...H)(x, z) <= 0;
        const inO = ringSd(O, HO)(x, z) <= 0;
        let h = nh;
        if (inH) h = T1;
        else if (inO) h = T2;
        else {
          const dH = rectSd(...H)(x, z), dO = rectSd(...O)(x, z);
          if (dH <= 8 && h > T1 + dH * 2) h = T1 + dH * 2;
          if (dO <= 14 && h > T2 + dO * 1.8) h = T2 + dO * 1.8;
          if (dO > 0 && h < T2 - dO * 2) h = T2 - dO * 2;
        }
        if (h !== nh || inH || inO) {
          const bare = !inH && !inO && Math.abs(h - nh) > 2;
          ground(b, x, z, h, bare ? (MC.hash2(x, z, 6602) < 0.25 ? B.gravel : B.stone) : surf, { clear: inH || inO ? 10 : 5 });
        }
      }

      // 石垣造成（同心円段）
      terrace(b, { box: O, A: 3, top: T2, base: T2 - 6, sd: ringSd(O, HO), surf, corner: corners(...O) });
      terrace(b, { box: H, A: 3, top: T1, base: T2, sd: rectSd(...H), surf, corner: corners(...H) });

      // ---- 二の丸（同心円帯曲輪）: 東西隅櫓、長屋、武器庫、二の丸櫓門
      const skipN = (x, z) => (z === O[1] && Math.abs(x + 10) <= 6);
      dobei(b, perimeter(...O).filter(([x, z]) => !skipN(x, z)), T2, { low: B.kuro_itabari });
      for (const [x0, z0, q] of [[-28, -8, 1], [22, -8, 3]]) {
        const { f, W, D } = placeRect(b, x0, z0, x0 + 6, z0 + 6, q);
        yagura(f, W, D, T2, { m, wall: B.kuro_itabari, band: B.shikkui, n: 2 });
      }
      yaguramon(frame(b, -10, O[1], 0), T2, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });
      { const { f, W, D } = placeRect(b, -26, 6, -18, 22, 1); nagaya(f, W, D, T2, { m }); }
      { const { f, W, D } = placeRect(b, 18, 6, 26, 16, 3); kura(f, W, D, T2, { m, low: B.kuro_itabari, wall: B.kuro_itabari }); }
      well(b, 20, T2, -18);

      // 二の丸から本丸へ登る石段と本丸櫓門
      stepsUp(b, -2, 2, -14, 1, T2, T1 - T2, B.stone_brick_stairs, B.ishigaki, { land: 2, side: B.kirishi });
      yaguramon(frame(b, 0, -10, 0), T1, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });

      // ---- 本丸（最高峰）: 壮麗な四重天守（黒板・白漆喰重層・金の鯱）、庭園
      const skipH = (x, z) => (z === H[1] && Math.abs(x) <= 4);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), T1, { low: B.kuro_itabari });
      const t = tenshu(b, ctx, {
        X0: -6, Z0: -2, X1: 6, Z1: 10, g: T1, n: 4, baseH: 4, m,
        wall: B.kuro_itabari, low: B.kuro_itabari, band: B.shikkui, gw: B.kuro_itabari,
        chidori: [[0, [1, 3]], [2, [0, 2]]]
      });
      for (let z = -9; z <= -3; z++) for (let x = -1; x <= 1; x++) b.put(x, T1, z, B.gravel);
      for (const [x, z] of [[-8, -6], [8, -6]]) b.put(x, T1 + 1, z, B.toro);
      matsu(b, -8, T1, 2, rnd); matsu(b, 8, T1, 6, rnd);

      // 九十九折りの急坂石段
      let rampEnd = O[1] - 4;
      for (let k = 1, y = T2; k <= 38; k++) {
        const z = O[1] - k;
        const nh = b.nat(-10, z);
        if (y - 1 <= nh) { rampEnd = z; break; }
        y--;
        for (let x = -12; x <= -8; x++) {
          b.put(x, y, z, B.cobblestone_stairs + 0);
          for (let h = 1; h <= 4; h++) b.put(x, y + h, z, 0);
        }
        rampEnd = z - 1;
      }

      // ---- garrison
      const g1 = ctx.group('ote', b, -10, T2 + 1, O[1], 36, 10);
      for (const [x, z, ty] of [[-10, O[1] + 4, 'ashigaru'], [-6, O[1] + 4, 'samurai'], [-14, O[1] + 6, 'teppo_ashigaru']]) ctx.mob(g1, b, x, T2 + 1, z, ty);
      const g2 = ctx.group('obikuruwa', b, 0, T2 + 1, 0, 42, 8);
      for (const [x, z, ty] of [[-20, 10, 'samurai'], [20, 10, 'ashigaru'], [-20, -10, 'yumi_ashigaru'], [20, -10, 'teppo_ashigaru']]) ctx.mob(g2, b, x, T2 + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, T1 + 1, -4, 26, 6);
      for (const [x, z, ty] of [[-3, -5, 'samurai'], [3, -5, 'samurai'], [-8, 2, 'teppo_ashigaru'], [8, 2, 'yumi_ashigaru']]) ctx.mob(g3, b, x, T1 + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'ashigaru'], ['samurai', 'teppo_ashigaru'], ['ninja', 'samurai'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-10, T2 + 1, rampEnd);
    },

    // ============================================================ 海城: the sea as the moat
    umijiro(b, ctx, site) {
      const B = BL(), m = DOGAWARA(), rnd = ctx.rnd;
      const WL = SEA - 1, MB = SEA - 6;
      const NT = Math.max(SEA + 2, site.fy || (SEA + 2)), HT = NT + 5;
      const H = [-14, 0, 14, 26], N2 = [-30, -34, 30, -12], WQ = [-24, -11, 24, 36];
      const G = site.snowy ? B.snowy_grass : B.grass;

      // 陸地側（二の丸）周辺の地盤を整地し、後方本土へ滑らかにブレンド
      const sdN = rectSd(N2[0] - 4, N2[1] - 6, N2[2] + 4, N2[3]);
      apron(b, site, -56, -60, 56, -8, NT, (x, z) => (sdN(x, z) - 1) / 16, (x, z) => sdN(x, z) <= 0 || rectSd(...WQ)(x, z) <= 0);
      for (let z = N2[1] - 6; z <= N2[3]; z++) for (let x = N2[0] - 4; x <= N2[2] + 4; x++) ground(b, x, z, NT, G);

      // 本丸と二の丸の間の海水堀（canal）：海面高さ（WL = SEA - 1）で東西の外海へ自然に貫通
      for (let z = -11; z <= -1; z++) for (let x = -24; x <= 24; x++) moatCol(b, x, z, MB, WL);

      // 本丸外周（海域）：強引な四角い掘削をやめ、自然な海底深度を保ちつつ石垣裾部に捨石（根固め石）を配置
      for (let z = 0; z <= 36; z++) for (let x = -24; x <= 24; x++) {
        if (rectSd(...H)(x, z) <= 0) continue;
        const nh = b.nat(x, z);
        if (nh >= SEA) {
          moatCol(b, x, z, MB, WL, B.sand);
        } else {
          const dH = rectSd(...H)(x, z);
          const bed = Math.min(nh, WL - 3);
          // 石垣の際（dH <= 2）には波浪を防ぐ捨石（cobblestone / gravel）を敷設
          const bedBlock = dH <= 2 ? (rnd() < 0.35 ? B.mossy_cobblestone : B.cobblestone) : (nh <= WL - 4 ? B.gravel : B.sand);
          moatCol(b, x, z, bed, WL, bedBlock);
        }
      }

      const water = (y) => (y <= MB ? -1 : y <= WL ? B.water : 0);
      terrace(b, { box: N2, A: 2, top: NT, base: MB, sd: rectSd(...N2), surf: G, corner: corners(...N2), out: (y, x, z) => (z > N2[3] ? water(y) : -1) });
      terrace(b, { box: H, A: 3, top: HT, base: MB, sd: rectSd(...H), surf: G, corner: corners(...H), out: water });

      // 水門（船入）：東側の外海へ向けて開放。石垣水門、木造桟橋、係留杭、船着場を自然に造営
      for (let z = 9; z <= 15; z++) for (let x = 7; x <= 21; x++) {
        const gate = x >= 13;
        if (gate && (z < 11 || z > 13)) continue;
        for (let y = MB + 1; y <= WL; y++) b.put(x, y, z, B.water);
        for (let y = WL + 1; y <= (gate ? WL + 3 : HT); y++) b.put(x, y, z, 0);
      }
      for (const [x, z] of perimeter(6, 8, 13, 16)) {
        if (x === 13 && z >= 11 && z <= 13) continue;
        for (let y = MB; y <= HT; y++) b.put(x, y, z, y === HT ? B.kirishi : B.ishigaki);
      }
      for (let z = 10; z <= 14; z++) for (let x = 13; x <= 15; x++) b.put(x, WL + 4, z, B.kirishi);
      for (let x = 7; x <= 11; x++) b.put(x, WL + 1, 9, B.spruce_slab);
      // 外海へと伸びる木造桟橋と係留杭
      for (let x = 15; x <= 22; x++) {
        b.put(x, WL + 1, 12, B.spruce_slab);
        if (x % 3 === 0) {
          b.put(x, WL + 2, 11, B.spruce_fence);
          b.put(x, WL + 2, 13, B.spruce_fence);
          for (let y = MB; y <= WL; y++) b.put(x, y, 12, B.spruce_log);
        }
      }

      // ---- 二の丸（陸側城郭）: 塀、枡形門、長屋、土蔵
      const skipN = (x, z) => (z === N2[1] && x >= -26 && x <= -12) || (x >= 24 && z <= -28);
      dobei(b, perimeter(...N2).filter(([x, z]) => !skipN(x, z) && z !== N2[3]), NT, { low: B.namako, cap: B.dogawara_slab });
      dobei(b, perimeter(...N2).filter(([x, z]) => z === N2[3] && Math.abs(x) > 2), NT, { low: B.namako, cap: B.dogawara_slab });
      {
        const f = frame(b, -26, -34, 0);
        f.fill(1, NT + 1, 1, 10, NT + 4, 11, 0);
        f.fill(1, NT, 1, 10, NT, 11, B.gravel);
        dobei(f, perimeter(0, 0, 0, 12).concat(perimeter(0, 12, 11, 12)), NT, { low: B.namako, cap: B.dogawara_slab });
        koraimon(frame(f, 5, 0, 0), NT, { m });
        yaguramon(frame(f, 11, 6, 3), NT, { m, wall: B.shikkui, low: B.namako });
      }
      { const { f, W, D } = placeRect(b, 24, -34, 30, -28, 2); yagura(f, W, D, NT, { m, wall: B.shikkui, low: B.namako, n: 2 }); }
      { const { f, W, D } = placeRect(b, 4, -32, 22, -26, 2); nagaya(f, W, D, NT, { m, low: B.namako, band: B.shikkui }); }
      for (const x0 of [-20, -12]) { const { f, W, D } = placeRect(b, x0, -20, x0 + 4, -14, 1); kura(f, W, D, NT, { m }); }
      for (let z = -29; z <= -12; z++) for (let x = -1; x <= 1; x++) b.put(x, NT, z, B.gravel);
      for (let z = -29; z <= -27; z++) for (let x = -13; x <= -2; x++) b.put(x, NT, z, B.gravel);

      // 二の丸から本丸へ渡る木橋と石段
      bridge(b, 0, -12, -4, NT, MB);
      stepsUp(b, -2, 2, -3, 1, NT, HT - NT, B.stone_brick_stairs, B.ishigaki, { side: B.kirishi });
      yaguramon(frame(b, 0, 4, 0), HT, { m, wall: B.shikkui, low: B.namako });

      // ---- 本丸
      const skipH = (x, z) => (z === H[1] && Math.abs(x) <= 6) || ((Math.abs(x) >= 8) && z >= 20) || (x >= 6 && z >= 8 && z <= 16);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), HT, { low: B.namako, cap: B.dogawara_slab });
      for (const [x0, q] of [[-14, 1], [8, 3]]) { const { f, W, D } = placeRect(b, x0, 20, x0 + 6, 26, q); yagura(f, W, D, HT, { m, wall: B.shikkui, low: B.namako, n: 2, shachi: true }); }
      { const { f, W, D } = placeRect(b, -13, 6, -8, 16, 1); goten(f, W, D, HT, { m, loot: 'wajo_palace' }); }
      for (let z = 7; z <= 11; z++) for (let x = -1; x <= 1; x++) b.put(x, HT, z, B.gravel);
      for (const [x, z] of [[-3, 7], [3, 7]]) b.put(x, HT + 1, z, B.toro);
      matsu(b, 4, HT, 4, rnd);
      const t = tenshu(b, ctx, { X0: -5, Z0: 13, X1: 5, Z1: 21, g: HT, n: 3, baseH: 5, m, wall: B.shikkui, low: B.namako, chidori: [[0, [0, 2]], [1, [1, 3]]] });

      // ---- garrison
      const g1 = ctx.group('ote', b, -20, NT + 1, -28, 36, 10);
      for (const [x, z, ty] of [[-20, -28, 'ashigaru'], [-21, -25, 'samurai'], [-10, -30, 'teppo_ashigaru'], [-24, -36, 'yumi_ashigaru']]) ctx.mob(g1, b, x, NT + 1, z, ty);
      const g2 = ctx.group('ninomaru', b, 8, NT + 1, -22, 34, 10);
      for (const [x, z, ty] of [[10, -24, 'teppo_ashigaru'], [16, -22, 'ashigaru'], [-6, -14, 'samurai'], [22, -16, 'yumi_ashigaru']]) ctx.mob(g2, b, x, NT + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, HT + 1, 10, 26, 6);
      for (const [x, z, ty] of [[-2, 8, 'samurai'], [2, 8, 'samurai'], [10, 4, 'teppo_ashigaru'], [-10, 18, 'yumi_ashigaru'], [9, 18, 'ashigaru']]) ctx.mob(g3, b, x, HT + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'teppo_ashigaru'], ['samurai', 'ninja'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-21, NT + 1, -44);
    },

    // ============================================================ 海城②: 浮舟城 (砂州浮城・環水郭城)
    umijiro_ukifune(b, ctx, site) {
      const B = BL(), m = KAWARA(), rnd = ctx.rnd;
      const WL = SEA - 1, MB = SEA - 6;
      const NT = SEA + 3, HT = NT + 4;
      const H = [-16, 2, 16, 32];                    // 水上本丸
      const N2 = [-38, -38, 38, -8];                 // 陸側二の丸
      const WQ = [-42, -42, 42, 38];                 // 外周水域
      const G = site.snowy ? B.snowy_grass : B.grass;

      // 潮入り堀の造成（本丸と二の丸を完全に囲む）
      const sdN = rectSd(N2[0] - 3, N2[1] - 4, N2[2] + 3, N2[3]);
      apron(b, site, -60, -60, 60, -10, NT, (x, z) => (sdN(x, z) - 1) / 16, (x, z) => sdN(x, z) <= 0 || rectSd(...WQ)(x, z) <= 0);
      for (let z = N2[1] - 4; z <= N2[3]; z++) for (let x = N2[0] - 3; x <= N2[2] + 3; x++) ground(b, x, z, NT, G);

      // 本丸周囲および二の丸との間の潮入り海水堀
      for (let z = -8; z <= 36; z++) for (let x = -40; x <= 40; x++) {
        if (rectSd(...H)(x, z) <= 0) continue;
        const nh = b.nat(x, z);
        const bed = Math.min(nh, WL - 3);
        const dH = rectSd(...H)(x, z);
        const bedBlock = dH <= 2 ? (rnd() < 0.4 ? B.mossy_cobblestone : B.cobblestone) : (nh <= WL - 4 ? B.gravel : B.sand);
        moatCol(b, x, z, bed, WL, bedBlock);
      }

      const water = (y) => (y <= MB ? -1 : y <= WL ? B.water : 0);
      terrace(b, { box: N2, A: 2, top: NT, base: MB, sd: rectSd(...N2), surf: G, corner: corners(...N2), out: (y, x, z) => (z > N2[3] ? water(y) : -1) });
      terrace(b, { box: H, A: 3, top: HT, base: MB, sd: rectSd(...H), surf: G, corner: corners(...H), out: water });

      // 雁木（本丸背面の石段船着場）
      for (let x = -4; x <= 4; x++) for (let k = 0; k <= 3; k++) {
        b.put(x, HT - k, 32 - k, B.stone_brick_stairs + 2);
        for (let h = 1; h <= 3; h++) b.put(x, HT - k + h, 32 - k, 0);
      }

      // ---- 二の丸（陸側城郭）: 枡形門、長屋、米蔵、太鼓橋
      const skipN = (x, z) => (z === N2[1] && x >= -28 && x <= -14);
      dobei(b, perimeter(...N2).filter(([x, z]) => !skipN(x, z) && z !== N2[3]), NT, { low: B.namako });
      dobei(b, perimeter(...N2).filter(([x, z]) => z === N2[3] && Math.abs(x) > 3), NT, { low: B.namako });
      {
        const f = frame(b, -28, -38, 0);
        f.fill(1, NT + 1, 1, 10, NT + 4, 11, 0);
        f.fill(1, NT, 1, 10, NT, 11, B.gravel);
        dobei(f, perimeter(0, 0, 0, 12).concat(perimeter(0, 12, 11, 12)), NT, { low: B.namako });
        koraimon(frame(f, 5, 0, 0), NT, { m });
        yaguramon(frame(f, 11, 6, 3), NT, { m, wall: B.shikkui, low: B.namako });
      }
      { const { f, W, D } = placeRect(b, 6, -34, 28, -28, 2); nagaya(f, W, D, NT, { m, low: B.namako }); }
      for (const x0 of [-20, -10]) { const { f, W, D } = placeRect(b, x0, -22, x0 + 5, -16, 1); kura(f, W, D, NT, { m }); }
      well(b, 26, NT, -20);
      for (let z = -32; z <= -8; z++) for (let x = -2; x <= 2; x++) b.put(x, NT, z, B.gravel);
      for (let z = -32; z <= -30; z++) for (let x = -14; x <= -2; x++) b.put(x, NT, z, B.gravel);

      // 二の丸から水上本丸へ渡る太鼓橋（木橋＋石段）
      bridge(b, 0, -8, 1, NT, MB);
      stepsUp(b, -2, 2, 1, 1, NT, HT - NT, B.stone_brick_stairs, B.ishigaki, { side: B.kirishi });
      yaguramon(frame(b, 0, 8, 0), HT, { m, wall: B.shikkui, low: B.namako });

      // ---- 水上本丸: 白漆喰瓦葺き三重天守、月見櫓、潮見櫓、本丸御殿
      const skipH = (x, z) => (z === H[1] && Math.abs(x) <= 6) || (z === H[3] && Math.abs(x) <= 4);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), HT, { low: B.namako });
      for (const [x0, q] of [[-16, 1], [10, 3]]) {
        const { f, W, D } = placeRect(b, x0, 24, x0 + 6, 30, q);
        yagura(f, W, D, HT, { m, wall: B.shikkui, low: B.namako, n: 2, shachi: true });
      }
      { const { f, W, D } = placeRect(b, -14, 10, -6, 20, 1); goten(f, W, D, HT, { m, loot: 'wajo_palace' }); }
      const t = tenshu(b, ctx, {
        X0: -6, Z0: 16, X1: 6, Z1: 26, g: HT, n: 3, baseH: 4, m,
        wall: B.shikkui, low: B.namako, chidori: [[0, [0, 2]], [1, [1, 3]]]
      });
      for (let z = 9; z <= 15; z++) for (let x = -1; x <= 1; x++) b.put(x, HT, z, B.gravel);
      for (const [x, z] of [[-4, 11], [4, 11]]) b.put(x, HT + 1, z, B.toro);
      matsu(b, 6, HT, 10, rnd);

      // ---- garrison
      const g1 = ctx.group('ote', b, -22, NT + 1, -30, 38, 10);
      for (const [x, z, ty] of [[-22, -30, 'ashigaru'], [-20, -26, 'samurai'], [-12, -32, 'teppo_ashigaru'], [-25, -36, 'yumi_ashigaru']]) ctx.mob(g1, b, x, NT + 1, z, ty);
      const g2 = ctx.group('ninomaru', b, 12, NT + 1, -26, 36, 10);
      for (const [x, z, ty] of [[12, -26, 'ashigaru'], [18, -26, 'teppo_ashigaru'], [-4, -16, 'samurai'], [22, -18, 'yumi_ashigaru']]) ctx.mob(g2, b, x, NT + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, HT + 1, 14, 28, 6);
      for (const [x, z, ty] of [[-3, 11, 'samurai'], [3, 11, 'samurai'], [12, 16, 'teppo_ashigaru'], [-12, 22, 'yumi_ashigaru'], [0, 28, 'ashigaru']]) ctx.mob(g3, b, x, HT + 1, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'ashigaru'], ['samurai', 'teppo_ashigaru'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-22, NT + 1, -44);
    },

    // ============================================================ 海城③: 黒潮城 (海食崖・水軍拠点要塞)
    umijiro_kuroshio(b, ctx, site) {
      const B = BL(), m = DOGAWARA(), rnd = ctx.rnd;
      const WL = SEA - 1, MB = SEA - 6;
      const CT = Math.max(SEA + 12, site.fy);
      const HT = CT + 3, NT = CT - 3;
      const H = [-14, 0, 14, 24];                    // 崖上本丸
      const N2 = [-28, -36, 28, -8];                 // 陸側二の丸
      const G = site.snowy ? B.snowy_grass : B.grass;

      // 海食崖の急斜面整形：本丸前面および両翼は一気に海面まで切り落とす
      for (let z = -46; z <= 34; z++) for (let x = -38; x <= 38; x++) {
        const inH = rectSd(...H)(x, z) <= 0;
        const inN = rectSd(...N2)(x, z) <= 0;
        const nh = b.nat(x, z);
        if (inH) { ground(b, x, z, HT, G); continue; }
        if (inN) { ground(b, x, z, NT, G); continue; }
        // 海側（z > 0）は海食断崖
        if (z >= 0) {
          const dH = rectSd(...H)(x, z);
          if (dH <= 4) {
            const cliffH = Math.max(WL + 1, Math.round(HT - dH * 3.5));
            ground(b, x, z, cliffH, B.stone);
          } else {
            moatCol(b, x, z, Math.min(nh, MB), WL, B.cobblestone);
          }
        } else {
          // 陸側ブレンド
          const dN = rectSd(...N2)(x, z);
          if (dN <= 8) {
            const h = Math.round(NT - dN * 0.8);
            ground(b, x, z, h, G);
          }
        }
      }

      // 石垣造成
      terrace(b, { box: N2, A: 2, top: NT, base: NT - 4, sd: rectSd(...N2), surf: G, corner: corners(...N2) });
      terrace(b, { box: H, A: 3, top: HT, base: NT, sd: rectSd(...H), surf: G, corner: corners(...H) });

      // ---- 二の丸（陸側）: 水軍番所、長屋、武器庫、枡形門
      const skipN = (x, z) => (z === N2[1] && x >= -22 && x <= -10);
      dobei(b, perimeter(...N2).filter(([x, z]) => !skipN(x, z) && z !== N2[3]), NT, { low: B.kuro_itabari, cap: B.dogawara_slab });
      dobei(b, perimeter(...N2).filter(([x, z]) => z === N2[3] && Math.abs(x) > 3), NT, { low: B.kuro_itabari, cap: B.dogawara_slab });
      {
        const f = frame(b, -22, -36, 0);
        f.fill(1, NT + 1, 1, 10, NT + 4, 11, 0);
        f.fill(1, NT, 1, 10, NT, 11, B.gravel);
        dobei(f, perimeter(0, 0, 0, 12).concat(perimeter(0, 12, 11, 12)), NT, { low: B.kuro_itabari, cap: B.dogawara_slab });
        koraimon(frame(f, 5, 0, 0), NT, { m });
        yaguramon(frame(f, 11, 6, 3), NT, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });
      }
      { const { f, W, D } = placeRect(b, 4, -32, 22, -26, 2); nagaya(f, W, D, NT, { m, low: B.kuro_itabari }); }
      for (const x0 of [-20, -12]) { const { f, W, D } = placeRect(b, x0, -22, x0 + 4, -16, 1); kura(f, W, D, NT, { m, low: B.kuro_itabari, wall: B.kuro_itabari }); }
      well(b, 20, NT, -18);
      for (let z = -30; z <= -8; z++) for (let x = -2; x <= 2; x++) b.put(x, NT, z, B.gravel);

      // 二の丸から本丸へ登る石段と本丸櫓門
      stepsUp(b, -2, 2, -7, 1, NT, HT - NT, B.stone_brick_stairs, B.ishigaki, { side: B.kirishi });
      yaguramon(frame(b, 0, 0, 0), HT, { m, wall: B.kuro_itabari, band: B.shikkui, low: B.kuro_itabari, gw: B.kuro_itabari });

      // ---- 崖上本丸: 海防三重天守（黒板・銅瓦）、海防角櫓
      const skipH = (x, z) => (z === H[1] && Math.abs(x) <= 4) || (x >= 8 && z >= 18);
      dobei(b, perimeter(...H).filter(([x, z]) => !skipH(x, z)), HT, { low: B.kuro_itabari, cap: B.dogawara_slab });
      {
        const { f, W, D } = placeRect(b, -14, 16, -8, 22, 1);
        yagura(f, W, D, HT, { m, wall: B.kuro_itabari, band: B.shikkui, n: 2, shachi: true, gw: B.kuro_itabari });
      }
      const t = tenshu(b, ctx, {
        X0: -5, Z0: 8, X1: 5, Z1: 18, g: HT, n: 3, baseH: 4, m,
        wall: B.kuro_itabari, low: B.kuro_itabari, band: B.shikkui, gw: B.kuro_itabari,
        chidori: [[0, [0, 2]], [1, [1, 3]]]
      });
      for (let z = 2; z <= 7; z++) for (let x = -1; x <= 1; x++) b.put(x, HT, z, B.gravel);
      b.put(-4, HT + 1, 4, B.toro); b.put(4, HT + 1, 4, B.toro);
      matsu(b, -8, HT, 6, rnd);

      // ---- 水の手坂（崖を穿ち海面へ下る秘密の石段と隠し水軍船着場）
      for (let k = 0; k <= HT - WL; k++) {
        const sy = HT - k;
        const sz = 18 + Math.floor(k * 0.7);
        const sx = 10;
        b.put(sx, sy, sz, B.stone_brick_stairs + 2);
        b.put(sx + 1, sy, sz, B.stone_brick_stairs + 2);
        for (let h = 1; h <= 3; h++) { b.put(sx, sy + h, sz, 0); b.put(sx + 1, sy + h, sz, 0); }
        b.put(sx - 1, sy + 1, sz, B.kirishi);
        b.put(sx + 2, sy + 1, sz, B.kirishi);
      }
      // 崖下の隠し桟橋
      const dockZ = 18 + Math.floor((HT - WL) * 0.7);
      for (let z = dockZ; z <= dockZ + 8; z++) for (let x = 8; x <= 14; x++) {
        b.put(x, WL + 1, z, B.spruce_slab);
        for (let h = 1; h <= 3; h++) b.put(x, WL + 1 + h, z, 0);
        if (z % 3 === 0 && (x === 8 || x === 14)) {
          b.put(x, WL + 2, z, B.spruce_fence);
          for (let y = MB; y <= WL; y++) b.put(x, y, z, B.spruce_log);
        }
      }
      b.chest(12, WL + 2, dockZ + 4, 3, 'wajo_armory');

      // ---- garrison
      const g1 = ctx.group('ote', b, -16, NT + 1, -28, 38, 10);
      for (const [x, z, ty] of [[-16, -28, 'ashigaru'], [-18, -24, 'samurai'], [-10, -30, 'teppo_ashigaru']]) ctx.mob(g1, b, x, NT + 1, z, ty);
      const g2 = ctx.group('ninomaru', b, 8, NT + 1, -22, 34, 10);
      for (const [x, z, ty] of [[10, -24, 'teppo_ashigaru'], [16, -22, 'teppo_ashigaru'], [-6, -14, 'samurai'], [20, -16, 'yumi_ashigaru']]) ctx.mob(g2, b, x, NT + 1, z, ty);
      const g3 = ctx.group('honmaru', b, 0, HT + 1, 6, 26, 6);
      for (const [x, z, ty] of [[-2, 4, 'samurai'], [2, 4, 'samurai'], [8, 4, 'teppo_ashigaru'], [-8, 12, 'teppo_ashigaru'], [9, 14, 'ninja']]) ctx.mob(g3, b, x, HT + 1, z, ty);
      const gd = ctx.group('mizunote', b, 11, WL + 2, dockZ + 4, 18, 4);
      for (const [x, z, ty] of [[10, dockZ + 2, 'samurai'], [12, dockZ + 5, 'teppo_ashigaru']]) ctx.mob(gd, b, x, WL + 2, z, ty);
      tenshuGarrison(ctx, b, t, [['samurai', 'teppo_ashigaru'], ['samurai', 'ninja'], ['hatamoto', 'samurai']]);
      ctx.plan.gate = b.world(-16, NT + 1, -44);
    },

    // ============================================================ 砦: square fort, dry moat and earthen rampart
    toride(b, ctx, site) {
      const B = BL(), m = KAYA(), fy = site.fy, rnd = ctx.rnd;
      const G = site.snowy ? B.snowy_grass : B.grass;
      const Rm = 26, Ri = 20, Rr = 16, EXT = 40;
      const cheb = (x, z) => Math.max(Math.abs(x), Math.abs(z));
      apron(b, site, -EXT, -EXT, EXT, EXT, fy, (x, z) => (cheb(x, z) - Rm - 1) / (EXT - Rm - 1), (x, z) => cheb(x, z) <= Rm);
      for (let z = -Rm; z <= Rm; z++) for (let x = -Rm; x <= Rm; x++) {
        const d = cheb(x, z);
        if (d > Ri) {
          // 空堀: V-shaped dry moat, an earthen causeway (土橋) at the gate
          if (Math.abs(x) <= 2 && z < 0) { ground(b, x, z, fy, B.dirt_path); continue; }
          const k = Math.min(d - Ri, Rm - d + 1), bot = fy - Math.min(4, 1 + k);
          ground(b, x, z, bot, k >= 2 ? B.gravel : B.dirt, { clear: 6 });
        } else if (d > Rr) {
          // 土塁: earthen rampart, 3 high, sloping inwards
          const k = Ri - d;   // 0 at the outer edge
          const top = fy + (k <= 2 ? 3 : 3 - (k - 2));
          ground(b, x, z, top, top > fy + 1 ? G : G);
        } else ground(b, x, z, fy, G);
      }
      // gate through the rampart
      for (let z = -Ri; z <= -Rr; z++) for (let x = -2; x <= 2; x++) ground(b, x, z, fy, B.dirt_path);
      kabukimon(frame(b, 0, -Rr - 1, 0), fy, { cap: B.kaya_slab, broken: true });
      // palisade on the rampart crest (partly fallen)
      saku(b, perimeter(-Ri + 1, -Ri + 1, Ri - 1, Ri - 1).filter(([x, z]) => !(Math.abs(x) <= 3 && z < 0)), fy + 3, { broken: 0.25 });
      // hall with the standard, watchtower, storehouse, stable shed, well, graves
      {
        const { f, W, D } = placeRect(b, -8, 3, 6, 13, 0);
        goten(f, W, D, fy, { m, back: B.kuro_itabari, gw: B.kuro_itabari });
        banner(f, ctx, Math.floor(W / 2), fy + 1, D - 4, 0);
        for (const [x, z] of [[1, 1], [W - 2, 1], [2, D - 2]]) f.put(x, fy + 3, z, B.cobweb);
      }
      monomi(frame(b, 10, -15, 0), fy, { m });
      { const { f, W, D } = placeRect(b, 9, 4, 13, 10, 3); kura(f, W, D, fy, { m, low: B.kuro_itabari, wall: B.kuro_itabari, lowH: 4 }); }
      { const { f, W, D } = placeRect(b, -15, -12, -9, -4, 1); nagaya(f, W, D, fy, { m, low: B.kuro_itabari, band: B.kuro_itabari }); }
      well(b, -4, fy, -8);
      for (let z = -15; z <= 2; z++) for (let x = -1; x <= 1; x++) b.put(x, fy, z, B.dirt_path);
      for (const [x, z] of [[-13, 9], [-11, 9], [-13, 12], [-11, 12]]) { b.put(x, fy + 1, z, rnd() < 0.5 ? B.mossy_cobblestone : B.cobblestone); b.put(x, fy + 2, z, B.stone_brick_slab); }
      for (let k = 0; k < 8; k++) { const x = -14 + Math.floor(rnd() * 28), z = -14 + Math.floor(rnd() * 28); if (!b.get(x, fy + 1, z)) b.put(x, fy + 1, z, B.dead_bush); }
      b.put(4, fy + 1, -6, B.toro); b.put(-4, fy + 1, 0, B.toro);
      // ---- garrison
      const g1 = ctx.group('yard', b, 0, fy + 1, -4, 34, 8);
      for (const [x, z, ty] of [[-3, -12, 'ochimusha'], [4, -10, 'ochimusha'], [-10, 0, 'ochimusha'], [10, -2, 'ninja'], [0, -4, 'ochimusha']]) ctx.mob(g1, b, x, fy + 1, z, ty);
      ctx.mob(g1, b, 12, fy + 8, -13, 'ninja');
      const gh = ctx.group('hall', b, -1, fy + 1, 8, 10, 3);
      for (const [x, z, ty] of [[-4, 8, 'ochimusha'], [2, 8, 'ochimusha']]) ctx.mob(gh, b, x, fy + 1, z, ty);
      ctx.plan.gate = b.world(0, fy + 1, -Rm - 6);
    },
  };
  // one or two warriors per tenshu floor, on the middle row (never used by the stairs); they appear when
  // the player climbs to that floor
  function tenshuGarrison(ctx, b, t, perFloor) {
    const zc = Math.round((t.top[1] + t.top[3]) / 2);
    perFloor.forEach((types, i) => {
      const y = t.ys[i] + 1;
      const g = ctx.group('tenshu' + i, b, t.cx, y, zc, 16, 2.2);
      types.forEach((ty, k) => ctx.mob(g, b, t.cx + (k ? -2 : 2), y, zc, ty));
    });
  }

  // ---------------------------------------------------------------- queries
  Object.assign(Str, {
    WCELL,
    wajoSite,
    wajoPlan,
    wajoAround(gen, x, z, pad) {
      const out = [];
      for (const [gx, gz] of Str._cellsAround(x, z, WCELL, pad + 80)) {
        const s = wajoSite(gen, gx, gz);
        if (s && Math.abs(s.x - x) < s.R + pad && Math.abs(s.z - z) < s.R + pad) out.push(s);
      }
      return out;
    },
    // Japanese castle whose grounds (plus pad) contain (x, z)
    wajoAt(gen, x, z, pad = 0) {
      for (const [gx, gz] of Str._cellsAround(x, z, WCELL, 90 + pad)) {
        const s = wajoSite(gen, gx, gz);
        if (s && Math.abs(s.x - x) <= s.R + pad && Math.abs(s.z - z) <= s.R + pad) return s;
      }
      return null;
    },
    wajoNear(gen, x, z, margin = 0) { return !!Str.wajoAt(gen, x, z, margin); },
    nearestWajo(gen, x, z, rad, kind) {
      let best = null, bd = Infinity;
      const gx0 = Math.floor(x / WCELL), gz0 = Math.floor(z / WCELL);
      for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) {
        const s = wajoSite(gen, gx, gz);
        if (!s || (kind && s.kind !== kind)) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    // Find the nearest Japanese castle of each of all kinds
    nearestWajoAll(gen, x, z, rad = 24) {
      const kinds = Object.keys(TYPES);
      const best = {};
      for (const k of kinds) best[k] = null;
      const gx0 = Math.floor(x / WCELL), gz0 = Math.floor(z / WCELL);

      const scan = (r1, r2) => {
        for (let gz = gz0 - r2; gz <= gz0 + r2; gz++) {
          for (let gx = gx0 - r2; gx <= gx0 + r2; gx++) {
            if (r1 > 0 && Math.abs(gx - gx0) <= r1 && Math.abs(gz - gz0) <= r1) continue;
            const s = wajoSite(gen, gx, gz);
            if (!s) continue;
            const d = Math.hypot(s.x - x, s.z - z);
            if (!best[s.kind] || d < best[s.kind].dist) {
              best[s.kind] = { site: s, dist: d };
            }
          }
        }
      };

      scan(0, rad);
      if (kinds.some((k) => !best[k])) scan(rad, rad + 24);
      return best;
    },
  });
  MC.WorldGen.prototype.nearestWajo = function (x, z, rad, kind) { return Str.nearestWajo(this, x, z, rad, kind); };
  MC.WorldGen.prototype.nearestWajoAll = function (x, z, rad) { return Str.nearestWajoAll(this, x, z, rad); };
})();
