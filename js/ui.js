'use strict';
// HUD (hotbar, hearts / hunger / air, compass, toasts), container screens (inventory + crafting,
// creative catalog, chests, villager trading), death screen and the settings menu.
MC.DEFAULT_SETTINGS = {
  renderDist: 12, renderScale: 1.0, fov: 75,
  shadowRes: 4096, shadowDist: 128, softShadows: true,
  volumetric: true, vlStrength: 1.0, clouds: true, cloudCover: 0.5, ssr: true, pom: true,
  taa: true, fxaa: true, bloom: 0.07, fog: 1.0,
  exposure: 1.0, saturation: 1.06, vignette: 0.35,
  timeSpeed: 1.0, mouseSens: 1.0,
  difficulty: 2, keepInventory: true, sfxVol: 0.8, musicVol: 0.5,
  kingdomRaids: true, raidFreq: 1,
};

MC.SETTINGS_DEF = [
  { section: 'ゲーム' },
  { key: 'gameMode', label: 'ゲームモード', type: 'select', options: ['survival', 'creative'], labels: ['サバイバル', 'クリエイティブ'], game: true },
  { key: 'difficulty', label: '難易度', type: 'select', options: [0, 1, 2, 3], labels: ['ピースフル', 'イージー', 'ノーマル', 'ハード'] },
  { key: 'keepInventory', label: '死亡時に持ち物を保持', type: 'check' },
  { key: 'kingdomRaids', label: '敵軍が王国を攻めてくる', type: 'check' },
  { key: 'raidFreq', label: '王国への襲撃の頻度', type: 'select', options: [0, 1, 2], labels: ['まれ', 'ふつう', '頻繁'] },
  { key: 'sfxVol', label: '効果音', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'musicVol', label: '音楽', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { section: '描画' },
  { key: 'renderDist', label: '描画距離', min: 4, max: 50, step: 2, fmt: (v) => v + ' チャンク' },
  { key: 'renderScale', label: 'レンダースケール', min: 0.5, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'fov', label: '視野角', min: 50, max: 110, step: 1, fmt: (v) => v + '°' },
  { key: 'taa', label: 'TAA（テンポラルAA）', type: 'check' },
  { key: 'fxaa', label: 'FXAA（TAA無効時）', type: 'check' },
  { section: '影・ライティング' },
  { key: 'shadowRes', label: '影の解像度', type: 'select', options: [1024, 2048, 4096] },
  { key: 'shadowDist', label: '影の描画距離', min: 48, max: 192, step: 8, fmt: (v) => v + ' ブロック' },
  { key: 'softShadows', label: 'ソフトシャドウ（PCSS）', type: 'check' },
  { key: 'volumetric', label: 'ボリュメトリックライト', type: 'check' },
  { key: 'vlStrength', label: '光芒の強さ', min: 0, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
  { section: '空・水・マテリアル' },
  { key: 'clouds', label: 'ボリュメトリック雲', type: 'check' },
  { key: 'cloudCover', label: '雲の量', min: 0.25, max: 0.8, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'ssr', label: '水面のスクリーン空間反射', type: 'check' },
  { key: 'pom', label: '視差オクルージョン（POM）', type: 'check' },
  { key: 'fog', label: '大気の霧', min: 0, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
  { section: 'カラー' },
  { key: 'bloom', label: 'ブルーム', min: 0, max: 0.3, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'exposure', label: '露出', min: 0.3, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'saturation', label: '彩度', min: 0.5, max: 1.6, step: 0.02, fmt: (v) => v.toFixed(2) },
  { key: 'vignette', label: 'ビネット', min: 0, max: 1, step: 0.05, fmt: (v) => v.toFixed(2) },
  { section: '時間・操作' },
  { key: 'hours', label: '時刻', min: 0, max: 24, step: 0.1, fmt: (v) => MC.UI.fmtTime(v), game: true },
  { key: 'rain', label: '雨を降らせる（Kキー）', type: 'check', game: true },
  { key: 'timeSpeed', label: '時間の速さ', min: 0, max: 30, step: 0.5, fmt: (v) => (v === 0 ? '停止' : '×' + v) },
  { key: 'mouseSens', label: 'マウス感度', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
];

MC.UI = class {
  static fmtTime(h) {
    h = ((h % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.icons = MC.TexGen.icons;
    this._nameTimer = 0;
    this._toastTimer = 0;
    this.cursor = null;       // stack held by the mouse in container screens
    this.screen = null;       // { kind, ... }
    this._buildHudIcons();
    this._buildHotbar();
    this._buildStats();
    this._buildSettings();
    this._initScreens();
    this._hud = {};
  }

  // ------------------------------------------------------------------ HUD
  _pix(rows, pal, scale = 2) {
    const h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale;
    const g = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = pal[rows[y][x]];
      if (!c) continue;
      g.fillStyle = c; g.fillRect(x * scale, y * scale, scale, scale);
    }
    return cv.toDataURL();
  }
  _buildHudIcons() {
    const heart = ['.XX...XX.', 'XaaX.XaaX', 'XawaXaaaX', 'XaaaaaaaX', 'XaaaaaaaX', '.XaaaaaX.', '..XaaaX..', '...XaX...', '....X....'];
    const halfL = heart.map((r) => r.split('').map((ch, x) => (ch === 'a' || ch === 'w') && x > 4 ? 'e' : ch).join(''));
    const drum = ['......XX.', '.....XbbX', '....XbbX.', '..XXXbX..', '.XaaaX...', 'XaawaX...', 'XaaaaX...', 'XaaaX....', '.XXX.....'];
    const drumHalf = drum.map((r) => r.split('').map((ch, x) => (ch === 'a' || ch === 'w') && x < 3 ? 'e' : ch).join(''));
    const bub = ['..XXX..', '.XwaaX.', 'XwaaaaX', 'XaaaaaX', 'XaaaaaX', '.XaaaX.', '..XXX..'];
    const RED = { X: '#1a0000', a: '#e8261e', w: '#ffb0a8', e: '#3a2222' };
    const GREEN = { X: '#001a04', a: '#4aa82a', w: '#c0f0a0', e: '#223a22' };
    const EMPTY = { X: '#1a0000', a: '#3a2222', w: '#3a2222', e: '#3a2222' };
    const FOOD = { X: '#1e1006', a: '#b86a2a', w: '#e8a060', b: '#f0e8d8', e: '#3a2a1e' };
    const FOODE = { X: '#1e1006', a: '#3a2a1e', w: '#3a2a1e', b: '#5a5048', e: '#3a2a1e' };
    const BUB = { X: '#10306a', a: '#4a8ae0', w: '#e0f0ff' };
    const plate = ['.XX...XX.', 'XaaXXXaaX', 'XawaaaaaX', '.XaaaaaX.', '.XbbbbbX.', '.XaaaaaX.', '.XbbbbbX.', '.XaaaaaX.', '..XXXXX..'];
    const plateHalf = plate.map((r) => r.split('').map((ch, x) => (ch === 'a' || ch === 'w' || ch === 'b') && x > 4 ? 'e' : ch).join(''));
    const ARM = { X: '#101418', a: '#8a929e', w: '#e0e6ee', b: '#b02a22', e: '#2a2e34' };
    this.hudIcons = {
      armor: this._pix(plate, ARM), armorHalf: this._pix(plateHalf, ARM),
      heart: this._pix(heart, RED), heartHalf: this._pix(halfL, RED), heartEmpty: this._pix(heart, EMPTY),
      heartP: this._pix(heart, GREEN), heartHalfP: this._pix(halfL, GREEN),
      food: this._pix(drum, FOOD), foodHalf: this._pix(drumHalf, FOOD), foodEmpty: this._pix(drum, FOODE),
      bubble: this._pix(bub, BUB),
    };
  }
  _buildStats() {
    const mk = (id, n = 10) => { const el = this.$(id); el.innerHTML = ''; const imgs = []; for (let i = 0; i < n; i++) { const im = document.createElement('img'); el.appendChild(im); imgs.push(im); } return imgs; };
    this.heartImgs = mk('hearts', 20);
    this.armorImgs = mk('armorbar');
    this.foodImgs = mk('hunger'); this.airImgs = mk('air');
    this.foodImgs.reverse(); this.airImgs.reverse();
  }
  updateStats(p) {
    const survival = !p.creative;
    this.$('stats').style.visibility = survival ? 'visible' : 'hidden';
    if (!survival) return;
    const H = this.hudIcons;
    const hs = Math.ceil(p.health), fs = p.food, air = Math.ceil(p.air / 1.5);
    const pois = p.poisonT > 0, nH = Math.ceil((p.maxHealth || 20) / 2);
    const ar = p.armorDef ? p.armorDef() : null, ap = ar ? Math.max(1, Math.round(ar.armor * 20)) : 0;
    const key = hs + ':' + fs + ':' + air + ':' + (p.invul > 0 ? 1 : 0) + ':' + nH + ':' + pois + ':' + (p.slowT > 0) + ':' + ap;
    if (this._statKey === key) return;
    this._statKey = key;
    // armour points (half a plate each), shown only while a suit is worn
    for (let i = 0; i < 10; i++) {
      const im = this.armorImgs[i], v = ap - i * 2;
      im.style.display = v > 0 ? '' : 'none';
      const src = v >= 2 ? H.armor : H.armorHalf;
      if (v > 0 && im.src !== src) im.src = src;
    }
    this.$('frostov').classList.toggle('on', p.slowT > 0 && !p.dead);
    for (let i = 0; i < 20; i++) {
      const im = this.heartImgs[i];
      im.style.display = i < nH ? '' : 'none';
      const v = hs - i * 2;
      const src = v >= 2 ? (pois ? H.heartP : H.heart) : v === 1 ? (pois ? H.heartHalfP : H.heartHalf) : H.heartEmpty;
      if (im.src !== src) im.src = src;
    }
    for (let i = 0; i < 10; i++) {
      const f = fs - i * 2;
      const fsrc = f >= 2 ? H.food : f === 1 ? H.foodHalf : H.foodEmpty;
      if (this.foodImgs[i].src !== fsrc) this.foodImgs[i].src = fsrc;
      this.airImgs[i].style.visibility = p.eyeInWater || p.air < 15 ? (i < air ? 'visible' : 'hidden') : 'hidden';
      if (!this.airImgs[i].src) this.airImgs[i].src = H.bubble;
    }
    this.$('hearts').classList.toggle('low', hs <= 4);
  }

  _slotHTML(num) { return `${num !== undefined ? `<span class="num">${num}</span>` : ''}<img alt=""><span class="cnt"></span><div class="dur hidden"><i></i></div>`; }
  _fillSlot(el, s) {
    const img = el.querySelector('img'), cnt = el.querySelector('.cnt'), dur = el.querySelector('.dur');
    if (s && s.id) {
      const src = this.icons[s.id];
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.visibility = 'visible';
      cnt.textContent = s.count > 1 ? s.count : '';
      const md = MC.maxDur(s.id);
      if (md && s.dur !== undefined && s.dur < md) {
        dur.classList.remove('hidden');
        const f = s.dur / md;
        dur.firstChild.style.width = (f * 100) + '%';
        dur.firstChild.style.background = `hsl(${Math.round(f * 120)}, 90%, 50%)`;
      } else dur.classList.add('hidden');
    } else { img.style.visibility = 'hidden'; cnt.textContent = ''; dur.classList.add('hidden'); }
  }
  _buildHotbar() {
    const hb = this.$('hotbar');
    hb.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = this._slotHTML(i + 1);
      hb.appendChild(s);
      this.slots.push(s);
    }
    this.updateHotbar();
  }
  updateHotbar() {
    const p = this.game.player;
    this.slots.forEach((s, i) => {
      this._fillSlot(s, p.inv.slots[i]);
      s.classList.toggle('sel', i === p.selected);
    });
    if (this.screen) this.refreshScreen();
  }
  showBlockName() {
    const id = this.game.player.heldId();
    const el = this.$('blockname');
    el.textContent = id ? MC.itemName(id) : '';
    el.classList.add('show');
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }
  toast(text, sub) {
    const el = this.$('toast');
    el.innerHTML = '';
    el.appendChild(document.createTextNode(text));
    if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  // per-frame HUD effects
  frame(dt) {
    const g = this.game, p = g.player;
    this.$('vignette').style.opacity = Math.max(p.hurtFlash * 0.9, p.dead ? 0.6 : 0, (!p.creative && p.health <= 4) ? 0.25 + Math.sin(g.time * 5) * 0.1 : 0);
    this.$('fireov').classList.toggle('on', p.fire > 0 && !p.creative && !p.dead);
    const te = p.targetEntity;
    this.$('crosshair').classList.toggle('entity', !!te);
    this.$('tgt').classList.toggle('hidden', !te || !!(te.cfg && te.cfg.boss));
    if (te && te.cfg) {
      const nm = te.label || (te.cfg.villager && te.prof ? `村人（${MC.PROFESSIONS[te.prof].name}）` : te.cfg.name) + (te.raid ? '（敵軍）' : '');
      if (this.$('tgtname').textContent !== nm) this.$('tgtname').textContent = nm;
      this.$('tgthp').style.width = Math.max(0, te.health / te.maxHealth * 100) + '%';
    }
  }
  updateTime(hours) {
    const g = this.game;
    this.$('timeinfo').textContent = MC.UI.fmtTime(hours) + (g.player && g.player.creative ? '  クリエイティブ' : '');
  }
  updateCompass() {
    const g = this.game, p = g.player, el = this.$('compass');
    const held = p.heldId() === MC.ITEM.compass;
    el.classList.toggle('hidden', !held);
    if (!held) return;
    const now = performance.now();
    if (!this._compass || now - this._compass.t > 1500) {
      const gen = g.world.gen;
      this._compass = { t: now, v: gen.nearestVillage(p.pos[0], p.pos[2], 3), d: gen.nearestDungeon(p.pos[0], p.pos[2], 3), c: gen.nearestCastle ? gen.nearestCastle(p.pos[0], p.pos[2], 3) : null,
        w: gen.nearestWajo ? gen.nearestWajo(p.pos[0], p.pos[2], 3) : null, k: g.kingdom ? { x: g.kingdom.cx, z: g.kingdom.cz } : null };
    }
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const fmt = (s, label) => {
      if (!s) return `<span>${label}: 見つからない</span>`;
      const dx = s.x - p.pos[0], dz = s.z - p.pos[2];
      const a = Math.atan2(dx, -dz) - p.yaw;
      const idx = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      return `<span>${label} <b>${arrows[idx]}</b>${Math.round(Math.hypot(dx, dz))}m</span>`;
    };
    el.innerHTML = (this._compass.k ? fmt(this._compass.k, '王国') : '') + fmt(this._compass.v, '村') + fmt(this._compass.d, 'ダンジョン') + fmt(this._compass.c, '城') +
      fmt(this._compass.w, '和城');
  }
  updateBoss() {
    const b = this.game.entities && this.game.entities.boss();
    const el = this.$('bossbar');
    if (!b && MC.KingdomUI && MC.KingdomUI.raidBar(this.game)) return;
    el.classList.remove('raid');
    el.classList.toggle('hidden', !b);
    if (!b) return;
    const nm = b.cfg.title ? `${b.cfg.name} ― ${b.cfg.title}` : b.cfg.name;
    if (this.$('bossname').textContent !== nm) this.$('bossname').textContent = nm;
    el.classList.toggle('lord', !!b.cfg.lord);
    this.$('bosshp').style.width = Math.max(0, b.health / b.maxHealth * 100) + '%';
  }
  // one-time messages when entering a village or a dungeon
  checkDiscovery() {
    const g = this.game, p = g.player, gen = g.world.gen;
    if (!this._seen) this._seen = new Set();
    const v = gen.nearestVillage(p.pos[0], p.pos[2], 1);
    if (v && !this._seen.has(v.id) && Math.hypot(v.x - p.pos[0], v.z - p.pos[2]) < 36) {
      this._seen.add(v.id);
      this.toast('村を発見した', '村人と取引できます（右クリック）');
    }
    const d = gen.nearestDungeon(p.pos[0], p.pos[2], 1);
    if (d && !this._seen.has(d.id)) {
      const near = Math.hypot(d.x - p.pos[0], d.z - p.pos[2]);
      if (near < 12) { this._seen.add(d.id); this.toast('古代の遺跡', '螺旋階段が地下のダンジョンへ続いている'); }
    }
    const c = gen.nearestCastle && gen.nearestCastle(p.pos[0], p.pos[2], 1);
    if (c && !this._seen.has(c.id) && Math.max(Math.abs(c.x - p.pos[0]), Math.abs(c.z - p.pos[2])) < c.R + 14) {
      this._seen.add(c.id);
      this.toast(c.name, MC.CASTLE_THEMES[c.theme].sub);
    }
    const w = gen.nearestWajo && gen.nearestWajo(p.pos[0], p.pos[2], 1);
    if (w && !this._seen.has(w.id) && Math.max(Math.abs(w.x - p.pos[0]), Math.abs(w.z - p.pos[2])) < w.R - 4) {
      this._seen.add(w.id);
      const T = MC.WAJO_TYPES[w.kind];
      if (MC.Wajo.seized(g.world, w.id)) this.toast(`${w.name}（${T.kind}）`, '制圧済みの城。静けさが戻っている');
      else this.toast(`${w.name}（${T.kind}）`, T.sub);
    }
  }
  setUnderwater(on) {
    const el = this.$('underwater');
    el.style.background = on ? 'radial-gradient(ellipse at center, rgba(0,40,60,0) 40%, rgba(0,25,45,0.45))' : 'none';
  }
  sleep(done) {
    const f = this.$('sleepfade');
    f.classList.add('on');
    setTimeout(() => { done(); this.toast('おはよう！', '夜が明けました'); setTimeout(() => f.classList.remove('on'), 400); }, 1500);
  }
  showDeath(msg) {
    this.$('deathmsg').textContent = msg;
    this.$('death').classList.remove('hidden');
  }
  hideDeath() { this.$('death').classList.add('hidden'); }

  // ------------------------------------------------------------------ settings
  _buildSettings() {
    const box = this.$('settings');
    box.innerHTML = '';
    this.controls = {};
    const g = this.game, S = g.settings;
    for (const d of MC.SETTINGS_DEF) {
      if (d.section) {
        const h = document.createElement('div'); h.className = 'section'; h.textContent = d.section; box.appendChild(h);
        continue;
      }
      const get = () => (d.game ? g[d.key] : S[d.key]);
      const set = (v) => { if (d.game) g[d.key] = v; else S[d.key] = v; g.onSettingChanged(d.key); };
      if (d.type === 'check') {
        const w = document.createElement('label'); w.className = 'setting check';
        w.innerHTML = `<input type="checkbox"><span>${d.label}</span>`;
        const inp = w.querySelector('input');
        inp.checked = !!get();
        inp.addEventListener('change', () => set(inp.checked));
        box.appendChild(w);
        this.controls[d.key] = () => { inp.checked = !!get(); };
      } else if (d.type === 'select') {
        const w = document.createElement('div'); w.className = 'setting';
        w.innerHTML = `<div class="row"><span>${d.label}</span><span></span></div><input type="range" min="0" max="${d.options.length - 1}" step="1">`;
        const inp = w.querySelector('input'), val = w.querySelector('.row span:last-child');
        const lab = (i) => (d.labels ? d.labels[i] : d.options[i]);
        const upd = () => { const i = Math.max(0, d.options.indexOf(get())); inp.value = i; val.textContent = lab(i); };
        inp.addEventListener('input', () => { set(d.options[+inp.value]); val.textContent = lab(+inp.value); });
        upd();
        box.appendChild(w);
        this.controls[d.key] = upd;
      } else {
        const w = document.createElement('div'); w.className = 'setting';
        w.innerHTML = `<div class="row"><span>${d.label}</span><span></span></div><input type="range" min="${d.min}" max="${d.max}" step="${d.step}">`;
        const inp = w.querySelector('input'), val = w.querySelector('.row span:last-child');
        const upd = () => { inp.value = get(); val.textContent = d.fmt ? d.fmt(+get()) : get(); };
        inp.addEventListener('input', () => { set(+inp.value); val.textContent = d.fmt ? d.fmt(+inp.value) : inp.value; });
        upd();
        box.appendChild(w);
        this.controls[d.key] = upd;
      }
    }
  }
  refreshSettings() { for (const k in this.controls) this.controls[k](); }

  // ------------------------------------------------------------------ container screens
  _initScreens() {
    const cur = this.$('cursor');
    document.addEventListener('mousemove', (e) => { if (this.screen) { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; } });
    this.$('screen').addEventListener('mousedown', (e) => {
      if (e.target === this.$('screen') && this.cursor) {
        // drop the held stack outside the panel
        const s = this.cursor;
        if (e.button === 2 && s.count > 1) { this.game.player.dropStack(Object.assign({}, s, { count: 1 }), true); s.count--; }
        else { this.game.player.dropStack(s, true); this.cursor = null; }
        this._renderCursor();
      }
    });
  }
  isOpen() { return !!this.screen; }
  _renderCursor() {
    const cur = this.$('cursor');
    const s = this.cursor;
    cur.classList.toggle('hidden', !s || !this.screen);
    if (s) { cur.querySelector('img').src = this.icons[s.id]; cur.querySelector('.cnt').textContent = s.count > 1 ? s.count : ''; }
  }
  _open(kind, data) {
    this.screen = Object.assign({ kind }, data || {});
    this.game.onScreenOpen();
    this.$('screen').classList.remove('hidden');
    this.refreshScreen(true);
  }
  close() {
    if (!this.screen) return;
    const p = this.game.player;
    if (this.cursor) {
      const left = p.inv.add(this.cursor);
      if (left > 0) p.dropStack(Object.assign({}, this.cursor, { count: left }), true);
      this.cursor = null;
    }
    if (this.screen.kind === 'chest' && MC.Audio) MC.Audio.play('chest_close', this.screen.pos, 0.7);
    if (this.screen.kind === 'trade' && this.screen.villager) this.screen.villager.trading = 0;
    if (this.screen.onClose) this.screen.onClose();
    this.screen = null;
    this.$('screen').classList.add('hidden');
    this._renderCursor();
    this.updateHotbar();
  }
  openInventory(near) {
    const p = this.game.player;
    const n = Object.assign(this._nearStations(), near || {});
    this._open(p.creative ? 'creative' : 'inventory', { near: n, tab: 'blocks' });
  }
  openChest(x, y, z) {
    const ch = this.game.world.getChest(x, y, z);
    if (MC.Audio) MC.Audio.play('chest_open', [x + 0.5, y + 0.5, z + 0.5], 0.7);
    this._open('chest', { chest: ch, pos: [x + 0.5, y + 0.5, z + 0.5] });
  }
  openTrade(v) {
    if (!v.prof) v.prof = 'farmer';
    v.trading = 99;
    if (MC.Audio) MC.Audio.play('villager_say', v.center(), 0.9);
    this._open('trade', { villager: v });
  }
  _nearStations() {
    const p = this.game.player, W = this.game.world;
    const out = { table: false, furnace: false };
    const cx = Math.floor(p.pos[0]), cy = Math.floor(p.pos[1]), cz = Math.floor(p.pos[2]);
    for (let y = -2; y <= 3; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      const b = W.getBlock(cx + x, cy + y, cz + z);
      if (b === MC.BLOCK.crafting_table) out.table = true;
      if (MC.isFurnace(b)) out.furnace = true;
    }
    return out;
  }

  // slot interaction (MC-like)
  _clickSlot(container, i, button, shift, quickTarget) {
    const slots = container.slots;
    const s = slots[i];
    // slots that only take certain items (the armour slot)
    if (container.accept && this.cursor && !container.accept(this.cursor.id)) { if (MC.Audio) MC.Audio.play('no', null, 0.4); return; }
    if (shift && s && quickTarget) {
      const left = quickTarget(s);
      if (left <= 0) slots[i] = null; else s.count = left;
      this.refreshScreen();
      return;
    }
    const c = this.cursor;
    if (button === 0) {
      if (!c) { this.cursor = s; slots[i] = null; }
      else if (!s) { slots[i] = c; this.cursor = null; }
      else if (s.id === c.id && s.dur === undefined && c.dur === undefined) {
        const n = Math.min(MC.maxStack(s.id) - s.count, c.count);
        s.count += n; c.count -= n;
        if (c.count <= 0) this.cursor = null;
      } else { slots[i] = c; this.cursor = s; }
    } else {
      if (!c) { if (s) { const h = Math.ceil(s.count / 2); this.cursor = Object.assign({}, s, { count: h }); s.count -= h; if (s.count <= 0) slots[i] = null; } }
      else if (!s) { slots[i] = Object.assign({}, c, { count: 1 }); c.count--; if (c.count <= 0) this.cursor = null; }
      else if (s.id === c.id && s.count < MC.maxStack(s.id) && s.dur === undefined) { s.count++; c.count--; if (c.count <= 0) this.cursor = null; }
      else { slots[i] = c; this.cursor = s; }
    }
    if (MC.Audio) MC.Audio.play('click', null, 0.5);
    this.refreshScreen();
  }
  _gridEl(container, from, to, cols, quickTarget) {
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 48px)`;
    for (let i = from; i < to; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = this._slotHTML();
      this._fillSlot(el, container.slots[i]);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this._clickSlot(container, i, e.button === 2 ? 2 : 0, e.shiftKey, quickTarget); });
      el.addEventListener('mouseenter', () => { const s = container.slots[i]; this._hover(s ? s.id : 0); });
      if (container === this.game.player.inv && i === this.game.player.selected) el.classList.add('sel');
      grid.appendChild(el);
    }
    return grid;
  }
  _hover(id) {
    const el = document.getElementById('invname');
    if (!el) return;
    if (!id) { el.textContent = ''; return; }
    const it = MC.itemDef(id);
    let t = (it && it.legendary ? '★ ' : '') + MC.itemName(id);
    const tool = MC.toolOf(id), food = MC.foodOf(id), arm = MC.armorOf && MC.armorOf(id);
    if (tool) t += `  （攻撃力 ${tool.damage}）`;
    if (arm) t += `  （防御 ${Math.round(arm.armor * 100)}%）`;
    if (food && food.hunger) t += `  （満腹度 +${food.hunger}）`;
    if (it && it.desc) t += ' ― ' + it.desc;
    el.textContent = t;
    el.classList.toggle('legend', !!(it && it.legendary));
  }
  _playerInvEl(quick, title = true) {
    const p = this.game.player;
    const box = document.createElement('div');
    if (title) { const t = document.createElement('div'); t.className = 'inv-title'; t.textContent = 'インベントリ'; box.appendChild(t); }
    box.appendChild(this._gridEl(p.inv, 9, 36, 9, quick));
    const gap = document.createElement('div'); gap.className = 'gap'; box.appendChild(gap);
    box.appendChild(this._gridEl(p.inv, 0, 9, 9, quick));
    const nm = document.createElement('div'); nm.id = 'invname'; box.appendChild(nm);
    return box;
  }
  refreshScreen(first) {
    const sc = this.screen;
    if (!sc) return;
    const panel = this.$('screenpanel');
    const scroll = {};
    panel.querySelectorAll('[data-scroll]').forEach((el) => { scroll[el.dataset.scroll] = el.scrollTop; });
    panel.innerHTML = '';
    const p = this.game.player, inv = p.inv;
    const toMain = (s) => inv.add(s, [...Array(27).keys()].map((k) => k + 9));
    const toHot = (s) => inv.add(s, [...Array(9).keys()]);
    if (sc.kind === 'inventory') {
      const left = document.createElement('div');
      left.innerHTML = '<h2>インベントリ</h2>';
      // shift-click moves between hotbar and main inventory
      const quick = (s) => (inv.slots.indexOf(s) < 9 ? toMain(s) : toHot(s));
      // worn armour (甲冑)
      const arow = document.createElement('div'); arow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
      arow.appendChild(this._gridEl(p.armor, 0, 1, 1, (s) => inv.add(s)));
      const ad = p.armorDef(), alab = document.createElement('div'); alab.className = 'inv-title';
      alab.textContent = ad ? `甲冑: ${ad.name}（受けるダメージ -${Math.round(ad.armor * 100)}%）` : '甲冑: なし（胴丸・具足などを置くか、手に持って右クリック）';
      arow.appendChild(alab);
      left.appendChild(arow);
      left.appendChild(this._playerInvEl(quick, false));
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.innerHTML = 'クリック: 持つ／置く ・ 右クリック: 半分／1個 ・ Shift+クリック: 移動 ・ 枠外クリック: 捨てる';
      left.appendChild(hint);
      panel.appendChild(left);
      panel.appendChild(this._craftingEl(sc.near));
    } else if (sc.kind === 'creative') {
      const left = document.createElement('div');
      left.innerHTML = '<h2>クリエイティブ</h2>';
      const tabs = document.createElement('div'); tabs.className = 'tabs';
      for (const [k, n] of [['blocks', 'ブロック'], ['items', 'アイテム・道具']]) {
        const b = document.createElement('button'); b.textContent = n;
        if (sc.tab === k) b.classList.add('sel');
        b.addEventListener('mousedown', (e) => { e.stopPropagation(); sc.tab = k; this.refreshScreen(); });
        tabs.appendChild(b);
      }
      left.appendChild(tabs);
      const cat = document.createElement('div'); cat.className = 'catalog'; cat.dataset.scroll = 'cat';
      const ids = sc.tab === 'blocks' ? MC.catalogBlocks() : MC.catalogItems();
      for (const id of ids) {
        const el = document.createElement('div'); el.className = 'slot';
        el.innerHTML = '<img alt="">';
        el.querySelector('img').src = this.icons[id];
        el.addEventListener('mouseenter', () => this._hover(id));
        el.addEventListener('mousedown', (e) => {
          e.preventDefault(); e.stopPropagation();
          const st = MC.makeStack(id, e.button === 2 ? 1 : MC.maxStack(id));
          if (e.shiftKey || (!this.cursor && e.button === 0 && !e.altKey && false)) { inv.slots[p.selected] = st; this.updateHotbar(); return; }
          if (this.cursor && this.cursor.id === id) this.cursor.count = Math.min(MC.maxStack(id), this.cursor.count + (e.button === 2 ? 1 : MC.maxStack(id)));
          else this.cursor = st;
          this.refreshScreen();
        });
        cat.appendChild(el);
      }
      left.appendChild(cat);
      const gap = document.createElement('div'); gap.className = 'gap'; left.appendChild(gap);
      const t = document.createElement('div'); t.className = 'inv-title'; t.textContent = 'ホットバー（ゴミ箱: 右端）';
      left.appendChild(t);
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '10px';
      row.appendChild(this._gridEl(inv, 0, 9, 9, null));
      const trash = document.createElement('div'); trash.className = 'slot'; trash.style.pointerEvents = 'auto'; trash.style.cursor = 'pointer'; trash.style.width = '48px'; trash.style.height = '48px';
      trash.innerHTML = '<span style="font-size:22px">🗑</span>';
      trash.addEventListener('mousedown', (e) => { e.stopPropagation(); this.cursor = null; this.refreshScreen(); });
      row.appendChild(trash);
      left.appendChild(row);
      const nm = document.createElement('div'); nm.id = 'invname'; left.appendChild(nm);
      const hint = document.createElement('div'); hint.className = 'hint';
      hint.textContent = 'クリックで持つ（右クリックで1個）・ Shift+クリックで選択中のスロットへ ・ Eで閉じる';
      left.appendChild(hint);
      panel.appendChild(left);
    } else if (sc.kind === 'chest') {
      const left = document.createElement('div');
      left.innerHTML = '<h2>チェスト</h2>';
      const ch = sc.chest;
      const toPlayer = (s) => inv.add(s);
      left.appendChild(this._gridEl(ch, 0, 27, 9, toPlayer));
      const gap = document.createElement('div'); gap.className = 'gap'; left.appendChild(gap);
      const toChest = (s) => this._addTo(ch, s);
      left.appendChild(this._playerInvEl(toChest));
      panel.appendChild(left);
      this.game.world.editsDirty = true;
    } else if (sc.kind === 'trade') {
      const v = sc.villager;
      const prof = MC.PROFESSIONS[v.prof];
      const left = document.createElement('div');
      left.innerHTML = `<h2>${v.label || `村人（${prof.name}）`}との取引</h2>`;
      const list = document.createElement('div'); list.style.minWidth = '340px';
      for (const tr of prof.trades) {
        const [c1, c2, res] = tr;
        const ok = this._hasItems(inv, c1) && (!c2 || this._hasItems(inv, c2));
        const row = document.createElement('div'); row.className = 'trade' + (ok || p.creative ? '' : ' no');
        const itEl = (k, n) => `<div class="it"><img src="${this.icons[MC.idOf(k)]}" alt=""><span class="cnt">${n > 1 ? n : ''}</span></div>`;
        row.innerHTML = itEl(c1[0], c1[1]) + (c2 ? '<span>+</span>' + itEl(c2[0], c2[1]) : '') + '<span class="arrow">→</span>' + itEl(res[0], res[1]) +
          `<span style="font-size:12px;color:var(--muted);margin-left:6px">${MC.itemName(MC.idOf(res[0]))}</span>`;
        row.addEventListener('mouseenter', () => this._hover(MC.idOf(res[0])));
        row.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          if (!this._hasItems(inv, c1) || (c2 && !this._hasItems(inv, c2))) { if (MC.Audio) MC.Audio.play('villager_no', v.center(), 0.9); return; }
          inv.remove((x) => x === MC.idOf(c1[0]), c1[1]);
          if (c2) inv.remove((x) => x === MC.idOf(c2[0]), c2[1]);
          const out = MC.makeStack(MC.idOf(res[0]), res[1]);
          const lf = inv.add(out);
          if (lf) p.dropStack(Object.assign({}, out, { count: lf }));
          if (MC.Audio) { MC.Audio.play('villager_yes', v.center(), 0.9); MC.Audio.play('trade', null, 0.5); }
          if (this.game.particles) { const c = v.center(); this.game.particles.sparkle(c[0], c[1] + 0.6, c[2], 8); }
          this.refreshScreen();
          this.updateHotbar();
        });
        list.appendChild(row);
      }
      left.appendChild(list);
      const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'エメラルドは鉱石・村のチェスト・取引で手に入ります';
      left.appendChild(hint);
      panel.appendChild(left);
      const right = document.createElement('div');
      right.appendChild(this._playerInvEl(null));
      panel.appendChild(right);
    }
    else if (MC.UI.SCREENS && MC.UI.SCREENS[sc.kind]) MC.UI.SCREENS[sc.kind].call(this, panel, sc);
    panel.querySelectorAll('[data-scroll]').forEach((el) => { if (scroll[el.dataset.scroll]) el.scrollTop = scroll[el.dataset.scroll]; });
    this._renderCursor();
    for (let i = 0; i < 9; i++) { this._fillSlot(this.slots[i], inv.slots[i]); }
    void first;
  }
  _addTo(container, s) {
    let left = s.count;
    const max = MC.maxStack(s.id);
    for (const t of container.slots) { if (t && t.id === s.id && t.count < max && t.dur === undefined && s.dur === undefined) { const n = Math.min(left, max - t.count); t.count += n; left -= n; if (!left) return 0; } }
    for (let i = 0; i < container.slots.length; i++) if (!container.slots[i]) { container.slots[i] = Object.assign({}, s, { count: left }); return 0; }
    return left;
  }
  _hasItems(inv, [key, n]) { const id = MC.idOf(key); return inv.count((x) => x === id) >= n; }

  _craftingEl(near) {
    const p = this.game.player, C = MC.Crafting;
    const box = document.createElement('div'); box.className = 'side';
    const head = document.createElement('div');
    head.innerHTML = `<h2>クラフト</h2><div class="sub" style="margin-bottom:8px">近くの設備: ${near.table ? '作業台 ✔' : '作業台 ✘'} ・ ${near.furnace ? 'かまど ✔' : 'かまど ✘'} ・ 燃料 ${Math.floor(C.fuelUnits(p))} 回分</div>`;
    box.appendChild(head);
    const filt = document.createElement('label'); filt.className = 'setting check'; filt.style.marginBottom = '6px';
    filt.innerHTML = '<input type="checkbox"><span>作れるものだけ表示</span>';
    const fin = filt.querySelector('input');
    fin.checked = !!this._onlyCraftable;
    fin.addEventListener('change', () => { this._onlyCraftable = fin.checked; this.refreshScreen(); });
    box.appendChild(filt);
    const list = document.createElement('div'); list.className = 'recipes'; list.dataset.scroll = 'recipes';
    const recs = MC.RECIPES.map((r) => ({ r, miss: C.check(p, r, near) }));
    recs.sort((a, b) => (a.miss ? 1 : 0) - (b.miss ? 1 : 0));
    for (const { r, miss } of recs) {
      if (this._onlyCraftable && miss) continue;
      const outId = MC.idOf(r.out[0]);
      const row = document.createElement('div'); row.className = 'recipe' + (miss ? ' no' : '');
      const ings = r.in.map(([k, n]) => {
        const have = p.inv.count(C.matcher(k));
        return `<span class="${have < n ? 'miss' : ''}"><img src="${this.icons[C.ingIcon(k)]}" alt="">${C.ingName(k)}×${n}</span>`;
      }).join('');
      const tag = r.station === 'table' ? '<span class="tag">作業台</span>' : r.station === 'furnace' ? '<span class="tag">かまど</span>' : '';
      row.innerHTML = `<div class="out"><img src="${this.icons[outId]}" alt=""><span class="cnt">${r.out[1] > 1 ? r.out[1] : ''}</span></div>
        <div class="name"><div>${MC.itemName(outId)}${tag}</div><div class="ings">${ings}</div></div>`;
      row.addEventListener('mouseenter', () => this._hover(outId));
      row.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (C.check(p, r, near)) { if (MC.Audio) MC.Audio.play('no', null, 0.4); return; }
        let n = e.shiftKey ? 16 : 1;
        while (n-- > 0 && C.craft(p, r, near)) { /* craft repeatedly */ }
        if (MC.Audio) MC.Audio.play(r.station === 'furnace' ? 'fire' : 'click', null, 0.6);
        this.refreshScreen();
        this.updateHotbar();
      });
      list.appendChild(row);
    }
    box.appendChild(list);
    const hint = document.createElement('div'); hint.className = 'hint';
    hint.textContent = 'クリックでクラフト（Shift+クリックでまとめて）。「作業台」は近くに作業台、「かまど」は近くにかまどと燃料（石炭・木材など）が必要です。';
    box.appendChild(hint);
    return box;
  }
};
