import type { AffixDef, Rarity } from '../core/types';

/** PRD 8.5 词条库 */
export const AFFIXES: AffixDef[] = [
  { id: 'E_S01', r: 'N', n: '锋锐', d: '伤害+1', cat: 'sha' },
  { id: 'E_S02', r: 'N', n: '轻招', d: '费用-1（最低0）', cat: 'sha' },
  { id: 'E_S03', r: 'R', n: '追击', d: '击杀时摸1', cat: 'sha' },
  { id: 'E_S04', r: 'R', n: '穿杨', d: '无视距离', cat: 'sha' },
  { id: 'E_S05', r: 'R', n: '烈焰', d: '变为火属性', cat: 'sha', mutex: 'fire' },
  { id: 'E_S06', r: 'E', n: '双响', d: '可额外指定1名目标（伤害各算）', cat: 'sha' },
  { id: 'E_S07', r: 'E', n: '破甲', d: '先弃目标2护甲再结算', cat: 'sha' },
  { id: 'E_S08', r: 'L', n: '无影', d: '不可闪', cat: 'sha' },
  { id: 'E_D01', r: 'N', n: '余韵', d: '抵消后摸1', cat: 'shan' },
  { id: 'E_D02', r: 'R', n: '反震', d: '抵消后对来源造成1伤害', cat: 'shan' },
  { id: 'E_D03', r: 'E', n: '连环闪', d: '抵消后，本回合下一张杀费用-1', cat: 'shan' },
  { id: 'E_P01', r: 'N', n: '厚味', d: '回复+1', cat: 'tao' },
  { id: 'E_P02', r: 'R', n: '回春', d: '回复后获得2护甲', cat: 'tao' },
  { id: 'E_P03', r: 'E', n: '仙酿', d: '酒：杀伤害+1改为+2', cat: 'jiu' },
  { id: 'E_T01', r: 'N', n: '精研', d: '费用-1（最低0）', cat: 'trick' },
  { id: 'E_T02', r: 'N', n: '余墨', d: '结算后摸1', cat: 'trick' },
  { id: 'E_T04', r: 'R', n: '扩写', d: '无中生有类：额外摸1', cat: 'trick', only: 'T001' },
  { id: 'E_T05', r: 'E', n: '播迁', d: '群体锦囊伤害+1', cat: 'trick', only: 'T005' },
  { id: 'E_T06', r: 'L', n: '天启', d: '打出时获得1军令', cat: 'trick' },
  { id: 'E_W01', r: 'N', n: '坚固', d: '装备后获得2护甲', cat: 'equip' },
  { id: 'E_W02', r: 'R', n: '贯虹', d: '武器：攻击范围+1', cat: 'equip', slot: 'weapon' },
  { id: 'E_W03', r: 'E', n: '化境', d: '装备后摸2', cat: 'equip' },
];

/** 先抽稀有度再抽词条：N 50 / R 35 / E 12 / L 3 */
export const RARITY_WEIGHT: Record<Rarity, number> = { N: 50, R: 35, E: 12, L: 3 };

/** PRD 8.3 */
export const EPIPHANY = { baseRate: 0.08, maxPerBattle: 2, pityPlays: 12 };
