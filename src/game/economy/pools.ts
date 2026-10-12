/** 候选池与价格（PRD 14.2 / 14.3 / 14.8 / 12.1）。只读 config 与 core，不改 core */
import type { Rng } from '../../core/rng';
import type { Rarity, Suit } from '../../core/types';
import { CONFIG, rewardWeight, shopPrice, type CardCfg } from '../../data/config';
import { ECONOMY, POTIONS, RELICS, type BattleKind, type Range, type RelicDef } from '../../data/economy';
import type { Inventory } from './inventory';

export const RARITIES: Rarity[] = ['N', 'R', 'E', 'L'];
const SUITS: Suit[] = ['S', 'H', 'C', 'D'];

export const randInt = (rng: Rng, [a, b]: Range) => a + Math.floor(rng() * (b - a + 1));

export function weighted<T>(rng: Rng, items: readonly T[], w: (t: T) => number): T | undefined {
  const total = items.reduce((s, t) => s + Math.max(0, w(t)), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const t of items) {
    r -= Math.max(0, w(t));
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

type CardCfgX = CardCfg & { exclusiveHero?: string; faction?: string; suits?: string[] };
const cfg = (id: string) => CONFIG.cards[id] as CardCfgX;

/** 主将势力 */
export const heroFaction = (id: string) => (CONFIG.heroes[id] as { faction?: string } | undefined)?.faction;

/**
 * 卡牌奖励池（14.8，按 6.8 过滤）：专属牌只出主/副将的；势力牌只出主将势力的（权重 ×1.5）。
 * 卡牌配置 rewardWeight（#70，默认 1，0 = 不进奖励池）在同稀有度内按权重抽取。
 */
export function cardPool(inv: Pick<Inventory, 'main' | 'sub'>, kind: 'any' | 'common' | 'hero' = 'any') {
  const fac = heroFaction(inv.main);
  return Object.values(CONFIG.cards as Record<string, CardCfgX>)
    .filter((c) => {
      if (c.exclusiveHero) return kind !== 'common' && (c.exclusiveHero === inv.main || c.exclusiveHero === inv.sub);
      if (c.faction) return kind !== 'common' && c.faction === fac;
      return kind !== 'hero';
    })
    .filter((c) => rewardWeight(c.id) > 0)
    .map((c) => ({ id: c.id, rarity: c.rarity as Rarity, weight: rewardWeight(c.id) * (c.faction ? ECONOMY.factionMul : 1) }));
}

/** 本场稀有度权重：章权重，精英 E/L ×1.5 */
export function rarityWeights(chapter: number, kind: BattleKind): Record<Rarity, number> {
  const base = ECONOMY.cardRarity[Math.min(Math.max(chapter, 1), ECONOMY.cardRarity.length) - 1];
  const w = { ...base };
  if (kind === 'elite') for (const r of ['E', 'L'] as Rarity[]) w[r] *= ECONOMY.eliteHighMul;
  return w;
}

/**
 * 抽 n 张不重复卡：先按稀有度权重抽稀有度（该档无牌时只在有牌的档里抽），再在档内按 rewardWeight 抽。
 * minHigh：至少 1 张 E+（Boss）。
 */
export function pickCards(rng: Rng, pool: ReturnType<typeof cardPool>, n: number, rw: Record<Rarity, number>, minHigh = false): string[] {
  const out: string[] = [];
  const left = [...pool];
  for (let i = 0; i < n && left.length; i++) {
    const needHigh = minHigh && i === n - 1 && !out.some((id) => ['E', 'L'].includes(cfg(id).rarity));
    const cand = needHigh && left.some((c) => c.rarity === 'E' || c.rarity === 'L') ? left.filter((c) => c.rarity === 'E' || c.rarity === 'L') : left;
    const present = RARITIES.filter((r) => cand.some((c) => c.rarity === r));
    const r = weighted(rng, present, (x) => rw[x]) ?? present[0];
    const c = weighted(
      rng,
      cand.filter((x) => x.rarity === r),
      (x) => x.weight,
    )!;
    out.push(c.id);
    left.splice(left.indexOf(c), 1);
  }
  return out;
}

/** 新牌花色点数（14.8）：配置 suits[] 随机；未配置则 52 张标准花色随机 */
export function rollSuit(rng: Rng, id: string): { suit: Suit; rank: number } {
  const s = cfg(id).suits;
  if (s?.length) {
    const pick = s[Math.floor(rng() * s.length)];
    const m = /^([SHCD])(\d+)?$/.exec(pick);
    if (m) return { suit: m[1] as Suit, rank: m[2] ? Number(m[2]) : 1 + Math.floor(rng() * 13) };
  }
  return { suit: SUITS[Math.floor(rng() * 4)], rank: 1 + Math.floor(rng() * 13) };
}

/** 抽宝物（不重复、不出已持有） */
export function pickRelics(rng: Rng, owned: string[], n: number, weights: Partial<Record<RelicDef['rarity'], number>>): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const left = RELICS.filter((r) => !owned.includes(r.id) && !out.includes(r.id) && (weights[r.rarity] ?? 0) > 0);
    const present = [...new Set(left.map((r) => r.rarity))];
    const r = weighted(rng, present, (x) => weights[x] ?? 0);
    if (!r) break;
    out.push(
      weighted(
        rng,
        left.filter((x) => x.rarity === r),
        () => 1,
      )!.id,
    );
  }
  return out;
}

export const pickPotion = (rng: Rng) => POTIONS[Math.floor(rng() * POTIONS.length)].id;

export const relicDef = (id: string) => RELICS.find((r) => r.id === id)!;
export const potionDef = (id: string) => POTIONS.find((p) => p.id === id)!;

/** 价格浮动 ±10% 取整到 5，并叠加断袖香囊 −20%、天命 6 +20% */
export function jitter(rng: Rng, base: number, inv: Pick<Inventory, 'relics' | 'destiny'>): number {
  const k = 1 + (rng() * 2 - 1) * ECONOMY.priceJitter;
  return applyMods(Math.round((base * k) / ECONOMY.priceRound) * ECONOMY.priceRound, inv);
}
export function applyMods(p: number, inv: Pick<Inventory, 'relics' | 'destiny'>) {
  let k = 1;
  if (inv.relics.includes('R09')) k -= 0.2;
  if (inv.destiny >= 6) k += ECONOMY.destinyShopMarkup;
  return k === 1 ? p : Math.round((p * k) / ECONOMY.priceRound) * ECONOMY.priceRound;
}

/**
 * 卡牌售价（PRD 14.2）：卡牌配置 shopPrice 为定价、不浮动（T002 = 40）；
 * 否则按 rules.shop.cardPrice 稀有度基础价 ±10% 取整到 5。均叠加断袖香囊 / 天命加成。
 */
export function cardPrice(rng: Rng, id: string, inv: Pick<Inventory, 'relics' | 'destiny'>): number {
  const own = CONFIG.cards[id]?.shopPrice;
  if (own !== undefined) return applyMods(own, inv);
  const base = shopPrice(id);
  if (base === undefined) throw new Error(`卡牌 ${id} 缺少商店价（rules.shop.cardPrice）`);
  return jitter(rng, base, inv);
}
