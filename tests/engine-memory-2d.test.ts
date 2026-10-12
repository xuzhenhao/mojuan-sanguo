import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { BATTLE_BAKE_PLAN, GL_FX_BYTES, TEXT_CACHE_BYTES } from '../src/engine/budget-plan';
import { AtlasManager, bakeSize, CANVAS2D_ATLASES, MB, TextureBudget, tierScale } from '../src/engine/memory';
import { DEFAULT_RENDER_CONFIG } from '../src/engine/settings';
import { fakePlatform } from './engine-fakes';

/** 复算战斗页峰值（390×844 @2x），返回 MB 分项 */
function battlePeak(o: { webgl: boolean; half?: boolean }) {
  const f = fakePlatform({ webgl: o.webgl, query: o.half === false ? { half: '0' } : {} });
  const e = new Engine(f.p, {}, DEFAULT_RENDER_CONFIG);
  e.atlases.enterScene('battle');
  let i = 0;
  let peak = 0;
  for (const b of BATTLE_BAKE_PLAN)
    for (let k = 0; k < b.count; k++) {
      const { w, h } = bakeSize(b.wDp, b.hDp, e.bakeScale);
      e.bakes.get(
        `${b.cls}:${i++}`,
        b.cls,
        'battle',
        w,
        h,
        () => ((peak = Math.max(peak, e.budget.used)), {}),
        b.cls === 'general' ? { source: 'generals_battle' } : {},
      );
    }
  e.budget.track('text', 'text', 1024, TEXT_CACHE_BYTES / 1024, { format: 'r8' });
  if (e.webgl.enabled) e.budget.track('gl:fx', 'fx', 1024, Math.ceil(GL_FX_BYTES / 1024), { format: 'r8' });
  const r = e.budget.report();
  peak = Math.max(peak, r.used + (e.atlases.isBaked('generals_battle') ? 768 * 768 * 4 : 0));
  const by = Object.fromEntries(r.categories.map((c) => [c.category, +(c.used / MB).toFixed(2)]));
  return { e, total: +(r.used / MB).toFixed(2), peak: +(peak / MB).toFixed(2), by };
}

describe('2D 路径分辨率分级（render-spec §12.5）', () => {
  it('分级缩放：sharp 2x、soft 半尺寸、portrait 0.75x；关闭开关全部原尺寸', () => {
    expect(tierScale('sharp', true)).toBe(1);
    expect(tierScale('soft', true)).toBe(0.5);
    expect(tierScale('portrait', true)).toBe(0.75);
    expect(tierScale('soft', false)).toBe(1);
    const m = new AtlasManager(new TextureBudget(), CANVAS2D_ATLASES, () => 'rgba8', {}, { halfSize: true });
    expect(m.size(m.def('ui_sharp')!)).toEqual({ w: 1024, h: 1024 });
    expect(m.size(m.def('ui_soft')!)).toEqual({ w: 1024, h: 1024 });
    expect(m.size(m.def('generals_battle')!)).toEqual({ w: 768, h: 768 });
    expect(m.size(m.def('generals_select')!)).toEqual({ w: 1536, h: 768 });
    expect(m.size(m.def('enemies_ch1')!)).toEqual({ w: 1024, h: 512 });
  });

  it('ui_sharp ≤1024²', () => {
    const d = CANVAS2D_ATLASES.find((a) => a.name === 'ui_sharp')!;
    expect(d.width * d.height).toBeLessThanOrEqual(1024 * 1024);
  });

  it('默认开启半尺寸；?half=0 关闭；2D 烘焙 1.5x；DPR ≤2', () => {
    expect(DEFAULT_RENDER_CONFIG.halfSizeAssets).toBe(true);
    const on = new Engine(fakePlatform({ dpr: 3 }).p, {}, DEFAULT_RENDER_CONFIG);
    expect(on.halfSize).toBe(true);
    expect(on.dpr).toBe(2);
    expect(on.bakeScale).toBe(1.5);
    expect(on.surfaces.bg.canvas.width).toBe(390); // 背景离屏 1x
    const off = new Engine(fakePlatform({ query: { half: '0' } }).p, {}, DEFAULT_RENDER_CONFIG);
    expect(off.halfSize).toBe(false);
    expect(off.bakeScale).toBe(2);
    expect(off.surfaces.bg.canvas.width).toBe(780);
  });

  it('烘焙后释放源图，重烘时重新解码；离开场景释放非战斗图集', () => {
    const e = new Engine(fakePlatform().p, {}, DEFAULT_RENDER_CONFIG);
    e.atlases.enterScene('battle');
    expect(e.atlases.isLoaded('generals_battle')).toBe(true);
    e.bakes.get('g1', 'general', 'battle', 150, 210, () => ({}), { source: 'generals_battle' });
    expect(e.atlases.isLoaded('generals_battle')).toBe(false);
    expect(e.atlases.isBaked('generals_battle')).toBe(true);
    let seen = false;
    e.bakes.get('g2', 'general', 'battle', 150, 210, () => ((seen = e.atlases.isLoaded('generals_battle')), {}), { source: 'generals_battle' });
    expect(seen).toBe(true);
    expect(e.atlases.isLoaded('generals_battle')).toBe(false);
    expect(e.atlases.markBaked('bg_lacquer')).toBe(true);
    expect(e.atlases.markBaked('ui_sharp')).toBe(false); // 非 releaseAfterBake
    e.atlases.enterScene('select');
    expect(e.atlases.isLoaded('enemies_ch1')).toBe(false);
    expect(e.atlases.isBaked('generals_battle')).toBe(false);
    expect(e.atlases.isLoaded('generals_select')).toBe(true);
  });

  it('战斗页峰值：WebGL 关/开 均 ≤50MB 且低于 45MB 告警线；关半尺寸会超标', () => {
    const off = battlePeak({ webgl: false });
    const on = battlePeak({ webgl: true });
    const full = battlePeak({ webgl: false, half: false });
    // 稳态 ×1.5 浏览器开销仍 ≤50MB；峰值（立绘源图烘焙前在内存）≤45MB 告警线
    expect(off.total * 1.5).toBeLessThanOrEqual(50);
    expect(on.total * 1.5).toBeLessThanOrEqual(50);
    expect(off.peak).toBeLessThanOrEqual(45);
    expect(on.peak).toBeLessThanOrEqual(45);
    expect(on.total).toBeGreaterThan(off.total);
    expect(full.total).toBeGreaterThan(off.total + 15);
  });
});
