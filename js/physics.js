'use strict';
// Swept AABB collision against per-block collision boxes (full cubes, slabs, stairs, fences, doors...),
// with Minecraft-style axis clipping (y, x, z) and step-up. Shared by the player and all entities.
// Entities: { pos:[x, feetY, z], vel:[3], hw (half width), h (height), stepH, onGround }
MC.Phys = {
  buf: new Float64Array(6 * 8192),
  n: 0,
  FULL: [[0, 0, 0, 1, 1, 1]],
  _conn: {},

  blockBoxes(W, x, y, z, b) {
    const sh = MC.B_SHAPE[b];
    if (sh === MC.SHAPE.FENCE || sh === MC.SHAPE.PANE) {
      let mask = 0;
      const conn = sh === MC.SHAPE.FENCE ? MC.connectsFence : MC.connectsPane;
      for (let f = 0; f < 4; f++) { const d = MC.DIRS[f]; if (conn(W.getBlock(x + d[0], y, z + d[2]))) mask |= 1 << f; }
      const k = sh * 16 + mask;
      return this._conn[k] || (this._conn[k] = MC.connectBoxes(sh, mask, true).map((q) => q.map((v) => v / 16)));
    }
    return MC.B_COLL[b] || this.FULL;
  },

  // collect world-space collision boxes intersecting the query box
  collect(W, x0, y0, z0, x1, y1, z1) {
    const buf = this.buf, SOL = MC.B_SOLID;
    let n = 0;
    const ix0 = Math.floor(x0), ix1 = Math.floor(x1), iz0 = Math.floor(z0), iz1 = Math.floor(z1);
    const iy0 = Math.floor(y0) - 1, iy1 = Math.floor(y1);
    for (let y = iy0; y <= iy1; y++) for (let z = iz0; z <= iz1; z++) for (let x = ix0; x <= ix1; x++) {
      const b = W.getBlock(x, y, z);
      if (!SOL[b]) continue;
      const list = this.blockBoxes(W, x, y, z, b);
      for (let k = 0; k < list.length; k++) {
        const q = list[k];
        const bx0 = x + q[0], by0 = y + q[1], bz0 = z + q[2], bx1 = x + q[3], by1 = y + q[4], bz1 = z + q[5];
        if (bx1 <= x0 || bx0 >= x1 || by1 <= y0 || by0 >= y1 || bz1 <= z0 || bz0 >= z1) continue;
        if (n >= buf.length / 6) break;
        const o = n * 6;
        buf[o] = bx0; buf[o + 1] = by0; buf[o + 2] = bz0; buf[o + 3] = bx1; buf[o + 4] = by1; buf[o + 5] = bz1;
        n++;
      }
    }
    this.n = n;
    return n;
  },

  // axis clipping against the collected boxes. bb = [x0,y0,z0,x1,y1,z1]
  clip(axis, d, bb) {
    if (d === 0) return 0;
    const buf = this.buf, E = 1e-7;
    const a = axis, b = (axis + 1) % 3, c = (axis + 2) % 3;
    for (let i = 0, o = 0; i < this.n; i++, o += 6) {
      if (buf[o + b + 3] <= bb[b] + E || buf[o + b] >= bb[b + 3] - E) continue;
      if (buf[o + c + 3] <= bb[c] + E || buf[o + c] >= bb[c + 3] - E) continue;
      if (d > 0) { if (bb[a + 3] <= buf[o + a] + E) { const g = buf[o + a] - bb[a + 3]; if (g < d) d = g; } }
      else if (bb[a] >= buf[o + a + 3] - E) { const g = buf[o + a + 3] - bb[a]; if (g > d) d = g; }
    }
    return d;
  },

  hasCollision(W, x0, y0, z0, x1, y1, z1) {
    return this.collect(W, x0 + 1e-4, y0 + 1e-4, z0 + 1e-4, x1 - 1e-4, y1 - 1e-4, z1 - 1e-4) > 0;
  },

  move(W, e, dx, dy, dz) {
    const hw = e.hw, h = e.h, p = e.pos;
    const bb = [p[0] - hw, p[1], p[2] - hw, p[0] + hw, p[1] + h, p[2] + hw];
    const odx = dx, ody = dy, odz = dz;
    const st = e.stepH || 0;
    this.collect(W, Math.min(bb[0], bb[0] + dx) - 1e-3, Math.min(bb[1], bb[1] + dy) - 1e-3, Math.min(bb[2], bb[2] + dz) - 1e-3,
      Math.max(bb[3], bb[3] + dx) + 1e-3, Math.max(bb[4], bb[4] + dy) + st + 1e-3, Math.max(bb[5], bb[5] + dz) + 1e-3);
    const orig = bb.slice();
    dy = this.clip(1, dy, bb); bb[1] += dy; bb[4] += dy;
    dx = this.clip(0, dx, bb); bb[0] += dx; bb[3] += dx;
    dz = this.clip(2, dz, bb); bb[2] += dz; bb[5] += dz;
    let onGround = ody < 0 && dy !== ody;
    if (st > 0 && (onGround || e.onGround) && (dx !== odx || dz !== odz)) {
      const b2 = orig.slice();
      let sy = this.clip(1, st, b2); b2[1] += sy; b2[4] += sy;
      const sx = this.clip(0, odx, b2); b2[0] += sx; b2[3] += sx;
      const sz = this.clip(2, odz, b2); b2[2] += sz; b2[5] += sz;
      const down = this.clip(1, -sy + Math.min(0, ody), b2); b2[1] += down; b2[4] += down;
      if (sx * sx + sz * sz > dx * dx + dz * dz + 1e-9) {
        for (let k = 0; k < 6; k++) bb[k] = b2[k];
        dx = sx; dz = sz; dy = sy + down;
        onGround = true;
        e.stepped = (e.stepped || 0) + Math.max(0, sy + down);
      }
    }
    p[0] = (bb[0] + bb[3]) / 2; p[1] = bb[1]; p[2] = (bb[2] + bb[5]) / 2;
    e.hitX = dx !== odx; e.hitZ = dz !== odz; e.hitY = dy !== ody;
    if (e.hitX) e.vel[0] = 0;
    if (e.hitZ) e.vel[2] = 0;
    if (e.hitY) e.vel[1] = 0;
    e.onGround = onGround;
    return e;
  },

  // integrate velocity in sub-steps (no tunnelling)
  integrate(W, e, dt) {
    const v = e.vel;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])) * dt / 0.4));
    const sdt = dt / steps;
    let ground = false;
    for (let i = 0; i < steps; i++) {
      let dx = v[0] * sdt, dz = v[2] * sdt;
      if (e.edgeSafe && e.onGround) {
        dx = this._edge(W, e, dx, 0); dz = this._edge(W, e, 0, dz);
      }
      this.move(W, e, dx, v[1] * sdt, dz);
      if (e.onGround) ground = true;
    }
    e.onGround = ground;
  },
  // sneaking: don't walk off edges higher than 0.6
  _edge(W, e, dx, dz) {
    const hw = e.hw - 0.02, p = e.pos;
    const d = dx || dz;
    if (!d) return 0;
    const probe = (ox, oz) => this.hasCollision(W, p[0] - hw + ox, p[1] - 0.6, p[2] - hw + oz, p[0] + hw + ox, p[1], p[2] + hw + oz);
    if (probe(dx, dz)) return d;
    // shrink the step until supported
    let s = d;
    for (let i = 0; i < 6; i++) { s *= 0.5; if (probe(dx ? s : 0, dz ? s : 0)) return s; }
    return 0;
  },

  // environment sampling over the entity's box: fluids, ladders, cobwebs, contact damage
  sample(W, e, out) {
    const p = e.pos, hw = e.hw;
    const x0 = Math.floor(p[0] - hw + 0.001), x1 = Math.floor(p[0] + hw - 0.001);
    const z0 = Math.floor(p[2] - hw + 0.001), z1 = Math.floor(p[2] + hw - 0.001);
    const y0 = Math.floor(p[1] + 0.001), y1 = Math.floor(p[1] + e.h - 0.001);
    out.water = 0; out.lava = 0; out.climb = false; out.slow = 1; out.damage = 0; out.flowX = 0; out.flowZ = 0;
    const fv = [0, 0, 0];
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const b = W.getBlock(x, y, z);
      if (!b) continue;
      const ft = MC.B_FLUID[b];
      if (ft) {
        const surf = y + (MC.B_FLUID[W.getBlock(x, y + 1, z)] === ft ? 1 : MC.fluidHeight(b));
        if (surf > p[1] + 0.001) {
          const depth = Math.min(surf, p[1] + e.h) - p[1];
          if (ft === MC.FLUID.WATER) {
            if (depth > out.water) out.water = depth;
            MC.Fluids.flowVector(W, x, y, z, fv);
            out.flowX += fv[0]; out.flowZ += fv[2];
          } else if (depth > out.lava) out.lava = depth;
        }
        continue;
      }
      if (MC.B_CLIMB[b]) out.climb = true;
      if (MC.B_SLOW[b]) out.slow = Math.min(out.slow, MC.B_SLOW[b]);
    }
    // contact damage (cactus): slightly expanded box
    for (let y = y0; y <= y1; y++) for (let z = Math.floor(p[2] - hw - 0.02); z <= Math.floor(p[2] + hw + 0.02); z++) for (let x = Math.floor(p[0] - hw - 0.02); x <= Math.floor(p[0] + hw + 0.02); x++) {
      const b = W.getBlock(x, y, z);
      if (MC.B_DAMAGE[b]) out.damage = Math.max(out.damage, MC.B_DAMAGE[b]);
    }
    const fl = Math.hypot(out.flowX, out.flowZ);
    if (fl > 1e-4) { out.flowX /= fl; out.flowZ /= fl; }
    return out;
  },
};
