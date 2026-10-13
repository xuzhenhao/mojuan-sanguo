import { describe, expect, it } from 'vitest';
import { seeded } from '../src/core/rng';
import { canRemove } from '../src/game/economy/inventory';
import { buy, canBuy, openShop, refreshCost, refreshShop, removePrice, removeService } from '../src/game/economy/shop';
import { demoInventory } from '../src/game/economy/session';

describe('集市（10.7）', () => {
  it('货架：3 卡 + 1 宝物 + 2 丹药（设计稿占位）', () => {
    const st = openShop(seeded(9), demoInventory());
    expect(st.cards).toHaveLength(3);
    expect(st.goods.filter((g) => g.type === 'relic')).toHaveLength(1);
    expect(st.goods.filter((g) => g.type === 'potion')).toHaveLength(2);
  });
  it('购买扣钱、售出后空着；买不起 / 丹药满拒绝', () => {
    const inv = demoInventory({ gold: 500 });
    const st = openShop(seeded(10), inv);
    const it = st.cards[0];
    expect(buy(inv, st, it)).toBe('ok');
    expect(inv.gold).toBe(500 - it.price);
    expect(canBuy(inv, it)).toBe('sold');
    inv.gold = 0;
    expect(canBuy(inv, st.cards[1])).toBe('gold');
    inv.gold = 500;
    inv.potions = ['P01', 'P02', 'P03'];
    expect(
      canBuy(
        inv,
        st.goods.find((g) => g.type === 'potion')!,
      ),
    ).toBe('potion_full');
  });
  it('刷新：首次免费，之后 25；已售格补货', () => {
    const inv = demoInventory({ gold: 100 });
    const rng = seeded(11);
    const st = openShop(rng, inv);
    st.cards[0].sold = true;
    expect(refreshCost(inv)).toBe(0);
    expect(refreshShop(rng, inv, st)).toBe(true);
    expect(st.cards.every((c) => !c.sold)).toBe(true);
    expect(refreshCost(inv)).toBe(25);
    refreshShop(rng, inv, st);
    expect(inv.gold).toBe(75);
  });
  it('删牌：50 起每次 +25，进店限 1 次；删后不少于 8 张', () => {
    const inv = demoInventory({ gold: 500 });
    const st = openShop(seeded(12), inv);
    const uid = inv.deck.find((c) => canRemove(inv, c.uid))!.uid;
    expect(removePrice(inv)).toBe(50);
    expect(removeService(inv, st, uid)).toBe(true);
    expect(inv.gold).toBe(450);
    expect(removePrice(inv)).toBe(75);
    expect(removeService(inv, st, inv.deck[0].uid)).toBe(false);
    inv.deck = inv.deck.slice(0, 8);
    expect(inv.deck.every((c) => !canRemove(inv, c.uid))).toBe(true);
  });
});

describe('定价读配置（#70）与 RunSession 背包', () => {
  it('非定价卡按 rules.shop.cardPrice ±10%', async () => {
    const { CONFIG } = await import('../src/data/config');
    const { cardPrice } = await import('../src/game/economy/pools');
    const rng = seeded(21);
    const inv = demoInventory();
    const base = CONFIG.rules.shop!.cardPrice.N;
    for (let i = 0; i < 30; i++) {
      const p = cardPrice(rng, 'B001', inv);
      expect(Math.abs(p - base)).toBeLessThanOrEqual(base * 0.1 + 2.5);
    }
  });
  it('集市购买 / 删牌写入 RunSession.inventory（经济随机流），写档后读回一致，不写旧键', async () => {
    const { RunSession } = await import('../src/game/run');
    const { RUN_STATE_KEY, LEGACY_RUN_SAVE_KEY } = await import('../src/game/run/state');
    const m = new Map<string, string>();
    const store = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 3 });
    const inv = run.inventory;
    inv.gold = 999;
    const st = openShop(run.rng('economy'), inv);
    const n = inv.deck.length;
    const bought = st.cards[0];
    expect(buy(inv, st, bought)).toBe('ok');
    expect(inv.deck).toHaveLength(n + 1);
    const uid = inv.deck.find((c) => canRemove(inv, c.uid))!.uid;
    expect(removeService(inv, st, uid)).toBe(true);
    run.save(store);
    expect(m.has(LEGACY_RUN_SAVE_KEY)).toBe(false);
    expect(m.has(RUN_STATE_KEY)).toBe(true);
    const r2 = new RunSession();
    expect(r2.load(store).ok).toBe(true);
    const inv2 = r2.inventory;
    expect(inv2.gold).toBe(inv.gold);
    expect(inv2.deck.map((c) => c.uid)).toEqual(inv.deck.map((c) => c.uid));
    expect(inv2.deck.some((c) => c.uid === uid)).toBe(false);
  });
});
