/** #122 PR3：奖励 / 事件 / 集市读写 RunSession.state —— 进节点快照（三条 rng 流完整）、完成写档、刷新一致 */
import { describe, expect, it } from 'vitest';
import { RunSession } from '../src/game/run';
import { enterReward, rollReward, takeCard } from '../src/game/economy/reward';
import { buy, openShop, removeService } from '../src/game/economy/shop';
import { RNG_STREAMS, RUN_STATE_KEY } from '../src/game/run/state';
import { generateMap } from '../src/core/run/map';
import { MAP_CONFIG } from '../src/data/map';

const mem = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const start = (st: ReturnType<typeof mem>, seed = 41) => {
  const run = new RunSession();
  run.store = st;
  run.start({ main: 'H03', sub: 'H04', seed });
  return run;
};

describe('进节点快照', () => {
  it('任何节点类型：快照里 battle / economy / event 三条 rng 流都在，且是进节点那一刻的值', () => {
    for (const type of ['REWARD', 'EVENT', 'SHOP', 'CHEST', 'REST']) {
      const st = mem();
      const run = start(st);
      run.rng('economy')();
      run.rng('event')();
      const want = run.state.rng;
      run.enterNode({ id: 'X', type }, st);
      const saved = JSON.parse(st.m.get(RUN_STATE_KEY)!);
      expect(Object.keys(saved.rng).sort()).toEqual([...RNG_STREAMS].sort());
      expect(saved.rng).toEqual(want);
      expect(saved.pendingNode).toEqual({ id: 'X', type });
    }
  });
});

describe('奖励页 × RunState', () => {
  it('中途刷新：候选一致；收入后 completeNode 写档，读档牌组 / 铜钱一致', () => {
    const st = mem();
    const run = start(st);
    run.enterNode({ id: 'L1C0#reward', type: 'REWARD' }, st);
    const o1 = rollReward(run.rng('economy'), run.inventory, 'normal');
    const r2 = new RunSession();
    r2.load(st);
    const o2 = rollReward(r2.rng('economy'), r2.inventory, 'normal');
    expect(o2).toEqual(o1);
    const rs = enterReward(r2.inventory, o2);
    takeCard(r2.inventory, rs, 0);
    r2.completeNode(st);
    const r3 = new RunSession();
    r3.load(st);
    expect(r3.inNode).toBeNull();
    expect(r3.state.deck).toEqual(r2.state.deck);
    expect(r3.state.gold).toBe(r2.state.gold);
    expect(r3.state.deck.length).toBe(run.state.deck.length + 1);
  });
  it('Boss 奖励页续玩（没有 core Game）：流程视图 isLast = true，「收入」去结算而不是回地图', () => {
    const st = mem();
    const run = start(st);
    const m0 = generateMap(41, 1, MAP_CONFIG);
    const boss = m0.nodes.find((n) => n.type === 'BOSS')!;
    run.update((d) => void (d.map = { ...m0, current: boss.id }));
    run.enterNode({ id: `${boss.id}#reward`, type: 'REWARD' }, st);
    const r2 = new RunSession();
    r2.load(st);
    expect(r2.game).toBeNull();
    expect(r2.view?.isLast).toBe(true);
  });
});

describe('集市 × RunState', () => {
  it('买牌 / 删牌后刷新读档，牌组一致', () => {
    const st = mem();
    const run = start(st, 43);
    run.update((d) => void (d.gold = 500));
    run.enterNode({ id: 'L2C0', type: 'SHOP' }, st);
    const shop = openShop(run.rng('economy'), run.inventory);
    expect(buy(run.inventory, shop, shop.cards[0])).toBe('ok');
    expect(removeService(run.inventory, shop, run.inventory.deck[1].uid)).toBe(true);
    run.completeNode(st);
    const r2 = new RunSession();
    r2.load(st);
    expect(r2.state.deck).toEqual(run.state.deck);
    expect(r2.state.counters.removeUsed).toBe(1);
  });
});

describe('奇遇（地图内最小版）× RunState', () => {
  it('进 / 完成节点都写档：完成后 pendingNode 清空', () => {
    const st = mem();
    const run = start(st);
    run.enterNode({ id: 'L3C1', type: 'EVENT' }, st);
    expect(JSON.parse(st.m.get(RUN_STATE_KEY)!).pendingNode).toEqual({ id: 'L3C1', type: 'EVENT' });
    run.completeNode(st);
    expect(JSON.parse(st.m.get(RUN_STATE_KEY)!).pendingNode).toBeNull();
  });
});
