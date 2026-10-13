import { describe, expect, it } from 'vitest';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { DYING_EDGE_COLOR, DYING_FADE_MS, DYING_STATIC_ALPHA, dyingAlpha, dyingEdgeAlpha, dyingFading, newDyingEdge } from '../src/game/scenes/battle/hpview';

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

describe('#141 prefers-reduced-motion：常亮 .75 不脉动', () => {
  it('任何时刻 alpha 都是 .75', () => {
    const st = newDyingEdge();
    const xs = [0, 150, 300, 600, 900].map((t) => dyingEdgeAlpha(st, 1, t, true));
    expect(new Set(xs)).toEqual(new Set([DYING_STATIC_ALPHA]));
  });
  it('场景：reducedMotion 时主将红边 alpha 固定 .75，且不为脉动持续重绘', () => {
    let now = 0;
    const sc = new BattleScene({ debugDefaults: true, now: () => now, reducedMotion: () => true });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    sc.g.p.hp = 1;
    const as: number[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '' as unknown,
      font: '',
      setTransform() {},
      clearRect() {},
      drawImage() {},
      fillText() {},
      measureText: (s: string) => ({ width: s.length * 10 }),
      fillRect() {
        if (this.fillStyle === DYING_EDGE_COLOR) as.push(this.globalAlpha);
      },
    };
    for (const t of [0, 300, 700]) {
      now = t;
      sc.drawHeroes(ctx as never);
    }
    expect(as.length).toBe(12);
    for (const a of as) expect(a).toBeCloseTo(DYING_STATIC_ALPHA, 6);
  });
});
