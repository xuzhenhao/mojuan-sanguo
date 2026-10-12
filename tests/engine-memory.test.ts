import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import {
  AtlasManager,
  BAKE_LRU_CAPS,
  BakeCache,
  bakeScale,
  MB,
  pickFormat,
  SPEC_ATLASES,
  TextureBudget,
  textureBytes,
  type BudgetWarning,
} from '../src/engine/memory';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { fakePlatform } from './engine-fakes';

const mk = (limit = 50 * MB, warn = 45 * MB) => {
  const w: BudgetWarning[] = [];
  return { w, b: new TextureBudget(limit, warn, (x) => w.push(x)) };
};

describe('TextureBudget', () => {
  it('默认 50MB 预算、45MB 告警', () => {
    expect(DEFAULT_RENDER_CONFIG.textureBudgetBytes).toBe(50 * MB);
    expect(DEFAULT_RENDER_CONFIG.textureWarnBytes).toBe(45 * MB);
  });
  it('按格式计字节（render-spec §12 口径）', () => {
    expect(textureBytes(2048, 2048, 'etc2_rgba')).toBe(4 * MB);
    expect(textureBytes(2048, 2048, 'rgba4444')).toBe(8 * MB);
    expect(textureBytes(1024, 2048, 'etc2_rgb')).toBe(1 * MB);
    expect(textureBytes(256, 256, 'r8')).toBe(64 * 1024);
    expect(textureBytes(780, 1688)).toBe(5266560);
  });
  it('禁止 mipmap，单张不超过 2048²', () => {
    const { b } = mk();
    expect(() => b.track('x', 'atlas', 512, 512, { mipmaps: true })).toThrow(/mipmap/);
    expect(() => b.track('y', 'atlas', 4096, 512)).toThrow(/2048/);
  });
  it('超过 45MB 告警一次；回落后再越线再告警', () => {
    const { b, w } = mk();
    for (let i = 0; i < 11; i++) b.track(`a${i}`, 'atlas', 1024, 1024); // 44MB
    expect(w).toHaveLength(0);
    b.track('a11', 'atlas', 1024, 1024); // 48MB
    expect(w).toEqual([expect.objectContaining({ kind: 'warn', used: 48 * MB })]);
    b.track('a12', 'atlas', 16, 16);
    expect(w).toHaveLength(1);
    b.release('a11');
    b.release('a12');
    b.track('a11', 'atlas', 1024, 1024);
    expect(w).toHaveLength(2);
  });
  it('超过 50MB 标记为 over', () => {
    const { b, w } = mk();
    for (let i = 0; i < 13; i++) b.track(`a${i}`, 'atlas', 1024, 1024);
    expect(b.isOverBudget()).toBe(true);
    expect(w[0].kind).toBe('warn');
  });
});

describe('BakeCache（LRU + 按场景清空）', () => {
  it('各类 LRU 上限与 render-spec §12.2 一致', () => {
    expect(BAKE_LRU_CAPS).toMatchObject({ hand: 12, bigcard: 4, enemy: 6, badge: 40, detail: 1, mapscroll: 1 });
  });
  it('超过类别上限时淘汰最久未绘制的', () => {
    const { b } = mk();
    const disposed: string[] = [];
    const c = new BakeCache<string>(b, (v) => disposed.push(v));
    for (let i = 0; i < 12; i++) c.get(`h${i}`, 'hand', 'battle', 108, 156, () => `h${i}`);
    c.get('h0', 'hand', 'battle', 108, 156, () => 'x'); // 命中，刷新 h0
    c.get('h12', 'hand', 'battle', 108, 156, () => 'h12');
    expect(c.count('hand')).toBe(12);
    expect(disposed).toEqual(['h1']);
    expect(b.usedBy('bake')).toBe(12 * textureBytes(108, 156));
  });
  it('离屏 drop 与离开场景 clearScene 释放内存', () => {
    const { b } = mk();
    const c = new BakeCache(b);
    c.get('e1', 'enemy', 'battle', 144, 198, () => 1);
    c.get('d', 'detail', 'battle', 270, 300, () => 2);
    c.get('m', 'mapscroll', 'map', 531, 1050, () => 3);
    expect(c.drop('e1')).toBe(true);
    c.clearScene('battle');
    expect(c.size).toBe(1);
    expect(b.usedBy('bake')).toBe(textureBytes(531, 1050));
  });
  it('战斗缓存满载峰值约 2.77MB（render-spec §12.2）', () => {
    const { b } = mk();
    const c = new BakeCache(b);
    for (let i = 0; i < 12; i++) c.get(`h${i}`, 'hand', 'battle', 108, 156, () => 0);
    for (let i = 0; i < 6; i++) c.get(`e${i}`, 'enemy', 'battle', 144, 198, () => 0);
    c.get('g1', 'general', 'battle', 207, 282, () => 0);
    c.get('g2', 'general', 'battle', 114, 156, () => 0);
    for (let i = 0; i < 40; i++) c.get(`b${i}`, 'badge', 'battle', 48, 48, () => 0);
    c.get('d', 'detail', 'battle', 270, 300, () => 0);
    expect(b.usedBy('bake') / MB).toBeGreaterThan(2.3);
    expect(b.usedBy('bake') / MB).toBeLessThan(2.8);
  });
  it('超过告警线时先淘汰 LRU 缓存', () => {
    const { b, w } = mk(50 * MB, 45 * MB);
    const c = new BakeCache(b);
    c.get('scroll', 'mapscroll', 'map', 531, 1050, () => 0);
    for (let i = 0; i < 11; i++) b.track(`a${i}`, 'atlas', 1024, 1024); // 44MB + 2.1MB
    expect(c.size).toBe(0);
    expect(b.used).toBe(44 * MB);
    expect(w[0]).toMatchObject({ reclaimed: textureBytes(531, 1050) });
  });
  it('低端 1.5x、中高端 2x 烘焙', () => {
    expect(bakeScale(true, 2)).toBe(1.5);
    expect(bakeScale(false, 3)).toBe(2);
    expect(bakeScale(false, 1)).toBe(1);
  });
});

describe('AtlasManager（按场景加载/释放）', () => {
  it('压缩格式选择：ASTC > ETC2 > 4444/565，不回退 RGBA8', () => {
    expect(pickFormat({ astc: true, etc2: true })).toBe('astc_6x6');
    expect(pickFormat({ etc2: true }, true)).toBe('etc2_rgb');
    expect(pickFormat({}, false)).toBe('rgba4444');
    expect(pickFormat({}, true)).toBe('rgb565');
  });
  it('战斗峰值图集（ETC2）= 11MB，与 render-spec §12.4 一致', () => {
    const { b } = mk();
    const m = new AtlasManager(b);
    m.enterScene('battle');
    // ui 4 + fx 1 + cards 2 + bg 1 + generals 1 + enemies 2
    expect(b.usedBy('atlas')).toBe(11 * MB);
    expect(m.isLoaded('generals_select')).toBe(false);
  });
  it('无压缩（4444/565）路径 = 24MB', () => {
    const { b } = mk();
    const m = new AtlasManager(b, SPEC_ATLASES, (d) => pickFormat({}, d.opaque));
    m.enterScene('battle');
    expect(b.usedBy('atlas')).toBe(24 * MB);
  });
  it('切换场景释放上一场景独有的图集并调用 unload（deleteTexture）', () => {
    const { b } = mk();
    const unloaded: string[] = [];
    const m = new AtlasManager(b, SPEC_ATLASES, undefined, { unload: (d) => unloaded.push(d.name) });
    m.enterScene('select');
    expect(m.isLoaded('generals_select')).toBe(true);
    m.enterScene('battle');
    expect(m.isLoaded('generals_select')).toBe(false);
    expect(m.isLoaded('enemies_ch1')).toBe(true);
    expect(unloaded).toEqual(['generals_select']);
    m.enterScene('map');
    expect(m.isLoaded('enemies_ch1')).toBe(false);
    expect(m.isLoaded('generals_battle')).toBe(true);
    expect(m.isLoaded('ui_common')).toBe(true);
  });
});

describe('引擎接入', () => {
  it('dpr2：上屏 + 3 块离屏的帧缓冲记账；WebGL 关闭时无叠加层', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const e = new Engine(f.p);
    // 上屏 + main 2x，背景 1x（半尺寸默认开），氛围层半分辨率
    expect(e.budget.usedBy('framebuffer')).toBe(780 * 1688 * 4 * 2 + 390 * 844 * 4 * 2);
    expect(e.warnings).toHaveLength(0);
    expect(e.bakeScale).toBe(1.5);
  });
  it('低端配置：缓存 1.5x', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    expect(new Engine(f.p, {}, { ...DEFAULT_RENDER_CONFIG, lowEnd: true }).bakeScale).toBe(1.5);
  });
  it('超过告警线时转给平台 warn', () => {
    const f = fakePlatform({ query: { webgl: '0' } });
    const e = new Engine(f.p, {}, { ...DEFAULT_RENDER_CONFIG, textureWarnBytes: 10 * MB });
    expect(e.warnings.length).toBeGreaterThan(0);
    expect(f.warns.length).toBeGreaterThan(0);
  });
});
