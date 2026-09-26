'use strict';
// Kingdom content: props held by the kingdom's people, the trades of its craftsmen, the building catalogue
// (costs, limits, what each building brings), the raiding armies and the name pools for kingdoms and people.
// Logic: kingdom.js (construction), kingdommobs.js (people, raids), kingdomui.js (screens / HUD).
(function () {
  const D = MC.defItem;
  // props of the kingdom's people (not obtainable)
  D('k_lance', '騎士の槍', { stack: 1, held: 'tool', hidden: true });
  D('k_hammer', '鍛冶の金槌', { stack: 1, held: 'tool', hidden: true });

  // ---------------------------------------------------------------- trades of the kingdom's craftsmen
  Object.assign(MC.PROFESSIONS, {
    k_smith: { name: '鍛冶職人', robe: [0.3, 0.3, 0.32], trades: [
      [['iron_ingot', 2], null, ['iron_sword', 1]], [['iron_ingot', 3], null, ['iron_pickaxe', 1]], [['iron_ingot', 3], null, ['iron_axe', 1]],
      [['iron_ingot', 1], null, ['arrow', 12]], [['diamond', 2], ['iron_ingot', 1], ['diamond_sword', 1]], [['diamond', 3], ['iron_ingot', 1], ['diamond_pickaxe', 1]],
      [['iron_ore', 2], ['coal', 2], ['iron_ingot', 3]], [['gold_ore', 2], ['coal', 2], ['gold_ingot', 3]], [['gold_ingot', 4], null, ['emerald', 2]],
    ] },
    k_merchant: { name: '商人', robe: [0.45, 0.2, 0.5], trades: [
      [['emerald', 1], null, ['bread', 5]], [['emerald', 2], null, ['cooked_beef', 5]], [['emerald', 1], null, ['torch', 16]],
      [['emerald', 2], null, ['iron_ingot', 3]], [['emerald', 3], null, ['glass', 16]], [['emerald', 1], null, ['hay_bale', 2]],
      [['emerald', 1], null, ['wool_white', 6]], [['wheat', 18], null, ['emerald', 1]], [['oak_planks', 32], null, ['emerald', 1]],
      [['emerald', 4], null, ['healing_potion', 1]], [['emerald', 6], null, ['golden_apple', 1]],
    ] },
    k_farmer: { name: '農夫', robe: [0.5, 0.42, 0.25], trades: [
      [['emerald', 1], null, ['bread', 6]], [['emerald', 1], null, ['wheat_seeds', 16]], [['emerald', 1], null, ['hay_bale', 2]],
      [['emerald', 1], null, ['apple', 5]], [['emerald', 2], null, ['pumpkin', 4]], [['wheat', 20], null, ['emerald', 1]],
    ] },
    k_priest: { name: '司祭', robe: [0.95, 0.93, 0.85], trades: [
      [['emerald', 3], null, ['healing_potion', 1]], [['rotten_flesh', 16], null, ['emerald', 1]], [['bone', 12], null, ['emerald', 1]],
      [['gold_ingot', 6], null, ['golden_apple', 1]], [['emerald', 14], null, ['life_crystal', 1]],
    ] },
  });

  // ---------------------------------------------------------------- building catalogue
  // cost: [key | '#group', n]; need: prerequisite counts; people: residents that move in when it is finished
  MC.KINGDOM_BUILDINGS = {
    house: { name: '民家', icon: 'bed', desc: '町民が2人移り住む。王国の人口が増える', cost: [['#planks', 24], ['#cobble', 12], ['#log', 4]], max: 12, fame: 4 },
    farm: { name: '農場', icon: 'wheat', desc: '農夫が畑を耕し、収穫物を農場のチェストに貯めていく', cost: [['#planks', 8], ['#log', 4], ['wheat_seeds', 8]], max: 4, fame: 3 },
    barracks: { name: '兵舎', icon: 'iron_sword', desc: '剣士が3人駐屯し、町を巡回して王国を守る', cost: [['#planks', 32], ['#cobble', 24], ['iron_ingot', 3]], max: 3, fame: 6 },
    tower: { name: '見張り塔', icon: 'bow', desc: '弓兵が2人配置され、塔の上から敵を射抜く', cost: [['#cobble', 32], ['#planks', 10], ['string', 2]], max: 6, fame: 5 },
    stable: { name: '厩舎', icon: 'hay_bale', desc: '馬に乗った騎士が2人駐屯する。突撃で敵をなぎ倒す', cost: [['#planks', 28], ['hay_bale', 3], ['iron_ingot', 4]], max: 2, need: { barracks: 1 }, fame: 8 },
    forge: { name: '鍛冶場', icon: 'furnace', desc: '鍛冶職人が武器を鍛え、全兵士の攻撃力が上がる。武具の取引もできる', cost: [['#cobble', 32], ['#planks', 12], ['iron_ingot', 4]], max: 1, fame: 6 },
    market: { name: '市場', icon: 'emerald', desc: '商人が店を開く。食料・資材・霊薬を取引できる', cost: [['#planks', 20], ['#wool', 6], ['emerald', 3]], max: 1, need: { house: 2 }, fame: 8 },
    chapel: { name: '礼拝堂', icon: 'gold_block', desc: '司祭が住み、近くの民と陛下の傷を癒やす', cost: [['#cobble', 40], ['#planks', 12], ['glass_pane', 4]], max: 1, need: { house: 3 }, fame: 10 },
    plaza: { name: '広場と井戸', icon: 'water_bucket', desc: '町の中心となる広場。町民が集い、王国の名声が上がる', cost: [['#cobble', 16], ['#planks', 4]], max: 3, fame: 5 },
    wall: { name: '城壁', icon: 'stone_bricks', desc: '町を囲む城壁を一区画ずつ築く。区画ごとの塔に弓兵が1人立つ', cost: [['#cobble', 40]], max: 9, fame: 5 },
  };
  MC.KINGDOM_ORDER = ['house', 'farm', 'barracks', 'tower', 'wall', 'stable', 'forge', 'plaza', 'market', 'chapel'];
  MC.KINGDOM_RANKS = [
    [0, '辺境の小国', 1], [4, '新興の王国', 2], [9, '栄える王国', 3], [16, '偉大なる王国', 4], [26, '伝説の大王国', 5],
  ];
  // banner colours (wool / carpet keys) a kingdom can choose
  MC.KINGDOM_COLORS = [
    ['red', '真紅'], ['light_blue', '蒼天'], ['yellow', '黄金'], ['purple', '紫紺'], ['black', '漆黒'], ['white', '白銀'], ['orange', '橙'], ['lime', '若葉'],
  ];

  // ---------------------------------------------------------------- raiding armies
  MC.RAID_ARMIES = {
    knight: { name: '黒鉄騎士団の残党', types: ['undead_knight', 'undead_knight', 'skeleton', 'zombie'] },
    necro: { name: '死霊の軍勢', types: ['ghoul', 'ghoul', 'skeleton', 'zombie'] },
    desert: { name: '砂漠の略奪団', types: ['mummy', 'scorpion', 'skeleton', 'mummy'] },
    frost: { name: '氷原の亡者軍', types: ['frozen_zombie', 'frozen_zombie', 'frost_skeleton'] },
    volcano: { name: '炎魔の軍勢', types: ['flame_skeleton', 'magma_brute', 'flame_skeleton'] },
    horde: { name: '魔物の大群', types: ['zombie', 'zombie', 'skeleton', 'skeleton', 'spider'] },
  };

  // ---------------------------------------------------------------- names
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const KA = ['アル', 'ベル', 'カル', 'ドゥ', 'エル', 'フォル', 'グラ', 'ヘル', 'イル', 'ルク', 'マル', 'ノル', 'オル', 'セル', 'ティル', 'ヴァル', 'ウィン', 'ゼル', 'ロズ', 'シル', 'アスト', 'リン'];
  const KB = ['', '', 'ヴェ', 'ディ', 'メ', 'ネ', 'ガ', 'ラ', 'ト', 'セ', 'リ', 'ス'];
  const KC = ['リア', 'ニア', 'ランド', 'ガルド', 'ハイム', 'ボルグ', 'ディア', 'ティス', 'ロス', 'ヴェル', 'モンド', 'ウェル', 'グレン'];
  MC.kingdomName = () => pick(KA) + pick(KB) + pick(KC) + '王国';
  MC.PEOPLE_NAMES = {
    m: ['アーサー', 'ベルナール', 'セドリック', 'ダリウス', 'エドガー', 'フェリクス', 'ガレス', 'ハロルド', 'イヴァン', 'ユリウス', 'ケネス', 'レオン', 'マーカス',
      'ニコラス', 'オスカー', 'パーシヴァル', 'ローランド', 'ステファン', 'トリスタン', 'ウィリアム', 'アルバン', 'ギルバート', 'ヒューゴ', 'ラルフ', 'ジェラール',
      'ロベール', 'ゴドフリー', 'ベネディクト', 'コンラート', 'ランスロット', 'エリック', 'ボードゥアン'],
    f: ['アリス', 'ベアトリス', 'クララ', 'エレナ', 'フィオナ', 'グレタ', 'イザベル', 'ジュリア', 'リリアン', 'マリアン', 'ロザリンド', 'ソフィア', 'エマ',
      'ヘレナ', 'アデル', 'セシリア', 'ミリアム', 'ノエル', 'マティルダ', 'エレノア'],
  };
  MC.personName = (g = 'm') => pick(MC.PEOPLE_NAMES[g] || MC.PEOPLE_NAMES.m);
  MC.CITIZEN_LINES = [
    '陛下、ごきげんよう！', 'この町は日に日に賑やかになっていきますね', '夜は魔物が出ます。お気をつけて', '陛下の王国に住めて幸せです',
    '兵隊さんがいるので安心して眠れます', '畑の麦がよく育っていますよ', '新しい家が建つのが楽しみです', '城壁があれば、もっと安心なのですが…',
    '市場ができたら、布を買いに行きたいわ', '先日の戦いは見事でした、陛下！', '井戸の水はとても澄んでいるんです',
  ];
})();
