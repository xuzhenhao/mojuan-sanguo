import { describe, expect, it } from 'vitest';
import { RewardScene, REWARD_ANIM } from '../src/game/scenes/reward';
import { answerConfirm, center, drawAll, flush, longpress, p4env, surface, tap } from './p4-helpers';

function setup(kind: 'normal' | 'elite' | 'boss' = 'normal', potions = 0) {
  const t = p4env({ potions });
  const s = new RewardScene(t.env);
  s.enter(t.ctx, { kind });
  return Object.assign(t, { s });
}

describe('奖励页 reward（#45）', () => {
  it('进入：铜钱自动入账；翻牌中点击跳过演出、不可选牌', () => {
    const { s, inv } = setup();
    expect(inv.gold).toBe(60 + s.st.offer.gold);
    expect(s.flipping).toBe(true);
    s.gesture(tap(...center(s.cardRect(0))));
    expect(s.flipping).toBe(false);
    expect(s.selected).toBe(-1);
  });
  it('翻牌时间线：大印 600ms → 胶囊 → 每张间隔 100ms 翻开 300ms', () => {
    const { s } = setup();
    s.update(REWARD_ANIM.seal + 2 * REWARD_ANIM.pillGap + 150);
    expect(s.flipOf(0)).toBeCloseTo(0.5);
    expect(s.flipOf(1)).toBeCloseTo(50 / 300);
    expect(s.flipOf(2)).toBe(0);
    for (const l of ['bg', 'main'] as const) s.draw(l, surface());
  });
  it('点牌选中 → 收入：入卷并 reward_done', () => {
    const t = setup();
    const { s, inv } = t;
    s.skipAnim();
    const n = inv.deck.length;
    expect(s.buttons().find((b) => b.id === 'take')!.disabled).toBe(true);
    s.gesture(tap(...center(s.cardRect(1))));
    expect(s.selected).toBe(1);
    s.gesture(tap(...center(s.buttons().find((b) => b.id === 'take')!.rect)));
    expect(inv.deck).toHaveLength(n + 1);
    expect(t.done).toBe(1);
  });
  it('再点已选中的牌直接收入', () => {
    const t = setup();
    t.s.skipAnim();
    t.s.gesture(tap(...center(t.s.cardRect(2))));
    t.s.gesture(tap(...center(t.s.cardRect(2))));
    expect(t.done).toBe(1);
    expect(t.s.st.cardTaken).toBe(t.s.st.offer.cards[2]);
  });
  it('略过：二次确认，取消则留在页', async () => {
    const t = setup();
    t.s.skipAnim();
    const skip = t.s.buttons().find((b) => b.id === 'skip')!;
    t.s.gesture(tap(...center(skip.rect)));
    expect(t.overlays.top()?.id).toContain('confirm');
    answerConfirm(t.overlays, false);
    await flush();
    expect(t.done).toBe(0);
    t.s.gesture(tap(...center(skip.rect)));
    answerConfirm(t.overlays, true);
    await flush();
    expect(t.done).toBe(1);
    expect(t.s.st.skipped).toBe(true);
  });
  it('免费刷新（本局 1 次）：换卡并置灰', () => {
    const t = setup();
    t.s.skipAnim();
    const r = t.s.buttons().find((b) => b.id === 'refresh')!;
    expect(r.text).toContain('免费刷新（本局 1 次）');
    t.s.gesture(tap(...center(r.rect)));
    expect(t.inv.rewardRefreshUsed).toBe(1);
    expect(t.s.flipping).toBe(true);
    t.s.skipAnim();
    expect(t.s.buttons().find((b) => b.id === 'refresh')!.disabled).toBe(true);
  });
  it('精英：点宝物条领取（独立于选卡）', () => {
    const t = setup('elite');
    t.s.skipAnim();
    t.s.gesture(tap(...center(t.s.relicBar())));
    expect(t.inv.relics).toEqual(t.s.st.offer.relics);
    expect(t.done).toBe(0);
  });
  it('Boss：宝物条打开三选一', async () => {
    const t = setup('boss');
    t.s.skipAnim();
    t.s.gesture(tap(...center(t.s.relicBar())));
    expect(t.overlays.top()?.id).toBe('relic-choice');
    drawAll(t.overlays);
    // 第 1 列（x≈10..130, y 300..528）点两次 = 选中并收入
    t.overlays.gesture(tap(70, 400));
    t.overlays.gesture(tap(70, 400));
    await flush();
    expect(t.inv.relics).toEqual([t.s.st.offer.relics[0]]);
  });
  it('丹药栏满：翻牌后弹“丹药已满”，可替换', async () => {
    const t = p4env({ potions: 3 });
    const s = new RewardScene(t.env);
    const base = {
      kind: 'normal' as const,
      gold: 20,
      potion: 'P10',
      relics: [],
      relicPick: 'none' as const,
      cards: [{ id: 'B001', suit: 'S' as const, rank: 7 }],
    };
    s.enter(t.ctx, { offer: base });
    expect(s.st.potion).toBe('full');
    s.skipAnim();
    expect(t.overlays.top()?.id).toBe('potion-full');
    drawAll(t.overlays);
    // 第 2 格：x = (390-320)/2 + 24 + 96 = 155..235，y = 250+128..
    t.overlays.gesture(tap(195, 420));
    await flush();
    expect(t.inv.potions[1]).toBe('P10');
    expect(s.st.potion).toBe('done');
  });
  it('长按牌看详情（复用 detail 浮层）', () => {
    const t = setup();
    t.s.skipAnim();
    t.s.gesture(longpress(...center(t.s.cardRect(0))));
    expect(t.overlays.top()?.kind).toBe('detail');
  });
});
