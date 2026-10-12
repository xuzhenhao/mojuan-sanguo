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

/** 局内新牌 uid 起点：与 core Game 自增 uid 错开，避免撞号 */
export const P4_UID_BASE = 100000;

export class EconomySession {
  inventory: Inventory;
  rng: Rng;
  private bound: unknown = null;
  constructor(o: DemoOpts = {}) {
    this.inventory = demoInventory(o);
    this.rng = seeded(o.seed ?? 45);
  }
  /**
   * 绑定 core 新局（RunSession.game）：共享牌组数组（deckMaster 引用）与主副将；
   * 换局时重置铜钱/丹药/宝物/刷新次数，奖励 RNG 由局种子派生。只读 Game 的公开字段，不改 core。
   */
  bind(game: { deckMaster: CardInst[]; main: { id: string }; sub: { id: string } } | null, seed?: number) {
    if (!game || game === this.bound) return;
    this.bound = game;
    const inv = newInventory({ deck: game.deckMaster, main: game.main.id, sub: game.sub.id });
    inv.nextUid = Math.max(inv.nextUid, P4_UID_BASE);
    this.inventory = inv;
    this.rng = seeded(((seed ?? 45) ^ 0x45a5) >>> 0);
  }
}
