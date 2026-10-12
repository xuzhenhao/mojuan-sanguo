import type { BattleDef, EnemyAct, EnemyCardDef, EnemyDef } from '../core/types';
import { CONFIG } from './config';

/**
 * 敌人：来自 config/enemies/**.yaml；战斗序列来自 config/encounters/ch1.yaml。
 * 敌人只通过“出牌/技能”行动：杀 = 1 点伤害（灵光一闪词条可改），闪 = 闪标记，护甲仅来自技能。
 */
export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(
  Object.values(CONFIG.enemies).map((e) => {
    const d: EnemyDef = { name: e.name, hp: e.hp, row: e.row, pat: e.intents as EnemyAct[][], flash: e.flashMarksPerTurn ?? 0, g: e.glyph, tier: e.tier };
    if (e.abilities) d.abilities = e.abilities;
    if (e.armorStart) d.armorStart = e.armorStart;
    if (e.tier !== '小怪') d.elite = true;
    if (e.desc) d.skill = e.desc;
    return [e.id, d];
  }),
);

export const ENEMY_CARDS = CONFIG.rules.enemyCards as Record<EnemyAct, EnemyCardDef>;

export const MAX_FLASH_MARKS = CONFIG.rules.maxFlashMarks;

export const BATTLES: BattleDef[] = CONFIG.encounters.ch1.battles.map((b) => ({ name: b.name, en: b.enemies }));
