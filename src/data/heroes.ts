import type { HeroDef } from '../core/types';
import { CONFIG, atomAmount, type Ability } from './config';

/** 武将：来自 config/heroes/*.yaml（V1：H01–H08 开局 8 将 + H09 关羽保留） */
const skill = (a: Ability) => ({ name: a.name, desc: a.desc });
/** 同名技能（一个技能拆成多条能力实现，如陆逊·谦逊 = 免咒 + 每回合 +1 军令）只展示一次，取第一条的描述（#58） */
const skills = (as: Ability[]) => as.filter((a, i) => as.findIndex((b) => b.name === a.name) === i).map(skill);
export const HEROES: Record<string, HeroDef> = Object.fromEntries(
  Object.values(CONFIG.heroes).map((h) => [
    h.id,
    { id: h.id, name: h.name, faction: h.faction, hp: h.hp, mainSkills: skills(h.mainSkills), subSkill: skill(h.subSkill) },
  ]),
);

/** 开局名单（roster !== false） */
export const ROSTER = Object.values(CONFIG.heroes)
  .filter((h) => h.roster !== false)
  .map((h) => h.id);

/** PRD 7.4 珠联璧合 · 关羽+赵云「龙虎会」（V1 停用，仅回归预设使用）：config/heroes/H09-guanyu.yaml combos */
const longhu = CONFIG.heroes.H09.combos!.find((c) => c.partner === 'H03')!;
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
