import { testNow } from './helpers';
/** #146 / render-spec §8.8.1：屏风格纹与月（几何、范围、图层顺序），以及 #139 合并后山影只画一遍 */
import { describe, expect, it } from 'vitest';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { drawScreenBg, LAT_ALPHA, LAT_COLOR, LAYERS, MOON_ALPHA, MOON_COLOR, screenLayout, type Layer } from '../src/game/scenes/battle/screen';

const SIZES = [
  [390, 844],
  [360, 640],
  [465, 780],
] as const;

describe('§8.8.1 格纹几何', () => {
  it('390×844：铺第 2–6 扇、y 44–388，单元 26', () => {
    const { lattice } = screenLayout(390, 844);
    expect(lattice.r).toEqual({ x: 65, y: 44, w: 325, h: 344 });
    expect(lattice.cell).toBe(26);
  });
  it('按内容框比例：x 16.7%–100%、y 5.2%–46.0%，单元随宽缩放', () => {
    for (const [w, h] of SIZES) {
      const { r, cell } = screenLayout(w, h).lattice;
      expect(r.x / w).toBeCloseTo(1 / 6, 2);
      expect(r.x + r.w).toBe(w);
      expect(Math.abs(r.y / h - 0.052)).toBeLessThan(0.002);
      expect(Math.abs((r.y + r.h) / h - 0.46)).toBeLessThan(0.002);
      expect(cell).toBeCloseTo((26 * w) / 390, 6);
    }
  });
  it('所有线段都在铺设范围内：第 1 扇、顶栏、判定区以下不铺', () => {
    for (const [w, h] of SIZES) {
      const { r, segs } = screenLayout(w, h).lattice;
      expect(segs.length).toBeGreaterThan(0);
      for (const s of segs)
        for (const [x, y] of [
          [s.x0, s.y0],
          [s.x1, s.y1],
        ]) {
          expect(x).toBeGreaterThanOrEqual(r.x);
          expect(x).toBeLessThanOrEqual(r.x + r.w + 1e-9);
          expect(y).toBeGreaterThanOrEqual(r.y);
          expect(y).toBeLessThanOrEqual(r.y + r.h + 1e-9);
        }
    }
  });
  it('回字格与内容框原点同相位（同 v3-spec 的 userSpaceOnUse pattern）：(52,44) 格的中线和内框', () => {
    const { segs } = screenLayout(390, 844).lattice;
    const has = (x0: number, y0: number, x1: number, y1: number) => segs.some((s) => s.x0 === x0 && s.y0 === y0 && s.x1 === x1 && s.y1 === y1);
    // 格 x 52–78、y 26–52：横中线 y39 在范围外，竖中线 x65 截成 y44–52；内框 (58,32)–(72,46) 只剩 x≥65、y≥44 部分
    expect(segs.some((s) => s.y0 === 39 || s.y1 === 39)).toBe(false);
    expect(has(65, 44, 65, 52)).toBe(true);
    expect(has(65, 46, 72, 46)).toBe(true);
    expect(has(72, 44, 72, 46)).toBe(true);
    // 完整格 x 78–104、y 52–78
    expect(has(78, 65, 104, 65)).toBe(true);
    expect(has(91, 52, 91, 78)).toBe(true);
    expect(has(84, 58, 98, 58)).toBe(true);
    expect(has(84, 72, 98, 72)).toBe(true);
    expect(has(84, 58, 84, 72)).toBe(true);
    expect(has(98, 58, 98, 72)).toBe(true);
  });
});

describe('§8.8.1 月几何', () => {
  it('390×844：圆心 (357.5,140)、r24，裁切为第 6 扇', () => {
    expect(screenLayout(390, 844).moon).toEqual({ cx: 357.5, cy: 140, r: 24, clip: { x: 325, y: 0, w: 65, h: 844 } });
  });
  it('各尺寸：圆心 ≈ (91.7%,16.6%)，r ≈ 6.2% 宽，圆在第 6 扇宽度内', () => {
    for (const [w, h] of SIZES) {
      const m = screenLayout(w, h).moon;
      expect(Math.abs(m.cx / w - 0.917)).toBeLessThan(0.002);
      expect(Math.abs(m.cy / h - 0.166)).toBeLessThan(0.002);
      expect(Math.abs(m.r / w - 0.062)).toBeLessThan(0.003);
      expect(m.clip.x).toBeCloseTo((w * 5) / 6, 6);
      expect(m.cx - m.r).toBeGreaterThan(m.clip.x);
      expect(m.cx + m.r).toBeLessThan(w);
    }
  });
});

type Rec = { k: string; a: unknown[]; alpha: number; style: unknown; lw?: number };
function ctxRec() {
  const calls: Rec[] = [];
  const grad = { addColorStop() {} };
  const c: Record<string, unknown> = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const rec =
    (k: string, style: () => unknown = () => c.fillStyle) =>
    (...a: unknown[]) =>
      calls.push({ k, a, alpha: c.globalAlpha as number, style: style(), lw: c.lineWidth as number });
  Object.assign(c, {
    setTransform() {},
    clearRect() {},
    drawImage() {},
    fillRect: rec('fillRect'),
    save: rec('save'),
    restore: rec('restore'),
    beginPath: rec('beginPath'),
    rect: rec('rect'),
    clip: rec('clip'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath() {},
    arc: rec('arc'),
    fill: rec('fill'),
    stroke: rec('stroke', () => c.strokeStyle),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
  });
  return { c, calls };
}

describe('§8.8.1 绘制', () => {
  it('图层顺序：漆面 → 山影 → 格纹 → 月 → 金线折痕 → 暗角 → 描边 → 纸纹', () => {
    const seen: Layer[] = [];
    const { c } = ctxRec();
    drawScreenBg(c as never, 390, 844, (l) => seen.push(l));
    expect(seen).toEqual([...LAYERS]);
    expect(LAYERS).toEqual(['lacquer', 'mountain', 'lattice', 'moon', 'crease', 'vignette', 'border', 'paper']);
  });
  it('调用序列：格纹 stroke 与月 arc 在山影 fill 之后、首条折痕之前，且各自 clip', () => {
    const { c, calls } = ctxRec();
    drawScreenBg(c as never, 390, 844);
    const iMount = calls.findIndex((x) => x.k === 'fill');
    const iStroke = calls.findIndex((x) => x.k === 'stroke' && x.style === LAT_COLOR);
    const iArc = calls.findIndex((x) => x.k === 'arc');
    const iCrease = calls.findIndex((x) => x.k === 'fillRect' && x.a[0] === 64 && x.a[2] === 1);
    expect(iMount).toBeGreaterThan(-1);
    expect(iMount).toBeLessThan(iStroke);
    expect(iStroke).toBeLessThan(iArc);
    expect(iArc).toBeLessThan(iCrease);
    // 格纹先 clip 到铺设范围
    const latClip = calls.findIndex((x) => x.k === 'rect' && x.a.join() === '65,44,325,344');
    expect(latClip).toBeGreaterThan(iMount);
    expect(latClip).toBeLessThan(iStroke);
    // 月先 clip 到第 6 扇
    const moonClip = calls.findIndex((x) => x.k === 'rect' && x.a.join() === '325,0,65,844');
    expect(moonClip).toBeGreaterThan(iStroke);
    expect(moonClip).toBeLessThan(iArc);
    // 描边（4 条 1px 边，GOLD_LO）在纸纹点之前：最后一次 fillRect 是 1×1 纸纹
    const last = calls.filter((x) => x.k === 'fillRect').at(-1)!;
    expect([last.a[2], last.a[3]]).toEqual([1, 1]);
    const firstBorder = calls.findIndex((x) => x.k === 'fillRect' && x.a.join() === '6,6,378,1');
    const firstDot = calls.findIndex((x, i) => i > iCrease && x.k === 'fillRect' && x.a[2] === 1 && x.a[3] === 1);
    expect(firstBorder).toBeLessThan(firstDot);
  });
  it('样式：格纹 #c9a55a 0.6px α.09；月 #e9c877 α.12 r24；save/restore 配平且 alpha 复原', () => {
    const { c, calls } = ctxRec();
    drawScreenBg(c as never, 390, 844);
    const st = calls.filter((x) => x.k === 'stroke' && x.style === LAT_COLOR);
    expect(st).toHaveLength(1);
    expect(st[0].alpha).toBeCloseTo(LAT_ALPHA, 6);
    expect(st[0].lw).toBe(0.6);
    const arc = calls.filter((x) => x.k === 'arc');
    expect(arc).toHaveLength(1);
    expect(arc[0].a.slice(0, 3)).toEqual([357.5, 140, 24]);
    const fillAfterArc = calls[calls.indexOf(arc[0]) + 1];
    expect(fillAfterArc.k).toBe('fill');
    expect(fillAfterArc.style).toBe(MOON_COLOR);
    expect(fillAfterArc.alpha).toBeCloseTo(MOON_ALPHA, 6);
    expect(calls.filter((x) => x.k === 'save').length).toBe(calls.filter((x) => x.k === 'restore').length);
    expect(c.globalAlpha).toBe(1);
  });
  it('格纹路径点全部在第 2–6 扇、y 44–388', () => {
    const { c, calls } = ctxRec();
    drawScreenBg(c as never, 390, 844);
    const iStroke = calls.findIndex((x) => x.k === 'stroke' && x.style === LAT_COLOR);
    const iLatBegin = calls.map((x) => x.k).lastIndexOf('beginPath', iStroke);
    const pts = calls.slice(iLatBegin, iStroke).filter((x) => x.k === 'moveTo' || x.k === 'lineTo');
    expect(pts.length).toBeGreaterThan(100);
    for (const p of pts) {
      const [x, y] = p.a as number[];
      expect(x).toBeGreaterThanOrEqual(65);
      expect(x).toBeLessThanOrEqual(390);
      expect(y).toBeGreaterThanOrEqual(44);
      expect(y).toBeLessThanOrEqual(388);
    }
  });
  it('不可动画：两次绘制调用序列一致', () => {
    const a = ctxRec();
    const b = ctxRec();
    drawScreenBg(a.c as never, 390, 844);
    drawScreenBg(b.c as never, 390, 844);
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });
});

describe('#139 × #130 合并：山影只画一遍', () => {
  it('BattleScene bg 层不再画 mountainRects 矩形，只有屏风的一次山影 fill', () => {
    const sc = new BattleScene({ now: testNow, debugDefaults: true });
    sc.enter({ width: 390, height: 844, invalidate() {} } as never, { seed: 7 });
    const { c, calls } = ctxRec();
    sc.draw('bg', { ctx: c } as never);
    const rects = sc.mountainRects();
    for (const r of rects) expect(calls.some((x) => x.k === 'fillRect' && x.a.join() === [r.x, r.y, r.w, r.h].join())).toBe(false);
    // 山影 fill 一次 + 月 fill 一次
    expect(calls.filter((x) => x.k === 'fill')).toHaveLength(2);
  });
});
