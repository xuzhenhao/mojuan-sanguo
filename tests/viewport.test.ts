import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import type { GestureEvent } from '../src/engine/input';
import { computeViewport, DESIGN_H, DESIGN_W, layerTransform, toDesign, toScreen } from '../src/engine/viewport';
import type { Rect } from '../src/engine/types';
import type { SystemInfo } from '../src/platform/types';
import { fakePlatform } from './engine-fakes';

/** 验收尺寸（render-spec §4.0 / #111） */
const SIZES: [number, number][] = [
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [465, 900],
  [768, 1024],
];
/** 关键热区（设计坐标）：点将第 4 列卡、右上计数、底栏右侧按钮 */
const HOTSPOTS: Record<string, Rect> = {
  col4: { x: 296, y: 440, w: 80, h: 110 },
  topRight: { x: 330, y: 10, w: 50, h: 26 },
  bottomBtn: { x: 315, y: 844 - 72 + 7, w: 65, h: 40 },
};
const info = (w: number, h: number, safe?: Rect): SystemInfo => ({
  width: w,
  height: h,
  dpr: 2,
  safeArea: safe ?? { x: 0, y: 0, w, h },
  capsule: null,
  platform: 'web',
});

describe('视口等比缩放（#111）', () => {
  it.each(SIZES)('%i×%i：s = min(W/390, H/844)，设计框完整落在视口内并居中', (W, H) => {
    const vp = computeViewport(W, H);
    expect(vp.s).toBeCloseTo(Math.min(W / 390, H / 844));
    const tl = toScreen(vp, { x: 0, y: 0 });
    const br = toScreen(vp, { x: DESIGN_W, y: DESIGN_H });
    expect(tl.x).toBeGreaterThanOrEqual(-1e-9);
    expect(tl.y).toBeGreaterThanOrEqual(-1e-9);
    expect(br.x).toBeLessThanOrEqual(W + 1e-9);
    expect(br.y).toBeLessThanOrEqual(H + 1e-9);
    expect(tl.x).toBeCloseTo(W - br.x);
    expect(tl.y).toBeCloseTo(H - br.y);
    // 至少一边贴满
    expect(Math.min(Math.abs(br.x - tl.x - W), Math.abs(br.y - tl.y - H))).toBeCloseTo(0);
  });

  it('360×640：s=640/844，左右居中', () => {
    const vp = computeViewport(360, 640);
    expect(vp.s).toBeCloseTo(640 / 844);
    expect(vp.offsetY).toBeCloseTo(0);
    expect(vp.offsetX).toBeCloseTo((360 - 390 * vp.s) / 2);
  });
  it('465×900：s=min(465/390, 900/844)=900/844', () => {
    const vp = computeViewport(465, 900);
    expect(vp.s).toBeCloseTo(900 / 844);
    expect(vp.offsetX).toBeCloseTo((465 - 390 * vp.s) / 2);
  });

  it.each(SIZES)('%i×%i：变换与反变换互逆，热区四角对得上', (W, H) => {
    const vp = computeViewport(W, H);
    for (const r of Object.values(HOTSPOTS)) {
      for (const p of [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
      ]) {
        const back = toDesign(vp, toScreen(vp, p));
        expect(back.x).toBeCloseTo(p.x);
        expect(back.y).toBeCloseTo(p.y);
      }
    }
  });

  it('安全区：扣除 safe-area 后在安全区内居中', () => {
    const vp = computeViewport(390, 844, { x: 0, y: 44, w: 390, h: 844 - 44 - 34 });
    expect(vp.s).toBeCloseTo(766 / 844);
    expect(vp.offsetY).toBeCloseTo(44);
    expect(vp.offsetX).toBeCloseTo((390 - 390 * vp.s) / 2);
  });

  it('层绘制矩阵 = dpr·s，平移 = dpr·offset', () => {
    const vp = computeViewport(465, 900);
    expect(layerTransform(vp, 2)).toEqual([2 * vp.s, 0, 0, 2 * vp.s, 2 * vp.offsetX, 2 * vp.offsetY]);
  });
});

describe('Engine 接入视口（#111）', () => {
  const tapAt = (f: ReturnType<typeof fakePlatform>, x: number, y: number) => {
    f.touch().start([{ id: 1, x, y }]);
    f.setNow(50);
    f.touch().end([{ id: 1, x, y }]);
  };

  it.each(SIZES)('%i×%i：场景尺寸恒为 390×844，画布像素 = W·dpr × H·dpr，触摸反变换命中热区', (W, H) => {
    const f = fakePlatform({ info: () => info(W, H) });
    const got: GestureEvent[] = [];
    const e = new Engine(f.p, { gesture: (g) => got.push(g) });
    expect([e.width, e.height]).toEqual([390, 844]);
    expect([f.screen.width, f.screen.height]).toEqual([W * 2, H * 2]);
    for (const [name, r] of Object.entries(HOTSPOTS)) {
      got.length = 0;
      f.setNow(0);
      const c = toScreen(e.viewport, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
      tapAt(f, c.x, c.y);
      const tap = got.find((g) => g.type === 'tap');
      expect(tap, name).toBeTruthy();
      const at = (tap as { at: { x: number; y: number } }).at;
      expect(at.x).toBeCloseTo(r.x + r.w / 2);
      expect(at.y).toBeCloseTo(r.y + r.h / 2);
      expect(at.x > r.x && at.x < r.x + r.w && at.y > r.y && at.y < r.y + r.h).toBe(true);
    }
  });

  it('resize / 横竖屏切换：重算视口并重设画布、整屏重绘', () => {
    let size: [number, number] = [360, 640];
    const f = fakePlatform({ info: () => info(...size) });
    const e = new Engine(f.p, { backdrop: () => {} });
    f.flush(0);
    size = [900, 465];
    f.resize();
    expect(e.viewport.s).toBeCloseTo(465 / 844);
    expect([f.screen.width, f.screen.height]).toEqual([1800, 930]);
    expect(Object.values(e.surfaces).every((s) => s.dirty)).toBe(true);
    expect(e.surfaces.main.canvas.width).toBe(1800);
    // 横屏：设计框左右居中，两侧由底纹铺满
    expect(e.viewport.offsetX).toBeCloseTo((900 - 390 * e.viewport.s) / 2);
  });

  it('底纹层用真实 W×H 绘制，场景绘制带缩放平移', () => {
    const f = fakePlatform({ info: () => info(465, 900) });
    const bd: number[][] = [];
    const e = new Engine(f.p, { backdrop: (_c, w, h) => bd.push([w, h]) });
    e.frame(16);
    expect(bd).toEqual([[465, 900]]);
  });
});
