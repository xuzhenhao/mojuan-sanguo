import { describe, expect, it } from 'vitest';
import { RunSession } from '../src/game/run';
import { outcomeFromRunState } from '../src/game/result/adapter';
import { buildView, EMPTY_META } from '../src/game/result/settlement';
import { heroName } from '../src/game/result/adapter';

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const fakeMap = (current: string) =>
  ({
    chapter: 1,
    seed: 1,
    boss: 'E_BOSS',
    nodes: [
      { id: 'L3C1', layer: 3, type: 'BATTLE' },
      { id: 'BOSS', layer: 9, type: 'BOSS' },
    ],
    edges: [],
    visited: [],
    current,
    rerolls: 0,
    relaxed: false,
  }) as never;

describe('#212 结算页接入真实结局', () => {
  it('打通 Boss（未 endRun）→ 大捷，层数 / 种子 / 胜场取本局真实数据', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 777 }, undefined, { now: 1000 });
    run.update((d) => {
      d.map = fakeMap('BOSS');
      d.stats.battlesWon = 9;
      d.stats.bossKilled = 1;
    });
    const o = outcomeFromRunState(run.state, { now: 1000 + 65_000 });
    expect(o.win).toBe(true);
    expect(o.layer).toBe(9);
    expect(o.runSeed).toBe(777);
    expect(o.stats.battlesWon).toBe(9);
    expect(o.durationMs).toBe(65_000);
    expect(buildView(o, EMPTY_META, heroName).title).toBe('大捷');
  });
  it('战斗失败（endRun）→ 败北，用真实层数与致命敌人，不是演示数据', () => {
    const run = new RunSession();
    const s = mem();
    run.start({ main: 'H03', sub: 'H04', seed: 42 }, undefined, { now: 1 });
    run.update((d) => {
      d.map = fakeMap('L3C1');
      d.stats.battlesWon = 2;
    });
    run.enterNode({ id: 'L3C1', type: 'BATTLE' }, s);
    run.endRun(s);
    const o = outcomeFromRunState(run.state, { now: 2, killer: '黄巾贼' });
    expect(o.win).toBe(false);
    expect(o.layer).toBe(3);
    expect(o.runSeed).toBe(42);
    expect(o.killer).toBe('黄巾贼');
    expect(o.stats.battlesWon).toBe(2);
    expect(buildView(o, EMPTY_META, heroName).title).toBe('败北');
  });
});
