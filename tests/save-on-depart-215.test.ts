import { describe, expect, it } from 'vitest';
import { RunSession } from '../src/game/run';
import { RUN_STATE_KEY } from '../src/game/run/state';
import { RunSaveSlot } from '../src/game/result/store';

const mem = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};

describe('#215 出征即存档', () => {
  it('begin 后（未进任何节点）存储里已有本局存档，刷新可续玩', () => {
    const st = mem();
    const run = new RunSession();
    run.begin({ main: 'H03', sub: 'H04', seed: 99 }, st, { now: 5 });
    expect(st.m.has(RUN_STATE_KEY)).toBe(true);
    const s = new RunSaveSlot(st).peek();
    expect(s?.heroMain).toBe('H03');
    expect(s?.runSeed).toBe(99);
    const again = new RunSession();
    const r = again.load(st);
    expect(r.ok).toBe(true);
    expect(again.state.map).toBeNull();
    expect(again.state.pendingNode).toBeNull();
    expect(again.state.startedAt).toBe(5);
  });
});
