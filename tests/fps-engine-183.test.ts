import { describe, expect, it, vi } from 'vitest';
import { FpsCounter, fpsOptions, type PerfBudget } from '../src/engine/fps';
import { fpsReport } from '../scripts/fps-meter';
import { readPerfBudget } from '../scripts/perf-define';
import { MATCH_EVENTS, pickFields } from '../src/game/telemetry';
import type { Ctx2DLike } from '../src/engine/types';

const perf: PerfBudget = { ...readPerfBudget(process.cwd()), sampleMs: 1000, report: true, reportEveryMs: 5000 };
const style = { font: '12px sans', color: 'ok', warn: 'warn', bad: 'bad', bg: 'bg' };

function fakeCtx() {
  const texts: { t: string; style: unknown }[] = [];
  const ctx: Ctx2DLike = {
    setTransform() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    fillText(t: string) {
      texts.push({ t, style: ctx.fillStyle });
    },
    globalAlpha: 1,
    fillStyle: '',
    font: '',
  };
  return { ctx, texts };
}

describe('#183 FPS 计数器接引擎', () => {
  it('阈值与开关来自 budget.yaml perf，缺省屏显/上报关闭', () => {
    const p = readPerfBudget(process.cwd());
    expect(p.targetFps).toBe(60);
    expect(p.lowEndFps).toBe(30);
    expect(p.overlay).toBe(false);
    expect(p.report).toBe(false);
    expect(__PERF_BUDGET__).toEqual(p);
  });
  it('scripts/fps-meter 转出仍可用', () => {
    expect(fpsReport(Array(60).fill(1000 / 60), perf).verdict).toBe('ok');
  });
  it('非开发构建恒不启用；开发构建 ?fps 覆盖屏显开关', () => {
    expect(fpsOptions({ ...perf, overlay: true }, false, { fps: '1' })).toEqual({ enabled: false, overlay: false });
    expect(fpsOptions({ ...perf, report: false }, true, {})).toEqual({ enabled: false, overlay: false });
    expect(fpsOptions({ ...perf, report: false }, true, { fps: '1' })).toEqual({ enabled: true, overlay: true });
    expect(fpsOptions({ ...perf, overlay: true, report: false }, true, { fps: '0' }).overlay).toBe(false);
  });
  it('按 sampleMs 窗口出报告，dt=0 不计；sink 按 reportEveryMs 节流', () => {
    const c = new FpsCounter(perf, false);
    const sink = vi.fn();
    c.sink = sink;
    let t = 0;
    const run = (n: number, dt: number) => {
      for (let i = 0; i < n; i++) c.sample(dt, (t += dt));
    };
    c.sample(0, 0);
    run(40, 25); // 1s @40fps
    expect(c.last?.avgFps).toBe(40);
    expect(c.last?.verdict).toBe('below_target');
    expect(sink).toHaveBeenCalledTimes(1);
    run(61, 1000 / 60); // 下一窗口，未到 5s 不再上报
    expect(c.last?.verdict).toBe('ok');
    expect(sink).toHaveBeenCalledTimes(1);
    run(60 * 5, 1000 / 60);
    expect(sink).toHaveBeenCalledTimes(2);
  });
  it('perf.report=false 时不调 sink', () => {
    const c = new FpsCounter({ ...perf, report: false }, true);
    const sink = vi.fn();
    c.sink = sink;
    for (let i = 0; i < 120; i++) c.sample(1000 / 60, i * 16);
    expect(sink).not.toHaveBeenCalled();
  });
  it('屏显：只在 overlay 开时画，颜色按 verdict 取传入令牌', () => {
    const off = new FpsCounter(perf, false);
    const a = fakeCtx();
    off.draw(a.ctx, 8, 836, style);
    expect(a.texts).toHaveLength(0);
    const on = new FpsCounter(perf, true);
    const b = fakeCtx();
    on.draw(b.ctx, 8, 836, style);
    expect(b.texts[0].t).toBe('FPS --');
    for (let i = 0; i < 20; i++) on.sample(50, i * 50); // 20fps < lowEnd
    on.draw(b.ctx, 8, 836, style);
    expect(b.texts[1].t).toMatch(/^FPS 20 \/ 1% 20$/);
    expect(b.texts[1].style).toBe('bad');
    expect('shadowBlur' in b.ctx).toBe(false);
  });
  it('perf_sample 走 #208 白名单', () => {
    expect(MATCH_EVENTS.perf_sample).toEqual(['avg_fps', 'low1_fps', 'verdict', 'frames']);
    expect(pickFields('perf_sample', { avg_fps: 59, low1_fps: 40, verdict: 'ok', frames: 60, openid: 'x' })).toEqual({
      avg_fps: 59,
      low1_fps: 40,
      verdict: 'ok',
      frames: 60,
    });
  });
});
