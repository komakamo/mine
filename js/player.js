'use strict';
// First-person player: movement physics, survival stats (health, hunger, air, fire, fall damage),
// mining with progress, combat, item use (food, bow, buckets, tools) and block placement.
MC.Player = class {
  constructor(world) {
    this.world = world;
    this.pos = [0.5, 100, 0.5];
    this.vel = [0, 0, 0];
    this.hw = 0.3; this.h = 1.8; this.stepH = 0.6;
    this.yaw = 0.6; this.pitch = -0.05;
    this.onGround = false; this.flying = false;
    this.inWater = false; this.eyeInWater = false; this.inLava = false;
    this.keys = {};
    this.inv = new MC.Inventory(36);
    this.armor = new MC.Inventory(1);   // worn 甲冑 (suit of armour)
    this.armor.accept = (id) => !!MC.armorOf(id);
    this.selected = 0;
    this.creative = false;
    this.lastSpace = 0;
    this.target = null; this.targetEntity = null;
    this.sprinting = false;
    this.fovKick = 0;
    this.bob = 0;
    this.env = {};
    // survival
    this.health = 20; this.maxHealth = 20; this.food = 20; this.sat = 5; this.exh = 0; this.air = 15;
    this.slowT = 0; this.poisonT = 0; this.poisonTick = 0; this.staffCD = 0;
    this.dead = false; this.deathMsg = '';
    this.invul = 0; this.hurtFlash = 0; this.hurtTilt = 0;
    this.regenT = 0; this.starveT = 0; this.drownT = 0; this.fire = 0; this.fireT = 0; this.lavaT = 0; this.cactusT = 0; this.voidT = 0;
    this.fallY = 100; this.spawn = null;
    this.fuel = 0;
    this.breaking = null;       // { x, y, z, block, t, need }
    this.use = null;            // { kind: 'eat'|'bow', t, id }
    this.stepDist = 0;
    this.attackCD = 0;
    this.regenBoost = 0;
    this.wasInWater = false;
  }

  setCreative(on) {
    this.creative = on;
    this.world.creative = on;
    if (!on) this.flying = false;
  }
  eyeHeight() { return this.keys.ShiftLeft && !this.flying ? 1.5 : 1.62; }
  eyePos() { return [this.pos[0], this.pos[1] + this.eyeHeight(), this.pos[2]]; }
  forward() {
    const cp = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }
  heldStack() { return this.inv.slots[this.selected]; }
  heldId() { const s = this.heldStack(); return s ? s.id : 0; }
  heldBlock() { const id = this.heldId(); return id < MC.ITEM_BASE ? id : 0; }
  get hotbar() { return this.inv.slots.slice(0, 9).map((s) => (s ? s.id : 0)); }

  pickup(stack) {
    const left = this.inv.add(stack, MC.Player.ORDER);
    if (this.onChange) this.onChange();
    return left;
  }
  dropStack(stack, far) {
    const W = this.world;
    if (!W.entities || !stack) return;
    const e = this.eyePos(), f = this.forward();
    const sp = far ? 6 : 4;
    const it = W.entities.spawnItem(e[0] + f[0] * 0.3, e[1] - 0.3, e[2] + f[2] * 0.3, stack, [f[0] * sp, f[1] * sp + 1.5, f[2] * sp]);
    if (it) it.pickupDelay = 1.5;
  }
  dropHeld(all) {
    const s = this.heldStack();
    if (!s) return;
    const n = all ? s.count : 1;
    const out = Object.assign({}, s, { count: n });
    if (!this.creative) { s.count -= n; if (s.count <= 0) this.inv.slots[this.selected] = null; }
    this.dropStack(out, true);
    if (this.onChange) this.onChange();
  }
  consumeHeld(n = 1) {
    if (this.creative) return;
    const s = this.heldStack();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inv.slots[this.selected] = null;
    if (this.onChange) this.onChange();
  }
  damageHeld(n = 1) {
    if (this.creative) return;
    const s = this.heldStack();
    if (!s || s.dur === undefined) return;
    s.dur -= n;
    if (s.dur <= 0) {
      this.inv.slots[this.selected] = null;
      if (MC.Audio) MC.Audio.play('dig_wood', null, 0.8, 1.6);
      if (this.game && this.game.ui) this.game.ui.toast(MC.itemName(s.id) + 'が壊れた');
    }
    if (this.onChange) this.onChange();
  }
  addExh(x) { if (!this.creative) this.exh += x; }

  // ------------------------------------------------------------------ damage
  // worn armour: its item definition, or null
  armorDef() { const s = this.armor.slots[0]; return s ? MC.armorOf(s.id) : null; }
  hurt(amount, src, kx = 0, kz = 0) {
    if (this.dead || this.creative || amount <= 0) return false;
    if (this.invul > 0) return false;
    if (this.game && this.game.settings.difficulty === 0 && src !== 'void' && src !== 'fall' && src !== 'lava' && src !== 'drown' && src !== 'fire' && src !== 'starve') return false;
    // armour turns blows, arrows, bullets and blasts (not falls, drowning, hunger, poison or flames)
    const ar = this.armorDef();
    let kb = 1;
    if (ar && !MC.Player.UNARMORED.has(src)) {
      amount = Math.max(1, Math.round(amount * (1 - ar.armor)));
      kb = ar.kb !== undefined ? ar.kb : 1 - ar.armor * 0.5;
      const s = this.armor.slots[0];
      if (s.dur !== undefined && (s.dur -= 1) <= 0) {
        this.armor.slots[0] = null;
        if (MC.Audio) MC.Audio.play('dig_wood', null, 0.8, 1.3);
        if (this.game && this.game.ui) this.game.ui.toast(MC.itemName(s.id) + 'が壊れた');
      }
    }
    this.health -= amount;
    this.invul = 0.5;
    this.hurtFlash = 1;
    this.hurtTilt = 1;
    this.exh += 0.1;
    if (kx || kz) {
      const l = Math.hypot(kx, kz) || 1;
      this.vel[0] += kx / l * 6 * kb; this.vel[2] += kz / l * 6 * kb;
      this.vel[1] = Math.max(this.vel[1], 4.5 * kb);
    }
    if (MC.Audio) MC.Audio.play('hurt', null, 0.9);
    if (this.health <= 0) this.die(src);
    return true;
  }
  heal(n) { if (!this.dead) this.health = Math.min(this.maxHealth, this.health + n); }
  // status effects from castle monsters: { slow: s, poison: s, fire: s }
  addEffects(fx) {
    if (this.creative || this.dead || !fx) return;
    if (fx.slow) { if (this.slowT <= 0 && MC.Audio) MC.Audio.play('freeze', null, 0.5); this.slowT = Math.max(this.slowT, fx.slow); }
    if (fx.poison) this.poisonT = Math.max(this.poisonT, fx.poison);
    if (fx.fire && !this.inWater) this.fire = Math.max(this.fire, fx.fire);
  }
  die(src) {
    this.health = 0;
    this.dead = true;
    this.use = null; this.breaking = null;
    this.slowT = 0; this.poisonT = 0;
    const M = { zombie: 'ゾンビに倒された', skeleton: 'スケルトンに射抜かれた', arrow: '矢に射抜かれた', spider: 'クモに倒された', creeper: 'クリーパーに爆破された',
      explosion: '爆発に巻き込まれた', fall: '高い所から落ちた', guardian: 'ダンジョンの番人に倒された', lava: '溶岩遊泳を試みた', fire: '燃え尽きた', drown: '溺れ死んだ', starve: '餓死した', cactus: 'サボテンに刺された', void: '奈落に落ちた',
      poison: '毒に倒れた', magic: '魔法に倒された' };
    this.deathMsg = M[src] || (MC.MOB_TYPES[src] ? MC.MOB_TYPES[src].name + 'に倒された' : '倒された');
    if (MC.Audio) MC.Audio.play('death', null, 1);
    if (this.game && !this.game.settings.keepInventory) {
      for (const c of [this.inv, this.armor]) for (let i = 0; i < c.size; i++) {
        const s = c.slots[i];
        if (!s) continue;
        if (this.world.entities) this.world.entities.spawnItem(this.pos[0], this.pos[1] + 1, this.pos[2], s, [(Math.random() - 0.5) * 5, 3, (Math.random() - 0.5) * 5]);
        c.slots[i] = null;
      }
    }
    if (this.onChange) this.onChange();
  }
  respawn(worldSpawn) {
    const sp = this.spawn || worldSpawn;
    this.pos = [sp[0], sp[1], sp[2]];
    this.vel = [0, 0, 0];
    this.health = this.maxHealth; this.food = 20; this.sat = 5; this.exh = 0; this.air = 15;
    this.fire = 0; this.slowT = 0; this.poisonT = 0; this.dead = false; this.invul = 2; this.fallY = this.pos[1];
    if (this.onChange) this.onChange();
  }

  // ------------------------------------------------------------------ update
  update(dt, game) {
    this.game = game;
    const k = this.keys, W = this.world, B = MC.BLOCK;
    this.invul -= dt; this.attackCD -= dt; this.staffCD -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.hurtTilt = Math.max(0, this.hurtTilt - dt * 3);
    if (this.dead) { this.target = null; return; }
    const env = MC.Phys.sample(W, this, this.env);
    this.inWater = env.water > 0.1;
    this.inLava = env.lava > 0;
    const swimming = env.water > 0.6 || env.lava > 0.6;
    const e = this.eyePos();
    const eb = W.getBlock(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2]));
    if (MC.B_FLUID[eb] === MC.FLUID.WATER) {
      const surf = MC.B_FLUID[W.getBlock(Math.floor(e[0]), Math.floor(e[1]) + 1, Math.floor(e[2]))] ? 1 : MC.fluidHeight(eb);
      this.eyeInWater = e[1] - Math.floor(e[1]) < surf + 0.02;
    } else this.eyeInWater = false;
    if (this.inWater && !this.wasInWater && this.vel[1] < -4) {
      if (MC.Audio) MC.Audio.play('splash', this.pos, 0.8);
      if (game.particles) game.particles.splash(this.pos[0], this.pos[1] + 0.5, this.pos[2]);
    }
    this.wasInWater = this.inWater;

    let fx = 0, fz = 0;
    if (k.KeyW) fz += 1; if (k.KeyS) fz -= 1;
    if (k.KeyA) fx -= 1; if (k.KeyD) fx += 1;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let mx = fx * c + fz * s, mz = fx * s - fz * c;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const canSprint = this.creative || this.food > 6;
    if ((k.KeyR || this.sprintKey) && fz > 0 && canSprint && !this.use) this.sprinting = true;
    if (fz <= 0 || ml === 0 || !canSprint || this.hitX || this.hitZ) { this.sprinting = false; this.sprintKey = false; }
    const sneak = k.ShiftLeft && !this.flying;
    const usingSlow = this.use ? 0.3 : 1;
    let speed = this.flying ? (this.sprinting ? 24 : 11) : swimming ? (this.sprinting ? 3.4 : 2.4) : sneak ? 1.4 : this.sprinting ? 5.7 : 4.35;
    speed *= env.slow * (this.flying ? 1 : usingSlow) * (this.slowT > 0 && !this.flying ? 0.5 : 1);
    const accel = this.flying ? 9 : this.onGround ? 16 : this.inWater ? 7 : 4;
    const a = Math.min(1, accel * dt);
    this.vel[0] += (mx * speed - this.vel[0]) * a;
    this.vel[2] += (mz * speed - this.vel[2]) * a;

    if (this.flying) {
      const vy = ((k.Space ? 1 : 0) - (k.ShiftLeft ? 1 : 0)) * speed * 0.8;
      this.vel[1] += (vy - this.vel[1]) * Math.min(1, 10 * dt);
    } else if (this.inWater || this.inLava) {
      this.vel[1] -= (this.inLava ? 6 : 10) * dt;
      if (k.Space) this.vel[1] += (this.inLava ? 16 : 24) * dt;
      this.vel[1] *= Math.max(0, 1 - (this.inLava ? 4 : 2.5) * dt);
      this.vel[1] = MC.clamp(this.vel[1], -4, 4.2);
      // hop out onto a ledge
      if (k.Space && (this.hitX || this.hitZ) && env.water < 1.2) this.vel[1] = Math.max(this.vel[1], 5.5);
      this.vel[0] += env.flowX * 5 * dt; this.vel[2] += env.flowZ * 5 * dt;
    } else if (env.climb) {
      this.vel[1] -= 32 * dt;
      if (k.Space || ((this.hitX || this.hitZ) && ml > 0)) this.vel[1] = 3.2;
      else if (sneak) this.vel[1] = Math.max(this.vel[1], 0);
      else this.vel[1] = Math.max(this.vel[1], -2.5);
    } else {
      this.vel[1] -= 32 * dt;
      if (this.vel[1] < -60) this.vel[1] = -60;
      if (env.slow < 1) this.vel[1] = Math.max(this.vel[1], -1.2);
      if (k.Space && this.onGround) {
        this.vel[1] = 9.0; this.onGround = false;
        if (this.sprinting) { this.vel[0] += mx * 1.8; this.vel[2] += mz * 1.8; this.addExh(0.2); } else this.addExh(0.05);
      }
    }
    const wasGround = this.onGround;
    const px = this.pos[0], pz = this.pos[2];
    this.edgeSafe = sneak;
    MC.Phys.integrate(W, this, dt);
    if (this.flying && this.onGround && !k.Space) this.flying = false;
    const moved = Math.hypot(this.pos[0] - px, this.pos[2] - pz);
    if (this.sprinting && this.onGround) this.addExh(0.1 * moved);
    else if (this.inWater) this.addExh(0.01 * moved);
    // footsteps
    if (this.onGround && !this.flying) {
      this.stepDist += moved;
      if (this.stepDist > (this.sprinting ? 2.2 : 1.8)) {
        this.stepDist = 0;
        const below = W.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.2), Math.floor(this.pos[2]));
        if (below && MC.Audio && !sneak) MC.Audio.block('step', MC.B_SOUND[below], this.pos, 0.5);
      }
    } else if (this.inWater && moved > 0.01) {
      this.stepDist += moved;
      if (this.stepDist > 2.5) { this.stepDist = 0; if (MC.Audio) MC.Audio.play('swim', this.pos, 0.35); }
    }
    // fall damage
    if (this.flying || this.inWater || env.climb || this.creative) this.fallY = this.pos[1];
    else if (this.onGround) {
      const h = this.fallY - this.pos[1];
      if (!wasGround && h > 3.2) {
        this.hurt(Math.floor(h - 3), 'fall');
        const below = W.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.2), Math.floor(this.pos[2]));
        if (MC.Audio && below) MC.Audio.block('dig', MC.B_SOUND[below], this.pos, 0.6);
      }
      this.fallY = this.pos[1];
    } else if (this.vel[1] > 0) this.fallY = this.pos[1];
    else this.fallY = Math.max(this.fallY, this.pos[1]);
    if (this.pos[1] < -40) {
      if (this.creative) { this.pos[1] = MC.HEIGHT + 5; this.vel[1] = 0; }
      else { this.voidT -= dt; if (this.voidT <= 0) { this.voidT = 0.5; this.invul = 0; this.hurt(4, 'void'); } }
    }
    if (this.pos[1] > MC.HEIGHT + 20) { this.pos[1] = MC.HEIGHT + 20; this.vel[1] = Math.min(this.vel[1], 0); }
    // view bob & FOV kick
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    if (this.onGround && hs > 0.5) this.bob += dt * hs * 1.9; else this.bob *= 0.9;
    this.fovKick += ((this.sprinting ? 8 : 0) + (this.flying && this.sprinting ? 6 : 0) - (this.use && this.use.kind === 'bow' ? Math.min(1, this.use.t) * 12 : 0) - this.fovKick) * Math.min(1, dt * 8);

    this._survival(dt, env, game);
    this.target = this.raycast(this.creative ? 5.5 : 4.8);
    const ents = W.entities;
    const f = this.forward();
    this.targetEntity = null;
    if (ents) {
      const reach = (this.creative ? 5 : 3.6) + ((MC.itemDef(this.heldId()) || {}).reach || 0);
      const hit = ents.raycastEntities(this.eyePos(), f, reach, null, false);
      if (hit && (!this.target || hit.t < this.target.t)) { this.targetEntity = hit.e; this.target = null; }
    }
    this._updateBreaking(dt, game);
    this._updateUse(dt, game);
  }

  _survival(dt, env, game) {
    if (this.creative) { this.air = 15; this.fire = 0; return; }
    const diff = game.settings.difficulty;
    // frozen / poisoned
    if (this.slowT > 0) this.slowT -= dt;
    if (this.poisonT > 0) {
      this.poisonT -= dt; this.poisonTick -= dt;
      if (this.poisonTick <= 0) { this.poisonTick = 1.25; if (this.health > 1) { this.invul = 0; this.hurt(1, 'poison'); } }
    }
    // hunger
    while (this.exh >= 4) { this.exh -= 4; if (this.sat > 0) this.sat = Math.max(0, this.sat - 1); else if (diff > 0) this.food = Math.max(0, this.food - 1); }
    if (diff === 0) { this.regenT += dt; if (this.regenT > 1) { this.regenT = 0; this.heal(1); this.food = Math.min(20, this.food + 1); } }
    else if (this.health < this.maxHealth && (this.food >= 18 || this.regenBoost > 0)) {
      this.regenT += dt;
      const fast = this.food >= 20 && this.sat > 0;
      if (this.regenT >= (this.regenBoost > 0 ? 1.2 : fast ? 0.5 : 4)) { this.regenT = 0; this.heal(1); if (this.regenBoost <= 0) this.exh += 6; }
    } else this.regenT = 0;
    this.regenBoost -= dt;
    if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT = 0; const floor = [20, 10, 1, 0][diff]; if (this.health > floor) { this.invul = 0; this.hurt(1, 'starve'); } }
    } else this.starveT = 0;
    // air
    if (this.eyeInWater) {
      this.air -= dt;
      if (this.air <= 0) { this.air = 0; this.drownT -= dt; if (this.drownT <= 0) { this.drownT = 1; this.invul = 0; this.hurt(2, 'drown'); } }
      if (game.particles && Math.random() < dt * 3) { const e = this.eyePos(), f = this.forward(); game.particles.bubbles(e[0] + f[0] * 0.4, e[1] - 0.1, e[2] + f[2] * 0.4, 1); }
    } else this.air = Math.min(15, this.air + dt * 6);
    // lava / fire
    if (this.inLava) { this.fire = 8; this.lavaT -= dt; if (this.lavaT <= 0) { this.lavaT = 0.5; this.invul = 0; this.hurt(4, 'lava'); } }
    if (this.inWater) this.fire = 0;
    if (this.fire > 0) {
      this.fire -= dt; this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = 1; this.hurt(1, 'fire'); }
    }
    if (env.damage) { this.cactusT -= dt; if (this.cactusT <= 0) { this.cactusT = 0.5; this.hurt(env.damage, 'cactus'); } }
  }

  onSpace() {
    const now = performance.now();
    if (this.creative && now - this.lastSpace < 280) { this.flying = !this.flying; this.vel[1] = 0; }
    this.lastSpace = now;
  }

  // ------------------------------------------------------------------ targeting
  selBox(x, y, z, b) {
    const sh = MC.B_SHAPE[b];
    if (sh === MC.SHAPE.FENCE || sh === MC.SHAPE.PANE) {
      let mask = 0;
      const conn = sh === MC.SHAPE.FENCE ? MC.connectsFence : MC.connectsPane;
      for (let f = 0; f < 4; f++) { const d = MC.DIRS[f]; if (conn(this.world.getBlock(x + d[0], y, z + d[2]))) mask |= 1 << f; }
      const u = [16, 16, 16, 0, 0, 0];
      for (const q of MC.connectBoxes(sh, mask, false)) for (let a = 0; a < 3; a++) { u[a] = Math.min(u[a], q[a]); u[a + 3] = Math.max(u[a + 3], q[a + 3]); }
      return u.map((v) => v / 16);
    }
    if (MC.B_SEL[b]) return MC.B_SEL[b];
    if (sh === MC.SHAPE.BOXES) {
      const u = [16, 16, 16, 0, 0, 0];
      for (const q of MC.B_BOXES[b]) for (let a = 0; a < 3; a++) { u[a] = Math.min(u[a], q.b[a]); u[a + 3] = Math.max(u[a + 3], q.b[a + 3]); }
      return u.map((v) => v / 16);
    }
    return MC.Player.FULL;
  }
  raycast(maxD, fluids) {
    const o = this.eyePos(), d = this.forward(), W = this.world;
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
    const tdx = sx ? Math.abs(1 / d[0]) : Infinity, tdy = sy ? Math.abs(1 / d[1]) : Infinity, tdz = sz ? Math.abs(1 / d[2]) : Infinity;
    let tmx = sx ? ((sx > 0 ? x + 1 : x) - o[0]) / d[0] : Infinity;
    let tmy = sy ? ((sy > 0 ? y + 1 : y) - o[1]) / d[1] : Infinity;
    let tmz = sz ? ((sz > 0 ? z + 1 : z) - o[2]) / d[2] : Infinity;
    let t = 0;
    for (let i = 0; i < 64 && t <= maxD; i++) {
      const b = W.getBlock(x, y, z);
      if (b !== 0) {
        const fl = MC.B_FLUID[b];
        if (fl ? (fluids && MC.B_LEVEL[b] === 0) : true) {
          const sb = fl ? MC.Player.FULL : this.selBox(x, y, z, b);
          const r = MC.rayBoxN(o, d, x + sb[0], y + sb[1], z + sb[2], x + sb[3], y + sb[4], z + sb[5]);
          if (r && r.t <= maxD) return { x, y, z, n: r.n, block: b, t: r.t, sel: sb, hit: [o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t] };
        }
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; }
      else { z += sz; t = tmz; tmz += tdz; }
    }
    return null;
  }

  // ------------------------------------------------------------------ mining
  breakTime(b) {
    const h = MC.B_HARD[b];
    if (h < 0) return Infinity;
    if (h === 0) return 0;
    const tool = MC.toolOf(this.heldId());
    const bt = MC.B_TOOL[b];
    const right = tool && tool.type === bt;
    let speed = right ? tool.speed : 1;
    if (tool && tool.type === MC.TOOL.SWORD && b === MC.BLOCK.cobweb) speed = 15;
    else if (tool && tool.type === MC.TOOL.SWORD) speed = 1.5;
    if (tool && tool.type === MC.TOOL.HOE && MC.B_MAT[b] === MC.MAT.LEAVES) speed = 4;
    const harvest = this.canHarvest(b);
    if (!this.onGround && !this.flying && !this.inWater) speed /= 3;
    if (this.eyeInWater) speed /= 5;
    return h * (harvest ? 1.5 : 5) / speed;
  }
  canHarvest(b) {
    const tier = MC.B_TIER[b];
    if (!tier) return true;
    const tool = MC.toolOf(this.heldId());
    return !!tool && tool.type === MC.B_TOOL[b] && tool.tier >= tier;
  }
  // called while the attack button is held
  mine(dt, first, game) {
    const t = this.target;
    if (!t) { this.breaking = null; return false; }
    const b = t.block;
    if (MC.B_HARD[b] < 0) { this.breaking = null; return false; }
    if (this.creative) {
      if (!first && this._cBreakT > 0) { this._cBreakT -= dt; return false; }
      this._cBreakT = 0.22;
      this.finishBreak(t, game);
      return true;
    }
    const br = this.breaking;
    if (!br || br.x !== t.x || br.y !== t.y || br.z !== t.z || br.block !== b) {
      this.breaking = { x: t.x, y: t.y, z: t.z, block: b, t: 0, need: this.breakTime(b), fxT: 0, face: t.n };
      if (this.breaking.need <= 0.05 && (first || this._instantT <= 0)) { this._instantT = 0.2; this.finishBreak(t, game); return true; }
    }
    return false;
  }
  _updateBreaking(dt, game) {
    this._instantT = (this._instantT || 0) - dt;
    const br = this.breaking;
    if (!br) return;
    if (!game.mouseDown || !this.target || this.target.x !== br.x || this.target.y !== br.y || this.target.z !== br.z) { this.breaking = null; return; }
    br.need = this.breakTime(br.block);
    br.t += dt;
    br.fxT -= dt;
    if (br.fxT <= 0) {
      br.fxT = 0.22;
      if (game.particles) game.particles.blockHit(br.x, br.y, br.z, br.block, br.face);
      if (MC.Audio) MC.Audio.block('hit', MC.B_SOUND[br.block], [br.x + 0.5, br.y + 0.5, br.z + 0.5], 0.5);
      if (game.renderer) game.renderer.hand.startSwing();
    }
    if (br.t >= br.need) { this.finishBreak(this.target, game); this.breaking = null; }
  }
  finishBreak(t, game) {
    const W = this.world, B = MC.BLOCK;
    const b = W.getBlock(t.x, t.y, t.z);
    if (!b || MC.B_HARD[b] < 0) return;
    const d = MC.BLOCKS[b];
    const drops = !this.creative && this.canHarvest(b);
    let repl = 0;
    if (b === B.ice && !this.creative) { const below = W.getBlock(t.x, t.y - 1, t.z); if (below && !MC.B_FLUID[below] || MC.B_FLUID[below]) repl = B.water; }
    // doors / beds break as a pair (only one half drops)
    if (d.door) {
      const oy = d.door.upper ? -1 : 1;
      if (MC.isDoor(W.getBlock(t.x, t.y + oy, t.z))) W.setBlock(t.x, t.y + oy, t.z, 0, MC.SB.NOUPDATE);
    }
    if (d.bed) {
      const dir = MC.DIRS[d.facing], sg = d.bed.head ? -1 : 1;
      if (MC.isBed(W.getBlock(t.x + dir[0] * sg, t.y, t.z + dir[2] * sg))) W.setBlock(t.x + dir[0] * sg, t.y, t.z + dir[2] * sg, 0, MC.SB.NOUPDATE);
    }
    W.breakBlock(t.x, t.y, t.z, { drops, replaceWith: repl, dropList: drops ? MC.blockDrops(b) : null });
    if (MC.Audio) MC.Audio.block('dig', MC.B_SOUND[b], [t.x + 0.5, t.y + 0.5, t.z + 0.5], 1);
    const it = MC.itemDef(this.heldId());
    let extra = 0;
    // legendary hammer: also breaks the 3x3 square around the mined block (plane facing the player)
    if (it && it.fx && it.fx.area && t.n && (MC.B_TOOL[b] === MC.TOOL.PICKAXE || MC.B_TOOL[b] === MC.TOOL.SHOVEL)) {
      const ax = t.n[0] ? [0, 1, 0] : [1, 0, 0], bx = t.n[2] ? [0, 1, 0] : t.n[0] ? [0, 0, 1] : [0, 0, 1];
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
        if (!u && !v) continue;
        const x = t.x + ax[0] * u + bx[0] * v, y = t.y + ax[1] * u + bx[1] * v, z = t.z + ax[2] * u + bx[2] * v;
        const b2 = W.getBlock(x, y, z);
        if (!b2 || MC.B_FLUID[b2] || MC.B_HARD[b2] < 0 || MC.B_HARD[b2] > Math.max(MC.B_HARD[b], 3.5) || MC.isChest(b2) || MC.BLOCKS[b2].door || MC.BLOCKS[b2].bed) continue;
        const d2 = !this.creative && this.canHarvest(b2);
        W.breakBlock(x, y, z, { drops: d2, dropList: d2 ? MC.blockDrops(b2) : null });
        extra++;
      }
    }
    if (!this.creative) {
      this.addExh(0.005);
      const tool = MC.toolOf(this.heldId());
      if (tool && MC.B_HARD[b] > 0) this.damageHeld((tool.type === MC.TOOL.SWORD ? 2 : 1) + Math.ceil(extra / 3));
    }
    if (game && game.renderer) game.renderer.hand.startSwing();
  }

  // ------------------------------------------------------------------ combat
  attack(game) {
    const e = this.targetEntity;
    if (!e || this.attackCD > 0) return false;
    if (e.cfg && e.cfg.ally) return false;   // the kingdom's own people
    const tool = MC.toolOf(this.heldId());
    let dmg = tool ? tool.damage : 1;
    const crit = !this.onGround && this.vel[1] < 0 && !this.inWater && !this.flying;
    if (crit) dmg *= 1.5;
    const f = this.forward();
    const idef = MC.itemDef(this.heldId()) || {};
    const kb = (this.sprinting ? 1.6 : 1) * (idef.knock || 1);
    const ok = e.hurt(Math.round(dmg), 'player', game.entities, f[0] * kb, f[2] * kb);
    if (ok) {
      if (crit && game.particles) { const c = e.center(); game.particles.crit(c[0], c[1] + 0.3, c[2]); }
      // legendary weapon effects
      const fx = idef.fx;
      if (fx) {
        const c = e.center();
        if (fx.lifesteal && !this.dead) { this.heal(fx.lifesteal); if (game.particles) game.particles.sparkle(c[0], c[1], c[2], 5, [1.3, 1.1, 0.5]); }
        if (fx.freeze) { e.slowT = Math.max(e.slowT || 0, fx.freeze); if (game.particles) game.particles.sparkle(c[0], c[1], c[2], 8, [0.6, 0.95, 1.4]); if (MC.Audio) MC.Audio.play('freeze', c, 0.6); }
        if (fx.ignite && !e.cfg.fireproof) e.fire = Math.max(e.fire, fx.ignite);
        // sweeping cut: the blade's arc also strikes the monsters around the target
        if (fx.sweep) {
          for (const o of game.entities.list) {
            if (o === e || o.kind !== 'mob' || o.dead || !o.cfg.hostile) continue;
            const oc = o.center();
            if (Math.hypot(oc[0] - c[0], oc[2] - c[2]) > 2.8 || Math.abs(oc[1] - c[1]) > 2) continue;
            o.hurt(Math.max(1, Math.round(dmg * fx.sweep)), 'player', game.entities, oc[0] - this.pos[0], oc[2] - this.pos[2]);
          }
          if (game.particles) {
            const e0 = this.eyePos();
            for (let i = -4; i <= 4; i++) {
              const a = this.yaw + i * 0.22, x = e0[0] + Math.sin(a) * 2.1, z = e0[2] - Math.cos(a) * 2.1;
              game.particles.sparkle(x, e0[1] - 0.35 + i * 0.03, z, 1, [0.85, 0.95, 1.4]);
            }
          }
        }
      }
      if (MC.Audio) MC.Audio.play(crit ? 'crit' : 'attack', e.center(), 0.7);
      if (tool) this.damageHeld(tool.type === MC.TOOL.SWORD ? 1 : 2);
      this.addExh(0.1);
      if (this.sprinting) { this.sprinting = false; }
    }
    this.attackCD = 0.25;
    return true;
  }

  // ------------------------------------------------------------------ using items (right button)
  // returns true if something happened (swing)
  useItem(game, first) {
    const W = this.world, B = MC.BLOCK, t = this.target, E = this.targetEntity;
    const id = this.heldId(), it = MC.itemDef(id);
    const sneak = this.keys.ShiftLeft;
    // entity interaction
    if (E && first) {
      if (E.cfg && E.cfg.ally && !E.dead && MC.KingdomPeople) return MC.KingdomPeople.interact(game, E);
      if (E.type === 'villager' && !E.dead) { game.ui.openTrade(E); return true; }
      if (E.cfg && E.cfg.food && it && E.cfg.food.includes(it.key) && !this.creative) {
        this.consumeHeld(1);
        if (game.particles) { const c = E.center(); game.particles.hearts(c[0], c[1] + 0.4, c[2]); }
        E.panic = 0;
        return true;
      }
    }
    // block interaction
    if (t && first && !sneak) {
      const b = t.block, d = MC.BLOCKS[b];
      if (MC.KingdomUI && (MC.isStairs(b) || b === B.gold_block) && MC.KingdomUI.useBlock(game, t)) return true;
      if (d.door) { this.toggleDoor(t.x, t.y, t.z); return true; }
      if (MC.isChest(b)) { game.ui.openChest(t.x, t.y, t.z); return true; }
      if (b === B.crafting_table) { game.ui.openInventory({ table: true }); return true; }
      if (MC.isFurnace(b)) { game.ui.openInventory({ furnace: true, table: false }); return true; }
      if (d.bed) { this.sleep(t, game); return true; }
      if (b === B.tnt && it && it.use === 'ignite') { W.setBlock(t.x, t.y, t.z, 0); W.entities.spawnTNT(t.x, t.y, t.z, 4); this.damageHeld(1); return true; }
    }
    // item use
    if (it && it.use === 'wajo_warp' && first) {
      if (game.ui) game.ui.openWajoWarp();
      return true;
    }
    if (it && it.food && first) {
      const f = it.food;
      if (this.food < 20 || f.always || this.creative) { this.use = { kind: 'eat', t: 0, id, need: 1.6 }; return false; }
      return false;
    }
    if (it && it.use === 'bow' && first) {
      if (this.creative || it.infinite || this.inv.count((x) => x === MC.ITEM.arrow) > 0) this.use = { kind: 'bow', t: 0, id };
      return false;
    }
    if (it && it.use === 'staff') {
      if (this.staffCD > 0) return false;
      this.staffCD = 0.45;
      const e = this.eyePos(), f = this.forward(), o = it.bolt;
      game.entities.spawnBolt(e[0] + f[0] * 0.6, e[1] + f[1] * 0.6 - 0.15, e[2] + f[2] * 0.6, f[0] * o.speed, f[1] * o.speed, f[2] * o.speed, 'player', { kind: o.kind, dmg: o.dmg, pierce: o.pierce, life: 2.5 });
      if (MC.Audio) MC.Audio.play('magic', null, 0.7, 1.2);
      this.damageHeld(1);
      return true;
    }
    // shuriken: thrown flat and fast, spinning
    if (it && it.use === 'throw') {
      if (this.staffCD > 0) return false;
      this.staffCD = 0.3;
      const e = this.eyePos(), f = this.forward(), o = it.throw;
      game.entities.spawnBolt(e[0] + f[0] * 0.5, e[1] + f[1] * 0.5 - 0.1, e[2] + f[2] * 0.5, f[0] * o.speed, f[1] * o.speed + 1, f[2] * o.speed, 'player', { kind: 'shuriken', dmg: o.dmg, life: 2 });
      if (MC.Audio) MC.Audio.play('shuriken', null, 0.7, 1.1);
      this.consumeHeld(1);
      return true;
    }
    // matchlock: a slow reload, one pinch of gunpowder per shot, a ball that pierces
    if (it && it.use === 'gun' && first) {
      if (this.staffCD > 0) return false;
      const powder = MC.ITEM.gunpowder;
      if (!this.creative && this.inv.count((x) => x === powder) < 1) { game.ui.toast('火薬がない'); if (MC.Audio) MC.Audio.play('click', null, 0.6); return false; }
      this.staffCD = it.gun.reload;
      const e = this.eyePos(), f = this.forward(), o = it.gun;
      game.entities.spawnBolt(e[0] + f[0] * 0.7, e[1] + f[1] * 0.7 - 0.12, e[2] + f[2] * 0.7, f[0] * o.speed, f[1] * o.speed, f[2] * o.speed, 'player', { kind: 'bullet', dmg: o.dmg, pierce: o.pierce, life: 1.5 });
      if (!this.creative) { this.inv.remove((x) => x === powder, 1); if (this.onChange) this.onChange(); }
      if (game.particles) { game.particles.smoke(e[0] + f[0] * 1.2, e[1] - 0.15, e[2] + f[2] * 1.2, 8, 1); game.particles.flame(e[0] + f[0], e[1] - 0.1, e[2] + f[2], 1.2); }
      if (MC.Audio) MC.Audio.play('gunshot', null, 1, 1);
      this.vel[0] -= f[0] * 2.5; this.vel[2] -= f[2] * 2.5;
      if (game.shake !== undefined) game.shake = Math.max(game.shake, 0.25);
      this.damageHeld(1);
      return true;
    }
    // armour: put it on (swapping with the suit already worn)
    if (it && it.use === 'armor' && first) {
      const cur = this.armor.slots[0];
      this.armor.slots[0] = this.inv.slots[this.selected];
      this.inv.slots[this.selected] = cur || null;
      if (MC.Audio) MC.Audio.play('anvil', null, 0.5, 0.8);
      game.ui.toast(it.name + 'を身につけた', `受けるダメージ -${Math.round(it.armor * 100)}%`);
      if (this.onChange) this.onChange();
      return true;
    }
    if (it && it.use === 'life_crystal' && first) {
      if (this.maxHealth >= 40) { game.ui.toast('これ以上最大体力は増やせない'); return false; }
      this.maxHealth = Math.min(40, this.maxHealth + 4);
      this.health = this.maxHealth;
      this.consumeHeld(1);
      if (MC.Audio) MC.Audio.play('levelup', null, 0.9);
      if (game.particles) { const p = this.pos; game.particles.sparkle(p[0], p[1] + 0.8, p[2], 24, [1.4, 0.3, 0.4]); }
      game.ui.toast('最大体力が増えた！', `ハート ${this.maxHealth / 2} 個`);
      return true;
    }
    if (it && (it.use === 'bucket' || it.use === 'water_bucket' || it.use === 'lava_bucket') && first) return this.useBucket(game, it);
    if (!t) return false;
    if (it && it.use === 'hoe' && first) {
      if ((t.block === B.grass || t.block === B.dirt || t.block === B.dirt_path) && t.n[1] >= 0 && W.getBlock(t.x, t.y + 1, t.z) === 0) {
        W.setBlock(t.x, t.y, t.z, B.farmland);
        if (MC.Audio) MC.Audio.block('place', MC.SOUND.GRAVEL, [t.x + 0.5, t.y + 1, t.z + 0.5], 0.8);
        this.damageHeld(1);
        return true;
      }
      return false;
    }
    if (it && it.use === 'seeds') {
      if (t.block === B.farmland && t.n[1] === 1 && W.getBlock(t.x, t.y + 1, t.z) === 0) {
        W.setBlock(t.x, t.y + 1, t.z, B.wheat_0);
        if (MC.Audio) MC.Audio.block('place', MC.SOUND.PLANT, [t.x + 0.5, t.y + 1, t.z + 0.5], 0.7);
        this.consumeHeld(1);
        return true;
      }
      return false;
    }
    if (it && it.use === 'bone_meal' && first) return this.boneMeal(t, game);
    if (it && it.use === 'ignite' && first) {
      if (MC.Audio) MC.Audio.play('ignite', [t.x + 0.5, t.y + 0.5, t.z + 0.5], 0.8);
      return false;
    }
    if (id && id < MC.ITEM_BASE) return this.placeBlock(game);
    return false;
  }
  releaseUse(game) {
    const u = this.use;
    if (!u) return;
    this.use = null;
    if (u.kind === 'bow') {
      const pow = Math.min(1, u.t / 1.0);
      if (pow < 0.15) return;
      const e = this.eyePos(), f = this.forward();
      const it = MC.itemDef(u.id) || {}, n = it.multishot || 1, pw = it.power || 1;
      const spd = 50 * (pow * pow * 0.4 + pow * 0.6) * Math.sqrt(pw);
      const dmg = Math.round((pow >= 1 ? 7 + Math.floor(Math.random() * 3) : Math.max(1, Math.round(6 * pow))) * pw);
      for (let i = 0; i < n; i++) {
        const s = (i - (n - 1) / 2) * 0.1, cs = Math.cos(s), sn = Math.sin(s);
        const dx = f[0] * cs - f[2] * sn, dz = f[0] * sn + f[2] * cs;
        const ar = game.entities.spawnArrow(e[0] + dx * 0.3, e[1] + f[1] * 0.3 - 0.1, e[2] + dz * 0.3, dx * spd, f[1] * spd, dz * spd, 'player', dmg);
        if (it.fireArrows) ar.fire = true;
        if (n > 1) ar.pickup = false;
      }
      if (!this.creative && !it.infinite) this.inv.remove((x) => x === MC.ITEM.arrow, 1);
      this.damageHeld(1);
      if (MC.Audio) MC.Audio.play('bow', null, 0.8, 0.9 + pow * 0.3);
      if (this.onChange) this.onChange();
    }
  }
  _updateUse(dt, game) {
    const u = this.use;
    if (!u) return;
    if (this.heldId() !== u.id || !game.useDown) { if (u.kind === 'bow' && !game.useDown) this.releaseUse(game); else this.use = null; return; }
    u.t += dt;
    if (u.kind === 'eat') {
      u.sndT = (u.sndT || 0) - dt;
      if (u.sndT <= 0 && u.t > 0.2) {
        u.sndT = 0.22;
        if (MC.Audio) MC.Audio.play(MC.foodOf(u.id).drink ? 'drink' : 'eat', null, 0.6);
        if (game.particles) { const e = this.eyePos(), f = this.forward(); game.particles.itemCrumbs(e[0] + f[0] * 0.45, e[1] - 0.2 + f[1] * 0.4, e[2] + f[2] * 0.45, u.id, f); }
      }
      if (u.t >= u.need) {
        const f = MC.foodOf(u.id);
        this.food = Math.min(20, this.food + f.hunger);
        this.sat = Math.min(this.food, this.sat + f.sat);
        if (f.regen) { this.regenBoost = f.regen; this.heal(4); if (game.particles) { const p = this.pos; game.particles.sparkle(p[0], p[1] + 0.5, p[2], 12, [1, 0.85, 0.3]); } }
        if (f.heal) { this.heal(f.heal); this.poisonT = 0; this.slowT = 0; if (game.particles) { const p = this.pos; game.particles.sparkle(p[0], p[1] + 0.5, p[2], 16, [1.4, 0.4, 0.5]); } }
        if (f.bad && Math.random() < f.bad) { this.exh += 12; game.ui.toast('お腹の調子が悪い…'); }
        this.consumeHeld(1);
        if (MC.Audio) MC.Audio.play('burp', null, 0.5);
        this.use = null;
      }
    }
  }

  toggleDoor(x, y, z) {
    const W = this.world;
    const b = W.getBlock(x, y, z), d = MC.BLOCKS[b];
    if (!d.door) return;
    const lowerY = d.door.upper ? y - 1 : y;
    const open = !d.door.open;
    for (const [yy, up] of [[lowerY, 0], [lowerY + 1, 1]]) {
      const cur = W.getBlock(x, yy, z);
      if (MC.isDoor(cur)) W.setBlock(x, yy, z, MC.doorId(MC.BLOCKS[cur].facing, up, open), MC.SB.NOUPDATE);
    }
    if (MC.Audio) MC.Audio.play(open ? 'door_open' : 'door_close', [x + 0.5, y + 0.5, z + 0.5], 0.8);
  }

  sleep(t, game) {
    const h = game.hours;
    const night = h > 18.6 || h < 5.6;
    const ents = game.entities;
    const monsters = ents && ents.nearestMob(this.pos, 8, (e) => e.cfg.hostile && !e.dead);
    this.spawn = [t.x + 0.5, t.y + 1, t.z + 0.5];
    if (!night) { game.ui.toast('リスポーン地点を設定しました（夜にだけ眠れます）'); return; }
    if (monsters) { game.ui.toast('近くにモンスターがいるので眠れません'); return; }
    game.ui.sleep(() => { game.hours = 6.6; game.rain = Math.random() < 0.15 ? game.rain : false; });
  }

  boneMeal(t, game) {
    const W = this.world, B = MC.BLOCK, b = t.block;
    let ok = false;
    if (MC.isCrop(b)) {
      const st = Math.min(3, MC.BLOCKS[b].stage + 1 + Math.floor(Math.random() * 2));
      W.setBlock(t.x, t.y, t.z, B['wheat_' + st]); ok = true;
    } else if (MC.B_TICK[b] === MC.TICK.SAPLING) {
      if (Math.random() < 0.45) W.growTree(t.x, t.y, t.z, MC.BLOCKS[b].tree);
      ok = true;
    } else if (b === B.grass) {
      for (let i = 0; i < 14; i++) {
        const x = t.x + Math.floor(Math.random() * 7) - 3, z = t.z + Math.floor(Math.random() * 7) - 3;
        for (let y = t.y + 2; y >= t.y - 2; y--) {
          if (W.getBlock(x, y, z) === B.grass && W.getBlock(x, y + 1, z) === 0) {
            const r = Math.random();
            W.setBlock(x, y + 1, z, r < 0.7 ? B.tall_grass : r < 0.8 ? B.dandelion : r < 0.9 ? B.poppy : B.cornflower, MC.SB.DEFER);
            break;
          }
        }
      }
      ok = true;
    }
    if (ok) {
      this.consumeHeld(1);
      if (game.particles) game.particles.sparkle(t.x + 0.5, t.y + 0.6, t.z + 0.5, 10);
    }
    return ok;
  }

  useBucket(game, it) {
    const W = this.world, B = MC.BLOCK;
    const t = this.raycast(5, true);
    if (!t) return false;
    const replaceHeld = (key) => {
      if (this.creative) return;
      const s = this.heldStack();
      if (s.count > 1) { s.count--; const left = this.inv.add(MC.makeStack(MC.ITEM[key], 1)); if (left) this.dropStack(MC.makeStack(MC.ITEM[key], 1)); }
      else this.inv.slots[this.selected] = MC.makeStack(MC.ITEM[key], 1);
      if (this.onChange) this.onChange();
    };
    if (it.use === 'bucket') {
      if (MC.B_FLUID[t.block] && MC.B_LEVEL[t.block] === 0) {
        const lava = MC.B_FLUID[t.block] === MC.FLUID.LAVA;
        W.setBlock(t.x, t.y, t.z, 0);
        replaceHeld(lava ? 'lava_bucket' : 'water_bucket');
        if (MC.Audio) MC.Audio.play(lava ? 'fizz' : 'splash', [t.x + 0.5, t.y + 0.5, t.z + 0.5], 0.6);
        return true;
      }
      return false;
    }
    let x = t.x, y = t.y, z = t.z;
    const cur0 = W.getBlock(x, y, z);
    if (!(MC.B_REPLACEABLE[cur0] && !MC.B_FLUID[cur0])) { x += t.n[0]; y += t.n[1]; z += t.n[2]; }
    const cur = W.getBlock(x, y, z);
    if (cur && !MC.B_REPLACEABLE[cur] && !(MC.B_FLUID[cur] && MC.B_LEVEL[cur] !== 0)) return false;
    const src = it.use === 'water_bucket' ? B.water : B.lava;
    W.setBlock(x, y, z, src);
    replaceHeld('bucket');
    if (MC.Audio) MC.Audio.play('splash', [x + 0.5, y + 0.5, z + 0.5], 0.5);
    return true;
  }

  placeBlock(game) {
    const t = this.target;
    if (!t) return false;
    let id = this.heldBlock();
    if (!id) return false;
    const W = this.world, B = MC.BLOCK;
    let x = t.x, y = t.y, z = t.z;
    if (!MC.B_REPLACEABLE[t.block] || t.block === id) { x += t.n[0]; y += t.n[1]; z += t.n[2]; }
    if (y < 0 || y >= MC.HEIGHT) return false;
    const cur = W.getBlock(x, y, z);
    if (cur !== 0 && !MC.B_REPLACEABLE[cur]) return false;
    const d = MC.BLOCKS[id];
    const look = MC.facingFromYaw(this.yaw);
    // orientation
    if (d.key.includes('stairs')) id = MC.withFacing(id, look);
    else if (MC.isChest(id) || MC.isFurnace(id)) id = MC.withFacing(id, (look + 2) & 3);
    else if (d.climb) {
      if (t.n[1] !== 0) return false;
      const f = MC.DIRS.findIndex((v) => v[0] === -t.n[0] && v[2] === -t.n[2]);
      id = MC.withFacing(id, f);
    } else if (id === B.lantern && t.n[1] === -1) id = B.hanging_lantern;
    else if (id === B.torch && t.n[1] === 0) {
      // mounted on the clicked wall
      const f = MC.DIRS.findIndex((v) => v[0] === -t.n[0] && v[2] === -t.n[2]);
      if (!MC.B_SOLID[t.block] || !MC.B_OPAQUE[t.block]) return false;
      id = B.wall_torch + f;
    }
    const shape = MC.B_SHAPE[id];
    if (MC.B_SUPPORT[id] === 3) { /* attached to a wall, checked above */ }
    else if (MC.B_SUPPORT[id] === 1 || shape === MC.SHAPE.CROSS || shape === MC.SHAPE.TORCH) {
      const below = W.getBlock(x, y - 1, z);
      if (!MC.B_SOLID[below]) return false;
      if (MC.B_MAT[id] === MC.MAT.PLANT && id !== B.dead_bush && MC.B_TICK[id] !== MC.TICK.CANE && !(below === B.grass || below === B.dirt || below === B.farmland || below === B.snowy_grass || below === B.sand && id === B.dead_bush)) return false;
    }
    if (MC.B_SUPPORT[id] === 4 && !W._supported(x, y, z, id)) return false;
    if (MC.B_SUPPORT[id] === 5 && W.getBlock(x, y - 1, z) !== B.farmland) return false;
    if (MC.B_SUPPORT[id] === 2 && !MC.B_SOLID[W.getBlock(x, y + 1, z)]) return false;
    // multi-block: doors & beds
    let extra = null;
    if (d.door) {
      if (W.getBlock(x, y + 1, z) !== 0 || !MC.B_SOLID[W.getBlock(x, y - 1, z)]) return false;
      id = MC.doorId(look, 0, 0);
      extra = [x, y + 1, z, MC.doorId(look, 1, 0)];
    } else if (d.bed) {
      const dir = MC.DIRS[look];
      const hx = x + dir[0], hz = z + dir[2];
      const hc = W.getBlock(hx, y, hz);
      if (hc !== 0 && !MC.B_REPLACEABLE[hc]) return false;
      id = MC.bedId(look, 0);
      extra = [hx, y, hz, MC.bedId(look, 1)];
    }
    if (MC.B_SOLID[id] && this._intersects(x, y, z, id)) return false;
    if (extra && MC.B_SOLID[extra[3]] && this._intersects(extra[0], extra[1], extra[2], extra[3])) return false;
    if (extra) W.setBlock(extra[0], extra[1], extra[2], extra[3], MC.SB.NOUPDATE);
    W.setBlock(x, y, z, id);
    if (MC.Audio) MC.Audio.block('place', MC.B_SOUND[id], [x + 0.5, y + 0.5, z + 0.5], 0.9);
    this.consumeHeld(1);
    return true;
  }
  _intersects(x, y, z, id) {
    const p = this.pos, hw = this.hw;
    const boxes = MC.Phys.blockBoxes(this.world, x, y, z, id);
    for (const q of boxes) {
      if (x + q[3] > p[0] - hw && x + q[0] < p[0] + hw && z + q[5] > p[2] - hw && z + q[2] < p[2] + hw && y + q[4] > p[1] && y + q[1] < p[1] + 1.8) return true;
    }
    // other entities
    const ents = this.world.entities;
    if (ents) for (const e of ents.list) {
      if (e.kind !== 'mob' || e.dead) continue;
      if (x + 1 > e.pos[0] - e.hw && x < e.pos[0] + e.hw && z + 1 > e.pos[2] - e.hw && z < e.pos[2] + e.hw && y + 1 > e.pos[1] && y < e.pos[1] + e.h) return true;
    }
    return false;
  }

  pickBlock() {
    const t = this.target;
    if (!t) return;
    let id = MC.B_BASE[t.block];
    if (MC.B_FLUID[id]) return;
    if (id === MC.BLOCK.hanging_lantern) id = MC.BLOCK.lantern;
    if (MC.isCrop(id)) id = MC.ITEM.wheat_seeds;
    const inv = this.inv;
    for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === id) { this.selected = i; return; }
    if (this.creative) inv.slots[this.selected] = MC.makeStack(id, 1);
    else {
      for (let i = 9; i < 36; i++) if (inv.slots[i] && inv.slots[i].id === id) {
        const tmp = inv.slots[this.selected]; inv.slots[this.selected] = inv.slots[i]; inv.slots[i] = tmp; break;
      }
    }
    if (this.onChange) this.onChange();
  }
};
MC.Player.FULL = [0, 0, 0, 1, 1, 1];
MC.Player.UNARMORED = new Set(['fall', 'drown', 'starve', 'void', 'poison', 'fire', 'lava', 'cactus']);
MC.Player.ORDER = [...Array(36).keys()];

// ray vs AABB with the hit face normal
MC.rayBoxN = function (o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sgn = 0;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sgn = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax || tmax < 0) return null;
  }
  const n = [0, 0, 0];
  if (axis >= 0) n[axis] = sgn;
  return { t: Math.max(0, tmin), n };
};
