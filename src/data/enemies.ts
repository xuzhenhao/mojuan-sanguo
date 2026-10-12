import type { BattleDef, EnemyAct, EnemyCardDef, EnemyDef } from '../core/types';

/**
 * 敌人只通过“出牌/技能”行动：杀 = 1 点伤害（灵光一闪词条可改），闪 = 闪标记，护甲仅来自技能。
 * PRD 11.2 的 ATK/DEF/DEBUFF 循环映射为出牌：ATK→杀（重击→多张杀/万箭），DEF→备闪，DEBUFF→咒。
 */
/** V0.3 难度方案 D 第 2 轮：数值以 PRD 0.3 第 11 章为准 */
export const ENEMIES: Record<string, EnemyDef> = {
  E101: { name: '黄巾步卒', hp: 4, row: 'front', pat: [['杀', '杀'], ['杀'], ['杀', '杀', '杀']], flash: 0, g: '卒' },
  E102: { name: '黄巾弓手', hp: 3, row: 'back', pat: [['杀'], ['杀', '杀'], ['闪', '杀']], flash: 0, g: '弓' },
  E103: { name: '黄巾咒师', hp: 5, row: 'back', pat: [['咒'], ['杀', '杀']], flash: 1, g: '咒', skill: '妖咒：意图「咒」随机弃你1张手牌；每回合补1枚闪标记' },
  E104: { name: '流民暴徒', hp: 6, row: 'front', pat: [['杀', '杀'], ['杀', '杀'], ['杀', '杀', '杀']], flash: 0, g: '暴' },
  E1E1: {
    name: '张宝·墨影',
    hp: 15,
    row: 'front',
    elite: true,
    flash: 0,
    g: '宝',
    pat: [
      ['杀+', '杀'],
      ['闪', '杀', '杀'],
      ['万箭', '杀+', '杀+'],
    ],
    skill: '黄天庇佑：回合开始若有后排友军，护甲+1｜其【杀】已灵光一闪「锋锐」：伤害+1',
  },
};

export const ENEMY_CARDS: Record<EnemyAct, EnemyCardDef> = {
  杀: { t: '杀', dmg: 1 },
  '杀+': { t: '杀', dmg: 2, mod: '锋锐' },
  万箭: { t: '万箭', dmg: 1 },
  闪: { t: '闪' },
  咒: { t: '咒' },
};

export const MAX_FLASH_MARKS = 2;

export const BATTLES: BattleDef[] = [
  { name: '黄巾前哨', en: ['E101', 'E101', 'E102'] },
  { name: '流民之乱', en: ['E104', 'E101', 'E103'] },
  { name: '精英·张宝', en: ['E1E1', 'E102'] },
];
