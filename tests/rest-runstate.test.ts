/** #122 PR3：营地读写 RunSession.state（体力 / 牌组 / event 随机流），进节点快照 + 完成写档 */
import { describe, expect, it } from 'vitest';
import { RunSession, NULL_IO } from '../src/game/run';
import { restRunOf } from '../src/game/scenes/p4-register';
import { RestScene } from '../src/game/scenes/rest';
import { BATTLES } from '../src/data/enemies';
import { rollTemper } from '../src/core/run/rest';
import { p4env } from './p4-helpers';

const mem = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
function camp(run: RunSession) {
  const t = p4env();
  const s = new RestScene({ ...t.env, inventory: () => run.inventory, rng: () => run.rng('event'), run: () => restRunOf(run) });
  s.enter(t.ctx, { kind: 'rest', layer: 3, fixed: false });
  return { t, s };
}
const start = (store: ReturnType<typeof mem>) => {
  const run = new RunSession();
  run.store = store;
  run.start({ main: 'H03', sub: 'H04', seed: 31 });
  return run;
};

describe('营地 × RunState', () => {
  it('疗伤：RunState 体力更新并写档；下一战 / 读档体力一致', async () => {
    const st = mem();
    const run = start(st);
    run.update((d) => void (d.hp = 3));
    run.enterNode({ id: 'L3C0', type: 'REST' }, st);
    const { s } = camp(run);
    expect(await s.perform('heal')).toBe(true);
    const hp = run.state.hp;
    expect(hp).toBeGreaterThan(3);
    expect(run.inNode).toBeNull(); // 行动完成即 completeNode
    expect(JSON.parse(st.m.get('mojuan.runstate.v1')!).hp).toBe(hp);
    const g = run.buildBattle(NULL_IO, { nodeId: 'L4C0', nodeType: 'BATTLE', encounterName: 't', enemies: [...BATTLES[0].en] });
    expect(g.p.hp).toBe(hp);
    const r2 = new RunSession();
    expect(r2.load(st).ok && r2.state.hp).toBe(hp);
  });
  it('淬炼走 event 流：economy / battle 流不动；中途刷新重进同一张牌得到同一词条', () => {
    const st = mem();
    const run = start(st);
    run.enterNode({ id: 'L3C0', type: 'REST' }, st);
    const before = run.state.rng;
    const card = run.inventory.deck[0];
    const a1 = rollTemper(run.rng('event'), card, run.inventory.deck);
    const after = run.state.rng;
    expect(after.event).not.toBe(before.event);
    expect([after.economy, after.battle]).toEqual([before.economy, before.battle]);
    // 中途刷新：读进节点快照，重抽一致
    const r2 = new RunSession();
    const lr = r2.load(st);
    expect(lr.ok && lr.notice).toBe('node_restart');
    expect(r2.inNode).toEqual({ id: 'L3C0', type: 'REST' });
    const a2 = rollTemper(r2.rng('event'), r2.inventory.deck[0], r2.inventory.deck);
    expect(a2?.id).toBe(a1?.id);
  });
  it('焚稿：牌组写回 RunState，读档牌组一致', async () => {
    const st = mem();
    const run = start(st);
    run.enterNode({ id: 'L3C0', type: 'REST' }, st);
    const n = run.state.deck.length;
    const uid = run.inventory.deck[3].uid;
    // 直接走焚稿后的保存路径（UI 交互见 rest-scene.test）
    run.inventory.deck.splice(3, 1);
    restRunOf(run).save({ hp: run.state.hp, deck: run.inventory.deck });
    const r2 = new RunSession();
    r2.load(st);
    expect(r2.state.deck).toHaveLength(n - 1);
    expect(r2.state.deck.some((c) => c.uid === uid)).toBe(false);
  });
});
