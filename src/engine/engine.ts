/**
 * 引擎骨架（P0）：平台 → 3 块 2D 离屏画布 → 2D 合成到上屏画布 → 可选 WebGL 叠加层。
 * 场景树、图集、表现队列在 P2/P3 加入；这里只提供 draw 钩子与触控回显。
 */
import type { Platform } from '../platform/types';
import { Canvas2DCompositor, WebGLOverlay, type InkFx } from './compositor';
import { GestureRecognizer, type GestureEvent } from './input';
import { FpsCounter, fpsOptions, type FpsSink, type FpsStyle } from './fps';
import { MainLoop } from './loop';
import { OverlayStack, type Scrim } from './modal';
import { SceneManager } from './scene';
import { AtlasManager, BakeCache, bakeScale, CANVAS2D_ATLASES, TextureBudget, type BudgetWarning } from './memory';
import { DEFAULT_RENDER_CONFIG, decideWebGL, effectiveDpr, parseFlag, type RenderConfig, type WebGLDecision } from './settings';
import { createSurfaces, type Surface, type SurfaceName } from './surfaces';
import type { CanvasLike, Ctx2DLike } from './types';
import { computeViewport, DESIGN_H, DESIGN_W, layerTransform, toDesign, type Viewport } from './viewport';

export interface EngineHooks {
  /** 在对应离屏层上绘制（坐标为逻辑像素，已按 dpr 缩放） */
  draw?(layer: SurfaceName, s: Surface, dt: number): void;
  gesture?(e: GestureEvent): void;
  /** 是否还有动画需要继续出帧 */
  animating?(): boolean;
  /** 底纹层：用真实视口 W×H（CSS px，已乘 dpr）铺满，cover；不进场景（render-spec §4.0） */
  backdrop?(ctx: Ctx2DLike, width: number, height: number): void;
  /** FPS 屏显样式（令牌由 game 层传入）；缺省不画 */
  fpsStyle?: FpsStyle;
}

export class Engine {
  readonly dpr: number;
  /** 烘焙缓存倍率：低端 1.5x，否则 2x（不超过 dpr） */
  readonly bakeScale: number;
  /** 资源半尺寸分级是否开启 */
  readonly halfSize: boolean;
  /** 场景设计坐标，恒为 390×844（render-spec §4.0） */
  readonly width = DESIGN_W;
  readonly height = DESIGN_H;
  /** 当前视口：真实尺寸 + 设计坐标缩放/偏移 */
  viewport: Viewport;
  private overlayCanvas: CanvasLike | null = null;
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
  /** 开发版 FPS 计数器（#183）；正式构建恒为 null */
  readonly fps: FpsCounter | null = null;
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
    this.viewport = computeViewport(info.width, info.height, info.safeArea);
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
        this.overlayCanvas = c;
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
    // 触摸反变换：屏幕 CSS px → 设计坐标 (x-offsetX)/s
    const toDp = (ts: { id: number; x: number; y: number }[]) => ts.map((t) => ({ id: t.id, ...toDesign(this.viewport, t) }));
    platform.onTouch({
      start: (t) => {
        this.gestures.down(toDp(t), platform.now());
        this.invalidate();
      },
      move: (t) => this.gestures.move(toDp(t)),
      end: (t) => this.gestures.up(toDp(t), platform.now()),
      cancel: () => this.gestures.cancel(),
    });

    if (import.meta.env.DEV) {
      const o = fpsOptions(__PERF_BUDGET__, true, platform.launchQuery());
      if (o.enabled) this.fps = new FpsCounter(__PERF_BUDGET__, o.overlay);
    }
    this.loop = new MainLoop(
      platform,
      (dt, t) => {
        if (import.meta.env.DEV) this.fps?.sample(dt, t);
        this.frame(dt);
      },
      () => this.needsFrame(),
    );
    platform.onResize?.(() => this.resize());
  }

  /** 视口变化（resize / visualViewport resize / 横竖屏）：重算缩放、重设画布像素并整屏重绘 */
  resize() {
    const info = this.platform.systemInfo();
    const vp = computeViewport(info.width, info.height, info.safeArea);
    const old = this.viewport;
    if (vp.width === old.width && vp.height === old.height && vp.s === old.s && vp.offsetX === old.offsetX && vp.offsetY === old.offsetY) return false;
    this.viewport = vp;
    const pxW = Math.round(vp.width * this.dpr);
    const pxH = Math.round(vp.height * this.dpr);
    const screen = this.compositor.target;
    screen.width = pxW;
    screen.height = pxH;
    this.budget.track('screen:main', 'framebuffer', pxW, pxH);
    for (const sf of Object.values(this.surfaces)) {
      const w = Math.round(pxW * sf.scale);
      const h = Math.round(pxH * sf.scale);
      sf.canvas.width = w;
      sf.canvas.height = h;
      this.budget.track(`surface:${sf.name}`, 'framebuffer', w, h);
    }
    const c = this.overlayCanvas;
    if (c) {
      c.width = Math.round((vp.width * this.dpr) / 2);
      c.height = Math.round((vp.height * this.dpr) / 2);
      this.budget.track('screen:webgl-overlay', 'framebuffer', c.width, c.height);
    }
    this.invalidateAll();
    return true;
  }

  /** 弹层遮罩：临时切到屏幕矩阵，按真实 W×H 铺满，再恢复设计坐标矩阵 */
  paintScrim(s: Surface, sc: Scrim) {
    const k = this.dpr * s.scale;
    const ctx = s.ctx;
    const ga = ctx.globalAlpha;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = ga * Math.max(0, Math.min(1, sc.alpha ?? 1));
    const { width: vw, height: vh } = this.viewport;
    const rd = sc.radial;
    const mk = (ctx as Partial<CanvasRenderingContext2D>).createRadialGradient;
    if (rd && mk) {
      const x = vw * rd.cx;
      const y = vh * rd.cy;
      const g = mk.call(ctx, x, y, 0, x, y, Math.hypot(vw, vh) * rd.r);
      for (const [o, col] of rd.stops) g.addColorStop(o, col);
      (ctx as { fillStyle: unknown }).fillStyle = g;
    } else ctx.fillStyle = sc.color;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = ga;
    ctx.setTransform(...layerTransform(this.viewport, k));
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
  /** #142：首帧门控——promise 落定前 frame() 不画任何东西（避免 scenes.go / resize 等提前用默认字体画字），落定后整屏重绘 */
  framesHeld = false;
  holdFramesUntil(p: Promise<unknown>) {
    this.framesHeld = true;
    const release = () => {
      this.framesHeld = false;
      this.invalidateAll();
    };
    return p.then(release, release);
  }

  frame(dt: number) {
    if (this.framesHeld) return;
    this.gestures.tick(this.platform.now());
    this.scenes.update(dt);
    this.overlays.update(dt);
    // 弹层出帧：短动画整层重绘 main；倒计时只局部重绘（render-spec §12：空闲/等待时不整层重绘）
    const anim = this.overlays.animating();
    if (import.meta.env.DEV && this.fps?.overlay && this.hooks.fpsStyle) this.surfaces.main.dirty = true;
    if (anim === 'full') this.surfaces.main.dirty = true;
    const mainFull = this.surfaces.main.dirty;
    for (const s of Object.values(this.surfaces)) {
      if (!s.dirty) continue;
      const k = this.dpr * s.scale;
      // 整层清空（含设计框外的余量），再按设计坐标绘制
      s.ctx.setTransform(1, 0, 0, 1, 0, 0);
      s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
      if (s.name === 'bg' && this.hooks.backdrop) {
        s.ctx.setTransform(k, 0, 0, k, 0, 0);
        this.hooks.backdrop(s.ctx, this.viewport.width, this.viewport.height);
      }
      s.ctx.setTransform(...layerTransform(this.viewport, k));
      // #118：场景绘制裁剪到 390×844 内容框（边距 / 底纹不裁；弹层遮罩按 §4.0 全屏，不在裁剪内）
      const clipped = clipToContent(s.ctx);
      if (this.scenes.current) this.scenes.draw(s.name, s, dt);
      this.hooks.draw?.(s.name, s, dt);
      if (clipped) (s.ctx as ClipCtx).restore!();
      if (s.name === 'main') this.overlays.draw(s, dt, (sf, sc) => this.paintScrim(sf, sc));
      if (import.meta.env.DEV && s.name === 'main' && this.hooks.fpsStyle) this.fps?.draw(s.ctx, 8, DESIGN_H - 8, this.hooks.fpsStyle);
    }
    if (anim === 'tick' && !mainFull) {
      const m = this.surfaces.main;
      m.ctx.setTransform(...layerTransform(this.viewport, this.dpr * m.scale));
      this.overlays.tick(m);
      m.dirty = true; // 只为触发合成（3 次 drawImage），不整层重绘
    }
    this.compositor.compose(this.surfaces);
    const tfx = this.scenes.transitionFx;
    this.overlay?.frame(tfx ? [...this.fx, tfx] : this.fx);
  }

  /** FPS 报告出口（#208 埋点由外部接；引擎不依赖平台模块）。正式构建为空操作 */
  setFpsSink(sink: FpsSink | null) {
    if (this.fps) this.fps.sink = sink;
  }

  needsFrame() {
    return (
      (import.meta.env.DEV && !!this.fps?.overlay) ||
      this.gestures.active ||
      this.scenes.animating() ||
      !!this.overlays.animating() ||
      !!this.hooks.animating?.() ||
      (this.overlay ? WebGLOverlay.needsFrame(this.fx) : false)
    );
  }
}

type ClipCtx = Ctx2DLike & { save?(): void; restore?(): void; beginPath?(): void; rect?(x: number, y: number, w: number, h: number): void; clip?(): void };
/** 在当前（设计坐标）矩阵下把绘制裁到内容框 0,0,DESIGN_W,DESIGN_H；上下文不支持裁剪（测试替身）时返回 false */
export function clipToContent(ctx: Ctx2DLike): boolean {
  const c = ctx as ClipCtx;
  if (!c.save || !c.restore || !c.beginPath || !c.rect || !c.clip) return false;
  c.save();
  c.beginPath();
  c.rect(0, 0, DESIGN_W, DESIGN_H);
  c.clip();
  return true;
}
