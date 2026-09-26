'use strict';
// Entities: mobs (hostile / passive / villagers) with A* navigation, dropped items, arrows, falling
// blocks and primed TNT, plus natural / spawner / village spawning and explosions' effect on entities.
MC.MOB_TYPES = {
  zombie: { name: 'ゾンビ', hostile: true, hp: 20, w: 0.6, h: 1.95, eye: 1.74, speed: 2.4, dmg: 3, burn: true, sound: 'zombie' },
  skeleton: { name: 'スケルトン', hostile: true, hp: 20, w: 0.6, h: 1.99, eye: 1.74, speed: 2.6, ranged: true, burn: true, sound: 'skeleton', held: 'bow' },
  creeper: { name: 'クリーパー', hostile: true, hp: 20, w: 0.6, h: 1.7, eye: 1.45, speed: 2.4, explode: 3, sound: 'creeper' },
  spider: { name: 'クモ', hostile: true, hp: 16, w: 1.4, h: 0.9, eye: 0.65, speed: 3.5, dmg: 2, climb: true, sound: 'spider', short: true },
  pig: { name: 'ブタ', hp: 10, w: 0.9, h: 0.9, eye: 0.7, speed: 1.7, sound: 'pig', food: ['wheat', 'apple'], short: true },
  cow: { name: 'ウシ', hp: 10, w: 0.9, h: 1.4, eye: 1.25, speed: 1.6, sound: 'cow', food: ['wheat'] },
  sheep: { name: 'ヒツジ', hp: 8, w: 0.9, h: 1.3, eye: 1.1, speed: 1.6, sound: 'sheep', food: ['wheat'] },
  chicken: { name: 'ニワトリ', hp: 4, w: 0.4, h: 0.7, eye: 0.6, speed: 1.7, sound: 'chicken', food: ['wheat_seeds'], short: true },
  villager: { name: '村人', hp: 20, w: 0.6, h: 1.95, eye: 1.62, speed: 1.9, sound: 'villager', villager: true },
  guardian: { name: 'ダンジョンの番人', hostile: true, boss: true, hp: 90, w: 0.9, h: 2.75, eye: 2.4, speed: 2.7, dmg: 7, sound: 'skeleton',
    model: 'skeleton', scale: 1.4, tint: [0.32, 0.3, 0.36], held: 'diamond_sword', kbResist: 0.8 },
};
MC.ENTITY_ID = 1;

MC.Entity = class {
  constructor(kind, x, y, z) {
    this.id = MC.ENTITY_ID++;
    this.kind = kind;
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.hw = 0.3; this.h = 1.8; this.stepH = 0;
    this.onGround = false;
    this.yaw = 0;
    this.age = 0;
    this.removed = false;
    this.env = {};
  }
  center() { return [this.pos[0], this.pos[1] + this.h * 0.5, this.pos[2]]; }
};

// ------------------------------------------------------------------ mobs
MC.Mob = class extends MC.Entity {
  constructor(type, x, y, z) {
    super('mob', x, y, z);
    const c = this.cfg = MC.MOB_TYPES[type];
    this.type = type;
    this.hw = c.w / 2; this.h = c.h; this.stepH = 0.6;
    this.health = c.hp; this.maxHealth = c.hp;
    this.yaw = Math.random() * Math.PI * 2; this.headYaw = this.yaw; this.headPitch = 0;
    this.walk = 0; this.amp = 0;
    this.hurtTime = 0; this.invul = 0; this.dead = false; this.deathT = 0;
    this.fire = 0; this.fireT = 0; this.lavaT = 0; this.cactusT = 0;
    this.target = null; this.senseT = Math.random();
    this.path = null; this.pathI = 0; this.pathT = 0; this.goal = null; this.stuckT = 0;
    this.moveX = 0; this.moveZ = 0; this.speedMul = 1; this.wantJump = false;
    this.idleT = Math.random() * 4; this.panic = 0; this.attackCD = 0; this.attackAnim = 0;
    this.aimT = 0; this.aim = false; this.strafe = 1; this.strafeT = 0;
    this.fuse = 0; this.fuseSound = false;
    this.fallY = y; this.persistent = false; this.provoked = false;
    this.soundT = 4 + Math.random() * 10;
    this.graze = 0;
  }

  eye() { return [this.pos[0], this.pos[1] + this.cfg.eye, this.pos[2]]; }

  pitch() { return (this.cfg.pitch || 1) * (this.cfg.boss ? 0.6 : 1); }

  hurt(amount, source, M, kx = 0, kz = 0, attacker = null) {
    if (this.dead || this.invul > 0 || amount <= 0) return false;
    if (this.cfg.fireproof && (source === 'fire' || source === 'lava')) return false;
    if (this.cfg.ally && (source === 'player' || source === 'ally')) return false;
    if (this.cfg.armor) amount = Math.max(1, Math.round(amount * (1 - this.cfg.armor)));
    this.health -= amount;
    this.invul = 0.5; this.hurtTime = 0.4;
    if (kx || kz) {
      const l = Math.hypot(kx, kz) || 1, kb = 1 - (this.cfg.kbResist || 0);
      this.vel[0] = this.vel[0] * 0.5 + kx / l * 6 * kb; this.vel[2] = this.vel[2] * 0.5 + kz / l * 6 * kb;
      this.vel[1] = Math.max(this.vel[1], 5.5 * kb);
    }
    if (source === 'player') {
      this.provoked = true;
      if (!this.cfg.hostile) { this.panic = 5; this.goal = null; this.path = null; }
      else this.target = M.player;
    }
    // fights between the kingdom's people and monsters: the one hit turns on its attacker
    if (attacker && attacker !== this && attacker.kind === 'mob' && !attacker.dead) {
      if (this.cfg.hostile && attacker.cfg.ally) { this.target = attacker; this.path = null; this.provoked = true; }
      else if (this.cfg.ally && attacker.cfg.hostile && (!this.target || this.target.dead)) this.target = attacker;
    }
    const snd = this.cfg.sound || this.type;
    if (M.sound) M.sound(snd + '_hurt', this.center(), 1, (0.9 + Math.random() * 0.2) * this.pitch());
    if (this.health <= 0) this.die(source, M);
    return true;
  }

  die(source, M) {
    this.dead = true; this.deathT = 0; this.health = 0;
    if (M.sound) M.sound((this.cfg.sound || this.type) + '_death', this.center(), 1, (0.9 + Math.random() * 0.2) * this.pitch());
    if (this.cfg.boss) { M.bossDefeated(this); return; }
    if (this.cfg.ally) { if (M.onAllyDeath) M.onAllyDeath(this, source); return; }
    if (this.raid && M.onRaiderDeath) M.onRaiderDeath(this);
    if (!M.creativeWorld() || source === 'player') {
      const drops = MC.MOB_DROPS[this.type] || [];
      for (const [key, a, b, ch] of drops) {
        if (Math.random() > ch) continue;
        let k = key;
        if (this.fire > 0 && MC.COOKED[key]) k = MC.COOKED[key];
        if (this.type === 'sheep' && key === 'wool_white' && this.wool) k = 'wool_' + this.wool;
        const n = a + Math.floor(Math.random() * (b - a + 1));
        if (n > 0) M.spawnItem(this.pos[0], this.pos[1] + 0.5, this.pos[2], MC.makeStack(MC.idOf(k), n));
      }
    }
  }

  // ---- movement helpers
  steer(tx, tz, mul = 1) {
    const dx = tx - this.pos[0], dz = tz - this.pos[2];
    const l = Math.hypot(dx, dz);
    if (l < 0.05) { this.moveX = 0; this.moveZ = 0; return 0; }
    this.moveX = dx / l; this.moveZ = dz / l; this.speedMul = mul;
    return l;
  }
  stop() { this.moveX = 0; this.moveZ = 0; }
  lookAt(x, y, z) {
    const e = this.eye();
    const dx = x - e[0], dy = y - e[1], dz = z - e[2];
    this.headYaw = Math.atan2(dx, -dz);
    this.headPitch = -Math.atan2(dy, Math.hypot(dx, dz));
  }
  navigate(M, gx, gy, gz, mul, dt, repath = 1.0) {
    this.pathT -= dt;
    const moved = !this.goal || Math.abs(this.goal[0] - gx) + Math.abs(this.goal[2] - gz) > 1.5 || Math.abs(this.goal[1] - gy) > 1.5;
    if (!this.path || (moved && this.pathT <= 0) || this.pathT < -3) {
      this.goal = [gx, gy, gz];
      this.path = M.findPath(this, Math.floor(gx), Math.floor(gy), Math.floor(gz));
      this.pathI = 0; this.pathT = repath + Math.random() * 0.3;
    }
    if (this.path && this.pathI < this.path.length) {
      const wp = this.path[this.pathI];
      const d = this.steer(wp[0] + 0.5, wp[2] + 0.5, mul);
      if (wp[1] > Math.floor(this.pos[1] + 0.1) + 0.5 && d < 1.6 && this.onGround && !this.cfg.climb) this.wantJump = true;
      if (d < 0.4 + this.hw * 0.5 && Math.abs(this.pos[1] - wp[1]) < 1.2) this.pathI++;
      return true;
    }
    // no path: steer directly
    this.steer(gx, gz, mul);
    return false;
  }

  canSee(M, tx, ty, tz) {
    const e = this.eye();
    return M.lineOfSight(e[0], e[1], e[2], tx, ty, tz);
  }

  update(dt, M) {
    this.age += dt;
    const W = M.world, c = this.cfg;
    if (this.dead) {
      this.deathT += dt;
      this.vel[1] -= 25 * dt;
      this.vel[0] *= 0.9; this.vel[2] *= 0.9;
      MC.Phys.integrate(W, this, dt);
      if (this.deathT > 0.9) { this.removed = true; if (M.particles) M.particles.poof(this.pos[0], this.pos[1], this.pos[2], this.hw * 2, this.h); }
      return;
    }
    const env = MC.Phys.sample(W, this, this.env);
    const inWater = env.water > Math.min(0.5, this.h * 0.4), inLava = env.lava > 0;
    this.hurtTime -= dt; this.invul -= dt; this.attackCD -= dt; this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    // frozen (frost blade / ice magic)
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (M.particles && Math.random() < dt * 10) M.particles.sparkle(this.pos[0], this.pos[1] + Math.random() * this.h * 0.6, this.pos[2], 1, [0.6, 0.9, 1.2]);
    }
    // hazards
    if (inLava) { this.fire = 8; this.lavaT -= dt; if (this.lavaT <= 0) { this.lavaT = 0.5; this.hurt(4, 'lava', M); } }
    if (env.water > 0.1 || c.fireproof) this.fire = 0;
    if (c.burn && !this.noBurn && M.isDay() && this.fire < 1) {
      const hx = Math.floor(this.pos[0]), hy = Math.floor(this.pos[1] + this.h - 0.1), hz = Math.floor(this.pos[2]);
      if (W.skyLight(hx, hy, hz) >= 15 && env.water < 0.1 && !M.raining()) this.fire = 3 + Math.random() * 3;
    }
    if (this.fire > 0) {
      this.fire -= dt; this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = 1; this.hurt(1, 'fire', M); }
      if (M.particles && Math.random() < dt * 20) M.particles.flame(this.pos[0] + (Math.random() - 0.5) * this.hw * 2, this.pos[1] + Math.random() * this.h, this.pos[2] + (Math.random() - 0.5) * this.hw * 2, 1.4);
    }
    if (env.damage) { this.cactusT -= dt; if (this.cactusT <= 0) { this.cactusT = 0.5; this.hurt(env.damage, 'cactus', M); } }
    if (this.dead) return;
    // ambient sounds
    this.soundT -= dt;
    if (this.soundT <= 0) { this.soundT = c.quiet ? 30 + Math.random() * 50 : 6 + Math.random() * 14; if (M.sound && this.type !== 'spider') M.sound((c.sound || this.type) + '_say', this.center(), 0.8, (0.9 + Math.random() * 0.2) * this.pitch()); }

    this.wantJump = false;
    this.speedMul = 1;
    if (c.ai && MC.MOB_AI && MC.MOB_AI[c.ai]) MC.MOB_AI[c.ai].call(this, dt, M);
    else if (c.boss) this.aiBoss(dt, M);
    else if (c.hostile) this.aiHostile(dt, M);
    else if (c.villager) this.aiVillager(dt, M);
    else this.aiPassive(dt, M);
    if (this.dead || this.removed) return;

    // ---- physics
    const speed = c.speed * this.speedMul * env.slow * (inWater ? 0.55 : 1) * (this.slowT > 0 ? 0.35 : 1);
    const accel = this.onGround ? 14 : inWater ? 6 : 3;
    const a = Math.min(1, accel * dt);
    this.vel[0] += (this.moveX * speed - this.vel[0]) * a;
    this.vel[2] += (this.moveZ * speed - this.vel[2]) * a;
    if (inWater || inLava) {
      this.vel[1] -= 8 * dt;
      if (env.water > this.h * 0.5 || inLava || this.wantJump) this.vel[1] += 18 * dt;
      this.vel[1] *= Math.max(0, 1 - 2.5 * dt);
      this.vel[1] = MC.clamp(this.vel[1], -3, 3);
      this.vel[0] += env.flowX * 4 * dt; this.vel[2] += env.flowZ * 4 * dt;
      this.fallY = this.pos[1];
    } else {
      this.vel[1] -= 28 * dt;
      if (this.type === 'chicken' && this.vel[1] < -2) this.vel[1] = -2;
      if (this.vel[1] < -50) this.vel[1] = -50;
    }
    if ((c.climb && (this.hitX || this.hitZ) && (this.moveX || this.moveZ)) || (env.climb && (this.moveX || this.moveZ))) this.vel[1] = Math.max(this.vel[1], 2.5);
    if (this.wantJump && this.onGround) this.vel[1] = 8.4;
    if ((this.hitX || this.hitZ) && this.onGround && (this.moveX || this.moveZ)) this.vel[1] = 8.4;
    const wasGround = this.onGround;
    MC.Phys.integrate(W, this, dt);
    // fall damage
    if (this.onGround) {
      if (!wasGround && this.fallY - this.pos[1] > 3.5 && !c.climb && this.type !== 'chicken') this.hurt(Math.ceil(this.fallY - this.pos[1] - 3), 'fall', M);
      this.fallY = this.pos[1];
    } else if (this.vel[1] > 0 || env.climb) this.fallY = this.pos[1];
    else this.fallY = Math.max(this.fallY, this.pos[1]);
    // orientation + animation
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    if (hs > 0.3 && (this.moveX || this.moveZ)) {
      const ty = Math.atan2(this.moveX, -this.moveZ);
      let d = ty - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 8);
    }
    let hd = this.headYaw - this.yaw; hd = Math.atan2(Math.sin(hd), Math.cos(hd));
    if (Math.abs(hd) > 1.1) this.yaw += (hd - Math.sign(hd) * 1.1);
    this.walk += hs * dt * 4.2;
    this.amp += (Math.min(1, hs / Math.max(0.5, c.speed)) - this.amp) * Math.min(1, dt * 8);
    if (this.pos[1] < -40) this.removed = true;
  }

  _defaultHead(dt) {
    // look where we walk
    if (this.moveX || this.moveZ) {
      const ty = Math.atan2(this.moveX, -this.moveZ);
      let d = ty - this.headYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.headYaw += d * Math.min(1, dt * 6);
      this.headPitch *= 1 - Math.min(1, dt * 4);
    }
  }

  wander(dt, M, range = 7, mul = 1, chance = 0.25) {
    this.idleT -= dt;
    if (this.goal && this.path && this.pathI < this.path.length) {
      this.navigate(M, this.goal[0], this.goal[1], this.goal[2], mul, dt, 99);
      this.stuckT += dt;
      if (this.stuckT > 8) { this.path = null; this.goal = null; }
    } else {
      this.stop();
      this.goal = null;
      if (this.idleT <= 0) {
        this.idleT = 2 + Math.random() * 6;
        if (Math.random() < chance * 4) {
          const t = M.randomWalkTarget(this, range);
          if (t) { this.goal = t; this.path = M.findPath(this, t[0], t[1], t[2]); this.pathI = 0; this.stuckT = 0; if (!this.path) this.goal = null; }
        }
      }
    }
    this._defaultHead(dt);
  }

  // ---- AI: hostile (targets the player or the kingdom's people; raiders march on the kingdom)
  aiHostile(dt, M) {
    const c = this.cfg;
    let T = this.target;
    if (T && (!M.targetOk(T) || Math.hypot(T.pos[0] - this.pos[0], T.pos[1] - this.pos[1], T.pos[2] - this.pos[2]) > (this.raid ? 36 : 30))) { T = this.target = null; this.path = null; }
    this.senseT -= dt;
    const neutral = this.type === 'spider' && !this.provoked && M.isDay() && M.world.skyLight(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.5), Math.floor(this.pos[2])) > 10;
    if (!T && this.senseT <= 0 && !neutral) {
      this.senseT = 0.4;
      T = this.target = M.pickTarget(this, this.raid ? 22 : 16);
      if (T) this.path = null;
    }
    if (!T) {
      this.fuse = Math.max(0, this.fuse - dt);
      this.aim = false; this.aimT = 0;
      if (this.raid && this.raidGoal) this._march(dt, M);
      else this.wander(dt, M, 8, 0.7, 0.2);
      return;
    }
    const P = T, pe = M.eyeOf(T);
    this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
    const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
    const dist = Math.hypot(P.pos[0] - this.pos[0], P.pos[1] - this.pos[1], P.pos[2] - this.pos[2]);
    switch (c.ranged ? 'skeleton' : c.explode ? 'creeper' : 'melee') {
      case 'skeleton': {
        const see = this.canSee(M, pe[0], pe[1], pe[2]);
        if (see && hd < 16) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeT = 1.5 + Math.random() * 2; this.strafe = -this.strafe; }
          const dx = (P.pos[0] - this.pos[0]) / hd, dz = (P.pos[2] - this.pos[2]) / hd;
          let mx = -dz * this.strafe * 0.5, mz = dx * this.strafe * 0.5;
          if (hd < 6) { mx -= dx; mz -= dz; } else if (hd > 12) { mx += dx; mz += dz; }
          const l = Math.hypot(mx, mz) || 1;
          this.moveX = mx / l; this.moveZ = mz / l; this.speedMul = 0.8;
          this.yaw = Math.atan2(dx, -dz);
          this.aim = true; this.aimT += dt;
          if (this.aimT > 1.2 && this.attackCD <= 0) {
            this.aimT = 0; this.attackCD = 1.2 + Math.random() * 1.0;
            const e = this.eye();
            const tgt = [pe[0], pe[1] - 0.35, pe[2]];
            const spd = 24, d = Math.hypot(tgt[0] - e[0], tgt[2] - e[2]);
            const t = d / spd;
            const inacc = [0, 0.1, 0.06, 0.03][M.difficulty()] || 0.06;
            let vx = tgt[0] - e[0], vy = tgt[1] - e[1] + 10 * t * t, vz = tgt[2] - e[2];
            const l2 = Math.hypot(vx, vy, vz);
            vx = vx / l2 + (Math.random() - 0.5) * inacc; vy = vy / l2 + (Math.random() - 0.5) * inacc; vz = vz / l2 + (Math.random() - 0.5) * inacc;
            const ar = M.spawnArrow(e[0] + vx * 0.5, e[1] + vy * 0.5 - 0.1, e[2] + vz * 0.5, vx * spd, vy * spd, vz * spd, this, 2 + M.difficulty() + (c.arrowBonus || 0));
            if (c.arrowFx) ar.fx = c.arrowFx;
            if (M.sound) M.sound('bow', this.center(), 0.8, 1.1);
          }
        } else {
          this.aim = false; this.aimT = Math.max(0, this.aimT - dt);
          this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt);
        }
        break;
      }
      case 'creeper': {
        const see = this.canSee(M, pe[0], pe[1], pe[2]);
        if (dist < 3.2 && see) {
          this.stop();
          if (!this.fuseSound) { this.fuseSound = true; if (M.sound) M.sound('fuse', this.center(), 1, 1); }
          this.fuse += dt;
          if (this.fuse >= 1.5) {
            this.removed = true;
            const cc = this.center();
            M.world.explode(cc[0], cc[1], cc[2], 3, this);
            return;
          }
        } else {
          this.fuse = Math.max(0, this.fuse - dt * 1.5);
          if (this.fuse <= 0) this.fuseSound = false;
          this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt);
        }
        break;
      }
      default: { // zombie, spider and the castles' melee monsters
        const reach = this.hw + 0.9 + (c.reach || 0) + (P === M.player ? 0 : Math.max(0, (P.hw || 0.3) - 0.3));
        if (hd < reach + 0.3 && Math.abs(P.pos[1] - this.pos[1]) < 1.6) {
          this.steer(P.pos[0], P.pos[2], 0.6);
          if (this.attackCD <= 0) {
            this.attackCD = 1.0;
            this.attackAnim = 1;
            const mul = [0, 0.5, 1, 1.5][M.difficulty()];
            if (M.hitTarget(P, Math.max(1, Math.round(c.dmg * mul)), this.type, this, P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]) && c.onHit) {
              if (P === M.player) { if (P.addEffects) P.addEffects(c.onHit); }
              else { if (c.onHit.slow) P.slowT = Math.max(P.slowT || 0, c.onHit.slow); if (c.onHit.fire) P.fire = Math.max(P.fire, c.onHit.fire); }
            }
          }
        } else {
          this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt, 0.6);
          if ((this.type === 'spider' || c.leap) && this.onGround && hd > 2 && hd < 4.5 && Math.random() < dt * 1.5) {
            const dx = (P.pos[0] - this.pos[0]) / hd, dz = (P.pos[2] - this.pos[2]) / hd;
            this.vel[0] = dx * 6; this.vel[2] = dz * 6; this.vel[1] = 5.5;
          }
        }
      }
    }
  }
  // raiders without a target march on the kingdom's heart, then roam its streets
  _march(dt, M) {
    const g = this.raidGoal;
    if (Math.hypot(g[0] - this.pos[0], g[2] - this.pos[2]) < 5) {
      const k = M.game.kingdom, s = k && MC.Kingdom.randomStreet(k, g, 40);
      if (s) this.raidGoal = s;
    }
    this.marchT = (this.marchT || 0) + dt;
    if (this.marchT > 7) {
      // stuck (walls, water): try a detour
      const moved = this.marchFrom ? Math.hypot(this.pos[0] - this.marchFrom[0], this.pos[2] - this.marchFrom[2]) : 99;
      if (moved < 2.5) this.raidGoal = [g[0] + (Math.random() - 0.5) * 24, g[1], g[2] + (Math.random() - 0.5) * 24];
      this.marchT = 0; this.marchFrom = this.pos.slice();
    }
    this.navigate(M, this.raidGoal[0], this.raidGoal[1], this.raidGoal[2], 0.95, dt, 1.2);
    this._defaultHead(dt);
  }

  // ---- AI: dungeon guardian (melee + arrow volleys, enraged below half health)
  aiBoss(dt, M) {
    const P = M.player, c = this.cfg;
    const valid = P && !P.dead && !P.creative && M.difficulty() > 0;
    this.bossT = (this.bossT === undefined ? 2 : this.bossT) - dt;
    this.aimT = Math.max(0, this.aimT - dt);
    this.aim = this.aimT > 0;
    if (!valid) { this.stop(); return; }
    const pe = P.eyePos();
    const dist = Math.hypot(P.pos[0] - this.pos[0], P.pos[1] - this.pos[1], P.pos[2] - this.pos[2]);
    if (dist > 40) { this.stop(); return; }
    this.target = P;
    this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
    const rage = this.health < this.maxHealth * 0.5;
    const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
    if (hd < 2.6 && Math.abs(P.pos[1] - this.pos[1]) < 2.5) {
      this.steer(P.pos[0], P.pos[2], 0.5);
      if (this.attackCD <= 0) {
        this.attackCD = rage ? 0.9 : 1.3;
        this.attackAnim = 1;
        const mul = [0, 0.5, 1, 1.5][M.difficulty()];
        P.hurt(Math.max(1, Math.round(c.dmg * mul)), 'guardian', (P.pos[0] - this.pos[0]) * 1.6, (P.pos[2] - this.pos[2]) * 1.6);
        if (M.sound) M.sound('attack', this.center(), 1, 0.6);
      }
      return;
    }
    this.navigate(M, P.pos[0], P.pos[1], P.pos[2], rage ? 1.3 : 1, dt, 0.7);
    if (this.bossT <= 0 && this.canSee(M, pe[0], pe[1], pe[2])) {
      this.bossT = rage ? 2 : 3;
      this.aimT = 0.7;
      const e = this.eye();
      const n = rage ? 5 : 3;
      const spd = 26, t = hd / spd;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.12;
        let vx = pe[0] - e[0], vy = pe[1] - 0.4 - e[1] + 10 * t * t, vz = pe[2] - e[2];
        const l = Math.hypot(vx, vy, vz);
        vx /= l; vy /= l; vz /= l;
        const cs = Math.cos(spread), sn = Math.sin(spread);
        const rx = vx * cs - vz * sn, rz = vx * sn + vz * cs;
        M.spawnArrow(e[0] + rx * 0.8, e[1] + vy * 0.8 - 0.2, e[2] + rz * 0.8, rx * spd, vy * spd, rz * spd, this, 3 + M.difficulty());
      }
      if (M.sound) M.sound('bow', this.center(), 1, 0.7);
    }
  }

  // ---- AI: passive animals
  aiPassive(dt, M) {
    const P = M.player, c = this.cfg;
    if (this.panic > 0) {
      this.panic -= dt;
      if (!this.goal || !this.path || this.pathI >= this.path.length) {
        let t = null;
        for (let k = 0; k < 4 && !t; k++) t = M.randomWalkTarget(this, 8, P ? P.pos : null);
        if (t) { this.goal = t; this.path = M.findPath(this, t[0], t[1], t[2]); this.pathI = 0; }
      }
      if (this.goal) this.navigate(M, this.goal[0], this.goal[1], this.goal[2], 2.1, dt, 99);
      this._defaultHead(dt);
      return;
    }
    // follow the player holding food
    if (P && !P.dead && c.food) {
      const held = P.heldId && P.heldId();
      const d = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      if (held && c.food.some((k) => MC.idOf(k) === held) && d < 9) {
        const pe = P.eyePos();
        this.lookAt(pe[0], pe[1], pe[2]);
        if (d > 2.2) this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1.2, dt, 0.8);
        else this.stop();
        return;
      }
    }
    // sheep grazing
    if (this.type === 'sheep') {
      if (this.graze > 0) { this.graze -= dt; this.stop(); return; }
      if (Math.random() < dt * 0.05) this.graze = 2;
    }
    // look at a nearby player now and then
    if (P && Math.random() < dt * 0.3) {
      const d = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      if (d < 6) { const pe = P.eyePos(); this.lookAt(pe[0], pe[1], pe[2]); }
    }
    this.wander(dt, M, 7, 1, 0.3);
  }

  // ---- AI: villagers
  aiVillager(dt, M) {
    const P = M.player;
    // flee from zombies
    const z = M.nearestMob(this.pos, 8, (e) => e.type === 'zombie' && !e.dead);
    if (z) {
      const dx = this.pos[0] - z.pos[0], dz = this.pos[2] - z.pos[2], l = Math.hypot(dx, dz) || 1;
      this.steer(this.pos[0] + dx / l * 4, this.pos[2] + dz / l * 4, 1.7);
      this._defaultHead(dt);
      return;
    }
    if (this.trading > 0 && P) {
      this.trading -= dt;
      this.stop();
      const pe = P.eyePos(); this.lookAt(pe[0], pe[1], pe[2]);
      return;
    }
    if (P && !P.dead) {
      const d = Math.hypot(P.pos[0] - this.pos[0], P.pos[1] - this.pos[1], P.pos[2] - this.pos[2]);
      if (d < 5 && Math.random() < 0.97) { const pe = P.eyePos(); this.lookAt(pe[0], pe[1], pe[2]); }
    }
    const night = !M.isDay();
    const home = this.home;
    if (home && (night || Math.hypot(home[0] - this.pos[0], home[2] - this.pos[2]) > 22)) {
      const d = Math.hypot(home[0] - this.pos[0], home[2] - this.pos[2]);
      if (d > 1.5) { this.navigate(M, home[0], home[1], home[2], 1, dt, 2); return; }
      this.stop();
      return;
    }
    this.wander(dt, M, 9, 0.9, 0.35);
  }
};

// ------------------------------------------------------------------ items
MC.ItemEntity = class extends MC.Entity {
  constructor(x, y, z, stack) {
    super('item', x, y, z);
    this.stack = stack;
    this.hw = 0.125; this.h = 0.25;
    this.pickupDelay = 0.5;
    this.spin = Math.random() * 6;
    this.mergeT = Math.random();
  }
  update(dt, M) {
    this.age += dt;
    this.pickupDelay -= dt;
    const W = M.world;
    const env = MC.Phys.sample(W, this, this.env);
    if (env.lava > 0) { this.removed = true; if (M.particles) M.particles.smoke(this.pos[0], this.pos[1] + 0.2, this.pos[2], 4); if (M.sound) M.sound('fizz', this.pos, 0.5, 1.4); return; }
    if (env.water > 0) {
      this.vel[1] += (env.water > 0.1 ? 14 : 6) * dt;
      this.vel[1] *= Math.max(0, 1 - 3 * dt);
      this.vel[1] = MC.clamp(this.vel[1], -2, 1.5);
      this.vel[0] += env.flowX * 5 * dt; this.vel[2] += env.flowZ * 5 * dt;
      this.vel[0] *= Math.max(0, 1 - 1.5 * dt); this.vel[2] *= Math.max(0, 1 - 1.5 * dt);
    } else {
      this.vel[1] -= 18 * dt;
      const f = this.onGround ? 8 : 0.5;
      this.vel[0] *= Math.max(0, 1 - f * dt); this.vel[2] *= Math.max(0, 1 - f * dt);
    }
    // pushed out of blocks
    const b = W.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.1), Math.floor(this.pos[2]));
    if (MC.B_OPAQUE[b]) this.pos[1] += dt * 3;
    MC.Phys.integrate(W, this, dt);
    this.spin += dt * 1.6;
    if (this.age > 300 || this.pos[1] < -40) this.removed = true;
    this.mergeT -= dt;
    if (this.mergeT <= 0) { this.mergeT = 1; M.mergeItem(this); }
  }
};

// ------------------------------------------------------------------ arrows
MC.Arrow = class extends MC.Entity {
  constructor(x, y, z, vx, vy, vz, shooter, dmg) {
    super('arrow', x, y, z);
    this.vel = [vx, vy, vz];
    this.shooter = shooter;
    this.dmg = dmg;
    this.stuck = false;
    this.hw = 0.05; this.h = 0.1;
    this.fromPlayer = shooter === 'player';
  }
  update(dt, M) {
    this.age += dt;
    const W = M.world;
    if (this.stuck) {
      if (this.age > 60) this.removed = true;
      // block removed under the arrow -> fall
      if (!MC.B_SOLID[W.getBlock(Math.floor(this.pos[0] + this.dir[0] * 0.1), Math.floor(this.pos[1] + this.dir[1] * 0.1), Math.floor(this.pos[2] + this.dir[2] * 0.1))]) { this.stuck = false; this.vel = [0, -1, 0]; }
      return;
    }
    const v = this.vel;
    const inWater = MC.B_FLUID[W.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]))] === MC.FLUID.WATER;
    v[1] -= 20 * dt;
    const drag = Math.pow(inWater ? 0.3 : 0.82, dt);
    v[0] *= drag; v[1] *= drag; v[2] *= drag;
    const p0 = this.pos.slice(), p1 = [p0[0] + v[0] * dt, p0[1] + v[1] * dt, p0[2] + v[2] * dt];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    this.dir = len > 1e-6 ? [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len, (p1[2] - p0[2]) / len] : (this.dir || [0, -1, 0]);
    const hitB = M.raycastBlocks(p0, this.dir, len);
    const fac = this.fromPlayer ? 'k' : this.shooter && this.shooter.cfg ? M.faction(this.shooter) : null;
    const hitE = M.raycastEntities(p0, this.dir, hitB ? hitB.t : len, this.age < 0.2 ? this.shooter : null, true, fac);
    if (hitE) {
      const e = hitE.e;
      const speed = Math.hypot(v[0], v[1], v[2]);
      const dmg = Math.max(1, Math.ceil(this.dmg * Math.min(1.2, speed / 30)));
      if (e === M.player) { if (M.player.hurt(dmg, 'arrow', v[0], v[2]) && this.fx && M.player.addEffects) M.player.addEffects(this.fx); }
      else if (e.hurt(dmg, this.fromPlayer ? 'player' : 'arrow', M, v[0], v[2], this.fromPlayer ? null : this.shooter) && this.fire && !e.cfg.fireproof) e.fire = Math.max(e.fire, 5);
      if (M.sound) M.sound('arrow_hit', e.center ? e.center() : M.player.pos, 0.8, 1.2);
      this.removed = true;
      return;
    }
    if (hitB) {
      this.pos = [p0[0] + this.dir[0] * (hitB.t - 0.02), p0[1] + this.dir[1] * (hitB.t - 0.02), p0[2] + this.dir[2] * (hitB.t - 0.02)];
      this.stuck = true; this.age = Math.max(this.age, 0.5);
      this.vel = [0, 0, 0];
      if (M.sound) M.sound('arrow_hit', this.pos, 0.6, 1);
      return;
    }
    this.pos = p1;
    if (M.particles && (this.fire || (this.fx && this.fx.fire)) && Math.random() < dt * 40) M.particles.flame(p1[0], p1[1], p1[2], 0.8);
    else if (M.particles && this.fx && this.fx.slow && Math.random() < dt * 25) M.particles.sparkle(p1[0], p1[1] - 0.3, p1[2], 1, [0.6, 0.9, 1.2]);
    if (this.pos[1] < -40 || this.age > 30) this.removed = true;
  }
};

// ------------------------------------------------------------------ falling blocks & TNT
MC.FallingBlock = class extends MC.Entity {
  constructor(x, y, z, block) {
    super('falling', x + 0.5, y, z + 0.5);
    this.block = block;
    this.hw = 0.49; this.h = 0.98;
  }
  update(dt, M) {
    this.age += dt;
    const W = M.world;
    this.vel[1] -= 25 * dt;
    MC.Phys.integrate(W, this, dt);
    if (this.onGround || this.age > 20) {
      const x = Math.floor(this.pos[0]), y = Math.round(this.pos[1]), z = Math.floor(this.pos[2]);
      const cur = W.getBlock(x, y, z);
      if (cur === 0 || MC.B_FLUID[cur] || (MC.B_REPLACEABLE[cur] && !MC.B_SOLID[cur])) W.setBlock(x, y, z, this.block);
      else if (!M.creativeWorld()) M.spawnItem(this.pos[0], this.pos[1] + 0.5, this.pos[2], MC.makeStack(this.block, 1));
      this.removed = true;
    }
  }
};
MC.PrimedTNT = class extends MC.Entity {
  constructor(x, y, z, fuse) {
    super('tnt', x + 0.5, y, z + 0.5);
    this.fuse = fuse;
    this.hw = 0.49; this.h = 0.98;
    const a = Math.random() * Math.PI * 2;
    this.vel = [Math.cos(a) * 0.6, 4, Math.sin(a) * 0.6];
  }
  update(dt, M) {
    this.age += dt;
    this.fuse -= dt;
    this.vel[1] -= 20 * dt;
    if (this.onGround) { this.vel[0] *= 0.8; this.vel[2] *= 0.8; }
    MC.Phys.integrate(M.world, this, dt);
    if (M.particles && Math.random() < dt * 20) M.particles.smoke(this.pos[0], this.pos[1] + 1.05, this.pos[2], 1, 0.6);
    if (this.fuse <= 0) {
      this.removed = true;
      M.world.explode(this.pos[0], this.pos[1] + 0.5, this.pos[2], 4, this);
    }
  }
};

// ------------------------------------------------------------------ manager
MC.EntityManager = class {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.list = [];
    this.spawnT = 0; this.passiveT = 3; this.villageT = 0;
    this.spawnedVillages = new Set();
    world.entities = this;
  }
  get player() { return this.game.player; }
  get particles() { return this.game.particles; }
  sound(name, pos, vol, pitch) { if (MC.Audio) MC.Audio.play(name, pos, vol, pitch); }
  difficulty() { return this.game.settings.difficulty; }
  creativeWorld() { return this.game.player && this.game.player.creative; }
  isDay() { const h = this.game.hours; return h > 6.3 && h < 17.8; }
  raining() { return this.game.rainStrength > 0.5; }

  add(e) { this.list.push(e); return e; }
  spawnMob(type, x, y, z, o = {}) {
    const m = new MC.Mob(type, x, y, z);
    if (type === 'sheep') {
      const r = Math.random();
      m.wool = r < 0.8 ? 'white' : r < 0.87 ? 'black' : r < 0.92 ? 'orange' : r < 0.96 ? 'yellow' : 'light_blue';
    }
    Object.assign(m, o);
    return this.add(m);
  }
  spawnItem(x, y, z, stack, vel) {
    if (!stack || !stack.id || stack.count <= 0) return null;
    const e = new MC.ItemEntity(x, y, z, stack);
    e.vel = vel ? vel.slice() : [(Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2];
    return this.add(e);
  }
  spawnArrow(x, y, z, vx, vy, vz, shooter, dmg) { return this.add(new MC.Arrow(x, y, z, vx, vy, vz, shooter, dmg)); }
  spawnFallingBlock(x, y, z, id) { return this.add(new MC.FallingBlock(x, y, z, id)); }
  spawnTNT(x, y, z, fuse = 4) { if (this.sound) this.sound('fuse', [x + 0.5, y + 0.5, z + 0.5], 1, 1); return this.add(new MC.PrimedTNT(x, y, z, fuse)); }

  count(pred) { let n = 0; for (const e of this.list) if (pred(e)) n++; return n; }
  nearestMob(pos, r, pred) {
    let best = null, bd = r * r;
    for (const e of this.list) {
      if (e.kind !== 'mob' || !pred(e)) continue;
      const d = (e.pos[0] - pos[0]) ** 2 + (e.pos[1] - pos[1]) ** 2 + (e.pos[2] - pos[2]) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  mergeItem(it) {
    if (it.removed) return;
    const s = it.stack, max = MC.maxStack(s.id);
    if (s.count >= max || s.dur !== undefined) return;
    for (const e of this.list) {
      if (e === it || e.kind !== 'item' || e.removed || e.stack.id !== s.id || e.stack.dur !== undefined) continue;
      if (Math.abs(e.pos[0] - it.pos[0]) > 0.7 || Math.abs(e.pos[1] - it.pos[1]) > 0.5 || Math.abs(e.pos[2] - it.pos[2]) > 0.7) continue;
      const n = Math.min(max - s.count, e.stack.count);
      if (n <= 0) continue;
      s.count += n; e.stack.count -= n;
      if (e.stack.count <= 0) e.removed = true;
      it.age = Math.min(it.age, e.age);
    }
  }

  // ---- targets: the player and the kingdom's people ('k'), monsters ('h'), animals / villagers ('n')
  faction(e) {
    if (e === this.player || e === 'player') return 'k';
    const c = e.cfg;
    return !c ? 'n' : c.ally ? 'k' : c.hostile ? 'h' : 'n';
  }
  targetOk(t) {
    if (!t) return false;
    if (t === this.player) return !t.dead && !t.creative && this.difficulty() > 0;
    return t.kind === 'mob' && !t.dead && !t.removed;
  }
  eyeOf(t) { return t === this.player ? t.eyePos() : t.eye(); }
  hitTarget(t, dmg, src, attacker, kx, kz) {
    if (t === this.player) return t.hurt(dmg, src, kx, kz);
    return t.hurt(dmg, src, this, kx, kz, attacker);
  }
  // nearest visible target of a monster: the player, or one of the kingdom's people (creepers only
  // ever go for the player, so they do not blow up the town)
  pickTarget(mob, range) {
    let best = null, bd = range;
    const P = this.player;
    if (this.targetOk(P)) {
      const d = Math.hypot(P.pos[0] - mob.pos[0], P.pos[1] - mob.pos[1], P.pos[2] - mob.pos[2]);
      if (d < bd) { const pe = P.eyePos(); if (mob.canSee(this, pe[0], pe[1], pe[2]) || mob.provoked && d < 10) { bd = d; best = P; } }
    }
    if (mob.cfg.explode) return best;
    for (const e of this.list) {
      if (e.kind !== 'mob' || !e.cfg.ally || e.dead || e.removed) continue;
      const d = Math.hypot(e.pos[0] - mob.pos[0], e.pos[1] - mob.pos[1], e.pos[2] - mob.pos[2]);
      if (d >= bd) continue;
      const ee = e.eye();
      if (!mob.canSee(this, ee[0], ee[1], ee[2])) continue;
      bd = d; best = e;
    }
    return best;
  }

  // ---- queries
  lineOfSight(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    const hit = this.raycastBlocks([x0, y0, z0], [dx / len, dy / len, dz / len], len, true);
    return !hit;
  }
  // voxel DDA against solid (or opaque-only) blocks; returns { t, x, y, z, n } or null
  raycastBlocks(o, d, maxD, opaqueOnly) {
    const W = this.world;
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = Math.sign(d[0]), sy = Math.sign(d[1]), sz = Math.sign(d[2]);
    const tdx = sx ? Math.abs(1 / d[0]) : Infinity, tdy = sy ? Math.abs(1 / d[1]) : Infinity, tdz = sz ? Math.abs(1 / d[2]) : Infinity;
    let tmx = sx ? ((sx > 0 ? x + 1 : x) - o[0]) / d[0] : Infinity;
    let tmy = sy ? ((sy > 0 ? y + 1 : y) - o[1]) / d[1] : Infinity;
    let tmz = sz ? ((sz > 0 ? z + 1 : z) - o[2]) / d[2] : Infinity;
    let t = 0, n = [0, 0, 0];
    for (let i = 0; i < 256 && t <= maxD; i++) {
      const b = W.getBlock(x, y, z);
      if (opaqueOnly ? MC.B_OPAQUE[b] : (MC.B_SOLID[b] && (MC.B_SHAPE[b] === MC.SHAPE.CUBE || MC.Phys.blockBoxes(W, x, y, z, b).some((q) => {
        // precise test against the block's collision boxes
        const r = MC.rayBox(o, d, x + q[0], y + q[1], z + q[2], x + q[3], y + q[4], z + q[5]);
        if (r !== null && r <= maxD) { t = Math.max(t, r); return true; }
        return false;
      })))) return { t, x, y, z, n };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  }
  raycastEntities(o, d, maxD, exclude, includePlayer, ignoreFaction) {
    let best = null;
    for (const e of this.list) {
      if (e.kind !== 'mob' || e.dead || e === exclude) continue;
      if (ignoreFaction && this.faction(e) === ignoreFaction) continue;
      const t = MC.rayBox(o, d, e.pos[0] - e.hw, e.pos[1], e.pos[2] - e.hw, e.pos[0] + e.hw, e.pos[1] + e.h, e.pos[2] + e.hw);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { e, t };
    }
    const P = this.player;
    if (includePlayer && P && !P.dead && exclude !== 'player' && ignoreFaction !== 'k') {
      const t = MC.rayBox(o, d, P.pos[0] - 0.3, P.pos[1], P.pos[2] - 0.3, P.pos[0] + 0.3, P.pos[1] + 1.8, P.pos[2] + 0.3);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { e: P, t };
    }
    return best;
  }

  // ---- A* over walkable cells
  _passable(x, y, z) {
    const b = this.world.getBlock(x, y, z);
    if (MC.B_SOLID[b] && MC.BLOCKS[b].door && MC.BLOCKS[b].door.open) return true;
    if (MC.B_SOLID[b] || MC.B_FLUID[b] === MC.FLUID.LAVA || MC.B_DAMAGE[b] || b === MC.BLOCK.cobweb) return false;
    return true;
  }
  _standable(x, y, z, tall) {
    if (!this._passable(x, y, z)) return false;
    if (tall && !this._passable(x, y + 1, z)) return false;
    const below = this.world.getBlock(x, y - 1, z);
    if (MC.B_SOLID[below] && !MC.B_DAMAGE[below]) return true;
    if (MC.B_FLUID[this.world.getBlock(x, y, z)] === MC.FLUID.WATER) return true;
    if (MC.B_CLIMB[this.world.getBlock(x, y, z)]) return true;
    return false;
  }
  findPath(mob, gx, gy, gz, maxNodes = 320) {
    const W = this.world;
    const tall = mob.h > 1.1;
    let sx = Math.floor(mob.pos[0]), sy = Math.floor(mob.pos[1] + 0.05), sz = Math.floor(mob.pos[2]);
    if (MC.B_SOLID[W.getBlock(sx, sy, sz)]) sy++;
    // snap goal onto walkable ground
    for (let k = 0; k < 4 && gy > 1 && !MC.B_SOLID[W.getBlock(gx, gy - 1, gz)] && !MC.B_FLUID[W.getBlock(gx, gy, gz)]; k++) gy--;
    const key = (x, y, z) => MC.posKey(x, y, z);
    const open = new MC.Heap();
    const nodes = new Map();
    const h = (x, y, z) => Math.abs(x - gx) + Math.abs(y - gy) * 1.2 + Math.abs(z - gz);
    const start = { x: sx, y: sy, z: sz, g: 0, f: h(sx, sy, sz), p: null, closed: false };
    nodes.set(key(sx, sy, sz), start);
    open.push(start);
    let best = start, bestH = start.f, count = 0;
    const tryN = (cur, x, y, z, cost) => {
      const k = key(x, y, z);
      let n = nodes.get(k);
      const g = cur.g + cost;
      if (n) { if (n.closed || g >= n.g) return; n.g = g; n.f = g + h(x, y, z); n.p = cur; open.push(n); return; }
      n = { x, y, z, g, f: g + h(x, y, z), p: cur, closed: false };
      nodes.set(k, n); open.push(n);
    };
    while (open.size() && count < maxNodes) {
      const cur = open.pop();
      if (cur.closed) continue;
      cur.closed = true; count++;
      const hh = cur.f - cur.g;
      if (hh < bestH) { bestH = hh; best = cur; }
      if (cur.x === gx && cur.z === gz && Math.abs(cur.y - gy) <= 1) { best = cur; break; }
      for (const d of MC.DIRS) {
        const nx = cur.x + d[0], nz = cur.z + d[2];
        const water = MC.B_FLUID[W.getBlock(nx, cur.y, nz)] === MC.FLUID.WATER;
        if (this._standable(nx, cur.y, nz, tall)) { tryN(cur, nx, cur.y, nz, water ? 3 : 1); continue; }
        if (this._standable(nx, cur.y + 1, nz, tall) && this._passable(cur.x, cur.y + (tall ? 2 : 1), cur.z) && !MC.B_SOLID[W.getBlock(nx, cur.y + (tall ? 2 : 1), nz)]) {
          const below = W.getBlock(nx, cur.y, nz);
          if (MC.B_SHAPE[below] !== MC.SHAPE.FENCE && !MC.isDoor(below)) { tryN(cur, nx, cur.y + 1, nz, 2); continue; }
        }
        if (this._passable(nx, cur.y, nz) && (!tall || this._passable(nx, cur.y + 1, nz))) {
          for (let dr = 1; dr <= 3; dr++) {
            if (this._standable(nx, cur.y - dr, nz, tall)) { tryN(cur, nx, cur.y - dr, nz, 1 + dr * 0.5); break; }
            if (!this._passable(nx, cur.y - dr, nz)) break;
          }
        }
        // climbing spiders
        if (mob.cfg && mob.cfg.climb && MC.B_SOLID[W.getBlock(nx, cur.y, nz)] && this._passable(cur.x, cur.y + 1, cur.z)) {
          for (let up = 1; up <= 4; up++) {
            if (this._standable(nx, cur.y + up, nz, false)) { tryN(cur, nx, cur.y + up, nz, 1 + up); break; }
            if (!this._passable(cur.x, cur.y + up, cur.z)) break;
          }
        }
      }
    }
    if (best === start) return null;
    const path = [];
    for (let n = best; n && n !== start; n = n.p) path.push([n.x, n.y, n.z]);
    path.reverse();
    return path;
  }
  randomWalkTarget(mob, range, away) {
    const W = this.world, tall = mob.h > 1.1;
    for (let k = 0; k < 8; k++) {
      let dx = (Math.random() * 2 - 1) * range, dz = (Math.random() * 2 - 1) * range;
      if (away) { const ax = mob.pos[0] - away[0], az = mob.pos[2] - away[2]; if (dx * ax + dz * az < 0) { dx = -dx; dz = -dz; } }
      const x = Math.floor(mob.pos[0] + dx), z = Math.floor(mob.pos[2] + dz);
      if (!W.isLoaded(x, z)) continue;
      let y = Math.floor(mob.pos[1]) + 3;
      for (let i = 0; i < 7; i++, y--) {
        if (this._standable(x, y, z, tall)) {
          if (!mob.cfg.villager && MC.B_FLUID[W.getBlock(x, y, z)]) break;
          return [x, y, z];
        }
      }
    }
    return null;
  }

  // ---- update
  update(dt) {
    const W = this.world, P = this.player;
    const px = P ? P.pos[0] : 0, pz = P ? P.pos[2] : 0;
    for (const e of this.list) {
      if (e.removed) continue;
      const c = W.getChunk(Math.floor(e.pos[0]) >> 4, Math.floor(e.pos[2]) >> 4);
      if (!c || !c.light) continue;   // frozen outside the simulated area
      e.update(dt, this);
      if (e.kind === 'item' && !e.removed && P && !P.dead && e.pickupDelay <= 0) {
        const dx = e.pos[0] - P.pos[0], dz = e.pos[2] - P.pos[2], dy = e.pos[1] - (P.pos[1] + 0.6);
        const d2 = dx * dx + dz * dz + dy * dy;
        // gentle magnet towards the player
        if (d2 < 2.4 * 2.4 && d2 > 0.01) {
          const d = Math.sqrt(d2), k = Math.min(1, dt * 10) * (1 - d / 2.4);
          e.vel[0] -= dx / d * 18 * k; e.vel[1] -= dy / d * 10 * k; e.vel[2] -= dz / d * 18 * k;
        }
        if (dx * dx + dz * dz < 1.0 && dy > -1.4 && dy < 1.6) {
          const left = P.pickup(e.stack);
          if (left <= 0) { e.removed = true; this.sound('pop', e.pos, 0.35, 1.2 + Math.random() * 0.6); }
          else e.stack.count = left;
        }
      }
      if (e.kind === 'arrow' && e.stuck && e.fromPlayer && e.pickup !== false && !e.removed && P && !P.dead && !P.creative && e.age > 0.5) {
        const dx = e.pos[0] - P.pos[0], dz = e.pos[2] - P.pos[2], dy = e.pos[1] - P.pos[1];
        if (dx * dx + dz * dz < 1.6 && dy > -0.5 && dy < 2 && P.pickup(MC.makeStack(MC.ITEM.arrow, 1)) <= 0) { e.removed = true; this.sound('pop', e.pos, 0.35, 1.4); }
      }
      // despawning
      if (e.kind === 'mob' && !e.persistent && !e.removed) {
        const d2 = (e.pos[0] - px) ** 2 + (e.pos[2] - pz) ** 2;
        if (e.cfg.hostile) {
          if (d2 > 110 * 110) e.removed = true;
          else if (d2 > 40 * 40 && Math.random() < dt / 40) e.removed = true;
          if (this.difficulty() === 0) e.removed = true;
        } else if (d2 > 150 * 150) e.removed = true;
      }
    }
    let w = 0;
    for (const e of this.list) if (!e.removed) this.list[w++] = e;
    this.list.length = w;
    // spawning
    this.spawnT -= dt; this.passiveT -= dt; this.villageT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1; this._spawnHostile(); }
    if (this.passiveT <= 0) { this.passiveT = 4; this._spawnPassive(); }
    if (this.villageT <= 0) { this.villageT = 2; this._spawnVillages(); this._spawnBosses(); }
    if (this._spawnCastles) { this.castleT = (this.castleT || 0) - dt; if (this.castleT <= 0) { this.castleT = 0.5; this._spawnCastles(); } }
    if (this._spawnWajo) { this.wajoT = (this.wajoT || 0) - dt; if (this.wajoT <= 0) { this.wajoT = 0.5; this._spawnWajo(); } }
    if (MC.Kingdom) MC.Kingdom.update(this.game, dt);
    this._spawners(dt);
  }

  // ---- dungeon guardians: one per dungeon, spawned when the player reaches the final room
  _spawnBosses() {
    const P = this.player, W = this.world;
    if (!P || P.dead || !MC.Structures || this.difficulty() === 0) return;
    const site = W.gen.nearestDungeon(P.pos[0], P.pos[2], 1);
    if (!site || Math.hypot(site.x - P.pos[0], site.z - P.pos[2]) > 120) return;
    const plan = MC.Structures.dungeonPlan(W.gen, site);
    if (!plan.boss || W.bossesDefeated.has(plan.id) || this.list.some((e) => e.bossId === plan.id && !e.removed)) return;
    const [bx, by, bz] = plan.boss;
    if (Math.hypot(bx - P.pos[0], bz - P.pos[2]) > 22 || Math.abs(by - P.pos[1]) > 8) return;
    const c = W.getChunk(Math.floor(bx) >> 4, Math.floor(bz) >> 4);
    if (!c || !c.light) return;
    const m = this.spawnMob('guardian', bx, by, bz, { persistent: true, bossId: plan.id });
    m.yaw = Math.atan2(P.pos[0] - bx, -(P.pos[2] - bz));
    if (this.particles) { this.particles.poof(bx, by, bz, 1.2, 2.8); this.particles.explosion(bx, by + 1.4, bz, 1); }
    this.sound('explode', [bx, by, bz], 0.7, 0.6);
    if (this.game.ui) this.game.ui.toast('ダンジョンの番人が現れた！', '倒すと財宝が手に入る');
  }
  bossDefeated(m) {
    this.world.bossesDefeated.add(m.bossId);
    this.world.editsDirty = true;
    const c = m.center();
    const drop = (k, n) => this.spawnItem(c[0], c[1], c[2], MC.makeStack(MC.idOf(k), n), [(Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4]);
    const loot = m.cfg.bossLoot;
    if (loot) for (const [k, a, b] of loot) drop(k, a + Math.floor(Math.random() * (b - a + 1)));
    else {
      drop('diamond', 3 + Math.floor(Math.random() * 3)); drop('emerald', 5 + Math.floor(Math.random() * 5));
      drop('golden_apple', 1 + Math.floor(Math.random() * 2)); drop('diamond_sword', 1); drop('gold_ingot', 6);
    }
    if (this.particles) { this.particles.explosion(c[0], c[1], c[2], 1.5); this.particles.sparkle(c[0], c[1], c[2], 30, [1, 0.85, 0.3]); }
    this.sound('levelup', c, 1, 1);
    if (m.onDefeat) m.onDefeat(this, m);
    else if (this.game.ui) this.game.ui.toast('ダンジョンの番人を倒した！', 'ボスの財宝を手に入れよう');
  }
  boss() {
    const P = this.player;
    if (!P) return null;
    let best = null, bd = 48;
    for (const e of this.list) {
      if (e.kind !== 'mob' || !e.cfg.boss || e.removed) continue;
      const d = Math.hypot(e.pos[0] - P.pos[0], e.pos[2] - P.pos[2]) + Math.abs(e.pos[1] - P.pos[1]) * 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _mobCap() { return [0, 14, 22, 30][this.difficulty()] || 0; }
  _validSpawn(x, y, z, tall) {
    const W = this.world;
    const below = W.getBlock(x, y - 1, z);
    if (!MC.B_OPAQUE[below] || below === MC.BLOCK.bedrock) return false;
    const a = W.getBlock(x, y, z), b = W.getBlock(x, y + 1, z);
    if (MC.B_SOLID[a] || MC.B_FLUID[a] || (tall && (MC.B_SOLID[b] || MC.B_FLUID[b]))) return false;
    return true;
  }
  _spawnHostile() {
    const P = this.player;
    if (!P || P.dead) return;
    if (this.count((e) => e.kind === 'mob' && e.cfg.hostile && !e.persistent) >= this._mobCap()) return;
    const W = this.world;
    const h = this.game.hours;
    const sunUp = Math.sin((h - 6) / 24 * Math.PI * 2);
    const darken = MC.clamp(Math.round((0.15 - sunUp) / 0.3 * 11), 0, 11) + (this.raining() ? 3 : 0);
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 36;
      const x = Math.floor(P.pos[0] + Math.cos(a) * r), z = Math.floor(P.pos[2] + Math.sin(a) * r);
      const c = W.getChunk(x >> 4, z >> 4);
      if (!c || !c.light) continue;
      let y = 1 + Math.floor(Math.random() * Math.min(c.maxY + 1, MC.HEIGHT - 3));
      let ok = false;
      for (let i = 0; i < 24 && y > 1; i++, y--) if (this._validSpawn(x, y, z, true)) { ok = true; break; }
      if (!ok) continue;
      const lv = W.lightRaw(x, y, z);
      const sky = lv >> 4, blk = lv & 15;
      if (blk > 0 || Math.max(0, sky - darken) > 7) continue;
      if (Math.hypot(x + 0.5 - P.pos[0], y - P.pos[1], z + 0.5 - P.pos[2]) < 22) continue;
      if (MC.Kingdom && (MC.Kingdom.protects(this.game, x, z) || MC.Kingdom.conqueredCastleAt(this.game, x, z, 20))) continue;
      let types = ['zombie', 'zombie', 'skeleton', 'skeleton', 'spider', 'creeper', 'creeper'];
      // inside a castle: the castle's own monsters
      const cs = MC.Structures.castleAt && MC.Structures.castleAt(W.gen, x, z, 4);
      if (cs && y > cs.fy - 30 && y < cs.fy + 30) types = MC.CASTLE_THEMES[cs.theme].spawn;
      // inside a Japanese castle: its warriors — and nothing at all once it has been captured
      const ws = MC.Structures.wajoAt && MC.Structures.wajoAt(W.gen, x, z, 0);
      if (ws) {
        if (MC.Wajo.seized(W, ws.id)) continue;
        if (y > ws.fy - 30 && y < ws.fy + 40) types = MC.WAJO_TYPES[ws.kind].spawn;
      }
      const type = types[Math.floor(Math.random() * types.length)];
      const n = 1 + Math.floor(Math.random() * (type === 'creeper' ? 1 : 3));
      for (let i = 0; i < n; i++) {
        const ox = x + (i ? Math.floor(Math.random() * 5) - 2 : 0), oz = z + (i ? Math.floor(Math.random() * 5) - 2 : 0);
        if (i && !this._validSpawn(ox, y, oz, type !== 'spider')) continue;
        this.spawnMob(type, ox + 0.5, y, oz + 0.5);
      }
      return;
    }
  }
  _spawnPassive() {
    const P = this.player;
    if (!P) return;
    if (this.count((e) => e.kind === 'mob' && !e.cfg.hostile && !e.cfg.villager && !e.persistent) >= 12) return;
    const W = this.world;
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 40;
      const x = Math.floor(P.pos[0] + Math.cos(a) * r), z = Math.floor(P.pos[2] + Math.sin(a) * r);
      const c = W.getChunk(x >> 4, z >> 4);
      if (!c || !c.light) continue;
      let y = c.maxY + 1;
      while (y > 1 && !MC.B_SOLID[W.getBlock(x, y - 1, z)] && !MC.B_FLUID[W.getBlock(x, y - 1, z)]) y--;
      if (W.getBlock(x, y - 1, z) !== MC.BLOCK.grass || !this._validSpawn(x, y, z, true)) continue;
      if (W.skyLight(x, y, z) < 9) continue;
      const info = W.gen.columnInfo(x, z);
      const BI = MC.BIOME;
      const pool = info.biome === BI.SNOWY || info.biome === BI.TAIGA ? ['sheep', 'sheep', 'cow', 'chicken'] : ['pig', 'cow', 'sheep', 'chicken', 'pig', 'sheep'];
      const type = pool[Math.floor(Math.random() * pool.length)];
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2;
        let oy = y + 2;
        while (oy > y - 3 && !this._validSpawn(ox, oy, oz, true)) oy--;
        if (this._validSpawn(ox, oy, oz, true)) this.spawnMob(type, ox + 0.5, oy, oz + 0.5);
      }
      return;
    }
  }
  _spawnVillages() {
    const P = this.player;
    if (!P || !MC.Structures) return;
    const plans = MC.Structures.villagesNear(this.world.gen, P.pos[0], P.pos[2], 100);
    for (const plan of plans) {
      if (this.spawnedVillages.has(plan.id)) continue;
      // wait until the village area is loaded and meshed
      let ready = true;
      for (const v of plan.villagers.concat(plan.animals)) {
        const c = this.world.getChunk(Math.floor(v.x) >> 4, Math.floor(v.z) >> 4);
        if (!c || !c.light) { ready = false; break; }
      }
      if (!ready) continue;
      this.spawnedVillages.add(plan.id);
      const profs = Object.keys(MC.PROFESSIONS);
      for (const v of plan.villagers) {
        const prof = v.prof || profs[Math.floor(Math.random() * profs.length)];
        const m = this.spawnMob('villager', v.x, v.y, v.z, { persistent: true, prof, home: [v.x, v.y, v.z] });
        m.robe = MC.PROFESSIONS[prof].robe;
      }
      for (const a of plan.animals) this.spawnMob(a.type, a.x, a.y, a.z, { persistent: true });
    }
  }
  _spawners(dt) {
    const P = this.player;
    if (!P || this.difficulty() === 0) return;
    for (const s of this.world.spawners.values()) {
      const d = Math.hypot(s.x + 0.5 - P.pos[0], s.y - P.pos[1], s.z + 0.5 - P.pos[2]);
      if (d > 16) continue;
      // the cages of a conquered castle fall silent
      if (s.pacified === undefined) s.pacified = !!(MC.Kingdom && MC.Kingdom.conqueredCastleAt(this.game, s.x, s.z, 30));
      if (s.pacified) continue;
      if (this.particles && Math.random() < dt * 8) {
        this.particles.flame(s.x + 0.2 + Math.random() * 0.6, s.y + 0.2 + Math.random() * 0.6, s.z + 0.2 + Math.random() * 0.6, 0.8);
        this.particles.smoke(s.x + 0.5, s.y + 0.6, s.z + 0.5, 1, 0.5);
      }
      s.timer -= dt;
      if (s.timer > 0) continue;
      s.timer = 10 + Math.random() * 20;
      const near = this.count((e) => e.kind === 'mob' && e.type === s.type && Math.abs(e.pos[0] - s.x) < 9 && Math.abs(e.pos[1] - s.y) < 5 && Math.abs(e.pos[2] - s.z) < 9);
      if (near >= 6) continue;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < 6; t++) {
          const x = s.x + Math.floor(Math.random() * 7) - 3, y = s.y + Math.floor(Math.random() * 3) - 1, z = s.z + Math.floor(Math.random() * 7) - 3;
          const W = this.world;
          if (!MC.B_SOLID[W.getBlock(x, y - 1, z)] || MC.B_SOLID[W.getBlock(x, y, z)] || MC.B_SOLID[W.getBlock(x, y + 1, z)]) continue;
          this.spawnMob(s.type, x + 0.5, y, z + 0.5);
          if (this.particles) this.particles.poof(x + 0.5, y, z + 0.5);
          break;
        }
      }
    }
  }

  // ---- explosions: damage / knockback entities and the player
  explosionImpact(x, y, z, power, source) {
    const R = power * 2;
    const hit = (cx, cy, cz, apply) => {
      const dx = cx - x, dy = cy - y, dz = cz - z, d = Math.hypot(dx, dy, dz);
      if (d >= R) return;
      let exposure = 1;
      if (!this.lineOfSight(x, y, z, cx, cy, cz)) exposure = 0.35;
      const imp = (1 - d / R) * exposure;
      const dmg = Math.floor((imp * imp + imp) / 2 * 7 * R + 1);
      const l = d || 1;
      apply(dmg, dx / l * imp * 14, Math.max(2, dy / l * imp * 10 + imp * 6), dz / l * imp * 14);
    };
    for (const e of this.list) {
      if (e.removed || e === source) continue;
      const c = e.center();
      if (e.kind === 'mob') hit(c[0], c[1], c[2], (dmg, vx, vy, vz) => { e.invul = 0; e.hurt(dmg, 'explosion', this); e.vel[0] += vx; e.vel[1] += vy; e.vel[2] += vz; });
      else if (e.kind === 'item') hit(c[0], c[1], c[2], (dmg, vx, vy, vz) => { if (dmg > 6 && Math.random() < 0.6) e.removed = true; else { e.vel[0] += vx; e.vel[1] += vy; e.vel[2] += vz; } });
      else if (e.kind === 'tnt') hit(c[0], c[1], c[2], (dmg, vx, vy, vz) => { e.vel[0] += vx * 0.5; e.vel[1] += vy * 0.5; e.vel[2] += vz * 0.5; });
    }
    const P = this.player;
    if (P && !P.dead) {
      hit(P.pos[0], P.pos[1] + 0.9, P.pos[2], (dmg, vx, vy, vz) => {
        const mul = source instanceof MC.Mob ? [0, 0.5, 1, 1.5][this.difficulty()] : 1;
        P.hurt(Math.max(1, Math.round(dmg * mul)), 'explosion', 0, 0);
        P.vel[0] += vx; P.vel[1] += vy * 0.8; P.vel[2] += vz;
      });
      const d = Math.hypot(P.pos[0] - x, P.pos[1] - y, P.pos[2] - z);
      if (this.game.shake !== undefined) this.game.shake = Math.max(this.game.shake, MC.clamp(1.2 - d / 24, 0, 1));
    }
  }

  // ---- rendering
  render(batch, cam, time) {
    const W = this.world;
    const cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
    const maxD = W.renderDist * 16;
    for (const e of this.list) {
      const dx = e.pos[0] - cx, dz = e.pos[2] - cz;
      if (dx * dx + dz * dz > maxD * maxD) continue;
      if (e.kind === 'mob') {
        const c = e.center(), cfg = e.cfg, tn = cfg.tint || [1, 1, 1];
        batch.setLight(W, c[0], c[1], c[2]);
        if (e.dead || e.hurtTime > 0) batch.setTint(tn[0], tn[1] * 0.4, tn[2] * 0.4, 0.05);
        else if (e.fuse > 0 && Math.floor(e.fuse * 8) % 2 === 0) batch.setTint(1.5, 1.5, 1.5, 0.6);
        else if (e.slowT > 0) batch.setTint(tn[0] * 0.7, tn[1] * 0.9, tn[2] * 1.4, 0.05);
        else batch.setTint(tn[0], tn[1], tn[2], cfg.glow || 0);
        if (e.fire > 0) { batch.light[1] = Math.max(batch.light[1], 0.9); }
        MC.renderMob(batch, e.model || cfg.model || e.type, e.pos[0], e.pos[1], e.pos[2], {
          yaw: e.yaw, headYaw: e.headYaw - e.yaw, headPitch: e.headPitch, walk: e.walk / (cfg.scale || 1), amp: e.amp, t: time, scale: cfg.scale || 1,
          attack: e.attackAnim, aim: e.aim, fuse: e.fuse / 1.5, death: e.dead ? e.deathT : 0, flap: e.type === 'chicken' && !e.onGround, graze: e.graze > 0 ? Math.min(1, e.graze) : 0,
        }, { wool: e.wool, robe: e.robe, held: cfg.held ? MC.idOf(cfg.held) : 0 });
      } else if (e.kind === 'item') {
        batch.setLight(W, e.pos[0], e.pos[1] + 0.2, e.pos[2]);
        batch.setTint(1, 1, 1, 0);
        MC.renderItem(batch, e.stack.id, e.stack.count, e.pos[0], e.pos[1], e.pos[2], e.spin, Math.sin(e.age * 2.2) * 0.06 + 0.06);
      } else if (e.kind === 'arrow') {
        batch.setLight(W, e.pos[0], e.pos[1], e.pos[2]);
        batch.setTint(1, 1, 1, 0);
        const d = e.dir || [0, 0, 1];
        const model = MC.ItemModels.get(MC.ITEM.arrow);
        for (let k = 0; k < 2; k++) {
          const m = batch.base(e.pos[0], e.pos[1], e.pos[2]);
          MC.Mx.ry(m, Math.atan2(d[0], d[2]));
          MC.Mx.rx(m, -Math.asin(MC.clamp(d[1], -1, 1)));
          MC.Mx.rz(m, k * Math.PI / 2);
          MC.Mx.ry(m, -Math.PI / 2);
          MC.Mx.rz(m, -Math.PI / 4);
          MC.Mx.sc(m, 0.7 / 16);
          MC.Mx.tr(m, -12, -12, -8);
          batch.model(m, model);
        }
      } else if (e.kind === 'bolt') {
        if (MC.renderBolt) MC.renderBolt(batch, e, W);
      } else if (e.kind === 'falling' || e.kind === 'tnt') {
        batch.setLight(W, e.pos[0], e.pos[1] + 0.5, e.pos[2]);
        const flash = e.kind === 'tnt' && Math.floor(e.fuse * 4) % 2 === 0;
        batch.setTint(flash ? 1.6 : 1, flash ? 1.6 : 1, flash ? 1.6 : 1, flash ? 0.5 : 0);
        const s = e.kind === 'tnt' && e.fuse < 1 ? 1 + (1 - e.fuse) * 0.12 : 1;
        const m = batch.base(e.pos[0], e.pos[1], e.pos[2]);
        MC.Mx.sc(m, s / 16);
        MC.Mx.tr(m, -8, 0, -8);
        batch.model(m, MC.ItemModels.get(e.kind === 'tnt' ? MC.BLOCK.tnt : e.block));
      }
    }
    // spinning mobs inside nearby spawners
    for (const s of W.spawners.values()) {
      const d2 = (s.x + 0.5 - cx) ** 2 + (s.y - cy) ** 2 + (s.z + 0.5 - cz) ** 2;
      if (d2 > 32 * 32) continue;
      batch.setLight(W, s.x + 0.5, s.y + 0.5, s.z + 0.5);
      batch.light[1] = Math.max(batch.light[1], 0.6);
      const cfg = MC.MOB_TYPES[s.type];
      if (!cfg) continue;
      const tn = cfg.tint || [1, 1, 1];
      batch.setTint(tn[0], tn[1], tn[2], 0);
      const sc = Math.min(0.45, 0.7 / Math.max(cfg.h, cfg.w));
      MC.renderMob(batch, cfg.model || s.type, s.x + 0.5, s.y + 0.5 - cfg.h * sc * 0.5, s.z + 0.5, { yaw: time * 1.8, scale: sc, walk: 0, amp: 0, t: time });
    }
    batch.setTint(1, 1, 1, 0);
  }
};

// ray vs AABB: returns entry distance or null
MC.rayBox = function (o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
};

// binary min-heap on .f
MC.Heap = class {
  constructor() { this.a = []; }
  size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
};
