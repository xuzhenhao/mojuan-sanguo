import { describe, expect, it } from 'vitest';
import { RunSession, NULL_IO } from '../src/game/run';
import { BATTLES } from '../src/data/enemies';
import { deserializeRunState, RUN_STATE_KEY } from '../src/game/run/state';
import { reviveHp } from '../src/core/rules';

const node = (id: string) => ({ nodeId: id, nodeType: 'BATTLE' as const, encounterName: 't', enemies: [...BATTLES[0].en] });
const mem = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};

describe('#106 RunState：reviveLeft 随存档', () => {
  it('建战斗时取 RunState 的 reviveLeft / 天命；结算写回已扣次数并持久化', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 5 });
    const st = mem();
    run.enterNode({ id: 'L1C0', type: 'BATTLE' }, st);
    const g = run.buildBattle(NULL_IO, node('L1C0'));
    expect([g.reviveLeft, g.tianming]).toEqual([1, 0]);
    g.p.hp = 0;
    g.doRevive();
    expect(g.p.hp).toBe(reviveHp(g.p.maxHp));
    // 复活层不是存档点：节点内存档仍是进节点快照（reviveLeft = 1）
    run.save(st);
    const mid = deserializeRunState(st.get(RUN_STATE_KEY));
    expect(mid.ok && mid.state.reviveLeft).toBe(1);
    run.settleBattle(true);
    run.completeNode(st);
    const r = deserializeRunState(st.get(RUN_STATE_KEY));
    expect(r.ok && r.state.reviveLeft).toBe(0);
    const g2 = run.buildBattle(NULL_IO, node('L2C0'));
    expect(g2.reviveLeft).toBe(0);
    expect(g2.canRevive()).toBe(false);
  });
  it('天命 5：建出的战斗不可复活', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 5 }, NULL_IO, { tianming: 5 });
    const g = run.buildBattle(NULL_IO, node('L1C0'));
    expect(g.tianming).toBe(5);
    expect(g.canRevive()).toBe(false);
  });
});
