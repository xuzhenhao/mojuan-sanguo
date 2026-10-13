import { testNow } from './helpers';
/** #122 PR3：按节点统计写进 RunState.stats；战斗序号（第N战）由 stats 推出，跨场 / 续玩不重置 */
import { describe, expect, it } from 'vitest';
import { RunSession, NULL_IO } from '../src/game/run';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { BATTLES } from '../src/data/enemies';

const mem = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const node = (id: string, nodeType: 'BATTLE' | 'ELITE' | 'BOSS' = 'BATTLE') => ({ nodeId: id, nodeType, encounterName: 't', enemies: [...BATTLES[0].en] });

describe('#122 PR3 按节点统计', () => {
  it('战斗结算把增量（胜场/精英/回合/灵光/伤害）累加进 RunState.stats，并随 completeNode 写档', () => {
    const st = mem();
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 5 });
    run.enterNode({ id: 'L1C0', type: 'BATTLE' }, st);
    const g = run.buildBattle(NULL_IO, node('L1C0'));
    const hp0 = g.p.hp;
    g.p.hp -= 2;
    g.turn = 4;
    g.epiCount = 1;
    const dealt = g.en.reduce((n, e) => n + e.max, 0);
    for (const e of g.en) e.hp = 0;
    run.settleBattle(true);
    run.completeNode(st);
    expect(run.state.stats).toMatchObject({ battlesWon: 1, elitesKilled: 0, bossKilled: 0, turns: 4, epiphanies: 1, dmgTaken: 2, dmgDealt: dealt });
    expect(JSON.parse(st.m.get('mojuan.runstate.v1')!).stats.battlesWon).toBe(1);
    // 精英第二场：累加
    const g2 = run.buildBattle(NULL_IO, node('L2C0', 'ELITE'));
    g2.turn = 3;
    run.settleBattle(true);
    expect(run.state.stats).toMatchObject({ battlesWon: 2, elitesKilled: 1, turns: 7 });
    expect(hp0).toBeGreaterThan(0);
  });
  it('战败也记回合，但不记胜场', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 6 });
    const g = run.buildBattle(NULL_IO, node('L1C0'));
    g.turn = 5;
    run.settleBattle(false);
    expect(run.state.stats).toMatchObject({ battlesWon: 0, turns: 5 });
  });
});

describe('#122 PR3 战斗序号（第N战）持久化', () => {
  it('打完第 1 战 → 存档 → 读档 → 进第 2 战，标题是「第2战」', () => {
    const st = mem();
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 7 });
    const mk = (r: RunSession) =>
      new BattleScene({
        now: testNow,
        build: (io, p) => r.buildBattle(io, { nodeId: p.nodeId!, nodeType: p.nodeType!, encounterName: p.encounterName ?? '', enemies: p.enemies! }, false),
        battleNo: () => r.battleNo,
      });
    const ctx = { invalidate() {}, width: 390, height: 844 };
    const s1 = mk(run);
    s1.enter(ctx, { nodeId: 'L1C0', nodeType: 'BATTLE', encounterName: BATTLES[0].name, enemies: [...BATTLES[0].en] } as never);
    expect(s1.topBar().left).toMatch(/^第1战/);
    run.settleBattle(true);
    run.completeNode(st);
    const run2 = new RunSession();
    expect(run2.load(st).ok).toBe(true);
    expect(run2.battleNo).toBe(2);
    const s2 = mk(run2);
    s2.enter(ctx, { nodeId: 'L2C0', nodeType: 'BATTLE', encounterName: BATTLES[1].name, enemies: [...BATTLES[1].en] } as never);
    expect(s2.topBar().left).toMatch(/^第2战 · /);
  });
});
