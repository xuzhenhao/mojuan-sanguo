/**
 * 战斗页峰值内存口径（render-spec §12.5）：烘焙缓存与文字缓存的典型占用。
 * 用于测试与 engine-design §4.7.1 的复算，运行时不依赖。
 */
import type { BakeClass } from './memory';

/** 战斗页典型烘焙项（逻辑尺寸 dp × 数量），按 bakeScale 换算像素 */
export const BATTLE_BAKE_PLAN: { cls: BakeClass; wDp: number; hDp: number; count: number }[] = [
  { cls: 'hand', wDp: 72, hDp: 100, count: 12 },
  { cls: 'bigcard', wDp: 180, hDp: 250, count: 1 },
  { cls: 'enemy', wDp: 120, hDp: 120, count: 3 },
  { cls: 'general', wDp: 100, hDp: 140, count: 2 },
  { cls: 'badge', wDp: 24, hDp: 24, count: 40 },
];
/** 文字缓存（R8/RGBA8 混合）上限 */
export const TEXT_CACHE_BYTES = 0.5 * 1024 * 1024;
/** WebGL 叠加层 7 个 shader 的压缩贴图（engine-design §4.12） */
export const GL_FX_BYTES = 0.63 * 1024 * 1024;
