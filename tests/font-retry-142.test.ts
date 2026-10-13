import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_RETRY_AT_MS, loadBrushFonts, type FontDeps } from '../src/platform/web/brush-font';

/** results：每次 load() 依次返回的结果（true=成功） */
function deps(results: boolean[]) {
  let n = 0;
  const d: FontDeps = {
    create: () => ({ load: () => (results[n++] ? Promise.resolve('F') : Promise.reject(new Error('net'))) }),
    add: vi.fn(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    warn: vi.fn(),
  };
  return { d, calls: () => n };
}

describe('#142 字体加载失败后后台重试 2s/5s/10s', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('失败立即放行；第 2 次重试成功 → add + 重绘一次，之后不再重试', async () => {
    const { d, calls } = deps([false, false, true, true]);
    const redraw = vi.fn();
    const p = loadBrushFonts(d, { core: 'c' }, redraw, 60000);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(false); // 门控照常放行
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(2); // 2s
    expect(redraw).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls()).toBe(3); // 5s 成功
    expect(d.add).toHaveBeenCalledWith('F');
    expect(redraw).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls()).toBe(3);
  });
  it('三次都失败：共 1+3 次加载，失败与每次重试都告警', async () => {
    const { d, calls } = deps([false, false, false, false, true]);
    const redraw = vi.fn();
    void loadBrushFonts(d, { core: 'c' }, redraw, 60000);
    await vi.advanceTimersByTimeAsync(FONT_RETRY_AT_MS[2] + 1);
    expect(calls()).toBe(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls()).toBe(4);
    expect(redraw).not.toHaveBeenCalled();
    const msgs = (d.warn as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(msgs.filter((m) => m.includes('加载失败'))).toHaveLength(1);
    expect(msgs.filter((m) => /第 \d 次重试（/.test(m))).toHaveLength(3);
    expect(msgs.filter((m) => /重试失败/.test(m))).toHaveLength(3);
  });
  it('首次成功不重试', async () => {
    const { d, calls } = deps([true]);
    expect(await loadBrushFonts(d, { core: 'c' }, () => {}, 60000)).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls()).toBe(1);
  });
  it('entry 与调试页的告警只在 DEV 打印；entry 重绘走 invalidateAll', () => {
    for (const f of ['../src/platform/web/entry.ts', '../src/platform/web/debug/main.ts']) {
      const s = readFileSync(join(__dirname, f), 'utf8');
      expect(s).toMatch(/webFontDeps\(\(m, e\) => \{\s*if \(import\.meta\.env\.DEV\) console\.warn/);
    }
    expect(readFileSync(join(__dirname, '../src/platform/web/entry.ts'), 'utf8')).toMatch(/\(\) => engine\.invalidateAll\(\)/);
  });
});
