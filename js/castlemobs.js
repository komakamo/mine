'use strict';
// Castle mobs: the monsters of the five castles, their captains (mid bosses in the throne rooms) and lords
// (bosses in the arenas below), a spell-caster AI, a data-driven boss AI (melee, charge, ground slam,
// projectile volleys, summoning, teleport, frost / fire novas, enrage), magic bolts, and the garrison /
// boss spawning of each castle including the vault seal that breaks when the lord falls.
(function () {
  const T = MC.MOB_TYPES;
  const BOSS_LOOT = [['diamond', 3, 6], ['emerald', 6, 12], ['gold_ingot', 6, 10], ['golden_apple', 2, 3], ['life_crystal', 1, 1], ['healing_potion', 2, 3]];
  const MID_LOOT = [['diamond', 1, 3], ['emerald', 3, 6], ['gold_ingot', 3, 6], ['golden_apple', 1, 1], ['healing_potion', 1, 2]];

  Object.assign(T, {
    // ---- knights' castle
    undead_knight: { name: '亡霊騎士', hostile: true, hp: 30, w: 0.7, h: 2.0, eye: 1.74, speed: 2.5, dmg: 5, model: 'knight', held: 'iron_sword', kbResist: 0.4, armor: 0.2, sound: 'skeleton', pitch: 0.8 },
    knight_captain: { name: '亡霊騎士団長', hostile: true, boss: true, hp: 120, w: 0.85, h: 2.5, eye: 2.2, speed: 2.9, dmg: 7, model: 'knight', scale: 1.25, tint: [1.25, 1.02, 0.62],
      held: 'diamond_sword', kbResist: 0.75, armor: 0.2, sound: 'skeleton', pitch: 0.9, ai: 'boss', bossLoot: MID_LOOT,
      kit: { melee: true, abilities: [{ k: 'charge', cd: 7, dmg: 8 }, { k: 'summon', cd: 20, types: ['undead_knight'], n: 1 }] } },
    black_knight: { name: '黒騎士ヴァルガス', title: '堕ちた騎士団の長', hostile: true, boss: true, lord: true, hp: 230, w: 1.0, h: 3.0, eye: 2.65, speed: 3.0, dmg: 9, model: 'knight', scale: 1.5,
      tint: [0.3, 0.3, 0.38], glow: 0.02, held: 'holy_sword', kbResist: 0.9, armor: 0.25, sound: 'skeleton', pitch: 0.75, ai: 'boss', bossLoot: BOSS_LOOT,
      kit: { melee: true, rage: '黒騎士の剣が黒炎をまとった！', abilities: [
        { k: 'charge', cd: 6, dmg: 10 }, { k: 'slam', cd: 9, dmg: 8, r: 5.5 },
        { k: 'volley', cd: 8, rage: true, proj: 'shadow', n: 3, dmg: 6, speed: 18 }, { k: 'summon', cd: 22, rage: true, types: ['undead_knight', 'skeleton'], n: 2 }] } },
    // ---- necromancer's castle
    ghoul: { name: 'グール', hostile: true, hp: 22, w: 0.6, h: 1.95, eye: 1.7, speed: 3.4, dmg: 4, model: 'ghoul', sound: 'zombie', pitch: 1.35, onHit: { poison: 3 }, leap: true },
    cultist: { name: '死霊術の信徒', hostile: true, hp: 22, w: 0.6, h: 1.95, eye: 1.62, speed: 2.4, dmg: 2, model: 'cultist', ai: 'caster', sound: 'villager', pitch: 0.55,
      cast: { proj: 'shadow', n: 1, dmg: 4, speed: 15, cd: 2.8 } },
    dark_priest: { name: '闇の司祭', hostile: true, boss: true, hp: 110, w: 0.75, h: 2.35, eye: 1.95, speed: 2.6, dmg: 5, model: 'cultist', scale: 1.2, tint: [0.75, 0.55, 1.1],
      sound: 'villager', pitch: 0.8, ai: 'boss', bossLoot: MID_LOOT,
      kit: { keep: 7, abilities: [{ k: 'volley', cd: 3, proj: 'shadow', n: 2, dmg: 5, speed: 16 }, { k: 'summon', cd: 16, types: ['ghoul'], n: 2 }, { k: 'blink', cd: 9 }] } },
    necromancer: { name: '死霊王ザルヴォス', title: '呪われた城の主', hostile: true, boss: true, lord: true, hp: 200, w: 0.8, h: 2.7, eye: 2.3, speed: 2.7, dmg: 5, model: 'necromancer', scale: 1.35,
      held: 'necro_staff', sound: 'skeleton', pitch: 0.7, ai: 'boss', bossLoot: BOSS_LOOT,
      kit: { keep: 8, rage: '死霊王が禁術を解き放った！', abilities: [
        { k: 'volley', cd: 3.5, proj: 'shadow', n: 3, dmg: 6, speed: 17, homing: 1.5 }, { k: 'volley', cd: 6, proj: 'drain', n: 1, dmg: 7, speed: 14, homing: 2.5, drain: 8 },
        { k: 'summon', cd: 14, types: ['ghoul', 'skeleton', 'zombie'], n: 3 }, { k: 'blink', cd: 7 }, { k: 'nova', cd: 12, rage: true, fx: 'poison', dmg: 5, r: 6 }] } },
    // ---- desert fortress
    mummy: { name: 'ミイラ', hostile: true, hp: 28, w: 0.6, h: 1.95, eye: 1.74, speed: 2.1, dmg: 4, model: 'mummy', sound: 'zombie', pitch: 0.8, onHit: { slow: 2.5 } },
    scorpion: { name: '大サソリ', hostile: true, hp: 18, w: 1.3, h: 0.9, eye: 0.6, speed: 3.3, dmg: 3, model: 'scorpion', sound: 'spider', short: true, onHit: { poison: 5 }, leap: true },
    tomb_warden: { name: '墓守の大ミイラ', hostile: true, boss: true, hp: 120, w: 0.85, h: 2.6, eye: 2.3, speed: 2.4, dmg: 7, model: 'mummy', scale: 1.35, tint: [0.95, 0.85, 0.65],
      sound: 'zombie', pitch: 0.7, kbResist: 0.7, ai: 'boss', bossLoot: MID_LOOT, onHit: { slow: 3 },
      kit: { melee: true, abilities: [{ k: 'slam', cd: 8, dmg: 6, r: 4.5, fx: 'slow' }, { k: 'summon', cd: 18, types: ['mummy', 'scorpion'], n: 2 }] } },
    sand_king: { name: '砂塵王アザルハン', title: '砂に眠る古の王', hostile: true, boss: true, lord: true, hp: 220, w: 0.9, h: 3.0, eye: 2.6, speed: 2.8, dmg: 8, model: 'pharaoh', scale: 1.5,
      held: 'sand_scepter', sound: 'zombie', pitch: 0.6, kbResist: 0.85, ai: 'boss', bossLoot: BOSS_LOOT,
      kit: { melee: true, rage: '砂塵王が砂嵐を巻き起こした！', abilities: [
        { k: 'volley', cd: 4, proj: 'sand', n: 5, dmg: 5, speed: 18, spread: 0.16 }, { k: 'summon', cd: 15, types: ['mummy', 'scorpion', 'scorpion'], n: 3 },
        { k: 'nova', cd: 11, fx: 'slow', dmg: 6, r: 6.5 }, { k: 'blink', cd: 10, rage: true }] } },
    // ---- frost castle
    frozen_zombie: { name: '凍てついた亡者', hostile: true, hp: 26, w: 0.6, h: 1.95, eye: 1.74, speed: 2.2, dmg: 4, model: 'frozen', sound: 'zombie', pitch: 0.7, onHit: { slow: 3 } },
    frost_skeleton: { name: '氷の骸骨', hostile: true, hp: 20, w: 0.6, h: 1.99, eye: 1.74, speed: 2.6, ranged: true, model: 'skeleton', tint: [0.78, 0.93, 1.3], held: 'bow',
      arrowFx: { slow: 3 }, sound: 'skeleton', pitch: 1.1 },
    ice_knight: { name: '凍てつく騎士', hostile: true, boss: true, hp: 120, w: 0.85, h: 2.5, eye: 2.2, speed: 2.8, dmg: 7, model: 'knight', scale: 1.25, tint: [0.72, 0.95, 1.4],
      held: 'iron_sword', kbResist: 0.75, armor: 0.2, sound: 'skeleton', pitch: 1.2, ai: 'boss', bossLoot: MID_LOOT, onHit: { slow: 3 },
      kit: { melee: true, abilities: [{ k: 'charge', cd: 7, dmg: 8 }, { k: 'nova', cd: 10, fx: 'slow', dmg: 5, r: 5 }] } },
    frost_queen: { name: '氷の女王イスリア', title: '永久凍土の支配者', hostile: true, boss: true, lord: true, hp: 210, w: 0.8, h: 2.8, eye: 2.4, speed: 2.7, dmg: 6, model: 'frost_queen', scale: 1.4,
      held: 'ice_staff', sound: 'villager', pitch: 1.6, ai: 'boss', bossLoot: BOSS_LOOT, glow: 0.04,
      kit: { keep: 7, rage: '氷の女王の怒りが吹雪を呼んだ！', abilities: [
        { k: 'volley', cd: 3, proj: 'frost', n: 5, dmg: 5, speed: 20, spread: 0.12 }, { k: 'nova', cd: 9, fx: 'slow', dmg: 7, r: 6.5 },
        { k: 'summon', cd: 16, types: ['frost_skeleton', 'frozen_zombie'], n: 2 }, { k: 'blink', cd: 8 }] } },
    // ---- fire demon's castle
    flame_skeleton: { name: '炎の骸骨', hostile: true, hp: 24, w: 0.6, h: 1.99, eye: 1.74, speed: 2.6, ranged: true, model: 'skeleton', tint: [0.34, 0.28, 0.27], held: 'bow',
      arrowFx: { fire: 3 }, fireproof: true, sound: 'skeleton', pitch: 0.8 },
    magma_brute: { name: '溶岩の魔人兵', hostile: true, hp: 42, w: 0.95, h: 2.2, eye: 1.95, speed: 2.2, dmg: 6, model: 'brute', kbResist: 0.6, fireproof: true, onHit: { fire: 3 },
      sound: 'zombie', pitch: 0.5 },
    brute_chief: { name: '魔人兵長', hostile: true, boss: true, hp: 140, w: 1.2, h: 2.85, eye: 2.5, speed: 2.5, dmg: 9, model: 'brute', scale: 1.3, tint: [1.3, 0.95, 0.8],
      kbResist: 0.8, fireproof: true, onHit: { fire: 5 }, sound: 'zombie', pitch: 0.45, ai: 'boss', bossLoot: MID_LOOT,
      kit: { melee: true, abilities: [{ k: 'slam', cd: 8, dmg: 7, r: 5, fx: 'fire' }, { k: 'volley', cd: 6, proj: 'fireball', n: 1, dmg: 6, speed: 15 }] } },
    fire_demon: { name: '炎魔イフリート', title: '溶岩の底の魔王', hostile: true, boss: true, lord: true, hp: 270, w: 1.3, h: 3.4, eye: 3.0, speed: 2.8, dmg: 11, model: 'demon', scale: 1.6,
      held: 'demon_hammer', kbResist: 0.95, fireproof: true, onHit: { fire: 5 }, sound: 'zombie', pitch: 0.4, ai: 'boss', bossLoot: BOSS_LOOT, glow: 0.03,
      kit: { melee: true, rage: '炎魔イフリートが灼熱の翼を広げた！', abilities: [
        { k: 'volley', cd: 5, proj: 'fireball', n: 1, rageN: 3, dmg: 8, speed: 16, spread: 0.2 }, { k: 'slam', cd: 8, dmg: 10, r: 5.5, fx: 'fire' },
        { k: 'charge', cd: 9, dmg: 11 }, { k: 'nova', cd: 12, rage: true, fx: 'fire', dmg: 8, r: 7 }, { k: 'summon', cd: 20, types: ['flame_skeleton', 'magma_brute'], n: 2 }] } },
  });

  // ---------------------------------------------------------------- magic bolts
  const BOLTS = {
    shadow: { block: 'obsidian', tint: [1.0, 0.55, 1.6], emit: 0.9, rgb: [0.8, 0.4, 1.3], size: 0.3 },
    drain: { block: 'obsidian', tint: [1.6, 0.35, 0.45], emit: 0.9, rgb: [1.3, 0.3, 0.4], size: 0.34 },
    soul: { block: 'diamond_block', tint: [0.7, 1.3, 0.9], emit: 1.0, rgb: [0.5, 1.3, 0.8], size: 0.3 },
    frost: { block: 'packed_ice', tint: [0.85, 1.1, 1.4], emit: 0.6, rgb: [0.6, 0.95, 1.3], size: 0.26, fx: { slow: 3 } },
    sand: { block: 'sandstone', tint: [1.2, 1.0, 0.7], emit: 0.25, rgb: [1.1, 0.9, 0.5], size: 0.28 },
    fireball: { block: 'magma_block', tint: [1.5, 1.0, 0.6], emit: 1.0, rgb: [1.4, 0.7, 0.2], size: 0.55, fx: { fire: 4 }, explode: 1.4 },
  };
  MC.BOLTS = BOLTS;
  MC.Bolt = class extends MC.Entity {
    constructor(x, y, z, vx, vy, vz, shooter, o) {
      super('bolt', x, y, z);
      this.vel = [vx, vy, vz];
      this.shooter = shooter;
      this.o = o;
      this.look = BOLTS[o.kind] || BOLTS.shadow;
      this.fromPlayer = shooter === 'player';
      this.pierce = o.pierce || 0;
      this.hits = new Set();
      this.hw = 0.15; this.h = 0.3;
      this.spin = Math.random() * 6;
    }
    update(dt, M) {
      this.age += dt; this.spin += dt * 9;
      if (this.age > (this.o.life || 4)) { this.burst(M); this.removed = true; return; }
      const v = this.vel, P = M.player;
      // homing towards the player (enemy spells)
      if (this.o.homing && !this.fromPlayer && P && !P.dead && this.age < 2.5) {
        const e = P.eyePos(), sp = Math.hypot(v[0], v[1], v[2]);
        const dx = e[0] - 0.3 - this.pos[0], dy = e[1] - 0.4 - this.pos[1], dz = e[2] - this.pos[2], l = Math.hypot(dx, dy, dz) || 1;
        const k = Math.min(1, dt * this.o.homing);
        v[0] += (dx / l * sp - v[0]) * k; v[1] += (dy / l * sp - v[1]) * k; v[2] += (dz / l * sp - v[2]) * k;
      }
      const sp = Math.hypot(v[0], v[1], v[2]) || 1, len = sp * dt, dir = [v[0] / sp, v[1] / sp, v[2] / sp];
      const p0 = this.pos;
      const hitB = M.raycastBlocks(p0, dir, len);
      const maxD = hitB ? hitB.t : len;
      if (this.fromPlayer) {
        let best = null;
        for (const e of M.list) {
          if (e.kind !== 'mob' || e.dead || this.hits.has(e) || !e.cfg.hostile) continue;
          const t = MC.rayBox(p0, dir, e.pos[0] - e.hw - 0.15, e.pos[1] - 0.15, e.pos[2] - e.hw - 0.15, e.pos[0] + e.hw + 0.15, e.pos[1] + e.h + 0.15, e.pos[2] + e.hw + 0.15);
          if (t !== null && t <= maxD && (!best || t < best.t)) best = { e, t };
        }
        if (best) {
          this.hits.add(best.e);
          this.impact(M, best.e, dir);
          if (this.pierce-- <= 0) { this.removed = true; return; }
        }
      } else if (P && !P.dead) {
        const t = MC.rayBox(p0, dir, P.pos[0] - 0.4, P.pos[1], P.pos[2] - 0.4, P.pos[0] + 0.4, P.pos[1] + 1.9, P.pos[2] + 0.4);
        if (t !== null && t <= maxD) { this.pos = [p0[0] + dir[0] * t, p0[1] + dir[1] * t, p0[2] + dir[2] * t]; this.impact(M, P, dir); this.removed = true; return; }
      }
      if (hitB) { this.pos = [p0[0] + dir[0] * hitB.t, p0[1] + dir[1] * hitB.t, p0[2] + dir[2] * hitB.t]; this.burst(M); this.removed = true; return; }
      this.pos = [p0[0] + v[0] * dt, p0[1] + v[1] * dt, p0[2] + v[2] * dt];
      if (M.particles && this.look.trail !== false && Math.random() < dt * 45) {
        const L = this.look;
        M.particles.add({ x: this.pos[0], y: this.pos[1], z: this.pos[2], vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
          life: 0.35 + Math.random() * 0.3, size: L.size * 0.35, tile: MC.TILE.particle_crit, rgb: L.rgb, emit: 1, emitFade: true, fullbright: true, shrink: 0.8 });
        if (this.o.kind === 'fireball') M.particles.flame(this.pos[0], this.pos[1], this.pos[2], 1.6);
      }
    }
    impact(M, e, dir) {
      const o = this.o, L = this.look;
      if (L.explode) { this.burst(M); return; }
      if (e === M.player) {
        if (e.hurt(o.dmg, o.src || 'magic', dir[0], dir[2])) {
          const fx = o.fx || L.fx;
          if (fx && e.addEffects) e.addEffects(fx);
          if (o.drain && this.shooter && !this.shooter.dead) {
            this.shooter.health = Math.min(this.shooter.maxHealth, this.shooter.health + o.drain);
            if (M.particles) { const c = this.shooter.center(); M.particles.sparkle(c[0], c[1], c[2], 10, [1.3, 0.3, 0.4]); }
          }
        }
      } else {
        e.hurt(o.dmg, 'player', M, dir[0], dir[2]);
        if (o.kind === 'soul' && M.particles) { const c = e.center(); M.particles.sparkle(c[0], c[1], c[2], 8, L.rgb); }
      }
      this.burst(M, true);
    }
    burst(M, small) {
      const L = this.look, p = this.pos;
      if (L.explode) {
        // fiery blast: damage with falloff, knockback and burning (never breaks blocks)
        const P = M.player, r = L.explode * 2.2;
        if (P && !P.dead) {
          const dx = P.pos[0] - p[0], dy = P.pos[1] + 0.9 - p[1], dz = P.pos[2] - p[2], d = Math.hypot(dx, dy, dz);
          if (d < r && P.hurt(Math.max(1, Math.round(this.o.dmg * (1 - d / (r * 1.3)))), this.o.src || 'magic', dx * 3, dz * 3)) {
            P.vel[1] = Math.max(P.vel[1], 5);
            if (P.addEffects) P.addEffects(L.fx);
          }
          if (M.game.shake !== undefined) M.game.shake = Math.max(M.game.shake, MC.clamp(0.8 - d / 16, 0, 0.6));
        }
        if (M.particles) { M.particles.explosion(p[0], p[1], p[2], 1); for (let i = 0; i < 6; i++) M.particles.flame(p[0] + (Math.random() - 0.5), p[1] + Math.random() * 0.5, p[2] + (Math.random() - 0.5), 2); }
        M.sound('explode', p, 0.9, 1.3);
        return;
      }
      if (M.particles) M.particles.sparkle(p[0], p[1] - 0.3, p[2], small ? 6 : 10, L.rgb);
      if (this.o.kind === 'frost') M.sound('freeze', p, 0.6, 1.2);
    }
  };
  MC.renderBolt = function (batch, e, W) {
    const L = e.look;
    batch.setLight(W, e.pos[0], e.pos[1], e.pos[2]);
    batch.light[1] = 1;
    batch.setTint(L.tint[0], L.tint[1], L.tint[2], L.emit);
    const model = MC.ItemModels.get(L.item ? MC.ITEM[L.item] : MC.BLOCK[L.block]);
    if (L.flat) {
      // a spinning throwing star, lying in its flight plane
      const v = e.vel, m = batch.base(e.pos[0], e.pos[1], e.pos[2]);
      MC.Mx.ry(m, Math.atan2(v[0], v[2]));
      MC.Mx.rx(m, Math.PI / 2 - Math.atan2(v[1], Math.hypot(v[0], v[2])));
      MC.Mx.rz(m, e.spin * 3);
      MC.Mx.sc(m, L.size / 16);
      MC.Mx.tr(m, -8, -8, -8);
      batch.model(m, model);
      batch.setTint(1, 1, 1, 0);
      return;
    }
    for (let k = 0; k < 2; k++) {
      const m = batch.base(e.pos[0], e.pos[1], e.pos[2]);
      MC.Mx.ry(m, e.spin * (k ? -1.3 : 1)); MC.Mx.rx(m, e.spin * 0.7 + k); MC.Mx.rz(m, k * 0.8);
      MC.Mx.sc(m, L.size * (k ? 0.7 : 1) / 16);
      MC.Mx.tr(m, -8, -8, -8);
      batch.model(m, model);
    }
    batch.setTint(1, 1, 1, 0);
  };
  MC.EntityManager.prototype.spawnBolt = function (x, y, z, vx, vy, vz, shooter, o) { return this.add(new MC.Bolt(x, y, z, vx, vy, vz, shooter, o)); };

  // ---------------------------------------------------------------- AI helpers
  // shared target acquisition; returns false (and wanders) when there is no target
  function acquire(mob, dt, M, sense = 16) {
    const P = M.player;
    const valid = P && !P.dead && !P.creative && M.difficulty() > 0;
    const dist = valid ? Math.hypot(P.pos[0] - mob.pos[0], P.pos[1] - mob.pos[1], P.pos[2] - mob.pos[2]) : 1e9;
    if (mob.target && (!valid || dist > 32)) { mob.target = null; mob.path = null; }
    mob.senseT -= dt;
    if (!mob.target && valid && dist < sense && mob.senseT <= 0) {
      mob.senseT = 0.4;
      const pe = P.eyePos();
      if (mob.canSee(M, pe[0], pe[1], pe[2]) || mob.provoked) { mob.target = P; mob.path = null; }
    }
    return !!mob.target;
  }
  // fire n projectiles of a spell / arrow volley at the player
  function volley(mob, M, a, rage) {
    const P = M.player, e = mob.eye(), pe = P.eyePos();
    const n = rage && a.rageN ? a.rageN : a.n || 1, spd = a.speed || 18, spread = a.spread || 0.12;
    const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1;
    for (let i = 0; i < n; i++) {
      const s = (i - (n - 1) / 2) * spread;
      let vx = pe[0] - e[0], vy = pe[1] - 0.45 - e[1], vz = pe[2] - e[2];
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l; vy /= l; vz /= l;
      const cs = Math.cos(s), sn = Math.sin(s);
      const rx = vx * cs - vz * sn, rz = vx * sn + vz * cs;
      if (a.proj === 'arrow') {
        const t = Math.hypot(pe[0] - e[0], pe[2] - e[2]) / spd;
        M.spawnArrow(e[0] + rx * 0.8, e[1] + vy * 0.8 - 0.2, e[2] + rz * 0.8, rx * spd, (vy + 10 * t * t / spd) * spd, rz * spd, mob, Math.round(a.dmg * mul));
      } else {
        M.spawnBolt(e[0] + rx * 0.9, e[1] + vy * 0.9 - 0.25, e[2] + rz * 0.9, rx * spd, vy * spd, rz * spd, mob,
          { kind: a.proj, dmg: Math.max(1, Math.round(a.dmg * mul)), homing: a.homing, drain: a.drain, src: mob.type });
      }
    }
    M.sound(a.proj === 'arrow' ? 'bow' : 'magic', mob.center(), 1, a.proj === 'fireball' ? 0.6 : 1);
  }
  function summon(mob, M, a) {
    const W = M.world;
    const alive = M.count((e) => e.kind === 'mob' && e.summoner === mob && !e.dead && !e.removed);
    let n = Math.min(a.n || 2, 6 - alive);
    for (let tries = 0; tries < 24 && n > 0; tries++) {
      const ang = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3.5;
      const x = Math.floor(mob.pos[0] + Math.cos(ang) * r), z = Math.floor(mob.pos[2] + Math.sin(ang) * r);
      for (let dy = 2; dy >= -2; dy--) {
        const y = Math.floor(mob.pos[1]) + dy;
        if (MC.B_SOLID[W.getBlock(x, y - 1, z)] && !MC.B_SOLID[W.getBlock(x, y, z)] && !MC.B_SOLID[W.getBlock(x, y + 1, z)] && !MC.B_FLUID[W.getBlock(x, y, z)]) {
          const type = a.types[Math.floor(Math.random() * a.types.length)];
          const m = M.spawnMob(type, x + 0.5, y, z + 0.5, { persistent: true, summoner: mob, castleId: mob.castleId, noBurn: true });
          m.target = M.player; m.provoked = true;
          if (M.particles) { M.particles.poof(x + 0.5, y, z + 0.5, 1, 2); M.particles.sparkle(x + 0.5, y + 0.5, z + 0.5, 10, [0.8, 0.5, 1.2]); }
          n--;
          break;
        }
      }
    }
    M.sound('summon', mob.center(), 1, 0.8);
  }
  function blink(mob, M) {
    const W = M.world, P = M.player, home = mob.home || mob.pos;
    for (let tries = 0; tries < 20; tries++) {
      const ang = Math.random() * Math.PI * 2, r = 5 + Math.random() * 4;
      const x = Math.floor(P.pos[0] + Math.cos(ang) * r), z = Math.floor(P.pos[2] + Math.sin(ang) * r);
      if (Math.hypot(x - home[0], z - home[2]) > 12) continue;
      const need = Math.ceil(mob.h);
      for (let dy = 2; dy >= -2; dy--) {
        const y = Math.floor(P.pos[1]) + dy;
        if (!MC.B_SOLID[W.getBlock(x, y - 1, z)]) continue;
        let free = true;
        for (let k = 0; k < need && free; k++) if (MC.B_SOLID[W.getBlock(x, y + k, z)] || MC.B_FLUID[W.getBlock(x, y + k, z)]) free = false;
        if (!free) continue;
        if (M.particles) { M.particles.poof(mob.pos[0], mob.pos[1], mob.pos[2], mob.hw * 2, mob.h); M.particles.sparkle(mob.pos[0], mob.pos[1] + 1, mob.pos[2], 12, [0.8, 0.5, 1.3]); }
        mob.pos = [x + 0.5, y, z + 0.5]; mob.vel = [0, 0, 0]; mob.path = null; mob.fallY = y;
        if (M.particles) M.particles.poof(x + 0.5, y, z + 0.5, mob.hw * 2, mob.h);
        M.sound('magic', mob.center(), 1, 0.6);
        return true;
      }
    }
    return false;
  }
  // area attack around (x, y, z): damage + effect + knockback on the player within r
  function blast(mob, M, x, y, z, r, dmg, fx, rgb) {
    const P = M.player;
    if (M.particles) {
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2;
        M.particles.add({ x: x + Math.cos(a) * 0.8, y: y + 0.2, z: z + Math.sin(a) * 0.8, vx: Math.cos(a) * r * 2.2, vy: 0.6, vz: Math.sin(a) * r * 2.2, drag: 0.2,
          life: 0.55, size: 0.14, tile: fx === 'fire' ? MC.TILE.particle_flame : MC.TILE.particle_crit, rgb, emit: 1, emitFade: true, fullbright: true });
      }
    }
    if (!P || P.dead) return;
    const dx = P.pos[0] - x, dz = P.pos[2] - z, d = Math.hypot(dx, dz);
    if (d > r || Math.abs(P.pos[1] - y) > 3) return;
    const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1;
    const k = 1 - d / (r * 1.4);
    if (P.hurt(Math.max(1, Math.round(dmg * mul * k)), mob.type, dx * 2, dz * 2)) {
      P.vel[1] = Math.max(P.vel[1], 7);
      if (fx && P.addEffects) P.addEffects(fx === 'slow' ? { slow: 4 } : fx === 'fire' ? { fire: 4 } : fx === 'poison' ? { poison: 5 } : {});
    }
  }

  MC.MOB_AI = {
    // ---- spell caster: keeps its distance and throws bolts
    caster(dt, M) {
      const c = this.cfg, cast = c.cast;
      if (!acquire(this, dt, M)) { this.aim = false; this.aimT = 0; this.wander(dt, M, 8, 0.7, 0.2); return; }
      const P = M.player, pe = P.eyePos();
      this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
      const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      const see = this.canSee(M, pe[0], pe[1], pe[2]);
      if (see && hd < 18) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 1.5 + Math.random() * 2; this.strafe = -this.strafe; }
        const dx = (P.pos[0] - this.pos[0]) / hd, dz = (P.pos[2] - this.pos[2]) / hd;
        let mx = -dz * this.strafe * 0.5, mz = dx * this.strafe * 0.5;
        if (hd < 6) { mx -= dx; mz -= dz; } else if (hd > 11) { mx += dx; mz += dz; }
        const l = Math.hypot(mx, mz) || 1;
        this.moveX = mx / l; this.moveZ = mz / l; this.speedMul = 0.75;
        this.yaw = Math.atan2(dx, -dz);
        if (this.attackCD <= 0) {
          this.aim = true; this.aimT += dt;
          if (M.particles && Math.random() < dt * 20) { const e = this.eye(); M.particles.sparkle(e[0], e[1] - 0.2, e[2], 1, (BOLTS[cast.proj] || BOLTS.shadow).rgb); }
          if (this.aimT > 0.9) { this.aimT = 0; this.aim = false; this.attackCD = cast.cd + Math.random(); volley(this, M, cast, false); }
        }
      } else {
        this.aim = false; this.aimT = 0;
        this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt);
      }
    },

    // ---- data driven boss / captain
    boss(dt, M) {
      const c = this.cfg, kit = c.kit, P = M.player;
      const valid = P && !P.dead && !P.creative && M.difficulty() > 0;
      if (!this.cds) { this.cds = kit.abilities.map((a) => a.cd * (0.35 + Math.random() * 0.4)); this.act = null; }
      if (!valid) { this.stop(); this.aim = false; this.act = null; return; }
      const pe = P.eyePos();
      const dist = Math.hypot(P.pos[0] - this.pos[0], P.pos[1] - this.pos[1], P.pos[2] - this.pos[2]);
      const home = this.home || this.pos;
      if (dist > 36) { this.act = null; this.aim = false; if (Math.hypot(this.pos[0] - home[0], this.pos[2] - home[2]) > 2) this.navigate(M, home[0], home[1], home[2], 1, dt, 1); else this.stop(); return; }
      this.target = P;
      const rage = this.health < this.maxHealth * 0.5;
      if (rage && !this.enraged) {
        this.enraged = true;
        if (kit.rage && M.game.ui) M.game.ui.toast(kit.rage);
        M.sound('roar', this.center(), 1.2, c.pitch || 1);
        if (M.particles) M.particles.explosion(this.pos[0], this.pos[1] + this.h * 0.5, this.pos[2], 1);
        if (M.game.shake !== undefined) M.game.shake = Math.max(M.game.shake, 0.5);
      }
      const hd = Math.hypot(P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
      const cdMul = rage ? 1.45 : 1;
      for (let i = 0; i < this.cds.length; i++) this.cds[i] -= dt * cdMul;
      // ongoing action
      const act = this.act;
      if (act) {
        act.t += dt;
        const a = act.a;
        if (act.phase === 'wind') {
          this.stop(); this.aim = true;
          this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
          this.yaw = Math.atan2(P.pos[0] - this.pos[0], -(P.pos[2] - this.pos[2]));
          if (M.particles && Math.random() < dt * 30) M.particles.sparkle(this.pos[0], this.pos[1] + this.h * 0.8, this.pos[2], 1, a.k === 'charge' ? [1.3, 0.4, 0.3] : [0.9, 0.6, 1.3]);
          if (act.t < (a.k === 'summon' ? 1.0 : a.k === 'charge' ? 0.55 : 0.7)) return;
          this.aim = false;
          act.t = 0;
          switch (a.k) {
            case 'volley': if (this.canSee(M, pe[0], pe[1], pe[2])) volley(this, M, a, rage); this.act = null; return;
            case 'summon': summon(this, M, a); this.act = null; return;
            case 'blink': blink(this, M); this.act = null; return;
            case 'nova': {
              const cc = this.pos;
              blast(this, M, cc[0], cc[1], cc[2], a.r || 6, a.dmg, a.fx, a.fx === 'fire' ? [1.4, 0.7, 0.2] : a.fx === 'poison' ? [0.5, 1.2, 0.4] : [0.6, 0.95, 1.4]);
              M.sound(a.fx === 'fire' ? 'explode' : 'freeze', cc, 1, 0.7);
              this.act = null; return;
            }
            case 'charge': {
              const dx = P.pos[0] - this.pos[0], dz = P.pos[2] - this.pos[2], l = Math.hypot(dx, dz) || 1;
              act.dir = [dx / l, dz / l]; act.phase = 'dash';
              M.sound('roar', this.center(), 0.8, (c.pitch || 1) * 1.3);
              return;
            }
            case 'slam':
              this.vel[1] = 10; act.phase = 'air'; act.left = false;
              return;
          }
        } else if (act.phase === 'dash') {
          this.moveX = act.dir[0]; this.moveZ = act.dir[1]; this.speedMul = 4.2;
          this.yaw = Math.atan2(act.dir[0], -act.dir[1]);
          this.attackAnim = 1;
          if (M.particles && Math.random() < dt * 30) M.particles.smoke(this.pos[0], this.pos[1] + 0.2, this.pos[2], 1, 0.8);
          if (hd < this.hw + 1.1 && Math.abs(P.pos[1] - this.pos[1]) < 2.5) {
            const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1;
            if (P.hurt(Math.max(1, Math.round(a.dmg * mul)), this.type, act.dir[0] * 3, act.dir[1] * 3)) { P.vel[1] = Math.max(P.vel[1], 7); if (c.onHit && P.addEffects) P.addEffects(c.onHit); }
            M.sound('attack', this.center(), 1, 0.5);
            this.act = null; this.stop(); return;
          }
          if (act.t > 0.75 || this.hitX || this.hitZ) { this.act = null; this.stop(); }
          return;
        } else if (act.phase === 'air') {
          this.stop();
          if (act.t > 0.15 && this.onGround) {
            blast(this, M, this.pos[0], this.pos[1], this.pos[2], a.r || 5, a.dmg, a.fx, a.fx === 'fire' ? [1.4, 0.7, 0.2] : [0.9, 0.85, 0.7]);
            M.sound('slam', this.pos, 1.2, 0.8);
            if (M.particles) M.particles.explosion(this.pos[0], this.pos[1] + 0.3, this.pos[2], 0.8);
            if (M.game.shake !== undefined) M.game.shake = Math.max(M.game.shake, 0.7);
            this.act = null;
          } else if (act.t > 2) this.act = null;
          return;
        }
      }
      this.lookAt(pe[0], pe[1] - 0.2, pe[2]);
      // pick an ability that is ready
      const see = this.canSee(M, pe[0], pe[1], pe[2]);
      for (let i = 0; i < kit.abilities.length; i++) {
        const a = kit.abilities[i];
        if (this.cds[i] > 0 || (a.rage && !rage)) continue;
        let ok = true;
        if (a.k === 'volley') ok = see && hd > 2.5 && hd < 26;
        else if (a.k === 'charge') ok = see && hd > 4 && hd < 16 && Math.abs(P.pos[1] - this.pos[1]) < 2;
        else if (a.k === 'slam') ok = hd < (a.r || 5) + 1 && this.onGround;
        else if (a.k === 'nova') ok = hd < (a.r || 6);
        else if (a.k === 'blink') ok = hd < 5 || !see;
        if (!ok) continue;
        this.cds[i] = a.cd * (0.85 + Math.random() * 0.3);
        this.act = { a, t: 0, phase: 'wind' };
        this.stop();
        return;
      }
      // default: melee brawler closes in, caster keeps its distance
      if (kit.keep) {
        if (see && hd < kit.keep - 2) { const l = hd || 1; this.moveX = -(P.pos[0] - this.pos[0]) / l; this.moveZ = -(P.pos[2] - this.pos[2]) / l; this.speedMul = 0.9; }
        else if (!see || hd > kit.keep + 4) this.navigate(M, P.pos[0], P.pos[1], P.pos[2], 1, dt, 0.8);
        else this.stop();
        if (hd < this.hw + 1.4 && this.attackCD <= 0 && Math.abs(P.pos[1] - this.pos[1]) < 2.5) {
          this.attackCD = 1.2; this.attackAnim = 1;
          const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1;
          P.hurt(Math.max(1, Math.round(c.dmg * mul)), this.type, P.pos[0] - this.pos[0], P.pos[2] - this.pos[2]);
        }
        if (this.home && Math.hypot(this.pos[0] - this.home[0], this.pos[2] - this.home[2]) > 13) this.navigate(M, this.home[0], this.home[1], this.home[2], 1.1, dt, 1);
        return;
      }
      const reach = this.hw + 1.3;
      if (hd < reach && Math.abs(P.pos[1] - this.pos[1]) < 2.8) {
        this.steer(P.pos[0], P.pos[2], 0.4);
        if (this.attackCD <= 0) {
          this.attackCD = rage ? 0.85 : 1.2; this.attackAnim = 1;
          const mul = [0, 0.6, 1, 1.4][M.difficulty()] || 1;
          if (P.hurt(Math.max(1, Math.round(c.dmg * mul)), this.type, (P.pos[0] - this.pos[0]) * 1.6, (P.pos[2] - this.pos[2]) * 1.6) && c.onHit && P.addEffects) P.addEffects(c.onHit);
          M.sound('attack', this.center(), 1, 0.6);
        }
        return;
      }
      // stay in the arena / throne room
      if (this.home && Math.hypot(P.pos[0] - this.home[0], P.pos[2] - this.home[2]) > 15) {
        if (Math.hypot(this.pos[0] - this.home[0], this.pos[2] - this.home[2]) > 2) this.navigate(M, this.home[0], this.home[1], this.home[2], 1, dt, 1);
        else this.stop();
        return;
      }
      this.navigate(M, P.pos[0], P.pos[1], P.pos[2], rage ? 1.25 : 1.05, dt, 0.6);
    },
  };

  // ---------------------------------------------------------------- castle garrisons & lords
  const EM = MC.EntityManager.prototype;
  EM._spawnCastles = function () {
    const P = this.player, W = this.world, Str = MC.Structures;
    if (!P || !Str.castlesAround) return;
    if (!this.castleState) this.castleState = new Map();
    // forget castles the player has left far behind (their garrison respawns on the next visit)
    for (const [id, st] of this.castleState) {
      if (Math.hypot(st.x - P.pos[0], st.z - P.pos[2]) < 230) continue;
      for (const e of this.list) if (e.castleId === id) e.removed = true;
      this.castleState.delete(id);
    }
    if (this.difficulty() === 0) return;
    const loaded = (x, z) => { const c = W.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4); return c && c.light; };
    for (const site of Str.castlesAround(W.gen, P.pos[0], P.pos[2], 60)) {
      const plan = Str.castlePlan(W.gen, site);
      // a castle whose lord has fallen is conquered: no garrison, the captain has surrendered
      const conquered = W.bossesDefeated.has(site.id + '/boss');
      let st = this.castleState.get(plan.id);
      if (!st) { st = { x: plan.x, z: plan.z, groups: new Set() }; this.castleState.set(plan.id, st); }
      // garrison groups: spawned once the player comes close to that part of the castle
      for (const g of plan.groups) {
        if (conquered || st.groups.has(g.name)) continue;
        if (Math.hypot(g.at[0] - P.pos[0], g.at[2] - P.pos[2]) > g.rad || Math.abs(g.at[1] - P.pos[1]) > g.dy) continue;
        if (!g.mobs.every((m) => loaded(m[0], m[2]))) continue;
        st.groups.add(g.name);
        for (const [x, y, z, type] of g.mobs) {
          if (Math.hypot(x - P.pos[0], y - P.pos[1], z - P.pos[2]) < 5) continue;
          const m = this.spawnMob(type, x, y, z, { persistent: true, castleId: plan.id, noBurn: true });
          m.yaw = Math.random() * Math.PI * 2;
        }
      }
      // captains and lords
      for (const bd of plan.bosses) {
        const defeated = W.bossesDefeated.has(bd.id);
        if (defeated) { if (bd.seal) this._breakSeal(bd.seal, false); continue; }
        if (conquered) continue;
        if (this.list.some((e) => e.bossId === bd.id && !e.removed)) continue;
        const [bx, by, bz] = bd.pos;
        if (Math.hypot(bx - P.pos[0], bz - P.pos[2]) > bd.r || Math.abs(by - P.pos[1]) > bd.dy || !loaded(bx, bz)) continue;
        const cfg = MC.MOB_TYPES[bd.type];
        const m = this.spawnMob(bd.type, bx, by, bz, { persistent: true, bossId: bd.id, castleId: plan.id, home: [bx, by, bz], seal: bd.seal || null });
        m.yaw = Math.atan2(P.pos[0] - bx, -(P.pos[2] - bz));
        m.onDefeat = (EMgr, mob) => EMgr._lordDefeated(mob);
        if (this.particles) { this.particles.poof(bx, by, bz, 1.4, cfg.h); this.particles.explosion(bx, by + cfg.h * 0.5, bz, 1); }
        this.sound(cfg.lord ? 'roar' : 'explode', [bx, by, bz], 1, cfg.lord ? (cfg.pitch || 1) : 0.7);
        if (this.game.ui) this.game.ui.toast(cfg.name + (cfg.lord ? 'が目覚めた！' : 'が立ちはだかる！'), cfg.title || (cfg.lord ? '' : '倒すと城主の間への道が開ける'));
        if (this.game.shake !== undefined && cfg.lord) this.game.shake = Math.max(this.game.shake, 0.6);
      }
    }
  };
  // the lord has fallen: the rest of the garrison flees, the cages fall silent, the castle is the king's
  EM._conquer = function (id) {
    for (const e of this.list) {
      if (e.kind !== 'mob' || e.castleId !== id || e.dead || e.removed || !e.cfg.hostile || e.cfg.lord) continue;
      if (this.particles) this.particles.poof(e.pos[0], e.pos[1], e.pos[2], e.hw * 2, e.h);
      e.removed = true;
    }
    for (const s of this.world.spawners.values()) s.pacified = undefined;
    if (MC.Kingdom && MC.Kingdom.onConquer) MC.Kingdom.onConquer(this.game, id);
  };
  EM._breakSeal = function (seal, fx) {
    const W = this.world;
    let broke = false;
    for (const [x, y, z] of seal) {
      if (W.getBlock(x, y, z) !== MC.BLOCK.seal_bars) continue;
      W.setBlock(x, y, z, 0);
      broke = true;
      if (fx && this.particles) this.particles.sparkle(x + 0.5, y, z + 0.5, 8, [1.2, 0.6, 1.4]);
    }
    if (broke && fx) this.sound('unseal', seal[4] || seal[0], 1.2, 1);
    return broke;
  };
  EM._lordDefeated = function (m) {
    const ui = this.game.ui;
    for (const e of this.list) if (e.summoner === m && !e.dead) e.hurt(999, 'magic', this);
    if (m.cfg.lord && m.castleId) this._conquer(m.castleId);
    if (m.seal && this._breakSeal(m.seal, true)) {
      if (ui) ui.toast(m.cfg.name + 'を討ち取った！', '封印が解け、宝物庫への道が開いた');
    } else if (ui) ui.toast(m.cfg.name + 'を倒した！', m.cfg.lord ? '城の財宝を手に入れよう' : '城主は地下の奥深くにいる');
  };
})();
