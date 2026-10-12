import { describe, expect, it } from 'vitest';
import { FlowMachine } from '../src/game/flow';
import { ChestScene, CHEST_OPEN_MS } from '../src/game/scenes/chest';
import { center, longpress, p4env, surface, tap } from './p4-helpers';

describe('宝箱 chest（#45）', () => {
  it('流程：地图 → 宝箱 → 地图', () => {
    const f = new FlowMachine();
    f.page = 'map';
    expect(f.send({ type: 'enter_node', node: 'chest' })).toBe('chest');
    expect(f.send({ type: 'chest_done' })).toBe('map');
  });
  it('宝物分支：开箱后选中 → 收入', () => {
    const t = p4env();
    const s = new ChestScene(t.env);
    s.enter(t.ctx, { offer: { type: 'relic', relics: ['R10', 'R14', 'R22'] } });
    expect(s.animating()).toBe(true);
    s.update(CHEST_OPEN_MS);
    for (const l of ['bg', 'main'] as const) s.draw(l, surface(), 16);
    s.gesture(tap(...center(s.colRect(1))));
    expect(s.selected).toBe(1);
    s.gesture(tap(...center(s.buttons().find((b) => b.id === 'take')!.rect)));
    expect(t.inv.relics).toEqual(['R14']);
    expect(t.done).toBe(1);
  });
  it('略过：不拿宝物', () => {
    const t = p4env();
    const s = new ChestScene(t.env);
    s.enter(t.ctx, { offer: { type: 'relic', relics: ['R10', 'R14', 'R22'] } });
    s.update(CHEST_OPEN_MS);
    s.gesture(tap(...center(s.buttons().find((b) => b.id === 'skip')!.rect)));
    expect(t.inv.relics).toEqual([]);
    expect(t.done).toBe(1);
  });
  it('长按宝物看详情', () => {
    const t = p4env();
    const s = new ChestScene(t.env);
    s.enter(t.ctx, { offer: { type: 'relic', relics: ['R10', 'R14', 'R22'] } });
    s.update(CHEST_OPEN_MS);
    s.gesture(longpress(...center(s.colRect(0))));
    expect(t.overlays.top()?.kind).toBe('detail');
  });
  it('铜钱分支：铜钱入账，走奖励页卡牌布局，选牌后 chest_done', () => {
    const t = p4env();
    const s = new ChestScene(t.env);
    s.enter(t.ctx, { offer: { type: 'gold', gold: 66 } });
    expect(t.inv.gold).toBe(126);
    const r = s.cards!;
    expect(r.fromChest).toBe(true);
    r.skipAnim();
    for (const l of ['bg', 'main'] as const) s.draw(l, surface(), 16);
    s.gesture(tap(...center(r.cardRect(0))));
    s.gesture(tap(...center(r.cardRect(0))));
    expect(t.done).toBe(1);
  });
});
