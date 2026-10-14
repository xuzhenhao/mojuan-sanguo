/**
 * #204 wechat 平台：画布/触摸/生命周期/systemInfo/存储/launchQuery + 与 boot 对接。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { bootGame } from '../src/game/boot';
import { prefersReducedMotion, setReducedMotionSource } from '../src/game/motion';
import { createWechatPlatform, createWechatStorage, estimateBytes, fetchBenchmarkLevel, STORAGE_WARN_BYTES, type WxApi } from '../src/platform/wechat';
import type { WxTouchEvent } from '../src/platform/wechat/wx-api';
import { fakeCanvas } from './engine-fakes';

type MockWx = WxApi & {
  store: Map<string, string>;
  touches: Record<string, (e: WxTouchEvent) => void>;
  life: { show: (() => void)[]; hide: (() => void)[] };
};
function mockWx(over: Partial<WxApi> & { store?: Map<string, string> } = {}): MockWx & { flushRaf: (t?: number) => void } {
  const store = over.store ?? new Map<string, string>();
  const touches: Record<string, (e: WxTouchEvent) => void> = {};
  const life = { show: [] as (() => void)[], hide: [] as (() => void)[] };
  const canvases: ReturnType<typeof fakeCanvas>[] = [];
  const rafQueue: ((t: number) => void)[] = [];
  const api: MockWx & { flushRaf: (t?: number) => void } = {
    store,
    touches,
    life,
    createCanvas: () => {
      const c = fakeCanvas(0, 0);
      canvases.push(c);
      return c;
    },
    getWindowInfo: () => ({
      windowWidth: 390,
      windowHeight: 844,
      pixelRatio: 2,
      safeArea: { left: 0, top: 44, right: 390, bottom: 810, width: 390, height: 766 },
      platform: 'devtools',
    }),
    getMenuButtonBoundingClientRect: () => ({ left: 298, top: 48, right: 375, bottom: 80, width: 77, height: 32 }),
    onTouchStart: (cb) => (touches.start = cb),
    onTouchMove: (cb) => (touches.move = cb),
    onTouchEnd: (cb) => (touches.end = cb),
    onTouchCancel: (cb) => (touches.cancel = cb),
    onShow: (cb) => life.show.push(cb),
    onHide: (cb) => life.hide.push(cb),
    getLaunchOptionsSync: () => ({ query: { seed: '42', from: 'test' } }),
    getStorageSync: (k) => {
      if (!store.has(k)) return '';
      return store.get(k)!;
    },
    setStorageSync: (k, v) => {
      store.set(k, String(v));
    },
    removeStorageSync: (k) => {
      store.delete(k);
    },
    loadFont: () => 'LXGW WenKai',
    getPerformance: () => ({ now: () => 1234.5 }),
    requestAnimationFrame: (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    flushRaf: (t = 16) => {
      const q = rafQueue.splice(0);
      q.forEach((cb) => cb(t));
    },
    getRealtimeLogManager: () => ({ info() {}, warn() {}, error() {} }),
    ...over,
  };
  return api;
}

describe('#204 wechat storage', () => {
  it('读写删走 wx.*StorageSync；缺 key 返回 null', () => {
    const store = new Map<string, string>();
    const warns: string[] = [];
    const s = createWechatStorage(
      {
        getStorageSync: (k) => (store.has(k) ? store.get(k)! : ''),
        setStorageSync: (k, v) => store.set(k, String(v)),
        removeStorageSync: (k) => void store.delete(k),
      },
      { warn: (m) => warns.push(m), reportError: () => {} },
    );
    expect(s.get('mojuan.run.v1')).toBeNull();
    s.set('mojuan.run.v1', '{"schema":1}');
    expect(s.get('mojuan.run.v1')).toBe('{"schema":1}');
    s.remove('mojuan.run.v1');
    expect(s.get('mojuan.run.v1')).toBeNull();
    expect(warns).toEqual([]);
  });

  it('单 key >512KB 报警；写失败保留旧档且上报', () => {
    const store = new Map<string, string>([['k', 'old']]);
    const warns: string[] = [];
    const errs: string[] = [];
    let fail = false;
    const s = createWechatStorage(
      {
        getStorageSync: (k) => store.get(k) ?? '',
        setStorageSync: (k, v) => {
          if (fail) throw new Error('quota');
          store.set(k, String(v));
        },
        removeStorageSync: (k) => void store.delete(k),
      },
      { warn: (m) => warns.push(m), reportError: (e) => errs.push(e.message) },
    );
    const big = 'x'.repeat(STORAGE_WARN_BYTES / 2 + 1);
    expect(estimateBytes(big)).toBeGreaterThan(STORAGE_WARN_BYTES);
    s.set('k', big);
    expect(warns.some((m) => m.includes(String(STORAGE_WARN_BYTES)))).toBe(true);
    expect(store.get('k')!.startsWith('x')).toBe(true);

    fail = true;
    warns.length = 0;
    s.set('k', 'new');
    expect(store.get('k')!.startsWith('x')).toBe(true); // 旧档仍在
    expect(errs.some((m) => m.includes('旧档保留'))).toBe(true);
  });

  it('get/remove 抛错不向外抛', () => {
    const s = createWechatStorage(
      {
        getStorageSync: () => {
          throw new Error('x');
        },
        setStorageSync: () => {},
        removeStorageSync: () => {
          throw new Error('y');
        },
      },
      { warn: () => {}, reportError: () => {} },
    );
    expect(s.get('a')).toBeNull();
    expect(() => s.remove('a')).not.toThrow();
  });
});

describe('#204 wechat platform', () => {
  it('首个画布为上屏并按 window×dpr 设尺寸；离屏用后续 createCanvas', () => {
    const api = mockWx();
    const p = createWechatPlatform(api);
    const main = p.mainCanvas();
    expect([main.width, main.height]).toEqual([780, 1688]);
    const off = p.createOffscreen(100, 50);
    expect(off).not.toBe(main);
    expect([off.width, off.height]).toEqual([100, 50]);
    expect(p.createOverlayCanvas()).toBeNull();
    expect(p.name).toBe('wechat');
  });

  it('systemInfo：safeArea + 胶囊；launchQuery 来自 getLaunchOptionsSync', () => {
    const p = createWechatPlatform(mockWx());
    const i = p.systemInfo();
    expect(i.width).toBe(390);
    expect(i.height).toBe(844);
    expect(i.dpr).toBe(2);
    expect(i.safeArea).toEqual({ x: 0, y: 44, w: 390, h: 766 });
    expect(i.capsule).toEqual({ x: 298, y: 48, w: 77, h: 32 });
    expect(i.platform).toBe('devtools');
    expect(p.launchQuery()).toEqual({ seed: '42', from: 'test' });
    expect(p.share.query()).toEqual({ seed: '42', from: 'test' });
  });

  it('触摸映射为 TouchPoint；onShow/onHide；raf/now；reducedMotion 恒 false', () => {
    const api = mockWx();
    const p = createWechatPlatform(api);
    const got: Record<string, { id: number; x: number; y: number }[]> = {};
    p.onTouch({
      start: (t) => (got.start = t),
      move: (t) => (got.move = t),
      end: (t) => (got.end = t),
      cancel: (t) => (got.cancel = t),
    });
    const ev = (x: number, y: number): WxTouchEvent => ({
      touches: [{ identifier: 7, clientX: x, clientY: y }],
      changedTouches: [{ identifier: 7, clientX: x, clientY: y }],
    });
    api.touches.start!(ev(10, 20));
    api.touches.move!(ev(11, 21));
    api.touches.end!(ev(12, 22));
    api.touches.cancel!(ev(13, 23));
    expect(got.start).toEqual([{ id: 7, x: 10, y: 20 }]);
    expect(got.move[0]).toEqual({ id: 7, x: 11, y: 21 });
    expect(got.end[0].x).toBe(12);
    expect(got.cancel[0].y).toBe(23);

    let shown = 0;
    let hidden = 0;
    p.onShow(() => shown++);
    p.onHide(() => hidden++);
    api.life.show.forEach((cb) => cb());
    api.life.hide.forEach((cb) => cb());
    expect([shown, hidden]).toEqual([1, 1]);

    let t = -1;
    p.raf((n) => (t = n));
    expect(t).toBe(-1);
    api.flushRaf(16);
    expect(t).toBe(16);
    expect(p.now()).toBe(1234.5);
    expect(p.prefersReducedMotion()).toBe(false);
  });

  it('胶囊/safeArea 接口抛错时降级为 null / 全屏，不抛向外', () => {
    const p = createWechatPlatform(
      mockWx({
        getMenuButtonBoundingClientRect: () => {
          throw new Error('no capsule');
        },
        getWindowInfo: () => ({ windowWidth: 360, windowHeight: 640, pixelRatio: 1 }),
      }),
    );
    const i = p.systemInfo();
    expect(i.capsule).toBeNull();
    expect(i.safeArea).toEqual({ x: 0, y: 0, w: 360, h: 640 });
  });

  it('fonts / storage / ads / share / telemetry 可调用；不采集用户信息（无 openId 字段）', async () => {
    const api = mockWx();
    const p = createWechatPlatform(api);
    expect(await p.fonts.load('Brush', 'assets/fonts/wenkai.ttf')).toBe(true);
    p.storage.set('mojuan.prefs.v1', '{}');
    expect(p.storage.get('mojuan.prefs.v1')).toBe('{}');
    expect(await p.ads.rewarded('x')).toBe('unavailable');
    expect(await p.share.share({ title: 't' })).toBe(false);
    expect(() => p.telemetry.send([{ ev: 'run_start', data: {}, t: 0 }])).not.toThrow();
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '../src/platform/wechat');
    for (const f of ['platform.ts', 'storage.ts', 'entry.ts', 'telemetry.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/\bgetUserInfo\b|\bgetUserProfile\b|\bgetOpenId\b|\bwx\.login\b/);
    }
  });

  it('bootGame(wechat platform) 可启动；reducedMotion 注入为 false', () => {
    setReducedMotionSource(null);
    const p = createWechatPlatform(mockWx({ getLaunchOptionsSync: () => ({ query: { webgl: '0' } }) }));
    const game = bootGame(p, { renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: false }, statusBar: false });
    expect(game).toBeTruthy();
    expect(prefersReducedMotion()).toBe(false);
    expect(p.name).toBe('wechat');
  });
});

describe('#204 entry 不碰 DOM', () => {
  it('wechat/entry.ts 与 platform.ts 不含 window/document', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '../src/platform/wechat');
    for (const f of ['entry.ts', 'platform.ts', 'storage.ts', 'index.ts']) {
      const s = fs.readFileSync(path.join(root, f), 'utf8');
      expect(s, f).not.toMatch(/\bdocument\./);
      expect(s, f).not.toMatch(/\bwindow\./);
    }
  });
});

describe('#206 benchmark → systemInfo', () => {
  it('fetchBenchmarkLevel：有 API 读 success；缺 API / fail → undefined', async () => {
    expect(await fetchBenchmarkLevel(mockWx())).toBeUndefined();
    expect(
      await fetchBenchmarkLevel(
        mockWx({
          getDeviceBenchmarkInfo: (opt) => opt.success?.({ benchmarkLevel: 18, modelLevel: 3 }),
        }),
      ),
    ).toBe(18);
    expect(
      await fetchBenchmarkLevel(
        mockWx({
          getDeviceBenchmarkInfo: (opt) => opt.fail?.(),
        }),
      ),
    ).toBeUndefined();
  });

  it('createWechatPlatform 把 benchmarkLevel 挂到 systemInfo', () => {
    const p = createWechatPlatform(mockWx(), { benchmarkLevel: 12 });
    expect(p.systemInfo().benchmarkLevel).toBe(12);
    expect(createWechatPlatform(mockWx()).systemInfo().benchmarkLevel).toBeUndefined();
  });
});
