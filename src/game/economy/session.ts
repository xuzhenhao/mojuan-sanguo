/**
 * P4 演示经济会话：只给 ?page=reward 等直达调试用（演示背包 + 演示 RNG）。
 * 正式局的背包与经济随机流已并入 RunSession / RunState（#122 PR2：run.inventory、run.rng('economy')）。
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
