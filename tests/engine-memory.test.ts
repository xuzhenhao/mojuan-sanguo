import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { DEFAULT_CATEGORY_BUDGET, MB, TextureBudget, textureBytes, type BudgetWarning } from '../src/engine/memory';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { fakePlatform } from './engine-fakes';

describe('纹理内存记账', () => {
  it('类别分配合计 = 50MB', () => {
    const sum = Object.values(DEFAULT_CATEGORY_BUDGET).reduce((a, b) => a + b, 0);
    expect(sum).toBe(50 * MB);
    expect(DEFAULT_RENDER_CONFIG.textureBudgetBytes).toBe(50 * MB);
  });
  it('按 RGBA8 计算并支持释放', () => {
    const b = new TextureBudget();
    b.track('atlas:ui', 'ui', 2048, 1024);
    expect(b.used).toBe(textureBytes(2048, 1024));
    expect(b.usedBy('ui')).toBe(8 * MB);
    b.track('atlas:ui', 'ui', 1024, 1024); // 同 id 替换
    expect(b.used).toBe(4 * MB);
    expect(b.release('atlas:ui')).toBe(true);
    expect(b.used).toBe(0);
  });
  it('超出类别预算告警一次，回落后再越线再告警', () => {
    const w: BudgetWarning[] = [];
    const b = new TextureBudget(50 * MB, DEFAULT_CATEGORY_BUDGET, (x) => w.push(x));
    b.track('p1', 'portraits', 1024, 1024); // 4MB
    expect(w).toHaveLength(0);
    b.track('p2', 'portraits', 1024, 1024); // 8MB > 6MB
    expect(w).toEqual([expect.objectContaining({ kind: 'category', category: 'portraits', used: 8 * MB, limit: 6 * MB })]);
    b.track('p3', 'portraits', 16, 16);
    expect(w).toHaveLength(1);
    b.release('p2');
    b.track('p2', 'portraits', 1024, 1024);
    expect(w).toHaveLength(2);
  });
  it('超出总预算告警', () => {
    const w: BudgetWarning[] = [];
    const b = new TextureBudget(50 * MB, DEFAULT_CATEGORY_BUDGET, (x) => w.push(x));
    for (let i = 0; i < 13; i++) b.track(`big${i}`, 'reserve', 1024, 1024); // 52MB
    expect(b.isOverBudget()).toBe(true);
    expect(w.some((x) => x.kind === 'total')).toBe(true);
  });
  it('releaseCategory 释放整类（如离开选将页释放立绘）', () => {
    const b = new TextureBudget();
    b.track('a', 'portraits', 500, 540);
    b.track('b', 'portraits', 500, 540);
    b.track('c', 'ui', 10, 10);
    b.releaseCategory('portraits');
    expect(b.usedBy('portraits')).toBe(0);
    expect(b.used).toBe(400);
  });
  it('引擎启动后屏幕类在 dpr2 下约 16.3MiB，不超预算', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const e = new Engine(f.p);
    const screen = e.budget.usedBy('screen');
    expect(screen).toBe(780 * 1688 * 4 * 3 + 390 * 844 * 4);
    expect(screen).toBeLessThanOrEqual(DEFAULT_CATEGORY_BUDGET.screen);
    expect(e.warnings).toHaveLength(0);
  });
  it('引擎把超预算告警转给平台 warn', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const e = new Engine(f.p, {}, { ...DEFAULT_RENDER_CONFIG, textureBudgetBytes: 10 * MB });
    expect(e.warnings.some((w) => w.kind === 'total')).toBe(true);
    expect(f.warns.length).toBeGreaterThan(0);
  });
});
