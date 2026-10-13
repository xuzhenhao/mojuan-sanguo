/**
 * 放弃本局（#108，subpages-v05 §4.3）：结算口径与战斗失败完全一致——同一个 RunOutcome（win:false），
 * 同一套将魂公式（失败 ×0.5、天命加成照常），不另加惩罚；正常进结算页（败北），不跳过。
 * 这里只负责：生成失败结局 + 埋点（run_abandon 入口/层数，run_end 按失败结算）。
 * 存档删除与局外入账仍在离开结算页时做（flow.md §1：结算页展示前进程被杀，下次仍弹续玩）。
 */
import { track as defaultTrack } from '../telemetry';
import { outcomeFromSave } from './adapter';
import { computeSoul, type RunOutcome } from './settlement';
import type { ResumeSummary } from './store';

/** 1 = 启动续玩弹层，2 = 暂停/设置浮层 */
export type AbandonEntry = 1 | 2;

export function abandonRun(
  s: ResumeSummary,
  raw: unknown,
  now: number,
  entry: AbandonEntry,
  track: (ev: string, data: Record<string, unknown>) => void = defaultTrack,
): RunOutcome {
  const o = outcomeFromSave(s, raw, now);
  track('run_abandon', { entry, layer: s.layer, chapter: s.chapter });
  track('run_end', { result: 'defeat', abandoned: true, chapter: o.chapter, layer: o.layer, soul: computeSoul(o).total, runSeed: o.runSeed });
  return o;
}

/** 继续本局读档失败（损坏 / 新版本存档）：提示后回点将页，不留空白页 */
export function resumeFailure(reason: string): { text: string; clearSave: boolean } {
  if (reason === 'newer') return { text: '存档来自更新的版本，暂时无法继续本局', clearSave: false };
  if (reason === 'empty') return { text: '没有找到存档，请重新点将出征', clearSave: false };
  return { text: '存档已损坏，请重新点将出征', clearSave: true };
}
