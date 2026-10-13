/**
 * 埋点出口（最小实现）：H5 暂无上报后端，事件进内存环形缓冲；开发环境另打控制台。
 * 小游戏端 / 正式上报接入时替换 sink 即可，调用方不变。
 */
export type TelemetrySink = (ev: string, data: Record<string, unknown>) => void;

const BUF_MAX = 200;
export const telemetryLog: { ev: string; data: Record<string, unknown> }[] = [];
let sink: TelemetrySink | null = null;

export function setTelemetrySink(s: TelemetrySink | null) {
  sink = s;
}
export function track(ev: string, data: Record<string, unknown> = {}) {
  telemetryLog.push({ ev, data });
  if (telemetryLog.length > BUF_MAX) telemetryLog.shift();
  sink?.(ev, data);
}
