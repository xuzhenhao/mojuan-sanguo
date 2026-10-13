/**
 * 减少动态（#202）：统一读 platform.prefersReducedMotion()。boot 启动时注入；未注入（单测）为 false。
 * game 层不得直接用 matchMedia（ESLint 守卫）。
 */
let source: (() => boolean) | null = null;
export function setReducedMotionSource(fn: (() => boolean) | null) {
  source = fn;
}
export function prefersReducedMotion(): boolean {
  return source?.() ?? false;
}
