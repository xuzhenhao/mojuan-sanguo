import { describe, expect, it } from 'vitest';
import { FlowMachine, viewOf, type RunStateView } from '../src/game/flow';
import { Router } from '../src/game/router';
import { PAGE_ACTIONS, PlaceholderScene } from '../src/game/scenes/placeholder';
import { CUT, SceneManager } from '../src/engine/scene';
import { mkGame } from './helpers';

describe('FlowMachine', () => {
  it('完整流程：点将 → 地图 → 战斗 → 奖励 → 地图 → 集市 → 地图 → 战斗败北 → 结算 → 点将', () => {
    const f = new FlowMachine();
    f.send({ type: 'start_run' });
    f.send({ type: 'enter_node', node: 'battle' });
    f.send({ type: 'battle_end', win: true });
    f.send({ type: 'reward_done' });
    f.send({ type: 'enter_node', node: 'shop' });
    f.send({ type: 'shop_done' });
    f.send({ type: 'enter_node', node: 'battle' });
    f.send({ type: 'battle_end', win: false });
    f.send({ type: 'result_done' });
    expect(f.history).toEqual(['select', 'map', 'battle', 'reward', 'map', 'shop', 'map', 'battle', 'result', 'select']);
  });
  it('非法事件抛错', () => {
    const f = new FlowMachine();
    expect(f.can({ type: 'shop_done' })).toBe(false);
    expect(() => f.send({ type: 'shop_done' })).toThrow();
  });
  it('由 core 局状态驱动：战斗结束自动跳转；最后一场的奖励之后进入结算', () => {
    const v: RunStateView = { battleOver: false, alive: true, isLast: false, battleIdx: 0 };
    const f = new FlowMachine(() => v);
    f.page = 'battle';
    expect(f.sync()).toBeNull();
    v.battleOver = true;
    expect(f.sync()).toBe('reward');
    v.isLast = true;
    expect(f.send({ type: 'reward_done' })).toBe('result');
  });
  it('battle_end 与 core 状态矛盾时拒绝', () => {
    const f = new FlowMachine(() => ({ battleOver: true, alive: false, isLast: false, battleIdx: 0 }));
    f.page = 'battle';
    expect(() => f.send({ type: 'battle_end', win: true })).toThrow(/不一致/);
  });
  it('viewOf 只读取 core 的 Game 字段', () => {
    const { g } = mkGame({}, 1);
    g.startBattle();
    const v = viewOf(g);
    expect(v).toEqual({ battleOver: false, alive: true, isLast: g.isLast, battleIdx: 0 });
  });
});

describe('Router + 占位页面', () => {
  it('每个页面都有占位场景和按钮；按钮驱动流程切换场景', async () => {
    const m = new SceneManager({ width: 390, height: 844, invalidate() {} }, {});
    const f = new FlowMachine();
    const ref: { r?: Router } = {};
    for (const p of Object.keys(PAGE_ACTIONS) as (keyof typeof PAGE_ACTIONS)[]) m.register(p, () => new PlaceholderScene(p, (e) => void ref.r!.send(e)));
    const router = (ref.r = new Router(f, m, CUT));
    await router.start();
    expect(m.current!.id).toBe('select');
    const sc = m.current as PlaceholderScene;
    const b = sc.buttons()[0];
    m.gesture({ type: 'tap', at: { x: b.rect.x + 5, y: b.rect.y + 5 } });
    expect(f.page).toBe('map');
    expect(m.current!.id).toBe('map');
  });
  it('缺页面时报错', () => {
    const m = new SceneManager({ width: 1, height: 1, invalidate() {} }, {});
    expect(() => new Router(new FlowMachine(), m)).toThrow(/缺少页面/);
  });
});
