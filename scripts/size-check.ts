/**
 * 发布包体检查（engine-design §4.6 / §4.10）：
 * - 主包（dist/）≤4MB 硬限，超过 2.5MB 目标时告警
 * - 发布包不得包含 DOM 调试版（按入口标记校验）
 * 用法：tsx scripts/size-check.ts [dir=dist]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const HARD_LIMIT = 4 * 1024 * 1024;
export const TARGET = 2.5 * 1024 * 1024;
export const DEBUG_MARKER = '__MOJUAN_DEBUG_DOM__';

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function checkDir(dir: string) {
  const files = walk(dir);
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (total > HARD_LIMIT) errors.push(`主包 ${(total / 1048576).toFixed(2)}MB 超过 4MB 硬限`);
  else if (total > TARGET) warnings.push(`主包 ${(total / 1048576).toFixed(2)}MB 超过 2.5MB 目标`);
  for (const f of files) {
    if (!/\.(js|html|css)$/.test(f)) continue;
    const rel = relative(dir, f);
    if (/debug\.html$/.test(rel) || readFileSync(f, 'utf8').includes(DEBUG_MARKER)) errors.push(`发布包包含 DOM 调试版：${rel}`);
  }
  return { total, files: files.length, errors, warnings };
}

const isMain = process.argv[1] && /size-check\.ts$/.test(process.argv[1]);
if (isMain) {
  const dir = process.argv[2] ?? 'dist';
  const r = checkDir(dir);
  console.log(`size-check ${dir}: ${r.files} 个文件，共 ${(r.total / 1024).toFixed(1)}KB`);
  r.warnings.forEach((w) => console.warn('⚠ ' + w));
  r.errors.forEach((e) => console.error('✗ ' + e));
  if (r.errors.length) process.exit(1);
}
