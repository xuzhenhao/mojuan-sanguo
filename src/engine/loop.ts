/**
 * 主循环：rAF 驱动；needsFrame() 为 false 时停帧（空闲不重绘），invalidate() 唤醒。
 */
export interface LoopHost {
  raf(cb: (t: number) => void): number;
}

export class MainLoop {
  private scheduled = false;
  private last = -1;
  frames = 0;
  constructor(
    private host: LoopHost,
    private tick: (dt: number, t: number) => void,
    private needsFrame: () => boolean,
  ) {}

  /** 请求至少再渲染一帧 */
  invalidate() {
    if (this.scheduled) return;
    this.scheduled = true;
    this.host.raf((t) => this.run(t));
  }
  private run(t: number) {
    this.scheduled = false;
    const dt = this.last < 0 ? 0 : Math.min(100, t - this.last);
    this.last = t;
    this.frames++;
    this.tick(dt, t);
    if (this.needsFrame()) this.invalidate();
    else this.last = -1; // 停帧后重新计时，避免恢复时 dt 突跳
  }
}
