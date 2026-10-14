/** #257 wechat 触摸逻辑像素换算 + 点将详情关闭 */
import { describe, expect, it } from 'vitest';
import { touchToPoint } from '../src/platform/wechat';
import { toDesign, computeViewport } from '../src/engine/viewport';
import { OverlayStack } from '../src/engine/modal';
import { SelectScene, detailCloseRect } from '../src/game/select/scene';
import { gridCell } from '../src/game/select/layout';

const win = { windowWidth: 390, windowHeight: 844, pixelRatio: 3 };
const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

describe('#257 wechat touchToPoint', () => {
  it('逻辑像素原样返回', () => {
    expect(touchToPoint({ identifier: 1, clientX: 100, clientY: 200 }, win)).toEqual({ id: 1, x: 100, y: 200 });
  });
  it('物理像素（超出窗口）按 dpr 折回逻辑像素，再经 toDesign 可命中', () => {
    // 物理：设计点 (100,400) × dpr3 = (300, 1200)；窗口逻辑 390×844
    const pt = touchToPoint({ identifier: 2, clientX: 300, clientY: 1200 }, win);
    expect(pt).toEqual({ id: 2, x: 100, y: 400 });
    const vp = computeViewport(390, 844);
    expect(toDesign(vp, pt)).toEqual({ x: 100, y: 400 });
  });
  it('clientX 缺失时回退 x/pageX', () => {
    expect(touchToPoint({ identifier: 3, x: 50, y: 60 }, win)).toEqual({ id: 3, x: 50, y: 60 });
    expect(touchToPoint({ identifier: 4, pageX: 70, pageY: 80 }, win)).toEqual({ id: 4, x: 70, y: 80 });
  });
});

describe('#257 触摸换算后关闭详情', () => {
  it('物理像素点外部 / 关闭按钮 → 设计坐标命中并关闭', () => {
    const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const sc = new SelectScene({ overlays, onStart() {} });
    sc.enter({ width: 390, height: 844, invalidate() {} });
    sc.gesture({ type: 'longpress', at: center(gridCell(0)) });
    expect(overlays.size).toBe(1);
    const vp = computeViewport(390, 844);
    // 外部点 (2,840) 的物理像素
    const physOutside = touchToPoint({ identifier: 1, clientX: 2 * 3, clientY: 840 * 3 }, win);
    const design = toDesign(vp, physOutside);
    expect(overlays.gesture({ type: 'tap', at: design })).toBe(true);
    expect(overlays.size).toBe(0);

    sc.gesture({ type: 'longpress', at: center(gridCell(0)) });
    const btn = detailCloseRect(overlays.top()!.rect!);
    const physBtn = touchToPoint({ identifier: 2, clientX: (btn.x + btn.w / 2) * 3, clientY: (btn.y + btn.h / 2) * 3 }, win);
    expect(overlays.gesture({ type: 'tap', at: toDesign(vp, physBtn) })).toBe(true);
    expect(overlays.size).toBe(0);
  });
});
