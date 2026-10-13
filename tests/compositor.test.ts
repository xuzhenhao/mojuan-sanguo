import { describe, expect, it } from 'vitest';
import { Canvas2DCompositor, WebGLOverlay } from '../src/engine/compositor';
import { SURFACE_ORDER, type Surface, type SurfaceName } from '../src/engine/surfaces';
import { fakeCanvas } from './engine-fakes';

function surfaces(dirty: boolean) {
  const out = {} as Record<SurfaceName, Surface>;
  for (const name of SURFACE_ORDER) {
    const canvas = fakeCanvas(10, 10);
    out[name] = { name, canvas, ctx: canvas.ctx2d, scale: 1, dirty };
  }
  return out;
}

describe('Canvas2DCompositor', () => {
  it('拿不到 2D 上下文时抛错', () => {
    const c = fakeCanvas();
    c.getContext = (() => null) as typeof c.getContext;
    expect(() => new Canvas2DCompositor(c)).toThrow();
  });
  it('全部不脏时不合成；force 时强制合成', () => {
    const t = fakeCanvas(100, 50);
    const comp = new Canvas2DCompositor(t);
    expect(comp.compose(surfaces(false))).toBe(false);
    expect(comp.composites).toBe(0);
    expect(comp.compose(surfaces(false), true)).toBe(true);
    expect(comp.composites).toBe(1);
  });
  it('任一层脏：按 bg → ambient → main 顺序整屏绘制，并清除脏标记', () => {
    const t = fakeCanvas(100, 50);
    const comp = new Canvas2DCompositor(t);
    const s = surfaces(false);
    s.ambient.dirty = true;
    expect(comp.compose(s)).toBe(true);
    expect(t.ctx2d.draws).toEqual(SURFACE_ORDER.map((n) => s[n].canvas));
    expect(t.calls.slice(0, 2)).toEqual(['setTransform', 'clearRect']);
    expect(SURFACE_ORDER.every((n) => !s[n].dirty)).toBe(true);
    expect(comp.compose(s)).toBe(false);
  });
});

describe('WebGLOverlay', () => {
  it('WebGL 不可用时抛错（调用方回退纯 2D）', () => {
    expect(() => new WebGLOverlay(fakeCanvas(1, 1))).toThrow();
  });
  it('frame 清屏计数；lost 后不再出帧', () => {
    const c = fakeCanvas(1, 1, { webgl: true });
    const o = new WebGLOverlay(c);
    o.frame([]);
    expect(o.frames).toBe(1);
    expect(c.calls).toContain('gl.clear');
    o.lost = true;
    o.frame([]);
    expect(o.frames).toBe(1);
  });
  it('needsFrame 只在有特效时为真', () => {
    expect(WebGLOverlay.needsFrame([])).toBe(false);
    expect(WebGLOverlay.needsFrame([{ id: 'ink_bloom', progress: 0 }])).toBe(true);
  });
});
