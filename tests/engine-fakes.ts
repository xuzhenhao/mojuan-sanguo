/** 引擎测试替身：不依赖 DOM 的假画布 / 假平台 */
import type { Platform, SystemInfo } from '../src/platform/types';
import type { Canvas2DLike, CanvasLike, Ctx2DLike } from '../src/engine/types';

export interface FakeCanvas extends Canvas2DLike {
  calls: string[];
  contexts: string[];
  ctx2d: Ctx2DLike & { draws: unknown[] };
}

export function fakeCanvas(w = 0, h = 0, opts: { webgl?: boolean } = {}): FakeCanvas {
  const c = { width: w, height: h, calls: [] as string[], contexts: [] as string[] } as unknown as FakeCanvas;
  const draws: unknown[] = [];
  const ctx = {
    draws,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    setTransform: () => c.calls.push('setTransform'),
    clearRect: () => c.calls.push('clearRect'),
    fillRect: () => c.calls.push('fillRect'),
    fillText: () => c.calls.push('fillText'),
    drawImage: (img: unknown) => {
      draws.push(img);
      c.calls.push('drawImage');
    },
  };
  const gl = { COLOR_BUFFER_BIT: 0x4000, viewport() {}, clearColor() {}, clear: () => c.calls.push('gl.clear'), isContextLost: () => false };
  c.ctx2d = ctx;
  c.getContext = ((type: string) => {
    c.contexts.push(type);
    if (type === '2d') return ctx;
    if (type === 'webgl') return opts.webgl ? gl : null;
    return null;
  }) as Canvas2DLike['getContext'];
  return c;
}

export function fakePlatform(
  o: {
    query?: Record<string, string>;
    webgl?: boolean;
    dpr?: number;
    info?: () => SystemInfo;
    fonts?: Platform['fonts']['load'];
    reducedMotion?: boolean;
  } = {},
) {
  let resize: (() => void) | null = null;
  const screen = fakeCanvas();
  const offscreens: FakeCanvas[] = [];
  const overlays: FakeCanvas[] = [];
  const rafs: ((t: number) => void)[] = [];
  const warns: string[] = [];
  const fontLoads: [string, string][] = [];
  const telemetry: { ev: string }[][] = [];
  let now = 0;
  let touch: Parameters<Platform['onTouch']>[0] | null = null;
  const p: Platform = {
    name: 'web',
    systemInfo: o.info ?? (() => ({ width: 390, height: 844, dpr: o.dpr ?? 2, safeArea: { x: 0, y: 0, w: 390, h: 844 }, capsule: null, platform: 'web' })),
    onResize: (cb) => (resize = cb),
    mainCanvas: () => screen,
    createOverlayCanvas(): CanvasLike | null {
      if (!o.webgl) return null;
      const c = fakeCanvas(0, 0, { webgl: true });
      overlays.push(c);
      return c;
    },
    createOffscreen(w, h) {
      const c = fakeCanvas(w, h);
      offscreens.push(c);
      return c;
    },
    onTouch: (h) => (touch = h),
    onShow() {},
    onHide() {},
    raf: (cb) => rafs.push(cb),
    now: () => now,
    launchQuery: () => o.query ?? {},
    audio: { playBgm() {}, playSfx() {}, stopBgm() {}, setMuted() {} },
    storage: { get: () => null, set() {}, remove() {} },
    ads: { rewarded: async () => 'unavailable', resetRun() {} },
    share: { share: async () => false, query: () => ({}) },
    loader: { async load() {} },
    fonts: { load: (f, u) => (fontLoads.push([f, u]), o.fonts ? o.fonts(f, u) : Promise.resolve(true)) },
    telemetry: { send: (b) => void telemetry.push(b) },
    prefersReducedMotion: () => !!o.reducedMotion,
    reportError() {},
    warn: (m) => warns.push(m),
  };
  return {
    p,
    screen,
    offscreens,
    overlays,
    warns,
    fontLoads,
    telemetry,
    touch: () => touch!,
    resize: () => resize?.(),
    setNow: (t: number) => (now = t),
    /** 执行当前排队的一帧，返回执行的回调数 */
    flush(t: number) {
      const q = rafs.splice(0);
      q.forEach((cb) => cb(t));
      return q.length;
    },
    pending: () => rafs.length,
  };
}
