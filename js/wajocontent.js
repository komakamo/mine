'use strict';
// Japanese castle (和城) content: the building blocks of stone walls, plastered and boarded walls, tiled /
// copper / thatched roofs, tatami, shoji, lattice windows, golden shachihoko, stone and paper lanterns,
// gate leaves and the general's standard (大将の旗印) whose fall marks the capture of a castle; the
// swords, spears, bows, shuriken, matchlock and armour (甲冑) of the samurai, recipes, mob drops and loot.
// Textures: wajotex.js, generation: wajo.js, mobs and capture: wajomobs.js.
(function () {
  const K = MC.blockKit, S = MC.SHAPE, M = MC.MAT, TL = MC.TOOL, SN = MC.SOUND;
  const PICK = K.PICK, WOOD = K.WOOD;

  // ---------------------------------------------------------------- blocks
  for (const t of ['ishigaki', 'kirishi', 'kirishi_top', 'shikkui', 'hazama', 'namako', 'kuro_itabari', 'kuro_itabari_top', 'kawara', 'dogawara',
    'kaya', 'kaya_top', 'tatami', 'tatami_side', 'shoji', 'shoji_edge', 'renji', 'renji_edge', 'shachi', 'toro_fire', 'chochin', 'chochin_cap',
    'mon_door', 'hata_pole', 'hata_lower', 'hata_upper', 'nobori']) MC.addTile(t);
  // stone walls: rough fitted stones and dressed corner / cap stones
  K.add('ishigaki', '石垣', { tex: { all: 'ishigaki' }, hard: 2, ...PICK, tier: 1 });
  K.add('kirishi', '切石', { tex: { side: 'kirishi', top: 'kirishi_top' }, hard: 2, ...PICK, tier: 1 });
  // walls: white plaster, plaster with a loophole, namako tiles, black weatherboards
  K.add('shikkui', '白漆喰の壁', { tex: { all: 'shikkui' }, hard: 1.2, ...PICK });
  K.add('hazama', '狭間のある漆喰壁', { tex: { side: 'hazama', top: 'shikkui', bottom: 'shikkui' }, hard: 1.2, ...PICK });
  K.add('namako', 'なまこ壁', { tex: { side: 'namako', top: 'shikkui', bottom: 'shikkui' }, hard: 1.5, ...PICK });
  K.add('kuro_itabari', '黒の下見板', { tex: { side: 'kuro_itabari', top: 'kuro_itabari_top' }, hard: 2, ...WOOD });
  // roofs: fired clay tiles, green copper tiles, thatch
  for (const [k, n, tex, o] of [['kawara', '瓦', 'kawara', { hard: 1.5, ...PICK }], ['dogawara', '銅瓦', 'dogawara', { hard: 2, ...PICK, sound: SN.METAL }],
    ['kaya', '茅葺き', null, { hard: 0.5, tool: TL.HOE, sound: SN.GRASS }]]) {
    const t = tex ? { all: tex } : { side: 'kaya', top: 'kaya_top' };
    K.add(k, n + (k === 'kaya' ? '' : '屋根'), { tex: t, ...o });
    K.slab(k + '_slab', n + 'のハーフブロック', t, o);
    K.stairs(k + '_stairs', n + 'の階段', t, o);
  }
  // interior
  K.add('tatami', '畳', { tex: { side: 'tatami_side', top: 'tatami', bottom: 'tatami_side' }, hard: 0.6, sound: SN.WOOL, tool: TL.AXE });
  K.add('shoji', '障子', { tex: { all: 'shoji', top: 'shoji_edge' }, shape: S.PANE, mat: M.CUTOUT, opacity: 0, cullSame: false, hard: 0.3, sound: SN.WOOD, tool: TL.AXE });
  K.add('renji', '連子窓', { tex: { all: 'renji', top: 'renji_edge' }, shape: S.PANE, mat: M.CUTOUT, opacity: 0, cullSame: false, hard: 1, ...WOOD });
  K.add('mon_door', '城門の扉', { tex: { side: 'mon_door', top: 'kuro_itabari_top' }, hard: 3, ...WOOD });
  // golden shachihoko on the ridge ends (head on the ridge, tail raised towards the facing)
  const GOLD = K.faceTiles({ all: 'gold_block' }), SHACHI = K.faceTiles({ all: 'gold_block', pz: 'shachi', nz: 'shachi' });
  const SHACHI_BOX = [
    { b: [5, 0, 3, 11, 5, 11], tex: SHACHI }, { b: [5.5, 5, 5, 10.5, 9, 12], tex: GOLD }, { b: [6, 9, 8, 10, 12, 13], tex: GOLD },
    { b: [4, 12, 10, 12, 16, 12], tex: GOLD }, { b: [4, 3, 6, 5, 6, 9], tex: GOLD }, { b: [11, 3, 6, 12, 6, 9], tex: GOLD },
  ];
  K.addFacing('shachihoko', '金の鯱', (r) => {
    const bx = K.rotBoxes(SHACHI_BOX, r);
    return { tex: { all: 'gold_block' }, shape: S.BOXES, boxes: bx, coll: [K.pxBox(MC.rotBox([4, 0, 3, 12, 12, 13], r))], sel: K.pxBox(MC.rotBox([4, 0, 3, 12, 16, 13], r)),
      opacity: 0, cullSame: false };
  }, { hard: 3, ...PICK, sound: SN.METAL });
  // stone lantern (石灯籠) and hanging paper lantern (提灯)
  const STONE = K.faceTiles({ all: 'kirishi_top' }), FIRE = K.faceTiles({ side: 'toro_fire', top: 'kirishi_top' });
  K.add('toro', '石灯籠', { tex: { all: 'kirishi_top' }, shape: S.BOXES, mat: M.EMISSIVE, emit: 12, opacity: 0, cullSame: false,
    boxes: [
      { b: [3.5, 0, 3.5, 12.5, 2, 12.5], tex: STONE }, { b: [6, 2, 6, 10, 7, 10], tex: STONE }, { b: [4.5, 7, 4.5, 11.5, 8, 11.5], tex: STONE },
      { b: [5, 8, 5, 11, 12, 11], tex: FIRE }, { b: [2.5, 12, 2.5, 13.5, 13.5, 13.5], tex: STONE }, { b: [4.5, 13.5, 4.5, 11.5, 14.5, 11.5], tex: STONE },
      { b: [7, 14.5, 7, 9, 16, 9], tex: STONE },
    ], coll: [[3.5 / 16, 0, 3.5 / 16, 12.5 / 16, 1, 12.5 / 16]], sel: [2.5 / 16, 0, 2.5 / 16, 13.5 / 16, 1, 13.5 / 16], hard: 1.5, ...PICK, support: 1 });
  const CAP = K.faceTiles({ all: 'chochin_cap' });
  K.add('chochin', '提灯', { tex: { side: 'chochin', top: 'chochin_cap' }, shape: S.BOXES, mat: M.EMISSIVE, emit: 13, solid: false, opacity: 0, cullSame: false, ao: false,
    boxes: [{ b: [4.5, 3, 4.5, 11.5, 13, 11.5] }, { b: [5.5, 13, 5.5, 10.5, 14, 10.5], tex: CAP }, { b: [5.5, 2, 5.5, 10.5, 3, 10.5], tex: CAP },
      { b: [7.5, 14, 7.5, 8.5, 16, 8.5], tex: K.faceTiles({ all: 'chain' }) }],
    sel: [4.5 / 16, 2 / 16, 4.5 / 16, 11.5 / 16, 1, 11.5 / 16], hard: 0.3, sound: SN.WOOL, support: 2 });
  // the general's standard (two blocks): breaking either half captures the castle (wajomobs.js)
  const POLE = K.faceTiles({ all: 'hata_pole' });
  const banner = (upper) => [
    { b: [1, 0, 7, 3, 16, 9], tex: POLE },
    { b: [3, upper ? 0 : 2, 8, 14, upper ? 14 : 16, 8] },
    ...(upper ? [{ b: [1, 14, 7.5, 15, 15, 8.5], tex: POLE }, { b: [1.5, 15, 7.5, 2.5, 16, 8.5], tex: K.faceTiles({ all: 'gold_block' }) }] : []),
  ];
  for (const upper of [0, 1]) {
    K.addFacing(upper ? 'hatajirushi_top' : 'hatajirushi', '大将の旗印', (r) => {
      const bx = K.rotBoxes(banner(upper), r);
      return { tex: { all: upper ? 'hata_upper' : 'hata_lower' }, shape: S.BOXES, boxes: bx, coll: [K.pxBox(MC.rotBox([1, 0, 7, 3, 16, 9], r))],
        sel: K.pxBox(MC.rotBox([1, 0, 6, 15, 16, 10], r)), mat: M.CUTOUT, opacity: 0, cullSame: false };
    }, { hard: 2.5, sound: SN.WOOL, resist: 40, drop: null, catalog: false, banner: upper ? 'top' : 'bottom' });
  }
  // decorative war banners (のぼり旗)
  K.addFacing('nobori', 'のぼり旗', (r) => {
    const bx = K.rotBoxes([{ b: [1, 0, 7, 3, 16, 9], tex: POLE }, { b: [3, 0, 8, 12, 15, 8] }, { b: [1, 15, 7.5, 12, 16, 8.5], tex: POLE }], r);
    return { tex: { all: 'nobori' }, shape: S.BOXES, boxes: bx, coll: [K.pxBox(MC.rotBox([1, 0, 7, 3, 16, 9], r))], sel: K.pxBox(MC.rotBox([1, 0, 6, 13, 16, 10], r)),
      mat: M.CUTOUT, opacity: 0, cullSame: false };
  }, { hard: 0.5, sound: SN.WOOL, tool: TL.AXE });
  MC.isBanner = (id) => !!(MC.BLOCKS[id] && MC.BLOCKS[id].banner);

  // ---------------------------------------------------------------- items
  const D = MC.defItem, SWORD = TL.SWORD;
  D('tamahagane', '玉鋼', { desc: 'たたら製鉄で作られる上質な鋼。刀や甲冑の材料になる' });
  D('onigiri', 'おにぎり', { food: { hunger: 6, sat: 7.2 } });
  D('katana', '打刀', { stack: 1, dur: 900, held: 'tool', tool: { type: SWORD, tier: 3, speed: 1, damage: 7 }, desc: '玉鋼を鍛えた日本刀。鋭い切れ味を持つ' });
  D('yari', '素槍', { stack: 1, dur: 700, held: 'tool', tool: { type: SWORD, tier: 3, speed: 1, damage: 6 }, reach: 1.5, knock: 1.4, desc: '間合いの長い槍。離れた敵にも届く' });
  D('yumi', '和弓', { stack: 1, dur: 520, use: 'bow', held: 'bow', power: 1.25, desc: '大きな和弓。普通の弓より強く遠くへ矢を放つ' });
  D('shuriken', '手裏剣', { stack: 16, use: 'throw', throw: { dmg: 4, speed: 30 }, desc: '右クリックで投げつける' });
  D('domaru', '胴丸', { stack: 1, dur: 420, use: 'armor', armor: 0.16, desc: '足軽の簡素な鎧。右クリックで着る（受けるダメージ -16%）' });
  D('gusoku', '当世具足', { stack: 1, dur: 950, use: 'armor', armor: 0.3, desc: '玉鋼の板を綴じた侍の甲冑。右クリックで着る（受けるダメージ -30%）' });
  // heirlooms: the reward for capturing each kind of castle
  D('gekko', '名刀「月光」', { stack: 1, dur: 3200, held: 'tool', legendary: true, tool: { type: SWORD, tier: 4, speed: 1, damage: 10 }, fx: { sweep: 0.6 },
    desc: '白鷺城の家宝。振るうたび月光の弧が走り、周りの敵もまとめて斬る' });
  D('kuroito', '大鎧「黒糸威」', { stack: 1, dur: 2400, use: 'armor', armor: 0.45, kb: 0.35, legendary: true,
    desc: '墨染城の家宝。黒糸で威した大鎧。ダメージ -45%、ほとんどのけぞらない' });
  D('tengu_yari', '十文字槍「天狗」', { stack: 1, dur: 2600, held: 'tool', legendary: true, tool: { type: SWORD, tier: 4, speed: 1, damage: 11 }, reach: 2.4, knock: 2.4,
    desc: '鷹ノ巣城の家宝。遠くの敵まで届き、大きく吹き飛ばす' });
  D('tanegashima', '火縄銃「種子島」', { stack: 1, dur: 700, held: 'tool', legendary: true, use: 'gun', gun: { dmg: 18, speed: 85, pierce: 1, reload: 2.2 },
    desc: '潮見城の家宝。右クリックで撃つ。一発ごとに火薬を1つ使う' });
  D('murasame', '妖刀「村雨」', { stack: 1, dur: 2800, held: 'tool', legendary: true, tool: { type: SWORD, tier: 4, speed: 1, damage: 12 }, fx: { lifesteal: 2 },
    desc: '朽木砦に封じられていた妖刀。斬るたびに血を吸い、持ち主の傷を癒やす' });
  // props of the castle warriors (not obtainable)
  D('teppo', '火縄銃', { stack: 1, held: 'tool', hidden: true });
  D('ninjato', '忍者刀', { stack: 1, held: 'tool', hidden: true });
  MC.armorOf = (id) => { const it = MC.itemDef(id); return it && it.armor ? it : null; };

  // ---------------------------------------------------------------- recipes
  const R = (out, n, ins, station = 'table') => MC.RECIPES.push({ out: [out, n], in: ins, station });
  R('tamahagane', 1, [['iron_ingot', 2], ['#coal', 2]], 'furnace');
  R('katana', 1, [['tamahagane', 3], ['stick', 1], ['string', 1]]);
  R('yari', 1, [['tamahagane', 1], ['stick', 4]]);
  R('yumi', 1, [['stick', 5], ['string', 3]]);
  R('shuriken', 8, [['tamahagane', 1]]);
  R('domaru', 1, [['leather', 5], ['iron_ingot', 4], ['string', 2]]);
  R('gusoku', 1, [['tamahagane', 5], ['leather', 5], ['string', 4]]);
  R('onigiri', 2, [['wheat', 3]], null);
  R('ishigaki', 4, [['cobblestone', 4]], null);
  R('kirishi', 4, [['stone', 4]]);
  R('shikkui', 4, [['clay', 2], ['bone_meal', 2]]);
  R('hazama', 1, [['shikkui', 1]], null);
  R('namako', 4, [['shikkui', 2], ['clay', 2]]);
  R('kuro_itabari', 4, [['#planks', 4], ['#coal', 1]]);
  R('kawara', 4, [['clay', 4]], 'furnace');
  R('dogawara', 4, [['kawara', 4], ['emerald', 1]]);
  R('kaya', 2, [['hay_bale', 1]], null);
  for (const b of ['kawara', 'dogawara', 'kaya']) { R(b + '_slab', 6, [[b, 3]]); R(b + '_stairs', 4, [[b, 6]]); }
  R('tatami', 2, [['hay_bale', 1], ['string', 2]]);
  R('shoji', 8, [['paper', 3], ['stick', 3]]);
  R('renji', 8, [['stick', 6]]);
  R('mon_door', 2, [['#planks', 4], ['iron_ingot', 1]]);
  R('shachihoko', 1, [['gold_block', 2]]);
  R('toro', 1, [['stone', 3], ['torch', 1]]);
  R('chochin', 1, [['paper', 2], ['torch', 1], ['string', 1]]);
  R('nobori', 1, [['#wool', 2], ['stick', 2]]);

  // ---------------------------------------------------------------- drops of the castle warriors
  Object.assign(MC.MOB_DROPS, {
    ashigaru: [['onigiri', 0, 1, 0.6], ['arrow', 0, 2, 0.5], ['iron_ingot', 1, 1, 0.15], ['yari', 1, 1, 0.04]],
    yumi_ashigaru: [['arrow', 1, 4, 1], ['onigiri', 0, 1, 0.5], ['yumi', 1, 1, 0.04]],
    teppo_ashigaru: [['gunpowder', 1, 3, 1], ['onigiri', 0, 1, 0.5], ['iron_ingot', 1, 1, 0.25]],
    samurai: [['tamahagane', 1, 1, 0.3], ['onigiri', 0, 1, 0.5], ['iron_ingot', 1, 2, 0.35], ['katana', 1, 1, 0.05]],
    hatamoto: [['tamahagane', 1, 2, 1], ['gold_ingot', 1, 2, 0.5], ['katana', 1, 1, 0.1], ['gusoku', 1, 1, 0.04]],
    ninja: [['shuriken', 1, 4, 1], ['string', 0, 2, 1], ['emerald', 1, 1, 0.1]],
    ochimusha: [['bone', 0, 2, 1], ['rotten_flesh', 0, 2, 1], ['tamahagane', 1, 1, 0.12], ['arrow', 0, 3, 0.5]],
  });

  // ---------------------------------------------------------------- loot tables
  Object.assign(MC.LOOT, {
    wajo_kura: { rolls: [4, 8], items: [
      ['onigiri', 2, 6, 14], ['wheat', 3, 9, 10], ['hay_bale', 1, 3, 6], ['coal', 3, 10, 10], ['tamahagane', 1, 3, 8], ['gunpowder', 1, 4, 6],
      ['arrow', 4, 16, 8], ['iron_ingot', 1, 4, 8], ['emerald', 1, 3, 6], ['paper', 2, 6, 6], ['cooked_beef', 1, 3, 6], ['clay', 2, 6, 4],
    ] },
    wajo_armory: { rolls: [4, 7], items: [
      ['katana', 1, 1, 8], ['yari', 1, 1, 8], ['yumi', 1, 1, 7], ['arrow', 8, 24, 14], ['shuriken', 4, 12, 10], ['tamahagane', 1, 4, 12],
      ['domaru', 1, 1, 5], ['gusoku', 1, 1, 2], ['gunpowder', 2, 6, 8], ['healing_potion', 1, 1, 4], ['iron_ingot', 2, 5, 8],
    ] },
    wajo_barracks: { rolls: [3, 6], items: [
      ['onigiri', 1, 5, 14], ['bread', 1, 3, 8], ['arrow', 4, 12, 10], ['string', 1, 4, 6], ['leather', 1, 3, 6], ['iron_ingot', 1, 3, 6],
      ['emerald', 1, 3, 5], ['torch', 3, 8, 8], ['shuriken', 2, 6, 5], ['tamahagane', 1, 2, 4],
    ] },
    wajo_palace: { rolls: [3, 6], items: [
      ['paper', 2, 8, 10], ['book', 1, 3, 8], ['emerald', 2, 6, 10], ['gold_ingot', 2, 6, 10], ['diamond', 1, 2, 4], ['healing_potion', 1, 2, 6],
      ['chochin', 1, 3, 5], ['onigiri', 2, 5, 8], ['golden_apple', 1, 1, 3], ['life_crystal', 1, 1, 1],
    ] },
    wajo_tenshu: { rolls: [5, 8], always: [['healing_potion', 1, 2]], items: [
      ['tamahagane', 2, 6, 12], ['gold_ingot', 3, 9, 12], ['emerald', 3, 8, 12], ['diamond', 1, 3, 8], ['katana', 1, 1, 5], ['gusoku', 1, 1, 4],
      ['golden_apple', 1, 2, 6], ['life_crystal', 1, 1, 2], ['gold_block', 1, 1, 3], ['shuriken', 4, 12, 6],
    ] },
  });
  // rewards dropped by the general's standard when a castle is captured (heirloom per kind of castle)
  MC.WAJO_REWARD = {
    hirajiro: 'gekko', hirayama: 'kuroito', yamajiro: 'tengu_yari', umijiro: 'tanegashima', toride: 'murasame',
    common: [['gold_ingot', 6, 10], ['emerald', 6, 12], ['diamond', 2, 4], ['tamahagane', 3, 6], ['life_crystal', 1, 1], ['healing_potion', 2, 3]],
  };
})();
