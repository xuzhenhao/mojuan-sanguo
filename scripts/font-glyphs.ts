/**
 * 书法字体收字（M2 W6 #205）：自动从 config/**\/*.yaml 的全部字符串值 + src/**\/*.ts 的字符串/模板字面量
 * （TypeScript AST，不含注释与 console.* 参数；排除 src/data/generated 与 H5 调试版 src/platform/web/debug）收集字形，外加可打印 ASCII。
 * 不维护手写字表：新增 shortName、提示文案等改了配置/代码即自动入表。
 * 项目只有一款书法字体 "Brush"（p4-kit 的 SERIF/SANS 都指向它），所以只检查这一款。
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { parse } from 'yaml';

export type GlyphSources = Map<string, string[]>;
const MAX_SOURCES = 5;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function add(out: GlyphSources, text: string, src: string) {
  for (const ch of text) {
    if (/\s/.test(ch) || ch.codePointAt(0)! < 0x21) continue;
    const list = out.get(ch) ?? [];
    if (list.length < MAX_SOURCES && !list.includes(src)) list.push(src);
    out.set(ch, list);
  }
}

export function collectFromYaml(out: GlyphSources, text: string, file: string) {
  const visit = (v: unknown, key: string) => {
    if (typeof v === 'string') add(out, v, `${file}#${key}`);
    else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${key}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, key ? `${key}.${k}` : k);
  };
  visit(parse(text), '');
}

export function collectFromTs(out: GlyphSources, text: string, file: string) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node) => {
    // console.* 的参数是日志，不上屏，不收
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'console'
    )
      return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      add(out, n.text, `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

export function collectGlyphs(root: string): GlyphSources {
  const out: GlyphSources = new Map();
  for (let c = 0x21; c <= 0x7e; c++) out.set(String.fromCharCode(c), ['ascii']);
  for (const f of walk(join(root, 'config')).filter((f) => /\.ya?ml$/.test(f) && !f.includes('/schema/'))) {
    collectFromYaml(out, readFileSync(f, 'utf8'), relative(root, f));
  }
  for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
    const rel = relative(root, f);
    if (rel.startsWith('src/data/generated/') || rel.startsWith('src/platform/web/debug/')) continue;
    collectFromTs(out, readFileSync(f, 'utf8'), rel);
  }
  return out;
}

/** 图标类符号（箭头、杂项符号/丁巴特、emoji、变体选择符）由系统字体绘制，不要求书法字体覆盖 */
export function isSystemSymbol(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (
    (c >= 0x2190 && c <= 0x21ff) ||
    (c >= 0x2300 && c <= 0x23ff) ||
    (c >= 0x25a0 && c <= 0x27bf) ||
    (c >= 0x2b00 && c <= 0x2bff) ||
    c >= 0x1f000 ||
    (c >= 0xfe00 && c <= 0xfe0f) ||
    c === 0x200d
  );
}

/** 字体子集要包含的字形（排除系统符号），按码点排序 */
export function brushChars(glyphs: GlyphSources): string[] {
  return [...glyphs.keys()].filter((c) => !isSystemSymbol(c)).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
}

/** 读 TTF/OTF 的 cmap（format 4 / 12），返回支持的码点集合 */
export function readCmap(buf: Uint8Array): Set<number> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(buf[r], buf[r + 1], buf[r + 2], buf[r + 3]) === 'cmap') cmap = dv.getUint32(r + 8);
  }
  if (cmap < 0) throw new Error('字体没有 cmap 表');
  const out = new Set<number>();
  const n = dv.getUint16(cmap + 2);
  for (let i = 0; i < n; i++) {
    const off = cmap + dv.getUint32(cmap + 4 + i * 8 + 4);
    const fmt = dv.getUint16(off);
    if (fmt === 4) {
      const segX2 = dv.getUint16(off + 6);
      const ends = off + 14,
        starts = ends + segX2 + 2,
        deltas = starts + segX2,
        ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = dv.getUint16(ends + s),
          start = dv.getUint16(starts + s),
          delta = dv.getUint16(deltas + s),
          ro = dv.getUint16(ranges + s);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const gid = ro === 0 ? (c + delta) & 0xffff : dv.getUint16(ranges + s + ro + (c - start) * 2);
          if (gid !== 0) out.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = dv.getUint32(off + 12);
      for (let g = 0; g < groups; g++) {
        const p = off + 16 + g * 12;
        const start = dv.getUint32(p),
          end = dv.getUint32(p + 4);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

export interface MissingGlyph {
  char: string;
  code: string;
  sources: string[];
}
export interface GlyphReport {
  font: string;
  collected: number;
  required: number;
  missing: MissingGlyph[];
  systemSymbols: MissingGlyph[];
}

const entry = (ch: string, glyphs: GlyphSources): MissingGlyph => ({
  char: ch,
  code: 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'),
  sources: glyphs.get(ch) ?? [],
});

export function checkCoverage(glyphs: GlyphSources, cmap: Set<number>, font: string): GlyphReport {
  const required = brushChars(glyphs);
  return {
    font,
    collected: glyphs.size,
    required: required.length,
    missing: required.filter((c) => !cmap.has(c.codePointAt(0)!)).map((c) => entry(c, glyphs)),
    systemSymbols: [...glyphs.keys()].filter(isSystemSymbol).map((c) => entry(c, glyphs)),
  };
}

export function writeReport(path: string, report: GlyphReport) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}

export function formatMissing(report: GlyphReport): string {
  return report.missing.map((m) => `${m.char} ${m.code} ← ${m.sources.join(', ')}`).join('\n');
}

/** 入库字表清单：font:build:wechat 生成，CI 每次重新收字与之比对 */
export const CHARSET_FILE = 'font-report/charset.txt';

export function charsetText(glyphs: GlyphSources): string {
  return brushChars(glyphs).join('') + '\n';
}

/** 比对清单与当前收字结果；返回 null 表示一致，否则返回给人看的说明 */
export function diffCharset(manifest: string, current: string): string | null {
  const a = new Set([...manifest.replace(/\s+/g, '')]);
  const b = new Set([...current.replace(/\s+/g, '')]);
  const added = [...b].filter((c) => !a.has(c));
  const removed = [...a].filter((c) => !b.has(c));
  if (!added.length && !removed.length) return null;
  return `${CHARSET_FILE} 与当前配置/文案收字不一致（新增 ${added.length}：${added.join('')}；移除 ${removed.length}：${removed.join('')}）。请运行 npm run font:build:wechat 重新生成 ttf 与字表并提交`;
}
