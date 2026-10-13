/**
 * 复活后的敌方表现（PRD 4.4.1 引 flow.md 第 142 行，#106）：
 * - 被取消的敌方出牌化墨淡出 300ms；
 * - 意图栏交叉淡入为闪意图 250ms；
 * - prefers-reduced-motion 时立即切换（无过渡）。
 */
import type { EnemyAct } from '../../../core/types';
import { prefersReducedMotion as readReducedMotion } from '../../motion';

export const REVIVE_INK_MS = 300;
export const REVIVE_INTENT_MS = 250;

export interface ReviveFx {
  start: number;
  /** 敌人 uid → 复活前的意图（交叉淡出用） */
  prev: Map<number, { acts: EnemyAct[]; dmg: number }>;
  /** 本敌方回合被取消出牌的敌人 uid（化墨） */
  cancelled: Set<number>;
}

/** 过渡进度 0..1；减少动态时恒为 1（立即切换） */
export function fxProgress(elapsed: number, dur: number, reduced: boolean): number {
  if (reduced || dur <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / dur));
}

/** 某敌人在 t 时刻的绘制参数：旧意图 alpha / 化墨程度、新意图 alpha */
export function reviveFxFrame(fx: ReviveFx, uid: number, now: number, reduced: boolean) {
  const el = now - fx.start;
  const intent = fxProgress(el, REVIVE_INTENT_MS, reduced);
  const cancelled = fx.cancelled.has(uid);
  const ink = cancelled ? fxProgress(el, REVIVE_INK_MS, reduced) : 1;
  return {
    newAlpha: intent,
    /** 被取消：随化墨 300ms 淡出；否则随交叉淡入 250ms 淡出 */
    oldAlpha: cancelled ? 1 - ink : 1 - intent,
    ink: cancelled ? ink : 0,
  };
}

export function reviveFxDone(fx: ReviveFx, now: number, reduced: boolean) {
  return reduced || now - fx.start >= Math.max(REVIVE_INK_MS, REVIVE_INTENT_MS);
}

/** 浏览器 prefers-reduced-motion；非浏览器环境视为否 */
export function prefersReducedMotion(): boolean {
  return readReducedMotion();
}
