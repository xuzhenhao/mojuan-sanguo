import { describe, expect, it } from 'vitest';
import { demoOutcome, outcomeFromGame, outcomeFromSave, reviveUsedOf } from '../src/game/result/adapter';
import { mkGame } from './helpers';

const opts = { runSeed: 1, startedAt: 0, now: 1 };

describe('#106 结算页「复活」按 reviveLeft 显示（不按胜负推断）', () => {
  it('reviveUsedOf', () => {
    expect([reviveUsedOf(1), reviveUsedOf(0), reviveUsedOf(undefined)]).toEqual([false, true, false]);
  });
  it('战败且没复活过：复活「未使用」', () => {
    const { g } = mkGame();
    g.startBattle();
    g.reviveLeft = 1;
    g.p.hp = 0;
    const o = outcomeFromGame(g, opts);
    expect(o.win).toBe(false);
    expect(o.reviveUsed).toBe(false);
  });
  it('复活过后再战败：复活「已使用」', () => {
    const { g } = mkGame();
    g.startBattle();
    g.reviveLeft = 1;
    g.doRevive();
    g.p.hp = 0;
    const o = outcomeFromGame(g, opts);
    expect(o.win).toBe(false);
    expect(o.reviveUsed).toBe(true);
  });
  it('示例 / 放弃结算同样按 reviveLeft', () => {
    expect(demoOutcome(false).reviveUsed).toBe(false);
    expect(demoOutcome(true, 0).reviveUsed).toBe(true);
    const s = { runSeed: 1, heroMain: 'H03', heroSub: 'H04', chapter: 1, layer: 3, startedAt: 0, tianming: 0, gold: 0 } as never;
    expect(outcomeFromSave(s, { reviveLeft: 1 }, 1).reviveUsed).toBe(false);
    expect(outcomeFromSave(s, { reviveLeft: 0 }, 1).reviveUsed).toBe(true);
  });
});
