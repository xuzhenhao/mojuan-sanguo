/** #183 资源与性能预算：阈值来自 config/budget.yaml；分类 / 首屏 / 立绘尺寸与字节 / 帧率 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDir, checkPortraits, globToRegExp, imageSize, loadBudget, parseSizeCheckArgs, validateBudget, type Budget } from '../scripts/size-check';
import { fpsReport } from '../scripts/fps-meter';

const tmp = () => mkdtempSync(join(tmpdir(), 'b183-'));
const png = (w: number, h: number, pad = 0) => {
  const b = Buffer.alloc(33 + pad);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const webpX = (w: number, h: number) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'ascii');
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};
const budget = (over: Partial<Budget> = {}): Budget => ({
  package: {
    h5: { hardBytes: 4 << 20, targetBytes: 2.5 * (1 << 20), overTarget: 'warn' },
    wechat: { hardBytes: 4 << 20, targetBytes: 2.5 * (1 << 20), overTarget: 'error' },
  },
  ...over,
});

describe('#183 budget.yaml', () => {
  it('仓库配置可加载且通过校验，含分类 / 首屏 / 立绘 / 帧率', () => {
    const b = loadBudget();
    expect(b.package.wechat.overTarget).toBe('error');
    expect(Object.keys(b.categories!.h5!)).toEqual(expect.arrayContaining(['script', 'font', 'image']));
    expect(b.firstScreen!.wechat!.files.length).toBeGreaterThan(0);
    expect(b.portraits!.map((r) => r.name)).toEqual(['small', 'large']);
    expect(b.perf!.lowEndFps).toBeLessThan(b.perf!.targetFps);
  });
  it('配错直接抛错（不静默放行）', () => {
    expect(() => validateBudget({} as Budget)).toThrow(/package\.h5/);
    expect(() => validateBudget(budget({ categories: { h5: { js: { match: '(' } } } }))).toThrow();
    expect(() => validateBudget(budget({ firstScreen: { h5: { files: [], maxBytes: 1 } } }))).toThrow(/files/);
  });
});

describe('#183 分类与首屏预算', () => {
  it('分类合计 / 单文件超限报错', () => {
    const d = tmp();
    writeFileSync(join(d, 'a.js'), Buffer.alloc(300));
    writeFileSync(join(d, 'b.js'), Buffer.alloc(300));
    writeFileSync(join(d, 'f.woff2'), Buffer.alloc(10));
    const b = budget({ categories: { h5: { script: { match: '\\.js$', maxBytes: 500, maxFileBytes: 250 }, font: { match: '\\.woff2$', maxBytes: 100 } } } });
    const r = checkDir(d, 'h5', b);
    expect(r.categories).toEqual({ script: 600, font: 10 });
    expect(r.errors.filter((e) => /script 单文件/.test(e))).toHaveLength(2);
    expect(r.errors.some((e) => /script 合计/.test(e))).toBe(true);
    expect(r.errors.some((e) => /font/.test(e))).toBe(false);
  });
  it('首屏按 glob 汇总，超限报错；缺文件仅提示', () => {
    const d = tmp();
    mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'index.html'), Buffer.alloc(100));
    writeFileSync(join(d, 'assets', 'index-abc.js'), Buffer.alloc(500));
    writeFileSync(join(d, 'assets', 'lazy-x.js'), Buffer.alloc(5000));
    const b = budget({ firstScreen: { h5: { files: ['index.html', 'assets/index-*.js', 'assets/none-*.css'], maxBytes: 550 } } });
    const r = checkDir(d, 'h5', b);
    expect(r.firstScreen).toBe(600);
    expect(r.errors[0]).toMatch(/首屏/);
    expect(r.notes[0]).toMatch(/未找到/);
    expect(r.warnings).toEqual([]);
  });
  it('glob：* 不跨目录', () => {
    expect(globToRegExp('assets/*.js').test('assets/a.js')).toBe(true);
    expect(globToRegExp('assets/*.js').test('assets/x/a.js')).toBe(false);
  });
  it('主包阈值由 overTarget 决定告警还是失败', () => {
    const d = tmp();
    writeFileSync(join(d, 'x.bin'), Buffer.alloc(2000));
    const b = budget();
    b.package.h5 = { hardBytes: 4000, targetBytes: 1000, overTarget: 'error' };
    expect(checkDir(d, 'h5', b).errors[0]).toMatch(/工程门槛/);
  });
  it('--portraits 参数', () => {
    expect(parseSizeCheckArgs(['--portraits', 'art/out']).portraits).toBe('art/out');
    expect(() => parseSizeCheckArgs(['--portraits'])).toThrow();
  });
});

describe('#183 立绘预算', () => {
  it('读 PNG / WebP(VP8X) 尺寸', () => {
    expect(imageSize(png(512, 712))).toEqual({ w: 512, h: 712 });
    expect(imageSize(webpX(256, 356))).toEqual({ w: 256, h: 356 });
    expect(imageSize(Buffer.from('nope'))).toBeNull();
  });
  it('小图规则先匹配；超像素 / 超字节报错', () => {
    const d = tmp();
    writeFileSync(join(d, 'zy.webp'), webpX(512, 712));
    writeFileSync(join(d, 'zy@s.webp'), webpX(300, 356));
    writeFileSync(join(d, 'big.webp'), Buffer.concat([webpX(512, 712), Buffer.alloc(200)]));
    const b = budget({
      portraits: [
        { name: 'small', match: '@s\\.webp$', maxWidth: 256, maxHeight: 356, maxBytes: 1000 },
        { name: 'large', match: '\\.webp$', maxWidth: 512, maxHeight: 712, maxBytes: 100 },
      ],
    });
    const r = checkPortraits(d, b);
    expect(r.checked).toBe(3);
    expect(r.errors).toHaveLength(2);
    expect(r.errors.some((e) => /small.*zy@s.*300×356/.test(e))).toBe(true);
    expect(r.errors.some((e) => /large.*big\.webp.*KB/.test(e))).toBe(true);
  });
});

describe('#183 帧率', () => {
  const perf = { targetFps: 60, lowEndFps: 30 };
  it('稳定 60fps → ok；平均掉帧 → below_target；1% low 低于低端线 → below_low_end', () => {
    expect(fpsReport(Array(120).fill(1000 / 60), perf).verdict).toBe('ok');
    expect(fpsReport(Array(120).fill(1000 / 45), perf).verdict).toBe('below_target');
    expect(fpsReport([...Array(99).fill(16), 100], perf).verdict).toBe('below_low_end');
    expect(fpsReport([], perf).frames).toBe(0);
  });
});
