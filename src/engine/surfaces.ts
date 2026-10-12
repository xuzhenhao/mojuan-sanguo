/**
 * 3 块 2D 离屏画布（engine-design §4.2）：bg（z0）、ambient（z1，半分辨率、30fps）、main（z2–z15）。
 */
import type { TextureBudget } from './memory';
import type { Canvas2DLike, Ctx2DLike } from './types';

export type SurfaceName = 'bg' | 'ambient' | 'main';

export interface Surface {
  name: SurfaceName;
  canvas: Canvas2DLike;
  ctx: Ctx2DLike;
  /** 相对屏幕分辨率的缩放（ambient 为 0.5） */
  scale: number;
  dirty: boolean;
}

export const SURFACE_ORDER: readonly SurfaceName[] = ['bg', 'ambient', 'main'];
const SCALE: Record<SurfaceName, number> = { bg: 1, ambient: 0.5, main: 1 };

export interface SurfaceOptions {
  /** 覆盖各层相对屏幕像素的缩放；半尺寸时 bg 为 1x 逻辑分辨率（render-spec §12.5 规则 3） */
  scale?: Partial<Record<SurfaceName, number>>;
}

export function createSurfaces(
  make: (w: number, h: number) => Canvas2DLike,
  pxW: number,
  pxH: number,
  budget?: TextureBudget,
  opt: SurfaceOptions = {},
): Record<SurfaceName, Surface> {
  const out = {} as Record<SurfaceName, Surface>;
  for (const name of SURFACE_ORDER) {
    const k = opt.scale?.[name] ?? SCALE[name];
    const w = Math.round(pxW * k);
    const h = Math.round(pxH * k);
    const canvas = make(w, h);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`无法创建 2D 离屏画布 ${name}`);
    budget?.track(`surface:${name}`, 'framebuffer', w, h);
    out[name] = { name, canvas, ctx, scale: k, dirty: true };
  }
  return out;
}
