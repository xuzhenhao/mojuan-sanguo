/** P4 场景测试替身 */
import { seeded } from '../src/core/rng';
import { OverlayStack } from '../src/engine/modal';
import type { SceneContext } from '../src/engine/scene';
import type { Surface } from '../src/engine/surfaces';
import { makeTestInventory, type TestInvOpts } from './test-inventory';
import { fakeCanvas } from './engine-fakes';

export const surface = (): Surface => {
  const c = fakeCanvas(390, 844);
  return { name: 'main', canvas: c, ctx: c.ctx2d, scale: 1, dirty: true };
};
export const tap = (x: number, y: number) => ({ type: 'tap' as const, at: { x, y } });
export const longpress = (x: number, y: number) => ({ type: 'longpress' as const, at: { x, y } });
export const center = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
export const flush = () => new Promise((r) => setTimeout(r, 0));

export function p4env(o: TestInvOpts = {}) {
  const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
  const inv = makeTestInventory(o);
  const rng = seeded(o.seed ?? 7);
  let done = 0;
  const ctx: SceneContext = { invalidate() {}, width: 390, height: 844 };
  return {
    ctx,
    inv,
    overlays,
    get done() {
      return done;
    },
    env: {
      overlays,
      safe: () => ({ x: 0, y: 0, w: 390, h: 844 }),
      measure: () => surface().ctx,
      inventory: () => inv,
      rng: () => rng,
      done: () => void done++,
    },
  };
}

/** 点弹层里的按钮：按弹层 rect 与按钮相对位置无法通用，测试直接用 handle 关闭 */
export const drawAll = (o: OverlayStack) => o.draw(surface(), 16);

/** 点确认浮层（p4-kit confirm）的确定 / 取消 */
export function answerConfirm(o: OverlayStack, ok: boolean) {
  const r = o.top()!.rect!;
  o.gesture(tap(ok ? r.x + r.w - 80 : r.x + 80, r.y + r.h - 42));
}
