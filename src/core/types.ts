export type Suit = 'S' | 'H' | 'C' | 'D';
export type Rarity = 'N' | 'R' | 'E' | 'L';
export type Slot = 'weapon' | 'armor' | 'plus' | 'minus';

export interface CardDef {
  name: string;
  type: string;
  cost: number;
  desc: string;
  sha?: boolean;
  fire?: boolean;
  shan?: boolean;
  tao?: boolean;
  jiu?: boolean;
  aoe?: boolean;
  bonus?: number;
  needRed?: boolean;
  /** 'range' = 攻击范围内；'any' = 任意敌人 */
  tgt?: 'range' | 'any';
  slot?: Slot;
  range?: number;
  trick?: boolean;
  /** 无懈可击：只能在锦囊响应窗口打出 */
  wuxie?: boolean;
  /** 响应牌（tag response）：不计入 M4 的 0 费每回合次数 */
  response?: boolean;
}

export interface CardInst {
  uid: number;
  id: string;
  suit: Suit;
  rank: number;
  mods: string[];
  /** 本次是否以「武执」当杀使用（临时） */
  asSha?: boolean;
}

/** 判定牌颜色（♥♦ 红，♠♣ 黑） */
export type JudgeColor = 'red' | 'black';

/**
 * 判定牌（正式数据结构）：
 * - source='pool'：天机签筒（M1）里的独立签，不对应任何卡牌定义，没有 cardId；
 * - source='deck'：从摸牌堆亮出的实体牌，cardId 指向 CARDS 中的定义。
 * 表现层只读这里的字段，不得用 id 去查牌库。
 */
export interface JudgeCard {
  kind: 'judge';
  uid: number;
  suit: Suit;
  /** 1–13（A=1, J=11, Q=12, K=13） */
  rank: number;
  color: JudgeColor;
  source: 'pool' | 'deck';
  /** 仅 source='deck' 时存在 */
  cardId?: string;
  /** 展示名：签筒为「天机签」，摸牌堆为卡牌名 */
  name: string;
}

/** 判定事件：core → 表现层，携带完整判定牌数据 */
export interface JudgeEvent {
  type: 'judge';
  /** 判定原因（技能/卡牌名） */
  reason: string;
  card: JudgeCard;
}

export interface AffixDef {
  id: string;
  r: Rarity;
  n: string;
  d: string;
  cat: 'sha' | 'shan' | 'tao' | 'jiu' | 'trick' | 'equip';
  mutex?: 'fire';
  only?: string;
  slot?: Slot;
  maxPerDeck?: number;
}

/** 敌人出牌动作（无攻击力数值：伤害全部来自牌） */
export type EnemyAct = '杀' | '杀+' | '万箭' | '闪' | '咒';

export interface EnemyDef {
  name: string;
  hp: number;
  row: 'front' | 'back';
  pat: EnemyAct[][];
  flash: number;
  g: string;
  elite?: boolean;
  skill?: string;
  tier?: string;
  armorStart?: number;
  abilities?: import('../data/config').Ability[];
}

export interface EnemyCardDef {
  t: '杀' | '万箭' | '闪' | '咒';
  dmg?: number;
  mod?: string;
}

export interface Enemy extends EnemyDef {
  id: string;
  uid: number;
  max: number;
  armor: number;
  step: number;
  marks: number;
  judge: CardInst[];
  /** 连环状态 */
  chained?: boolean;
  /** 本敌方回合不出杀（离魂）/ 杀转向友军（离间） */
  noSha?: boolean;
  redirect?: boolean;
  /** 延时锦囊剩余判定次数：牌 uid → 次数 */
  delayLeft?: Record<number, number>;
}

export interface HeroDef {
  id: string;
  name: string;
  faction: string;
  hp: number;
  mainSkills: { name: string; desc: string }[];
  subSkill: { name: string; desc: string };
}

export interface BattleDef {
  name: string;
  en: string[];
}
