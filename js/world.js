'use strict';
// Chunk storage, streaming (generation + meshing within a per-frame time budget), block edits,
// block updates (support, gravity, fluids), random ticks, chests and explosions.
MC.Chunk = class {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(16 * 16 * MC.HEIGHT);
    this.climate = new Uint8Array(256);
    this.maxY = 0;
    this.meshMaxY = 0;
    this.meshed = false;
    this.gpu = null;
    this.light = null;      // packed sky<<4|block per cell (filled by the mesher)
    this.lightTop = -1;
    this.spawners = null;   // [[li, mobType]]
    this.loot = null;       // Map li -> loot table
    this.pending = null;    // cells whose fluid neighbourhood must be (re)simulated once meshable
  }
};

// setBlock flags
MC.SB = { DEFER: 1, NOEDIT: 2, NOUPDATE: 4 };
MC.SB.SIM = MC.SB.DEFER | MC.SB.NOEDIT;

MC.posKey = (x, y, z) => ((x + 1048576) * 2097152 + (z + 1048576)) * 256 + y;
MC.keyPos = (k) => {
  const y = k % 256, r = (k - y) / 256, z = (r % 2097152) - 1048576, x = Math.floor(r / 2097152) - 1048576;
  return [x, y, z];
};

MC.World = class {
  constructor(seed) {
    this.seed = seed;
    this.gen = new MC.WorldGen(seed);
    this.mesher = new MC.Mesher();
    this.chunks = new Map();
    this.chunkList = [];
    this.onMesh = null;
    this.onUnload = null;
    this._renderDist = 8;
    this.urgent = [];
    this._offsets = null;
    this._offR = -1;
    this._lastUpdatePcx = -999999;
    this._lastUpdatePcz = -999999;
    this._lastUnloadPcx = -999999;
    this._lastUnloadPcz = -999999;
    this._lastUnloadTime = 0;
    this._allMeshed = false;
    this.stats = { generated: 0, meshed: 0 };
    this.edits = new Map();     // chunk key -> Map(local index -> block id)
    this.editsDirty = false;
    this.editVersion = 0;
    this.tickCount = 0;
    this.fluidQ = new Map();    // pos key -> due tick
    this.chests = new Map();    // "x,y,z" -> { slots: [27], loot: bool }
    this.spawners = new Map();  // pos key -> { x, y, z, type, timer }
    this.entities = null;       // MC.EntityManager (set by main)
    this.fx = null;             // effects hooks (particles / sounds) set by main
    this.player = null;
    this.creative = false;
    this.bossesDefeated = new Set();
  }

  get renderDist() { return this._renderDist; }
  set renderDist(v) {
    if (this._renderDist !== v) {
      this._renderDist = v;
      this._allMeshed = false;
      this._offsets = null;
      this._offR = -1;
    }
  }

  // ---- persistence of player edits (localStorage, per seed)
  loadEdits(data) {
    if (!data || !data.edits) return;
    for (const k in data.edits) {
      const [cx, cz] = k.split(',').map(Number);
      this.edits.set(MC.World.key(cx, cz), new Map(data.edits[k]));
    }
    if (data.chests) for (const k in data.chests) this.chests.set(k, { slots: data.chests[k].slots || data.chests[k], loot: false });
    if (Array.isArray(data.bosses)) for (const b of data.bosses) this.bossesDefeated.add(b);
  }
  serializeEdits() {
    const out = {};
    for (const [key, m] of this.edits) {
      if (!m.size) continue;
      const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
      out[cx + ',' + cz] = [...m];
    }
    return out;
  }
  serializeChests() {
    const out = {};
    for (const [k, c] of this.chests) out[k] = { slots: c.slots };
    return out;
  }
  static key(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }
  getChunk(cx, cz) { return this.chunks.get(MC.World.key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0) return MC.BLOCK.bedrock;
    if (y >= MC.HEIGHT) return 0;
    const c = this.chunks.get(MC.World.key(x >> 4, z >> 4));
    if (!c) return 0;
    return c.blocks[(x & 15) + (z & 15) * 16 + y * 256];
  }
  isLoaded(x, z) { return this.chunks.has(MC.World.key(x >> 4, z >> 4)); }

  setBlock(x, y, z, id, flags = 0) {
    if (y < 0 || y >= MC.HEIGHT) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.getChunk(cx, cz);
    if (!c) return false;
    const li = (x & 15) + (z & 15) * 16 + y * 256;
    const old = c.blocks[li];
    if (old === id) return false;
    c.blocks[li] = id;
    if (id && y > c.maxY) c.maxY = y;
    this.editVersion++;
    if (!(flags & MC.SB.NOEDIT)) {
      const ck = MC.World.key(cx, cz);
      if (!this.edits.has(ck)) this.edits.set(ck, new Map());
      this.edits.get(ck).set(li, id);
      this.editsDirty = true;
    }
    if (MC.isChest(old) && !MC.isChest(id)) this.chests.delete(x + ',' + y + ',' + z);
    if (old === MC.BLOCK.spawner) this.spawners.delete(MC.posKey(x, y, z));
    // blocks with a removal hook (the general's standard of a Japanese castle)
    const od = MC.BLOCKS[old];
    if (od && od.onRemove && MC.B_BASE[id] !== MC.B_BASE[old]) od.onRemove(this, x, y, z, id);
    if (id === MC.BLOCK.spawner && !this.spawners.has(MC.posKey(x, y, z))) this.spawners.set(MC.posKey(x, y, z), { x, y, z, type: 'zombie', timer: 5 });
    const lx = x & 15, lz = z & 15;
    if (flags & MC.SB.DEFER) {
      // geometry: this chunk (+ border neighbours); light only matters much for emitters
      const allN = MC.B_EMIT[old] || MC.B_EMIT[id] || MC.B_OPACITY[old] !== MC.B_OPACITY[id] && (MC.B_OPACITY[old] > 1 || MC.B_OPACITY[id] > 1);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = this.getChunk(cx + dx, cz + dz);
        if (!n) continue;
        const border = (dx === 0 || (dx === -1 && lx === 0) || (dx === 1 && lx === 15)) &&
                       (dz === 0 || (dz === -1 && lz === 0) || (dz === 1 && lz === 15));
        if (border || allN) { n.meshed = false; if (flags & MC.SB.NOEDIT) n.simDirty = true; this._allMeshed = false; }
      }
    } else {
      // the edited chunk is rebuilt right away; chunks sharing the border too (geometry changes),
      // all others in the 3x3 neighbourhood are queued because their lighting may change.
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const n = this.getChunk(cx + dx, cz + dz);
        if (!n) continue;
        const border = (dx === 0 || (dx === -1 && lx === 0) || (dx === 1 && lx === 15)) &&
                       (dz === 0 || (dz === -1 && lz === 0) || (dz === 1 && lz === 15));
        if (border) { if (!this.urgent.includes(n)) this.urgent.push(n); this._allMeshed = false; }
        else { n.meshed = false; this._allMeshed = false; }
      }
      this._flushUrgent();
    }
    if (!(flags & MC.SB.NOUPDATE)) this._onChanged(x, y, z, old, id);
    return true;
  }

  // ---- block updates
  _onChanged(x, y, z, old, id) {
    const FL = MC.B_FLUID;
    if (FL[id]) this.scheduleFluid(x, y, z, id);
    const N = MC.World.N6;
    for (let k = 0; k < 6; k++) {
      const nx = x + N[k][0], ny = y + N[k][1], nz = z + N[k][2];
      const nb = this.getBlock(nx, ny, nz);
      if (FL[nb]) this.scheduleFluid(nx, ny, nz, nb);
      if (nb) this._checkSupport(nx, ny, nz, nb);
    }
    // gravity blocks
    if (MC.B_GRAVITY[id]) this._checkFall(x, y, z, id);
    const up = this.getBlock(x, y + 1, z);
    if (MC.B_GRAVITY[up]) this._checkFall(x, y + 1, z, up);
  }

  _checkFall(x, y, z, id) {
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && (below === 0 || MC.B_FLUID[below] || (MC.B_REPLACEABLE[below] && !MC.B_SOLID[below])) && this.entities) {
      this.setBlock(x, y, z, 0, MC.SB.DEFER | MC.SB.NOUPDATE);
      this.entities.spawnFallingBlock(x, y, z, id);
      this._onChanged(x, y, z, id, 0);
    }
  }

  _supported(x, y, z, b) {
    const s = MC.B_SUPPORT[b];
    const d = MC.BLOCKS[b];
    if (d.door) {
      const other = this.getBlock(x, y + (d.door.upper ? -1 : 1), z);
      if (!MC.isDoor(other)) return false;
      return d.door.upper || MC.B_SOLID[this.getBlock(x, y - 1, z)] === 1;
    }
    if (d.bed) {
      const dir = MC.DIRS[d.facing], sgn = d.bed.head ? -1 : 1;
      return MC.isBed(this.getBlock(x + dir[0] * sgn, y, z + dir[2] * sgn));
    }
    if (!s) return true;
    const below = this.getBlock(x, y - 1, z);
    switch (s) {
      case 1: return MC.B_SOLID[below] === 1 && !MC.B_FLUID[below];
      case 2: { const a = this.getBlock(x, y + 1, z); return MC.B_SOLID[a] === 1 || MC.B_SHAPE[a] === MC.SHAPE.FENCE; }
      case 3: { const dir = MC.DIRS[d.facing]; return MC.B_SOLID[this.getBlock(x + dir[0], y, z + dir[2])] === 1; }
      case 4:
        if (below === b) return true;
        if (b === MC.BLOCK.cactus) return below === MC.BLOCK.sand;
        return below === MC.BLOCK.sand || below === MC.BLOCK.grass || below === MC.BLOCK.dirt;
      case 5: return below === MC.BLOCK.farmland;
    }
    return true;
  }
  _checkSupport(x, y, z, b) {
    if (!MC.B_SUPPORT[b] && !MC.BLOCKS[b].door && !MC.BLOCKS[b].bed) return;
    if (!this._supported(x, y, z, b)) this.breakBlock(x, y, z, { drops: !this.creative && !(MC.BLOCKS[b].door && MC.BLOCKS[b].door.upper) && !(MC.BLOCKS[b].bed && MC.BLOCKS[b].bed.head), flags: MC.SB.DEFER });
  }

  // remove a block with drops / effects
  breakBlock(x, y, z, o = {}) {
    const b = this.getBlock(x, y, z);
    if (!b) return 0;
    let repl = 0;
    if (o.replaceWith !== undefined) repl = o.replaceWith;
    if (MC.isChest(b) && this.entities && !this.creative) {
      const ch = this.getChest(x, y, z, true);
      if (ch) for (const s of ch.slots) if (s) this.entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, s);
    }
    this.setBlock(x, y, z, repl, o.flags || 0);
    if (o.drops && this.entities) {
      const drops = o.dropList || MC.blockDrops(b);
      for (const [id, n] of drops) if (id && n > 0) this.entities.spawnItem(x + 0.5, y + 0.3, z + 0.5, MC.makeStack(id, n));
    }
    if (o.fx !== false && this.fx) this.fx.breakBlock(x, y, z, b);
    return b;
  }

  // ---- fluids
  scheduleFluid(x, y, z, id) {
    const k = MC.posKey(x, y, z);
    const due = this.tickCount + (MC.B_FLUID[id] === MC.FLUID.LAVA ? 30 : 5);
    const cur = this.fluidQ.get(k);
    if (cur === undefined || cur > due) this.fluidQ.set(k, due);
  }

  _tickFluids() {
    if (!this.fluidQ.size) return;
    const p = this.player;
    const px = p ? p.pos[0] : 0, pz = p ? p.pos[2] : 0;
    const rad = Math.min(this.renderDist * 16, 180);
    const lim = rad * rad;
    let n = 0;
    const due = [];
    for (const [k, t] of this.fluidQ) {
      if (t > this.tickCount) continue;
      const pos = MC.keyPos(k);
      if (!this.isLoaded(pos[0], pos[2])) { this.fluidQ.delete(k); continue; }
      const dx = pos[0] - px, dz = pos[2] - pz;
      if (dx * dx + dz * dz > lim) continue;   // wait until the player is closer
      due.push(k);
      if (++n >= 300) break;
    }
    for (const k of due) {
      this.fluidQ.delete(k);
      const [x, y, z] = MC.keyPos(k);
      MC.Fluids.update(this, x, y, z);
    }
  }

  // ---- random ticks (crops, saplings, sugar cane, grass)
  _randomTicks() {
    const p = this.player;
    if (!p) return;
    const pcx = Math.floor(p.pos[0] / 16), pcz = Math.floor(p.pos[2] / 16);
    const T = MC.TICK, TK = MC.B_TICK;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
      const c = this.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.light) continue;
      const B = c.blocks, top = c.maxY + 1;
      for (let k = 0; k < 20; k++) {
        const li = Math.floor(Math.random() * 256 * top);
        const b = B[li];
        const t = TK[b];
        if (!t) continue;
        const x = c.cx * 16 + (li & 15), z = c.cz * 16 + ((li >> 4) & 15), y = li >> 8;
        this._randomTick(x, y, z, b, t, T);
      }
    }
  }
  _randomTick(x, y, z, b, t, T) {
    const B = MC.BLOCK, F = MC.SB.DEFER;
    switch (t) {
      case T.CROP: {
        const st = MC.BLOCKS[b].stage;
        if (st < 3 && Math.random() < 0.35) this.setBlock(x, y, z, B['wheat_' + (st + 1)], F);
        break;
      }
      case T.SAPLING:
        if (Math.random() < 0.12) this.growTree(x, y, z, MC.BLOCKS[b].tree);
        break;
      case T.CANE: {
        if (this.getBlock(x, y + 1, z) !== 0 || Math.random() > 0.3) break;
        let h = 1;
        while (h < 3 && this.getBlock(x, y - h, z) === b) h++;
        if (h < 3) this.setBlock(x, y + 1, z, b, F);
        break;
      }
      case T.GRASS: {
        const a = this.getBlock(x, y + 1, z);
        if (MC.B_OPAQUE[a] || MC.B_FLUID[a]) { this.setBlock(x, y, z, B.dirt, F | MC.SB.NOEDIT); break; }
        const nx = x + Math.floor(Math.random() * 3) - 1, ny = y + Math.floor(Math.random() * 3) - 1, nz = z + Math.floor(Math.random() * 3) - 1;
        if (this.getBlock(nx, ny, nz) === B.dirt) {
          const na = this.getBlock(nx, ny + 1, nz);
          if (!MC.B_OPAQUE[na] && !MC.B_FLUID[na] && this.skyLight(nx, ny + 1, nz) >= 9) this.setBlock(nx, ny, nz, B.grass, F | MC.SB.NOEDIT);
        }
        break;
      }
      case T.FARMLAND: {
        const a = this.getBlock(x, y + 1, z);
        if (MC.B_OPAQUE[a]) this.setBlock(x, y, z, B.dirt, F);
        break;
      }
    }
  }

  growTree(x, y, z, kind) {
    // needs some room above
    for (let k = 1; k < 6; k++) { const b = this.getBlock(x, y + k, z); if (b && !MC.B_REPLACEABLE[b] && MC.B_MAT[b] !== MC.MAT.LEAVES) return false; }
    this.setBlock(x, y, z, 0, MC.SB.DEFER | MC.SB.NOUPDATE);
    const set = (wx, wy, wz, id, force) => {
      const cur = this.getBlock(wx, wy, wz);
      const ok = force ? (cur === 0 || MC.B_REPLACEABLE[cur] || MC.B_MAT[cur] === MC.MAT.LEAVES) && !MC.B_FLUID[cur] : (cur === 0 || (MC.B_REPLACEABLE[cur] && !MC.B_FLUID[cur]));
      if (ok) this.setBlock(wx, wy, wz, id, MC.SB.DEFER | MC.SB.NOUPDATE);
    };
    this.gen.buildTree(set, kind, x, y, z, Math.random());
    return true;
  }

  tick() {
    this.tickCount++;
    this._tickFluids();
    if (this.tickCount % 2 === 0) this._randomTicks();
  }

  // ---- chests
  getChest(x, y, z, noCreate) {
    const k = x + ',' + y + ',' + z;
    let ch = this.chests.get(k);
    if (ch) return ch;
    if (noCreate && !this._lootTable(x, y, z)) return null;
    ch = { slots: new Array(27).fill(null), loot: false };
    const table = this._lootTable(x, y, z);
    if (table) {
      const rnd = MC.mulberry32((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ this.seed);
      const items = MC.rollLoot(table, rnd);
      for (const it of items) {
        for (let t = 0; t < 10; t++) { const i = Math.floor(rnd() * 27); if (!ch.slots[i]) { ch.slots[i] = it; break; } }
      }
      ch.loot = true;
      const c = this.getChunk(x >> 4, z >> 4);
      if (c && c.loot) c.loot.delete((x & 15) + (z & 15) * 16 + y * 256);
    }
    this.chests.set(k, ch);
    this.editsDirty = true;
    return ch;
  }
  _lootTable(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || !c.loot) return null;
    return c.loot.get((x & 15) + (z & 15) * 16 + y * 256) || null;
  }

  // ---- light
  lightRaw(x, y, z) {
    if (y >= MC.HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(MC.World.key(x >> 4, z >> 4));
    if (!c || !c.light) return 0xf0;
    if (y > c.lightTop) return 0xf0;
    return c.light[y * 256 + (z & 15) * 16 + (x & 15)];
  }
  skyLight(x, y, z) { return this.lightRaw(x, y, z) >> 4; }
  lightAt(x, y, z) { const v = this.lightRaw(x, y, z); return { sky: v >> 4, block: v & 15 }; }

  // ---- explosions
  explode(x, y, z, power, source) {
    const rnd = Math.random;
    const destroyed = [];
    const seen = new Set();
    // rays from the centre through the surface of a 12^3 grid; each loses strength by block resistance
    const N = 12;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      if (i !== 0 && i !== N - 1 && j !== 0 && j !== N - 1 && k !== 0 && k !== N - 1) continue;
      let dx = i / (N - 1) * 2 - 1, dy = j / (N - 1) * 2 - 1, dz = k / (N - 1) * 2 - 1;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      let f = power * (0.7 + rnd() * 0.6);
      let px = x, py = y, pz = z;
      for (; f > 0; f -= 0.225) {
        const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
        const b = this.getBlock(bx, by, bz);
        if (b) {
          f -= (MC.B_RESIST[b] + 0.3) * 0.3;
          if (f > 0 && MC.B_HARD[b] >= 0 && !MC.B_FLUID[b]) {
            const kk = MC.posKey(bx, by, bz);
            if (!seen.has(kk)) { seen.add(kk); destroyed.push([bx, by, bz, b]); }
          }
        }
        px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
      }
    }
    const tnt = MC.BLOCK.tnt;
    const touched = new Set();
    for (const [bx, by, bz, b] of destroyed) {
      if (this.getBlock(bx, by, bz) !== b) continue;
      if (b === tnt && this.entities) {
        this.setBlock(bx, by, bz, 0, MC.SB.DEFER | MC.SB.NOUPDATE);
        this.entities.spawnTNT(bx, by, bz, 0.5 + Math.random() * 1.0);
      } else {
        const drops = !this.creative && rnd() < 1 / power;
        this.breakBlock(bx, by, bz, { drops, fx: false, flags: MC.SB.DEFER | MC.SB.NOUPDATE });
      }
      touched.add(MC.World.key(bx >> 4, bz >> 4));
    }
    // neighbour updates after the blast (support, fluids, gravity)
    for (const [bx, by, bz] of destroyed) this._onChanged(bx, by, bz, 1, 0);
    // rebuild affected chunks immediately
    for (const k of touched) { const c = this.chunks.get(k); if (c && this._canMesh(c.cx, c.cz)) this._mesh(c); }
    if (this.entities) this.entities.explosionImpact(x, y, z, power, source);
    if (this.fx) this.fx.explosion(x, y, z, power);
  }

  _flushUrgent() {
    while (this.urgent.length) {
      const c = this.urgent.shift();
      if (this.chunks.get(MC.World.key(c.cx, c.cz)) === c && this._canMesh(c.cx, c.cz)) this._mesh(c);
    }
  }

  _generate(cx, cz) {
    const c = new MC.Chunk(cx, cz);
    this.gen.generate(c);
    const ed = this.edits.get(MC.World.key(cx, cz));
    if (ed) {
      if (!c.pending) c.pending = [];
      for (const [li, id] of ed) {
        c.blocks[li] = id;
        const y = li >> 8;
        if (id && y > c.maxY) c.maxY = y;
        c.pending.push(li);
      }
    }
    this.chunks.set(MC.World.key(cx, cz), c);
    this.chunkList.push(c);
    this._allMeshed = false;
    this.stats.generated++;
    // spawners
    if (c.spawners) for (const [li, type] of c.spawners) {
      const x = cx * 16 + (li & 15), z = cz * 16 + ((li >> 4) & 15), y = li >> 8;
      if (c.blocks[li] === MC.BLOCK.spawner) this.spawners.set(MC.posKey(x, y, z), { x, y, z, type, timer: 3 + Math.random() * 8 });
    }
    // cross-chunk flows: fluid cells of loaded neighbours that border open cells of this chunk
    for (let f = 0; f < 4; f++) {
      const d = MC.DIRS[f];
      const n = this.getChunk(cx + d[0], cz + d[2]);
      if (!n) continue;
      const top = Math.min(n.maxY, MC.HEIGHT - 1);
      for (let t = 0; t < 16; t++) {
        // cell in the neighbour on the shared border, and the adjacent cell in this chunk
        const nlx = d[0] === 1 ? 0 : d[0] === -1 ? 15 : t, nlz = d[2] === 1 ? 0 : d[2] === -1 ? 15 : t;
        const lx = d[0] === 1 ? 15 : d[0] === -1 ? 0 : t, lz = d[2] === 1 ? 15 : d[2] === -1 ? 0 : t;
        for (let y = 1; y <= top; y++) {
          const nb = n.blocks[nlx + nlz * 16 + y * 256];
          if (!MC.B_FLUID[nb] || MC.B_LEVEL[nb] === 0) continue;
          const mine = c.blocks[lx + lz * 16 + y * 256];
          if (mine === 0 || (MC.B_REPLACEABLE[mine] && !MC.B_FLUID[mine]) || (MC.B_FLUID[mine] && MC.B_FLUID[mine] !== MC.B_FLUID[nb])) {
            this.scheduleFluid(n.cx * 16 + nlx, y, n.cz * 16 + nlz, nb);
          }
        }
      }
    }
    return c;
  }

  _canMesh(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.getChunk(cx + dx, cz + dz)) return false;
    return true;
  }

  _mesh(c) {
    const arr = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) arr.push(this.getChunk(c.cx + dx, c.cz + dz));
    const out = this.mesher.mesh(arr);
    c.meshMaxY = out.maxY;
    c.meshed = true;
    c.simDirty = false;
    c.lastMesh = performance.now();
    this.stats.meshed++;
    if (this.onMesh) this.onMesh(c, out);
    if (c.pending) {
      // schedule fluid simulation around generated springs / edited cells
      const N = MC.World.N6;
      for (const li of c.pending) {
        const x = c.cx * 16 + (li & 15), z = c.cz * 16 + ((li >> 4) & 15), y = li >> 8;
        const b = c.blocks[li];
        if (MC.B_FLUID[b]) this.scheduleFluid(x, y, z, b);
        for (let k = 0; k < 6; k++) {
          const nb = this.getBlock(x + N[k][0], y + N[k][1], z + N[k][2]);
          if (MC.B_FLUID[nb]) this.scheduleFluid(x + N[k][0], y + N[k][1], z + N[k][2], nb);
        }
      }
      c.pending = null;
    }
  }

  _getOffsets(R) {
    if (this._offR === R) return this._offsets;
    const offs = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) offs.push([dx, dz, dx * dx + dz * dz]);
    offs.sort((a, b) => a[2] - b[2]);
    this._offsets = offs; this._offR = R;
    return offs;
  }

  // Streams chunks around (px,pz). Returns number of chunks still missing in view.
  update(px, pz, budgetMs, dirX = 0, dirZ = 0) {
    const t0 = performance.now();
    const R = this._renderDist;
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    const offs = this._getOffsets(R);
    const R2 = (R + 0.5) * (R + 0.5), G2 = (R + 1.5) * (R + 1.5);
    let pending = 0;
    this._flushUrgent();

    if (pcx !== this._lastUpdatePcx || pcz !== this._lastUpdatePcz) {
      this._lastUpdatePcx = pcx;
      this._lastUpdatePcz = pcz;
      this._allMeshed = false;
    }

    if (!this._allMeshed) {
      let allDone = true;
      let budgetExceeded = false;
      outerLoop:
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0, len = offs.length; i < len; i++) {
          const o = offs[i];
          const d2 = o[2];
          if (d2 > G2) break;
          // first pass: chunks in front of the player; second: the rest
          const dx = o[0], dz = o[1];
          const front = dx * dirX + dz * dirZ >= -1 || d2 <= 4;
          if ((pass === 0) !== front) continue;
          const cx = pcx + dx, cz = pcz + dz;
          let c = this.getChunk(cx, cz);
          if (!c) {
            c = this._generate(cx, cz);
            if (performance.now() - t0 > budgetMs) {
              allDone = false;
              budgetExceeded = true;
              pending++;
              break outerLoop;
            }
          }
          if (d2 <= R2 && !c.meshed) {
            // simulation-driven changes (flowing fluids...) rebuild at most a few times per second
            if (c.simDirty && c.gpu && t0 - c.lastMesh < 350 + d2 * 3) {
              allDone = false;
              continue;
            }
            if (!this._canMesh(cx, cz)) {
              let missing = false;
              for (let oz = -1; oz <= 1 && !missing; oz++) for (let ox = -1; ox <= 1; ox++) {
                if (!this.getChunk(cx + ox, cz + oz)) {
                  this._generate(cx + ox, cz + oz);
                  if (performance.now() - t0 > budgetMs) {
                    missing = true;
                    break;
                  }
                }
              }
              if (missing) {
                allDone = false;
                budgetExceeded = true;
                pending++;
                break outerLoop;
              }
            }
            this._mesh(c);
            if (performance.now() - t0 > budgetMs) {
              allDone = false;
              budgetExceeded = true;
              pending++;
              break outerLoop;
            }
          }
        }
      }
      if (allDone && !budgetExceeded) {
        this._allMeshed = true;
      }
    }

    // unload far chunks: throttled to chunk boundary crossings or every 2 seconds
    const now = performance.now();
    if (pcx !== this._lastUnloadPcx || pcz !== this._lastUnloadPcz || now - this._lastUnloadTime > 2000) {
      this._lastUnloadPcx = pcx;
      this._lastUnloadPcz = pcz;
      this._lastUnloadTime = now;
      const U = R + 3;
      let unloadedAny = false;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > U || Math.abs(c.cz - pcz) > U) {
          if (this.onUnload) this.onUnload(c);
          this.chunks.delete(k);
          unloadedAny = true;
          if (c.spawners) for (const [li] of c.spawners) this.spawners.delete(MC.posKey(c.cx * 16 + (li & 15), li >> 8, c.cz * 16 + ((li >> 4) & 15)));
        }
      }
      if (unloadedAny) {
        this.chunkList = Array.from(this.chunks.values());
      }
    }
    return pending;
  }

  // Find a dry spawn column near the origin (prefer the edge of a nearby village)
  findSpawn() {
    const v = this.gen.nearestVillage ? this.gen.nearestVillage(0, 0, 2) : null;
    if (v) {
      const plan = MC.Structures.villagePlan(this.gen, v);
      if (plan.spawn) {
        const [x, z] = plan.spawn;
        const info = this.gen.columnInfo(x, z);
        if (info.h >= MC.SEA) {
          const yaw = Math.atan2(v.x - x, -(v.z - z));
          return [x + 0.5, info.h + 1, z + 0.5, yaw];
        }
      }
    }
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * r);
        const info = this.gen.columnInfo(x, z);
        if (info.h > MC.SEA + 2 && info.h < MC.SEA + 30 && (info.biome === MC.BIOME.PLAINS || info.biome === MC.BIOME.FOREST || info.biome === MC.BIOME.BIRCH)) {
          return [x + 0.5, info.h + 1, z + 0.5];
        }
      }
    }
    const info = this.gen.columnInfo(0, 0);
    return [0.5, Math.max(info.h, MC.SEA) + 1, 0.5];
  }
};
MC.World.N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
