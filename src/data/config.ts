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
  limit?: { per?: string; times?: number; passiveQuota?: boolean; everyNTurns?: number };
  if?: Record<string, any>[];
  /** 主动技目标筛选 */
  targets?: { row?: 'front' | 'back'; hasAlly?: boolean; armorAtLeast?: number; inRange?: boolean };
  do: Record<string, any>[];
}
export interface CardCfg {
  id: string;
  name: string;
  /** 手牌小牌简称（可选），详情仍用 name */
  shortName?: string;
  type: string;
  typeLabel?: string;
  slot?: 'weapon' | 'armor' | 'plus_horse' | 'minus_horse';
  range?: number;
  tags?: string[];
  cost: number;
  rarity: string;
  /** 奖励池权重（默认 1，0 = 不进奖励池） */
  rewardWeight?: number;
  /** 商店基础价（不填按 rules.shop.cardPrice） */
  shopPrice?: number;
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
  maxPerDeck?: number;
  abilities?: Ability[];
}
export interface HeroCfg {
  id: string;
  name: string;
  faction: string;
  hp: number;
  mainSkills: Ability[];
  subSkill: Ability;
  roster?: boolean;
  starterDeck: { card: string; suit: 'S' | 'H' | 'C' | 'D'; rank: number }[];
  combos?: { partner: string; name: string; enabled?: boolean; abilities: Ability[] }[];
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
  enabled?: boolean;
  trickOverrides?: Record<string, { amount?: number }>;
  /** 阶段切换（PRD 11.2）：when = hp_below_<N>%；summon = 切换时召唤 */
  phases?: { when: string; intents: string[][]; summon?: { enemy: string; row?: 'front' | 'back' }[] }[];
  armorStart?: number;
  desc?: string;
  abilities?: Ability[];
}
export interface ConfigBundle {
  rules: {
    lingPerTurn: number;
    drawPerTurn: number;
    firstTurnBonus: number;
    minHandLimit: number;
    /** 手牌硬上限（PRD §5.4） */
    handHardCap: number;
    responseSeconds: number;
    armorKeep: number;
    enemyArmorKeep?: number;
    maxFlashMarks: number;
    /** 场上存活敌人上限（召唤受此约束） */
    maxEnemiesAlive?: number;
    starterDeck: string;
    enemyCards: Record<string, { t: '杀' | '万箭' | '闪' | '咒'; dmg?: number; mod?: string }>;
    epiphany: { baseRate: number; maxPerBattle: number; pityPlays: number };
    rarityWeight: Record<'N' | 'R' | 'E' | 'L', number>;
    pendingValues?: Record<string, number>;
    defaultHeroes: { main: string; sub: string };
    shop?: {
      cardPrice: Record<'N' | 'R' | 'E' | 'L', number>;
      relicPrice: Record<'N' | 'R' | 'E', number>;
      removeBase: number;
      removeStep: number;
      shopSlots: { common: number; heroCard: number; relic: number; potion: number };
    };
    /** 复活（PRD §4.4.1；仅天命<5） */
    revive: { count: number; hpRatio: number; hpMin: number; armor: number };
    /** 暂停/设置浮层（#108）：局外偏好默认值（存 mojuan.prefs.v1） */
    settings: {
      toggles: Record<string, { label: string; default: boolean }>;
      choices: Record<string, { label: string; options: string[]; default: string }>;
    };
    /** 3 战回归基线（自动对局 / bstat）专用 */
    sim: { baselineBetweenBattleHeal: number };
    /** 真实游戏 / 正式地图 */
    map: { betweenBattleHeal: number };
    presets?: Record<string, { main: string; sub: string; deck?: string; forceCombos?: string[] }>;
    mechanics: { judgeSource: 'deck' | 'pool'; passiveQuotaPerEnemyTurn: number | null; moying: boolean; zeroCostPerTurn: number | null };
  };
  cards: Record<string, CardCfg>;
  affixes: AffixCfg[];
  heroes: Record<string, HeroCfg>;
  enemies: Record<string, EnemyCfg>;
  encounters: Record<string, { chapter: number; battles: { name: string; kind?: string; enemies: string[] }[] }>;
  events: Record<string, EventCfg>;
  decks: Record<string, { id: string; name: string; cards: { card: string; suit: 'S' | 'H' | 'C' | 'D'; rank: number }[] }>;
}

/** 奇遇事件（config/events，docs/specs/events-v05.md） */
export interface EventRequire {
  type: 'gold_at_least' | 'max_hp_at_least' | 'hero_is' | 'deck_removable' | 'hp_below_max';
  value?: number;
  hero?: string;
}
export interface EventOutcome {
  type: 'gold' | 'heal' | 'damage' | 'max_hp' | 'add_card' | 'remove_card' | 'roll' | 'judge' | 'next_battle_buff' | 'battle' | 'branch' | 'leave';
  value?: number | 'full';
  card?: string;
  pool?: { rarity?: 'N' | 'R' | 'E' | 'L'; hero?: string };
  count?: number;
  chance?: number;
  success?: EventOutcome[];
  fail?: EventOutcome[];
  red?: EventOutcome[];
  black?: EventOutcome[];
  armor?: number;
  difficulty?: 'easy';
  reward_mult?: { gold?: number };
  if?: EventRequire;
  then?: EventOutcome[];
  else?: EventOutcome[];
}
export interface EventOption {
  text: string;
  hint?: string;
  result?: string;
  resultSuccess?: string;
  resultFail?: string;
  requires?: EventRequire[];
  outcomes: EventOutcome[];
}
export interface EventCfg {
  id: string;
  title: string;
  art: string;
  desc: string;
  chapters: number[];
  enabled: boolean;
  options: EventOption[];
}

export const CONFIG = raw as unknown as ConfigBundle;

/** 奖励池权重（PRD 6.8：同稀有度内按权重抽取，默认 1） */
export const rewardWeight = (id: string) => CONFIG.cards[id]?.rewardWeight ?? 1;
/** 商店基础价（PRD 14.2，浮动前） */
export const shopPrice = (id: string) => {
  const c = CONFIG.cards[id];
  return c?.shopPrice ?? CONFIG.rules.shop?.cardPrice[c?.rarity as 'N' | 'R' | 'E' | 'L'];
};

/** 在能力列表里找某个效果原子的数值（如 armor 的 amount） */
export function atomAmount(abilities: Ability[] | undefined, atom: string): number | undefined {
  for (const a of abilities ?? []) for (const d of a.do) if (d.do === atom) return d.amount;
  return undefined;
}
