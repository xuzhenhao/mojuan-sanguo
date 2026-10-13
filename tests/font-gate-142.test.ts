import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadBrushFonts, type FontDeps } from '../src/platform/web/brush-font';

function fake(loads: Record<string, Promise<unknown>>) {
  let timer: (() => void) | null = null;
  const created: string[][] = [];
  const deps: FontDeps = {
    create: (family, src) => {
      created.push([family, src]);
      const url = /url\(([^)]+)\)/.exec(src)![1];
      return { load: () => loads[url] };
    },
    add: vi.fn(),
    setTimeout: (fn) => (timer = fn),
    warn: vi.fn(),
  };
  return { deps, created, fire: () => timer?.() };
}

describe('#142 霞鹜文楷加载门控', () => {
  it('core 就绪才 resolve(true)，族名只用 Brush，随后加载 ext', async () => {
    const f = fake({ c: Promise.resolve('C'), e: Promise.resolve('E') });
    const onLoaded = vi.fn();
    expect(await loadBrushFonts(f.deps, { core: 'c', ext: 'e' }, onLoaded)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.created.map((x) => x[0])).toEqual(['Brush', 'Brush']);
    expect(f.deps.add).toHaveBeenCalledWith('C');
    expect(onLoaded).toHaveBeenCalled();
  });
  it('core 迟迟不到：超时后放行(false)，字体晚到仍 add + 重绘', async () => {
    let resolveCore!: (v: unknown) => void;
    const f = fake({ c: new Promise((r) => (resolveCore = r)) });
    const onLoaded = vi.fn();
    const p = loadBrushFonts(f.deps, { core: 'c' }, onLoaded, 10);
    f.fire();
    expect(await p).toBe(false);
    resolveCore('C');
    await new Promise((r) => setTimeout(r, 0));
    expect(f.deps.add).toHaveBeenCalledWith('C');
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });
  it('加载失败不 reject，只告警', async () => {
    const f = fake({ c: { then: (a: unknown, b: (e: unknown) => unknown) => Promise.reject(new Error('x')).then(a as never, b) } as Promise<unknown> });
    expect(await loadBrushFonts(f.deps, { core: 'c' })).toBe(false);
    expect(f.deps.warn).toHaveBeenCalled();
  });
  it('无 FontFace 环境直接放行', async () => {
    expect(await loadBrushFonts(null, { core: 'c' })).toBe(false);
  });
  it('entry 首帧挂在字体门控后；调试页也加载 Brush', () => {
    const entry = readFileSync(join(__dirname, '../src/platform/web/entry.ts'), 'utf8');
    expect(entry).toMatch(/engine\.holdFramesUntil\(fontsReady\)/);
    expect(entry).toMatch(/framesReleased\.then\(\(\) => engine\.start\(\)\)/);
    expect(entry).not.toMatch(/^engine\.start\(\);/m);
    const dbg = readFileSync(join(__dirname, '../src/platform/web/debug/main.ts'), 'utf8');
    expect(dbg).toMatch(/loadBrushFonts\(/);
    expect(dbg).toMatch(/wenkai-core\.woff2\?url/);
  });
});
