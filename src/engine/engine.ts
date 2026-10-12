/**
 * 引擎骨架（P0）：平台 → 3 块 2D 离屏画布 → 2D 合成到上屏画布 → 可选 WebGL 叠加层。
 * 场景树、图集、表现队列在 P2/P3 加入；这里只提供 draw 钩子与触控回显。
 */
import type { Platform } from '../platform/types';
import { Canvas2DCompositor, WebGLOverlay, type InkFx } from './compositor';
import { GestureRecognizer, type GestureEvent } from './input';
import { MainLoop } from './loop';
import { TextureBudget, type BudgetWarning } from './memory';
import { DEFAULT_RENDER_CONFIG, decideWebGL, effectiveDpr, type RenderConfig, type WebGLDecision } from './settings';
import { createSurfaces, type Surface, type SurfaceName } from './surfaces';
import type { CanvasLike } from './types';

export interface EngineHooks {
  /** 在对应离屏层上绘制（坐标为逻辑像素，已按 dpr 缩放） */
  draw?(layer: SurfaceName, s: Surface, dt: number): void;
  gesture?(e: GestureEvent): void;
  /** 是否还有动画需要继续出帧 */
  animating?(): boolean;
}

export class Engine {
  readonly dpr: number;
  readonly width: number;
  readonly height: number;
  readonly budget: TextureBudget;
  readonly surfaces: Record<SurfaceName, Surface>;
  readonly compositor: Canvas2DCompositor;
  webgl: WebGLDecision;
  readonly overlay: WebGLOverlay | null;
  readonly loop: MainLoop;
  readonly gestures: GestureRecognizer;
  fx: InkFx[] = [];
  warnings: BudgetWarning[] = [];

  constructor(
    readonly platform: Platform,
    private hooks: EngineHooks = {},
    cfg: RenderConfig = DEFAULT_RENDER_CONFIG,
  ) {
    const info = platform.systemInfo();
    this.dpr = effectiveDpr(info.dpr, cfg.maxDpr);
    this.width = info.width;
    this.height = info.height;
    const pxW = Math.round(info.width * this.dpr);
    const pxH = Math.round(info.height * this.dpr);
    this.budget = new TextureBudget(cfg.textureBudgetBytes, undefined, (w) => {
      this.warnings.push(w);
      platform.warn('[texture-budget] 超出预算', w);
    });

    const screen = platform.mainCanvas();
    screen.width = pxW;
    screen.height = pxH;
    this.budget.track('screen:main', 'screen', pxW, pxH);
    this.surfaces = createSurfaces((w, h) => platform.createOffscreen(w, h), pxW, pxH, this.budget);
    this.compositor = new Canvas2DCompositor(screen);

    const probe: { canvas: CanvasLike | null } = { canvas: null };
    this.webgl = decideWebGL(cfg, platform.launchQuery(), () => {
      probe.canvas = platform.createOverlayCanvas();
      return !!probe.canvas;
    });
    let overlay: WebGLOverlay | null = null;
    const c = probe.canvas;
    if (this.webgl.enabled && c) {
      try {
        // 叠加层分辨率上限 1.5 倍（engine-design §4.7.1）
        const od = Math.min(this.dpr, 1.5);
        c.width = Math.round(info.width * od);
        c.height = Math.round(info.height * od);
        overlay = new WebGLOverlay(c);
        this.budget.track('screen:webgl-overlay', 'fx', c.width, c.height);
      } catch (e) {
        platform.warn('WebGL 叠加层创建失败，仅使用 2D 渲染', e);
        this.webgl = { enabled: false, reason: 'unsupported' };
      }
    }
    this.overlay = overlay;

    this.gestures = new GestureRecognizer((e) => {
      this.hooks.gesture?.(e);
      this.invalidate();
    });
    const toDp = (ts: { id: number; x: number; y: number }[]) => ts;
    platform.onTouch({
      start: (t) => {
        this.gestures.down(toDp(t), platform.now());
        this.invalidate();
      },
      move: (t) => this.gestures.move(toDp(t)),
      end: (t) => this.gestures.up(toDp(t), platform.now()),
      cancel: () => this.gestures.cancel(),
    });

    this.loop = new MainLoop(
      platform,
      (dt) => this.frame(dt),
      () => this.needsFrame(),
    );
  }

  /** 标记某层需要重绘并唤醒主循环 */
  invalidate(layer?: SurfaceName) {
    if (layer) this.surfaces[layer].dirty = true;
    this.loop.invalidate();
  }
  start() {
    for (const s of Object.values(this.surfaces)) s.dirty = true;
    this.invalidate();
  }

  frame(dt: number) {
    this.gestures.tick(this.platform.now());
    for (const s of Object.values(this.surfaces)) {
      if (!s.dirty || !this.hooks.draw) continue;
      const k = this.dpr * s.scale;
      s.ctx.setTransform(k, 0, 0, k, 0, 0);
      this.hooks.draw(s.name, s, dt);
    }
    this.compositor.compose(this.surfaces);
    this.overlay?.frame(this.fx);
  }

  needsFrame() {
    return this.gestures.active || !!this.hooks.animating?.() || (this.overlay ? WebGLOverlay.needsFrame(this.fx) : false);
  }
}
