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
  /** 立绘 OSS 相对路径（#177），小图档加 @s */
  portrait?: string;
  /** 脸部中心（512×712 像素） */
  portraitFocus?: { x: number; y: number };
  starterDeck: { card: string; suit: 'S' | 'H' | 'C' | 'D'; rank: number }[];
  combos?: { partner: string; name: string; enabled?: boolean; abilities: Ability[] }[];
}
export interface EnemyCfg {
  id: string;
  name: string;
  /** 短名（竖排名 / 战斗顶条，≤4 字不含「·」；没有时用 name） */
  shortName?: string;
  /** 立绘 OSS 相对路径（#177，暂无美术） */
  portrait?: string;
  chapter?: number;
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
  /** 首领登场台词（#107）：line = 登场墨带；phaseLine = 阶段 2 切换 */
  intro?: { line?: string; phaseLine?: string };
}
export interface ConfigBundle {
  /** UI 文本表（#182）：config/text/<ns>.yaml → text[ns][key] */
  text: Record<string, Record<string, string>>;
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
    /** 局内经济（#172） */
    economy: EconomyCfg;
    /** 开放章节数（PRD 10.1；schema 可选，缺省 1） */
    run?: { chapters: number };
    /** 奇遇（#174） */
    event: { startArmorCap: number };
    /** 结算将魂系数（PRD 14.5；#174） */
    settlement: SettlementCfg;
    /** 暂停/设置浮层（#108）：局外偏好默认值（存 mojuan.prefs.v1） */
    settings: {
      toggles: Record<string, { label: string; default: boolean; hidden?: boolean }>;
      choices: Record<string, { label: string; options: string[]; default: string; hidden?: boolean }>;
    };
    /** 3 战回归基线（自动对局 / bstat）专用 */
    sim: {
      baselineBetweenBattleHeal: number;
      /** #241 AI 留闪 */
      shan: { mode: 'legacy' | 'budget'; keepMax: number; takeHitHpRatio: number };
      /** #241 模拟选牌 */
      reward: { skipBelow: number; loopMaxInDeck: number; shopBuyMinGold: number; shopMaxCards: number };
    };
    /** 真实游戏 / 正式地图 */
    map: { betweenBattleHeal: number };
    presets?: Record<string, { main: string; sub: string; deck?: string; forceCombos?: string[] }>;
    /** 美术资源位置（#177）：立绘在 OSS，切桶只改 baseUrl */
    /** 战斗页顶条标题模板（#216） */
    battleTitle: { normal: string; elite: string; boss: string };
    assets: { baseUrl: string; devBaseUrl: string; localBaseUrl: string };
    /** 字体（#202） */
    fonts: FontsConfig;
    mechanics: { judgeSource: 'deck' | 'pool'; passiveQuotaPerEnemyTurn: number | null; moying: boolean; zeroCostPerTurn: number | null };
    /** 军令留令（M3 · #230） */
    juling?: { perTurn: number; carryMax: number; hardCap: number; maxGainPerTurn: number };
    /** 费用护栏（M3 · #230） */
    cost?: {
      floor?: number;
      zeroCostPerTurn?: number | null;
      reduceStackMax?: number;
      zeroCostExemptTags?: string[];
    };
    /** 循环护栏与投放（M3 · #230） */
    loop?: { maxPlaysPerTurn?: number; chapterRarity?: Record<number | string, Array<'N' | 'R' | 'E' | 'L'>> };
  };
  cards: Record<string, CardCfg>;
  affixes: AffixCfg[];
  heroes: Record<string, HeroCfg>;
  enemies: Record<string, EnemyCfg>;
  encounters: Record<string, { chapter: number; battles: { name: string; kind?: string; enemies: string[] }[] }>;
  events: Record<string, EventCfg>;
  /** 宝物（config/relics，#173） */
  relics: Record<string, RelicCfg>;
  /** 丹药（config/potions，#173） */
  potions: Record<string, PotionCfg>;
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

type EcoRange = [number, number];
type EcoRarity = 'N' | 'R' | 'E' | 'L' | 'Boss';
/** rules.economy（#172；PRD 0.5.4 10.7/10.8/12.1/12.2/14.1–14.3/14.8） */
export interface EconomyCfg {
  startGold: number;
  potionSlots: number;
  battleGold: Record<'normal' | 'elite' | 'boss', EcoRange[]>;
  cardRarity: Record<'N' | 'R' | 'E' | 'L', number>[];
  eliteHighMul: number;
  factionMul: number;
  potionDrop: Record<'normal' | 'elite' | 'boss', number>;
  relicRarity: Record<'N' | 'R' | 'E', number>;
  bossRelicPool: EcoRarity;
  bossRelicFill: EcoRarity;
  priceJitter: number;
  priceRound: number;
  shopRefresh: number;
  shopFreeRefresh: number;
  minDeck: number;
  chestRelicChance: number;
  chestGold: EcoRange;
  chestRelicRarity: Record<'N' | 'R' | 'E', number>;
  destinyShopMarkup: number;
}

/** rules.fonts（#202）：族名、包内路径、首屏门控 */
export type FontRoleName = 'brush' | 'sans';
/** 系统通用字族（回退用） */
export type GenericFamily = 'serif' | 'sans-serif';
/** 字体角色：system = 系统字体（不加载）；否则族名 + 要加载的文件（无 faces 时复用同族已加载字体） */
export type FontRole = 'system' | { family: string; faces?: { url: string; gate: boolean }[] };
export interface FontsConfig {
  gateTimeoutMs: number;
  fallback: Record<FontRoleName, GenericFamily>;
  platforms: Record<'web' | 'wechat', Record<FontRoleName, FontRole>>;
}
export const FONTS: FontsConfig = CONFIG.rules.fonts;

/** rules.settlement（PRD 14.5） */
export interface SettlementCfg {
  soul: { perChapter: number; perElite: number; perWin: number; perBoss: number; defeatMul: number; tianmingStep: number };
  maxTianming: number;
}

/** 宝物的参数化局外效果（config/relics effects，#173）；战斗内效果仍由 core 按能力结算 */
export interface RelicEffects {
  /** 每场战斗胜利铜钱 +N */
  goldBonus?: number;
  /** 精英战奖励铜钱 +N */
  eliteGoldBonus?: number;
  /** 集市价格 −比例 */
  shopDiscount?: number;
  /** 集市丹药槽 +N */
  shopPotionSlots?: number;
  /** 营地疗伤 +N */
  restHeal?: number;
}
export interface RelicCfg {
  id: string;
  name: string;
  rarity: 'N' | 'R' | 'E' | 'L' | 'Boss';
  desc: string;
  oneShot?: boolean;
  effects?: RelicEffects;
}
export interface PotionCfg {
  id: string;
  name: string;
  desc: string;
  price: number;
}

/** 持有宝物某项效果之和（未知 id 忽略） */
export function relicEffect(relics: readonly string[], key: keyof RelicEffects): number {
  return relics.reduce((n, id) => n + (CONFIG.relics[id]?.effects?.[key] ?? 0), 0);
}
