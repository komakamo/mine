'use strict';
// Bootstrap, input handling and the main loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  // ?bg=1 drives the loop with timers so it keeps running while the page is hidden (automated previews)
  const BG = new URLSearchParams(location.search).has('bg');
  const schedule = (cb) => (BG ? setTimeout(() => cb(performance.now()), 16) : requestAnimationFrame(cb));
  const nextFrame = () => new Promise((r) => schedule(() => r()));
  const KEY = 'shadercraft.settings.v1';

  function loadSettings() {
    try { return Object.assign({}, MC.DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return Object.assign({}, MC.DEFAULT_SETTINGS); }
  }
  function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(game.settings)); } catch (e) { /* storage unavailable */ } }

  const game = MC.game = {
    settings: loadSettings(),
    hours: 7.4,
    rain: false,        // weather target
    rainStrength: 0,    // smoothed 0..1
    wetness: 0,         // surfaces dry slower than the rain stops
    time: 0,
    state: 'loading',
    showDebug: false,
    hideUI: false,
    gameMode: 'survival',
    mouseDown: false,
    useDown: false,
    shake: 0,
    onSettingChanged(key) {
      const s = this.settings;
      if (key === 'renderDist' && this.world) this.world.renderDist = s.renderDist;
      if (key === 'renderScale' && this.renderer) this.renderer.resize(true);
      if (key === 'taa' && this.renderer) this.renderer.histValid = false;
      if (key === 'sfxVol' || key === 'musicVol') MC.Audio.setVolumes(s.sfxVol, s.musicVol);
      if (key === 'gameMode') setMode(this.gameMode);
      saveSettings();
    },
    onScreenOpen() {
      this.state = 'screen';
      this.mouseDown = false; this.useDown = false;
      if (this.player) this.player.keys = {};
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };

  function setStatus(text, frac) {
    $('loadstatus').textContent = text;
    if (frac !== undefined) $('loadbar').style.width = Math.round(frac * 100) + '%';
  }

  function setMode(mode) {
    game.gameMode = mode;
    const p = game.player;
    if (!p) return;
    p.setCreative(mode === 'creative');
    $('mode-survival').classList.toggle('sel', mode === 'survival');
    $('mode-creative').classList.toggle('sel', mode === 'creative');
    if (game.ui) { game.ui.updateHotbar(); game.ui.refreshSettings(); }
  }

  function starterKit(p, mode) {
    p.inv.clear();
    const S = (k, n) => MC.makeStack(MC.idOf(k), n);
    if (mode === 'creative') {
      const keys = ['grass', 'stone_bricks', 'oak_planks', 'glass', 'torch', 'lantern', 'water_bucket', 'diamond_sword', 'compass'];
      keys.forEach((k, i) => { p.inv.slots[i] = S(k, MC.maxStack(MC.idOf(k))); });
    } else {
      p.inv.slots[0] = S('compass', 1);
      p.inv.slots[1] = S('bread', 3);
      p.inv.slots[2] = S('torch', 4);
    }
  }

  async function init() {
    try {
      setStatus('テクスチャとシェーダーを準備中...', 0.03);
      await nextFrame();
      const renderer = new MC.Renderer(canvas, game.settings);
      MC.resolveModelTiles();
      MC.TexGen.buildIcons();
      setStatus('ワールドを生成中...', 0.08);
      await nextFrame();
      const params = new URLSearchParams(location.search);
      const seed = parseInt(params.get('seed') || '8675309', 10) || 8675309;
      const world = new MC.World(seed);
      world.onMesh = (c, out) => renderer.uploadChunk(c, out);
      world.onUnload = (c) => renderer.freeChunk(c);
      const player = new MC.Player(world);
      world.player = player;
      game.seed = seed;
      Object.assign(game, { renderer, world, player });
      game.particles = new MC.Particles(world);
      game.entities = new MC.EntityManager(world, game);
      world.fx = makeFx();
      const saved = loadWorld(seed);
      if (saved) world.loadEdits(saved);
      if (saved && saved.kingdom && MC.Kingdom) MC.Kingdom.load(game, saved.kingdom);
      const sp = world.findSpawn();
      game.worldSpawn = [sp[0], sp[1], sp[2]];
      player.pos = [sp[0], sp[1], sp[2]];
      if (sp[3] !== undefined) player.yaw = sp[3];
      if (saved && saved.player) {
        const sv = saved.player;
        player.pos = sv.pos.slice(); player.yaw = sv.yaw; player.pitch = sv.pitch; player.flying = !!sv.flying;
        if (typeof saved.hours === 'number') game.hours = saved.hours;
        if (saved.v >= 2) {
          game.gameMode = saved.mode || 'survival';
          player.inv.load(sv.inv);
          if (sv.armor) player.armor.load(sv.armor);
          player.selected = sv.selected || 0;
          Object.assign(player, { maxHealth: sv.maxHealth || 20, health: sv.health ?? 20, food: sv.food ?? 20, sat: sv.sat ?? 5, air: 15, fuel: sv.fuel || 0 });
          if (sv.spawn) player.spawn = sv.spawn;
          game.rain = !!saved.rain;
        } else {
          // v1 worlds were creative sandboxes
          game.gameMode = 'creative';
          if (Array.isArray(sv.hotbar)) sv.hotbar.forEach((id, i) => { if (id && MC.BLOCKS[id]) player.inv.slots[i] = MC.makeStack(id, 64); });
        }
        game.hasSave = true;
      } else starterKit(player, game.gameMode);
      player.fallY = player.pos[1];
      player.game = game;
      player.onChange = () => { if (game.ui) game.ui.updateHotbar(); };
      game.ui = new MC.UI(game);
      setMode(game.gameMode);

      // preload the area around the spawn point
      const R0 = Math.min(game.settings.renderDist, 6);
      world.renderDist = R0;
      let need = 0;
      for (let dz = -R0; dz <= R0; dz++) for (let dx = -R0; dx <= R0; dx++) if (dx * dx + dz * dz <= (R0 + 0.5) * (R0 + 0.5)) need++;
      for (;;) {
        const pending = world.update(player.pos[0], player.pos[2], 45);
        let meshed = 0;
        for (const c of world.chunks.values()) if (c.meshed) meshed++;
        setStatus(`チャンクを生成中... ${Math.min(meshed, need)} / ${need}`, 0.1 + 0.9 * Math.min(1, meshed / need));
        if (pending === 0 && meshed >= need) break;
        await nextFrame();
      }
      world.renderDist = game.settings.renderDist;
      if (!(saved && saved.player)) { placeOnGround(player, world); if (sp[3] === undefined) faceOpenView(player, world); }
      game.worldSpawn = player.pos.slice();
      $('loading').classList.add('hidden');
      $('start').classList.remove('hidden');
      $('playbtn').textContent = game.hasSave ? '続きから遊ぶ' : 'クリックしてプレイ';
      game.state = 'start';
      lastT = performance.now();
      schedule(loop);
    } catch (e) {
      MC.GL.showError(e.message || String(e));
      console.error(e);
      setStatus('エラーが発生しました');
    }
  }

  // world effect hooks (particles + sounds)
  function makeFx() {
    return {
      breakBlock(x, y, z, id) { if (game.particles) game.particles.blockBreak(x, y, z, id); },
      explosion(x, y, z, power) {
        if (game.particles) game.particles.explosion(x, y, z, power);
        MC.Audio.play('explode', [x, y, z], 1.4, 0.9 + Math.random() * 0.2);
      },
      fizz(x, y, z) { if (game.particles) game.particles.smoke(x, y, z, 4); MC.Audio.play('fizz', [x, y, z], 0.5); },
    };
  }

  // ---- save / load (block edits + player state per seed)
  const worldKey = (seed) => 'shadercraft.world.' + seed;
  function loadWorld(seed) {
    try { return JSON.parse(localStorage.getItem(worldKey(seed))); } catch (e) { return null; }
  }
  function saveWorld() {
    const p = game.player, w = game.world;
    if (!p || !w || game.state === 'loading') return;
    try {
      localStorage.setItem(worldKey(game.seed), JSON.stringify({
        v: 2, hours: game.hours, rain: game.rain, mode: game.gameMode, edits: w.serializeEdits(), chests: w.serializeChests(), bosses: [...w.bossesDefeated],
        kingdom: MC.Kingdom ? MC.Kingdom.serialize(game) : null,
        player: {
          pos: p.pos.map((v) => +v.toFixed(3)), yaw: p.yaw, pitch: p.pitch, flying: p.flying,
          inv: p.inv.serialize(), armor: p.armor.serialize(), selected: p.selected, health: p.dead ? p.maxHealth : p.health, maxHealth: p.maxHealth, food: p.food, sat: p.sat, spawn: p.spawn, fuel: p.fuel,
        },
      }));
      w.editsDirty = false;
    } catch (e) { /* storage full or unavailable */ }
  }
  setInterval(() => { if (game.state === 'playing' || game.world && game.world.editsDirty) saveWorld(); }, 5000);
  window.addEventListener('beforeunload', saveWorld);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(); });

  // turn the player towards the most open direction (nicer first view)
  function faceOpenView(player, world) {
    const e = player.eyePos();
    let best = 0, bestYaw = player.yaw;
    for (let a = 0; a < 24; a++) {
      const yaw = a / 24 * Math.PI * 2, dx = Math.sin(yaw), dz = -Math.cos(yaw);
      let d = 1;
      for (; d < 90; d++) {
        const b = world.getBlock(Math.floor(e[0] + dx * d), Math.floor(e[1] - d * 0.08), Math.floor(e[2] + dz * d));
        if (MC.B_OPAQUE[b] || MC.B_MAT[b] === MC.MAT.LEAVES) break;
      }
      if (d > best) { best = d; bestYaw = yaw; }
    }
    player.yaw = bestYaw;
    player.pitch = -0.12;
  }

  function placeOnGround(player, world) {
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.floor(player.pos[0]), z = Math.floor(player.pos[2]);
      for (let y = MC.HEIGHT - 1; y > 0; y--) {
        const b = world.getBlock(x, y, z);
        if (b === 0 || MC.B_SHAPE[b] === MC.SHAPE.CROSS || !MC.B_SOLID[b] && !MC.B_FLUID[b]) continue;
        const mat = MC.B_MAT[b];
        if (mat === MC.MAT.LEAVES || MC.B_FLUID[b] || b === MC.BLOCK.oak_log || b === MC.BLOCK.birch_log || b === MC.BLOCK.spruce_log) break;
        player.pos[1] = y + 1;
        return;
      }
      player.pos[0] += 3;
    }
  }

  // ---------------- input
  const mouse = { down: [false, false, false], last: 0, lastUse: 0 };
  let lastW = 0;

  function lock() {
    MC.Audio.init();
    MC.Audio.setVolumes(game.settings.sfxVol, game.settings.musicVol);
    // if the browser refuses the lock (e.g. right after Esc), fall back to the pause menu
    const fail = () => { if (game.state !== 'playing' && game.state !== 'dead' && game.state !== 'screen') { game.state = 'paused'; game.ui.refreshSettings(); setOverlay('menu'); } };
    try {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(fail);
    } catch (e) { fail(); }
  }
  // close a screen and return to the game (screens opened by the game itself, e.g. the founding dialog)
  game.resume = () => { if (game.ui.isOpen()) game.ui.close(); game.state = 'paused'; lock(); };
  function setOverlay(name) {
    for (const id of ['start', 'menu']) $(id).classList.toggle('hidden', id !== name);
    $('ui').classList.toggle('hidden', game.state === 'loading' || game.hideUI);
  }

  $('playbtn').addEventListener('click', lock);
  $('mode-survival').addEventListener('click', () => { if (!game.hasSave) starterKit(game.player, 'survival'); setMode('survival'); });
  $('mode-creative').addEventListener('click', () => { if (!game.hasSave) starterKit(game.player, 'creative'); setMode('creative'); });
  $('resumebtn').addEventListener('click', lock);
  $('respawnbtn').addEventListener('click', () => {
    game.player.respawn(game.worldSpawn);
    game.ui.hideDeath();
    game.state = 'paused';
    lock();
  });
  $('newworldbtn').addEventListener('click', () => {
    saveWorld();
    const seed = Math.floor(Math.random() * 1e9);
    location.search = '?seed=' + seed;
  });
  $('resetbtn').addEventListener('click', () => {
    Object.assign(game.settings, MC.DEFAULT_SETTINGS);
    for (const k in MC.DEFAULT_SETTINGS) game.onSettingChanged(k);
    game.ui.refreshSettings();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!game.player) return;
    if (document.pointerLockElement === canvas) {
      if (game.ui.isOpen()) game.ui.close();
      game.state = 'playing';
      setOverlay(null);
    } else {
      game.player.keys = {};
      mouse.down = [false, false, false];
      game.mouseDown = false; game.useDown = false;
      if (game.state === 'playing') {
        game.state = 'paused';
        game.ui.refreshSettings();
        setOverlay('menu');
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const p = game.player;
    if (!p) return;
    // typing into a text field (the kingdom's name) must not close the screen
    if (game.state === 'screen' && document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text' && e.code !== 'Escape') return;
    if (game.state === 'screen' && (e.code === 'KeyE' || e.code === 'Escape')) { game.ui.close(); game.state = 'paused'; lock(); e.preventDefault(); return; }
    if (game.state !== 'playing') return;
    if (['Space', 'F1', 'F3', 'Tab'].includes(e.code)) e.preventDefault();
    p.keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Space') p.onSpace();
    if (e.code === 'KeyW') { const n = performance.now(); if (n - lastW < 280) p.sprintKey = true; lastW = n; }
    if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 9) { p.selected = n - 1; game.ui.updateHotbar(); game.ui.showBlockName(); }
    }
    if (e.code === 'KeyE') game.ui.openInventory();
    if (e.code === 'KeyQ') p.dropHeld(e.ctrlKey);
    if (e.code === 'F3') { game.showDebug = !game.showDebug; $('debug').classList.toggle('hidden', !game.showDebug); }
    if (e.code === 'F1') { game.hideUI = !game.hideUI; setOverlay(null); }
    if (e.code === 'KeyK') { game.rain = !game.rain; game.ui.refreshSettings(); }
    if (e.code === 'KeyJ') MC.debug.gotoWajo();
    if (e.code === 'KeyL' && MC.KingdomUI) MC.KingdomUI.key(game);
  });
  document.addEventListener('keyup', (e) => { if (game.player) game.player.keys[e.code] = false; });

  document.addEventListener('mousemove', (e) => {
    if (game.state !== 'playing') return;
    const p = game.player, k = 0.0022 * game.settings.mouseSens;
    p.yaw += e.movementX * k;
    p.pitch = MC.clamp(p.pitch - e.movementY * k, -1.55, 1.55);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (game.state === 'paused' && $('menu').classList.contains('hidden') && $('start').classList.contains('hidden')) { lock(); return; }
    if (game.state !== 'playing') return;
    mouse.down[e.button] = true;
    if (e.button === 0) { game.mouseDown = true; mouse.last = performance.now(); primary(true); }
    else if (e.button === 2) { game.useDown = true; mouse.lastUse = performance.now(); secondary(true); }
    else if (e.button === 1) { game.player.pickBlock(); game.ui.updateHotbar(); game.ui.showBlockName(); }
  });
  document.addEventListener('mouseup', (e) => {
    mouse.down[e.button] = false;
    if (e.button === 0) game.mouseDown = false;
    if (e.button === 2) game.useDown = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (game.state !== 'playing') return;
    const p = game.player;
    p.selected = (p.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
    game.ui.updateHotbar(); game.ui.showBlockName();
  }, { passive: true });

  function primary(first) {
    const p = game.player;
    if (p.dead) return;
    if (p.targetEntity) { if (p.attack(game) || first) game.renderer.hand.startSwing(); return; }
    if (p.mine(0.016, first, game) || (first && p.target)) game.renderer.hand.startSwing();
    else if (first) game.renderer.hand.startSwing();
  }
  function secondary(first) {
    const p = game.player;
    if (p.dead || p.use) return;
    if (p.useItem(game, first)) game.renderer.hand.startSwing();
    game.ui.updateHotbar();
  }

  // held item: light at the eye cell + camera-attached transform
  function updateHand(dt, fwd) {
    const p = game.player, w = game.world, hand = game.renderer.hand;
    const e = p.eyePos();
    const L = w.lightAt(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2]));
    const id = p.heldId();
    hand.build(id, L.sky, Math.max(L.block, id < MC.ITEM_BASE ? MC.B_EMIT[id] : 0));
    const moving = p.onGround && Math.hypot(p.vel[0], p.vel[2]) > 0.5;
    const u = p.use;
    hand.update(dt, fwd, p.bob, moving, u ? (u.kind === 'bow' ? Math.min(1, u.t) : u.t) : 0, u ? u.kind : null);
  }

  // ---------------- main loop
  let lastT = 0, fpsT = 0, fpsN = 0, fps = 0, dbgT = 0, tickAcc = 0;
  let skyState = null, skyHours = -1;

  // one simulated + rendered frame
  function frame(dt, simulate) {
    const s = game.settings, p = game.player, w = game.world;
    game.time += dt;
    const k = p.keys;
    const manual = game.state === 'playing' ? ((k.KeyT ? 1 : 0) - (k.KeyG ? 1 : 0)) * 2.5 : 0;
    game.hours = (game.hours + dt * (s.timeSpeed * 24 / 1200 + manual) + 24) % 24;
    const rt = game.rain ? 1 : 0;
    game.rainStrength += (rt - game.rainStrength) * Math.min(1, dt * 0.25);
    game.wetness += (rt - game.wetness) * Math.min(1, dt * (rt > game.wetness ? 0.2 : 0.05));

    const live = simulate && (game.state === 'playing' || game.state === 'screen' || game.state === 'paused' && false);
    if (game.state === 'playing') {
      p.update(dt, game);
      if (mouse.down[0] && !p.dead) {
        if (p.targetEntity) { if (performance.now() - mouse.last > 450) { mouse.last = performance.now(); primary(false); } }
        else p.mine(dt, false, game);
      }
      if (mouse.down[2] && !p.dead && !p.use && performance.now() - mouse.lastUse > 230) { mouse.lastUse = performance.now(); secondary(false); }
    }
    if (p.dead && (game.state === 'playing' || game.state === 'screen')) {
      if (game.ui.isOpen()) game.ui.close();
      game.state = 'dead';
      game.ui.showDeath(p.deathMsg);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    if (live) {
      tickAcc += dt;
      let n = 0;
      while (tickAcc >= 0.05 && n++ < 4) { w.tick(); tickAcc -= 0.05; }
      if (n >= 4) tickAcc = 0;
      game.entities.update(dt);
    }
    game.particles.update(dt);
    if (game.state !== 'loading') game.particles.ambient(dt, p.pos[0], p.pos[1], p.pos[2]);
    const f = p.forward();
    w.update(p.pos[0], p.pos[2], game.state === 'playing' ? 6 : 10, f[0], f[2]);

    if (Math.abs(game.hours - skyHours) > 0.004 || !skyState) { skyState = MC.Sky.update(game.hours); skyHours = game.hours; }
    const eye = p.eyePos();
    const bob = Math.sin(p.bob * Math.PI) * 0.045;
    game.shake = Math.max(0, game.shake - dt * 1.5);
    const sh = game.shake * 0.25;
    const tilt = p.hurtTilt * 0.05;
    const cam = {
      pos: [eye[0] + (Math.random() - 0.5) * sh, eye[1] + Math.abs(bob) * 0.8 + (Math.random() - 0.5) * sh, eye[2] + (Math.random() - 0.5) * sh],
      yaw: p.yaw, pitch: MC.clamp(p.pitch - tilt * Math.sin(p.hurtTilt * 12), -1.56, 1.56), fov: s.fov + p.fovKick,
    };
    const t = p.target;
    const showHand = game.state !== 'start' && !game.hideUI && !p.dead;
    if (showHand) updateHand(dt, f);
    // entity / particle geometry
    const batch = game.renderer.entityBatch;
    batch.begin(cam.pos);
    game.entities.render(batch, cam, game.time);
    batch.markShadowEnd();
    game.particles.render(batch, cam);
    batch.upload();
    let crack = null;
    if (p.breaking && t && p.breaking.need > 0 && p.breaking.need < Infinity) {
      const sel = t.sel;
      crack = { x: t.x + sel[0], y: t.y + sel[1], z: t.z + sel[2], sx: sel[3] - sel[0], sy: sel[4] - sel[1], sz: sel[5] - sel[2], stage: Math.min(1, p.breaking.t / p.breaking.need) };
    }
    const info = {
      time: game.time,
      target: t && game.state === 'playing' ? [t.x + t.sel[0], t.y + t.sel[1], t.z + t.sel[2], t.sel[3] - t.sel[0], t.sel[4] - t.sel[1], t.sel[5] - t.sel[2]] : null,
      crack,
      underwater: p.eyeInWater,
      handLight: (p.heldId() < MC.ITEM_BASE ? MC.B_EMIT[p.heldId()] : 0) / 15,
      hand: showHand,
      rain: game.rainStrength,
      wet: game.wetness,
      entities: true,
    };
    game.renderer.render(cam, w, skyState, dt, info);
    // audio listener / ambience
    MC.Audio.setListener(eye, p.yaw);
    const sky = w.skyLight(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
    MC.Audio.update(dt, { underwater: p.eyeInWater, rain: game.rainStrength, sheltered: sky < 12, playing: game.state === 'playing', night: game.hours > 19 || game.hours < 5, cave: eye[1] < 55 && sky < 4 });
    return t;
  }

  function loop(now) {
    schedule(loop);
    const dt = Math.min(0.1, Math.max(0.0005, (now - lastT) / 1000));
    lastT = now;
    const p = game.player, w = game.world;
    const t = frame(dt, true);
    game.ui.frame(dt);

    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    if (now - dbgT > 200) {
      dbgT = now;
      game.ui.updateTime(game.hours);
      game.ui.setUnderwater(p.eyeInWater);
      game.ui.updateCompass();
      game.ui.updateBoss();
      if (MC.KingdomUI) MC.KingdomUI.hud(game);
      if (game.state === 'playing') game.ui.checkDiscovery();
      if (game.showDebug) {
        const r = game.renderer, st = r.stats;
        const b = t ? MC.BLOCKS[t.block].name : p.targetEntity ? MC.MOB_TYPES[p.targetEntity.type].name : '-';
        const info2 = w.gen.columnInfo(Math.floor(p.pos[0]), Math.floor(p.pos[2]));
        const biome = Object.keys(MC.BIOME).find((kk) => MC.BIOME[kk] === info2.biome);
        const v = w.gen.nearestVillage(p.pos[0], p.pos[2], 3), d = w.gen.nearestDungeon(p.pos[0], p.pos[2], 3), cs = w.gen.nearestCastle(p.pos[0], p.pos[2], 3);
        const ents = game.entities.list;
        $('debug').textContent =
          `ShaderCraft  ${fps} FPS\n` +
          `XYZ: ${p.pos[0].toFixed(2)} / ${p.pos[1].toFixed(2)} / ${p.pos[2].toFixed(2)}\n` +
          `チャンク: ${Math.floor(p.pos[0] / 16)}, ${Math.floor(p.pos[2] / 16)}   バイオーム: ${biome}\n` +
          `読込: ${st.chunks}  描画: ${st.drawn}  影: ${st.shadowDrawn}  面: ${(st.quads / 1000).toFixed(0)}k\n` +
          `解像度: ${r.W}x${r.H}  影: ${r.shadowSize}px\n` +
          `エンティティ: ${ents.length}（モブ ${ents.filter((e) => e.kind === 'mob').length}）  パーティクル: ${game.particles.list.length}  流体更新待ち: ${w.fluidQ.size}\n` +
          `時刻: ${MC.UI.fmtTime(game.hours)}  ${p.flying ? '飛行中' : ''}\n` +
          `最寄りの村: ${v ? `${v.x}, ${v.z}` : '-'}   ダンジョン: ${d ? `${d.x}, ${d.z}` : '-'}\n` +
          `最寄りの城: ${cs ? `${cs.name} (${cs.x}, ${cs.z})` : '-'}\n` +
          `最寄りの和城: ${(() => { const ws = w.gen.nearestWajo(p.pos[0], p.pos[2], 3); return ws ? `${ws.name}・${MC.WAJO_TYPES[ws.kind].kind} (${ws.x}, ${ws.z})` : '-'; })()}\n` +
          `注視: ${b}`;
      }
    }
    game.ui.updateStats(p);
  }

  // Small scripting hooks (used for automated previews / screenshots)
  MC.debug = {
    // run n real game frames (simulation + rendering) with a fixed dt
    step(n = 60, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt, true); game.ui.frame(dt); game.ui.updateStats(game.player); },
    frames(n = 30, budget = 20, sim = false) {
      const p = game.player, w = game.world;
      for (let i = 0; i < n; i++) {
        w.update(p.pos[0], p.pos[2], budget);
        if (sim) { for (let k = 0; k < 1; k++) w.tick(); game.entities.update(0.05); }
        const e = p.eyePos();
        p.eyeInWater = MC.B_FLUID[w.getBlock(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2]))] === MC.FLUID.WATER;
        game.time += 0.05;
        game.particles.update(0.05);
        if (this.hand) updateHand(0.05, p.forward());
        const cam = { pos: e, yaw: p.yaw, pitch: p.pitch, fov: game.settings.fov };
        const batch = game.renderer.entityBatch;
        batch.begin(cam.pos);
        game.entities.render(batch, cam, game.time);
        batch.markShadowEnd();
        game.particles.render(batch, cam);
        batch.upload();
        game.renderer.render(cam, w, MC.Sky.update(game.hours), 0.05,
          { time: game.time, target: null, underwater: p.eyeInWater, handLight: 0, hand: !!this.hand, rain: game.rainStrength, wet: game.wetness, entities: true });
      }
    },
    view(x, y, z, yaw, pitch, hours, fov = 75, n = 60) {
      const p = game.player;
      $('start').classList.add('hidden');
      p.pos = [x, y, z]; p.yaw = yaw; p.pitch = pitch;
      game.hours = hours; game.settings.fov = fov; game.settings.timeSpeed = 0;
      skyHours = -1;
      this.frames(n);
    },
    ground(x, z) {
      for (let y = MC.HEIGHT - 1; y > 0; y--) {
        const b = game.world.getBlock(x, y, z);
        if (b && MC.B_SOLID[b] && MC.B_MAT[b] !== MC.MAT.LEAVES) return y;
      }
      return -1;
    },
    ready() { return game.state !== 'loading'; },
    // list the castles around (x, z): [{ theme, name, x, z, dist }]
    castles(rad = 6, x = game.player.pos[0], z = game.player.pos[2]) {
      const out = [];
      const C = MC.Structures.CCELL, gx0 = Math.floor(x / C), gz0 = Math.floor(z / C);
      for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) {
        const s = MC.Structures.castleSite(game.world.gen, gx, gz);
        if (s) out.push({ theme: s.theme, name: s.name, x: s.x, z: s.z, fy: s.fy, R: s.R, dist: Math.round(Math.hypot(s.x - x, s.z - z)) });
      }
      return out.sort((a, b) => a.dist - b.dist);
    },
    // kingdom test hooks: conquer the nearest castle, found a kingdom there, order buildings, start a raid
    kingdom: {
      conquer() {
        const p = game.player, s = game.world.gen.nearestCastle(p.pos[0], p.pos[2], 4);
        if (!s) return null;
        game.world.bossesDefeated.add(s.id + '/boss');
        game.entities._conquer(s.id);
        return s;
      },
      found(name = MC.kingdomName(), color = 'red') {
        const s = this.conquer();
        if (!s || game.kingdom) return game.kingdom;
        game.pendingFound = null;
        return MC.Kingdom.found(game, s, name, color);
      },
      order(type) { return MC.Kingdom.order(game, type, { free: true }); },
      finish() {
        const k = game.kingdom;
        for (const b of k.buildings) if (!b.done) { const n = b.q.length / 4; while (b.qi < n) { const i = b.qi++ * 4; MC.Kingdom.place(game.world, b.q[i], b.q[i + 1], b.q[i + 2], b.q[i + 3]); } MC.Kingdom._complete(game, k, b); }
      },
      raid() { return MC.KingdomPeople.startRaid(game, game.kingdom); },
    },
    // Japanese castles around (x, z): [{ kind, name, x, z, fy, dist }]
    wajo(rad = 8, x = game.player.pos[0], z = game.player.pos[2]) {
      const out = [];
      const C = MC.Structures.WCELL, gx0 = Math.floor(x / C), gz0 = Math.floor(z / C);
      for (let gz = gz0 - rad; gz <= gz0 + rad; gz++) for (let gx = gx0 - rad; gx <= gx0 + rad; gx++) {
        const s = MC.Structures.wajoSite(game.world.gen, gx, gz);
        if (s) out.push({ kind: s.kind, name: s.name, x: s.x, z: s.z, fy: s.fy, rot: s.rot, id: s.id, dist: Math.round(Math.hypot(s.x - x, s.z - z)) });
      }
      return out.sort((a, b) => a.dist - b.dist);
    },
    // teleport in front of the main gate of the nearest Japanese castle (of a kind)
    gotoWajo(kind, rad = 10) {
      const p = game.player, s = game.world.gen.nearestWajo(p.pos[0], p.pos[2], rad, kind);
      if (!s) return null;
      const plan = MC.Structures.wajoPlan(game.world.gen, s);
      const g = plan.gate || [s.x, s.fy + 1, s.z];
      p.pos = [g[0] + 0.5, g[1] + 1, g[2] + 0.5];
      p.vel = [0, 0, 0]; p.fallY = p.pos[1];
      p.yaw = Math.atan2(s.x - g[0], -(s.z - g[2]));
      return { site: s, gate: g, banner: plan.banner };
    },
    // break the standard of the nearest Japanese castle (capture test)
    seizeWajo() {
      const p = game.player, s = game.world.gen.nearestWajo(p.pos[0], p.pos[2], 2);
      if (!s) return null;
      const bn = MC.Structures.wajoPlan(game.world.gen, s).banner;
      if (bn) game.world.setBlock(bn[0], bn[1], bn[2], 0);
      return s;
    },
    // teleport in front of the gate of the nearest castle (of a theme)
    gotoCastle(theme) {
      const p = game.player, s = game.world.gen.nearestCastle(p.pos[0], p.pos[2], 8, theme);
      if (!s) return null;
      let dx = 0, dz = -1;
      for (let i = 0; i < s.rot; i++) { const t = dx; dx = -dz; dz = t; }
      const d = s.R + 12;
      p.pos = [s.x + dx * d + 0.5, s.fy + 2, s.z + dz * d + 0.5];
      p.vel = [0, 0, 0]; p.fallY = p.pos[1];
      p.yaw = Math.atan2(-dx, dz);
      return s;
    },
  };

  window.addEventListener('load', init);
})();
