/**
 * 埋点（#202）：本模块只负责字段与缓冲，发送交给平台 transport（platform.telemetry.send）。
 * - track 写入内存环形缓冲（调试查看）并进待发队列；满 BATCH_MAX 条或 flushTelemetry()（boot 在切后台时调）时批量发送。
 * - 未绑定 transport（单测 / 启动前）只缓冲不发送。
 */
import type { TelemetryEvent, TelemetryTransport } from '../platform/types';

const BUF_MAX = 200;
export const BATCH_MAX = 20;
export const telemetryLog: TelemetryEvent[] = [];
let pending: TelemetryEvent[] = [];
let transport: TelemetryTransport | null = null;
let clock: () => number = () => 0;

/** boot 绑定平台 transport 与时钟；传 null 解绑 */
export function bindTelemetry(t: TelemetryTransport | null, now?: () => number) {
  transport = t;
  if (now) clock = now;
}
export function flushTelemetry() {
  if (!transport || !pending.length) return;
  const batch = pending;
  pending = [];
  try {
    transport.send(batch);
  } catch {
    // 传输失败不影响游戏（埋点尽力而为）
  }
}
export function track(ev: string, data: Record<string, unknown> = {}) {
  const e: TelemetryEvent = { ev, data, t: clock() };
  telemetryLog.push(e);
  if (telemetryLog.length > BUF_MAX) telemetryLog.shift();
  pending.push(e);
  if (pending.length > BUF_MAX) pending.shift();
  if (pending.length >= BATCH_MAX) flushTelemetry();
}
/** 单测用：清空缓冲与绑定 */
export function resetTelemetry() {
  telemetryLog.length = 0;
  pending = [];
  transport = null;
  clock = () => 0;
}
