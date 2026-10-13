import { describe, expect, it } from 'vitest';
import { DYING_FADE_MS, dyingAlpha, dyingEdgeAlpha, dyingFading, newDyingEdge } from '../src/game/scenes/battle/hpview';

describe('#141 dying 红边：回到 ≥2 体力 200ms 淡出', () => {
  it('从当前 alpha 线性淡到 0，不瞬间消失', () => {
    const st = newDyingEdge();
    const a0 = dyingEdgeAlpha(st, 1, 300);
    expect(a0).toBeCloseTo(dyingAlpha(300), 6);
    expect(dyingEdgeAlpha(st, 2, 1000)).toBeCloseTo(a0, 6); // 回血那一帧仍是原 alpha
    expect(dyingEdgeAlpha(st, 2, 1000 + DYING_FADE_MS / 2)).toBeCloseTo(a0 / 2, 6);
    expect(dyingFading(st)).toBe(true);
    expect(dyingEdgeAlpha(st, 2, 1000 + DYING_FADE_MS)).toBe(0);
    expect(dyingFading(st)).toBe(false);
    expect(dyingEdgeAlpha(st, 3, 2000)).toBe(0);
  });
  it('从未 dying 时不画', () => {
    expect(dyingEdgeAlpha(newDyingEdge(), 4, 0)).toBe(0);
  });
  it('淡出中再掉到 ≤1 立刻恢复脉动', () => {
    const st = newDyingEdge();
    dyingEdgeAlpha(st, 1, 300);
    dyingEdgeAlpha(st, 2, 400);
    expect(dyingEdgeAlpha(st, 1, 450)).toBeCloseTo(dyingAlpha(450), 6);
  });
});
