import type { HeroDef } from '../core/types';
import { CONFIG, atomAmount, type Ability } from './config';

/** 武将：来自 config/heroes/*.yaml（原型只实装关羽主将 + 赵云副将） */
const skill = (a: Ability) => ({ name: a.name, desc: a.desc });
export const HEROES: Record<string, HeroDef> = Object.fromEntries(
  Object.values(CONFIG.heroes).map((h) => [
    h.id,
    { id: h.id, name: h.name, faction: h.faction, hp: h.hp, mainSkills: h.mainSkills.map(skill), subSkill: skill(h.subSkill) },
  ]),
);

/** PRD 7.4 珠联璧合 · 关羽+赵云「龙虎会」：config/heroes/H01-guanyu.yaml combos */
const longhu = CONFIG.heroes.H01.combos!.find((c) => c.partner === 'H02')!;
export const COMBO_LONGHU = {
  name: longhu.name,
  startArmor: atomAmount(
    longhu.abilities.filter((a) => a.trigger.when === 'battle_start'),
    'armor',
  )!,
};

const R = CONFIG.rules;
export const RULES = {
  lingPerTurn: R.lingPerTurn,
  drawPerTurn: R.drawPerTurn,
  firstTurnBonus: R.firstTurnBonus,
  minHandLimit: R.minHandLimit,
  responseSeconds: R.responseSeconds,
  armorKeep: R.armorKeep,
};

/** 护甲数值（难度方案 D ②）：从卡牌/词条配置读取；未实装的牌在 rules.yaml pendingValues */
const affixArmor = (id: string) => atomAmount(CONFIG.affixes.find((a) => a.id === id)?.abilities, 'armor')!;
export const ARMOR = {
  yiyidailao: atomAmount(CONFIG.cards.T012.abilities, 'armor')!,
  gushou: R.pendingValues!.gushou,
  jinchuangyao: R.pendingValues!.jinchuangyao,
  qijinqichu: R.pendingValues!.qijinqichu,
  affixJiangu: affixArmor('E_W01'),
  affixHuichun: affixArmor('E_P02'),
};
