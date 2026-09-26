'use strict';
// Block registry. Properties are stored in flat typed arrays for fast lookup in the mesher / physics.

MC.MAT = { SOLID: 0, LEAVES: 1, PLANT: 2, WATER: 3, GLASS: 4, ICE: 5, EMISSIVE: 6, LAVA: 7, CUTOUT: 8 };
MC.SHAPE = { NONE: 0, CUBE: 1, CROSS: 2, TORCH: 3, CACTUS: 4, LIQUID: 5, BOXES: 6, CROP: 7, FENCE: 8, PANE: 9 };
MC.LAYER = { OPAQUE: 0, WATER: 1, TRANSLUCENT: 2 };
// Tint modes (applied in the G-buffer shader)
MC.TINT = { NONE: 0, GRASS: 1, FOLIAGE: 2, GRASS_MASKED: 3, BIRCH: 4, SPRUCE: 5 };
MC.TOOL = { NONE: 0, PICKAXE: 1, AXE: 2, SHOVEL: 3, SWORD: 4, HOE: 5 };
MC.SOUND = { STONE: 0, WOOD: 1, GRASS: 2, GRAVEL: 3, SAND: 4, GLASS: 5, WOOL: 6, METAL: 7, SNOW: 8, WATER: 9, PLANT: 10 };
MC.FLUID = { NONE: 0, WATER: 1, LAVA: 2 };
// Horizontal facings: 0 = south (+z), 1 = west (-x), 2 = north (-z), 3 = east (+x)
MC.DIRS = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]];
MC.facingFromYaw = (yaw) => ((Math.round(yaw / (Math.PI / 2)) + 2) % 4 + 4) % 4;

// Texture tiles (one layer each in the texture arrays). Order matters only for indexing.
MC.TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'sand', 'gravel',
  'oak_log', 'oak_log_top', 'oak_leaves', 'birch_log', 'birch_log_top', 'birch_leaves',
  'spruce_log', 'spruce_log_top', 'spruce_leaves', 'oak_planks', 'glass', 'water', 'bedrock',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'snow', 'grass_side_snowed', 'ice',
  'cactus_side', 'cactus_top', 'tall_grass', 'dandelion', 'poppy', 'torch', 'glowstone',
  'bricks', 'sandstone', 'sandstone_top', 'stone_bricks', 'lava', 'dead_bush',
  'iron_block', 'gold_block', 'diamond_block', 'obsidian', 'mossy_cobblestone', 'clay', 'bookshelf',
  // --- added blocks
  'spruce_planks', 'birch_planks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks',
  'smooth_stone', 'smooth_stone_side',
  'crafting_table_top', 'crafting_table_front', 'crafting_table_side',
  'furnace_front', 'furnace_side', 'furnace_top', 'chest_front', 'chest_side', 'chest_top',
  'tnt_side', 'tnt_top', 'tnt_bottom', 'spawner', 'iron_bars', 'door_bottom', 'door_top', 'ladder',
  'bed_head_top', 'bed_foot_top', 'bed_side',
  'wool_white', 'wool_orange', 'wool_yellow', 'wool_lime', 'wool_light_blue', 'wool_red', 'wool_purple', 'wool_black',
  'lantern_side', 'lantern_top', 'chain', 'hay_side', 'hay_top', 'pumpkin_side', 'pumpkin_top', 'melon_side', 'melon_top',
  'farmland_top', 'path_top', 'path_side', 'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3',
  'oak_sapling', 'birch_sapling', 'spruce_sapling', 'cobweb', 'emerald_ore', 'emerald_block', 'coal_block',
  'sugar_cane', 'brown_mushroom', 'red_mushroom', 'cornflower', 'allium', 'oxeye_daisy', 'fern',
  'jack_o_lantern', 'glass_pane_edge',
  // --- overlays / particles
  'destroy', 'particle_smoke', 'particle_flame', 'particle_heart', 'particle_crit', 'particle_bubble',
  'particle_explosion', 'particle_spark',
];
MC.TILE = {};
MC.TILE_NAMES.forEach((n, i) => { MC.TILE[n] = i; });
MC.addTile = function (name) {
  if (MC.TILE[name] !== undefined) return MC.TILE[name];
  MC.TILE[name] = MC.TILE_NAMES.length;
  MC.TILE_NAMES.push(name);
  return MC.TILE[name];
};

MC.BLOCKS = [];      // definitions by id
MC.BLOCK = {};       // name -> id

const NB = MC.NB = 256;
MC.B_OPAQUE = new Uint8Array(NB);     // full opaque cube: hides neighbour faces, blocks light
MC.B_SOLID = new Uint8Array(NB);      // collision
MC.B_SHAPE = new Uint8Array(NB);
MC.B_LAYER = new Uint8Array(NB);
MC.B_MAT = new Uint8Array(NB);
MC.B_OPACITY = new Uint8Array(NB);    // light opacity (0..15)
MC.B_EMIT = new Uint8Array(NB);       // light emission (0..15)
MC.B_AO = new Uint8Array(NB);         // casts ambient occlusion
MC.B_CULLSAME = new Uint8Array(NB);   // hide faces between two blocks of the same type
MC.B_REPLACEABLE = new Uint8Array(NB);
MC.B_TEX = new Int16Array(NB * 6);    // tile per face: +x -x +y -y +z -z
MC.B_TINT = new Uint8Array(NB * 6);   // tint mode per face
MC.B_FLUID = new Uint8Array(NB);      // MC.FLUID
MC.B_LEVEL = new Uint8Array(NB);      // fluid level: 0 source, 1..7 flowing, 8 falling
MC.B_HARD = new Float32Array(NB);     // break time base (seconds), < 0 = unbreakable
MC.B_TOOL = new Uint8Array(NB);
MC.B_TIER = new Uint8Array(NB);       // minimum tool tier to get drops (0 = any)
MC.B_RESIST = new Float32Array(NB);   // explosion resistance
MC.B_SOUND = new Uint8Array(NB);
MC.B_GRAVITY = new Uint8Array(NB);
MC.B_CLIMB = new Uint8Array(NB);
MC.B_SUPPORT = new Uint8Array(NB);    // 1 = needs solid block below, 2 = needs block above, 3 = attached (facing), 4 = sugar cane, 5 = crop (farmland)
MC.B_TICK = new Uint8Array(NB);       // random tick behaviour
MC.B_SLOW = new Float32Array(NB);     // movement multiplier inside (cobweb)
MC.B_DAMAGE = new Uint8Array(NB);     // contact damage
MC.B_FACING = new Int8Array(NB).fill(-1);
MC.B_BASE = new Uint8Array(NB);       // variant -> base block (item)
MC.B_BOXES = [];                      // render boxes in px (BOXES shape): [{b:[x0,y0,z0,x1,y1,z1], tex:[6], uvRot}]
MC.B_COLL = [];                       // collision boxes in block units (null = full cube if solid)
MC.B_SEL = [];                        // selection box in block units (null = full cube)
MC.TICK = { NONE: 0, CROP: 1, SAPLING: 2, CANE: 3, GRASS: 4, DIRT: 5, FARMLAND: 6 };

function defBlock(id, key, name, o) {
  const d = Object.assign({
    id, key, name, shape: MC.SHAPE.CUBE, layer: MC.LAYER.OPAQUE, mat: MC.MAT.SOLID,
    opaque: true, solid: true, opacity: 15, emit: 0, ao: true, cullSame: true, replaceable: false,
    tint: [0, 0, 0], // side, top, bottom
    hard: 1, tool: 0, tier: 0, sound: MC.SOUND.STONE, catalog: true,
  }, o);
  if (d.shape !== MC.SHAPE.CUBE && o.opaque === undefined) d.opaque = false;
  if (d.resist === undefined) d.resist = d.tool === MC.TOOL.PICKAXE ? Math.max(6, d.hard * 1.5) : d.hard * 1.5;
  if (d.base === undefined) d.base = id;
  MC.BLOCKS[id] = d;
  MC.BLOCK[key] = id;
  MC.B_OPAQUE[id] = d.opaque ? 1 : 0;
  MC.B_SOLID[id] = d.solid ? 1 : 0;
  MC.B_SHAPE[id] = d.shape;
  MC.B_LAYER[id] = d.layer;
  MC.B_MAT[id] = d.mat;
  MC.B_OPACITY[id] = d.opaque ? 15 : d.opacity;
  MC.B_EMIT[id] = d.emit;
  MC.B_AO[id] = d.ao && (d.opaque || d.mat === MC.MAT.LEAVES) ? 1 : 0;
  MC.B_CULLSAME[id] = d.cullSame ? 1 : 0;
  MC.B_REPLACEABLE[id] = d.replaceable ? 1 : 0;
  MC.B_FLUID[id] = d.fluid ? d.fluid : 0;
  MC.B_LEVEL[id] = d.level || 0;
  MC.B_HARD[id] = d.hard;
  MC.B_TOOL[id] = d.tool;
  MC.B_TIER[id] = d.tier;
  MC.B_RESIST[id] = d.resist;
  MC.B_SOUND[id] = d.sound;
  MC.B_GRAVITY[id] = d.gravity ? 1 : 0;
  MC.B_CLIMB[id] = d.climb ? 1 : 0;
  MC.B_SUPPORT[id] = d.support || 0;
  MC.B_TICK[id] = d.tick || 0;
  MC.B_SLOW[id] = d.slow || 0;
  MC.B_DAMAGE[id] = d.damage || 0;
  MC.B_FACING[id] = d.facing === undefined ? -1 : d.facing;
  MC.B_BASE[id] = d.base;
  MC.B_BOXES[id] = d.boxes || null;
  MC.B_COLL[id] = d.coll || null;
  MC.B_SEL[id] = d.sel || null;
  // textures: all / side,top,bottom / per face
  const t = d.tex || {};
  const side = t.side || t.all, top = t.top || t.all || side, bottom = t.bottom || t.all || top;
  const faces = [t.px || side, t.nx || side, top, bottom, t.pz || side, t.nz || side];
  const tints = [d.tint[0], d.tint[0], d.tint[1], d.tint[2], d.tint[0], d.tint[0]];
  for (let f = 0; f < 6; f++) {
    if (faces[f] && MC.TILE[faces[f]] === undefined) console.warn('Unknown tile', faces[f], 'for', key);
    MC.B_TEX[id * 6 + f] = faces[f] ? MC.TILE[faces[f]] : 0;
    MC.B_TINT[id * 6 + f] = tints[f];
  }
  return d;
}
MC.defBlock = defBlock;

// ---- box helpers (px units, facing 0 = south/+z)
// rotate a box by r quarter turns (S -> W -> N -> E) around the block centre
MC.rotBox = function (b, r) {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < r; i++) {
    // (x, z) -> (16 - z, x)
    const nx0 = 16 - z1, nx1 = 16 - z0, nz0 = x0, nz1 = x1;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [x0, y0, z0, x1, y1, z1];
};
// face index remap under one quarter turn: +z(4) -> -x(1) -> -z(5) -> +x(0) -> +z(4)
MC.ROT_FACE = [4, 5, 2, 3, 1, 0];
MC.rotFace = (f, r) => { for (let i = 0; i < r; i++) f = MC.ROT_FACE[f]; return f; };
function rotBoxes(list, r) {
  return list.map((bx) => {
    const tex = bx.tex ? [0, 0, 0, 0, 0, 0] : null;
    if (tex) for (let f = 0; f < 6; f++) tex[MC.rotFace(f, r)] = bx.tex[f];
    return { b: MC.rotBox(bx.b, r), tex, uvRot: ((bx.uvRot || 0) + r) & 3 };
  });
}
const pxBox = (b) => b.map((v) => v / 16);
function unionBox(list) {
  const u = [16, 16, 16, 0, 0, 0];
  for (const bx of list) for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], bx.b[k]); u[k + 3] = Math.max(u[k + 3], bx.b[k + 3]); }
  return pxBox(u);
}
// face tiles object -> array in face order
function faceTiles(t) {
  const side = t.side || t.all, top = t.top || t.all || side, bottom = t.bottom || t.all || top;
  const arr = [t.px || side, t.nx || side, top, bottom, t.pz || side, t.nz || side];
  return arr.map((n) => (n ? MC.TILE[n] : null));
}

(function registerBlocks() {
  const S = MC.SHAPE, L = MC.LAYER, M = MC.MAT, T = MC.TINT, TL = MC.TOOL, SN = MC.SOUND, TK = MC.TICK;
  const PICK = { tool: TL.PICKAXE, sound: SN.STONE };
  const WOOD = { tool: TL.AXE, sound: SN.WOOD };
  const DIG = { tool: TL.SHOVEL };
  const PLANT = { shape: S.CROSS, mat: M.PLANT, solid: false, opacity: 0, replaceable: true, hard: 0, sound: SN.PLANT, support: 1, sel: [0.15, 0, 0.15, 0.85, 0.8, 0.85] };
  defBlock(0, 'air', '空気', { shape: S.NONE, opaque: false, solid: false, opacity: 0, ao: false, replaceable: true, hard: 0, catalog: false });
  defBlock(1, 'grass', '草ブロック', { tex: { side: 'grass_side', top: 'grass_top', bottom: 'dirt' }, tint: [T.GRASS_MASKED, T.GRASS, 0], hard: 0.6, ...DIG, sound: SN.GRASS, tick: TK.GRASS, drop: 'dirt' });
  defBlock(2, 'dirt', '土', { tex: { all: 'dirt' }, hard: 0.5, ...DIG, sound: SN.GRAVEL, tick: TK.DIRT });
  defBlock(3, 'stone', '石', { tex: { all: 'stone' }, hard: 1.5, ...PICK, tier: 1, drop: 'cobblestone' });
  defBlock(4, 'cobblestone', '丸石', { tex: { all: 'cobblestone' }, hard: 2, ...PICK, tier: 1 });
  defBlock(5, 'sand', '砂', { tex: { all: 'sand' }, hard: 0.5, ...DIG, sound: SN.SAND, gravity: true });
  defBlock(6, 'gravel', '砂利', { tex: { all: 'gravel' }, hard: 0.6, ...DIG, sound: SN.GRAVEL, gravity: true, drop: 'gravel' });
  defBlock(7, 'oak_log', 'オークの原木', { tex: { side: 'oak_log', top: 'oak_log_top' }, hard: 2, ...WOOD });
  defBlock(8, 'oak_leaves', 'オークの葉', { tex: { all: 'oak_leaves' }, opaque: false, mat: M.LEAVES, opacity: 1, cullSame: false, tint: [T.FOLIAGE, T.FOLIAGE, T.FOLIAGE], hard: 0.2, sound: SN.PLANT, drop: 'leaves' });
  defBlock(9, 'birch_log', 'シラカバの原木', { tex: { side: 'birch_log', top: 'birch_log_top' }, hard: 2, ...WOOD });
  defBlock(10, 'birch_leaves', 'シラカバの葉', { tex: { all: 'birch_leaves' }, opaque: false, mat: M.LEAVES, opacity: 1, cullSame: false, tint: [T.BIRCH, T.BIRCH, T.BIRCH], hard: 0.2, sound: SN.PLANT, drop: 'leaves' });
  defBlock(11, 'spruce_log', 'トウヒの原木', { tex: { side: 'spruce_log', top: 'spruce_log_top' }, hard: 2, ...WOOD });
  defBlock(12, 'spruce_leaves', 'トウヒの葉', { tex: { all: 'spruce_leaves' }, opaque: false, mat: M.LEAVES, opacity: 1, cullSame: false, tint: [T.SPRUCE, T.SPRUCE, T.SPRUCE], hard: 0.2, sound: SN.PLANT, drop: 'leaves' });
  defBlock(13, 'oak_planks', 'オークの板材', { tex: { all: 'oak_planks' }, hard: 2, ...WOOD });
  defBlock(14, 'glass', 'ガラス', { tex: { all: 'glass' }, opaque: false, layer: L.TRANSLUCENT, mat: M.GLASS, opacity: 0, hard: 0.3, sound: SN.GLASS, drop: null });
  defBlock(15, 'water', '水', { tex: { all: 'water' }, shape: S.LIQUID, layer: L.WATER, mat: M.WATER, solid: false, opacity: 1, replaceable: true, ao: false, fluid: MC.FLUID.WATER, level: 0, hard: -1, resist: 100, sound: SN.WATER, catalog: false });
  defBlock(16, 'bedrock', '岩盤', { tex: { all: 'bedrock' }, hard: -1, resist: 1e9 });
  defBlock(17, 'coal_ore', '石炭鉱石', { tex: { all: 'coal_ore' }, hard: 3, ...PICK, tier: 1, drop: 'coal' });
  defBlock(18, 'iron_ore', '鉄鉱石', { tex: { all: 'iron_ore' }, hard: 3, ...PICK, tier: 2 });
  defBlock(19, 'gold_ore', '金鉱石', { tex: { all: 'gold_ore' }, hard: 3, ...PICK, tier: 3 });
  defBlock(20, 'diamond_ore', 'ダイヤモンド鉱石', { tex: { all: 'diamond_ore' }, hard: 3, ...PICK, tier: 3, drop: 'diamond' });
  defBlock(21, 'snow', '雪ブロック', { tex: { all: 'snow' }, hard: 0.3, ...DIG, sound: SN.SNOW });
  defBlock(22, 'snowy_grass', '雪の積もった草', { tex: { side: 'grass_side_snowed', top: 'snow', bottom: 'dirt' }, hard: 0.6, ...DIG, sound: SN.SNOW, drop: 'dirt' });
  defBlock(23, 'ice', '氷', { tex: { all: 'ice' }, opaque: false, layer: L.TRANSLUCENT, mat: M.ICE, opacity: 1, hard: 0.5, tool: TL.PICKAXE, sound: SN.GLASS, drop: null });
  defBlock(24, 'cactus', 'サボテン', { tex: { side: 'cactus_side', top: 'cactus_top' }, shape: S.CACTUS, opacity: 0, ao: false, hard: 0.4, sound: SN.WOOL, damage: 1, support: 4, coll: [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]] });
  defBlock(25, 'tall_grass', '草', { tex: { all: 'tall_grass' }, ...PLANT, tint: [T.GRASS, T.GRASS, T.GRASS], drop: 'grass_seeds' });
  defBlock(26, 'dandelion', 'タンポポ', { tex: { all: 'dandelion' }, ...PLANT });
  defBlock(27, 'poppy', 'ポピー', { tex: { all: 'poppy' }, ...PLANT });
  defBlock(28, 'torch', '松明', { tex: { all: 'torch' }, shape: S.TORCH, mat: M.EMISSIVE, solid: false, opacity: 0, emit: 14, hard: 0, sound: SN.WOOD, support: 1, sel: [6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16] });
  defBlock(29, 'glowstone', 'グロウストーン', { tex: { all: 'glowstone' }, mat: M.EMISSIVE, emit: 15, hard: 0.3, sound: SN.GLASS });
  defBlock(30, 'bricks', 'レンガ', { tex: { all: 'bricks' }, hard: 2, ...PICK, tier: 1 });
  defBlock(31, 'sandstone', '砂岩', { tex: { side: 'sandstone', top: 'sandstone_top' }, hard: 0.8, ...PICK, tier: 1 });
  defBlock(32, 'stone_bricks', '石レンガ', { tex: { all: 'stone_bricks' }, hard: 1.5, ...PICK, tier: 1 });
  defBlock(33, 'lava', '溶岩', { tex: { all: 'lava' }, shape: S.LIQUID, mat: M.LAVA, solid: false, opacity: 15, emit: 15, replaceable: true, ao: false, fluid: MC.FLUID.LAVA, level: 0, hard: -1, resist: 100, catalog: false });
  defBlock(34, 'dead_bush', '枯れ木', { tex: { all: 'dead_bush' }, ...PLANT, drop: 'stick' });
  defBlock(35, 'iron_block', '鉄ブロック', { tex: { all: 'iron_block' }, hard: 5, ...PICK, tier: 2, sound: SN.METAL });
  defBlock(36, 'gold_block', '金ブロック', { tex: { all: 'gold_block' }, hard: 3, ...PICK, tier: 3, sound: SN.METAL });
  defBlock(37, 'diamond_block', 'ダイヤモンドブロック', { tex: { all: 'diamond_block' }, hard: 5, ...PICK, tier: 3, sound: SN.METAL });
  defBlock(38, 'obsidian', '黒曜石', { tex: { all: 'obsidian' }, hard: 50, ...PICK, tier: 4, resist: 1200 });
  defBlock(39, 'mossy_cobblestone', '苔むした丸石', { tex: { all: 'mossy_cobblestone' }, hard: 2, ...PICK, tier: 1 });
  defBlock(40, 'clay', '粘土', { tex: { all: 'clay' }, hard: 0.6, ...DIG, sound: SN.GRAVEL });
  defBlock(41, 'bookshelf', '本棚', { tex: { side: 'bookshelf', top: 'oak_planks' }, hard: 1.5, ...WOOD });

  // ------------------------------------------------------------------ added blocks
  let next = 42;
  const add = (key, name, o) => defBlock(next++, key, name, o || {});
  // facing variants (4 ids); gen(r) returns the definition for facing r
  const addFacing = (key, name, gen, o = {}) => {
    const first = next;
    for (let r = 0; r < 4; r++) {
      const d = gen(r);
      add(r === 0 ? key : key + '_' + r, name, Object.assign({}, o, d, { facing: r, base: first, catalog: r === 0 && o.catalog !== false }));
    }
    return first;
  };
  // rotate per-face texture names so that 'front' ends up on the facing side
  const frontTex = (r, front, side, top, bottom) => {
    const faces = { 4: front, 1: side, 5: side, 0: side };
    const out = { top, bottom: bottom || top };
    const key = ['px', 'nx', null, null, 'pz', 'nz'];
    for (const f of [0, 1, 4, 5]) out[key[MC.rotFace(f, r)]] = faces[f];
    return out;
  };

  // shared with content modules that register their own blocks (castles...)
  MC.blockKit = {
    add: (key, name, o) => { const d = add(key, name, o); MC.BLOCK_COUNT = next; return d; },
    addFacing: (...a) => { const r = addFacing(...a); MC.BLOCK_COUNT = next; return r; },
    frontTex, rotBoxes, faceTiles, pxBox, PICK, WOOD, DIG,
    slab: (...a) => { const r = slab(...a); MC.BLOCK_COUNT = next; return r; },
    stairs: (...a) => { const r = stairs(...a); MC.BLOCK_COUNT = next; return r; },
  };

  // --- fluids: flowing levels 1..7 and falling (8)
  for (let lv = 1; lv <= 8; lv++) {
    add(lv === 8 ? 'water_fall' : 'water_' + lv, '水', { tex: { all: 'water' }, shape: S.LIQUID, layer: L.WATER, mat: M.WATER, solid: false, opacity: 1, replaceable: true, ao: false, fluid: MC.FLUID.WATER, level: lv, hard: -1, resist: 100, catalog: false, base: 15, sound: SN.WATER });
  }
  for (let lv = 1; lv <= 8; lv++) {
    add(lv === 8 ? 'lava_fall' : 'lava_' + lv, '溶岩', { tex: { all: 'lava' }, shape: S.LIQUID, mat: M.LAVA, solid: false, opacity: 15, emit: 15, replaceable: true, ao: false, fluid: MC.FLUID.LAVA, level: lv, hard: -1, resist: 100, catalog: false, base: 33 });
  }

  // --- building blocks
  add('spruce_planks', 'トウヒの板材', { tex: { all: 'spruce_planks' }, hard: 2, ...WOOD });
  add('birch_planks', 'シラカバの板材', { tex: { all: 'birch_planks' }, hard: 2, ...WOOD });
  add('mossy_stone_bricks', '苔むした石レンガ', { tex: { all: 'mossy_stone_bricks' }, hard: 1.5, ...PICK, tier: 1 });
  add('cracked_stone_bricks', 'ひび割れた石レンガ', { tex: { all: 'cracked_stone_bricks' }, hard: 1.5, ...PICK, tier: 1 });
  add('chiseled_stone_bricks', '模様入り石レンガ', { tex: { all: 'chiseled_stone_bricks' }, hard: 1.5, ...PICK, tier: 1 });
  add('smooth_stone', '滑らかな石', { tex: { all: 'smooth_stone' }, hard: 2, ...PICK, tier: 1 });

  // --- slabs (bottom half) and stairs (4 facings; the high side points towards the facing)
  const SLAB = [{ b: [0, 0, 0, 16, 8, 16] }];
  const slab = (key, name, tex, props) => add(key, name, Object.assign({
    tex, shape: S.BOXES, boxes: SLAB, coll: [pxBox(SLAB[0].b)], sel: pxBox(SLAB[0].b), opacity: 15, cullSame: false,
  }, props));
  slab('oak_slab', 'オークのハーフブロック', { all: 'oak_planks' }, { hard: 2, ...WOOD });
  slab('spruce_slab', 'トウヒのハーフブロック', { all: 'spruce_planks' }, { hard: 2, ...WOOD });
  slab('cobblestone_slab', '丸石のハーフブロック', { all: 'cobblestone' }, { hard: 2, ...PICK, tier: 1 });
  slab('stone_brick_slab', '石レンガのハーフブロック', { all: 'stone_bricks' }, { hard: 1.5, ...PICK, tier: 1 });
  slab('sandstone_slab', '砂岩のハーフブロック', { side: 'sandstone', top: 'sandstone_top' }, { hard: 0.8, ...PICK, tier: 1 });
  slab('smooth_stone_slab', '石のハーフブロック', { side: 'smooth_stone_side', top: 'smooth_stone' }, { hard: 2, ...PICK, tier: 1 });
  const STAIRS = [{ b: [0, 0, 0, 16, 8, 16] }, { b: [0, 8, 8, 16, 16, 16] }];
  const stairs = (key, name, tex, props) => addFacing(key, name, (r) => {
    const bx = rotBoxes(STAIRS, r);
    return { tex, shape: S.BOXES, boxes: bx, coll: bx.map((q) => pxBox(q.b)), opacity: 15, cullSame: false };
  }, props);
  stairs('oak_stairs', 'オークの階段', { all: 'oak_planks' }, { hard: 2, ...WOOD });
  stairs('spruce_stairs', 'トウヒの階段', { all: 'spruce_planks' }, { hard: 2, ...WOOD });
  stairs('cobblestone_stairs', '丸石の階段', { all: 'cobblestone' }, { hard: 2, ...PICK, tier: 1 });
  stairs('stone_brick_stairs', '石レンガの階段', { all: 'stone_bricks' }, { hard: 1.5, ...PICK, tier: 1 });
  stairs('sandstone_stairs', '砂岩の階段', { side: 'sandstone', top: 'sandstone_top' }, { hard: 0.8, ...PICK, tier: 1 });

  // --- fences, bars, panes (connections are resolved in the mesher / physics)
  add('oak_fence', 'オークのフェンス', { tex: { all: 'oak_planks' }, shape: S.FENCE, opacity: 0, cullSame: false, hard: 2, ...WOOD });
  add('spruce_fence', 'トウヒのフェンス', { tex: { all: 'spruce_planks' }, shape: S.FENCE, opacity: 0, cullSame: false, hard: 2, ...WOOD });
  add('iron_bars', '鉄格子', { tex: { all: 'iron_bars' }, shape: S.PANE, mat: M.CUTOUT, opacity: 0, cullSame: false, hard: 5, ...PICK, sound: SN.METAL });
  add('glass_pane', '板ガラス', { tex: { all: 'glass', top: 'glass_pane_edge' }, shape: S.PANE, layer: L.TRANSLUCENT, mat: M.GLASS, opacity: 0, cullSame: false, hard: 0.3, sound: SN.GLASS, drop: null });

  // --- functional blocks
  add('crafting_table', '作業台', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', px: 'crafting_table_side', nx: 'crafting_table_side', pz: 'crafting_table_front', nz: 'crafting_table_front' }, hard: 2.5, ...WOOD });
  addFacing('furnace', 'かまど', (r) => ({ tex: frontTex(r, 'furnace_front', 'furnace_side', 'furnace_top') }), { hard: 3.5, ...PICK, tier: 1 });
  const CHEST = { b: [1, 0, 1, 15, 14, 15] };
  addFacing('chest', 'チェスト', (r) => {
    const bx = rotBoxes([{ b: CHEST.b, tex: faceTiles({ side: 'chest_side', pz: 'chest_front', top: 'chest_top' }) }], r);
    return { tex: { all: 'chest_side' }, shape: S.BOXES, boxes: bx, coll: [pxBox(bx[0].b)], sel: pxBox(bx[0].b), opacity: 0, cullSame: false };
  }, { hard: 2.5, ...WOOD });
  add('tnt', 'TNT', { tex: { side: 'tnt_side', top: 'tnt_top', bottom: 'tnt_bottom' }, hard: 0, sound: SN.GRASS, resist: 0 });
  add('spawner', 'スポナー', { tex: { all: 'spawner' }, opaque: false, mat: M.CUTOUT, opacity: 0, cullSame: false, ao: false, hard: 5, ...PICK, sound: SN.METAL, drop: null });
  // doors: facing 0..3 x {lower, upper} x {closed, open}
  const DOOR_CLOSED = [0, 0, 13, 16, 16, 16], DOOR_OPEN = [0, 0, 0, 3, 16, 16];
  for (const open of [0, 1]) for (const upper of [0, 1]) {
    const k = 'oak_door' + (upper ? '_upper' : '') + (open ? '_open' : '');
    addFacing(k, 'オークのドア', (r) => {
      const t = upper ? 'door_top' : 'door_bottom';
      const bx = rotBoxes([{ b: open ? DOOR_OPEN : DOOR_CLOSED, tex: faceTiles({ all: t }) }], r);
      return { tex: { all: t }, shape: S.BOXES, boxes: bx, coll: [pxBox(bx[0].b)], sel: pxBox(bx[0].b), opacity: 0, cullSame: false, mat: M.CUTOUT, door: { upper, open } };
    }, { hard: 3, ...WOOD, support: upper ? 0 : 1, catalog: !upper && !open });
  }
  const doorBase = MC.BLOCK.oak_door;
  for (let id = doorBase; id < next; id++) MC.B_BASE[id] = doorBase, MC.BLOCKS[id].base = doorBase;
  addFacing('ladder', 'はしご', (r) => {
    const bx = rotBoxes([{ b: [0, 0, 15, 16, 16, 16] }], r);
    return { tex: { all: 'ladder' }, shape: S.BOXES, boxes: bx, sel: pxBox(MC.rotBox([0, 0, 13, 16, 16, 16], r)), solid: false, opacity: 0, cullSame: false, mat: M.CUTOUT, climb: true, ao: false };
  }, { hard: 0.4, tool: TL.AXE, sound: SN.WOOD, support: 3 });
  // beds: facing = direction from foot to head
  const BED = [0, 0, 0, 16, 9, 16];
  for (const head of [0, 1]) {
    addFacing(head ? 'bed_head' : 'bed', 'ベッド', (r) => {
      const bx = rotBoxes([{ b: BED, tex: faceTiles({ side: 'bed_side', top: head ? 'bed_head_top' : 'bed_foot_top', bottom: 'oak_planks' }) }], r);
      return { tex: { all: 'bed_side' }, shape: S.BOXES, boxes: bx, coll: [pxBox(BED)], sel: pxBox(BED), opacity: 0, cullSame: false, bed: { head } };
    }, { hard: 0.3, sound: SN.WOOL, catalog: !head });
  }
  const bedBase = MC.BLOCK.bed;
  for (let id = bedBase; id < next; id++) MC.B_BASE[id] = bedBase, MC.BLOCKS[id].base = bedBase;

  // --- wool
  const WOOL = [['white', '白'], ['orange', '橙'], ['yellow', '黄'], ['lime', '黄緑'], ['light_blue', '空'], ['red', '赤'], ['purple', '紫'], ['black', '黒']];
  for (const [c, n] of WOOL) add('wool_' + c, n + '色の羊毛', { tex: { all: 'wool_' + c }, hard: 0.8, sound: SN.WOOL });

  // --- lights / decoration
  add('lantern', 'ランタン', { tex: { side: 'lantern_side', top: 'lantern_top' }, shape: S.BOXES, mat: M.EMISSIVE, solid: false, opacity: 0, emit: 15, cullSame: false, ao: false,
    boxes: [{ b: [5, 0, 5, 11, 7, 11] }, { b: [6, 7, 6, 10, 9, 10] }], sel: [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16], hard: 3.5, ...PICK, sound: SN.METAL, support: 1 });
  add('hanging_lantern', 'ランタン', { tex: { side: 'lantern_side', top: 'lantern_top' }, shape: S.BOXES, mat: M.EMISSIVE, solid: false, opacity: 0, emit: 15, cullSame: false, ao: false,
    boxes: [{ b: [5, 1, 5, 11, 8, 11] }, { b: [6, 8, 6, 10, 10, 10] }, { b: [7, 10, 7, 9, 16, 9], tex: faceTiles({ all: 'chain' }) }], sel: [5 / 16, 1 / 16, 5 / 16, 11 / 16, 1, 11 / 16],
    hard: 3.5, ...PICK, sound: SN.METAL, support: 2, base: MC.BLOCK.lantern, catalog: false });
  add('hay_bale', '干し草の俵', { tex: { side: 'hay_side', top: 'hay_top' }, hard: 0.5, sound: SN.GRASS });
  add('pumpkin', 'カボチャ', { tex: { side: 'pumpkin_side', top: 'pumpkin_top' }, hard: 1, tool: TL.AXE, sound: SN.WOOD });
  add('jack_o_lantern', 'ジャック・オ・ランタン', { tex: { side: 'pumpkin_side', pz: 'jack_o_lantern', top: 'pumpkin_top' }, emit: 15, hard: 1, tool: TL.AXE, sound: SN.WOOD });
  add('melon', 'スイカ', { tex: { side: 'melon_side', top: 'melon_top' }, hard: 1, tool: TL.AXE, sound: SN.WOOD, drop: 'melon_slice' });
  add('emerald_ore', 'エメラルド鉱石', { tex: { all: 'emerald_ore' }, hard: 3, ...PICK, tier: 3, drop: 'emerald' });
  add('emerald_block', 'エメラルドブロック', { tex: { all: 'emerald_block' }, hard: 5, ...PICK, tier: 3, sound: SN.METAL });
  add('coal_block', '石炭ブロック', { tex: { all: 'coal_block' }, hard: 5, ...PICK, tier: 1 });

  // --- farming
  const FARM = [{ b: [0, 0, 0, 16, 15, 16] }];
  add('farmland', '耕地', { tex: { side: 'dirt', top: 'farmland_top' }, shape: S.BOXES, boxes: FARM, coll: [pxBox(FARM[0].b)], opacity: 15, cullSame: false, hard: 0.6, ...DIG, sound: SN.GRAVEL, drop: 'dirt', tick: TK.FARMLAND });
  add('dirt_path', '土の道', { tex: { side: 'path_side', top: 'path_top', bottom: 'dirt' }, shape: S.BOXES, boxes: FARM, coll: [pxBox(FARM[0].b)], opacity: 15, cullSame: false, hard: 0.65, ...DIG, sound: SN.GRAVEL, drop: 'dirt' });
  for (let st = 0; st < 4; st++) {
    add('wheat_' + st, '小麦', { tex: { all: 'wheat_' + st }, shape: S.CROP, mat: M.PLANT, solid: false, opacity: 0, replaceable: false, hard: 0, sound: SN.PLANT, support: 5, tick: TK.CROP, catalog: false, stage: st,
      sel: [0, 0, 0, 1, (4 + st * 4) / 16, 1] });
  }
  add('oak_sapling', 'オークの苗木', { tex: { all: 'oak_sapling' }, ...PLANT, replaceable: false, tick: TK.SAPLING, tree: 'oak' });
  add('birch_sapling', 'シラカバの苗木', { tex: { all: 'birch_sapling' }, ...PLANT, replaceable: false, tick: TK.SAPLING, tree: 'birch' });
  add('spruce_sapling', 'トウヒの苗木', { tex: { all: 'spruce_sapling' }, ...PLANT, replaceable: false, tick: TK.SAPLING, tree: 'spruce' });
  add('sugar_cane', 'サトウキビ', { tex: { all: 'sugar_cane' }, ...PLANT, replaceable: false, support: 4, tick: TK.CANE, sel: [0.12, 0, 0.12, 0.88, 1, 0.88] });
  add('cobweb', 'クモの巣', { tex: { all: 'cobweb' }, shape: S.CROSS, mat: M.CUTOUT, solid: false, opacity: 1, hard: 4, tool: TL.SWORD, sound: SN.WOOL, slow: 0.22, drop: 'string', sel: [0, 0, 0, 1, 1, 1] });
  add('brown_mushroom', '茶色のキノコ', { tex: { all: 'brown_mushroom' }, ...PLANT, sel: [0.3, 0, 0.3, 0.7, 0.4, 0.7] });
  add('red_mushroom', '赤色のキノコ', { tex: { all: 'red_mushroom' }, ...PLANT, sel: [0.3, 0, 0.3, 0.7, 0.4, 0.7] });
  add('cornflower', 'ヤグルマギク', { tex: { all: 'cornflower' }, ...PLANT });
  add('allium', 'アリウム', { tex: { all: 'allium' }, ...PLANT });
  add('oxeye_daisy', 'フランスギク', { tex: { all: 'oxeye_daisy' }, ...PLANT });
  add('fern', 'シダ', { tex: { all: 'fern' }, ...PLANT, tint: [T.GRASS, T.GRASS, T.GRASS], drop: 'grass_seeds' });
  // torches mounted on a wall: facing = direction towards the supporting wall
  addFacing('wall_torch', '松明', (r) => ({
    sel: pxBox(MC.rotBox([5.5, 3, 11, 10.5, 13.5, 16], r)),
  }), { tex: { all: 'torch' }, shape: S.TORCH, mat: M.EMISSIVE, solid: false, opacity: 0, emit: 14, hard: 0, sound: SN.WOOD, support: 3, catalog: false, base: MC.BLOCK.torch });
  for (let id = MC.BLOCK.wall_torch; id < next; id++) MC.B_BASE[id] = MC.BLOCK.torch, MC.BLOCKS[id].base = MC.BLOCK.torch;
  MC.BLOCK_COUNT = next;
})();

// ---- helpers
MC.isFluid = (id) => MC.B_FLUID[id] !== 0;
MC.fluidId = function (type, level) {
  if (type === MC.FLUID.WATER) return level === 0 ? MC.BLOCK.water : MC.BLOCK[level === 8 ? 'water_fall' : 'water_' + level];
  return level === 0 ? MC.BLOCK.lava : MC.BLOCK[level === 8 ? 'lava_fall' : 'lava_' + level];
};
// fluid surface height (block units) of a single cell
MC.fluidHeight = (id) => { const lv = MC.B_LEVEL[id]; return lv === 0 || lv === 8 ? 0.875 : 0.875 * (8 - lv) / 8; };
// facing variant of a block family (base id + facing), doors keep half/open flags
MC.withFacing = function (id, facing) {
  const d = MC.BLOCKS[id];
  if (!d || d.facing === undefined) return id;
  const first = id - d.facing;
  return first + (facing & 3);
};
MC.rotateBlock = function (id, r) {
  const d = MC.BLOCKS[id];
  if (!d || d.facing === undefined || !r) return id;
  return MC.withFacing(id, d.facing + r);
};
MC.doorId = function (facing, upper, open) {
  return MC.BLOCK['oak_door' + (upper ? '_upper' : '') + (open ? '_open' : '')] + (facing & 3);
};
MC.bedId = (facing, head) => MC.BLOCK[head ? 'bed_head' : 'bed'] + (facing & 3);
MC.isDoor = (id) => !!(MC.BLOCKS[id] && MC.BLOCKS[id].door);
MC.isBed = (id) => !!(MC.BLOCKS[id] && MC.BLOCKS[id].bed);
MC.isChest = (id) => MC.B_BASE[id] === MC.BLOCK.chest;
MC.isFurnace = (id) => MC.B_BASE[id] === MC.BLOCK.furnace;
MC.isStairs = (id) => !!(MC.BLOCKS[id] && MC.BLOCKS[id].key.includes('stairs'));
MC.isCrop = (id) => MC.B_TICK[id] === MC.TICK.CROP;
MC.connectsFence = (id) => MC.B_SHAPE[id] === MC.SHAPE.FENCE || MC.B_OPAQUE[id] === 1;
MC.connectsPane = (id) => MC.B_SHAPE[id] === MC.SHAPE.PANE || MC.B_OPAQUE[id] === 1;

// Connection boxes for fences / panes (px units). mask bits: 1 = +z, 2 = -x, 4 = -z, 8 = +x (facing order)
MC.connectBoxes = function (shape, mask, forCollision) {
  const out = [];
  if (shape === MC.SHAPE.FENCE) {
    const h = forCollision ? 24 : 16;
    out.push([6, 0, 6, 10, h, 10]);
    const arms = forCollision ? [[0, h]] : [[6, 9], [12, 15]];
    for (let f = 0; f < 4; f++) {
      if (!(mask & (1 << f))) continue;
      for (const [y0, y1] of arms) {
        const w = forCollision ? [6, 10] : [7, 9];
        out.push(MC.rotBox([w[0], y0, 10, w[1], y1, 16], f));
      }
    }
  } else {
    out.push([7, 0, 7, 9, 16, 9]);
    for (let f = 0; f < 4; f++) if (mask & (1 << f)) out.push(MC.rotBox([7, 0, 9, 9, 16, 16], f));
  }
  return out;
};

MC.HOTBAR_DEFAULT = ['grass', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'glass', 'torch', 'glowstone', 'stone_bricks'];
