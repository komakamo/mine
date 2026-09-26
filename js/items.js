'use strict';
// Items (ids >= 256), tool / food stats, crafting & smelting recipes, block and mob drops,
// chest loot tables and villager trades. Blocks double as items with their block id (< 256).
MC.ITEM_BASE = 256;
MC.ITEMS = [];      // by id (only ids >= 256 are set)
MC.ITEM = {};       // key -> item id

MC.TIERS = { wooden: 1, stone: 2, iron: 3, diamond: 4 };
MC.TOOL_STATS = {
  wooden: { tier: 1, speed: 2, dur: 59, dmg: 0, name: '木の' },
  stone: { tier: 2, speed: 4, dur: 131, dmg: 1, name: '石の' },
  iron: { tier: 3, speed: 6, dur: 250, dmg: 2, name: '鉄の' },
  diamond: { tier: 4, speed: 8, dur: 1561, dmg: 3, name: 'ダイヤモンドの' },
};

(function registerItems() {
  let next = MC.ITEM_BASE;
  const def = (key, name, o = {}) => {
    const d = Object.assign({ id: next, key, name, stack: 64, tile: key }, o);
    MC.addTile(d.tile);
    MC.ITEMS[next] = d;
    MC.ITEM[key] = next;
    next++;
    return d;
  };
  def('stick', '棒');
  def('coal', '石炭', { fuel: 8 });
  def('charcoal', '木炭', { fuel: 8 });
  def('iron_ingot', '鉄インゴット');
  def('gold_ingot', '金インゴット');
  def('diamond', 'ダイヤモンド');
  def('emerald', 'エメラルド');
  def('flint', '火打石');
  def('string', '糸');
  def('feather', '羽根');
  def('leather', '革');
  def('bone', '骨');
  def('bone_meal', '骨粉', { use: 'bone_meal' });
  def('gunpowder', '火薬');
  def('paper', '紙');
  def('book', '本');
  def('wheat', '小麦');
  def('wheat_seeds', '小麦の種', { use: 'seeds' });
  def('arrow', '矢');
  def('bow', '弓', { stack: 1, dur: 384, use: 'bow', held: 'bow' });
  def('flint_and_steel', '火打石と打ち金', { stack: 1, dur: 64, use: 'ignite', held: 'tool' });
  def('compass', 'コンパス', { stack: 1, held: 'item' });
  def('bucket', 'バケツ', { stack: 16, use: 'bucket' });
  def('water_bucket', '水入りバケツ', { stack: 1, use: 'water_bucket' });
  def('lava_bucket', '溶岩入りバケツ', { stack: 1, use: 'lava_bucket', fuel: 100 });
  // food: hunger points restored, saturation
  const food = (key, name, hunger, sat, extra) => def(key, name, Object.assign({ food: { hunger, sat } }, extra));
  food('apple', 'リンゴ', 4, 2.4);
  food('golden_apple', '金のリンゴ', 4, 9.6, { food: { hunger: 4, sat: 9.6, regen: 5, always: true } });
  food('bread', 'パン', 5, 6);
  food('porkchop', '生の豚肉', 3, 1.8);
  food('cooked_porkchop', '焼き豚', 8, 12.8);
  food('beef', '生の牛肉', 3, 1.8);
  food('cooked_beef', 'ステーキ', 8, 12.8);
  food('chicken', '生の鶏肉', 2, 1.2);
  food('cooked_chicken', '焼き鳥', 6, 7.2);
  food('mutton', '生の羊肉', 2, 1.2);
  food('cooked_mutton', '焼いた羊肉', 6, 9.6);
  food('rotten_flesh', '腐った肉', 4, 0.8, { food: { hunger: 4, sat: 0.8, bad: 0.8 } });
  food('melon_slice', 'スイカの薄切り', 2, 1.2);
  // tools
  const TOOLS = [['sword', '剣', 4], ['pickaxe', 'ツルハシ', 2], ['axe', '斧', 3], ['shovel', 'シャベル', 1.5], ['hoe', 'クワ', 1]];
  const TT = { sword: MC.TOOL.SWORD, pickaxe: MC.TOOL.PICKAXE, axe: MC.TOOL.AXE, shovel: MC.TOOL.SHOVEL, hoe: MC.TOOL.HOE };
  for (const mat of ['wooden', 'stone', 'iron', 'diamond']) {
    const st = MC.TOOL_STATS[mat];
    for (const [t, tn, base] of TOOLS) {
      def(mat + '_' + t, st.name + tn, {
        stack: 1, dur: st.dur, held: 'tool', mat,
        tool: { type: TT[t], tier: st.tier, speed: t === 'sword' || t === 'hoe' ? 1 : st.speed, damage: base + st.dmg * (t === 'shovel' ? 1 : t === 'hoe' ? 0 : 1) },
        use: t === 'hoe' ? 'hoe' : undefined,
      });
    }
  }
  MC.ITEM_COUNT = next;
  // shared with content modules that register their own items (castles...)
  MC.defItem = (key, name, o) => { const d = def(key, name, o); MC.ITEM_COUNT = next; return d; };
})();

// ---- generic accessors for ids of both blocks (< 256) and items (>= 256)
MC.isBlockItem = (id) => id > 0 && id < MC.ITEM_BASE;
MC.idOf = (key) => (MC.ITEM[key] !== undefined ? MC.ITEM[key] : MC.BLOCK[key] !== undefined ? MC.BLOCK[key] : 0);
MC.itemDef = (id) => (id >= MC.ITEM_BASE ? MC.ITEMS[id] : null);
MC.itemName = (id) => {
  if (!id) return '';
  if (id >= MC.ITEM_BASE) return MC.ITEMS[id] ? MC.ITEMS[id].name : '?';
  return MC.BLOCKS[id] ? MC.BLOCKS[id].name : '?';
};
MC.maxStack = (id) => (id >= MC.ITEM_BASE ? MC.ITEMS[id].stack : 64);
MC.maxDur = (id) => (id >= MC.ITEM_BASE && MC.ITEMS[id].dur) || 0;
MC.toolOf = (id) => (id >= MC.ITEM_BASE && MC.ITEMS[id].tool) || null;
MC.foodOf = (id) => (id >= MC.ITEM_BASE && MC.ITEMS[id].food) || null;
MC.fuelOf = (id) => {
  if (id >= MC.ITEM_BASE) return MC.ITEMS[id].fuel || 0;
  if (id === MC.BLOCK.coal_block) return 72;
  const d = MC.BLOCKS[id];
  if (!d) return 0;
  if (d.tool === MC.TOOL.AXE && d.shape === MC.SHAPE.CUBE) return 1.5;
  return 0;
};
MC.makeStack = (id, count = 1) => {
  const s = { id, count };
  const md = MC.maxDur(id);
  if (md) s.dur = md;
  return s;
};

// Ingredient groups
MC.GROUPS = {
  planks: ['oak_planks', 'spruce_planks', 'birch_planks'],
  log: ['oak_log', 'spruce_log', 'birch_log'],
  wool: ['wool_white', 'wool_orange', 'wool_yellow', 'wool_lime', 'wool_light_blue', 'wool_red', 'wool_purple', 'wool_black'],
  coal: ['coal', 'charcoal'],
  cobble: ['cobblestone', 'mossy_cobblestone'],
};
MC.GROUP_NAMES = { planks: '板材', log: '原木', wool: '羊毛', coal: '石炭', cobble: '丸石' };

// ---- recipes: { out: [key, n], in: [[key|'#group', n], ...], station: null | 'table' | 'furnace' }
MC.RECIPES = [];
(function registerRecipes() {
  const R = (out, n, ins, station = 'table') => MC.RECIPES.push({ out: [out, n], in: ins, station });
  const S = (out, n, input) => MC.RECIPES.push({ out: [out, n], in: [[input, 1]], station: 'furnace' });
  R('oak_planks', 4, [['oak_log', 1]], null);
  R('spruce_planks', 4, [['spruce_log', 1]], null);
  R('birch_planks', 4, [['birch_log', 1]], null);
  R('stick', 4, [['#planks', 2]], null);
  R('crafting_table', 1, [['#planks', 4]], null);
  R('torch', 4, [['stick', 1], ['#coal', 1]], null);
  R('chest', 1, [['#planks', 8]]);
  R('furnace', 1, [['#cobble', 8]]);
  const MATS = { wooden: '#planks', stone: '#cobble', iron: 'iron_ingot', diamond: 'diamond' };
  for (const m in MATS) {
    const x = MATS[m];
    R(m + '_pickaxe', 1, [[x, 3], ['stick', 2]]);
    R(m + '_sword', 1, [[x, 2], ['stick', 1]]);
    R(m + '_axe', 1, [[x, 3], ['stick', 2]]);
    R(m + '_shovel', 1, [[x, 1], ['stick', 2]]);
    R(m + '_hoe', 1, [[x, 2], ['stick', 2]]);
  }
  R('bow', 1, [['stick', 3], ['string', 3]]);
  R('arrow', 4, [['flint', 1], ['stick', 1], ['feather', 1]]);
  R('bread', 1, [['wheat', 3]]);
  R('bucket', 1, [['iron_ingot', 3]]);
  R('flint_and_steel', 1, [['iron_ingot', 1], ['flint', 1]], null);
  R('compass', 1, [['iron_ingot', 4]]);
  R('bone_meal', 3, [['bone', 1]], null);
  R('golden_apple', 1, [['apple', 1], ['gold_ingot', 8]]);
  R('oak_door', 3, [['oak_planks', 6]]);
  R('oak_fence', 3, [['oak_planks', 4], ['stick', 2]]);
  R('spruce_fence', 3, [['spruce_planks', 4], ['stick', 2]]);
  R('ladder', 3, [['stick', 7]]);
  R('bed', 1, [['#wool', 3], ['#planks', 3]]);
  R('wool_white', 1, [['string', 4]], null);
  R('glass_pane', 16, [['glass', 6]]);
  R('iron_bars', 16, [['iron_ingot', 6]]);
  R('tnt', 1, [['gunpowder', 5], ['sand', 4]]);
  R('lantern', 1, [['iron_ingot', 1], ['torch', 1]]);
  R('jack_o_lantern', 1, [['pumpkin', 1], ['torch', 1]], null);
  R('stone_bricks', 4, [['stone', 4]], null);
  R('sandstone', 1, [['sand', 4]], null);
  R('paper', 3, [['sugar_cane', 3]]);
  R('book', 1, [['paper', 3], ['leather', 1]], null);
  R('bookshelf', 1, [['#planks', 6], ['book', 3]]);
  R('hay_bale', 1, [['wheat', 9]]);
  R('wheat', 9, [['hay_bale', 1]], null);
  R('snow', 1, [['snow', 1]], null);
  for (const [blk, it] of [['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['coal_block', 'coal']]) {
    R(blk, 1, [[it, 9]]);
    R(it, 9, [[blk, 1]], null);
  }
  for (const [s, b] of [['oak_slab', 'oak_planks'], ['spruce_slab', 'spruce_planks'], ['cobblestone_slab', 'cobblestone'], ['stone_brick_slab', 'stone_bricks'], ['sandstone_slab', 'sandstone'], ['smooth_stone_slab', 'smooth_stone']]) R(s, 6, [[b, 3]]);
  for (const [s, b] of [['oak_stairs', 'oak_planks'], ['spruce_stairs', 'spruce_planks'], ['cobblestone_stairs', 'cobblestone'], ['stone_brick_stairs', 'stone_bricks'], ['sandstone_stairs', 'sandstone']]) R(s, 4, [[b, 6]]);
  R('mossy_cobblestone', 1, [['cobblestone', 1], ['wheat_seeds', 1]], null);
  R('mossy_stone_bricks', 1, [['stone_bricks', 1], ['wheat_seeds', 1]], null);
  R('chiseled_stone_bricks', 1, [['stone_brick_slab', 2]]);
  // smelting
  S('iron_ingot', 1, 'iron_ore');
  S('gold_ingot', 1, 'gold_ore');
  S('glass', 1, 'sand');
  S('stone', 1, 'cobblestone');
  S('smooth_stone', 1, 'stone');
  S('bricks', 1, 'clay');
  S('cracked_stone_bricks', 1, 'stone_bricks');
  S('charcoal', 1, 'oak_log');
  S('charcoal', 1, 'spruce_log');
  S('charcoal', 1, 'birch_log');
  S('cooked_porkchop', 1, 'porkchop');
  S('cooked_beef', 1, 'beef');
  S('cooked_chicken', 1, 'chicken');
  S('cooked_mutton', 1, 'mutton');
})();

// ---- block drops
// returns [[id, count], ...]; rnd is a 0..1 random function
MC.blockDrops = function (id, rnd = Math.random) {
  const d = MC.BLOCKS[id];
  if (!d) return [];
  const I = MC.idOf;
  if (d.stage !== undefined) {
    if (d.stage < 3) return [[I('wheat_seeds'), 1]];
    return [[I('wheat'), 1], [I('wheat_seeds'), 1 + Math.floor(rnd() * 3)]];
  }
  if (d.drop === null) return [];
  if (d.drop === undefined) return [[d.base, 1]];
  switch (d.drop) {
    case 'leaves': {
      const out = [];
      const sap = { oak_leaves: 'oak_sapling', birch_leaves: 'birch_sapling', spruce_leaves: 'spruce_sapling' }[d.key];
      if (rnd() < 0.06) out.push([I(sap), 1]);
      if (rnd() < 0.02) out.push([I('stick'), 1 + Math.floor(rnd() * 2)]);
      if (d.key === 'oak_leaves' && rnd() < 0.012) out.push([I('apple'), 1]);
      return out;
    }
    case 'grass_seeds': return rnd() < 0.125 ? [[I('wheat_seeds'), 1]] : [];
    case 'gravel': return rnd() < 0.1 ? [[I('flint'), 1]] : [[id, 1]];
    case 'melon_slice': return [[I('melon_slice'), 3 + Math.floor(rnd() * 5)]];
    case 'stick': return rnd() < 0.6 ? [[I('stick'), 1 + Math.floor(rnd() * 2)]] : [];
    default: return [[I(d.drop), 1]];
  }
};

// ---- mob drops: [key, min, max, chance]
MC.MOB_DROPS = {
  zombie: [['rotten_flesh', 0, 2, 1], ['iron_ingot', 1, 1, 0.025]],
  skeleton: [['bone', 0, 2, 1], ['arrow', 0, 2, 1]],
  creeper: [['gunpowder', 0, 2, 1]],
  spider: [['string', 0, 2, 1]],
  pig: [['porkchop', 1, 3, 1]],
  cow: [['beef', 1, 3, 1], ['leather', 0, 2, 1]],
  sheep: [['wool_white', 1, 1, 1], ['mutton', 1, 2, 1]],
  chicken: [['chicken', 1, 1, 1], ['feather', 0, 2, 1]],
  villager: [],
};
MC.COOKED = { porkchop: 'cooked_porkchop', beef: 'cooked_beef', chicken: 'cooked_chicken', mutton: 'cooked_mutton' };

// ---- chest loot: [key, min, max, weight], rolls [min, max]
MC.LOOT = {
  dungeon: { rolls: [5, 9], items: [
    ['bread', 1, 3, 14], ['iron_ingot', 1, 4, 12], ['gold_ingot', 1, 3, 8], ['diamond', 1, 2, 4], ['emerald', 1, 3, 6],
    ['coal', 2, 8, 12], ['bone', 1, 6, 10], ['rotten_flesh', 1, 5, 10], ['string', 1, 4, 8], ['gunpowder', 1, 4, 8],
    ['apple', 1, 3, 10], ['golden_apple', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['iron_sword', 1, 1, 3], ['bow', 1, 1, 4],
    ['arrow', 4, 12, 8], ['bucket', 1, 1, 4], ['wheat', 2, 6, 6], ['compass', 1, 1, 2], ['tnt', 1, 3, 3], ['torch', 4, 12, 8],
    ['cooked_beef', 1, 4, 6], ['book', 1, 3, 5], ['lantern', 1, 2, 3],
  ] },
  treasure: { rolls: [7, 11], items: [
    ['diamond', 2, 5, 10], ['golden_apple', 1, 2, 8], ['diamond_pickaxe', 1, 1, 4], ['diamond_sword', 1, 1, 4],
    ['emerald', 3, 8, 10], ['gold_ingot', 4, 10, 10], ['iron_ingot', 5, 12, 10], ['diamond_axe', 1, 1, 2],
    ['cooked_beef', 3, 8, 8], ['bow', 1, 1, 5], ['arrow', 8, 24, 8], ['obsidian', 2, 6, 5], ['diamond_block', 1, 1, 1],
  ] },
  monster_room: { rolls: [3, 6], items: [
    ['bread', 1, 2, 12], ['iron_ingot', 1, 3, 10], ['gold_ingot', 1, 2, 5], ['coal', 1, 5, 10], ['bone', 1, 4, 10],
    ['rotten_flesh', 1, 4, 10], ['string', 1, 3, 8], ['gunpowder', 1, 3, 8], ['wheat', 1, 4, 8], ['bucket', 1, 1, 4],
    ['golden_apple', 1, 1, 2], ['diamond', 1, 1, 2], ['iron_sword', 1, 1, 2], ['apple', 1, 2, 6],
  ] },
  village: { rolls: [3, 6], items: [
    ['bread', 1, 4, 14], ['apple', 1, 5, 12], ['wheat_seeds', 2, 8, 10], ['wheat', 2, 7, 10], ['emerald', 1, 3, 6],
    ['torch', 2, 6, 8], ['oak_sapling', 1, 3, 6], ['cooked_porkchop', 1, 3, 6], ['paper', 1, 5, 6], ['string', 1, 3, 4],
    ['iron_ingot', 1, 2, 4], ['stone_pickaxe', 1, 1, 3], ['wooden_sword', 1, 1, 3],
  ] },
  blacksmith: { rolls: [4, 8], items: [
    ['iron_ingot', 1, 5, 15], ['gold_ingot', 1, 3, 6], ['diamond', 1, 3, 3], ['bread', 1, 3, 10], ['apple', 1, 3, 10],
    ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_axe', 1, 1, 3], ['obsidian', 3, 7, 5], ['coal', 3, 10, 10],
    ['bucket', 1, 1, 5], ['oak_sapling', 3, 7, 5], ['emerald', 1, 4, 5],
  ] },
  library: { rolls: [3, 6], items: [
    ['book', 1, 3, 15], ['paper', 2, 8, 15], ['compass', 1, 1, 5], ['emerald', 1, 3, 8], ['bread', 1, 2, 8],
    ['lantern', 1, 1, 4], ['bookshelf', 1, 2, 3], ['feather', 1, 4, 8],
  ] },
};
MC.rollLoot = function (table, rnd) {
  const t = MC.LOOT[table] || MC.LOOT.dungeon;
  const total = t.items.reduce((a, e) => a + e[3], 0);
  const n = t.rolls[0] + Math.floor(rnd() * (t.rolls[1] - t.rolls[0] + 1));
  const out = [];
  // guaranteed entries: [key, min, max]
  for (const [key, a, b] of t.always || []) {
    const id = MC.idOf(key);
    if (id) out.push(Object.assign(MC.makeStack(id), { count: a + Math.floor(rnd() * (b - a + 1)) }));
  }
  for (let i = 0; i < n; i++) {
    let r = rnd() * total;
    for (const [key, a, b, w] of t.items) {
      r -= w;
      if (r <= 0) {
        const id = MC.idOf(key);
        if (id) out.push(Object.assign(MC.makeStack(id), { count: a + Math.floor(rnd() * (b - a + 1)) }));
        break;
      }
    }
  }
  return out;
};

// ---- villager professions & trades: [[cost key, n], [cost2 key, n] | null, [result key, n]]
MC.PROFESSIONS = {
  farmer: { name: '農民', robe: [0.55, 0.42, 0.22], trades: [
    [['wheat', 20], null, ['emerald', 1]], [['emerald', 1], null, ['bread', 6]], [['emerald', 1], null, ['apple', 4]],
    [['pumpkin', 6], null, ['emerald', 1]], [['emerald', 1], null, ['melon_slice', 8]], [['emerald', 3], null, ['golden_apple', 1]],
  ] },
  librarian: { name: '司書', robe: [0.92, 0.92, 0.9], trades: [
    [['paper', 24], null, ['emerald', 1]], [['emerald', 3], null, ['bookshelf', 1]], [['emerald', 4], null, ['compass', 1]],
    [['emerald', 1], null, ['lantern', 1]], [['book', 4], null, ['emerald', 1]], [['emerald', 2], null, ['glass', 8]],
  ] },
  smith: { name: '鍛冶屋', robe: [0.22, 0.22, 0.24], trades: [
    [['coal', 15], null, ['emerald', 1]], [['iron_ingot', 4], null, ['emerald', 1]], [['emerald', 3], null, ['iron_pickaxe', 1]],
    [['emerald', 4], null, ['iron_sword', 1]], [['emerald', 12], null, ['diamond_sword', 1]], [['emerald', 15], null, ['diamond_pickaxe', 1]],
    [['emerald', 1], null, ['bucket', 1]],
  ] },
  cleric: { name: '聖職者', robe: [0.5, 0.2, 0.6], trades: [
    [['rotten_flesh', 32], null, ['emerald', 1]], [['emerald', 3], null, ['glowstone', 1]], [['bone', 16], null, ['emerald', 1]],
    [['emerald', 6], null, ['golden_apple', 1]], [['gunpowder', 8], null, ['emerald', 1]],
  ] },
  butcher: { name: '肉屋', robe: [0.8, 0.8, 0.78], trades: [
    [['porkchop', 14], null, ['emerald', 1]], [['chicken', 14], null, ['emerald', 1]], [['emerald', 1], null, ['cooked_porkchop', 5]],
    [['emerald', 1], null, ['cooked_beef', 4]], [['beef', 10], null, ['emerald', 1]],
  ] },
  shepherd: { name: '羊飼い', robe: [0.35, 0.55, 0.3], trades: [
    [['wool_white', 18], null, ['emerald', 1]], [['emerald', 1], null, ['wool_red', 1]], [['emerald', 1], null, ['wool_light_blue', 1]],
    [['emerald', 1], null, ['wool_yellow', 1]], [['emerald', 3], null, ['bed', 1]],
  ] },
  fletcher: { name: '矢師', robe: [0.6, 0.35, 0.2], trades: [
    [['string', 14], null, ['emerald', 1]], [['stick', 32], null, ['emerald', 1]], [['emerald', 1], null, ['arrow', 16]],
    [['emerald', 2], null, ['bow', 1]], [['flint', 26], null, ['emerald', 1]],
  ] },
};

// ---- creative catalog order
MC.catalogBlocks = function () {
  const out = [];
  for (let id = 1; id < MC.BLOCK_COUNT; id++) { const d = MC.BLOCKS[id]; if (d && d.catalog) out.push(id); }
  out.push(MC.BLOCK.water, MC.BLOCK.lava);
  return out;
};
MC.catalogItems = function () {
  const out = [];
  for (let id = MC.ITEM_BASE; id < MC.ITEM_COUNT; id++) if (!MC.ITEMS[id].hidden) out.push(id);
  return out;
};
