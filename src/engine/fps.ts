/**
 * 开发版 FPS 计数器（#183）：接 MainLoop 帧间隔，按 perf.sampleMs 窗口出 fpsReport（平均 + 1% low）。
 * - 屏显：只在开发构建且开关开（budget.yaml perf.overlay 或 ?fps=1）；画在设计框左下角（安全区内，不挡胶囊/顶栏），无 shadowBlur
 * - 上报：引擎只暴露 sink 回调，不依赖任何平台/埋点模块；由外部（boot）接 #208
 * 正式构建：import.meta.env.DEV 为 false，Engine 不创建计数器，整段被摇树。
 */
import { fpsReport, type FpsReport } from './fps-meter';
import type { Ctx2DLike } from './types';

export interface PerfBudget {
  targetFps: number;
  lowEndFps: number;
  sampleMs: number;
  overlay: boolean;
  report: boolean;
  reportEveryMs: number;
}
export type FpsSink = (r: FpsReport) => void;
/** 屏显样式：由调用方传入令牌（引擎不依赖 game 主题） */
export interface FpsStyle {
  font: string;
  color: string;
  warn: string;
  bad: string;
  bg: string;
}

export class FpsCounter {
  private buf: number[] = [];
  private acc = 0;
  private lastReportAt = -Infinity;
  last: FpsReport | null = null;
  sink: FpsSink | null = null;
  constructor(
    readonly perf: PerfBudget,
    readonly overlay: boolean,
  ) {}

  /** 每帧调用；dt=0（首帧/停帧后恢复）不计 */
  sample(dt: number, now: number) {
    if (!(dt > 0)) return;
    this.buf.push(dt);
    this.acc += dt;
    if (this.acc < this.perf.sampleMs) return;
    const r = fpsReport(this.buf, this.perf);
    this.buf = [];
    this.acc = 0;
    this.last = r;
    if (this.sink && this.perf.report && now - this.lastReportAt >= this.perf.reportEveryMs) {
      this.lastReportAt = now;
      this.sink(r);
    }
  }

  /** 左下角屏显（设计坐标；y 为底边） */
  draw(ctx: Ctx2DLike, x: number, bottom: number, style: FpsStyle) {
    if (!this.overlay || !ctx.fillText) return;
    const r = this.last;
    const text = r ? `FPS ${r.avgFps} / 1% ${r.low1Fps}` : 'FPS --';
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = 1;
    ctx.fillStyle = style.bg;
    ctx.fillRect(x, bottom - 18, 128, 18);
    ctx.font = style.font;
    ctx.fillStyle = !r || r.verdict === 'ok' ? style.color : r.verdict === 'below_target' ? style.warn : style.bad;
    ctx.fillText(text, x + 4, bottom - 5);
    ctx.globalAlpha = ga;
  }
}

/** 是否启用：开发构建 && (屏显 || 上报)；?fps=0|1 覆盖屏显开关 */
export function fpsOptions(perf: PerfBudget, dev: boolean, query: Record<string, string>): { enabled: boolean; overlay: boolean } {
  if (!dev) return { enabled: false, overlay: false };
  const q = query.fps;
  const overlay = q === '1' ? true : q === '0' ? false : perf.overlay;
  return { enabled: overlay || perf.report, overlay };
}
