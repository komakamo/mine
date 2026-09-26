'use strict';
// Flowing water & lava (Minecraft-style): sources (level 0), flowing levels 1..7, falling columns (8).
// Water spreads 7 blocks, lava 3 (steps of 2) and slower; flows prefer the nearest drop; two water
// sources make a new one; water + lava make obsidian / cobblestone / stone.
MC.Fluids = {
  // can a fluid of type ft flow into a cell containing b (ignoring same-type level checks)
  canFlowInto(b, ft) {
    if (b === 0) return true;
    const f = MC.B_FLUID[b];
    if (f) return f !== ft || MC.B_LEVEL[b] !== 0;
    return this.washable(b);
  },
  // non-solid decorations that flowing fluids destroy
  washable(b) {
    const sh = MC.B_SHAPE[b];
    return !MC.B_SOLID[b] && (sh === MC.SHAPE.CROSS || sh === MC.SHAPE.TORCH || sh === MC.SHAPE.CROP) && b !== MC.BLOCK.cobweb;
  },
  // cell that fluid can drop into (air, washable or flowing fluid of the same type)
  isHole(W, x, y, z, ft) {
    const b = W.getBlock(x, y, z);
    if (b === 0 || this.washable(b)) return true;
    return MC.B_FLUID[b] === ft;
  },
  passable(W, x, y, z, ft) {
    const b = W.getBlock(x, y, z);
    if (b === 0 || this.washable(b)) return true;
    return MC.B_FLUID[b] === ft && MC.B_LEVEL[b] !== 0;
  },

  update(W, x, y, z) {
    const FL = MC.B_FLUID, LV = MC.B_LEVEL, B = MC.BLOCK, SIM = MC.SB.SIM;
    const b = W.getBlock(x, y, z);
    const ft = FL[b];
    if (!ft) return;
    const WATER = MC.FLUID.WATER, LAVA = MC.FLUID.LAVA;
    const drop = ft === WATER ? 1 : 2;
    let level = LV[b];
    // lava touching water solidifies
    if (ft === LAVA) {
      for (const [dx, dy, dz] of MC.Fluids.CONTACT) {
        if (FL[W.getBlock(x + dx, y + dy, z + dz)] === WATER) {
          W.setBlock(x, y, z, level === 0 ? B.obsidian : B.cobblestone, SIM);
          if (W.fx) W.fx.fizz(x + 0.5, y + 0.8, z + 0.5);
          return;
        }
      }
    }
    // re-evaluate the level of flowing blocks
    if (level !== 0) {
      let nl;
      const above = W.getBlock(x, y + 1, z);
      if (FL[above] === ft) nl = 8;
      else {
        let min = 99, sources = 0;
        for (const d of MC.DIRS) {
          const n = W.getBlock(x + d[0], y, z + d[2]);
          if (FL[n] !== ft) continue;
          const l = LV[n];
          if (l === 0) sources++;
          const e = l === 8 ? 0 : l;
          if (e < min) min = e;
        }
        if (ft === WATER && sources >= 2) {
          const below = W.getBlock(x, y - 1, z);
          if (MC.B_SOLID[below] || (FL[below] === ft && LV[below] === 0)) nl = 0;
        }
        if (nl === undefined) { nl = min + drop; if (nl > 7) nl = -1; }
      }
      if (nl !== level) {
        if (nl < 0) { W.setBlock(x, y, z, 0, SIM); return; }
        W.setBlock(x, y, z, MC.fluidId(ft, nl), SIM);
        level = nl;
      }
    }
    // flow down
    const below = W.getBlock(x, y - 1, z);
    if (y > 0 && this.canFlowInto(below, ft) && !(FL[below] === ft && LV[below] === 8)) {
      this.flowInto(W, x, y - 1, z, ft, 8);
      return;
    }
    if (y > 0 && FL[below] === ft && level !== 0) return; // resting on the same fluid
    // spread sideways
    const next = (level === 8 ? 0 : level) + drop;
    if (next > 7) return;
    const dirs = this.spreadDirs(W, x, y, z, ft);
    for (const f of dirs) {
      const d = MC.DIRS[f];
      this.flowInto(W, x + d[0], y, z + d[2], ft, next);
    }
  },

  flowInto(W, x, y, z, ft, lvl) {
    const FL = MC.B_FLUID, LV = MC.B_LEVEL, B = MC.BLOCK, SIM = MC.SB.SIM;
    const b = W.getBlock(x, y, z);
    if (FL[b] === ft) {
      const cur = LV[b];
      if (cur === 0) return;
      if (lvl === 8 ? cur === 8 : (cur === 8 || cur <= lvl)) return;
    } else if (FL[b]) {
      // meeting the other fluid
      if (ft === MC.FLUID.WATER) W.setBlock(x, y, z, LV[b] === 0 ? B.obsidian : B.cobblestone, SIM);
      else W.setBlock(x, y, z, B.stone, SIM);
      if (W.fx) W.fx.fizz(x + 0.5, y + 0.8, z + 0.5);
      return;
    } else if (b !== 0) {
      if (!this.washable(b)) return;
      W.breakBlock(x, y, z, { drops: !W.creative, fx: false, flags: SIM });
    }
    W.setBlock(x, y, z, MC.fluidId(ft, lvl), SIM);
  },

  // directions (facing indices) towards the closest drop within reach; all open directions otherwise
  spreadDirs(W, x, y, z, ft) {
    const reach = ft === MC.FLUID.WATER ? 4 : 2;
    let best = 1000;
    const elig = [], inter = [], cost = [0, 0, 0, 0];
    for (let f = 0; f < 4; f++) {
      const d = MC.DIRS[f];
      const nx = x + d[0], nz = z + d[2];
      if (!this.passable(W, nx, y, nz, ft)) {
        const nb = W.getBlock(nx, y, nz);
        if (MC.B_FLUID[nb] && MC.B_FLUID[nb] !== ft) inter.push(f); // other fluid: interact
        continue;
      }
      elig.push(f);
      cost[f] = this.isHole(W, nx, y - 1, nz, ft) ? 0 : this._slope(W, nx, y, nz, f ^ 2, 1, reach, ft);
      if (cost[f] < best) best = cost[f];
    }
    const out = best < 1000 ? elig.filter((f) => cost[f] === best) : elig;
    return out.concat(inter);
  },
  _slope(W, x, y, z, back, depth, reach, ft) {
    if (depth >= reach) return 1000;
    let best = 1000;
    for (let f = 0; f < 4; f++) {
      if (f === back) continue;
      const d = MC.DIRS[f];
      const nx = x + d[0], nz = z + d[2];
      if (!this.passable(W, nx, y, nz, ft)) continue;
      if (this.isHole(W, nx, y - 1, nz, ft)) return depth;
      const c = this._slope(W, nx, y, nz, f ^ 2, depth + 1, reach, ft);
      if (c < best) best = c;
    }
    return best;
  },

  // horizontal flow vector of the fluid at a cell (for pushing entities)
  flowVector(W, x, y, z, out) {
    out[0] = 0; out[2] = 0;
    const b = W.getBlock(x, y, z);
    const ft = MC.B_FLUID[b];
    if (!ft) return out;
    const h0 = MC.B_FLUID[W.getBlock(x, y + 1, z)] === ft ? 1 : MC.fluidHeight(b);
    for (const d of MC.DIRS) {
      const n = W.getBlock(x + d[0], y, z + d[2]);
      let dh = 0;
      if (MC.B_FLUID[n] === ft) dh = h0 - (MC.B_FLUID[W.getBlock(x + d[0], y + 1, z + d[2])] === ft ? 1 : MC.fluidHeight(n));
      else if (!MC.B_SOLID[n]) {
        const nb = W.getBlock(x + d[0], y - 1, z + d[2]);
        if (MC.B_FLUID[nb] === ft) dh = h0 + 0.1;
      }
      out[0] += d[0] * dh; out[2] += d[2] * dh;
    }
    if (MC.B_LEVEL[b] === 0) { out[0] *= 0.2; out[2] *= 0.2; }
    const l = Math.hypot(out[0], out[2]);
    if (l > 1e-4) { out[0] /= l; out[2] /= l; }
    return out;
  },
};
// neighbours that make lava solidify on contact with water
MC.Fluids.CONTACT = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
