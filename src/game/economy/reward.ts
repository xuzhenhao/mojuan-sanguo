/** 战斗奖励（PRD 14.8 / 14.1 / 14.3 / 12.2 / 16.2.1）。纯逻辑，可单测；表现见 scenes/reward.ts */
import type { Rng } from '../../core/rng';
import type { Suit } from '../../core/types';
import { ECONOMY, type BattleKind } from '../../data/economy';
import { addCard, addPotion, potionsFull, type Inventory } from './inventory';
import { cardPool, pickCards, pickPotion, pickRelics, randInt, rarityWeights, rollSuit } from './pools';

export interface CardOffer {
  id: string;
  suit: Suit;
  rank: number;
}

export interface RewardOffer {
  kind: BattleKind;
  gold: number;
  /** 掉落的丹药（null = 没掉） */
  potion: string | null;
  /** 精英：随机 1 件；Boss：三选一 */
  relics: string[];
  relicPick: 'one' | 'choose' | 'none';
  cards: CardOffer[];
}

export interface RewardState {
  offer: RewardOffer;
  /** 丹药：auto=已自动入账；full=栏满待替换/放弃；none=没掉；done=已处理 */
  potion: 'auto' | 'full' | 'none' | 'done';
  relicTaken: string | null;
  cardTaken: CardOffer | null;
  skipped: boolean;
}

export function rollCards(rng: Rng, inv: Inventory, kind: BattleKind): CardOffer[] {
  const ids = pickCards(rng, cardPool(inv), 3, rarityWeights(inv.chapter, kind), kind === 'boss');
  return ids.map((id) => ({ id, ...rollSuit(rng, id) }));
}

export function rollReward(rng: Rng, inv: Inventory, kind: BattleKind): RewardOffer {
  const ch = Math.min(Math.max(inv.chapter, 1), 3) - 1;
  let gold = randInt(rng, ECONOMY.battleGold[kind][ch]);
  if (kind === 'elite' && inv.relics.includes('R29')) gold += 20; // 鼓吹
  if (inv.relics.includes('R04')) gold += 10; // 孙子残卷
  const potion = rng() < ECONOMY.potionDrop[kind] ? pickPotion(rng) : null;
  let relics: string[] = [];
  if (kind === 'elite') relics = pickRelics(rng, inv.relics, 1, ECONOMY.relicRarity);
  if (kind === 'boss') {
    relics = pickRelics(rng, inv.relics, 3, { [ECONOMY.bossRelicPool]: 1 });
    relics.push(...pickRelics(rng, [...inv.relics, ...relics], 3 - relics.length, { [ECONOMY.bossRelicFill]: 1 }));
  }
  return { kind, gold, potion, relics, relicPick: kind === 'boss' ? 'choose' : relics.length ? 'one' : 'none', cards: rollCards(rng, inv, kind) };
}

/** 进入奖励页：铜钱自动入账；丹药有空位自动入账，满则进入 full 待处理 */
export function enterReward(inv: Inventory, offer: RewardOffer): RewardState {
  inv.gold += offer.gold;
  let potion: RewardState['potion'] = 'none';
  if (offer.potion) potion = potionsFull(inv) ? 'full' : (addPotion(inv, offer.potion), 'auto');
  return { offer, potion, relicTaken: null, cardTaken: null, skipped: false };
}

/** 丹药满：替换第 slot 格；slot = null 表示放弃 */
export function resolvePotion(inv: Inventory, st: RewardState, slot: number | null) {
  if (st.potion !== 'full' || !st.offer.potion) return false;
  if (slot !== null && !addPotion(inv, st.offer.potion, slot)) return false;
  st.potion = 'done';
  return true;
}

export function takeRelic(inv: Inventory, st: RewardState, id: string) {
  if (st.relicTaken || !st.offer.relics.includes(id)) return false;
  inv.relics.push(id);
  st.relicTaken = id;
  return true;
}

export function takeCard(inv: Inventory, st: RewardState, i: number) {
  const c = st.offer.cards[i];
  if (!c || st.cardTaken || st.skipped) return false;
  addCard(inv, c.id, c.suit, c.rank);
  st.cardTaken = c;
  return true;
}
