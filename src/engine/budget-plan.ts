/**
 * 战斗页内存口径（render-spec §12.2 / §12.5，UI 对齐 #63）：烘焙缓存与文字缓存。
 * - 典型组合（BATTLE_BAKE_TYPICAL）：只用于稳态展示。
 * - 满载口径（BATTLE_BAKE_FULL）：预算判定 / 峰值用。各 LRU 上限打满（render-spec §12.2，手牌上限改 10），
 *   覆盖手牌 10（PRD 硬上限）、敌人 5（前排 3 + 后排 2）等满编情形。
 * 用于测试与 engine-design §4.7.1 的复算，运行时不依赖。
 */
import type { BakeClass } from './memory';

export type BakePlan = { cls: BakeClass; wDp: number; hDp: number; count: number }[];

/** 典型组合：手牌 7、大牌 1、敌人 5、武将 2、徽章 40（稳态展示） */
export const BATTLE_BAKE_TYPICAL: BakePlan = [
  { cls: 'hand', wDp: 72, hDp: 104, count: 7 },
  { cls: 'bigcard', wDp: 104, hDp: 150, count: 1 },
  { cls: 'enemy', wDp: 96, hDp: 132, count: 5 },
  { cls: 'general', wDp: 138, hDp: 188, count: 1 },
  { cls: 'general', wDp: 76, hDp: 104, count: 1 },
  { cls: 'badge', wDp: 24, hDp: 24, count: 40 },
];

/**
 * 满载口径：LRU 上限全部打满（render-spec §12.2 战斗峰值 = 手牌 10 + 敌人 6 + 武将 2 套 + 徽章 40 + 详情 1 ≈ 2.64MB，原手牌 12 时 2.77）。
 * 手牌 10 = LRU 上限 = PRD 手牌硬上限；敌人 6 是 LRU 上限（≥ 满编 5）。
 */
export const BATTLE_BAKE_FULL: BakePlan = [
  { cls: 'hand', wDp: 72, hDp: 104, count: 10 },
  { cls: 'enemy', wDp: 96, hDp: 132, count: 6 },
  { cls: 'general', wDp: 138, hDp: 188, count: 2 },
  { cls: 'general', wDp: 76, hDp: 104, count: 2 },
  { cls: 'badge', wDp: 24, hDp: 24, count: 40 },
  { cls: 'detail', wDp: 180, hDp: 200, count: 1 },
];

/** @deprecated 兼容旧名，等同典型组合 */
export const BATTLE_BAKE_PLAN = BATTLE_BAKE_TYPICAL;
/** 文字缓存（R8/RGBA8 混合）上限 */
export const TEXT_CACHE_BYTES = 0.5 * 1024 * 1024;
/** WebGL 叠加层 7 个 shader 的压缩贴图（engine-design §4.12） */
export const GL_FX_BYTES = 0.63 * 1024 * 1024;
