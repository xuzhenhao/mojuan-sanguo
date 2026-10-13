import { describe, expect, it } from 'vitest';
import { FlowMachine } from '../src/game/flow';
import { RestScene, type RestRun } from '../src/game/scenes/rest';
import { MAP_CONFIG } from '../src/data/map';
import type { CardInst } from '../src/core/types';
import { center, flush, p4env, surface, tap } from './p4-helpers';
import type { OverlayStack } from '../src/engine/modal';

function setup(o: { hp?: number; maxHp?: number; wx?: boolean } = {}) {
  const t = p4env();
  const st = { hp: o.hp ?? 3, maxHp: o.maxHp ?? 8 };
  const saves: { hp: number; deck: CardInst[] }[] = [];
  const run: RestRun = {
    head: () => st,
    save: (p) => (saves.push({ hp: p.hp, deck: p.deck.map((c) => ({ ...c, mods: [...c.mods] })) }), (st.hp = p.hp)),
    restConfig: MAP_CONFIG.rest,
  };
  const events: string[] = [];
  const s = new RestScene({ ...t.env, run: () => run, wx: o.wx, track: (e, d) => events.push(`${e}:${JSON.stringify(d)}`) });
  s.enter(t.ctx, { kind: 'rest', layer: 3, fixed: false });
  return { t, s, st, saves, events };
}
const btn = (s: RestScene, id: string) => s.buttons().find((b) => b.id === id)!;
const tapBtn = (s: RestScene, id: string) => s.gesture(tap(...center(btn(s, id).rect)));
const tapOpt = (s: RestScene, i: number) => s.gesture(tap(...center(s.optRect(i))));
/** 牌组选择浮层第 i 张（shop.pickDeckCard 布局） */
const pickRect = (i: number) => ({ x: 19 + (i % 5) * 72, y: 150 + Math.floor(i / 5) * 100, w: 64, h: 92 });
/** 必选浮层（rest.choice）第 i 个按钮（共 n 个，底部对齐） */
const tapChoice = (o: OverlayStack, i: number, n: number) => {
  const r = o.top()!.rect!;
  o.gesture(tap(r.x + r.w / 2, r.y + r.h - 6 - (n - i) * 52 + 22));
};

describe('营地页 rest（#90）', () => {
  it('流程：地图 → 营地 → rest_done → 地图', () => {
    const f = new FlowMachine();
    f.page = 'map';
    expect(f.send({ type: 'enter_node', node: 'rest' })).toBe('rest');
    expect(f.send({ type: 'rest_done' })).toBe('map');
  });
  it('疗伤：选中 → 确定 → 回血写存档；其它行动锁定；回地图', async () => {
    const { t, s, st, saves, events } = setup();
    for (const l of ['bg', 'main'] as const) s.draw(l, surface());
    expect(btn(s, 'ok').disabled).toBe(true); // 未选不可确定
    tapOpt(s, 0);
    expect(s.selected).toBe('heal');
    s.draw('main', surface());
    tapBtn(s, 'ok');
    await flush();
    expect(st.hp).toBe(5);
    expect(saves).toHaveLength(1);
    expect(s.result?.action).toBe('heal');
    expect(s.blocked('temper')).toBe('本次营地已行动');
    expect(await s.perform('burn')).toBe(false);
    s.draw('main', surface());
    expect(s.buttons().map((b) => b.id)).toEqual(['back']);
    tapBtn(s, 'back');
    expect(t.done).toBe(1);
    expect(events[0]).toMatch(/^rest_enter:.*"fixed":false/);
    expect(events).toContain('rest_choose:{"action":"heal"}');
  });
  it('疗伤：青囊书 +2；体力满置灰并 toast', () => {
    const a = setup();
    a.t.inv.relics.push('R03');
    expect(a.s.healPreview()).toMatchObject({ hp: 7, healed: 4 });
    expect(a.s.healAmount()).toBe(4);
    const b = setup({ hp: 8 });
    expect(b.s.blocked('heal')).toBe('体力已满');
    tapOpt(b.s, 0);
    expect(b.s.selected).toBeNull();
    expect(b.t.overlays.top()?.kind).toBe('toast');
  });
  it('离开：不行动直接回地图', () => {
    const { t, s, saves, events } = setup();
    tapBtn(s, 'leave');
    expect(t.done).toBe(1);
    expect(saves).toHaveLength(0);
    expect(events).toContain('rest_choose:{"action":"leave"}');
  });
  it('淬炼：选牌 → 随机 1 条 N/R → 铭刻并存档', async () => {
    const { t, s, saves, events } = setup();
    tapOpt(s, 1);
    tapBtn(s, 'ok');
    await flush();
    expect(t.overlays.top()?.id).toBe('deck-pick');
    // 酒（第 12 张）无可用词条：点了只 toast
    t.overlays.gesture(tap(...center(pickRect(11))));
    expect(t.overlays.ids()).toEqual(['deck-pick', 'toast:此牌暂无可用词条']);
    t.overlays.closeAll('toast');
    t.overlays.gesture(tap(...center(pickRect(0)))); // 杀
    await flush();
    expect(t.overlays.top()?.id).toBe('rest-choice:淬炼');
    t.overlays.draw(surface(), 16);
    tapChoice(t.overlays, 0, 1); // 铭刻
    await flush();
    await flush();
    const c = t.inv.deck[0];
    expect(c.mods).toHaveLength(1);
    expect(['E_S01', 'E_S02', 'E_S03', 'E_S04', 'E_S05', 'E_S07']).toContain(c.mods[0]);
    expect(s.result?.action).toBe('temper');
    expect(saves.at(-1)!.deck[0].mods).toEqual(c.mods);
    expect(events.some((e) => e.startsWith('rest_temper:') && e.includes('"cardId":"B001"'))).toBe(true);
  });
  it('淬炼：取消选牌不消耗本次营地', async () => {
    const { t, s } = setup();
    const p = s.perform('temper');
    await flush();
    t.overlays.gesture(tap(195, 844 - 74 - 56 + 21)); // 取消
    expect(await p).toBe(false);
    expect(s.result).toBeNull();
    expect(s.blocked('heal')).toBeNull();
  });
  it('淬炼：满 2 条走「替换 / 放弃」', async () => {
    const a = setup();
    a.t.inv.deck[0].mods = ['E_S02', 'E_S03'];
    let p = a.s.perform('temper');
    await flush();
    a.t.overlays.gesture(tap(...center(pickRect(0))));
    await flush();
    tapChoice(a.t.overlays, 1, 3); // 替换第 2 条
    await p;
    expect(a.t.inv.deck[0].mods).toHaveLength(2);
    expect(a.t.inv.deck[0].mods[0]).toBe('E_S02');
    expect(a.t.inv.deck[0].mods[1]).not.toBe('E_S03');

    const b = setup();
    b.t.inv.deck[0].mods = ['E_S02', 'E_S03'];
    p = b.s.perform('temper');
    await flush();
    b.t.overlays.gesture(tap(...center(pickRect(0))));
    await flush();
    tapChoice(b.t.overlays, 2, 3); // 放弃
    expect(await p).toBe(true);
    expect(b.t.inv.deck[0].mods).toEqual(['E_S02', 'E_S03']);
    expect(b.s.result?.text).toMatch(/放弃淬炼/);
  });
  it('焚稿：删 1 张（确认后），存档牌组同步', async () => {
    const { t, s, saves, events } = setup();
    expect(t.inv.deck).toHaveLength(12);
    const p = s.perform('burn');
    await flush();
    t.overlays.gesture(tap(...center(pickRect(3)))); // 闪
    await flush();
    expect(t.overlays.top()?.id).toBe('confirm:焚稿');
    const r = t.overlays.top()!.rect!;
    t.overlays.gesture(tap(r.x + r.w - 80, r.y + r.h - 42));
    expect(await p).toBe(true);
    expect(t.inv.deck).toHaveLength(11);
    expect(saves.at(-1)!.deck).toHaveLength(11);
    expect(events.some((e) => e.startsWith('rest_burn:{"cardId":"B004"'))).toBe(true);
  });
  it('焚稿置灰：牌组只剩 8 张', () => {
    const { t, s } = setup();
    t.inv.deck.splice(8);
    expect(s.blocked('burn')).toBe('牌组已无可焚的牌');
  });
  it('淬炼置灰：牌组只有酒', () => {
    const { t, s } = setup();
    t.inv.deck.splice(0, t.inv.deck.length, ...t.inv.deck.filter((c) => c.id === 'B006'));
    expect(s.blocked('temper')).toBe('牌组暂无可淬炼的牌');
  });
  it('微信：焚稿需广告解锁（未接入时置灰）', () => {
    const { s } = setup({ wx: true });
    expect(s.blocked('burn')).toMatch(/视频/);
    expect(s.blocked('temper')).toBeNull();
    s.draw('main', surface());
  });
});
