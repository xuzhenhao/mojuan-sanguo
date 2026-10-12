/**
 * 运行时配置入口：读取构建期由 config/**.yaml 生成的 JSON（scripts/build-config.ts）。
 * 改数值请改 config/ 下的 YAML，不要改这里。
 */
import raw from './generated/config.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Ability {
  id: string;
  name: string;
  desc: string;
  kind?: string;
  trigger: { when: string; who?: string; filter?: Record<string, any> };
  limit?: { per?: string; times?: number; passiveQuota?: boolean };
  if?: Record<string, any>[];
  do: Record<string, any>[];
}
export interface CardCfg {
  id: string;
  name: string;
  type: string;
  typeLabel?: string;
  slot?: 'weapon' | 'armor' | 'plus_horse' | 'minus_horse';
  range?: number;
  tags?: string[];
  cost: number;
  rarity: string;
  target?: 'none' | 'range' | 'any' | 'self';
  desc: string;
  abilities: Ability[];
}
export interface AffixCfg {
  id: string;
  name: string;
  rarity: 'N' | 'R' | 'E' | 'L';
  category: 'sha' | 'shan' | 'tao' | 'jiu' | 'trick' | 'equip';
  only?: string;
  slot?: CardCfg['slot'];
  mutex?: 'fire';
  desc: string;
  abilities?: Ability[];
}
export interface HeroCfg {
  id: string;
  name: string;
  faction: string;
  hp: number;
  mainSkills: Ability[];
  subSkill: Ability;
  combos?: { partner: string; name: string; abilities: Ability[] }[];
}
export interface EnemyCfg {
  id: string;
  name: string;
  tier: '小怪' | '精英' | 'Boss';
  hp: number;
  row: 'front' | 'back';
  flashMarksPerTurn?: number;
  glyph: string;
  intents: string[][];
  desc?: string;
  abilities?: Ability[];
}
export interface ConfigBundle {
  rules: {
    lingPerTurn: number;
    drawPerTurn: number;
    firstTurnBonus: number;
    minHandLimit: number;
    responseSeconds: number;
    armorKeep: number;
    maxFlashMarks: number;
    starterDeck: string;
    enemyCards: Record<string, { t: '杀' | '万箭' | '闪' | '咒'; dmg?: number; mod?: string }>;
    epiphany: { baseRate: number; maxPerBattle: number; pityPlays: number };
    rarityWeight: Record<'N' | 'R' | 'E' | 'L', number>;
    pendingValues?: Record<string, number>;
    mechanics: { judgeSource: 'deck' | 'pool'; passiveQuotaPerEnemyTurn: number | null; moying: boolean; zeroCostPerTurn: number | null };
  };
  cards: Record<string, CardCfg>;
  affixes: AffixCfg[];
  heroes: Record<string, HeroCfg>;
  enemies: Record<string, EnemyCfg>;
  encounters: Record<string, { chapter: number; battles: { name: string; kind?: string; enemies: string[] }[] }>;
  decks: Record<string, { id: string; name: string; cards: { card: string; suit: 'S' | 'H' | 'C' | 'D'; rank: number }[] }>;
}

export const CONFIG = raw as unknown as ConfigBundle;

/** 在能力列表里找某个效果原子的数值（如 armor 的 amount） */
export function atomAmount(abilities: Ability[] | undefined, atom: string): number | undefined {
  for (const a of abilities ?? []) for (const d of a.do) if (d.do === atom) return d.amount;
  return undefined;
}
