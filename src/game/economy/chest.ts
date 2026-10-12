/** 宝箱（PRD 10.8）。纯逻辑；表现见 scenes/chest.ts */
import type { Rng } from '../../core/rng';
import { ECONOMY } from '../../data/economy';
import type { Inventory } from './inventory';
import { pickRelics, randInt } from './pools';

export type ChestOffer = { type: 'relic'; relics: string[] } | { type: 'gold'; gold: number };

/** 75% 宝物三选一；25% 铜钱 + 卡牌三选一（走奖励页卡牌布局）。宝物池耗尽时以铜钱替代（flow.md 3.11） */
export function rollChest(rng: Rng, inv: Inventory): ChestOffer {
  if (rng() < ECONOMY.chestRelicChance) {
    const relics = pickRelics(rng, inv.relics, 3, ECONOMY.chestRelicRarity);
    if (relics.length) return { type: 'relic', relics };
  }
  return { type: 'gold', gold: randInt(rng, ECONOMY.chestGold) };
}

export function takeChestRelic(inv: Inventory, offer: ChestOffer, id: string) {
  if (offer.type !== 'relic' || !offer.relics.includes(id) || inv.relics.includes(id)) return false;
  inv.relics.push(id);
  return true;
}
