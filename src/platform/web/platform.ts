/** H5 平台实现（engine-design §4.1）。只有这里和入口文件可以直接访问 window / document。 */
import type { Canvas2DLike, CanvasLike, Ctx2DLike, TouchPoint } from '../../engine/types';
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
    // render-spec §4.0：优先用 visualViewport（移动端地址栏伸缩时更准确）
    const vv = window.visualViewport;
    const width = Math.round(vv?.width ?? 0) || root.clientWidth || window.innerWidth;
    const height = Math.round(vv?.height ?? 0) || root.clientHeight || window.innerHeight;
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
    onResize(cb) {
      let pending = false;
      const fire = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          cb();
        });
      };
      window.addEventListener('resize', fire);
      window.addEventListener('orientationchange', fire);
      window.visualViewport?.addEventListener('resize', fire);
      screen.ownerDocument.defaultView?.matchMedia?.('(orientation: portrait)').addEventListener?.('change', fire);
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

/** 宣纸底纹（cover 铺满真实视口）：纵向渐变 + 细纹，与各页纸色一致 */
export function paintPaperBackdrop(ctx: Ctx2DLike, w: number, h: number) {
  const c = ctx as unknown as CanvasRenderingContext2D;
  const mode = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('bd') ?? 'a') : 'a';
  const dark = mode !== 'a';
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, dark ? '#3D2923' : '#EFE3C6');
  g.addColorStop(1, dark ? '#2C1E19' : '#BFAE88');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = dark ? 'rgba(0,0,0,.06)' : 'rgba(120,96,60,.05)';
  for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1);
  if (mode === 'c') {
    const s = Math.min(w / 390, h / 844),
      bw = 390 * s,
      bh = 844 * s,
      x0 = (w - bw) / 2,
      y0 = (h - bh) / 2,
      R = 24;
    const edge = (ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number) => {
      const v = c.createLinearGradient(ax, ay, bx, by);
      v.addColorStop(0, 'rgba(0,0,0,.35)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = v;
      c.fillRect(rx, ry, rw, rh);
    };
    if (x0 > 0) {
      edge(x0, 0, x0 - R, 0, x0 - R, y0, R, bh);
      edge(x0 + bw, 0, x0 + bw + R, 0, x0 + bw, y0, R, bh);
    }
    if (y0 > 0) {
      edge(0, y0, 0, y0 - R, x0, y0 - R, bw, R);
      edge(0, y0 + bh, 0, y0 + bh + R, x0, y0 + bh, bw, R);
    }
  }
}

/** 调试状态栏（WebGL/dpr/纹理内存）：正式入口默认隐藏；`?debug=1` 或部署路径含 /debug/ 时显示（#79） */
export function showStatusBar(query: Record<string, string>, pathname: string): boolean {
  if (query.debug === '1') return true;
  if (query.debug === '0') return false;
  return /\/debug(\/|$)/.test(pathname);
}
