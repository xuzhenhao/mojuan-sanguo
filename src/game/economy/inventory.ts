/**
 * 局内背包（P4 #45）：铜钱、丹药栏、宝物、牌组。core 目前没有这些字段，先放在 game 层；
 * 牌组用 core 的 CardInst（与 Game.deckMaster 同构），接入 RunSession 后直接共享 deckMaster 数组。
 */
import type { CardInst, Suit } from '../../core/types';
import { def, isShaPlay } from '../../core/rules';
import { CONFIG } from '../../data/config';
import { ECONOMY } from '../../data/economy';

export interface Inventory {
  gold: number;
  /** 丹药栏（定长 potionSlots，空位 null） */
  potions: (string | null)[];
  relics: string[];
  deck: CardInst[];
  main: string;
  sub: string;
  /** 章（1 起） */
  chapter: number;
  /** H5 奖励页免费刷新已用次数（本局） */
  rewardRefreshUsed: number;
  /** H5 集市免费刷新已用次数（本局） */
  shopRefreshUsed: number;
  /** 本局删牌服务已用次数（价格递增） */
  removeUsed: number;
  /** 天命（≥6 集市 +20%） */
  destiny: number;
  nextUid: number;
}

export function newInventory(o: Partial<Inventory> & { deck?: CardInst[] } = {}): Inventory {
  const deck = o.deck ?? [];
  return {
    gold: ECONOMY.startGold,
    potions: Array(ECONOMY.potionSlots).fill(null),
    relics: [],
    main: CONFIG.rules.defaultHeroes.main,
    sub: CONFIG.rules.defaultHeroes.sub,
    chapter: 1,
    rewardRefreshUsed: 0,
    shopRefreshUsed: 0,
    removeUsed: 0,
    destiny: 0,
    nextUid: deck.reduce((m, c) => Math.max(m, c.uid), 0) + 1,
    ...o,
    deck,
  };
}

export const potionCount = (inv: Inventory) => inv.potions.filter(Boolean).length;
export const potionsFull = (inv: Inventory) => potionCount(inv) >= inv.potions.length;

/** 放入丹药：有空位放空位；满时可指定替换第 replace 格。返回是否放入 */
export function addPotion(inv: Inventory, id: string, replace?: number): boolean {
  const empty = inv.potions.indexOf(null);
  if (empty >= 0) {
    inv.potions[empty] = id;
    return true;
  }
  if (replace === undefined || replace < 0 || replace >= inv.potions.length) return false;
  inv.potions[replace] = id;
  return true;
}

export function addCard(inv: Inventory, id: string, suit: Suit, rank: number): CardInst {
  const c: CardInst = { uid: inv.nextUid++, id, suit, rank, mods: [] };
  inv.deck.push(c);
  return c;
}

export function spend(inv: Inventory, n: number): boolean {
  if (inv.gold < n) return false;
  inv.gold -= n;
  return true;
}

/** 删牌是否合法：删后至少 minDeck 张且至少保留 1 张杀类 */
export function canRemove(inv: Inventory, uid: number): boolean {
  const c = inv.deck.find((x) => x.uid === uid);
  if (!c || inv.deck.length - 1 < ECONOMY.minDeck) return false;
  if (isShaPlay(c) && inv.deck.filter((x) => x.uid !== uid && !!def(x)?.sha).length === 0) return false;
  return true;
}

export function removeCard(inv: Inventory, uid: number): boolean {
  if (!canRemove(inv, uid)) return false;
  inv.deck = inv.deck.filter((x) => x.uid !== uid);
  return true;
}
