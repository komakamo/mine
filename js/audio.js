'use strict';
// Procedural sound: every effect is synthesised with WebAudio (noise bursts, filtered oscillators),
// positioned with distance attenuation and stereo panning. Includes rain ambience, cave drones and a
// generative ambient piano score.
MC.Audio = {
  ctx: null,
  ready: false,
  sfxVol: 0.8,
  musicVol: 0.5,
  listener: { pos: [0, 0, 0], yaw: 0 },
  _last: {},

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 1;
    this.muffle = ctx.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.master.connect(this.muffle); this.muffle.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master);
    // reverb (generated impulse)
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    // noise buffers
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const bb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.brown = bb;
    // rain loop
    this.rainSrc = ctx.createBufferSource(); this.rainSrc.buffer = nb; this.rainSrc.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 0.4;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    this.rainSrc.connect(rf); rf.connect(this.rainGain); this.rainGain.connect(this.sfx);
    this.rainSrc.start();
    this.ready = true;
    this.musicT = ctx.currentTime + 25;
    this.caveT = ctx.currentTime + 30;
  },
  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music * 0.9, this.ctx.currentTime, 0.2);
  },
  setListener(pos, yaw) { this.listener.pos = pos; this.listener.yaw = yaw; },
  update(dt, o) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(o.underwater ? 700 : 20000, t, 0.08);
    this.rainGain.gain.setTargetAtTime(o.rain * 0.22 * (o.sheltered ? 0.4 : 1), t, 0.3);
    if (this.musicVol > 0 && t > this.musicT && o.playing) { this.musicT = t + 150 + Math.random() * 180; this._playMusic(o.night); }
    if (t > this.caveT && o.playing) {
      this.caveT = t + 60 + Math.random() * 120;
      if (o.cave) this.play('cave', null, 0.6);
    }
  },

  // ---- helpers
  _out(pos, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let gain = vol;
    if (pos) {
      const L = this.listener;
      const dx = pos[0] - L.pos[0], dy = pos[1] - L.pos[1], dz = pos[2] - L.pos[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 32) return null;
      gain *= Math.pow(Math.max(0, 1 - d / 32), 1.6);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        const rx = Math.cos(L.yaw), rz = Math.sin(L.yaw);
        p.pan.value = MC.clamp((dx * rx + dz * rz) / Math.max(1, d), -1, 1) * 0.8;
        g.connect(p); p.connect(this.sfx);
      } else g.connect(this.sfx);
    } else g.connect(this.sfx);
    if (gain < 0.005) return null;
    g.gain.value = gain;
    return g;
  },
  _noise(out, t, dur, type, freq, q, a, peak, brown) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = brown ? this.brown : this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return f;
  },
  _tone(out, t, dur, type, f0, f1, a, peak, filt) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (filt) { const f = ctx.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; f.Q.value = filt[2] || 1; o.connect(f); n = f; }
    n.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  },
  _vibrato(osc, t, dur, rate, depth) {
    const ctx = this.ctx;
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate; lg.gain.value = depth;
    l.connect(lg); lg.connect(osc.frequency);
    l.start(t); l.stop(t + dur + 0.05);
  },

  MAT: ['stone', 'wood', 'grass', 'gravel', 'sand', 'glass', 'wool', 'metal', 'snow', 'water', 'grass'],
  // material step/break sound (sound index from MC.B_SOUND)
  block(kind, snd, pos, vol = 1) {
    const mat = this.MAT[snd] || 'stone';
    this.play(kind + '_' + mat, pos, vol);
  },

  play(name, pos, vol = 1, pitch = 1) {
    if (!this.ready || this.sfxVol <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    // rate limit identical sounds
    const lk = name;
    if (this._last[lk] && t - this._last[lk] < 0.03) return;
    this._last[lk] = t;
    const out = this._out(pos, vol);
    if (!out) return;
    const p = pitch * (0.94 + Math.random() * 0.12);
    const N = (...a) => this._noise(out, t + (a[7] || 0), ...a.slice(0, 7));
    const TN = (...a) => this._tone(out, t + (a[8] || 0), ...a.slice(0, 8));
    const [kind, mat] = name.split('_');
    if ((kind === 'step' || kind === 'dig' || kind === 'hit' || kind === 'place') && mat) {
      const len = kind === 'dig' ? 0.22 : kind === 'place' ? 0.12 : kind === 'hit' ? 0.07 : 0.09;
      const amp = kind === 'dig' ? 0.9 : kind === 'place' ? 0.7 : kind === 'hit' ? 0.35 : 0.3;
      const F = { stone: ['bandpass', 1700, 1.2], wood: ['bandpass', 650, 1.5], grass: ['lowpass', 1400, 0.7], gravel: ['bandpass', 1100, 0.8], sand: ['highpass', 1900, 0.5],
        glass: ['bandpass', 3200, 2], wool: ['lowpass', 500, 0.5], metal: ['bandpass', 2600, 3], snow: ['lowpass', 2200, 0.6], water: ['lowpass', 900, 0.5] }[mat] || ['bandpass', 1500, 1];
      N(len, F[0], F[1] * p, F[2], 0.005, amp);
      if (kind === 'dig' || kind === 'place') N(len * 0.8, F[0], F[1] * p * 1.3, F[2], 0.005, amp * 0.5, false, 0.04);
      if (mat === 'wood') TN(len, 'triangle', 170 * p, 120 * p, 0.004, amp * 0.5);
      if (mat === 'stone' && kind !== 'step') TN(len * 0.6, 'square', 140 * p, 90 * p, 0.003, amp * 0.12, ['lowpass', 600]);
      if (mat === 'metal') TN(len * 2.5, 'sine', 1250 * p, 1240 * p, 0.003, amp * 0.25);
      if (mat === 'glass' && kind === 'dig') { for (let i = 0; i < 5; i++) TN(0.2, 'sine', (1800 + Math.random() * 2400), 2000, 0.002, 0.15, null, i * 0.03); }
      return;
    }
    switch (name) {
      case 'pop': TN(0.09, 'sine', 500 * p, 1300 * p, 0.005, 0.5); break;
      case 'click': TN(0.03, 'square', 1800, 1600, 0.002, 0.08); break;
      case 'hurt': TN(0.2, 'triangle', 240 * p, 120 * p, 0.01, 0.8, ['lowpass', 1200]); N(0.12, 'bandpass', 900, 1, 0.005, 0.4); break;
      case 'death': TN(0.9, 'triangle', 260, 70, 0.01, 0.7, ['lowpass', 1000]); break;
      case 'burp': { const o = TN(0.35, 'triangle', 140 * p, 110 * p, 0.03, 0.6, ['lowpass', 700]); this._vibrato(o, t, 0.35, 28, 20); break; }
      case 'eat': for (let i = 0; i < 2; i++) N(0.07, 'bandpass', 1400 + Math.random() * 1200, 1.2, 0.004, 0.5, false, i * 0.06); break;
      case 'drink': TN(0.15, 'sine', 300, 500, 0.02, 0.4); break;
      case 'splash': N(0.7, 'lowpass', 1400, 0.5, 0.01, 0.8); N(0.4, 'bandpass', 3000, 1, 0.01, 0.3); break;
      case 'swim': N(0.35, 'lowpass', 900, 0.5, 0.05, 0.35); break;
      case 'fizz': N(0.5, 'highpass', 3500, 0.5, 0.01, 0.4); break;
      case 'fire': N(0.3, 'bandpass', 600, 0.8, 0.02, 0.3, true); break;
      case 'bow': TN(0.25, 'sawtooth', 380 * p, 180 * p, 0.003, 0.3, ['lowpass', 1500]); N(0.25, 'bandpass', 1800, 0.8, 0.01, 0.35, false, 0.02); break;
      case 'arrow_hit': N(0.08, 'bandpass', 700, 1.5, 0.003, 0.7); TN(0.1, 'sine', 170, 110, 0.003, 0.4); break;
      case 'attack': N(0.12, 'bandpass', 1300, 0.8, 0.004, 0.45); break;
      case 'crit': N(0.15, 'highpass', 2500, 0.7, 0.003, 0.5); TN(0.12, 'square', 900, 600, 0.003, 0.08); break;
      case 'explode': {
        N(2.2, 'lowpass', 900, 0.6, 0.005, 1.4, true);
        const f = N(1.4, 'lowpass', 3200, 0.8, 0.003, 1.0); f.frequency.exponentialRampToValueAtTime(200, t + 1.2);
        TN(1.2, 'sine', 75, 28, 0.005, 1.2);
        break;
      }
      case 'fuse': { const f = N(1.5, 'highpass', 3000, 0.6, 1.2, 0.5); void f; break; }
      case 'door_open': case 'door_close':
        TN(0.25, 'sawtooth', name === 'door_open' ? 140 : 180, name === 'door_open' ? 190 : 120, 0.02, 0.18, ['bandpass', 900, 3]);
        N(0.12, 'bandpass', 500, 1.2, 0.004, 0.6, false, 0.18); break;
      case 'chest_open': TN(0.4, 'sawtooth', 120, 170, 0.05, 0.15, ['bandpass', 700, 4]); N(0.1, 'bandpass', 400, 1, 0.004, 0.5, false, 0.35); break;
      case 'chest_close': N(0.15, 'bandpass', 380, 1, 0.004, 0.7); break;
      case 'trade': TN(0.12, 'triangle', 520, 660, 0.01, 0.35); TN(0.18, 'triangle', 660, 880, 0.01, 0.35, null, 0.1); break;
      case 'no': TN(0.3, 'triangle', 220, 160, 0.02, 0.4, ['lowpass', 900]); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => TN(0.3, 'triangle', f, f, 0.01, 0.25, null, i * 0.08)); break;
      case 'ignite': N(0.25, 'bandpass', 2500, 0.8, 0.005, 0.5); TN(0.1, 'square', 3000, 2000, 0.002, 0.08); break;
      // ---- castle magic / bosses
      case 'magic':
        TN(0.35, 'sine', 900 * p, 1800 * p, 0.01, 0.22); TN(0.35, 'triangle', 1350 * p, 2600 * p, 0.01, 0.12, null, 0.05);
        N(0.3, 'highpass', 4200, 0.7, 0.01, 0.12);
        break;
      case 'roar': {
        const o = TN(1.3, 'sawtooth', 95 * p, 52 * p, 0.08, 0.6, ['lowpass', 650, 2]);
        this._vibrato(o, t, 1.3, 9, 10);
        N(1.1, 'bandpass', 420, 1.4, 0.1, 0.4, true);
        break;
      }
      case 'freeze': N(0.5, 'highpass', 5200, 0.8, 0.005, 0.3); TN(0.4, 'sine', 2300 * p, 1400 * p, 0.005, 0.14); break;
      case 'slam': N(0.7, 'lowpass', 320, 0.7, 0.005, 1.0, true); TN(0.55, 'sine', 75 * p, 34 * p, 0.005, 0.8); break;
      case 'summon': TN(0.9, 'triangle', 190 * p, 620 * p, 0.12, 0.28, ['bandpass', 800, 3]); N(0.8, 'bandpass', 1300, 2, 0.2, 0.22); break;
      case 'unseal': [392, 523, 659, 784, 1047].forEach((f, i) => TN(0.5, 'sine', f, f, 0.01, 0.2, null, i * 0.09)); N(0.9, 'highpass', 3500, 0.6, 0.2, 0.12); break;
      // ---- the kingdom
      case 'horn': {
        // war horn: two long brassy notes
        for (const [f, d, o] of [[110, 0.9, 0], [147, 1.4, 0.75]]) {
          const h = TN(d, 'sawtooth', f * p, f * p * 1.01, 0.12, 0.45, ['lowpass', 900, 1.5], o);
          this._vibrato(h, t + o, d, 5, 2.5);
          TN(d, 'square', f * 2 * p, f * 2 * p, 0.15, 0.08, ['lowpass', 1400], o);
        }
        break;
      }
      case 'bell':
        for (let i = 0; i < 3; i++) for (const [m, a] of [[1, 0.3], [2.76, 0.12], [5.4, 0.05]]) TN(1.6, 'sine', 620 * m * p, 618 * m * p, 0.004, a, null, i * 0.55);
        break;
      case 'hammer': N(0.06, 'bandpass', 1800 * p, 1.5, 0.002, 0.6); TN(0.09, 'triangle', 420 * p, 300 * p, 0.002, 0.3); break;
      // ---- the Japanese castles
      case 'gunshot':
        // matchlock: a sharp crack, a heavy boom and a rolling echo
        N(0.08, 'highpass', 2200, 0.7, 0.001, 1.1);
        N(0.9, 'lowpass', 700, 0.6, 0.003, 1.2, true);
        TN(0.35, 'sine', 110 * p, 45 * p, 0.002, 0.7);
        N(1.4, 'bandpass', 400, 0.8, 0.25, 0.18, true, 0.15);
        break;
      case 'shuriken':
        // whoosh of spinning steel
        for (let i = 0; i < 3; i++) N(0.12, 'bandpass', 2600 + i * 700, 2.5, 0.01, 0.35, false, i * 0.05);
        TN(0.18, 'triangle', 1900 * p, 2600 * p, 0.005, 0.05);
        break;
      case 'anvil': N(0.05, 'highpass', 3000, 0.8, 0.002, 0.5); TN(0.7, 'sine', 1560 * p, 1550 * p, 0.002, 0.18); TN(0.5, 'sine', 2480 * p, 2470 * p, 0.002, 0.08); break;
      case 'horse_say': case 'horse_hurt': case 'horse_death': {
        const dur = name.endsWith('death') ? 1.1 : name.endsWith('hurt') ? 0.4 : 0.9;
        const o = TN(dur, 'sawtooth', 820 * p, 380 * p, 0.03, 0.3, ['bandpass', 1300, 2]);
        this._vibrato(o, t, dur, 16, 70);
        N(dur * 0.5, 'bandpass', 900, 1.2, 0.05, 0.15, true, dur * 0.5);
        break;
      }
      case 'cave': {
        const a = TN(4.5, 'sine', 55, 52, 1.5, 0.5); const b = TN(4.5, 'sine', 58, 49, 1.8, 0.4);
        void a; void b;
        N(4, 'bandpass', 300, 2, 2, 0.25, true);
        break;
      }
      // ---- mobs
      case 'zombie_say': case 'zombie_hurt': case 'zombie_death': {
        const dur = name.endsWith('death') ? 1.2 : name.endsWith('hurt') ? 0.35 : 0.9;
        const o = TN(dur, 'sawtooth', (name.endsWith('hurt') ? 130 : 85) * p, (name.endsWith('death') ? 45 : 75) * p, 0.06, 0.45, ['bandpass', 420, 2.5]);
        this._vibrato(o, t, dur, 7, 8);
        N(dur * 0.8, 'bandpass', 600, 2, 0.1, 0.12, true);
        break;
      }
      case 'skeleton_say': case 'skeleton_hurt': case 'skeleton_death': {
        const n = name.endsWith('death') ? 10 : name.endsWith('hurt') ? 4 : 5;
        for (let i = 0; i < n; i++) N(0.035, 'highpass', 2500 + Math.random() * 2000, 1, 0.002, 0.45, false, i * (0.05 + Math.random() * 0.04));
        break;
      }
      case 'spider_say': case 'spider_hurt': case 'spider_death': {
        const dur = name.endsWith('death') ? 0.9 : 0.4;
        N(dur, 'highpass', 3800, 0.8, 0.03, 0.4);
        TN(dur, 'sawtooth', 160 * p, 110 * p, 0.02, 0.12, ['lowpass', 500]);
        break;
      }
      case 'creeper_hurt': case 'creeper_death': N(0.3, 'bandpass', 1200, 0.7, 0.01, 0.5); break;
      case 'pig_say': case 'pig_hurt': case 'pig_death':
        for (let i = 0; i < (name.endsWith('say') ? 2 : 1); i++) TN(0.14, 'square', (name.endsWith('say') ? 280 : 480) * p, (name.endsWith('say') ? 200 : 300) * p, 0.01, 0.25, ['lowpass', 1100], i * 0.18);
        N(0.12, 'bandpass', 700, 2, 0.01, 0.2);
        break;
      case 'cow_say': case 'cow_hurt': case 'cow_death': {
        const dur = name.endsWith('say') ? 1.3 : 0.45;
        const o = TN(dur, 'sawtooth', 125 * p, (name.endsWith('say') ? 98 : 160) * p, 0.12, 0.4, ['lowpass', 650, 3]);
        this._vibrato(o, t, dur, 5, 3);
        break;
      }
      case 'sheep_say': case 'sheep_hurt': case 'sheep_death': {
        const dur = name.endsWith('say') ? 0.75 : 0.4;
        const o = TN(dur, 'sawtooth', 340 * p, 300 * p, 0.04, 0.3, ['bandpass', 1200, 2]);
        this._vibrato(o, t, dur, 11, 22);
        break;
      }
      case 'chicken_say': case 'chicken_hurt': case 'chicken_death':
        for (let i = 0; i < (name.endsWith('say') ? 3 : 2); i++) TN(0.06, 'triangle', (1000 + Math.random() * 300) * p, 700 * p, 0.005, 0.25, ['bandpass', 1400, 2], i * 0.09);
        break;
      case 'villager_say': case 'villager_hurt': case 'villager_death': case 'villager_yes': case 'villager_no': {
        const hi = name.endsWith('hurt') ? 1.5 : 1;
        const o = TN(0.45, 'sawtooth', 170 * p * hi, (name.endsWith('no') ? 130 : 210) * p * hi, 0.03, 0.35, ['bandpass', 650, 3]);
        const o2 = this._tone(out, t + 0.22, 0.3, 'sawtooth', 210 * p * hi, 160 * p * hi, 0.03, 0.25, ['bandpass', 650, 3]);
        void o; void o2;
        break;
      }
      default: break;
    }
  },

  // ---- generative ambient score
  _playMusic(night) {
    const ctx = this.ctx;
    const base = ctx.currentTime + 0.5;
    const scaleMaj = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const scaleMin = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
    const sc = night ? scaleMin : scaleMaj;
    const root = 48 + Math.floor(Math.random() * 5) * 2 - 2;
    const f = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const note = (t, midi, dur, vel) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      for (const [h, a] of [[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f(midi) * h * (1 + (Math.random() - 0.5) * 0.002);
        const og = ctx.createGain(); og.gain.value = a;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.1);
      }
      lp.connect(g); g.connect(this.music); g.connect(this.reverb);
    };
    let t = base, deg = 4 + Math.floor(Math.random() * 3);
    const bars = 10 + Math.floor(Math.random() * 8);
    for (let b = 0; b < bars; b++) {
      // sparse chord
      if (b % 2 === 0) {
        const cr = [0, 4, 7].map((i) => root - 12 + sc[(Math.floor(Math.random() * 3) * 2 + i) % sc.length]);
        cr.forEach((m, i) => note(t + i * 0.05, m, 5, 0.05));
      }
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        deg = MC.clamp(deg + Math.floor(Math.random() * 5) - 2, 0, sc.length - 1);
        note(t + i * (0.9 + Math.random() * 0.6), root + sc[deg], 3.5, 0.07 + Math.random() * 0.04);
      }
      t += 2.6 + Math.random() * 1.4;
    }
  },
};
