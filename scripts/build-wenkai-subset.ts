/**
 * 霞鹜文楷子集（render-spec §2）：从源 TTF 生成 wenkai-core / wenkai-ext。
 * 字表：scripts/wenkai-chars-{core,ext,full}.txt；构建缺字直接报错。
 * 用法：npm run font:build（H5 woff2）；npm run font:build:wechat（#205：小游戏 ttf，字表自动收集，见 font-glyphs.ts）
 * 依赖：本机 pyftsubset（fonttools + brotli），源字体 art/src/fonts/LXGWWenKai.ttf
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { brushChars, checkCoverage, collectGlyphs, formatMissing, readCmap, writeReport } from './font-glyphs';
import { WECHAT_FONT_SRC, GLYPH_REPORT } from './build-wechat';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcTtf = resolve(root, 'art/src/fonts/LXGWWenKai.ttf');
const outDir = resolve(root, 'public/assets/fonts');
const pyft =
  process.env.PYFTSUBSET ||
  ['/workspace/.venv-font/bin/pyftsubset', 'pyftsubset'].find((p) => {
    if (p === 'pyftsubset') return true;
    return existsSync(p);
  })!;

function charsOf(name: 'core' | 'ext' | 'full'): string {
  return readFileSync(resolve(root, `scripts/wenkai-chars-${name}.txt`), 'utf8').replace(/\s+/g, '');
}

function assertInConfig(full: Set<string>) {
  const cfgPath = resolve(root, 'src/data/generated/config.json');
  if (!existsSync(cfgPath)) return;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
  const names = new Set<string>();
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string') return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // #107：首领登场台词 intro.line / intro.phaseLine 也用书法字体
      for (const k of ['name', 'shortName', 'title', 'line', 'phaseLine']) {
        if (typeof o[k] === 'string') for (const ch of o[k] as string) names.add(ch);
      }
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(cfg);
  const missing = [...names].filter((c) => !full.has(c) && /[\u4e00-\u9fff]/.test(c));
  if (missing.length) {
    console.error(`✘ config 中有 ${missing.length} 个汉字不在 wenkai-chars-full.txt：${missing.join('')}`);
    process.exit(1);
  }
}

function subset(label: string, textFile: string, out: string, flavor: 'woff2' | 'ttf' = 'woff2') {
  if (!existsSync(srcTtf)) {
    console.error(`✘ 缺少源字体 ${srcTtf.replace(root + '/', '')}（OFL，见 https://github.com/lxgw/LxgwWenKai）`);
    process.exit(1);
  }
  const r = spawnSync(
    pyft,
    [
      srcTtf,
      `--text-file=${textFile}`,
      ...(flavor === 'woff2' ? ['--flavor=woff2'] : []),
      `--output-file=${out}`,
      '--layout-features=*',
      '--no-hinting',
      '--desubroutinize',
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `pyftsubset failed for ${label}`);
    process.exit(r.status ?? 1);
  }
  const kb = (readFileSync(out).byteLength / 1024).toFixed(1);
  console.log(`→ ${out.replace(root + '/', '')}（${label}，${kb}KB）`);
}

/** #205：小游戏 ttf 子集。字表从配置 + UI 文案自动收集；源字体缺字时写报告并失败 */
function buildWechatTtf() {
  if (!existsSync(srcTtf)) {
    console.error(`✘ 缺少源字体 ${srcTtf.replace(root + '/', '')}`);
    process.exit(1);
  }
  const glyphs = collectGlyphs(root);
  const report = checkCoverage(glyphs, readCmap(readFileSync(srcTtf)), 'LXGWWenKai.ttf（源）');
  writeReport(resolve(root, GLYPH_REPORT), report);
  if (report.missing.length) {
    console.error(`✘ 源字体缺 ${report.missing.length} 个字形（报告 ${GLYPH_REPORT}）：\n${formatMissing(report)}`);
    process.exit(1);
  }
  const chars = brushChars(glyphs).join('');
  const charsFile = resolve(root, 'scripts/wenkai-chars-wechat.txt');
  writeFileSync(charsFile, chars + '\n');
  const out = resolve(root, WECHAT_FONT_SRC);
  mkdirSync(dirname(out), { recursive: true });
  subset('wechat', charsFile, out, 'ttf');
  console.log(`✔ 小游戏 ttf：${report.required} 字（系统符号 ${report.systemSymbols.length} 个不入子集）`);
}

// #205：--wechat 只出小游戏 ttf，不动 H5 woff2
if (process.argv.includes('--wechat')) {
  buildWechatTtf();
  process.exit(0);
}

const full = new Set(charsOf('full'));
const core = charsOf('core');
const ext = charsOf('ext');
if (core.length !== 256 || full.size !== 729 || ext.length !== 473) {
  console.error(`✘ 字表长度异常：core=${core.length} full=${full.size} ext=${ext.length}（期望 256/729/473）`);
  process.exit(1);
}
assertInConfig(full);
mkdirSync(outDir, { recursive: true });
// 缺字检查：把字表写入临时文件再 subset（pyftsubset 对缺失码点默认丢弃，这里用 fontTools 核对）
const check = spawnSync(
  pyft.includes('venv') ? resolve(dirname(pyft), 'python') : 'python3',
  [
    '-c',
    `
from fontTools.ttLib import TTFont
font=TTFont(${JSON.stringify(srcTtf)})
cmap=set()
for t in font['cmap'].tables: cmap.update(t.cmap)
need=set(ord(c) for c in ${JSON.stringify([...full].join(''))})
miss=sorted(c for c in need if c not in cmap)
if miss:
  print('MISSING', ''.join(chr(c) for c in miss))
  raise SystemExit(1)
print('glyph-ok', len(need))
`,
  ],
  { encoding: 'utf8' },
);
if (check.status !== 0) {
  console.error(check.stderr || check.stdout || 'glyph check failed');
  process.exit(check.status ?? 1);
}
console.log(check.stdout.trim());
subset('core', resolve(root, 'scripts/wenkai-chars-core.txt'), resolve(outDir, 'wenkai-core.woff2'));
subset('ext', resolve(root, 'scripts/wenkai-chars-ext.txt'), resolve(outDir, 'wenkai-ext.woff2'));
writeFileSync(
  resolve(outDir, 'wenkai-meta.json'),
  JSON.stringify(
    {
      family: 'Brush',
      face: 'LXGW WenKai',
      license: 'OFL-1.1',
      coreChars: core.length,
      extChars: ext.length,
      fullChars: full.size,
    },
    null,
    2,
  ) + '\n',
);
console.log('✔ 霞鹜文楷子集已生成');
