'use strict';
// Warriors of the Japanese castles: ashigaru with spears / bows / matchlocks, samurai and their elite
// hatamoto, ninja who throw shuriken and vanish in smoke, and the ochimusha haunting the ruined fort.
// Also: shuriken / bullet projectiles, each castle's garrison (spawned part by part as the player
// approaches, like the medieval castles), and the capture: breaking the general's standard (大将の旗印)
// routs the garrison, silences the castle and hands over its heirloom. No kingdom is founded here.
(function () {
  const T = MC.MOB_TYPES;
  const human = { hostile: true, w: 0.6, h: 1.95, eye: 1.62, sound: 'villager', wajo: true };
  Object.assign(T, {
    ashigaru: { ...human, name: '足軽', hp: 22, speed: 2.6, dmg: 4, reach: 0.9, model: 'ashigaru', held: 'yari', pitch: 0.72 },
    yumi_ashigaru: { ...human, name: '弓足軽', hp: 18, speed: 2.5, ranged: true, arrowBonus: 1, model: 'ashigaru_bow', held: 'yumi', pitch: 0.78 },
    teppo_ashigaru: { ...human, name: '鉄砲足軽', hp: 18, speed: 2.3, model: 'ashigaru_bow', held: 'teppo', ai: 'teppo', pitch: 0.7,
      shot: { dmg: 7, speed: 70, cd: 4.5, aim: 1.5, range: 26 } },
    samurai: { ...human, name: '侍', hp: 34, w: 0.7, h: 2.0, eye: 1.7, speed: 2.9, dmg: 6, armor: 0.25, kbResist: 0.3, model: 'samurai', held: 'katana', leap: true, pitch: 0.6 },
    hatamoto: { ...human, name: '旗本武者', hp: 60, w: 0.75, h: 2.1, eye: 1.8, speed: 3.0, dmg: 8, armor: 0.3, kbResist: 0.6, model: 'hatamoto', held: 'katana',
      leap: true, scale: 1.08, pitch: 0.5 },
    ninja: { ...human, name: '忍者', hp: 20, h: 1.9, speed: 3.9, dmg: 4, model: 'ninja', held: 'ninjato', ai: 'ninja', quiet: true, pitch: 1.1,
      throwCd: 2.6, star: { proj: 'shuriken', n: 3, dmg: 3, speed: 26, spread: 0.13 } },
    ochimusha: { ...human, name: '落ち武者', hp: 28, speed: 2.2, dmg: 5, model: 'ochimusha', held: 'katana', onHit: { slow: 2 }, tint: [0.82, 0.95, 1.08], glow: 0.03,
      sound: 'zombie', pitch: 0.75, armor: 0.1 },
  });

  // ---------------------------------------------------------------- projectiles
  Object.assign(MC.BOLTS, {
    shuriken: { item: 'shuriken', tint: [1, 1, 1], emit: 0, rgb: [0.75, 0.8, 0.9], size: 0.5, trail: false, flat: true },
    bullet: { block: 'coal_block', tint: [0.5, 0.45, 0.4], emit: 0.5, rgb: [1.2, 0.8, 0.4], size: 0.12, trail: false },
  });

  // ---------------------------------------------------------------- AI
  // the player is the target once seen (or once provoked)
  function acquire(mob, dt, M, sense = 18) {
    const P = M.player;
    const valid = P && !P.dead && !P.creative && M.difficulty() > 0;
    const dist = valid ? Math.hypot(P.pos[0] - mob.pos[0], P.pos[1] - mob.pos[1], P.pos[2] - mob.pos[2]) : 1e9;
    if (mob.target && (!valid || dist > 34)) { mob.target = null; mob.path = null; }
    mob.senseT -= dt;
    if (!mob.target && valid && dist < sense && mob.senseT <= 0) {
      mob.senseT = 0.4;
      const pe = P.eyePos();
      if (mob.canSee(M, pe[0], pe[1], pe[2]) || mob.provoked) { mob.target = P; mob.path = null; }
    }
    return !!mob.target;
  }
  function shoot(mob, M, a, spreadMul = 1) {
    const P = M.player, e = mob.eye(), pe = P.eyePos();
    const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1, n = a.n || 1;
    for (let i = 0; i < n; i++) {
      const s = (i - (n - 1) / 2) * (a.spread || 0) * spreadMul + (Math.random() - 0.5) * 0.03;
      let vx = pe[0] - e[0], vy = pe[1] - 0.4 - e[1], vz = pe[2] - e[2];
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      const cs = Math.cos(s), sn = Math.sin(s), rx = vx * cs - vz * sn, rz = vx * sn + vz * cs;
      M.spawnBolt(e[0] + rx * 0.8, e[1] + vy * 0.8 - 0.25, e[2] + rz * 0.8, rx * a.speed, vy * a.speed, rz * a.speed, mob,
        { kind: a.proj, dmg: Math.max(1, Math.round(a.dmg * mul)), src: mob.type, life: 3 });
    }
  }
  Object.assign(MC.MOB_AI, {
    // 鉄砲足軽: keeps its distance, takes a long careful aim (the match glows), then fires one deadly ball
    teppo(dt, M) {
      const c = this.cfg, sh = c.shot;
      if (!acquire(this, dt, M, 22)) { this.aim = false; this.aimT = 0; this.wander(dt, M, 6, 0.6, 0.15); return; }
      const P = M.player, pe = P.eyePos();
      this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
      const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      const see = this.canSee(M, pe[0], pe[1], pe[2]);
      if (see && hd < sh.range) {
        const dx = (P.pos[0] - this.pos[0]) / (hd || 1), dz = (P.pos[2] - this.pos[2]) / (hd || 1);
        if (hd < 6) { this.moveX = -dx; this.moveZ = -dz; this.speedMul = 0.9; this.aimT = Math.max(0, this.aimT - dt * 2); this.aim = false; }
        else {
          this.stop(); this.yaw = Math.atan2(dx, -dz);
          if (this.attackCD <= 0) {
            this.aim = true; this.aimT += dt;
            if (M.particles && Math.random() < dt * 12) { const e = this.eye(); M.particles.flame(e[0] + dx * 0.6, e[1] - 0.3, e[2] + dz * 0.6, 0.6); }
            if (this.aimT > sh.aim) {
              this.aimT = 0; this.aim = false; this.attackCD = sh.cd + Math.random() * 1.5;
              shoot(this, M, { proj: 'bullet', dmg: sh.dmg, speed: sh.speed });
              const e = this.eye();
              if (M.particles) { M.particles.smoke(e[0] + dx * 1.1, e[1] - 0.2, e[2] + dz * 1.1, 6, 0.9); M.particles.flame(e[0] + dx, e[1] - 0.2, e[2] + dz, 1.2); }
              M.sound('gunshot', this.center(), 1.2, 1);
            }
          }
        }
      } else {
        this.aim = false; this.aimT = 0;
        this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt);
      }
    },
    // 忍者: throws a fan of shuriken from range, closes in with the blade, vanishes in smoke when hurt
    ninja(dt, M) {
      const c = this.cfg;
      if (!acquire(this, dt, M, 20)) { this.aim = false; this.wander(dt, M, 9, 0.8, 0.2); return; }
      const P = M.player, pe = P.eyePos();
      this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
      const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]), dy = Math.abs(P.pos[1] - this.pos[1]);
      const see = this.canSee(M, pe[0], pe[1], pe[2]);
      this.throwT = (this.throwT === undefined ? 1 + Math.random() * 2 : this.throwT) - dt;
      // smoke bomb: blink behind the player once when badly hurt
      if (!this.smoked && this.health < this.maxHealth * 0.45) {
        this.smoked = true;
        const W = M.world;
        for (let t = 0; t < 12; t++) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3;
          const x = Math.floor(P.pos[0] + Math.cos(a) * r), z = Math.floor(P.pos[2] + Math.sin(a) * r), y = Math.floor(P.pos[1]);
          if (!MC.B_SOLID[W.getBlock(x, y - 1, z)] || MC.B_SOLID[W.getBlock(x, y, z)] || MC.B_SOLID[W.getBlock(x, y + 1, z)]) continue;
          if (M.particles) M.particles.smoke(this.pos[0], this.pos[1] + 1, this.pos[2], 14, 1.4);
          this.pos = [x + 0.5, y, z + 0.5]; this.vel = [0, 0, 0]; this.path = null; this.fallY = y;
          if (M.particles) M.particles.smoke(x + 0.5, y + 1, z + 0.5, 10, 1.2);
          M.sound('fizz', this.center(), 0.8, 0.7);
          break;
        }
      }
      if (hd < this.hw + 1.2 && dy < 1.6) {
        this.steer(P.pos[0], P.pos[2], 0.5);
        if (this.attackCD <= 0) {
          this.attackCD = 0.8; this.attackAnim = 1;
          const mul = [0, 0.5, 1, 1.5][M.difficulty()];
          P.hurt(Math.max(1, Math.round(c.dmg * mul)), this.type, P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
          M.sound('attack', this.center(), 0.8, 1.3);
        }
        return;
      }
      if (see && hd > 4 && hd < 16 && this.throwT <= 0) {
        this.throwT = c.throwCd + Math.random() * 1.5;
        this.attackAnim = 1; this.aim = true;
        shoot(this, M, c.star);
        M.sound('shuriken', this.center(), 0.9, 1);
        return;
      }
      this.aim = false;
      this.navigate(M, P.pos[0], P.pos[1], P.pos[2], hd > 8 ? 1.1 : 1, dt, 0.5);
      if (this.onGround && hd > 2.5 && hd < 7 && Math.random() < dt * 1.2) {
        const dx = (P.pos[0] - this.pos[0]) / hd, dz = (P.pos[2] - this.pos[2]) / hd;
        this.vel[0] = dx * 7; this.vel[2] = dz * 7; this.vel[1] = 6.5;
      }
    },
  });

  // ---------------------------------------------------------------- garrisons
  const EM = MC.EntityManager.prototype;
  const seized = (W, id) => W.bossesDefeated.has(id + '/seized');
  EM._spawnWajo = function () {
    const P = this.player, W = this.world, Str = MC.Structures;
    if (!P || !Str.wajoAround) return;
    if (!this.wajoState) this.wajoState = new Map();
    // castles left far behind are forgotten: their garrison returns on the next visit (unless captured)
    for (const [id, st] of this.wajoState) {
      if (Math.hypot(st.x - P.pos[0], st.z - P.pos[2]) < 240) continue;
      for (const e of this.list) if (e.wajoId === id) e.removed = true;
      this.wajoState.delete(id);
    }
    if (this.difficulty() === 0) return;
    const loaded = (x, z) => { const c = W.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4); return c && c.light; };
    for (const site of Str.wajoAround(W.gen, P.pos[0], P.pos[2], 40)) {
      if (seized(W, site.id)) continue;
      const plan = Str.wajoPlan(W.gen, site);
      let st = this.wajoState.get(plan.id);
      if (!st) { st = { x: plan.x, z: plan.z, groups: new Set() }; this.wajoState.set(plan.id, st); }
      for (const g of plan.groups) {
        if (st.groups.has(g.name)) continue;
        if (Math.hypot(g.at[0] - P.pos[0], g.at[2] - P.pos[2]) > g.rad || Math.abs(g.at[1] - P.pos[1]) > g.dy) continue;
        if (!g.mobs.every((m) => loaded(m[0], m[2]))) continue;
        st.groups.add(g.name);
        for (const [x, y, z, type] of g.mobs) {
          if (Math.hypot(x - P.pos[0], y - P.pos[1], z - P.pos[2]) < 4) continue;
          const m = this.spawnMob(type, x, y, z, { persistent: true, wajoId: plan.id, noBurn: true, robe: plan.clan });
          m.yaw = Math.random() * Math.PI * 2;
        }
      }
    }
  };
  // the standard has fallen: the garrison flees, the castle falls silent, the heirloom is handed over
  EM._seizeWajo = function (site, pos) {
    const W = this.world, ui = this.game.ui, kind = MC.WAJO_TYPES[site.kind];
    for (const e of this.list) {
      if (e.kind !== 'mob' || e.dead || e.removed || !e.cfg.hostile) continue;
      const inside = e.wajoId === site.id || (Math.abs(e.pos[0] - site.x) < site.R && Math.abs(e.pos[2] - site.z) < site.R && e.cfg.wajo);
      if (!inside) continue;
      if (this.particles) this.particles.poof(e.pos[0], e.pos[1], e.pos[2], e.hw * 2, e.h);
      e.removed = true;
    }
    const R = MC.WAJO_REWARD;
    const drop = (k, n) => this.spawnItem(pos[0], pos[1] + 0.5, pos[2], MC.makeStack(MC.idOf(k), n), [(Math.random() - 0.5) * 3, 4.5, (Math.random() - 0.5) * 3]);
    drop(R[site.kind], 1);
    for (const [k, a, b] of R.common) drop(k, a + Math.floor(Math.random() * (b - a + 1)));
    if (this.particles) { this.particles.explosion(pos[0], pos[1] + 0.5, pos[2], 0.8); this.particles.sparkle(pos[0], pos[1] + 1, pos[2], 40, [1.3, 1.0, 0.4]); }
    this.sound('horn', pos, 1.3, 0.8);
    this.sound('levelup', pos, 1, 1);
    if (this.game.shake !== undefined) this.game.shake = Math.max(this.game.shake, 0.4);
    if (ui) ui.toast(site.name + 'を制圧した！', `${kind.kind}の守りは崩れた ― 家宝「${MC.itemName(MC.idOf(R[site.kind]))}」を手に入れた`);
  };
  // standards and the capture they trigger (hooked into World.setBlock via the block's onRemove)
  MC.Wajo = {
    seized,
    bannerRemoved(W, x, y, z) {
      const Str = MC.Structures, site = Str.wajoAt && Str.wajoAt(W.gen, x, z, 0);
      if (!site || seized(W, site.id)) return;
      W.bossesDefeated.add(site.id + '/seized');
      W.editsDirty = true;
      for (const dy of [-1, 1]) if (MC.isBanner(W.getBlock(x, y + dy, z))) W.setBlock(x, y + dy, z, 0);
      if (W.entities) W.entities._seizeWajo(site, [x + 0.5, y, z + 0.5]);
    },
    // castle whose grounds contain (x, z) and that still resists / has been captured
    at(game, x, z, pad = 0) { const Str = MC.Structures; return Str.wajoAt ? Str.wajoAt(game.world.gen, x, z, pad) : null; },
  };
  for (const key of ['hatajirushi', 'hatajirushi_top']) for (let f = 0; f < 4; f++) MC.BLOCKS[MC.BLOCK[key] + f].onRemove = (W, x, y, z) => MC.Wajo.bannerRemoved(W, x, y, z);
})();
