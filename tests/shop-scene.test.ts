import { describe, expect, it } from 'vitest';
import { canRemove } from '../src/game/economy/inventory';
import { ShopScene } from '../src/game/scenes/shop';
import { answerConfirm, center, drawAll, flush, longpress, p4env, surface, tap } from './p4-helpers';

function setup(gold = 200, potions = 0) {
  const t = p4env({ gold, potions });
  const s = new ShopScene(t.env);
  s.enter(t.ctx, undefined);
  return Object.assign(t, { s });
}

describe('集市 shop（#45）', () => {
  it('绘制：3 卡 + 宝物 + 2 丹药 + 删牌', () => {
    const { s } = setup();
    expect(s.slots()).toHaveLength(7);
    for (const l of ['bg', 'main'] as const) s.draw(l, surface());
  });
  it('点商品 → 确认 → 购买', async () => {
    const t = setup();
    const it = t.s.st.cards[0];
    t.s.gesture(tap(...center(t.s.cardRect(0))));
    await flush();
    expect(t.overlays.top()?.kind).toBe('popup');
    drawAll(t.overlays);
    answerConfirm(t.overlays, true);
    await flush();
    await flush();
    expect(it.sold).toBe(true);
    expect(t.inv.gold).toBe(200 - it.price);
  });
  it('买不起：抖动 + toast，不弹确认', async () => {
    const t = setup(0);
    t.s.gesture(tap(...center(t.s.cardRect(0))));
    await flush();
    expect(t.overlays.top()?.kind).toBe('toast');
    expect(t.s.shake.size).toBe(1);
    t.s.update(400);
    expect(t.s.shake.size).toBe(0);
  });
  it('丹药满：toast「丹药已满」', async () => {
    const t = setup(500, 3);
    const i = t.s.st.goods.findIndex((g) => g.type === 'potion');
    t.s.gesture(tap(...center(t.s.goodRect(i, t.s.nGoods))));
    await flush();
    expect(t.overlays.top()?.id).toBe('toast:丹药已满');
  });
  it('删牌服务：牌组选择 → 确认删除，进店限 1 次', async () => {
    const t = setup(500);
    const n = t.inv.deck.length;
    t.s.gesture(tap(...center(t.s.goodRect(t.s.nGoods - 1, t.s.nGoods))));
    await flush();
    expect(t.overlays.top()?.id).toBe('deck-pick');
    const idx = t.inv.deck.findIndex((c) => canRemove(t.inv, c.uid));
    // 网格：5 列 64×92，间距 8，x0 = (390-352)/2 = 19，y0 = 150
    t.overlays.gesture(tap(19 + (idx % 5) * 72 + 30, 150 + Math.floor(idx / 5) * 100 + 40));
    drawAll(t.overlays);
    answerConfirm(t.overlays, true);
    await flush();
    await flush();
    expect(t.inv.deck).toHaveLength(n - 1);
    expect(t.inv.gold).toBe(450);
    expect(t.s.st.removeDone).toBe(true);
  });
  it('刷新：首次免费，之后 25；离开发 shop_done', () => {
    const t = setup(30);
    const r = () => t.s.buttons().find((b) => b.id === 'refresh')!;
    expect(r().text).toContain('免费');
    t.s.gesture(tap(...center(r().rect)));
    expect(r().text).toContain('25');
    t.s.gesture(tap(...center(r().rect)));
    expect(t.inv.gold).toBe(5);
    expect(r().disabled).toBe(true);
    t.s.gesture(tap(...center(t.s.buttons().find((b) => b.id === 'leave')!.rect)));
    expect(t.done).toBe(1);
  });
  it('长按商品看详情', () => {
    const t = setup();
    t.s.gesture(longpress(...center(t.s.goodRect(0, t.s.nGoods))));
    expect(t.overlays.top()?.kind).toBe('detail');
  });
});
