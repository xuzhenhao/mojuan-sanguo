/** H5 平台实现（engine-design §4.1）。只有这里和入口文件可以直接访问 window / document。 */
import type { Canvas2DLike, CanvasLike, TouchPoint } from '../../engine/types';
import type { Platform, SystemInfo, TouchHandlers } from '../types';

function readSafeArea(w: number, h: number) {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);right:env(safe-area-inset-right)';
  document.body.appendChild(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { x: r.left || 0, y: r.top || 0, w: r.width || w, h: r.height || h };
}

export function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(search).forEach((v, k) => (out[k] = v));
  return out;
}

/** H5“看广告刷新”：每局免费 1 次（已决定） */
export function freeOncePerRunAds(): Platform['ads'] {
  let used = false;
  return {
    async rewarded() {
      if (used) return 'unavailable';
      used = true;
      return 'completed';
    },
    resetRun() {
      used = false;
    },
  };
}

export function createWebPlatform(root: HTMLElement): Platform {
  const screen = document.createElement('canvas');
  screen.id = 'screen';
  root.appendChild(screen);
  const query = parseQuery(location.search);

  const info = (): SystemInfo => {
    const width = root.clientWidth || window.innerWidth;
    const height = root.clientHeight || window.innerHeight;
    return { width, height, dpr: window.devicePixelRatio || 1, safeArea: readSafeArea(width, height), capsule: null, platform: 'web' };
  };
  const pts = (e: PointerEvent): TouchPoint[] => {
    const r = screen.getBoundingClientRect();
    return [{ id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top }];
  };

  return {
    name: 'web',
    systemInfo: info,
    mainCanvas: () => screen as unknown as Canvas2DLike,
    createOverlayCanvas(): CanvasLike | null {
      const c = document.createElement('canvas');
      const ok = !!(c.getContext('webgl') ?? null);
      if (!ok) return null;
      c.id = 'webgl-overlay';
      c.style.pointerEvents = 'none';
      root.appendChild(c);
      return c as unknown as CanvasLike;
    },
    createOffscreen(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c as unknown as Canvas2DLike;
    },
    onTouch(h: TouchHandlers) {
      screen.style.touchAction = 'none';
      screen.addEventListener('pointerdown', (e) => {
        screen.setPointerCapture?.(e.pointerId);
        h.start(pts(e));
      });
      screen.addEventListener('pointermove', (e) => h.move(pts(e)));
      screen.addEventListener('pointerup', (e) => h.end(pts(e)));
      screen.addEventListener('pointercancel', (e) => h.cancel(pts(e)));
    },
    onShow: (cb) => document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && cb()),
    onHide: (cb) => document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && cb()),
    raf: (cb) => requestAnimationFrame(cb),
    now: () => performance.now(),
    launchQuery: () => query,
    audio: { playBgm() {}, playSfx() {}, stopBgm() {}, setMuted() {} }, // P5 实现
    storage: {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: (k) => localStorage.removeItem(k),
    },
    ads: freeOncePerRunAds(),
    share: {
      async share(p) {
        const nav = navigator as Navigator & { share?: (d: { title: string; url?: string }) => Promise<void> };
        if (!nav.share) return false;
        await nav.share({ title: p.title, url: p.query ? `${location.origin}${location.pathname}?${p.query}` : location.href });
        return true;
      },
      query: () => query,
    },
    loader: { async load() {} }, // H5：资源组按需加载，P4 实现
    reportError: (e) => console.error('[error]', e),
    warn: (m, d) => console.warn(m, d ?? ''),
  };
}
