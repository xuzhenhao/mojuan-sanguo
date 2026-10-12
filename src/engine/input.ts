/**
 * 手势识别（engine-design §4.3 / render-spec §7.2）：只认第一指；
 * 移动 ≤8dp 抬起为点按；按住 ≥420ms 未移动为长按（之后不再触发点按）；移动 >8dp 进入拖拽。
 * 坐标单位为逻辑像素（dp）。长按计时由外部用 tick(now) 推进，便于测试和复用主循环。
 */
import type { TouchPoint, Vec2 } from './types';

export const GESTURE = { tapMaxMove: 8, longPressMs: 420, dragThreshold: 8 } as const;

export type GestureEvent =
  | { type: 'tap'; at: Vec2 }
  | { type: 'longpress'; at: Vec2 }
  | { type: 'longpressprogress'; at: Vec2; progress: number }
  | { type: 'dragstart' | 'dragmove' | 'dragend'; at: Vec2; start: Vec2 }
  | { type: 'cancel' };

export class GestureRecognizer {
  private id: number | null = null;
  private start: Vec2 = { x: 0, y: 0 };
  private cur: Vec2 = { x: 0, y: 0 };
  private t0 = 0;
  private state: 'idle' | 'pressing' | 'dragging' | 'longpressed' = 'idle';
  constructor(private emit: (e: GestureEvent) => void) {}

  get active() {
    return this.state !== 'idle';
  }
  down(ts: TouchPoint[], now: number) {
    if (this.id !== null || !ts.length) return; // 只认第一指
    const t = ts[0];
    this.id = t.id;
    this.start = { x: t.x, y: t.y };
    this.cur = { ...this.start };
    this.t0 = now;
    this.state = 'pressing';
  }
  move(ts: TouchPoint[]) {
    const t = ts.find((p) => p.id === this.id);
    if (!t) return;
    this.cur = { x: t.x, y: t.y };
    if (this.state === 'pressing' && Math.hypot(t.x - this.start.x, t.y - this.start.y) > GESTURE.dragThreshold) {
      this.state = 'dragging';
      this.emit({ type: 'dragstart', at: { ...this.cur }, start: { ...this.start } });
    } else if (this.state === 'dragging') this.emit({ type: 'dragmove', at: { ...this.cur }, start: { ...this.start } });
  }
  up(ts: TouchPoint[], now: number) {
    if (!ts.some((p) => p.id === this.id)) return;
    this.tick(now);
    if (this.state === 'pressing') this.emit({ type: 'tap', at: { ...this.cur } });
    else if (this.state === 'dragging') this.emit({ type: 'dragend', at: { ...this.cur }, start: { ...this.start } });
    this.reset();
  }
  cancel() {
    if (this.state !== 'idle') this.emit({ type: 'cancel' });
    this.reset();
  }
  /** 推进长按计时；返回是否仍需要继续出帧 */
  tick(now: number): boolean {
    if (this.state !== 'pressing') return false;
    const el = now - this.t0;
    if (el >= GESTURE.longPressMs) {
      this.state = 'longpressed';
      this.emit({ type: 'longpress', at: { ...this.cur } });
      return false;
    }
    this.emit({ type: 'longpressprogress', at: { ...this.cur }, progress: el / GESTURE.longPressMs });
    return true;
  }
  private reset() {
    this.id = null;
    this.state = 'idle';
  }
}
