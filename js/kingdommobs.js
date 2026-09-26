'use strict';
// The kingdom's people and its enemies: allied mob types (swordsmen, archers, mounted knights, farmers,
// blacksmiths, the master builder, merchants, priests, townsfolk) with their AIs — soldiers patrol the
// streets and charge anything hostile, archers hold the towers, workers keep a daily routine (work by day,
// home at night, flee from monsters) — the roster that keeps every person across saves (with respawns
// after a death), orders (follow the king / back to your post), and the raids: armies that march on the
// kingdom at dusk, wave after wave, until they are beaten back.
(function () {
  const T = MC.MOB_TYPES, BL = MC.BLOCK;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const base = { ally: true, w: 0.6, h: 1.95, eye: 1.62, sound: 'villager', quiet: true, speed: 2.2 };
  Object.assign(T, {
    k_builder: { ...base, name: '建築家', hp: 26, model: 'k_builder', held: 'iron_axe', ai: 'k_worker', role: 'builder', pitch: 0.9 },
    k_swordsman: { ...base, name: '剣士', hp: 40, eye: 1.7, speed: 3.0, dmg: 6, armor: 0.2, kbResist: 0.3, model: 'k_swordsman', held: 'iron_sword', ai: 'k_soldier', role: 'soldier', pitch: 0.75 },
    k_archer: { ...base, name: '弓兵', hp: 26, eye: 1.7, speed: 2.9, dmg: 5, model: 'k_archer', held: 'bow', ai: 'k_archer', role: 'archer', pitch: 0.95 },
    k_knight: { ...base, name: '騎士', hp: 70, w: 1.2, h: 2.7, eye: 2.45, speed: 5.0, dmg: 8, armor: 0.25, kbResist: 0.85, model: 'k_knight', held: 'k_lance', ai: 'k_soldier', role: 'knight', sound: 'horse' },
    k_farmer: { ...base, name: '農夫', hp: 20, speed: 2.1, model: 'k_farmer', held: 'iron_hoe', ai: 'k_worker', role: 'farmer', prof: 'k_farmer' },
    k_smith: { ...base, name: '鍛冶職人', hp: 26, speed: 2.1, model: 'k_smith', held: 'k_hammer', ai: 'k_worker', role: 'smith', prof: 'k_smith', pitch: 0.7 },
    k_merchant: { ...base, name: '商人', hp: 20, model: 'k_merchant', ai: 'k_worker', role: 'merchant', prof: 'k_merchant', pitch: 1.05 },
    k_priest: { ...base, name: '司祭', hp: 22, speed: 1.9, model: 'k_priest', held: 'book', ai: 'k_worker', role: 'priest', prof: 'k_priest', pitch: 0.8 },
    k_citizen: { ...base, name: '町民', hp: 20, model: 'k_folk_m1', ai: 'k_worker', role: 'citizen' },
    // leader of a raiding army
    raid_warlord: { name: '敵軍の軍団長', hostile: true, hp: 90, w: 0.8, h: 2.4, eye: 2.1, speed: 2.8, dmg: 8, model: 'knight', scale: 1.2, tint: [0.95, 0.38, 0.32],
      held: 'diamond_sword', kbResist: 0.7, armor: 0.25, sound: 'skeleton', pitch: 0.7 },
  });
  MC.MOB_DROPS.raid_warlord = [['iron_ingot', 2, 5, 1], ['gold_ingot', 1, 3, 1], ['emerald', 2, 5, 1], ['diamond', 1, 1, 0.3]];
  const SOLDIER = new Set(['soldier', 'knight', 'archer']);
  const CLOTHES = [[0.62, 0.22, 0.2], [0.25, 0.4, 0.62], [0.3, 0.5, 0.28], [0.62, 0.52, 0.3], [0.5, 0.3, 0.55], [0.72, 0.62, 0.5], [0.35, 0.35, 0.4], [0.7, 0.42, 0.22]];
  const EARTH = [[0.55, 0.45, 0.28], [0.45, 0.5, 0.32], [0.6, 0.55, 0.42], [0.4, 0.36, 0.3]];

  // ---------------------------------------------------------------- helpers
  const hyp = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const bonus = (M) => (M.game.kingdom && M.game.kingdom.bonus) || 0;
  // nearest hostile within range of the mob (and within leash of anchor), seen by the mob
  function hostileNear(mob, M, range, anchor, leash, blind) {
    let best = null, bd = range * range;
    for (const e of M.list) {
      if (e.kind !== 'mob' || e.dead || e.removed || !e.cfg.hostile) continue;
      const dx = e.pos[0] - mob.pos[0], dy = e.pos[1] - mob.pos[1], dz = e.pos[2] - mob.pos[2];
      const d2 = dx * dx + dy * dy * 2 + dz * dz;
      if (d2 >= bd) continue;
      if (anchor && hyp(e.pos, anchor) > leash) continue;
      if (!blind) { const c = e.center(); if (!mob.canSee(M, c[0], c[1], c[2])) continue; }
      bd = d2; best = e;
    }
    return best;
  }
  function regen(mob, dt) {
    mob.regenT = (mob.regenT || 0) + dt;
    if (mob.regenT > 3 && mob.health < mob.maxHealth && (!mob.target || mob.target.dead)) { mob.regenT = 0; mob.health = Math.min(mob.maxHealth, mob.health + 1); }
  }
  // put the mob on a free spot around pos (used for ladders, stuck mobs and followers left behind)
  function teleport(mob, M, pos, r = 2) {
    const tall = mob.h > 1.1;
    for (let t = 0; t < 24; t++) {
      const x = Math.floor(pos[0] + (t ? (Math.random() - 0.5) * r * 2 : 0)), z = Math.floor(pos[2] + (t ? (Math.random() - 0.5) * r * 2 : 0));
      for (let dy = 2; dy >= -3; dy--) {
        const y = Math.floor(pos[1]) + dy;
        if (!M._standable(x, y, z, tall) || MC.B_FLUID[M.world.getBlock(x, y, z)]) continue;
        if (M.particles) M.particles.poof(mob.pos[0], mob.pos[1], mob.pos[2], mob.hw * 2, mob.h);
        mob.pos = [x + 0.5, y, z + 0.5]; mob.vel = [0, 0, 0]; mob.path = null; mob.fallY = y; mob.navT = 0;
        return true;
      }
    }
    return false;
  }
  // walk to pos; true once there. Mobs that stay stuck for long are moved there while nobody watches
  function goTo(mob, M, dt, pos, mul, arrive) {
    if (!pos) return true;
    const hd = hyp(pos, mob.pos), dy = pos[1] - mob.pos[1];
    if (hd < arrive && Math.abs(dy) < 2) { mob.stop(); mob.navT = 0; return true; }
    mob.navT = (mob.navT || 0) + dt;
    const P = M.player;
    if (mob.navT > 28) { mob.navT = 0; if (!P || hyp(P.pos, mob.pos) > 24 && hyp(P.pos, pos) > 16) { teleport(mob, M, pos, 1); return false; } }
    mob.navigate(M, pos[0], pos[1], pos[2], mul, dt, 1.5);
    mob._defaultHead(dt);
    return false;
  }
  function followPlayer(mob, M, dt, near, far) {
    const P = M.player, d = hyp(P.pos, mob.pos), dy = Math.abs(P.pos[1] - mob.pos[1]);
    if ((d > 34 || dy > 12) && P.onGround) { teleport(mob, M, P.pos, 3); return; }
    if (d > far || dy > 3) mob.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1.35, dt, 0.6);
    else { mob.stop(); if (d < near) { const pe = P.eyePos(); mob.lookAt(pe[0], pe[1], pe[2]); } }
    if (d > far) mob._defaultHead(dt);
  }
  function idleLook(mob, M, dt) {
    const P = M.player;
    if (P && hyp(P.pos, mob.pos) < 5) { const pe = P.eyePos(); mob.lookAt(pe[0], pe[1], pe[2]); return; }
    mob.lookT = (mob.lookT || 0) - dt;
    if (mob.lookT <= 0) { mob.lookT = 2 + Math.random() * 4; mob.headYaw = mob.yaw + (Math.random() - 0.5) * 2; mob.headPitch = (Math.random() - 0.5) * 0.4; }
  }

  // ---------------------------------------------------------------- combat
  function melee(mob, M, dt, T, knight) {
    const c = mob.cfg;
    const tc = T.center();
    mob.lookAt(tc[0], tc[1], tc[2]);
    const dx = T.pos[0] - mob.pos[0], dz = T.pos[2] - mob.pos[2], hd = Math.hypot(dx, dz), dy = T.pos[1] - mob.pos[1];
    const reach = mob.hw + T.hw + (knight ? 1.2 : 0.85);
    const dmg = c.dmg + bonus(M);
    if (knight) {
      // couched-lance charge: a long dash that tramples the first enemy in the way
      mob.chargeCD = (mob.chargeCD || 0) - dt;
      const ch = mob.charge;
      if (ch) {
        ch.t += dt;
        mob.moveX = ch.dir[0]; mob.moveZ = ch.dir[1]; mob.speedMul = 1.75;
        mob.yaw = Math.atan2(ch.dir[0], -ch.dir[1]);
        mob.attackAnim = Math.max(mob.attackAnim, 0.5);
        if (!ch.hit && hd < reach + 0.5 && Math.abs(dy) < 2.5) {
          ch.hit = true;
          T.hurt(Math.round(dmg * 1.7), 'ally', M, ch.dir[0] * 2.5, ch.dir[1] * 2.5, mob);
          M.sound('attack', mob.center(), 1, 0.7);
          if (M.particles) M.particles.crit(tc[0], tc[1], tc[2]);
        }
        if (ch.t > 1.1 || ((mob.hitX || mob.hitZ) && ch.t > 0.2)) { mob.charge = null; mob.chargeCD = 4 + Math.random() * 3; }
        return;
      }
      if (mob.chargeCD <= 0 && hd > 5 && hd < 15 && mob.onGround && Math.abs(dy) < 2 && mob.canSee(M, tc[0], tc[1], tc[2])) {
        mob.charge = { t: 0, dir: [dx / hd, dz / hd], hit: false };
        M.sound('horse_say', mob.center(), 1, 1.1);
        return;
      }
    }
    if (hd < reach && Math.abs(dy) < 2.2) {
      mob.steer(T.pos[0], T.pos[2], 0.25);
      if (mob.attackCD <= 0) {
        mob.attackCD = knight ? 1.1 : 0.85; mob.attackAnim = 1;
        T.hurt(dmg, 'ally', M, dx, dz, mob);
        M.sound('attack', mob.center(), 0.8, 1.05);
      }
    } else mob.navigate(M, T.pos[0], T.pos[1], T.pos[2], 1.2, dt, 0.5);
  }
  function shoot(mob, M, T) {
    const e = mob.eye(), t = T.center();
    const spd = 28, d = Math.hypot(t[0] - e[0], t[2] - e[2]), tt = d / spd;
    let vx = t[0] - e[0], vy = t[1] + 0.15 - e[1] + 10 * tt * tt, vz = t[2] - e[2];
    const l = Math.hypot(vx, vy, vz) || 1;
    vx = vx / l + (Math.random() - 0.5) * 0.025; vy = vy / l + (Math.random() - 0.5) * 0.025; vz = vz / l + (Math.random() - 0.5) * 0.025;
    M.spawnArrow(e[0] + vx * 0.6, e[1] + vy * 0.6 - 0.1, e[2] + vz * 0.6, vx * spd, vy * spd, vz * spd, mob, mob.cfg.dmg + bonus(M));
    M.sound('bow', mob.center(), 0.8, 1.15);
  }

  // ---------------------------------------------------------------- AIs
  Object.assign(MC.MOB_AI, {
    // swordsmen and mounted knights
    k_soldier(dt, M) {
      const c = this.cfg, e = this.kentry, k = M.game.kingdom, P = M.player;
      const knight = c.role === 'knight';
      regen(this, dt);
      if (this.talkT > 0) { this.talkT -= dt; this.stop(); idleLook(this, M, dt); return; }
      const follow = e && e.order === 'follow' && P && !P.dead;
      const raid = k && k.raid;
      const anchor = follow ? P.pos : (this.post || this.home || this.pos);
      const leash = follow ? 24 : raid ? MC.Kingdom.radius(k) + 30 : knight ? 44 : 28;
      let Tg = this.target;
      if (Tg && (Tg.dead || Tg.removed || !Tg.cfg || !Tg.cfg.hostile || hyp(Tg.pos, anchor) > leash + 10)) { Tg = this.target = null; this.path = null; this.charge = null; }
      this.senseT -= dt;
      if (!Tg && this.senseT <= 0) {
        this.senseT = 0.5;
        Tg = this.target = hostileNear(this, M, raid ? 40 : 18, anchor, leash);
      }
      if (Tg) { melee(this, M, dt, Tg, knight); return; }
      this.charge = null;
      if (follow) { followPlayer(this, M, dt, 3, knight ? 7 : 5); return; }
      if (raid && raid.front && hyp(raid.front, this.pos) > 6) { this.navigate(M, raid.front[0], raid.front[1], raid.front[2], 1.2, dt, 1); this._defaultHead(dt); return; }
      // patrol: streets near the post (knights ride through the whole town), stand guard in between
      this.patrolT = (this.patrolT || 0) - dt;
      if (!this.pgoal || this.patrolT <= 0) {
        this.patrolT = 10 + Math.random() * 14;
        let g = null;
        if (k && Math.random() < (knight ? 0.85 : 0.55)) g = MC.Kingdom.randomStreet(k, anchor, knight ? 100 : 26);
        if (!g) g = [anchor[0] + (Math.random() - 0.5) * 6, anchor[1], anchor[2] + (Math.random() - 0.5) * 6];
        this.pgoal = g;
      }
      if (goTo(this, M, dt, this.pgoal, knight ? 0.75 : 0.55, 1.5)) idleLook(this, M, dt);
    },

    // archers: hold their post (tower tops, wall-walks) and shoot whatever comes into range
    k_archer(dt, M) {
      const e = this.kentry, k = M.game.kingdom, P = M.player;
      regen(this, dt);
      if (this.talkT > 0) { this.talkT -= dt; this.stop(); idleLook(this, M, dt); return; }
      const follow = e && e.order === 'follow' && P && !P.dead;
      const post = this.post || this.home;
      let Tg = this.target;
      if (Tg && (Tg.dead || Tg.removed || !Tg.cfg || !Tg.cfg.hostile || hyp(Tg.pos, this.pos) > 34)) { Tg = this.target = null; }
      this.senseT -= dt;
      if (this.senseT <= 0) {
        this.senseT = 0.5;
        if (!Tg || !this.canSee(M, ...Tg.center())) { const n = hostileNear(this, M, k && k.raid ? 32 : 26, null, 0); if (n) Tg = this.target = n; else if (Tg) Tg = this.target = null; }
      }
      if (Tg) {
        const t = Tg.center();
        this.lookAt(t[0], t[1], t[2]);
        this.yaw = Math.atan2(t[0] - this.pos[0], -(t[2] - this.pos[2]));
        const hd = hyp(Tg.pos, this.pos);
        if (follow && hd < 4) { const l = hd || 1; this.moveX = (this.pos[0] - Tg.pos[0]) / l; this.moveZ = (this.pos[2] - Tg.pos[2]) / l; this.speedMul = 0.9; } else this.stop();
        this.aim = true; this.aimT += dt;
        if (this.aimT > 0.8 && this.attackCD <= 0) { this.aimT = 0; this.attackCD = 1.2 + Math.random() * 0.4; shoot(this, M, Tg); }
        return;
      }
      this.aim = false; this.aimT = 0;
      if (follow) { followPlayer(this, M, dt, 3, 6); return; }
      if (!post) { idleLook(this, M, dt); return; }
      const hd = hyp(post, this.pos), dy = post[1] - this.pos[1];
      // climbing the tower's ladder
      if (hd < 2.6 && dy > 1.5) { teleport(this, M, post, 0); return; }
      if (goTo(this, M, dt, post, 0.8, 0.9)) idleLook(this, M, dt);
    },

    // everybody else: work by day, home at night, run from monsters
    k_worker(dt, M) {
      const c = this.cfg, e = this.kentry, k = M.game.kingdom, role = c.role;
      regen(this, dt);
      if (this.talkT > 0 || this.trading > 0) { this.talkT -= dt; this.stop(); idleLook(this, M, dt); return; }
      const raid = k && k.raid;
      this.senseT -= dt;
      if (this.senseT <= 0) { this.senseT = 0.6; this.threat = hostileNear(this, M, raid ? 16 : 9, null, 0, true); }
      const th = this.threat;
      if (th && !th.dead && !th.removed && hyp(th.pos, this.pos) < 14) {
        const dx = this.pos[0] - th.pos[0], dz = this.pos[2] - th.pos[2], l = Math.hypot(dx, dz) || 1;
        this.navigate(M, this.pos[0] + dx / l * 7, this.pos[1], this.pos[2] + dz / l * 7, 1.7, dt, 0.8);
        this._defaultHead(dt);
        return;
      }
      const home = (e && e.home) || this.home;
      if (raid) { if (goTo(this, M, dt, home, 1.3, 1.2)) idleLook(this, M, dt); return; }
      const h = M.game.hours;
      if (h >= 19.5 || h < 6.2) { if (goTo(this, M, dt, home, 0.8, 1.2)) idleLook(this, M, dt); return; }
      switch (role) {
        case 'builder': {
          const b = k && MC.Kingdom.current(k);
          if (b) {
            const site = b.door || b.center;
            if (goTo(this, M, dt, site, 1.1, 3.5)) {
              this.workT = (this.workT || 0) - dt;
              if (b.center) this.lookAt(b.center[0], b.center[1] + 1, b.center[2]);
              if (this.workT <= 0) { this.workT = 0.6; this.attackAnim = 1; }
            }
            return;
          }
          break;
        }
        case 'farmer': if (farmWork(this, M, dt, e, k)) return; break;
        case 'smith': {
          const w = (e && e.work) || home;
          if (goTo(this, M, dt, w, 0.9, 1.3)) {
            this.workT = (this.workT || 0) - dt;
            if (this.workT <= 0) {
              this.workT = 1 + Math.random() * 0.8; this.attackAnim = 1;
              const f = this.eye();
              if (M.particles) for (let i = 0; i < 4; i++) M.particles.add({ x: f[0] + Math.sin(this.yaw) * 0.7, y: this.pos[1] + 1.05, z: f[2] - Math.cos(this.yaw) * 0.7, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
                life: 0.35, size: 0.04, tile: MC.TILE.particle_spark, emit: 1, emitFade: true, grav: 14, fullbright: true });
              M.sound('anvil', this.center(), 0.7, 0.9 + Math.random() * 0.2);
            }
          }
          return;
        }
        case 'merchant': case 'priest': {
          const w = (e && e.post) || home;
          if (goTo(this, M, dt, w, 0.8, 1.3)) {
            idleLook(this, M, dt);
            if (role === 'priest') priestAura(this, M, dt);
          }
          return;
        }
      }
      // townsfolk (and idle workers): stroll the streets, meet at the plaza, now and then go home
      this.wT = (this.wT || 0) - dt;
      if (!this.wgoal || this.wT <= 0) {
        this.wT = 8 + Math.random() * 16;
        const r = Math.random();
        let g = null;
        if (k && r < 0.35 && k.center) g = [k.center[0] + (Math.random() - 0.5) * 6, k.center[1], k.center[2] + (Math.random() - 0.5) * 6];
        else if (k && r < 0.85) g = MC.Kingdom.randomStreet(k, home || this.pos, 40);
        this.wgoal = g || home;
      }
      if (goTo(this, M, dt, this.wgoal, 0.65, 1.6)) idleLook(this, M, dt);
    },
  });

  function priestAura(mob, M, dt) {
    mob.healT = (mob.healT || 0) - dt;
    if (mob.healT > 0) return;
    mob.healT = 5;
    let any = false;
    for (const e of M.list) {
      if (e.kind !== 'mob' || !e.cfg.ally || e.dead || e.health >= e.maxHealth || hyp(e.pos, mob.pos) > 12) continue;
      e.health = Math.min(e.maxHealth, e.health + 5); any = true;
      if (M.particles) { const c = e.center(); M.particles.sparkle(c[0], c[1], c[2], 6, [1.2, 1.1, 0.6]); }
    }
    const P = M.player;
    if (P && !P.dead && P.health < P.maxHealth && hyp(P.pos, mob.pos) < 8) { P.heal(3); any = true; if (M.particles) M.particles.sparkle(P.pos[0], P.pos[1] + 0.8, P.pos[2], 10, [1.2, 1.1, 0.6]); }
    if (any) { mob.attackAnim = 1; M.sound('magic', mob.center(), 0.5, 1.4); }
  }
  // tend the fields: harvest ripe wheat into the farm's chest (baking some into bread), replant
  function farmWork(mob, M, dt, e, k) {
    const W = M.world;
    let rect = e && e.farm, chest = e && e.chest;
    if (!rect && k && e) { const b = k.buildings.find((q) => q.id === e.bld); if (b) { rect = b.farm; chest = b.chest; } }
    if (!rect) return false;
    if (!mob.job) {
      mob.jobT = (mob.jobT || 0) - dt;
      if (mob.jobT > 0) { idleLook(mob, M, dt); mob.stop(); return true; }
      mob.jobT = 1.5 + Math.random() * 2.5;
      for (let t = 0; t < 16 && !mob.job; t++) {
        const x = rect[0] + Math.floor(Math.random() * (rect[2] - rect[0] + 1)), z = rect[1] + Math.floor(Math.random() * (rect[3] - rect[1] + 1)), y = rect[4];
        if (W.getBlock(x, y, z) !== BL.farmland) continue;
        const crop = W.getBlock(x, y + 1, z);
        if (crop === BL.wheat_3) mob.job = { x, y: y + 1, z, kind: 'harvest' };
        else if (crop === 0) mob.job = { x, y: y + 1, z, kind: 'plant' };
      }
      if (!mob.job) { mob.jobT = 5; return true; }
    }
    const j = mob.job;
    if (goTo(mob, M, dt, [j.x + 0.5, j.y, j.z + 0.5], 0.85, 1.4)) {
      mob.lookAt(j.x + 0.5, j.y + 0.2, j.z + 0.5);
      mob.attackAnim = 1;
      const cur = W.getBlock(j.x, j.y, j.z);
      if (j.kind === 'harvest' && cur === BL.wheat_3) {
        W.setBlock(j.x, j.y, j.z, BL.wheat_0);
        if (M.particles) M.particles.blockBreak(j.x, j.y, j.z, BL.wheat_3);
        deposit(W, chest, MC.ITEM.wheat, 1);
        if (Math.random() < 0.4) deposit(W, chest, MC.ITEM.wheat_seeds, 1);
        M.sound('dig_grass', [j.x + 0.5, j.y, j.z + 0.5], 0.6);
      } else if (j.kind === 'plant' && cur === 0 && W.getBlock(j.x, j.y - 1, j.z) === BL.farmland) {
        W.setBlock(j.x, j.y, j.z, BL.wheat_0);
        M.sound('place_grass', [j.x + 0.5, j.y, j.z + 0.5], 0.5);
      }
      mob.job = null;
    }
    return true;
  }
  function deposit(W, pos, id, n) {
    if (!pos || !MC.isChest(W.getBlock(pos[0], pos[1], pos[2]))) return;
    const ch = W.getChest(pos[0], pos[1], pos[2]);
    const put = (iid, cnt) => {
      for (const s of ch.slots) if (s && s.id === iid && s.count + cnt <= MC.maxStack(iid)) { s.count += cnt; return; }
      const i = ch.slots.indexOf(null);
      if (i >= 0) ch.slots[i] = MC.makeStack(iid, cnt);
    };
    put(id, n);
    // the farmer's wife bakes: three sheaves of wheat become a loaf of bread
    if (id === MC.ITEM.wheat && Math.random() < 0.3) {
      let have = 0;
      for (const s of ch.slots) if (s && s.id === id) have += s.count;
      if (have >= 6) {
        let left = 3;
        for (let i = 0; i < ch.slots.length && left; i++) { const s = ch.slots[i]; if (s && s.id === id) { const k = Math.min(left, s.count); s.count -= k; left -= k; if (!s.count) ch.slots[i] = null; } }
        put(MC.ITEM.bread, 1);
      }
    }
    W.editsDirty = true;
  }

  // ---------------------------------------------------------------- the roster
  const KP = MC.KingdomPeople = {
    label(e) { return T[e.type].name + ' ' + e.name; },
    // a new person of the kingdom (spawned right away when the king is around)
    enlist(game, k, type, o) {
      if (k.npcs.filter((e) => !e.gone).length >= 60) return null;
      const g = o.g || (type === 'k_citizen' ? (Math.random() < 0.5 ? 'm' : 'f') : 'm');
      const e = { uid: k.nextUid++, type, name: MC.personName(g), g, home: o.home, post: o.post || null, work: o.work || null, farm: o.farm || null, chest: o.chest || null,
        bld: o.bld || 0, order: 'guard', dead: 0, hp: 0 };
      if (type === 'k_citizen') { e.model = g === 'f' ? pick(['k_folk_f1', 'k_folk_f2']) : pick(['k_folk_m1', 'k_folk_m2']); e.robe = pick(CLOTHES); }
      if (type === 'k_farmer') e.robe = pick(EARTH);
      if (type === 'k_merchant') e.robe = pick([[0.5, 0.2, 0.55], [0.2, 0.3, 0.6], [0.6, 0.2, 0.2]]);
      k.npcs.push(e);
      KP.spawn(game, k, e, true);
      return e;
    },
    spawn(game, k, e, fx) {
      const M = game.entities, W = game.world, P = game.player;
      if (!k._ents) k._ents = new Map();
      if (k._ents.has(e.uid) || e.dead) return null;
      const cfg = T[e.type];
      const at = cfg.role === 'archer' && e.post ? e.post : e.home;
      if (!at || Math.hypot(at[0] - P.pos[0], at[2] - P.pos[2]) > 200) return null;
      const c = W.getChunk(Math.floor(at[0]) >> 4, Math.floor(at[2]) >> 4);
      if (!c || !c.light) return null;
      const robe = SOLDIER.has(cfg.role) ? MC.WOOL_TINT[k.color] : e.robe || null;
      const m = M.spawnMob(e.type, at[0], at[1] + 0.05, at[2], { persistent: true, noBurn: true, kentry: e, label: KP.label(e), robe, model: e.model || null,
        home: e.home, post: e.post, prof: cfg.prof || null });
      m.yaw = Math.random() * Math.PI * 2;
      m.soundT = 20 + Math.random() * 40;
      if (e.hp > 0) m.health = Math.min(m.maxHealth, e.hp);
      k._ents.set(e.uid, m);
      if (fx && game.particles) { game.particles.poof(at[0], at[1], at[2], m.hw * 2, m.h); game.particles.sparkle(at[0], at[1] + 1, at[2], 8, [1.2, 1.05, 0.5]); }
      return m;
    },
    sync(game, k) { if (k._ents) for (const [, m] of k._ents) if (m.kentry && !m.dead) m.kentry.hp = m.health; },
    loaded(game, k) { k._ents = new Map(); k.raid = null; },
    builderAt(k, b) {
      if (!k._ents || !b.center) return null;
      for (const [, m] of k._ents) if (m.cfg.role === 'builder' && !m.dead && hyp(m.pos, b.center) < 9) return m;
      return null;
    },
    builder(k) { if (k._ents) for (const [, m] of k._ents) if (m.cfg.role === 'builder' && !m.dead && !m.removed) return m; return null; },
    counts(k) {
      const out = {};
      for (const e of k.npcs) {
        const o = out[e.type] || (out[e.type] = { all: 0, alive: 0 });
        o.all++; if (!e.dead) o.alive++;
      }
      return out;
    },
    died(game, m) {
      const e = m.kentry, k = game.kingdom;
      if (!e || !k) return;
      const soldier = SOLDIER.has(m.cfg.role), delay = soldier ? 150 : 100;
      e.dead = k.t + delay; e.hp = 0; e.order = 'guard';
      if (k._ents) k._ents.delete(e.uid);
      const P = game.player;
      if (game.ui && Math.hypot(m.pos[0] - P.pos[0], m.pos[2] - P.pos[2]) < 60) game.ui.toast(`${KP.label(e)}が倒れた…`, `${delay}秒後に新たな${T[e.type].name}がやって来る`);
    },
    // orders for the whole army (or one arm of it)
    orderAll(game, k, roles, order) {
      let n = 0;
      for (const e of k.npcs) if (!e.dead && roles.includes(T[e.type].role)) { e.order = order; n++; const m = k._ents && k._ents.get(e.uid); if (m && order === 'guard') { m.target = null; m.pgoal = null; } }
      return n;
    },
    interact(game, m) {
      const e = m.kentry, k = game.kingdom, ui = game.ui, cfg = m.cfg;
      if (!e || !k) return false;
      m.talkT = 3;
      const say = (line) => { ui.toast(KP.label(e), '「' + line + '」'); MC.Audio && MC.Audio.play(cfg.sound === 'horse' ? 'horse_say' : 'villager_yes', m.center(), 0.8, cfg.pitch || 1); };
      switch (cfg.role) {
        case 'builder': if (MC.KingdomUI) MC.KingdomUI.open(game, 'build'); break;
        case 'soldier': case 'knight': case 'archer':
          e.order = e.order === 'follow' ? 'guard' : 'follow';
          if (e.order === 'follow') say(pick(['お供します、陛下！', 'どこまでもお供いたします', '背中はお任せを！', '我が剣は陛下のために']));
          else { m.target = null; m.pgoal = null; say(pick(['持ち場に戻ります', '承知しました。警備に戻ります'])); }
          break;
        case 'priest':
          if (game.player.health < game.player.maxHealth && (!m.blessT || k.t > m.blessT)) {
            m.blessT = k.t + 45;
            game.player.heal(game.player.maxHealth);
            if (game.particles) { const p = game.player.pos; game.particles.sparkle(p[0], p[1] + 0.8, p[2], 20, [1.2, 1.1, 0.6]); }
            say('神のご加護がありますように');
            MC.Audio && MC.Audio.play('levelup', null, 0.5, 1.3);
            break;
          }
          ui.openTrade(m); break;
        case 'farmer': case 'smith': case 'merchant': ui.openTrade(m); break;
        default: say(pick(MC.CITIZEN_LINES));
      }
      return true;
    },

    // ---- per frame: keep the people spawned around the king, bring back the fallen, run the raids
    update(game, k, dt) {
      const P = game.player, M = game.entities;
      if (!k._ents) k._ents = new Map();
      const d = Math.hypot(P.pos[0] - k.cx, P.pos[2] - k.cz), R = MC.Kingdom.radius(k);
      k._ensureT = (k._ensureT || 0) - dt;
      if (k._ensureT <= 0) {
        k._ensureT = 1;
        for (const [uid, m] of k._ents) if (m.removed) k._ents.delete(uid);
        if (d < R + 110) {
          for (const e of k.npcs) {
            if (e.dead) {
              if (k.t < e.dead) continue;
              e.dead = 0; e.hp = 0;
              if (KP.spawn(game, k, e, true) && game.ui && SOLDIER.has(T[e.type].role) && d < R) game.ui.toast(`新たな${T[e.type].name}が着任した`, KP.label(e));
              continue;
            }
            if (!k._ents.has(e.uid)) KP.spawn(game, k, e, false);
          }
        } else if (d > R + 150) {
          for (const [uid, m] of k._ents) {
            if (m.kentry.order === 'follow') continue;
            m.kentry.hp = m.health; m.removed = true; k._ents.delete(uid);
          }
        }
        // followers left behind in unloaded land catch up with the king
        for (const [, m] of k._ents) if (m.kentry.order === 'follow' && !m.dead && Math.hypot(m.pos[0] - P.pos[0], m.pos[2] - P.pos[2]) > 64 && P.onGround) teleport(m, M, P.pos, 3);
      }
      KP.raids(game, k, dt);
    },

    // ---------------------------------------------------------------- raids
    raids(game, k, dt) {
      const h = game.hours, prev = k.lastHours;
      k.lastHours = h;
      if (prev !== undefined && prev < 19 && h >= 19 && h - prev < 3) { k.dusks++; KP.maybeRaid(game, k); }
      if (k.raid) KP.raidTick(game, k, dt);
    },
    maybeRaid(game, k) {
      const S = game.settings, P = game.player;
      if (!S.kingdomRaids || S.difficulty === 0 || k.raid) return;
      if (Math.hypot(P.pos[0] - k.cx, P.pos[2] - k.cz) > MC.Kingdom.radius(k) + 60) return;
      if (k.dusks < 2) return;   // the first night belongs to the celebrations
      const freq = S.raidFreq === undefined ? 1 : S.raidFreq;
      const gap = k.dusks - k.lastRaid;
      if (k.lastRaid >= 0 && (gap < (freq === 2 ? 1 : 2) || Math.random() > [0.25, 0.45, 0.75][freq])) return;
      KP.startRaid(game, k);
    },
    startRaid(game, k) {
      const W = game.world, P = game.player;
      if (k.raid) return false;
      const key = Math.random() < 0.55 && MC.RAID_ARMIES[k.theme] ? k.theme : pick(Object.keys(MC.RAID_ARMIES));
      const army = MC.RAID_ARMIES[key];
      // the army grows with the kingdom, but stays within reach of its defenders
      const nb = k.buildings.filter((b) => b.done).length;
      const soldiers = k.npcs.filter((e) => !e.dead && SOLDIER.has(T[e.type].role)).length;
      const total = Math.max(4, Math.min(22, 4 + Math.round(nb * 0.8) + k.raidsWon, 3 + Math.round(soldiers * 1.4)));
      const R = Math.min(MC.Kingdom.radius(k) + 12, 150);
      let spot = null;
      for (let t = 0; t < 40 && !spot; t++) {
        const a = Math.random() * Math.PI * 2, rr = R + (t > 20 ? -12 : 0);
        const x = Math.round(k.cx + Math.cos(a) * rr), z = Math.round(k.cz + Math.sin(a) * rr);
        const c = W.getChunk(x >> 4, z >> 4);
        if (!c || !c.light) continue;
        const g = MC.Kingdom.groundAt(W, x, z);
        if (g.water || g.built || Math.hypot(x - P.pos[0], z - P.pos[2]) < 24) continue;
        spot = [x + 0.5, g.y + 1, z + 0.5, a];
      }
      if (!spot) return false;
      const ang = ((Math.round(spot[3] / (Math.PI / 4)) % 8) + 8) % 8;
      const dirName = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'][ang];
      const w1 = Math.ceil(total * 0.45), w2 = Math.ceil(total * 0.35);
      k.raid = { t: 0, name: army.name, types: army.types, total, spawned: 0, killed: 0, waves: [w1, w2, Math.max(0, total - w1 - w2)], wave: 0, nextT: 0, spot, dir: dirName, leader: total >= 10, alive: 0 };
      k.lastRaid = k.dusks;
      if (game.ui) game.ui.toast(`⚔ ${army.name}が${dirName}から攻めてきた！`, `敵軍 ${total}体 ― 兵士たちが迎撃に向かう`);
      if (MC.Audio) { MC.Audio.play('horn', null, 1); MC.Audio.play('bell', null, 0.7); }
      return true;
    },
    raidTick(game, k, dt) {
      const r = k.raid, M = game.entities, W = game.world, S = game.settings, P = game.player;
      r.t += dt;
      const end = (how) => {
        for (const e of M.list) if (e.raid && !e.removed) { if (how === 'retreat' && game.particles) game.particles.poof(e.pos[0], e.pos[1], e.pos[2], e.hw * 2, e.h); if (how === 'retreat') e.removed = true; }
        k.raid = null;
      };
      if (!S.kingdomRaids || S.difficulty === 0) { end('retreat'); return; }
      if (r.wave < r.waves.length && r.t >= r.nextT) {
        const n = r.waves[r.wave];
        const last = r.wave === r.waves.length - 1;
        for (let i = 0; i < n; i++) {
          const type = last && r.leader && i === 0 ? 'raid_warlord' : pick(r.types);
          for (let t = 0; t < 10; t++) {
            const x = Math.floor(r.spot[0] + (Math.random() - 0.5) * 10), z = Math.floor(r.spot[2] + (Math.random() - 0.5) * 10);
            let y = Math.floor(r.spot[1]) + 3, ok = false;
            for (let j = 0; j < 8; j++, y--) if (M._validSpawn(x, y, z, true)) { ok = true; break; }
            if (!ok) continue;
            M.spawnMob(type, x + 0.5, y, z + 0.5, { persistent: true, raid: true, noBurn: true, provoked: true, raidGoal: MC.Kingdom.meetingPoint(k).slice() });
            if (game.particles) game.particles.smoke(x + 0.5, y + 0.5, z + 0.5, 3, 1);
            r.spawned++;
            break;
          }
        }
        r.wave++; r.nextT = r.t + 16;
        if (r.wave > 1 && MC.Audio) MC.Audio.play('horn', null, 0.7, 1.1);
      }
      let alive = 0, fx = 0, fy = 0, fz = 0;
      for (const e of M.list) if (e.raid && !e.dead && !e.removed) { alive++; fx += e.pos[0]; fy += e.pos[1]; fz += e.pos[2]; }
      r.alive = alive;
      r.front = alive ? [fx / alive, fy / alive, fz / alive] : null;
      const far = Math.hypot(P.pos[0] - k.cx, P.pos[2] - k.cz) > MC.Kingdom.radius(k) + 140;
      if (r.wave >= r.waves.length && alive === 0) {
        k.raidsWon++;
        k.fame += 6 + r.total;
        end('won');
        if (game.ui) game.ui.toast('敵軍を撃退した！', `${k.name}の名声が高まった ― 戦利品を手に入れた`);
        if (MC.Audio) { MC.Audio.play('levelup', null, 1); MC.Audio.play('bell', null, 0.5, 1.2); }
        const drop = (key, a, b) => { const n = a + Math.floor(Math.random() * (b - a + 1)); if (n > 0) M.spawnItem(P.pos[0], P.pos[1] + 1.2, P.pos[2], MC.makeStack(MC.idOf(key), n)); };
        drop('emerald', 2, 4 + Math.floor(r.total / 5)); drop('iron_ingot', 2, 6); drop('gold_ingot', 0, 3); drop('arrow', 6, 16);
        if (game.particles) game.particles.sparkle(P.pos[0], P.pos[1] + 1, P.pos[2], 30, [1.3, 1.1, 0.4]);
      } else if (r.t > 420 || far) {
        end('retreat');
        if (game.ui && !far) game.ui.toast('敵軍は撤退していった', '王国は守られた');
      }
    },
  };

  // ---------------------------------------------------------------- entity manager hooks
  const EM = MC.EntityManager.prototype;
  EM.onAllyDeath = function (m) { KP.died(this.game, m); };
  EM.onRaiderDeath = function () { const k = this.game.kingdom; if (k && k.raid) k.raid.killed++; };
})();
