import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDir, DEBUG_MARKER } from '../scripts/size-check';
import { freeOncePerRunAds, parseQuery } from '../src/platform/web/platform';

describe('size-check', () => {
  it('通过：小包且无调试版', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-'));
    writeFileSync(join(d, 'index.js'), 'console.log(1)');
    expect(checkDir(d).errors).toEqual([]);
  });
  it('发布包含 DOM 调试版时报错', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-'));
    writeFileSync(join(d, 'a.js'), `x="${DEBUG_MARKER}"`);
    expect(checkDir(d).errors[0]).toMatch(/调试版/);
  });
  it('超过 4MB 报错', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-'));
    writeFileSync(join(d, 'big.bin'), Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(checkDir(d).errors[0]).toMatch(/4MB/);
  });
});

describe('web 平台小工具', () => {
  it('解析 query', () => {
    expect(parseQuery('?webgl=0&seed=7')).toEqual({ webgl: '0', seed: '7' });
  });
  it('H5 看广告刷新：每局免费 1 次', async () => {
    const ads = freeOncePerRunAds();
    expect(await ads.rewarded('refresh')).toBe('completed');
    expect(await ads.rewarded('refresh')).toBe('unavailable');
    ads.resetRun();
    expect(await ads.rewarded('refresh')).toBe('completed');
  });
});
