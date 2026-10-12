/**
 * 场景管理（engine-design §4.13）：生命周期 enter / exit / pause / resume，
 * 场景级图集加载/释放（AtlasManager）与烘焙缓存清理（BakeCache），以及转场。
 * 各页面（点将、战斗、地图、奖励、集市、结算）实现 Scene 接口后注册即可，彼此独立。
 */
import type { InkFx } from './compositor';
import type { GestureEvent } from './input';
import type { AtlasManager, BakeCache } from './memory';
import type { Surface, SurfaceName } from './surfaces';

export interface SceneContext {
  /** 请求重绘某层 */
  invalidate(layer?: SurfaceName): void;
  width: number;
  height: number;
}

export interface Scene<P = unknown> {
  readonly id: string;
  /** AtlasManager 的场景键，默认等于 id */
  readonly atlasScene?: string;
  enter(ctx: SceneContext, params: P): void;
  exit(): void;
  pause?(): void;
  resume?(): void;
  update?(dt: number): void;
  draw(layer: SurfaceName, s: Surface, dt: number): void;
  /** 返回 true 表示已处理 */
  gesture?(e: GestureEvent): boolean;
  animating?(): boolean;
}

/** 转场：progress 0→1；WebGL 开启时可提供叠加层特效（可选钩子） */
export interface Transition {
  durationMs: number;
  /** 返回 WebGL 特效实例（没有叠加层时忽略） */
  fx?(progress: number): InkFx | null;
  /** 2D 侧遮罩透明度（0–1），不提供则直接切换 */
  mask?(progress: number): number;
}

/** 泼墨转场（render-spec §8：450ms）：WebGL 开启时有特效，关闭时只做直接切换（不做 2D 替代特效） */
export const INK_TRANSITION: Transition = {
  durationMs: 450,
  fx: (p) => ({ id: 'ink_transition', progress: p }),
};
export const CUT: Transition = { durationMs: 0 };

export type SceneFactory = () => Scene;

interface Pending {
  id: string;
  params: unknown;
  t: Transition;
  elapsed: number;
  swapped: boolean;
  resolve: () => void;
}

export class SceneManager {
  private factories = new Map<string, SceneFactory>();
  current: Scene | null = null;
  private pending: Pending | null = null;
  private paused = false;
  /** 生命周期日志（测试与调试用） */
  readonly log: string[] = [];
  transitionFx: InkFx | null = null;

  constructor(
    private ctx: SceneContext,
    private res: { atlases?: AtlasManager; bakes?: BakeCache },
    private webglEnabled: () => boolean = () => false,
  ) {}

  register(id: string, f: SceneFactory) {
    this.factories.set(id, f);
    return this;
  }
  has(id: string) {
    return this.factories.has(id);
  }
  get transitioning() {
    return !!this.pending;
  }

  /** 切换场景；有转场时在中点交换场景。返回转场结束的 Promise */
  go(id: string, params?: unknown, t: Transition = CUT): Promise<void> {
    if (!this.factories.has(id)) throw new Error(`未注册的场景 ${id}`);
    this.pending?.resolve();
    return new Promise((resolve) => {
      this.pending = { id, params, t, elapsed: 0, swapped: false, resolve };
      if (t.durationMs <= 0) this.update(0);
      this.ctx.invalidate();
    });
  }

  private swap(id: string, params: unknown) {
    const old = this.current;
    if (old) {
      old.exit();
      this.log.push(`exit:${old.id}`);
      this.res.bakes?.clearScene(old.atlasScene ?? old.id);
    }
    const next = this.factories.get(id)!();
    this.res.atlases?.enterScene(next.atlasScene ?? next.id);
    this.current = next;
    next.enter(this.ctx, params);
    this.log.push(`enter:${next.id}`);
    if (this.paused) {
      next.pause?.();
      this.log.push(`pause:${next.id}`);
    }
    this.ctx.invalidate('main');
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.current?.pause?.();
    if (this.current) this.log.push(`pause:${this.current.id}`);
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.current?.resume?.();
    if (this.current) this.log.push(`resume:${this.current.id}`);
    this.ctx.invalidate();
  }
  get isPaused() {
    return this.paused;
  }

  update(dt: number) {
    const p = this.pending;
    if (p) {
      p.elapsed += dt;
      const d = p.t.durationMs;
      const prog = d <= 0 ? 1 : Math.min(1, p.elapsed / d);
      if (!p.swapped && prog >= 0.5) {
        p.swapped = true;
        this.swap(p.id, p.params);
      }
      this.transitionFx = this.webglEnabled() && p.t.fx && prog < 1 ? p.t.fx(prog) : null;
      if (prog >= 1) {
        this.pending = null;
        this.transitionFx = null;
        p.resolve();
      }
    }
    if (!this.paused) this.current?.update?.(dt);
  }

  draw(layer: SurfaceName, s: Surface, dt: number) {
    this.current?.draw(layer, s, dt);
  }
  gesture(e: GestureEvent) {
    if (this.pending || this.paused) return false; // 转场和暂停期间屏蔽输入
    return this.current?.gesture?.(e) ?? false;
  }
  animating() {
    return !!this.pending || !!this.current?.animating?.();
  }
}
