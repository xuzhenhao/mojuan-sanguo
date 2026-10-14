/**
 * 帧率统计（#183）：纯函数，阈值由调用方传入（取自 config/budget.yaml perf）。
 * 引擎 FPS 计数器（src/engine/fps.ts）与脚本（scripts/fps-meter.ts 转出）共用。
 */
export interface FpsReport {
  frames: number;
  avgFps: number;
  /** 最差 1% 帧对应的帧率（1% low） */
  low1Fps: number;
  verdict: 'ok' | 'below_target' | 'below_low_end';
}
export function fpsReport(frameMs: number[], perf: { targetFps: number; lowEndFps: number }): FpsReport {
  const ms = frameMs.filter((x) => x > 0);
  if (!ms.length) return { frames: 0, avgFps: 0, low1Fps: 0, verdict: 'below_low_end' };
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const sorted = [...ms].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.ceil(ms.length / 100)));
  const low = worst.reduce((a, b) => a + b, 0) / worst.length;
  const avgFps = 1000 / avg;
  const low1Fps = 1000 / low;
  const verdict = low1Fps < perf.lowEndFps ? 'below_low_end' : avgFps < perf.targetFps * 0.95 ? 'below_target' : 'ok';
  return { frames: ms.length, avgFps: +avgFps.toFixed(1), low1Fps: +low1Fps.toFixed(1), verdict };
}
