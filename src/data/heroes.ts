import type { HeroDef } from '../core/types';

/** PRD 7.3（原型只实装关羽主将 + 赵云副将） */
export const HEROES: Record<string, HeroDef> = {
  H01: {
    id: 'H01',
    name: '关羽',
    faction: '蜀',
    hp: 8,
    mainSkills: [
      { name: '武执', desc: '锁定：你的红色牌可当「杀」使用（仍支付杀的费用）' },
      { name: '傲骨', desc: '主动，出牌阶段限1：弃1张红色牌，本回合下一张杀伤害+1' },
    ],
    subSkill: { name: '助威', desc: '主将每回合第一次用杀造成伤害后，摸1张牌' },
  },
  H02: {
    id: 'H02',
    name: '赵云',
    faction: '蜀',
    hp: 8,
    mainSkills: [
      { name: '龙胆', desc: '锁定：杀可当闪打出，闪可当杀使用' },
      { name: '涯角', desc: '锁定：出牌阶段使用的第一张杀或闪，摸1张牌' },
    ],
    subSkill: { name: '护主', desc: '主将成为杀的目标时，可令其判定，红色则此杀无效（每回合限1）' },
  },
};

/** PRD 7.4 珠联璧合 · 关羽+赵云「龙虎会」：战斗开始 3 护甲；每场首次杀摸 1 */
export const COMBO_LONGHU = { name: '龙虎会', startArmor: 3 };
export const RULES = { lingPerTurn: 3, drawPerTurn: 3, firstTurnBonus: 2, minHandLimit: 2, responseSeconds: 8, armorKeep: 2 };

/**
 * 难度方案 D ②：护甲数值（按 1 点杀重新定价，见 docs/proposals/difficulty.md）。
 * 固守 / 金创药 / 七进七出 尚未实装，数值先在此登记。
 */
export const ARMOR = { yiyidailao: 3, gushou: 3, jinchuangyao: 4, qijinqichu: 3, affixJiangu: 2, affixHuichun: 2 };
