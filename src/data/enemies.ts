import type { BattleDef, EnemyAct, EnemyCardDef, EnemyDef, EnemyPhaseDef } from '../core/types';
import { CONFIG, type EnemyCfg } from './config';

/**
 * 敌人：来自 config/enemies/**.yaml；战斗序列来自 config/encounters/ch1.yaml。
 * 敌人只通过“出牌/技能”行动：杀 = 1 点伤害（灵光一闪词条可改），闪 = 闪标记，护甲仅来自技能。
 */
/** phases[].when：目前只支持 hp_below_<N>%（体力 ≤ 上限 × N%） */
function phaseOf(ph: NonNullable<EnemyCfg['phases']>[number]): EnemyPhaseDef {
  const m = /^hp_below_(\d+)%$/.exec(ph.when);
  if (!m) throw new Error(`未支持的阶段条件 ${ph.when}`);
  return { hpAtMost: Number(m[1]) / 100, pat: ph.intents as EnemyAct[][], summon: (ph.summon ?? []).map((x) => ({ enemy: x.enemy, row: x.row ?? 'back' })) };
}

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(
  Object.values(CONFIG.enemies).map((e) => {
    const d: EnemyDef = { name: e.name, hp: e.hp, row: e.row, pat: e.intents as EnemyAct[][], flash: e.flashMarksPerTurn ?? 0, g: e.glyph, tier: e.tier };
    if (e.abilities) d.abilities = e.abilities;
    if (e.armorStart) d.armorStart = e.armorStart;
    if (e.tier !== '小怪') d.elite = true;
    if (e.desc) d.skill = e.desc;
    if (e.trickOverrides) d.trickOverrides = e.trickOverrides;
    if (e.phases?.length) d.phases = e.phases.map(phaseOf);
    return [e.id, d];
  }),
);

export const ENEMY_CARDS = CONFIG.rules.enemyCards as Record<EnemyAct, EnemyCardDef>;

export const MAX_FLASH_MARKS = CONFIG.rules.maxFlashMarks;

export const BATTLES: BattleDef[] = CONFIG.encounters.ch1.battles.map((b) => ({ name: b.name, en: b.enemies }));
