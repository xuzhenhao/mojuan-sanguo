import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { decideWebGL, DEFAULT_RENDER_CONFIG, effectiveDpr, parseFlag } from '../src/engine/settings';
import { fakePlatform } from './engine-fakes';

describe('WebGL 开关', () => {
  it('解析 URL 参数', () => {
    expect(parseFlag('0')).toBe(false);
    expect(parseFlag('off')).toBe(false);
    expect(parseFlag('1')).toBe(true);
    expect(parseFlag(undefined)).toBeUndefined();
    expect(parseFlag('x')).toBeUndefined();
  });
  it('URL 参数优先于配置；不支持时关闭', () => {
    const yes = () => true;
    expect(decideWebGL({ webgl: true }, { webgl: '0' }, yes)).toEqual({ enabled: false, reason: 'query' });
    expect(decideWebGL({ webgl: false }, { webgl: '1' }, yes)).toEqual({ enabled: true, reason: 'query' });
    expect(decideWebGL({ webgl: false }, {}, yes)).toEqual({ enabled: false, reason: 'config' });
    expect(decideWebGL({ webgl: true }, {}, () => false)).toEqual({ enabled: false, reason: 'unsupported' });
  });
  it('关闭时不探测 WebGL', () => {
    let probed = false;
    decideWebGL({ webgl: true }, { webgl: '0' }, () => (probed = true));
    expect(probed).toBe(false);
  });
  it('DPR 上限', () => {
    expect(effectiveDpr(3, 2)).toBe(2);
    expect(effectiveDpr(1, 2)).toBe(1);
    expect(effectiveDpr(0, 2)).toBe(1);
  });
});

describe('WebGL 关闭：2D 直接合成路径', () => {
  it('?webgl=0：不创建叠加层，3 块 2D 画布按 bg→ambient→main 合成到上屏画布', () => {
    const f = fakePlatform({ query: { webgl: '0' }, webgl: true });
    const drawn: string[] = [];
    const e = new Engine(f.p, { draw: (l) => drawn.push(l) });
    expect(e.webgl).toEqual({ enabled: false, reason: 'query' });
    expect(e.overlay).toBeNull();
    expect(f.overlays).toHaveLength(0);
    expect(f.screen.contexts).not.toContain('webgl');

    e.start();
    expect(f.flush(16)).toBe(1);
    expect(drawn).toEqual(['bg', 'ambient', 'main']);
    expect(f.screen.ctx2d.draws).toEqual([f.offscreens[0], f.offscreens[1], f.offscreens[2]]);
    expect(f.screen.width).toBe(780);
    expect(f.offscreens[1].width).toBe(390); // ambient 半分辨率
  });
  it('平台不支持 WebGL 时同样走 2D 路径', () => {
    const f = fakePlatform({ webgl: false });
    const e = new Engine(f.p);
    expect(e.webgl.reason).toBe('unsupported');
    e.start();
    f.flush(16);
    expect(e.compositor.composites).toBe(1);
  });
  it('只有脏层重绘；静止时停帧', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const drawn: string[] = [];
    const e = new Engine(f.p, { draw: (l) => drawn.push(l) });
    e.start();
    f.flush(16);
    expect(f.pending()).toBe(0); // 空闲不出帧
    drawn.length = 0;
    e.invalidate('main');
    f.flush(32);
    expect(drawn).toEqual(['main']);
    expect(e.compositor.composites).toBe(2);
    expect(f.pending()).toBe(0);
  });
  it('触控在 WebGL 关闭时照常工作（点按）', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const got: string[] = [];
    new Engine(f.p, { gesture: (g) => got.push(g.type) });
    f.touch().start([{ id: 1, x: 10, y: 10 }]);
    f.setNow(100);
    f.touch().end([{ id: 1, x: 12, y: 11 }]);
    expect(got).toContain('tap');
  });
});

describe('WebGL 开启：叠加层', () => {
  it('创建独立叠加画布（1.5 倍分辨率上限），2D 合成照常', () => {
    const f = fakePlatform({ webgl: true });
    const e = new Engine(f.p);
    expect(e.webgl.enabled).toBe(true);
    expect(f.overlays).toHaveLength(1);
    expect(f.overlays[0].width).toBe(585);
    expect(f.screen.contexts).not.toContain('webgl');
    e.start();
    f.flush(16);
    expect(e.compositor.composites).toBe(1);
    expect(e.overlay!.frames).toBe(1);
    expect(e.budget.usedBy('fx')).toBe(585 * 1266 * 4);
  });
  it('默认配置为开启', () => {
    expect(DEFAULT_RENDER_CONFIG.webgl).toBe(true);
  });
});
