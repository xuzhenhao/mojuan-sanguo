/** 路由：把 FlowMachine 的页面变化映射到 SceneManager（带泼墨转场） */
import { INK_TRANSITION, type SceneManager, type Transition } from '../engine/scene';
import type { FlowEvent, FlowMachine, Page } from './flow';

export class Router {
  constructor(
    readonly flow: FlowMachine,
    private scenes: SceneManager,
    private transition: Transition = INK_TRANSITION,
  ) {
    for (const p of ['select', 'map', 'battle', 'reward', 'shop', 'result'] as Page[]) if (!scenes.has(p)) throw new Error(`缺少页面场景 ${p}`);
  }
  start(params?: unknown) {
    return this.scenes.go(this.flow.page, params, { durationMs: 0 });
  }
  send(e: FlowEvent, params?: unknown) {
    const before = this.flow.page;
    const page = this.flow.send(e);
    return page === before ? Promise.resolve() : this.scenes.go(page, params, this.transition);
  }
  /** 每帧调用：core 状态变化（如战斗结束）自动跳转 */
  sync() {
    const page = this.flow.sync();
    if (page) void this.scenes.go(page, undefined, this.transition);
  }
}
