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
