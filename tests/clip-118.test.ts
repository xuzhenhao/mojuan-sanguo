import { fakeClock } from './helpers';
/** #118：引擎把场景绘制裁到内容框；战斗页金山影不出框 */
import { describe, expect, it } from 'vitest';
import { clipToContent } from '../src/engine/engine';
import { DESIGN_H, DESIGN_W } from '../src/engine/viewport';
import { OverlayStack } from '../src/engine/modal';
import { BattleScene } from '../src/game/scenes/battle/scene';

describe('#118 内容框裁剪', () => {
  it('clipToContent：save → rect(0,0,390,844) → clip；不支持裁剪的上下文返回 false', () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => calls.push('begin'),
      rect: (...a: number[]) => calls.push(`rect:${a.join(',')}`),
      clip: () => calls.push('clip'),
    };
    expect(clipToContent(ctx as never)).toBe(true);
    expect(calls).toEqual(['save', 'begin', `rect:0,0,${DESIGN_W},${DESIGN_H}`, 'clip']);
    expect(clipToContent({} as never)).toBe(false);
  });
  it('战斗页金山影全部在 0…W 内（修 x=-10…w+20 溢出）', () => {
    const sc = new BattleScene({
      now: fakeClock().now,
      overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }),
      debugDefaults: true,
    });
    sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    const rs = sc.mountainRects();
    expect(rs).toHaveLength(5);
    for (const r of rs) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(390);
    }
    expect(rs[0].x).toBe(0);
    expect(rs[4].x + rs[4].w).toBe(390);
  });
});
