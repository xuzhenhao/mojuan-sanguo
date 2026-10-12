/** 集市（PRD 10.7 / 14.2 / 12.2）。纯逻辑；表现见 scenes/shop.ts */
import type { Rng } from '../../core/rng';
import type { Suit } from '../../core/types';
import { ECONOMY } from '../../data/economy';
import { addCard, addPotion, canRemove, potionsFull, removeCard, spend, type Inventory } from './inventory';
import { cardPool, cardPrice, jitter, pickCards, pickPotion, pickRelics, potionDef, rarityWeights, relicDef, rollSuit } from './pools';

export type ShopItem =
  | { type: 'card'; id: string; suit: Suit; rank: number; price: number; sold: boolean }
  | { type: 'relic'; id: string; price: number; sold: boolean }
  | { type: 'potion'; id: string; price: number; sold: boolean };

export interface ShopState {
  cards: ShopItem[];
  goods: ShopItem[];
  /** 本次进店删牌已用 */
  removeDone: boolean;
  dialog: string;
}

function rollCardsRow(rng: Rng, inv: Inventory): ShopItem[] {
  const rw = rarityWeights(inv.chapter, 'normal');
  const s = ECONOMY.shopSlots;
  const common = pickCards(rng, cardPool(inv, 'common'), s.common, rw);
  const hero = pickCards(rng, cardPool(inv, 'hero'), s.heroCard, rw);
  return [...common, ...hero].map((id) => ({ type: 'card', id, ...rollSuit(rng, id), price: cardPrice(rng, id, inv), sold: false }));
}

function rollGoods(rng: Rng, inv: Inventory): ShopItem[] {
  const s = ECONOMY.shopSlots;
  const out: ShopItem[] = [];
  for (const id of pickRelics(rng, inv.relics, s.relic, ECONOMY.relicRarity))
    out.push({ type: 'relic', id, price: jitter(rng, ECONOMY.relicPrice[relicDef(id).rarity] ?? 100, inv), sold: false });
  const nPotion = s.potion + (inv.relics.includes('R20') ? 1 : 0); // 米肉账
  for (let i = 0; i < nPotion; i++) {
    const id = pickPotion(rng);
    out.push({ type: 'potion', id, price: jitter(rng, potionDef(id).price, inv), sold: false });
  }
  return out;
}

export function openShop(rng: Rng, inv: Inventory): ShopState {
  return { cards: rollCardsRow(rng, inv), goods: rollGoods(rng, inv), removeDone: false, dialog: '客官，看货' };
}

export const removePrice = (inv: Inventory) => ECONOMY.removeBase + ECONOMY.removeStep * inv.removeUsed;

export type BuyResult = 'ok' | 'sold' | 'gold' | 'potion_full';

export function canBuy(inv: Inventory, it: ShopItem): BuyResult {
  if (it.sold) return 'sold';
  if (it.type === 'potion' && potionsFull(inv)) return 'potion_full';
  if (inv.gold < it.price) return 'gold';
  return 'ok';
}

export function buy(inv: Inventory, st: ShopState, it: ShopItem): BuyResult {
  const r = canBuy(inv, it);
  if (r !== 'ok') return r;
  spend(inv, it.price);
  if (it.type === 'card') addCard(inv, it.id, it.suit, it.rank);
  else if (it.type === 'relic') inv.relics.push(it.id);
  else addPotion(inv, it.id);
  it.sold = true;
  st.dialog = '多谢惠顾';
  return 'ok';
}

export const refreshFree = (inv: Inventory) => inv.shopRefreshUsed < ECONOMY.shopFreeRefresh;
export const refreshCost = (inv: Inventory) => (refreshFree(inv) ? 0 : ECONOMY.shopRefresh);

/** 刷新：换卡牌、宝物、丹药（已售格也补货），不重置删牌 */
export function refreshShop(rng: Rng, inv: Inventory, st: ShopState): boolean {
  const cost = refreshCost(inv);
  if (!spend(inv, cost)) return false;
  if (cost === 0) inv.shopRefreshUsed++;
  st.cards = rollCardsRow(rng, inv);
  st.goods = rollGoods(rng, inv);
  return true;
}

export function canUseRemove(inv: Inventory, st: ShopState) {
  return !st.removeDone && inv.gold >= removePrice(inv) && inv.deck.some((c) => canRemove(inv, c.uid));
}

export function removeService(inv: Inventory, st: ShopState, uid: number): boolean {
  if (!canUseRemove(inv, st) || !canRemove(inv, uid)) return false;
  spend(inv, removePrice(inv));
  removeCard(inv, uid);
  inv.removeUsed++;
  st.removeDone = true;
  return true;
}
