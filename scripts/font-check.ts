/**
 * 书法收字 CI 校验（#182）：不需要 pyftsubset / 源字体，只读入库文件。
 * 1. font-report/charset.txt 与当前收字（config 全部字符串含 config/text 文本表 + src 字面量）一致；
 * 2. 微信 ttf 子集（rules.fonts.platforms.wechat）覆盖全部所需字形；
 * 3. 文本表 key 引用：src 里 t('ns.key') 的 key 必须存在于 config/text。
 * 任一不满足即退出码 1。H5 woff2 子集（scripts/wenkai-chars-full.txt）缺字只告警（woff2 无法在 CI 重建，缺字回退系统字体）。
 * 用法：npm run font:check
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CHARSET_FILE, brushChars, charsetText, checkCoverage, collectGlyphs, diffCharset, formatMissing, readCmap } from './font-glyphs';
import { wechatFontPackageUrls, wechatFontSource } from './build-wechat';

export interface FontCheckResult {
  errors: string[];
  warnings: string[];
}

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

/** 收集 src 中 t('ns.key') / t("ns.key") 的 key */
export function textKeysUsed(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\bt\(\s*['"]([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)['"]/g;
  for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.ts') && !f.includes('/generated/'))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(re)) if (!out.has(m[1])) out.set(m[1], relative(root, f));
  }
  return out;
}

export function textKeysDefined(root: string): Set<string> {
  const dir = join(root, 'config/text');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of walk(dir).filter((f) => f.endsWith('.yaml'))) {
    const d = parse(readFileSync(f, 'utf8')) as { id: string; strings: Record<string, string> };
    for (const k of Object.keys(d?.strings ?? {})) out.add(`${d.id}.${k}`);
  }
  return out;
}

export function fontCheck(root: string): FontCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const glyphs = collectGlyphs(root);

  const manifest = join(root, CHARSET_FILE);
  const drift = diffCharset(existsSync(manifest) ? readFileSync(manifest, 'utf8') : '', charsetText(glyphs));
  if (drift) errors.push(drift);

  for (const url of wechatFontPackageUrls(root)) {
    const src = wechatFontSource(url);
    if (!existsSync(join(root, src))) {
      errors.push(`缺少微信字体 ${src}（跑 npm run font:build:wechat 生成并提交）`);
      continue;
    }
    const r = checkCoverage(glyphs, readCmap(readFileSync(join(root, src))), src);
    if (r.missing.length) errors.push(`${src} 缺 ${r.missing.length} 个字形（跑 npm run font:build:wechat）：\n${formatMissing(r)}`);
  }

  const defined = textKeysDefined(root);
  for (const [k, f] of textKeysUsed(root)) if (!defined.has(k)) errors.push(`文本表缺 key：${k}（${f}），请在 config/text/ 补上`);

  const fullFile = join(root, 'scripts/wenkai-chars-full.txt');
  if (existsSync(fullFile)) {
    const full = new Set(readFileSync(fullFile, 'utf8').replace(/\s+/g, ''));
    const miss = brushChars(glyphs).filter((c) => /[\u4e00-\u9fff]/.test(c) && !full.has(c));
    if (miss.length) warnings.push(`H5 woff2 子集缺 ${miss.length} 个汉字（回退系统字体；需源字体跑 npm run font:build）：${miss.join('')}`);
  }
  return { errors, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, warnings } = fontCheck(root);
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`✘ ${e}`);
    process.exit(1);
  }
  console.log('✔ font:check 通过：字表同步、微信字体无缺字、文本表 key 齐全');
}
