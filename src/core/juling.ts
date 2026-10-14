/**
 * 军令循环护栏（M3 · #230）：纯函数，数值一律来自 config/rules.yaml。
 */
import { CONFIG, type CardCfg } from '../data/config';

export type RarityCode = 'N' | 'R' | 'E' | 'L';

export function julingCfg() {
  return CONFIG.rules.juling;
}

export function costCfg() {
  return CONFIG.rules.cost;
}

export function loopCfg() {
  return CONFIG.rules.loop;
}

/** 每回合基础军令（地板）；兼容旧 lingPerTurn */
export function lingPerTurn(): number {
  return CONFIG.rules.juling?.perTurn ?? CONFIG.rules.lingPerTurn;
}

/** 费用下限 */
export function costFloor(): number {
  return CONFIG.rules.cost?.floor ?? 0;
}

/** 同牌 −费合计上限（幅度） */
export function reduceStackMax(): number {
  return CONFIG.rules.cost?.reduceStackMax ?? 99;
}

/** 0 费同名限次；优先 cost.zeroCostPerTurn，回退 mechanics */
export function zeroCostPerTurn(): number | null {
  const c = CONFIG.rules.cost?.zeroCostPerTurn;
  if (c !== undefined) return c;
  return CONFIG.rules.mechanics.zeroCostPerTurn;
}

export function zeroCostExemptTags(): string[] {
  return CONFIG.rules.cost?.zeroCostExemptTags ?? [];
}

export function maxPlaysPerTurn(): number | null {
  return CONFIG.rules.loop?.maxPlaysPerTurn ?? null;
}

/** 带 loop tag 的卡是否可在本章奖励/商店池出现 */
export function loopCardAllowedInChapter(c: Pick<CardCfg, 'tags' | 'rarity'>, chapter: number): boolean {
  const tags = c.tags ?? [];
  if (!tags.includes('loop')) return true;
  const table = CONFIG.rules.loop?.chapterRarity;
  if (!table) return true;
  const keyNum = chapter;
  const allowed =
    table[keyNum] ??
    table[String(keyNum) as unknown as number] ??
    Object.entries(table)
      .filter(([k]) => Number(k) <= chapter)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .at(-1)?.[1];
  if (!allowed?.length) return true;
  return allowed.includes(c.rarity as RarityCode);
}

/** 卡是否带某 tag（config cards[].tags） */
export function cardHasTag(cardId: string, tag: string): boolean {
  return (CONFIG.cards[cardId]?.tags ?? []).includes(tag);
}

export function cardHasExemptTag(cardId: string): boolean {
  const tags = CONFIG.cards[cardId]?.tags ?? [];
  const exempt = zeroCostExemptTags();
  return tags.some((t) => exempt.includes(t));
}

/** Game.lingSlot() 返回值（#230 锁定，供 #231 虎符 UI） */
export type LingSlotSnapshot = {
  /** 当前军令 */
  current: number;
  /** 展示上限 / 地板槽位数（= juling.perTurn） */
  cap: number;
  /** 硬顶（任意时刻） */
  hardCap: number;
  /** current > cap（溢出描边；非「满」） */
  overflow: boolean;
  /** 回合结束最多保留 */
  carryMax: number;
  /** 最近一次军令变化（产令/回令为正，扣费/保留截断为负）；飘字用 */
  delta: number;
  /**
   * 「满」：仅当 current >= hardCap。
   * maxGainPerTurn 截断是静默的，绝不因此为 true。
   */
  full: boolean;
};
