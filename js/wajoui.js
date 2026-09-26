'use strict';
// Japanese Castle (和城) Warp UI:
// Allows selecting and warping to each of the 5 nearby types of Japanese castles:
// 平城 (hirajiro: 白鷺城), 平山城 (hirayama: 墨染城), 山城 (yamajiro: 鷹ノ巣城),
// 海城 (umijiro: 潮見城), 砦 (toride: 朽木砦).
// Triggered by right-clicking the dedicated item "和城の絵図" (wajo_scroll) or pressing J.
(function () {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rgb = (c) => {
    if (!c) return '#ffd27f';
    if (Array.isArray(c)) return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
    return c;
  };
  const DIRS8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  const dirTo = (from, to) => {
    const a = Math.atan2(to[0] - from[0], -(to[2] - from[2]));
    return DIRS8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  };
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const onDown = (e, fn) => {
    let lastT = 0;
    const trigger = (ev) => {
      ev.stopPropagation();
      const now = performance.now();
      if (now - lastT < 250) return;
      lastT = now;
      fn(ev);
    };
    e.addEventListener('mousedown', trigger);
    e.addEventListener('click', trigger);
  };

  MC.UI.SCREENS = MC.UI.SCREENS || {};

  // ---------------------------------------------------------------- warp execution
  MC.warpToWajo = function (game, site) {
    if (!site) return null;
    const p = game.player;
    const plan = MC.Structures.wajoPlan(game.world.gen, site);
    const g = plan.gate || [site.x, site.fy + 1, site.z];
    p.pos = [g[0] + 0.5, g[1] + 1, g[2] + 0.5];
    p.vel = [0, 0, 0];
    p.fallY = p.pos[1];
    p.pitch = 0;
    p.yaw = Math.atan2(site.x - g[0], -(site.z - g[2]));

    if (MC.Audio) {
      MC.Audio.play('unseal', null, 0.9);
      MC.Audio.play('magic', null, 0.8, 1.2);
      MC.Audio.play('bell', null, 0.6);
    }
    if (game.particles) {
      for (let i = 0; i < 4; i++) {
        game.particles.sparkle(p.pos[0], p.pos[1] + 0.4 + i * 0.4, p.pos[2], 26, [1.4, 1.2, 0.4]);
      }
    }
    const T = MC.WAJO_TYPES[site.kind] || { kind: site.kind };
    game.ui.toast(`${site.name}【${T.kind}】へ転移した！`, `大手門前（X:${Math.round(site.x)}, Y:${Math.round(site.fy)}, Z:${Math.round(site.z)}）へ移動`);
    return { site, gate: g, banner: plan.banner };
  };

  // ---------------------------------------------------------------- UI opener
  MC.UI.prototype.openWajoWarp = function () {
    const p = this.game.player;
    if (!p) return;
    const best = MC.Structures.nearestWajoAll(this.game.world.gen, p.pos[0], p.pos[2], 24);
    this._open('wajo_warp', { best });
  };

  // Extra architectural details per castle kind to display
  const KIND_DETAILS = {
    hirajiro: {
      tagTitle: '平城（ひらじろ）',
      subtitle: '水堀に囲まれた平城・輪郭式曲輪と白漆喰五重天守',
      defense: '輪郭式（二重水堀） ・ 枡形門・狭間壁・角櫓 ・ 白漆喰五重天守',
    },
    hirayama: {
      tagTitle: '平山城（ひらやまじろ）',
      subtitle: '丘陵の切石垣を重ねた要害・梯郭式曲輪と黒下見板四重天守',
      defense: '梯郭式（石垣段・空堀） ・ 重厚切石垣・高石垣 ・ 黒下見板四重天守',
    },
    yamajiro: {
      tagTitle: '山城（やまじろ）',
      subtitle: '山頂の尾根に曲輪と堀切を連ねた天然の要塞・茅葺主殿',
      defense: '連郭式（尾根段・堀切） ・ 竪堀・木柵・見張り櫓 ・ 茅葺主殿',
    },
    umijiro: {
      tagTitle: '海城（うみじろ）',
      subtitle: '海を天然の堀とする水城・青銅瓦三重天守と城内水門',
      defense: '水城式（海水外堀） ・ 海防石垣・水門 ・ 銅瓦三重天守',
    },
    toride: {
      tagTitle: '砦（とりで）',
      subtitle: '落ち武者の亡霊が守る平地・雪原の方形古砦・土塁陣所',
      defense: '方形単郭（土塁・空堀） ・ 木柵・物見台 ・ 落ち武者亡霊',
    },
  };

  // ---------------------------------------------------------------- wajo_warp screen
  MC.UI.SCREENS.wajo_warp = function (panel, sc) {
    const game = this.game, p = game.player;
    const box = el('div', 'wajowrap');

    // Header
    const head = el('div', 'wajo-head');
    head.innerHTML = `
      <div class="wajo-title-box">
        <div class="wajo-icon-emblem">🏯</div>
        <div>
          <h2 class="wajo-title">和城の絵図 ― 転移の道標</h2>
          <div class="wajo-subtitle">大地に築かれし五種の和城を探査。目的の城を選択して城門前へ即座に転移します</div>
        </div>
      </div>
      <div class="wajo-player-loc">📍 現在地: X: ${Math.round(p.pos[0])}, Y: ${Math.round(p.pos[1])}, Z: ${Math.round(p.pos[2])}</div>
    `;
    box.appendChild(head);

    // List container
    const list = el('div', 'wajo-grid');

    // Collect all 5 types
    const entries = [];
    const kinds = ['hirajiro', 'hirayama', 'yamajiro', 'umijiro', 'toride'];
    for (const kind of kinds) {
      const match = sc.best && sc.best[kind];
      if (match && match.site) {
        entries.push({
          kind,
          site: match.site,
          dist: match.dist,
        });
      }
    }

    // Sort by distance ascending
    entries.sort((a, b) => a.dist - b.dist);

    for (const entry of entries) {
      const site = entry.site;
      const typeInfo = MC.WAJO_TYPES[entry.kind] || {};
      const kd = KIND_DETAILS[entry.kind] || {};
      const distM = Math.round(entry.dist);
      const dir = dirTo([p.pos[0], p.pos[1], p.pos[2]], [site.x, site.fy, site.z]);
      const clanCol = rgb(typeInfo.clan);
      const seized = MC.Wajo && MC.Wajo.seized(game.world, site.id);
      const heirloomKey = MC.WAJO_REWARD[entry.kind];
      const heirloom = MC.itemDef(MC.idOf(heirloomKey)) || {};
      const heirloomIcon = this.icons[MC.idOf(heirloomKey)];

      const card = el('div', 'wajo-card');
      card.style.setProperty('--clan-col', clanCol);

      // Left column: Clan badge & flag
      const left = el('div', 'wajo-card-left');
      left.innerHTML = `
        <div class="wajo-card-flag" style="background:${clanCol}"></div>
        <div class="wajo-card-badge">${esc(typeInfo.kind || entry.kind)}</div>
      `;
      card.appendChild(left);

      // Main column: Details
      const main = el('div', 'wajo-card-main');
      const statusHtml = seized
        ? `<span class="wajo-status-tag seized">✔ 制圧済み</span>`
        : `<span class="wajo-status-tag unseized">⚔ 未制圧（旗印あり）</span>`;
      const snowyHtml = site.snowy ? `<span class="wajo-kind-tag">❄ 雪景色</span>` : '';

      main.innerHTML = `
        <div class="wajo-card-top">
          <span class="wajo-name">${esc(site.name)}</span>
          <span class="wajo-kind-tag">${esc(kd.tagTitle || typeInfo.kind)}</span>
          ${statusHtml}
          ${snowyHtml}
        </div>
        <div class="wajo-desc">${esc(typeInfo.sub || kd.subtitle || '')}</div>
        <div class="wajo-desc" style="color:rgba(255,255,255,0.65);font-size:11.5px">構え: ${esc(kd.defense || '')}</div>
        <div class="wajo-meta-row">
          <span class="wajo-dist-box">🧭 約 ${distM.toLocaleString()}m ${dir}</span>
          <span class="wajo-coords-box">座標: [X: ${site.x}, Y: ${site.fy}, Z: ${site.z}]</span>
          ${heirloom.name ? `
            <span class="wajo-heirloom-box" title="${esc(heirloom.desc || '')}">
              ${heirloomIcon ? `<img src="${heirloomIcon}" alt="">` : ''}
              家宝: <b style="color:#ffd27f">${esc(heirloom.name)}</b>
            </span>` : ''}
        </div>
      `;
      card.appendChild(main);

      // Right column: Action button
      const action = el('div', 'wajo-card-action');
      const warpBtn = el('button', 'wajo-warp-btn', '⚡ 転移する');
      warpBtn.title = `${site.name}（${typeInfo.kind}）の大手門前へ転移します`;
      onDown(warpBtn, () => {
        game.resume();
        MC.warpToWajo(game, site);
      });
      action.appendChild(warpBtn);
      card.appendChild(action);

      list.appendChild(card);
    }

    box.appendChild(list);

    // Footer
    const foot = el('div', 'wajo-foot');
    foot.innerHTML = `<div class="wajo-foot-hint">※ 転移すると城の大手門（正門）の前へ即座に移動します。EキーまたはEscキーで閉じます。</div>`;
    const closeBtn = el('button', '', '閉じる');
    onDown(closeBtn, () => {
      game.resume();
    });
    foot.appendChild(closeBtn);
    box.appendChild(foot);

    panel.appendChild(box);
  };
})();
