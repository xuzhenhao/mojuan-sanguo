/**
 * 引擎骨架（P0）：平台 → 3 块 2D 离屏画布 → 2D 合成到上屏画布 → 可选 WebGL 叠加层。
 * 场景树、图集、表现队列在 P2/P3 加入；这里只提供 draw 钩子与触控回显。
 */
import type { Platform } from '../platform/types';
import { Canvas2DCompositor, WebGLOverlay, type InkFx } from './compositor';
import { GestureRecognizer, type GestureEvent } from './input';
import { MainLoop } from './loop';
import { OverlayStack } from './modal';
import { SceneManager } from './scene';
import { AtlasManager, BakeCache, bakeScale, CANVAS2D_ATLASES, TextureBudget, type BudgetWarning } from './memory';
import { DEFAULT_RENDER_CONFIG, decideWebGL, effectiveDpr, parseFlag, type RenderConfig, type WebGLDecision } from './settings';
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
  /** 烘焙缓存倍率：低端 1.5x，否则 2x（不超过 dpr） */
  readonly bakeScale: number;
  /** 资源半尺寸分级是否开启 */
  readonly halfSize: boolean;
  readonly width: number;
  readonly height: number;
  readonly budget: TextureBudget;
  readonly bakes: BakeCache;
  readonly atlases: AtlasManager;
  readonly surfaces: Record<SurfaceName, Surface>;
  readonly compositor: Canvas2DCompositor;
  webgl: WebGLDecision;
  readonly overlay: WebGLOverlay | null;
  readonly loop: MainLoop;
  readonly gestures: GestureRecognizer;
  readonly scenes: SceneManager;
  readonly overlays: OverlayStack;
  fx: InkFx[] = [];
  warnings: BudgetWarning[] = [];

  constructor(
    readonly platform: Platform,
    private hooks: EngineHooks = {},
    cfg: RenderConfig = DEFAULT_RENDER_CONFIG,
  ) {
    const info = platform.systemInfo();
    this.dpr = effectiveDpr(info.dpr, cfg.maxDpr);
    this.halfSize = parseFlag(platform.launchQuery().half) ?? cfg.halfSizeAssets;
    this.bakeScale = bakeScale(cfg.lowEnd, this.dpr, this.halfSize);
    this.width = info.width;
    this.height = info.height;
    const pxW = Math.round(info.width * this.dpr);
    const pxH = Math.round(info.height * this.dpr);
    this.budget = new TextureBudget(cfg.textureBudgetBytes, cfg.textureWarnBytes, (w) => {
      this.warnings.push(w);
      platform.warn('[texture-budget] 纹理内存超过告警线', w);
    });
    // 回收顺序：先 LRU 烘焙缓存，再非当前场景图集（render-spec §12.5）
    // 主画面始终走 2D：图片解码为 RGBA8，按 render-spec §12.5 分级（2x 锐利 / 1x 半尺寸 / 0.75x 立绘）
    this.atlases = new AtlasManager(this.budget, CANVAS2D_ATLASES, () => 'rgba8', {}, { halfSize: this.halfSize });
    this.bakes = new BakeCache(this.budget, undefined, undefined, {
      ensure: (n) => this.atlases.ensure(n),
      baked: (n) => void this.atlases.markBaked(n),
    });

    const screen = platform.mainCanvas();
    screen.width = pxW;
    screen.height = pxH;
    this.budget.track('screen:main', 'framebuffer', pxW, pxH);
    // 半尺寸：背景离屏按 1x 逻辑分辨率（源图烘焙后释放），绘制时放大
    this.surfaces = createSurfaces((w, h) => platform.createOffscreen(w, h), pxW, pxH, this.budget, this.halfSize ? { scale: { bg: 1 / this.dpr } } : {});
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
        // 特效叠加层用半分辨率（render-spec §12.4：特效 RT 半分辨率）
        const od = this.dpr / 2;
        c.width = Math.round(info.width * od);
        c.height = Math.round(info.height * od);
        overlay = new WebGLOverlay(c);
        this.budget.track('screen:webgl-overlay', 'framebuffer', c.width, c.height);
      } catch (e) {
        platform.warn('WebGL 叠加层创建失败，仅使用 2D 渲染', e);
        this.webgl = { enabled: false, reason: 'unsupported' };
      }
    }
    this.overlay = overlay;

    const sceneCtx = {
      width: this.width,
      height: this.height,
      invalidate: (l?: SurfaceName) => (l ? this.invalidate(l) : this.invalidateAll()),
    };
    this.scenes = new SceneManager(sceneCtx, { atlases: this.atlases, bakes: this.bakes }, () => !!this.overlay);
    this.overlays = new OverlayStack({
      invalidate: () => this.invalidate('main'),
      pauseScene: () => this.scenes.pause(),
      resumeScene: () => this.scenes.resume(),
    });
    platform.onHide(() => this.scenes.pause());
    platform.onShow(() => this.scenes.resume());

    // 输入路由：弹层栈（栈顶优先）→ 当前场景 → 外部钩子
    this.gestures = new GestureRecognizer((e) => {
      if (!this.overlays.gesture(e) && !this.scenes.gesture(e)) this.hooks.gesture?.(e);
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
  invalidateAll() {
    for (const s of Object.values(this.surfaces)) s.dirty = true;
    this.loop.invalidate();
  }
  start() {
    this.invalidateAll();
  }

  frame(dt: number) {
    this.gestures.tick(this.platform.now());
    this.scenes.update(dt);
    this.overlays.update(dt);
    // 弹层出帧：短动画整层重绘 main；倒计时只局部重绘（render-spec §12：空闲/等待时不整层重绘）
    const anim = this.overlays.animating();
    if (anim === 'full') this.surfaces.main.dirty = true;
    const mainFull = this.surfaces.main.dirty;
    for (const s of Object.values(this.surfaces)) {
      if (!s.dirty) continue;
      const k = this.dpr * s.scale;
      s.ctx.setTransform(k, 0, 0, k, 0, 0);
      if (this.scenes.current) this.scenes.draw(s.name, s, dt);
      this.hooks.draw?.(s.name, s, dt);
      if (s.name === 'main') this.overlays.draw(s, dt);
    }
    if (anim === 'tick' && !mainFull) {
      const m = this.surfaces.main;
      m.ctx.setTransform(this.dpr * m.scale, 0, 0, this.dpr * m.scale, 0, 0);
      this.overlays.tick(m);
      m.dirty = true; // 只为触发合成（3 次 drawImage），不整层重绘
    }
    this.compositor.compose(this.surfaces);
    const tfx = this.scenes.transitionFx;
    this.overlay?.frame(tfx ? [...this.fx, tfx] : this.fx);
  }

  needsFrame() {
    return (
      this.gestures.active ||
      this.scenes.animating() ||
      !!this.overlays.animating() ||
      !!this.hooks.animating?.() ||
      (this.overlay ? WebGLOverlay.needsFrame(this.fx) : false)
    );
  }
}
