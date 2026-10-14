/**
 * 微信小游戏 Platform 实现（#204 / wechat-minigame-m2.md §3.1）：
 * 画布（首个 createCanvas 上屏，其后离屏）、触摸 → TouchPoint、onShow/onHide、
 * raf / now、launchQuery、systemInfo（safeArea + 胶囊 + 可选 benchmarkLevel）、存储 / 字体 / 埋点。
 * 不引入 weapp-adapter；不采集 openid 或任何用户信息。
 */
import type { Canvas2DLike, CanvasLike, Ctx2DLike, TouchPoint } from '../../engine/types';
import type { Platform, SystemInfo, TouchHandlers } from '../types';
import { createWechatAudio } from './audio';
import { createWechatFonts } from './fonts';
import { createWechatLoader } from './loader';
import { createWechatStorage } from './storage';
import { createWechatTelemetry } from './telemetry';
import type { WxApi, WxTouch, WxTouchEvent, WxWindowInfo } from './wx-api';

const toPts = (list: WxTouch[]): TouchPoint[] =>
  list.map((t) => ({
    id: t.identifier,
    x: t.clientX ?? t.x ?? 0,
    y: t.clientY ?? t.y ?? 0,
  }));

function mapPlatform(raw: string | undefined): SystemInfo['platform'] {
  const p = (raw ?? '').toLowerCase();
  if (p.includes('ios') || p === 'iphone' || p === 'ipad') return 'ios';
  if (p.includes('android')) return 'android';
  if (p.includes('devtools') || p.includes('develop')) return 'devtools';
  if (p.includes('windows') || p.includes('mac') || p.includes('pc')) return 'pc';
  return 'devtools';
}

function readWindow(api: WxApi): WxWindowInfo {
  try {
    return api.getWindowInfo();
  } catch {
    const s = api.getSystemInfoSync?.();
    return {
      windowWidth: s?.windowWidth ?? 375,
      windowHeight: s?.windowHeight ?? 667,
      pixelRatio: s?.pixelRatio ?? 2,
      safeArea: s?.safeArea,
      platform: s?.platform,
    };
  }
}

function sizeMain(canvas: Canvas2DLike, api: WxApi) {
  const info = readWindow(api);
  const dpr = info.pixelRatio || 1;
  canvas.width = Math.max(1, Math.round(info.windowWidth * dpr));
  canvas.height = Math.max(1, Math.round(info.windowHeight * dpr));
}

/** 宣纸底纹（与 H5 paintPaperBackdrop 同口径，不 import web，避免拉进 DOM） */
export function paintWechatBackdrop(ctx: Ctx2DLike, w: number, h: number) {
  const c = ctx as Ctx2DLike & {
    createLinearGradient?(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
  };
  if (c.createLinearGradient) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3D2923');
    g.addColorStop(1, '#2C1E19');
    c.fillStyle = g as unknown as string;
  } else {
    c.fillStyle = '#2C1E19';
  }
  c.fillRect(0, 0, w, h);
}

/** #206：读取 `wx.getDeviceBenchmarkInfo`（回调包 Promise；缺 API / 失败 → undefined） */
export function fetchBenchmarkLevel(api: WxApi): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (!api.getDeviceBenchmarkInfo) {
      resolve(undefined);
      return;
    }
    try {
      api.getDeviceBenchmarkInfo({
        success: (res) => resolve(typeof res.benchmarkLevel === 'number' ? res.benchmarkLevel : undefined),
        fail: () => resolve(undefined),
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function createWechatPlatform(api: WxApi, opts?: { benchmarkLevel?: number }): Platform {
  // 首个 createCanvas = 上屏画布（官方约定）；之后的为离屏
  const screen = api.createCanvas();
  sizeMain(screen, api);

  const queryRaw = (() => {
    try {
      return api.getLaunchOptionsSync()?.query ?? {};
    } catch {
      return {};
    }
  })();
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(queryRaw)) if (v != null) query[k] = String(v);

  const realtime = (() => {
    try {
      return api.getRealtimeLogManager?.() ?? null;
    } catch {
      return null;
    }
  })();

  const warn = (msg: string, data?: unknown) => {
    try {
      realtime?.warn(msg, data);
    } catch {
      /* ignore */
    }
    try {
      console.warn(msg, data ?? '');
    } catch {
      /* ignore */
    }
  };
  const reportError: Platform['reportError'] = (e) => {
    try {
      realtime?.error(e.message, e);
    } catch {
      /* ignore */
    }
    try {
      console.error('[error]', e);
    } catch {
      /* ignore */
    }
  };

  const storage = createWechatStorage(api, { warn, reportError });
  const fonts = createWechatFonts({ loadFont: (path) => api.loadFont?.(path) ?? null }, (m) => warn(m));

  const info = (): SystemInfo => {
    const w = readWindow(api);
    const width = Math.round(w.windowWidth) || 375;
    const height = Math.round(w.windowHeight) || 667;
    const dpr = w.pixelRatio || 1;
    const sa = w.safeArea;
    const safeArea = sa
      ? { x: sa.left, y: sa.top, w: sa.width ?? sa.right - sa.left, h: sa.height ?? sa.bottom - sa.top }
      : { x: 0, y: 0, w: width, h: height };
    let capsule: SystemInfo['capsule'] = null;
    try {
      const m = api.getMenuButtonBoundingClientRect();
      if (m && m.width > 0 && m.height > 0) {
        capsule = { x: m.left, y: m.top, w: m.width, h: m.height };
      }
    } catch {
      capsule = null;
    }
    const plat =
      w.platform ??
      (() => {
        try {
          return api.getSystemInfoSync?.()?.platform;
        } catch {
          return undefined;
        }
      })();
    return { width, height, dpr, safeArea, capsule, platform: mapPlatform(plat), benchmarkLevel: opts?.benchmarkLevel };
  };

  const bindTouch = (h: TouchHandlers) => {
    const start = (e: WxTouchEvent) => h.start(toPts(e.changedTouches?.length ? e.changedTouches : e.touches));
    const move = (e: WxTouchEvent) => h.move(toPts(e.touches?.length ? e.touches : e.changedTouches));
    const end = (e: WxTouchEvent) => h.end(toPts(e.changedTouches?.length ? e.changedTouches : e.touches));
    const cancel = (e: WxTouchEvent) => h.cancel(toPts(e.changedTouches?.length ? e.changedTouches : e.touches));
    api.onTouchStart(start);
    api.onTouchMove(move);
    api.onTouchEnd(end);
    api.onTouchCancel(cancel);
  };

  const rafImpl =
    api.requestAnimationFrame?.bind(api) ??
    (typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame.bind(undefined)
      : (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number);

  const nowImpl = () => {
    try {
      const n = api.getPerformance?.()?.now();
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    } catch {
      /* fall through */
    }
    return Date.now();
  };

  return {
    name: 'wechat',
    systemInfo: info,
    mainCanvas: () => screen,
    createOverlayCanvas(): CanvasLike | null {
      // M2 默认关闭 WebGL 叠加（规格 §5）；需要时再开第二块非上屏 canvas
      return null;
    },
    createOffscreen(w, h) {
      const c = api.createCanvas();
      c.width = Math.max(1, Math.round(w));
      c.height = Math.max(1, Math.round(h));
      return c;
    },
    onTouch: bindTouch,
    onShow: (cb) => api.onShow(cb),
    onHide: (cb) => api.onHide(cb),
    onResize: api.onWindowResize
      ? (cb) => {
          api.onWindowResize!(() => {
            sizeMain(screen, api);
            cb();
          });
        }
      : undefined,
    raf: (cb) => rafImpl(cb),
    now: nowImpl,
    launchQuery: () => ({ ...query }),
    audio: createWechatAudio(),
    storage,
    ads: {
      async rewarded() {
        return 'unavailable';
      },
      resetRun() {},
    },
    share: {
      async share() {
        return false;
      },
      query: () => ({ ...query }),
    },
    loader: createWechatLoader(),
    fonts,
    telemetry: createWechatTelemetry(realtime),
    prefersReducedMotion: () => false,
    reportError,
    warn,
  };
}
