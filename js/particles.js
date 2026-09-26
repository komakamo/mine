'use strict';
// Billboard particles (block debris, smoke, flames, explosions, bubbles, crits, hearts...).
MC.Particles = class {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.max = 2500;
  }
  add(p) {
    if (this.list.length >= this.max) this.list.splice(0, 64);
    p.age = 0;
    if (p.grav === undefined) p.grav = 0;
    if (p.drag === undefined) p.drag = 1;
    if (!p.rgb) p.rgb = [1, 1, 1];
    if (!p.emit) p.emit = 0;
    if (p.u0 === undefined) { p.u0 = 0; p.v0 = 0; p.u1 = 1; p.v1 = 1; }
    this.list.push(p);
    return p;
  }

  update(dt) {
    const W = this.world, L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy -= p.grav * dt;
      const k = Math.pow(p.drag, dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.collide) {
        const b = W.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (MC.B_SOLID[b] && MC.B_OPAQUE[b]) {
          if (p.grav > 0 && MC.B_SOLID[W.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))]) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
          else { p.vx *= -0.3; p.vz *= -0.3; }
          p.y = Math.max(p.y, Math.floor(ny) + (p.vy <= 0 ? 1.001 : 0));
        } else { p.x = nx; p.y = ny; p.z = nz; }
        if (p.bubble && !MC.B_FLUID[W.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))]) continue;
      } else { p.x = nx; p.y = ny; p.z = nz; }
      L[w++] = p;
    }
    L.length = w;
  }

  render(batch, cam) {
    const cp = Math.cos(cam.pitch);
    const f = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
    const right = [Math.cos(cam.yaw), 0, Math.sin(cam.yaw)];
    const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    const W = this.world;
    const rgb = [1, 1, 1];
    for (const p of this.list) {
      const t = p.age / p.life;
      let size = p.size * (p.grow ? 1 + t * p.grow : 1) * (p.shrink ? 1 - t * p.shrink : 1);
      if (size <= 0.001) continue;
      batch.setLight(W, p.x, p.y, p.z);
      if (p.fullbright) { batch.light[0] = 1; batch.light[1] = 1; }
      const fade = p.fade ? 1 - t * p.fade : 1;
      rgb[0] = p.rgb[0] * fade; rgb[1] = p.rgb[1] * fade; rgb[2] = p.rgb[2] * fade;
      batch.billboard(p.x, p.y, p.z, size, p.tile, p.u0, p.v0, p.u1, p.v1, right, up, rgb, p.emit * (p.emitFade ? 1 - t : 1), p.rot || 0);
    }
  }

  // ambient emitters around the player: torch flames / smoke and bubbling lava
  ambient(dt, px, py, pz) {
    const W = this.world;
    this._scanT = (this._scanT || 0) - dt;
    if (this._scanT <= 0) {
      this._scanT = 0.6;
      const torches = [], lava = [];
      const T0 = MC.BLOCK.torch, WT = MC.BLOCK.wall_torch, LAVA = MC.BLOCK.lava;
      const y0 = Math.max(0, Math.floor(py) - 12), y1 = Math.min(MC.HEIGHT - 1, Math.floor(py) + 12);
      const cx0 = Math.floor(px) >> 4, cz0 = Math.floor(pz) >> 4;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = W.getChunk(cx0 + dx, cz0 + dz);
        if (!c) continue;
        const B = c.blocks, top = Math.min(y1, c.maxY);
        for (let y = y0; y <= top; y++) {
          const base = y * 256;
          for (let k = 0; k < 256; k++) {
            const b = B[base + k];
            if (b === T0 || (b >= WT && b < WT + 4)) { if (torches.length < 80) torches.push([c.cx * 16 + (k & 15), y, c.cz * 16 + (k >> 4), b - WT]); }
            else if (b === LAVA && y + 1 < MC.HEIGHT && B[base + 256 + k] === 0 && lava.length < 60) lava.push([c.cx * 16 + (k & 15), y, c.cz * 16 + (k >> 4)]);
          }
        }
      }
      this._torches = torches; this._lava = lava;
    }
    if (this._torches) for (const [x, y, z, f] of this._torches) {
      if (Math.random() > dt * 1.6) continue;
      let tx = x + 0.5, ty = y + 0.72, tz = z + 0.5;
      if (f >= 0 && f < 4) { const d = MC.DIRS[f]; tx -= d[0] * 0.28; tz -= d[2] * 0.28; ty = y + 0.86; }
      this.flame(tx, ty, tz, 0.55);
      if (Math.random() < 0.5) this.smoke(tx, ty + 0.1, tz, 1, 0.35);
    }
    if (this._lava) for (const [x, y, z] of this._lava) {
      if (Math.random() > dt * 0.25) continue;
      this.add({ x: x + Math.random(), y: y + 0.95, z: z + Math.random(), vx: (Math.random() - 0.5) * 1.5, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5,
        life: 0.9 + Math.random() * 0.6, size: 0.06, tile: MC.TILE.particle_spark, emit: 1, emitFade: true, grav: 9, collide: true, fullbright: true });
      this.smoke(x + 0.5, y + 1.1, z + 0.5, 1, 0.6);
    }
  }

  // ---------------------------------------------------------------- emitters
  _blockTile(id) {
    const f = MC.B_SHAPE[id] === MC.SHAPE.CUBE ? 0 : 0;
    let tile = MC.B_TEX[id * 6 + f], tint = MC.B_TINT[id * 6 + f];
    if (id === MC.BLOCK.grass) { tile = MC.TILE.dirt; tint = 0; }
    const rgb = tint && tint !== MC.TINT.GRASS_MASKED ? [[0, 0, 0], [0.52, 0.78, 0.32], [0.4, 0.66, 0.22], [1, 1, 1], [0.5, 0.66, 0.33], [0.34, 0.52, 0.36]][tint].map((v) => Math.pow(v, 2.2)) : [1, 1, 1];
    return { tile, rgb };
  }
  blockBreak(x, y, z, id) {
    if (!id || MC.B_FLUID[id]) return;
    const { tile, rgb } = this._blockTile(id);
    const n = MC.B_SHAPE[id] === MC.SHAPE.CUBE ? 4 : 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      if (Math.random() < 0.45) continue;
      const px = x + (i + 0.5) / n, py = y + (j + 0.5) / n, pz = z + (k + 0.5) / n;
      const u = Math.floor(Math.random() * 12) / 16, v = Math.floor(Math.random() * 12) / 16;
      this.add({
        x: px, y: py, z: pz, vx: (px - x - 0.5) * 1.6 + (Math.random() - 0.5) * 0.6, vy: (py - y - 0.5) * 1.6 + 1 + Math.random() * 1.4, vz: (pz - z - 0.5) * 1.6 + (Math.random() - 0.5) * 0.6,
        life: 0.45 + Math.random() * 0.6, size: 0.035 + Math.random() * 0.035, tile, u0: u, v0: v, u1: u + 0.2, v1: v + 0.2, grav: 20, drag: 0.35, collide: true, rgb,
      });
    }
  }
  blockHit(x, y, z, id, n) {
    const { tile, rgb } = this._blockTile(id);
    const t = [x + 0.5, y + 0.5, z + 0.5];
    for (let i = 0; i < 2; i++) {
      const u = Math.floor(Math.random() * 12) / 16, v = Math.floor(Math.random() * 12) / 16;
      this.add({
        x: t[0] + n[0] * 0.52 + (n[0] ? 0 : Math.random() - 0.5), y: t[1] + n[1] * 0.52 + (n[1] ? 0 : Math.random() - 0.5), z: t[2] + n[2] * 0.52 + (n[2] ? 0 : Math.random() - 0.5),
        vx: n[0] * 1.5 + (Math.random() - 0.5), vy: 1 + Math.random(), vz: n[2] * 1.5 + (Math.random() - 0.5),
        life: 0.4 + Math.random() * 0.4, size: 0.04 + Math.random() * 0.03, tile, u0: u, v0: v, u1: u + 0.25, v1: v + 0.25, grav: 18, drag: 0.5, collide: true, rgb,
      });
    }
  }
  itemCrumbs(x, y, z, id, dir) {
    const model = MC.ItemModels.get(id);
    const tile = model.quads[0].tile;
    for (let i = 0; i < 5; i++) {
      const u = Math.floor(Math.random() * 10 + 3) / 16, v = Math.floor(Math.random() * 10 + 3) / 16;
      this.add({
        x: x + (Math.random() - 0.5) * 0.2, y: y + (Math.random() - 0.5) * 0.2, z: z + (Math.random() - 0.5) * 0.2,
        vx: (dir ? dir[0] * 1.5 : 0) + (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 1.5, vz: (dir ? dir[2] * 1.5 : 0) + (Math.random() - 0.5) * 1.5,
        life: 0.5 + Math.random() * 0.4, size: 0.035 + Math.random() * 0.02, tile, u0: u, v0: v, u1: u + 0.2, v1: v + 0.2, grav: 16, drag: 0.5, collide: true,
      });
    }
  }
  smoke(x, y, z, n = 1, big = 1) {
    for (let i = 0; i < n; i++) {
      const g = 0.35 + Math.random() * 0.4;
      this.add({
        x: x + (Math.random() - 0.5) * 0.3 * big, y: y + (Math.random() - 0.5) * 0.3 * big, z: z + (Math.random() - 0.5) * 0.3 * big,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4,
        life: 1 + Math.random() * 1.5, size: (0.08 + Math.random() * 0.08) * big, tile: MC.TILE.particle_smoke, drag: 0.6, rgb: [g, g, g], grow: 1.5, fade: 0.6, rot: Math.random() * 6,
      });
    }
  }
  flame(x, y, z, s = 1) {
    this.add({
      x: x + (Math.random() - 0.5) * 0.15, y, z: z + (Math.random() - 0.5) * 0.15,
      vx: (Math.random() - 0.5) * 0.2, vy: 0.4 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.2,
      life: 0.4 + Math.random() * 0.4, size: (0.06 + Math.random() * 0.05) * s, tile: MC.TILE.particle_flame, emit: 1, emitFade: true, shrink: 0.9, fullbright: true,
    });
  }
  explosion(x, y, z, power) {
    for (let i = 0; i < 16 + power * 6; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, r = Math.random() * power * 0.8;
      const g = 0.7 + Math.random() * 0.3;
      this.add({
        x: x + Math.cos(a) * Math.cos(b) * r, y: y + Math.sin(b) * r * 0.7, z: z + Math.sin(a) * Math.cos(b) * r,
        vx: Math.cos(a) * 1.5, vy: 0.8 + Math.random(), vz: Math.sin(a) * 1.5,
        life: 0.6 + Math.random() * 0.7, size: 0.5 + Math.random() * 0.7, tile: MC.TILE.particle_explosion, drag: 0.3, rgb: [g, g * 0.95, g * 0.9], emit: 0.4, emitFade: true, grow: 0.6, fade: 0.8, rot: Math.random() * 6,
      });
    }
    this.smoke(x, y, z, 20, power * 0.9);
    for (let i = 0; i < 20; i++) {
      this.add({
        x, y, z, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 10, vz: (Math.random() - 0.5) * 16,
        life: 0.4 + Math.random() * 0.5, size: 0.06, tile: MC.TILE.particle_spark, emit: 1, emitFade: true, grav: 12, drag: 0.5, fullbright: true,
      });
    }
  }
  crit(x, y, z) {
    for (let i = 0; i < 10; i++) {
      this.add({
        x, y, z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5,
        life: 0.4 + Math.random() * 0.4, size: 0.08, tile: MC.TILE.particle_crit, emit: 0.6, emitFade: true, grav: 6, drag: 0.2, fullbright: true,
      });
    }
  }
  hearts(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.3, z: z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.8, vz: 0, life: 1, size: 0.12, tile: MC.TILE.particle_heart, drag: 0.5, emit: 0.2 });
    }
  }
  sparkle(x, y, z, n = 6, rgb = [0.4, 1, 0.5]) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + (Math.random() - 0.5) * 0.8, y: y + Math.random() * 0.8, z: z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 0.5, vz: 0, life: 0.8 + Math.random() * 0.5, size: 0.07, tile: MC.TILE.particle_crit, rgb, emit: 0.8, emitFade: true, fullbright: true });
    }
  }
  splash(x, y, z, n = 12) {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.8, y, z: z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 2.5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 2.5,
        life: 0.5 + Math.random() * 0.3, size: 0.05, tile: MC.TILE.particle_bubble, grav: 16, drag: 0.6, rgb: [0.6, 0.8, 1],
      });
    }
  }
  bubbles(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.3,
        life: 1.5 + Math.random(), size: 0.05 + Math.random() * 0.03, tile: MC.TILE.particle_bubble, drag: 0.5, collide: true, bubble: true,
      });
    }
  }
  poof(x, y, z, w = 0.6, h = 1.2) {
    for (let i = 0; i < 14; i++) {
      const g = 0.8 + Math.random() * 0.2;
      this.add({
        x: x + (Math.random() - 0.5) * w, y: y + Math.random() * h, z: z + (Math.random() - 0.5) * w,
        vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.2,
        life: 0.6 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.1, tile: MC.TILE.particle_smoke, drag: 0.4, rgb: [g, g, g], fade: 0.5, grow: 0.5, rot: Math.random() * 6,
      });
    }
  }
};
