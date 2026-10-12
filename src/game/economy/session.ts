/**
 * P4 经济会话：持有局内背包与奖励 RNG 流。
 * 正式局由 RunSession（P2 #43）接入后替换 inventory 的牌组与主副将；直入页面（?page=reward 等）时用演示背包。
 */
import { seeded, type Rng } from '../../core/rng';
import type { CardInst } from '../../core/types';
import { CONFIG } from '../../data/config';
import { starterDeck } from '../../data/cards';
import { newInventory, type Inventory } from './inventory';

export interface DemoOpts {
  seed?: number;
  gold?: number;
  potions?: number;
  main?: string;
  sub?: string;
}

export function demoInventory(o: DemoOpts = {}): Inventory {
  const main = o.main ?? CONFIG.rules.defaultHeroes.main;
  const deck: CardInst[] = starterDeck(main).map(([id, suit, rank], i) => ({ uid: i + 1, id, suit, rank, mods: [] }));
  const inv = newInventory({ deck, main, sub: o.sub ?? CONFIG.rules.defaultHeroes.sub });
  if (o.gold !== undefined) inv.gold = o.gold;
  const ids = ['P01', 'P03', 'P07'];
  for (let i = 0; i < Math.min(o.potions ?? 0, inv.potions.length); i++) inv.potions[i] = ids[i];
  return inv;
}

export class EconomySession {
  inventory: Inventory;
  rng: Rng;
  constructor(o: DemoOpts = {}) {
    this.inventory = demoInventory(o);
    this.rng = seeded(o.seed ?? 45);
  }
}
