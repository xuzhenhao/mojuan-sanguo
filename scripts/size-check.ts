/**
 * 发布包体检查（engine-design §4.6 / §4.10 / #206）：
 * - H5（dist/）：≤4MB 硬限，超过 2.5MB 目标时告警
 * - wechat（dist-wechat/）：>2.5MB 即失败（工程门槛 / CI）；4MB 仍为微信硬限
 * - 发布包不得包含 DOM 调试版（按入口标记校验）
 * 用法：
 *   tsx scripts/size-check.ts [dir=dist]
 *   tsx scripts/size-check.ts --target wechat [dir=dist-wechat]
 *   tsx scripts/size-check.ts --target h5 [dir=dist]
 *   tsx scripts/size-check.ts --portraits art/out   （立绘尺寸 / 字节预算，#183）
 * 阈值全部来自 config/budget.yaml（#183）：主包、分类（脚本 / 样式 / 字体 / 图片）、首屏、立绘、帧率。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export interface CategoryBudget {
  match: string;
  maxBytes?: number;
  maxFileBytes?: number;
}
export interface PortraitRule {
  name: string;
  match: string;
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
}
export interface Budget {
  package: Record<SizeTarget, { hardBytes: number; targetBytes: number; overTarget: 'warn' | 'error' }>;
  categories?: Partial<Record<SizeTarget, Record<string, CategoryBudget>>>;
  firstScreen?: Partial<Record<SizeTarget, { files: string[]; maxBytes: number }>>;
  portraits?: PortraitRule[];
  perf?: { targetFps: number; lowEndFps: number; sampleMs?: number };
}

export const BUDGET_FILE = fileURLToPath(new URL('../config/budget.yaml', import.meta.url));

/** 读取并校验预算配置；缺字段 / 类型不对直接抛错（预算配错不能静默放行） */
export function loadBudget(file = BUDGET_FILE): Budget {
  const b = parse(readFileSync(file, 'utf8')) as Budget;
  validateBudget(b);
  return b;
}
export function validateBudget(b: Budget) {
  const num = (v: unknown, at: string) => {
    if (typeof v !== 'number' || !(v > 0)) throw new Error(`budget.yaml ${at} 须为正数`);
  };
  for (const t of ['h5', 'wechat'] as const) {
    const p = b?.package?.[t];
    if (!p) throw new Error(`budget.yaml 缺 package.${t}`);
    num(p.hardBytes, `package.${t}.hardBytes`);
    num(p.targetBytes, `package.${t}.targetBytes`);
    if (p.overTarget !== 'warn' && p.overTarget !== 'error') throw new Error(`budget.yaml package.${t}.overTarget 须为 warn|error`);
    for (const [k, c] of Object.entries(b.categories?.[t] ?? {})) {
      if (typeof c.match !== 'string') throw new Error(`budget.yaml categories.${t}.${k}.match 缺失`);
      new RegExp(c.match);
      if (c.maxBytes !== undefined) num(c.maxBytes, `categories.${t}.${k}.maxBytes`);
      if (c.maxFileBytes !== undefined) num(c.maxFileBytes, `categories.${t}.${k}.maxFileBytes`);
    }
    const fs = b.firstScreen?.[t];
    if (fs) {
      if (!Array.isArray(fs.files) || !fs.files.length) throw new Error(`budget.yaml firstScreen.${t}.files 须为非空数组`);
      num(fs.maxBytes, `firstScreen.${t}.maxBytes`);
    }
  }
  for (const r of b.portraits ?? []) {
    if (!r.name || typeof r.match !== 'string') throw new Error('budget.yaml portraits[] 须有 name / match');
    new RegExp(r.match);
  }
  if (b.perf) {
    num(b.perf.targetFps, 'perf.targetFps');
    num(b.perf.lowEndFps, 'perf.lowEndFps');
  }
}

const BUDGET = loadBudget();
/** 兼容旧导出（= budget.yaml package.h5） */
export const HARD_LIMIT = BUDGET.package.h5.hardBytes;
export const TARGET = BUDGET.package.h5.targetBytes;
export const DEBUG_MARKER = '__MOJUAN_DEBUG_DOM__';

export type SizeTarget = 'h5' | 'wechat';

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function parseSizeCheckArgs(argv: string[]): { target: SizeTarget; dir: string; portraits?: string } {
  let target: SizeTarget = 'h5';
  let portraits: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--target') {
      const v = argv[++i];
      if (v !== 'h5' && v !== 'wechat') throw new Error(`--target 须为 h5|wechat，收到：${v ?? '(空)'}`);
      target = v;
    } else if (a.startsWith('--target=')) {
      const v = a.slice('--target='.length);
      if (v !== 'h5' && v !== 'wechat') throw new Error(`--target 须为 h5|wechat，收到：${v}`);
      target = v;
    } else if (a === '--portraits') {
      portraits = argv[++i];
      if (!portraits) throw new Error('--portraits 须跟目录');
    } else if (a.startsWith('-')) {
      throw new Error(`未知参数：${a}`);
    } else {
      positional.push(a);
    }
  }
  const dir = positional[0] ?? (target === 'wechat' ? 'dist-wechat' : 'dist');
  return portraits ? { target, dir, portraits } : { target, dir };
}

const fmtMB = (n: number) => `${+(n / 1048576).toFixed(2)}MB`;
const fmtKB = (n: number) => `${(n / 1024).toFixed(1)}KB`;
const posix = (p: string) => p.split(sep).join('/');

/** 简单 glob：* 匹配除 / 外任意串，? 匹配单字符 */
export function globToRegExp(g: string): RegExp {
  return new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]') +
      '$',
  );
}

export function checkDir(dir: string, target: SizeTarget = 'h5', budget: Budget = BUDGET) {
  const files = walk(dir);
  const sizes = new Map(files.map((f) => [posix(relative(dir, f)), statSync(f).size]));
  const total = [...sizes.values()].reduce((n, v) => n + v, 0);
  const errors: string[] = [];
  const warnings: string[] = [];
  /** 提示（不影响结果）：如首屏文件未找到 */
  const notes: string[] = [];
  const pkg = budget.package[target];
  const mb = (total / 1048576).toFixed(2);
  const label = target === 'wechat' ? '微信主包' : '主包';
  if (total > pkg.hardBytes) errors.push(`${label} ${mb}MB 超过 ${fmtMB(pkg.hardBytes)} 硬限`);
  else if (total > pkg.targetBytes) {
    // #206：微信超工程门槛即失败；H5 仅告警（均由 budget.yaml overTarget 决定）
    if (pkg.overTarget === 'error') errors.push(`${label} ${mb}MB 超过 ${fmtMB(pkg.targetBytes)} 工程门槛`);
    else warnings.push(`${label} ${mb}MB 超过 ${fmtMB(pkg.targetBytes)} 目标`);
  }
  // 分类预算（#183）
  const categories: Record<string, number> = {};
  for (const [name, c] of Object.entries(budget.categories?.[target] ?? {})) {
    const re = new RegExp(c.match, 'i');
    let sum = 0;
    for (const [rel, n] of sizes) {
      if (!re.test(rel)) continue;
      sum += n;
      if (c.maxFileBytes && n > c.maxFileBytes) errors.push(`${name} 单文件 ${rel} ${fmtKB(n)} 超过 ${fmtKB(c.maxFileBytes)} 预算`);
    }
    categories[name] = sum;
    if (c.maxBytes && sum > c.maxBytes) errors.push(`${name} 合计 ${fmtKB(sum)} 超过 ${fmtKB(c.maxBytes)} 预算`);
  }
  // 首屏预算（#183）
  let firstScreen: number | null = null;
  const fs = budget.firstScreen?.[target];
  if (fs) {
    firstScreen = 0;
    for (const g of fs.files) {
      const re = globToRegExp(g);
      const hit = [...sizes].filter(([rel]) => re.test(rel));
      if (!hit.length) notes.push(`首屏文件未找到：${g}`);
      for (const [, n] of hit) firstScreen += n;
    }
    if (firstScreen > fs.maxBytes) errors.push(`首屏 ${fmtKB(firstScreen)} 超过 ${fmtKB(fs.maxBytes)} 预算`);
  }
  for (const f of files) {
    if (!/\.(js|html|css)$/.test(f)) continue;
    const rel = relative(dir, f);
    if (/debug\.html$/.test(rel) || readFileSync(f, 'utf8').includes(DEBUG_MARKER)) errors.push(`发布包包含 DOM 调试版：${rel}`);
  }
  return { total, files: files.length, errors, warnings, notes, target, categories, firstScreen };
}

/** 读图片像素尺寸（PNG / WebP VP8 VP8L VP8X / JPEG）；不识别返回 null */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const m = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** 立绘预算（#183）：按 budget.yaml portraits 规则（首条命中）校验像素与字节 */
export function checkPortraits(dir: string, budget: Budget = BUDGET) {
  const rules = (budget.portraits ?? []).map((r) => ({ ...r, re: new RegExp(r.match, 'i') }));
  const errors: string[] = [];
  let checked = 0;
  for (const f of walk(dir)) {
    const rel = posix(relative(dir, f));
    const r = rules.find((x) => x.re.test(rel));
    if (!r) continue;
    checked++;
    const buf = readFileSync(f);
    if (r.maxBytes && buf.length > r.maxBytes) errors.push(`立绘(${r.name}) ${rel} ${fmtKB(buf.length)} 超过 ${fmtKB(r.maxBytes)}`);
    if (r.maxWidth || r.maxHeight) {
      const sz = imageSize(buf);
      if (!sz) errors.push(`立绘(${r.name}) ${rel} 无法读取尺寸`);
      else if ((r.maxWidth && sz.w > r.maxWidth) || (r.maxHeight && sz.h > r.maxHeight))
        errors.push(`立绘(${r.name}) ${rel} ${sz.w}×${sz.h} 超过 ${r.maxWidth ?? '∞'}×${r.maxHeight ?? '∞'}`);
    }
  }
  return { checked, errors };
}

const isMain = process.argv[1] && /size-check\.ts$/.test(process.argv[1]);
if (isMain) {
  try {
    const { target, dir, portraits } = parseSizeCheckArgs(process.argv.slice(2));
    if (portraits) {
      const p = checkPortraits(portraits);
      console.log(`size-check --portraits ${portraits}: 校验 ${p.checked} 张`);
      p.errors.forEach((e) => console.error('✗ ' + e));
      process.exit(p.errors.length ? 1 : 0);
    }
    const r = checkDir(dir, target);
    console.log(`size-check --target ${target} ${dir}: ${r.files} 个文件，共 ${(r.total / 1024).toFixed(1)}KB`);
    for (const [k, n] of Object.entries(r.categories)) console.log(`  ${k}: ${fmtKB(n)}`);
    if (r.firstScreen !== null) console.log(`  首屏: ${fmtKB(r.firstScreen)}`);
    r.notes.forEach((w) => console.log('ℹ ' + w));
    r.warnings.forEach((w) => console.warn('⚠ ' + w));
    r.errors.forEach((e) => console.error('✗ ' + e));
    if (r.errors.length) process.exit(1);
  } catch (e) {
    console.error('✗ ' + (e as Error).message);
    process.exit(1);
  }
}
