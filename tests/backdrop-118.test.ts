/** #118 方案 C：底纹压暗 + 内容框暗角写死（无 ?bd 参数） */
import { describe, expect, it } from 'vitest';
import { paintPaperBackdrop } from '../src/platform/web/platform';
import type { Ctx2DLike } from '../src/engine/types';

function rec() {
  const stops: string[] = [];
  const rects: number[][] = [];
  const ctx = {
    fillStyle: '' as unknown,
    createLinearGradient: () => ({ addColorStop: (_o: number, c: string) => stops.push(c) }),
    fillRect: (...a: number[]) => rects.push(a),
  };
  return { ctx: ctx as unknown as Ctx2DLike, stops, rects };
}

describe('#118 底纹方案 C', () => {
  it('压暗底色 + 宽屏两侧暗角', () => {
    const r = rec();
    paintPaperBackdrop(r.ctx, 1280, 844);
    expect(r.stops.slice(0, 2)).toEqual(['#3D2923', '#2C1E19']);
    expect(r.stops).toContain('rgba(0,0,0,.35)');
    expect(r.stops).not.toContain('#EFE3C6');
  });
  it('窄屏（无左右边距）不画左右暗角', () => {
    const r = rec();
    paintPaperBackdrop(r.ctx, 390, 844);
    expect(r.stops.filter((c) => c === 'rgba(0,0,0,.35)')).toHaveLength(0);
  });
  it('源码不再读 ?bd 参数', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/platform/web/platform.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/get\('bd'\)|\bbd=/);
  });
});
