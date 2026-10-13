/** 测试用背包工厂（#122 PR3：原 src/game/economy/session.ts 的 demoInventory 移出生产代码，正式局只走 RunSession） */
import type { CardInst } from '../src/core/types';
import { CONFIG } from '../src/data/config';
import { starterDeck } from '../src/data/cards';
import { newInventory, type Inventory } from '../src/game/economy/inventory';

export interface TestInvOpts {
  seed?: number;
  gold?: number;
  potions?: number;
  main?: string;
  sub?: string;
}

export function makeTestInventory(o: TestInvOpts = {}): Inventory {
  const main = o.main ?? CONFIG.rules.defaultHeroes.main;
  const deck: CardInst[] = starterDeck(main).map(([id, suit, rank], i) => ({ uid: i + 1, id, suit, rank, mods: [] }));
  const inv = newInventory({ deck, main, sub: o.sub ?? CONFIG.rules.defaultHeroes.sub });
  if (o.gold !== undefined) inv.gold = o.gold;
  const ids = ['P01', 'P03', 'P07'];
  for (let i = 0; i < Math.min(o.potions ?? 0, inv.potions.length); i++) inv.potions[i] = ids[i];
  return inv;
}
