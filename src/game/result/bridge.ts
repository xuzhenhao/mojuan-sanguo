/**
 * 结算页 / 续玩与其他页面的接入点（避免各页面互改文件）：
 * - 战斗页（P1a）或 run 模块在整局结束时设置 `outcome`（不设置时入口用 core Game 适配）。
 * - 点将 / run 模块（P2/P3）设置 `restart`：「再来一局」用同主副将、新 runSeed 建局。
 * - 续玩（P3/P1a）设置 `resume`：「继续本局」时按存档恢复到存档所在页。
 */
import type { RunOutcome } from './settlement';

export interface ResultBridge {
  outcome: RunOutcome | null;
  restart: ((p: { main: string; sub: string; seed: number; tianming: number }) => void) | null;
  resume: ((save: unknown) => void) | null;
}

export const resultBridge: ResultBridge = { outcome: null, restart: null, resume: null };
