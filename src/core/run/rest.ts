/**
 * 营地（PRD 10.6 / docs/specs/rest-v05.md，#90）：疗伤 / 淬炼 / 焚稿三选一的纯规则。
 * - 疗伤：max(healMin, floor(最大体力 × healRatio)) + 宝物加成（R03 青囊书 +2），不超过体力上限。
 * - 淬炼：给一张牌追加 1 条 N/R 词条，过滤后均匀随机 1 条（不做三选一）；已有 2 条走「替换 / 放弃」。
 * - 焚稿：删 1 张，删后牌组 ≥ minDeck 且至少 1 张杀类。
 * 表现层（营地页）与 sim 共用这里，不要另写一套。
 */
import type { Rng } from '../rng';
import type { AffixDef, CardInst } from '../types';
import { affixPool, def, isShaPlay } from '../rules';

export interface RestConfig {
  healMin: number;
  healRatio: number;
}
export function restHealAmount(maxHp: number, cfg: RestConfig, relicBonus = 0) {
  return Math.max(cfg.healMin, Math.floor(maxHp * cfg.healRatio)) + relicBonus;
}
/** 返回回复后体力与实际回复量（relicBonus 默认 0，与旧调用方 / sim 兼容） */
export function applyRestHeal(hp: number, maxHp: number, cfg: RestConfig, relicBonus = 0) {
  const next = Math.min(maxHp, hp + restHealAmount(maxHp, cfg, relicBonus));
  return { hp: next, healed: next - hp };
}

/** 营地疗伤的宝物加成：R03 青囊书 +2（PRD §15 V1） */
export const REST_RELIC_HEAL: Record<string, number> = { R03: 2 };
export function restRelicBonus(relics: readonly string[]) {
  return relics.reduce((s, r) => s + (REST_RELIC_HEAL[r] ?? 0), 0);
}

// ───────── 淬炼 ─────────
/** 每张牌最多词条数（PRD 8.6） */
export const MAX_AFFIXES = 2;
/** 营地淬炼可出的稀有度 */
export const TEMPER_RARITIES: readonly AffixDef['r'][] = ['N', 'R'];

/**
 * 淬炼候选池：复用 affixPool（类别 / only / slot / 火属性互斥 / 锋锐 maxPerDeck），再只取 N/R。
 * 已满 2 条的牌也返回候选（由调用方走「替换 / 放弃」）。
 */
export function temperPool(c: CardInst, deck: readonly CardInst[]): AffixDef[] {
  return affixPool(c, [...deck]).filter((a) => TEMPER_RARITIES.includes(a.r));
}
export const canTemperCard = (c: CardInst, deck: readonly CardInst[]) => temperPool(c, deck).length > 0;
/** 整副牌组是否有可淬炼的牌（否则淬炼选项置灰） */
export const canTemper = (deck: readonly CardInst[]) => deck.some((c) => canTemperCard(c, deck));

/** 过滤后均匀随机 1 条（局内 rng，可复现）；池空返回 null */
export function rollTemper(rng: Rng, c: CardInst, deck: readonly CardInst[]): AffixDef | null {
  const pool = temperPool(c, deck);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * 铭刻：原地改 card.mods（牌组数组与 core deckMaster 共享引用）。
 * 词条 <2 条直接追加；满 2 条必须给 replace（被替换的旧词条 id）。返回是否生效。
 */
export function applyTemper(c: CardInst, affixId: string, replace?: string): boolean {
  if (c.mods.includes(affixId)) return false;
  if (c.mods.length < MAX_AFFIXES) {
    c.mods.push(affixId);
    return true;
  }
  const i = replace === undefined ? -1 : c.mods.indexOf(replace);
  if (i < 0) return false;
  c.mods[i] = affixId;
  return true;
}

// ───────── 焚稿 ─────────
/** 删后约束：牌组 ≥ minDeck，且至少保留 1 张杀类（集市删牌服务同规则） */
export function canBurn(deck: readonly CardInst[], uid: number, minDeck: number): boolean {
  const c = deck.find((x) => x.uid === uid);
  if (!c || deck.length - 1 < minDeck) return false;
  if (isShaPlay(c) && deck.filter((x) => x.uid !== uid && !!def(x)?.sha).length === 0) return false;
  return true;
}
export const canBurnAny = (deck: readonly CardInst[], minDeck: number) => deck.some((c) => canBurn(deck, c.uid, minDeck));

export type RestAction = 'heal' | 'temper' | 'burn';
