/**
 * 发布包体检查（engine-design §4.6 / §4.10 / #206）：
 * - H5（dist/）：≤4MB 硬限，超过 2.5MB 目标时告警
 * - wechat（dist-wechat/）：>2.5MB 即失败（工程门槛 / CI）；4MB 仍为微信硬限
 * - 发布包不得包含 DOM 调试版（按入口标记校验）
 * 用法：
 *   tsx scripts/size-check.ts [dir=dist]
 *   tsx scripts/size-check.ts --target wechat [dir=dist-wechat]
 *   tsx scripts/size-check.ts --target h5 [dir=dist]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const HARD_LIMIT = 4 * 1024 * 1024;
export const TARGET = 2.5 * 1024 * 1024;
export const DEBUG_MARKER = '__MOJUAN_DEBUG_DOM__';

export type SizeTarget = 'h5' | 'wechat';

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function parseSizeCheckArgs(argv: string[]): { target: SizeTarget; dir: string } {
  let target: SizeTarget = 'h5';
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
    } else if (a.startsWith('-')) {
      throw new Error(`未知参数：${a}`);
    } else {
      positional.push(a);
    }
  }
  const dir = positional[0] ?? (target === 'wechat' ? 'dist-wechat' : 'dist');
  return { target, dir };
}

export function checkDir(dir: string, target: SizeTarget = 'h5') {
  const files = walk(dir);
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  const errors: string[] = [];
  const warnings: string[] = [];
  const mb = (total / 1048576).toFixed(2);
  if (target === 'wechat') {
    // #206：微信主包工程门槛 2.5MB 超则 CI 失败；4MB 为微信硬限
    if (total > HARD_LIMIT) errors.push(`微信主包 ${mb}MB 超过 4MB 硬限`);
    else if (total > TARGET) errors.push(`微信主包 ${mb}MB 超过 2.5MB 工程门槛`);
  } else {
    if (total > HARD_LIMIT) errors.push(`主包 ${mb}MB 超过 4MB 硬限`);
    else if (total > TARGET) warnings.push(`主包 ${mb}MB 超过 2.5MB 目标`);
  }
  for (const f of files) {
    if (!/\.(js|html|css)$/.test(f)) continue;
    const rel = relative(dir, f);
    if (/debug\.html$/.test(rel) || readFileSync(f, 'utf8').includes(DEBUG_MARKER)) errors.push(`发布包包含 DOM 调试版：${rel}`);
  }
  return { total, files: files.length, errors, warnings, target };
}

const isMain = process.argv[1] && /size-check\.ts$/.test(process.argv[1]);
if (isMain) {
  try {
    const { target, dir } = parseSizeCheckArgs(process.argv.slice(2));
    const r = checkDir(dir, target);
    console.log(`size-check --target ${target} ${dir}: ${r.files} 个文件，共 ${(r.total / 1024).toFixed(1)}KB`);
    r.warnings.forEach((w) => console.warn('⚠ ' + w));
    r.errors.forEach((e) => console.error('✗ ' + e));
    if (r.errors.length) process.exit(1);
  } catch (e) {
    console.error('✗ ' + (e as Error).message);
    process.exit(1);
  }
}
