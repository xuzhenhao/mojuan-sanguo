/**
 * 调试（仅 dev）：`?page=battle&lingQa=<case>` 进战斗后套用令槽定格，供 #231 UI 截图。
 * case: before | gain | overflow | tutorial | relic（虎符/提神剂回令 +N）
 */
import type { LingView } from './ling';
import { createLingTutorial, advanceTutorial, type LingTutorialState } from './ling-tutorial';
import { createLingFx, onLingDelta, type LingFx } from './ling';
import type { Rect } from '../../../engine/types';

export type LingQaCase = 'before' | 'gain' | 'overflow' | 'tutorial' | 'relic';

export function wantDebugLing(query: Record<string, string | undefined>, dev: boolean): LingQaCase | null {
  if (!dev || query.page !== 'battle' || !query.lingQa) return null;
  const v = query.lingQa;
  if (v === 'before' || v === 'gain' || v === 'overflow' || v === 'tutorial' || v === 'relic') return v;
  return null;
}

const CASES: Record<LingQaCase, Partial<LingView>> = {
  before: { current: 1, cap: 3, hardCap: 6, overflow: false, carryMax: 2, delta: 0, full: false, carryPreview: 0 },
  gain: { current: 3, cap: 3, hardCap: 6, overflow: false, carryMax: 2, delta: 2, full: false, carryPreview: 2 },
  overflow: { current: 4, cap: 3, hardCap: 6, overflow: true, carryMax: 2, delta: 1, full: false, carryPreview: 2 },
  tutorial: { current: 3, cap: 3, hardCap: 6, overflow: false, carryMax: 2, delta: 0, full: false, carryPreview: 0 },
  relic: { current: 4, cap: 3, hardCap: 6, overflow: true, carryMax: 2, delta: 1, full: false, carryPreview: 2 },
};

export function lingQaOverride(kind: LingQaCase): Partial<LingView> {
  return { ...CASES[kind] };
}

export function lingQaTutorial(kind: LingQaCase): LingTutorialState | null {
  if (kind !== 'tutorial') return null;
  return advanceTutorial(createLingTutorial()); // 步骤 2
}

/** 产令 / 虎符回令：飘字定格在 +N 可见中段 */
export function lingQaFx(kind: LingQaCase, tally: Rect, view: LingView, now: number): LingFx | null {
  if (kind !== 'gain' && kind !== 'relic') return null;
  const fx = createLingFx();
  const delta = CASES[kind].delta ?? 1;
  onLingDelta(fx, view, delta, tally, now, false);
  if (fx.float) fx.float.t0 = now - 120;
  return fx;
}
