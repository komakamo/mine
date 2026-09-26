'use strict';
// Castle content: extra building blocks (dark / frost bricks, desert stone, magma, carpets, chains, the
// magic seal that locks a castle's treasure vault), the legendary rewards, recipes, drops of the castle
// mobs and the castle loot tables. Textures: castletex.js, generation: castles.js, mobs: castlemobs.js.
(function () {
  const K = MC.blockKit, S = MC.SHAPE, M = MC.MAT, TL = MC.TOOL, SN = MC.SOUND;
  const PICK = K.PICK;

  // ---------------------------------------------------------------- blocks
  for (const t of ['dark_bricks', 'cracked_dark_bricks', 'frost_bricks', 'packed_ice', 'cut_sandstone', 'chiseled_sandstone', 'magma',
    'bone_block_side', 'bone_block_top', 'seal_bars', 'vault_stone']) MC.addTile(t);
  K.add('dark_bricks', '暗黒レンガ', { tex: { all: 'dark_bricks' }, hard: 2, ...PICK, tier: 1 });
  K.add('cracked_dark_bricks', 'ひび割れた暗黒レンガ', { tex: { all: 'cracked_dark_bricks' }, hard: 2, ...PICK, tier: 1 });
  K.slab('dark_brick_slab', '暗黒レンガのハーフブロック', { all: 'dark_bricks' }, { hard: 2, ...PICK, tier: 1 });
  K.stairs('dark_brick_stairs', '暗黒レンガの階段', { all: 'dark_bricks' }, { hard: 2, ...PICK, tier: 1 });
  K.add('frost_bricks', '氷晶レンガ', { tex: { all: 'frost_bricks' }, hard: 1.5, ...PICK, tier: 1 });
  K.slab('frost_brick_slab', '氷晶レンガのハーフブロック', { all: 'frost_bricks' }, { hard: 1.5, ...PICK, tier: 1 });
  K.stairs('frost_brick_stairs', '氷晶レンガの階段', { all: 'frost_bricks' }, { hard: 1.5, ...PICK, tier: 1 });
  K.add('packed_ice', '氷塊', { tex: { all: 'packed_ice' }, hard: 0.5, tool: TL.PICKAXE, sound: SN.GLASS });
  K.add('cut_sandstone', '滑らかな砂岩', { tex: { side: 'cut_sandstone', top: 'sandstone_top' }, hard: 0.8, ...PICK, tier: 1 });
  K.add('chiseled_sandstone', '模様入り砂岩', { tex: { side: 'chiseled_sandstone', top: 'sandstone_top' }, hard: 0.8, ...PICK, tier: 1 });
  K.add('magma_block', 'マグマブロック', { tex: { all: 'magma' }, emit: 7, hard: 0.5, ...PICK, tier: 1 });
  K.add('bone_block', '骨ブロック', { tex: { side: 'bone_block_side', top: 'bone_block_top' }, hard: 2, ...PICK, tier: 1 });
  K.add('chain', '鎖', { tex: { all: 'chain' }, shape: S.BOXES, mat: M.CUTOUT, solid: false, opacity: 0, cullSame: false, ao: false,
    boxes: [{ b: [6.5, 0, 8, 9.5, 16, 8] }, { b: [8, 0, 6.5, 8, 16, 9.5] }], sel: [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16], hard: 3, ...PICK, sound: SN.METAL });
  // carpets: thin, walk-through rugs (keeps mob pathfinding simple)
  const CARPET = [{ b: [0, 0, 0, 16, 1, 16] }];
  for (const [c, n] of [['red', '赤'], ['purple', '紫'], ['light_blue', '空'], ['yellow', '黄'], ['black', '黒']]) {
    K.add('carpet_' + c, n + '色のカーペット', { tex: { all: 'wool_' + c }, shape: S.BOXES, boxes: CARPET, sel: [0, 0, 0, 1, 1 / 16, 1], solid: false, opacity: 0, cullSame: false,
      hard: 0.1, sound: SN.WOOL, support: 1 });
  }
  // the vault seal: unbreakable glowing bars that vanish when the castle lord falls
  K.add('seal_bars', '魔法の封印', { tex: { all: 'seal_bars' }, shape: S.PANE, mat: M.CUTOUT, opacity: 0, cullSame: false, emit: 6,
    hard: -1, resist: 1e9, sound: SN.METAL, drop: null });
  // the vault's walls: rune-carved stone no tool can break
  K.add('vault_stone', '封印の石壁', { tex: { all: 'vault_stone' }, hard: -1, resist: 1e9, sound: SN.STONE, drop: null });

  // ---------------------------------------------------------------- items
  const D = MC.defItem;
  const SWORD = TL.SWORD;
  D('holy_sword', '騎士王の聖剣', { stack: 1, dur: 3200, held: 'tool', legendary: true,
    tool: { type: SWORD, tier: 4, speed: 1, damage: 11 }, fx: { lifesteal: 1 }, desc: '伝説の剣。攻撃が当たるたびに体力が回復する' });
  D('frost_blade', '氷牙の剣', { stack: 1, dur: 2600, held: 'tool', legendary: true,
    tool: { type: SWORD, tier: 4, speed: 1, damage: 9 }, fx: { freeze: 4 }, desc: '伝説の剣。斬った敵を凍てつかせ、動きを大きく鈍らせる' });
  D('demon_hammer', '炎魔の戦鎚', { stack: 1, dur: 3600, held: 'tool', legendary: true,
    tool: { type: TL.PICKAXE, tier: 5, speed: 11, damage: 10 }, fx: { ignite: 5, area: 1 }, desc: '伝説の戦鎚。3×3の範囲をまとめて掘り、殴った敵を炎上させる' });
  D('necro_staff', '死霊術師の杖', { stack: 1, dur: 900, held: 'tool', legendary: true, use: 'staff',
    bolt: { kind: 'soul', dmg: 9, speed: 30, pierce: 2 }, desc: '伝説の杖。右クリックで敵を貫く魂の弾を放つ' });
  D('sun_bow', '太陽王の弓', { stack: 1, dur: 1800, held: 'bow', legendary: true, use: 'bow', multishot: 3, infinite: true, fireArrows: true,
    desc: '伝説の弓。炎の矢を3本同時に放つ。矢を消費しない' });
  D('life_crystal', '生命の結晶', { stack: 16, use: 'life_crystal', desc: '使うと最大体力が永久に2ハート増える（最大20ハート）' });
  D('healing_potion', '回復の霊薬', { stack: 16, food: { hunger: 0, sat: 0, heal: 12, always: true, drink: true }, desc: '飲むと体力が6ハート回復する' });
  // props held by castle lords (not obtainable)
  D('sand_scepter', '砂王の王笏', { stack: 1, held: 'tool', hidden: true });
  D('ice_staff', '氷の杖', { stack: 1, held: 'tool', hidden: true });

  // ---------------------------------------------------------------- recipes
  const R = (out, n, ins, station = 'table') => MC.RECIPES.push({ out: [out, n], in: ins, station });
  R('dark_bricks', 4, [['bricks', 4], ['#coal', 1]]);
  R('frost_bricks', 4, [['stone_bricks', 4], ['snow', 1]]);
  R('packed_ice', 1, [['snow', 4]], null);
  R('cut_sandstone', 4, [['sandstone', 4]], null);
  R('chiseled_sandstone', 1, [['sandstone', 2]]);
  R('bone_block', 1, [['bone', 9]]);
  R('bone', 9, [['bone_block', 1]], null);
  R('chain', 3, [['iron_ingot', 1]]);
  for (const [s, b] of [['dark_brick_slab', 'dark_bricks'], ['frost_brick_slab', 'frost_bricks']]) R(s, 6, [[b, 3]]);
  for (const [s, b] of [['dark_brick_stairs', 'dark_bricks'], ['frost_brick_stairs', 'frost_bricks']]) R(s, 4, [[b, 6]]);
  for (const c of ['red', 'purple', 'light_blue', 'yellow', 'black']) R('carpet_' + c, 3, [['wool_' + c, 2]]);
  MC.RECIPES.push({ out: ['cracked_dark_bricks', 1], in: [['dark_bricks', 1]], station: 'furnace' });

  // ---------------------------------------------------------------- drops of castle mobs
  Object.assign(MC.MOB_DROPS, {
    undead_knight: [['rotten_flesh', 0, 2, 1], ['iron_ingot', 1, 2, 0.35], ['iron_sword', 1, 1, 0.05]],
    ghoul: [['rotten_flesh', 1, 3, 1], ['bone', 0, 2, 1]],
    cultist: [['paper', 0, 3, 1], ['book', 0, 1, 0.4], ['emerald', 1, 2, 0.3], ['healing_potion', 1, 1, 0.06]],
    mummy: [['string', 1, 3, 1], ['paper', 0, 2, 1], ['gold_ingot', 1, 1, 0.12]],
    scorpion: [['string', 0, 2, 1], ['bone', 0, 1, 0.5]],
    frozen_zombie: [['rotten_flesh', 0, 2, 1], ['snow', 0, 2, 1], ['packed_ice', 1, 1, 0.1]],
    frost_skeleton: [['bone', 0, 2, 1], ['arrow', 1, 3, 1]],
    flame_skeleton: [['bone', 0, 2, 1], ['coal', 1, 2, 1], ['arrow', 0, 2, 1]],
    magma_brute: [['coal', 1, 3, 1], ['magma_block', 0, 2, 1], ['gold_ingot', 1, 2, 0.2]],
  });

  // ---------------------------------------------------------------- loot tables
  const vault = (legend) => ({ rolls: [6, 9], always: [[legend, 1, 1], ['life_crystal', 1, 2], ['diamond', 4, 8], ['healing_potion', 2, 3]], items: [
    ['diamond', 2, 5, 10], ['emerald', 4, 10, 10], ['gold_ingot', 6, 14, 10], ['golden_apple', 1, 3, 9], ['diamond_block', 1, 2, 4],
    ['gold_block', 1, 3, 6], ['emerald_block', 1, 2, 4], ['diamond_sword', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['healing_potion', 1, 2, 6],
  ] });
  Object.assign(MC.LOOT, {
    castle_store: { rolls: [4, 8], items: [
      ['bread', 2, 6, 14], ['wheat', 3, 9, 12], ['apple', 1, 4, 10], ['wheat_seeds', 3, 9, 8], ['cooked_beef', 1, 4, 8], ['cooked_porkchop', 1, 4, 8],
      ['pumpkin', 1, 3, 5], ['hay_bale', 1, 2, 5], ['coal', 3, 10, 8], ['torch', 4, 12, 8], ['melon_slice', 2, 8, 6], ['bucket', 1, 1, 3],
    ] },
    castle_armory: { rolls: [4, 7], items: [
      ['iron_sword', 1, 1, 10], ['iron_pickaxe', 1, 1, 6], ['iron_axe', 1, 1, 6], ['bow', 1, 1, 10], ['arrow', 8, 24, 14], ['iron_ingot', 2, 6, 12],
      ['diamond_sword', 1, 1, 2], ['diamond', 1, 2, 3], ['healing_potion', 1, 1, 4], ['golden_apple', 1, 1, 2], ['flint_and_steel', 1, 1, 3],
    ] },
    castle_barracks: { rolls: [3, 6], items: [
      ['bread', 1, 4, 12], ['cooked_beef', 1, 3, 10], ['arrow', 4, 12, 10], ['iron_ingot', 1, 3, 8], ['string', 1, 4, 6], ['leather', 1, 3, 6],
      ['torch', 3, 8, 8], ['emerald', 1, 3, 5], ['healing_potion', 1, 1, 3], ['stone_sword', 1, 1, 4],
    ] },
    castle_library: { rolls: [3, 6], items: [
      ['book', 1, 4, 14], ['paper', 2, 8, 12], ['compass', 1, 1, 5], ['emerald', 1, 4, 10], ['lantern', 1, 2, 5], ['healing_potion', 1, 2, 6],
      ['life_crystal', 1, 1, 1], ['diamond', 1, 1, 2], ['golden_apple', 1, 1, 2],
    ] },
    castle_dungeon: { rolls: [4, 8], items: [
      ['bone', 2, 6, 12], ['rotten_flesh', 1, 5, 10], ['gold_ingot', 1, 4, 10], ['iron_ingot', 2, 5, 12], ['emerald', 1, 4, 8], ['diamond', 1, 2, 4],
      ['golden_apple', 1, 1, 3], ['healing_potion', 1, 2, 5], ['arrow', 4, 12, 6], ['coal', 2, 8, 8], ['tnt', 1, 2, 3], ['life_crystal', 1, 1, 1],
    ] },
    castle_lord: { rolls: [5, 8], always: [['life_crystal', 1, 1], ['healing_potion', 1, 2]], items: [
      ['gold_ingot', 4, 10, 12], ['emerald', 3, 8, 12], ['diamond', 1, 4, 10], ['golden_apple', 1, 2, 8], ['diamond_sword', 1, 1, 3],
      ['diamond_pickaxe', 1, 1, 3], ['gold_block', 1, 1, 4], ['book', 1, 3, 6], ['healing_potion', 1, 2, 6],
    ] },
    vault_knight: vault('holy_sword'),
    vault_necro: vault('necro_staff'),
    vault_desert: vault('sun_bow'),
    vault_frost: vault('frost_blade'),
    vault_volcano: vault('demon_hammer'),
  });
})();
