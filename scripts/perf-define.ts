/**
 * 构建期把 config/budget.yaml 的 perf 段注入为 __PERF_BUDGET__（vite define），
 * 运行时不打包 yaml 解析器；阈值 / 开关 / 窗口只在 budget.yaml 改。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface PerfBudget {
  targetFps: number;
  lowEndFps: number;
  sampleMs: number;
  overlay: boolean;
  report: boolean;
  reportEveryMs: number;
}

export function readPerfBudget(root: string): PerfBudget {
  const doc = parse(readFileSync(resolve(root, 'config/budget.yaml'), 'utf8')) as { perf?: Partial<PerfBudget> };
  const p = doc?.perf ?? {};
  const num = (k: keyof PerfBudget) => {
    const v = p[k];
    if (typeof v !== 'number' || !(v > 0)) throw new Error(`budget.yaml perf.${k} 必须是正数`);
    return v;
  };
  return {
    targetFps: num('targetFps'),
    lowEndFps: num('lowEndFps'),
    sampleMs: num('sampleMs'),
    reportEveryMs: num('reportEveryMs'),
    overlay: p.overlay === true,
    report: p.report === true,
  };
}

export const perfDefine = (root: string) => JSON.stringify(readPerfBudget(root));
