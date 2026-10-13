import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDir, DEBUG_MARKER, parseSizeCheckArgs, TARGET } from '../scripts/size-check';
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
  it('H5：超过 4MB 报错，超过 2.5MB 仅告警', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-'));
    writeFileSync(join(d, 'big.bin'), Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(checkDir(d, 'h5').errors[0]).toMatch(/4MB/);
    const mid = mkdtempSync(join(tmpdir(), 'sz-'));
    writeFileSync(join(mid, 'mid.bin'), Buffer.alloc(TARGET + 1));
    const r = checkDir(mid, 'h5');
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/2\.5MB/);
  });
  it('#206 wechat：超过 2.5MB 即失败（非告警）', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-wx-'));
    writeFileSync(join(d, 'game.js'), 'wx.createCanvas()');
    writeFileSync(join(d, 'fat.bin'), Buffer.alloc(TARGET + 1));
    const r = checkDir(d, 'wechat');
    expect(r.errors[0]).toMatch(/2\.5MB.*工程门槛/);
    expect(r.warnings).toEqual([]);
  });
  it('#206 wechat：超过 4MB 报硬限', () => {
    const d = mkdtempSync(join(tmpdir(), 'sz-wx4-'));
    writeFileSync(join(d, 'fat.bin'), Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(checkDir(d, 'wechat').errors[0]).toMatch(/4MB 硬限/);
  });
  it('parseSizeCheckArgs：--target 与默认目录', () => {
    expect(parseSizeCheckArgs([])).toEqual({ target: 'h5', dir: 'dist' });
    expect(parseSizeCheckArgs(['--target', 'wechat'])).toEqual({ target: 'wechat', dir: 'dist-wechat' });
    expect(parseSizeCheckArgs(['--target=wechat', 'out'])).toEqual({ target: 'wechat', dir: 'out' });
    expect(parseSizeCheckArgs(['my-dist'])).toEqual({ target: 'h5', dir: 'my-dist' });
    expect(() => parseSizeCheckArgs(['--target', 'ios'])).toThrow(/h5\|wechat/);
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
