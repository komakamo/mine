'use strict';
// Kingdom screens and HUD: the founding dialog (name + colours), the kingdom screen (construction orders
// handed to the master builder, the state of the realm, orders for the army), the kingdom line under the
// clock, the raid bar and the throne / L-key entry points.
(function () {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rgb = (c) => { const v = MC.WOOL_TINT[c] || [1, 1, 1]; return `rgb(${v.map((x) => Math.round(x * 255)).join(',')})`; };
  const DIRS8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  const dirTo = (from, to) => {
    const a = Math.atan2(to[0] - from[0], -(to[2] - from[2]));
    return DIRS8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  };
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const onDown = (e, fn) => e.addEventListener('mousedown', (ev) => { ev.stopPropagation(); fn(ev); });

  MC.UI.SCREENS = MC.UI.SCREENS || {};

  // ---------------------------------------------------------------- founding
  MC.UI.SCREENS.found = function (panel, sc) {
    const game = this.game;
    const site = MC.Kingdom.siteById(game.world.gen, sc.siteId);
    const box = el('div', 'kwrap');
    box.appendChild(el('h2', '', '👑 建国'));
    box.appendChild(el('div', 'sub', `<b>${esc(site ? site.name : '城')}</b>を制圧した。この城を都として、あなたの王国を興そう。`));
    const f1 = el('div', 'kfield', '<div class="klabel">王国の名前</div>');
    const row = el('div', 'krow');
    const inp = el('input', 'ktext');
    inp.type = 'text'; inp.maxLength = 16; inp.value = sc.name;
    inp.addEventListener('input', () => { sc.name = inp.value; });
    inp.addEventListener('focus', () => { sc.focus = true; });
    inp.addEventListener('blur', () => { sc.focus = false; });
    inp.addEventListener('mousedown', (e) => e.stopPropagation());
    const dice = el('button', '', '🎲');
    dice.title = '別の名前';
    onDown(dice, () => { sc.name = MC.kingdomName(); this.refreshScreen(); });
    row.appendChild(inp); row.appendChild(dice);
    f1.appendChild(row);
    box.appendChild(f1);
    const f2 = el('div', 'kfield', '<div class="klabel">王国の色 ― 旗・城の垂れ幕・兵士の装束がこの色になる</div>');
    const sw = el('div', 'swatches');
    for (const [c, nm] of MC.KINGDOM_COLORS) {
      const s = el('div', 'swatch' + (sc.color === c ? ' sel' : ''));
      s.style.background = rgb(c); s.title = nm;
      onDown(s, () => { sc.color = c; this.refreshScreen(); });
      sw.appendChild(s);
    }
    f2.appendChild(sw);
    f2.appendChild(el('div', 'kcolname', MC.KINGDOM_COLORS.find((e) => e[0] === sc.color)[1] + 'の旗'));
    box.appendChild(f2);
    box.appendChild(el('div', 'hint', '建国すると建築家・剣士・弓兵・農夫が城に集まり、城門の先に広場と大通りが造られます。<br>' +
      '建築家に資材を渡すと、民家・農場・兵舎・見張り塔・厩舎・城壁などが土地に合わせて建ち、王国が広がっていきます。<br>' +
      '夕暮れには敵軍が攻めてくることがあります（設定で無効にできます）。'));
    const btns = el('div', 'btnrow');
    const later = el('button', '', 'あとで');
    onDown(later, () => { game.resume(); game.ui.toast('建国はいつでもできる', '玉座を右クリック、またはLキー'); });
    const ok = el('button', 'primary', '建国を宣言する');
    onDown(ok, () => {
      const name = (sc.name || '').trim() || MC.kingdomName();
      if (!site) return;
      const k = MC.Kingdom.found(game, site, name, sc.color);
      game.resume();
      game.ui.toast(`${k.name}の建国を宣言した！`, '民と兵が集い、新たな王国の歴史が始まる');
      if (MC.Audio) { MC.Audio.play('levelup', null, 1); MC.Audio.play('bell', null, 0.7); MC.Audio.play('horn', null, 0.6, 1.2); }
      const p = game.player.pos;
      if (game.particles) for (let i = 0; i < 3; i++) game.particles.sparkle(p[0], p[1] + 1 + i * 0.4, p[2], 20, [1.3, 1.1, 0.4]);
    });
    btns.appendChild(later); btns.appendChild(ok);
    box.appendChild(btns);
    panel.appendChild(box);
    if (sc.focus || sc.first) { sc.first = false; setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0); }
  };

  // ---------------------------------------------------------------- kingdom screen
  MC.UI.SCREENS.kingdom = function (panel, sc) {
    const game = this.game, k = game.kingdom, P = game.player, KP = MC.KingdomPeople;
    const box = el('div', 'kwrap kwide');
    if (!k) { panel.appendChild(box); return; }
    const rank = MC.Kingdom.rank(k), counts = KP.counts(k);
    let pop = 0, army = 0;
    for (const t in counts) { pop += counts[t].alive; if (['k_swordsman', 'k_archer', 'k_knight'].includes(t)) army += counts[t].alive; }
    const head = el('div', 'khead');
    head.innerHTML = `<span class="kflag" style="background:${rgb(k.color)}"></span><div><h2 style="margin:0">${esc(k.name)}</h2>` +
      `<div class="sub" style="margin:2px 0 0">${'★'.repeat(rank.stars)}${'☆'.repeat(5 - rank.stars)} ${rank.name} ・ 人口 ${pop} ・ 兵力 ${army} ・ 名声 ${k.fame} ・ 撃退した襲撃 ${k.raidsWon}</div></div>`;
    box.appendChild(head);
    const tabs = el('div', 'tabs');
    for (const [key, nm] of [['build', '🔨 建設'], ['status', '📜 王国の状況'], ['army', '⚔ 兵の指揮']]) {
      const b = el('button', sc.tab === key ? 'sel' : '', nm);
      onDown(b, () => { sc.tab = key; sc.msg = ''; this.refreshScreen(); });
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    if (sc.msg) box.appendChild(el('div', 'kmsg' + (sc.msgBad ? ' bad' : ''), esc(sc.msg)));
    if (sc.tab === 'build') buildTab.call(this, box, sc, k, P);
    else if (sc.tab === 'status') statusTab.call(this, box, sc, k, counts);
    else armyTab.call(this, box, sc, k, counts);
    panel.appendChild(box);
  };

  function buildTab(box, sc, k, P) {
    const game = this.game, KP = MC.KingdomPeople;
    const builder = KP.builder(k);
    const near = P.creative || (builder && Math.hypot(builder.pos[0] - P.pos[0], builder.pos[2] - P.pos[2]) < 10);
    if (!near) {
      const e = k.npcs.find((n) => n.type === 'k_builder');
      const where = builder ? `（建築家は${dirTo(P.pos, builder.pos)}へ ${Math.round(Math.hypot(builder.pos[0] - P.pos[0], builder.pos[2] - P.pos[2]))}m）` : e && e.dead ? `（建築家は ${Math.ceil(e.dead - k.t)}秒後に戻る）` : '';
      box.appendChild(el('div', 'kmsg', `建設の依頼は建築家に話しかけて資材を渡します${where}`));
    }
    const pending = k.buildings.filter((b) => !b.done);
    if (pending.length) {
      const q = el('div', 'kqueue');
      pending.forEach((b, i) => {
        const pct = Math.round(MC.Kingdom.progress(b) * 100);
        q.appendChild(el('div', 'kqrow', `<span>${i === 0 ? '🔨 建設中' : '⏳ 順番待ち'}: ${MC.KINGDOM_BUILDINGS[b.type].name}</span><div class="kprog"><i data-kprog="${b.id}" style="width:${pct}%"></i></div><span data-kpct="${b.id}">${pct}%</span>`));
      });
      box.appendChild(q);
    }
    const list = el('div', 'kgrid');
    list.dataset.scroll = 'kbuild';
    const C = MC.Crafting;
    for (const type of MC.KINGDOM_ORDER) {
      const def = MC.KINGDOM_BUILDINGS[type];
      const why = MC.Kingdom.blocker(game, type);
      const ok = !why && near;
      const row = el('div', 'kbld' + (ok ? '' : ' no'));
      const icon = this.icons[MC.idOf(def.icon)];
      const cost = def.cost.map(([key, n]) => {
        const have = P.inv.count(C.matcher(key));
        return `<span class="${have < n && !P.creative ? 'miss' : ''}"><img src="${this.icons[C.ingIcon(key)]}" alt="">${C.ingName(key)}×${n}</span>`;
      }).join('');
      const cnt = MC.Kingdom.count(k, type), max = MC.Kingdom.maxOf(k, type);
      row.innerHTML = `<div class="ic"><img src="${icon}" alt=""></div><div class="info"><b>${def.name}</b> <span class="kcount">${cnt} / ${max}</span>` +
        `<div class="d">${def.desc}</div><div class="cost">${cost}</div></div>`;
      const btn = el('button', ok ? 'primary' : '', ok ? '依頼する' : why || '建築家のそばで');
      btn.disabled = !ok;
      onDown(btn, () => {
        if (!ok) return;
        const r = MC.Kingdom.order(game, type);
        sc.msg = r.ok ? `${def.name}の建設を依頼した。建築家が土地を選び、工事を始める` : r.msg;
        sc.msgBad = !r.ok;
        if (MC.Audio) MC.Audio.play(r.ok ? 'trade' : 'no', null, 0.6);
        this.refreshScreen(); this.updateHotbar();
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
    box.appendChild(list);
    box.appendChild(el('div', 'hint', '建物の場所・大きさ・形は、地形（傾斜・水辺・高台）と町の広がりに合わせて毎回変わります。資材はインベントリから渡されます。'));
  }

  function statusTab(box, sc, k, counts) {
    const game = this.game, S = game.settings;
    const people = [['k_swordsman', '剣士'], ['k_archer', '弓兵'], ['k_knight', '騎士'], ['k_builder', '建築家'], ['k_farmer', '農夫'], ['k_smith', '鍛冶職人'],
      ['k_merchant', '商人'], ['k_priest', '司祭'], ['k_citizen', '町民']];
    const grid = el('div', 'kstat');
    for (const [t, nm] of people) {
      const c = counts[t];
      if (!c) continue;
      grid.appendChild(el('div', '', `<b>${c.alive}${c.all > c.alive ? `<small> / ${c.all}</small>` : ''}</b>${nm}`));
    }
    box.appendChild(el('div', 'klabel', '王国の民（倒れた者は時間が経つと補充される）'));
    box.appendChild(grid);
    const bl = el('div', 'kstat');
    for (const type of MC.KINGDOM_ORDER) {
      const n = MC.Kingdom.count(k, type, true);
      if (n) bl.appendChild(el('div', '', `<b>${n}</b>${MC.KINGDOM_BUILDINGS[type].name}`));
    }
    box.appendChild(el('div', 'klabel', '建物'));
    box.appendChild(bl.childNodes.length ? bl : el('div', 'hint', 'まだ建物はない。建築家に建設を依頼しよう'));
    const raidLine = k.raid ? `⚔ 交戦中: ${k.raid.name}（残り ${k.raid.alive}体）` : !S.kingdomRaids ? '襲撃は無効になっている' : k.dusks < 2 && !k.raidsWon ? '建国を祝う最初の夜は平和に過ぎるだろう' : '夕暮れ時には敵軍の襲撃に備えよう';
    box.appendChild(el('div', 'klabel', '防衛'));
    box.appendChild(el('div', 'kmsg', `${raidLine}<br>撃退した襲撃: ${k.raidsWon}回 ・ 兵士の攻撃力ボーナス: +${k.bonus || 0}（鍛冶場）`));
    const opt = el('label', 'setting check');
    opt.style.pointerEvents = 'auto'; opt.style.marginTop = '8px';
    opt.innerHTML = '<input type="checkbox"><span>敵軍が王国を攻めてくる（設定と共通）</span>';
    const cb = opt.querySelector('input');
    cb.checked = !!S.kingdomRaids;
    cb.addEventListener('change', () => { S.kingdomRaids = cb.checked; game.onSettingChanged('kingdomRaids'); game.ui.refreshSettings(); this.refreshScreen(); });
    opt.addEventListener('mousedown', (e) => e.stopPropagation());
    box.appendChild(opt);
  }

  function armyTab(box, sc, k, counts) {
    const game = this.game, KP = MC.KingdomPeople;
    const n = (t) => (counts[t] ? counts[t].alive : 0);
    const following = k.npcs.filter((e) => !e.dead && e.order === 'follow').length;
    box.appendChild(el('div', 'kmsg', `剣士 ${n('k_swordsman')} ・ 弓兵 ${n('k_archer')} ・ 騎士 ${n('k_knight')}　―　陛下に随行中: ${following}人`));
    const orders = [
      ['全軍、我に続け！', ['soldier', 'knight', 'archer'], 'follow'], ['騎士団、我に続け！', ['knight'], 'follow'], ['剣士隊、我に続け！', ['soldier'], 'follow'],
      ['弓兵隊、我に続け！', ['archer'], 'follow'], ['全軍、持ち場に戻れ', ['soldier', 'knight', 'archer'], 'guard'],
    ];
    const grid = el('div', 'korders');
    for (const [label, roles, order] of orders) {
      const b = el('button', order === 'follow' ? 'primary' : '', label);
      onDown(b, () => {
        const c = KP.orderAll(game, k, roles, order);
        sc.msg = c ? (order === 'follow' ? `${c}人の兵が陛下に随行する` : `${c}人の兵が持ち場に戻る`) : '該当する兵がいない';
        sc.msgBad = !c;
        if (MC.Audio) MC.Audio.play(c ? 'villager_yes' : 'no', null, 0.6, 0.8);
        this.refreshScreen();
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    box.appendChild(el('div', 'hint', '兵士に直接話しかける（右クリック）と、その兵だけを随行させたり持ち場に戻したりできます。随行中の兵は陛下を守って戦い、遠く離れると追いついてきます。'));
  }

  // ---------------------------------------------------------------- entry points, HUD
  MC.KingdomUI = {
    openFound(game, siteId) {
      if (game.kingdom) return;
      game.ui._open('found', { siteId, name: MC.kingdomName(), color: MC.KINGDOM_COLORS[Math.floor(Math.random() * MC.KINGDOM_COLORS.length)][0], first: true });
    },
    open(game, tab = 'status') {
      if (!game.kingdom) return;
      game.ui._open('kingdom', { tab, msg: '' });
    },
    // L key
    key(game) {
      const p = game.player;
      if (game.kingdom) { MC.KingdomUI.open(game, 'status'); return; }
      const s = MC.Kingdom.conqueredCastleAt(game, p.pos[0], p.pos[2], 40);
      if (s) { MC.KingdomUI.openFound(game, s.id); return; }
      game.ui.toast('王国はまだない', '城主を倒して城を制圧すると、そこに建国できる');
    },
    // right click on the throne of a conquered castle
    useBlock(game, t) {
      const s = MC.Kingdom.conqueredCastleAt(game, t.x, t.z, 4);
      if (!s) return false;
      const plan = MC.Structures.castlePlan(game.world.gen, s);
      const th = plan.k && plan.k.throne;
      if (!th || Math.abs(t.x - th[0]) > 1 || Math.abs(t.y - th[1]) > 2 || Math.abs(t.z - th[2]) > 1) return false;
      if (game.kingdom) { if (game.kingdom.id === s.id) MC.KingdomUI.open(game, 'build'); else game.ui.toast('この城は制圧済みだ', `王国の都は${game.kingdom.name}にある`); return true; }
      MC.KingdomUI.openFound(game, s.id);
      return true;
    },
    // kingdom line under the clock (inside the realm) + live progress in the open screen
    hud(game) {
      const box = document.getElementById('kingdomhud'), k = game.kingdom, p = game.player;
      if (!box) return;
      const inside = k && Math.hypot(p.pos[0] - k.cx, p.pos[2] - k.cz) < MC.Kingdom.radius(k);
      box.classList.toggle('hidden', !inside);
      if (inside) {
        const counts = MC.KingdomPeople.counts(k);
        let pop = 0, army = 0;
        for (const t in counts) { pop += counts[t].alive; if (['k_swordsman', 'k_archer', 'k_knight'].includes(t)) army += counts[t].alive; }
        const b = MC.Kingdom.current(k), rank = MC.Kingdom.rank(k);
        const html = `<b>👑 ${esc(k.name)}</b> <span class="stars">${'★'.repeat(rank.stars)}</span><div class="sub">人口 ${pop} ・ 兵 ${army} ・ 名声 ${k.fame}</div>` +
          (b ? `<div class="sub">🔨 ${MC.KINGDOM_BUILDINGS[b.type].name}を建設中 ${Math.round(MC.Kingdom.progress(b) * 100)}%</div>` : '');
        if (box._html !== html) { box.innerHTML = html; box._html = html; }
      }
      const sc = game.ui.screen;
      if (sc && sc.kind === 'kingdom' && k) {
        for (const b of k.buildings) {
          if (b.done) continue;
          const pct = Math.round(MC.Kingdom.progress(b) * 100);
          const bar = document.querySelector(`[data-kprog="${b.id}"]`), t = document.querySelector(`[data-kpct="${b.id}"]`);
          if (bar) bar.style.width = pct + '%';
          if (t) t.textContent = pct + '%';
        }
        const done = k.buildings.filter((b) => b.done).length;
        if (sc.doneSeen !== undefined && sc.doneSeen !== done) game.ui.refreshScreen();
        sc.doneSeen = done;
      }
    },
    // raid bar in place of the boss bar; returns true when shown
    raidBar(game) {
      const k = game.kingdom, r = k && k.raid, box = document.getElementById('bossbar');
      if (!r || !box) return false;
      const p = game.player;
      if (Math.hypot(p.pos[0] - k.cx, p.pos[2] - k.cz) > MC.Kingdom.radius(k) + 60) return false;
      const left = r.alive + (r.total - r.spawned);
      box.classList.remove('hidden', 'lord');
      box.classList.add('raid');
      const nm = `⚔ ${r.name}の襲撃（${r.dir}） ― 残り ${left}体`;
      const n = document.getElementById('bossname');
      if (n.textContent !== nm) n.textContent = nm;
      document.getElementById('bosshp').style.width = Math.max(0, left / Math.max(1, r.total) * 100) + '%';
      return true;
    },
  };
})();
