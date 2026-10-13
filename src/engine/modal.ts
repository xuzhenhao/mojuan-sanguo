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

/** 弹层变暗遮罩：由引擎按真实视口 W×H 全屏绘制（render-spec §4.0，#111），场景不感知真实尺寸 */
export interface Scrim {
  color: string;
  /** 额外透明度（0–1，乘在 color 之上），默认 1 */
  alpha?: number;
  /**
   * 径向遮罩（#105 灵光一闪）：圆心按视口比例 (cx, cy)，半径按视口对角线比例 r；
   * 色标 [offset 0–1, color]，半径外保持最后一个色标。给了 radial 时 color 只作无渐变环境的回退底色。
   */
  radial?: { cx: number; cy: number; r: number; stops: [number, string][] };
}
/** 引擎提供的全屏遮罩绘制：在画弹层面板之前调用 */
export type ScrimPainter = (s: Surface, scrim: Scrim) => void;

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
  /** 全屏变暗遮罩（可随动画变化）；面板本身仍在 draw 里按设计坐标画 */
  scrim?: Scrim | (() => Scrim | null);
  draw(s: Surface, dt: number): void;
  /** 返回 true 表示已处理 */
  gesture?(e: GestureEvent, h: OverlayHandle<R>): boolean;
  /**
   * 是否需要持续出帧：true = 整层重绘（弹出动画等短动画）；'tick' = 只调用 tick() 局部重绘（倒计时）。
   */
  animating?(): boolean | 'tick';
  /** 推进时间（每帧调用一次，与是否重绘无关） */
  update?(dt: number): void;
  /** 局部重绘：只画自身的一小块不透明区域（animating() 为 'tick' 时由引擎调用） */
  tick?(s: Surface): void;
}

export type OverlayAnim = false | 'tick' | 'full';

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

  /** 推进各弹层的时间（倒计时、动画） */
  update(dt: number) {
    for (const e of [...this.items]) e.spec.update?.(dt);
  }
  /** 出帧需求：'full' 需要整层重绘；'tick' 只需局部重绘；false 可停帧 */
  animating(): OverlayAnim {
    let tick = false;
    for (const e of this.items) {
      const a = e.spec.animating?.();
      if (a === true) return 'full';
      if (a === 'tick') tick = true;
    }
    return tick ? 'tick' : false;
  }
  /** 局部重绘所有 'tick' 弹层 */
  tick(s: Surface) {
    for (const it of this.ordered()) if (it.spec.animating?.() === 'tick') it.spec.tick?.(s);
  }

  /** 按栈从下到上：先画该层的全屏遮罩（若有），再画面板 */
  draw(s: Surface, dt: number, scrim?: ScrimPainter) {
    for (const it of this.ordered()) {
      const sc = typeof it.spec.scrim === 'function' ? it.spec.scrim() : it.spec.scrim;
      if (sc && scrim && (sc.alpha ?? 1) > 0) scrim(s, sc);
      it.spec.draw(s, dt);
    }
  }
}

function inside(r: Rect, p: { x: number; y: number }) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
