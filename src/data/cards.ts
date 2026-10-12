import type { CardDef, Suit } from '../core/types';

/** PRD 6.6 卡表（原型子集） */
export const CARDS: Record<string, CardDef> = {
  B001: { name: '杀', type: '基本', cost: 1, sha: true, tgt: 'range', desc: '对攻击范围内一名敌人造成1点伤害（视为杀，可闪）' },
  B002: { name: '火杀', type: '基本', cost: 1, sha: true, fire: true, tgt: 'range', desc: '对攻击范围内一名敌人造成1点火属性伤害（视为杀）' },
  B004: { name: '闪', type: '基本', cost: 0, shan: true, desc: '响应：抵消一张杀' },
  B005: { name: '桃', type: '基本', cost: 1, tao: true, desc: '回复1点体力；濒死时也可使用' },
  B006: { name: '酒', type: '基本', cost: 1, jiu: true, desc: '本回合下一张杀伤害+1（不可叠加）；濒死时视为桃' },
  T001: { name: '无中生有', type: '锦囊', cost: 1, desc: '摸2张牌' },
  T003: { name: '过河拆桥', type: '锦囊', cost: 1, tgt: 'any', desc: '弃置一名敌人最多2点护甲' },
  T005: { name: '南蛮入侵', type: '锦囊', cost: 2, aoe: true, desc: '对所有敌人各造成1点伤害（视为杀；各目标可分别闪）' },
  T012: { name: '以逸待劳', type: '锦囊', cost: 1, desc: '获得3点护甲' },
  T013: { name: '知己知彼', type: '锦囊', cost: 0, tgt: 'any', desc: '查看一名敌人的下2个意图；摸1张牌' },
  D001: { name: '乐不思蜀', type: '延时锦囊', cost: 1, tgt: 'any', desc: '置入目标判定区。其回合开始判定：若不为♥，跳过出杀/锦囊' },
  SH01: { name: '义勇', type: '锦囊·蜀', cost: 1, desc: '本回合下一张杀伤害+1，且无视距离' },
  X004: { name: '武圣斩', type: '专属·关羽', cost: 2, sha: true, bonus: 1, tgt: 'range', needRed: true, desc: '将一张红色牌当杀使用，伤害+1' },
  W001: { name: '诸葛弩', type: '装备·武器', cost: 1, slot: 'weapon', range: 1, desc: '攻击范围1。你使用杀的军令费用-1（最低0），每回合限2次' },
  A001: { name: '八卦阵', type: '装备·防具', cost: 1, slot: 'armor', desc: '你成为杀的目标时，可判定：红色则视为打出闪' },
  M001: { name: '赤兔', type: '装备·-1马', cost: 1, slot: 'minus', desc: '你与他人距离-1' },
};

/** 关羽起始牌组（PRD 7.3 H01，11张）+ 原型演示追加 8 张 */
export const STARTER_DECK: [string, Suit, number][] = [
  ['B001', 'S', 7],
  ['B001', 'C', 8],
  ['B001', 'H', 10],
  ['B002', 'D', 4],
  ['B004', 'H', 2],
  ['B004', 'D', 2],
  ['B005', 'H', 3],
  ['T001', 'H', 7],
  ['SH01', 'S', 4],
  ['X004', 'D', 12],
  ['T012', 'C', 3],
  ['B006', 'S', 9],
  ['T005', 'S', 13],
  ['D001', 'H', 6],
  ['T003', 'C', 12],
  ['T013', 'D', 9],
  ['W001', 'D', 1],
  ['A001', 'S', 2],
  ['M001', 'H', 5],
];
