/**
 * 弹层栈（engine-design §4.13）：弹窗、长按详情、响应窗口等共用一套 API。
 * - 输入先交给栈顶；`modal: true` 的层吞掉下层输入。
 * - `dismissOnTapOutside`：点外部关闭（详情浮层）；响应窗口不允许点外部关闭。
 * - `pausesScene`：打开时暂停当前场景（例如设置面板），关闭后恢复。
 * - 绘制在 main 层，按栈从下到上（逻辑 z 10–15 的容器）。
 */
import type { GestureEvent } from './input';
import type { Surface } from './surfaces';
import type { Rect } from './types';

export type OverlayKind = 'popup' | 'detail' | 'response' | 'toast' | 'system';

export interface OverlaySpec<R = unknown> {
  id: string;
  kind: OverlayKind;
  /** 是否吞掉下层输入（默认：toast 否，其余是） */
  modal?: boolean;
  dismissOnTapOutside?: boolean;
  pausesScene?: boolean;
  /** 命中区域（逻辑像素），用于“点外部”判断 */
  rect?: Rect;
  draw(s: Surface, dt: number): void;
  /** 返回 true 表示已处理 */
  gesture?(e: GestureEvent, h: OverlayHandle<R>): boolean;
  /** 是否需要持续出帧（倒计时、弹出动画）；true 时引擎每帧重绘 main 层 */
  animating?(): boolean;
}

export interface OverlayHandle<R = unknown> {
  readonly id: string;
  close(result?: R): void;
  readonly result: Promise<R | undefined>;
}

/** 逻辑层 z（render-spec §7.1）：遮罩 10、响应 UI 12、详情 14、系统 15 */
export const OVERLAY_Z: Record<OverlayKind, number> = { response: 12, popup: 14, detail: 14, toast: 15, system: 15 };

interface Entry {
  spec: OverlaySpec;
  handle: OverlayHandle;
  resolve: (r: unknown) => void;
  seq: number;
}

export class OverlayStack {
  private items: Entry[] = [];
  private seq = 0;
  constructor(private hooks: { invalidate(): void; pauseScene(): void; resumeScene(): void }) {}

  get size() {
    return this.items.length;
  }
  ids() {
    return this.ordered().map((e) => e.spec.id);
  }
  top(): OverlaySpec | null {
    const o = this.ordered();
    return o.length ? o[o.length - 1].spec : null;
  }
  /** 按 z 再按打开顺序排序 */
  private ordered() {
    return [...this.items].sort((a, b) => OVERLAY_Z[a.spec.kind] - OVERLAY_Z[b.spec.kind] || a.seq - b.seq);
  }

  push<R>(spec: OverlaySpec<R>): OverlayHandle<R> {
    let resolve!: (r: R | undefined) => void;
    const result = new Promise<R | undefined>((r) => (resolve = r));
    const handle: OverlayHandle<R> = { id: spec.id, result, close: (r?: R) => this.close(handle as OverlayHandle, r) };
    this.items.push({ spec: spec as OverlaySpec, handle: handle as OverlayHandle, resolve: resolve as (r: unknown) => void, seq: ++this.seq });
    if (spec.pausesScene && this.items.filter((e) => e.spec.pausesScene).length === 1) this.hooks.pauseScene();
    this.hooks.invalidate();
    return handle;
  }

  private close(h: OverlayHandle, r?: unknown) {
    const i = this.items.findIndex((e) => e.handle === h);
    if (i < 0) return;
    const [e] = this.items.splice(i, 1);
    if (e.spec.pausesScene && !this.items.some((x) => x.spec.pausesScene)) this.hooks.resumeScene();
    e.resolve(r);
    this.hooks.invalidate();
  }
  /** 关闭某类全部（例如离开场景时关闭详情） */
  closeAll(kind?: OverlayKind) {
    for (const e of [...this.items]) if (!kind || e.spec.kind === kind) e.handle.close();
  }

  /** 返回 true 表示输入被弹层消费，不再传给场景 */
  gesture(e: GestureEvent): boolean {
    const list = this.ordered().reverse();
    for (const it of list) {
      const s = it.spec;
      if (s.gesture?.(e, it.handle)) return true;
      if (e.type === 'tap' && s.dismissOnTapOutside && s.rect && !inside(s.rect, e.at)) {
        it.handle.close();
        return true;
      }
      const modal = s.modal ?? s.kind !== 'toast';
      if (modal) return true;
    }
    return false;
  }

  /** 是否有弹层需要持续出帧 */
  animating() {
    return this.items.some((e) => !!e.spec.animating?.());
  }

  draw(s: Surface, dt: number) {
    for (const it of this.ordered()) it.spec.draw(s, dt);
  }
}

function inside(r: Rect, p: { x: number; y: number }) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
