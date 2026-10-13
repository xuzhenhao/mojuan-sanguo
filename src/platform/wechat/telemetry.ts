/**
 * 微信埋点传输（#204 占位；正式实时日志字段与 We 分析对接见 #208）。
 * 有 getRealtimeLogManager 时写入实时日志，否则静默丢弃（不采 openid / 用户信息）。
 */
import type { TelemetryTransport } from '../types';
import type { WxRealtimeLog } from './wx-api';

export function createWechatTelemetry(log: WxRealtimeLog | null | undefined): TelemetryTransport {
  return {
    send(batch) {
      if (!log || !batch.length) return;
      try {
        for (const e of batch) log.info(e.ev, e.t, e.data);
      } catch {
        /* 传输失败不影响游戏 */
      }
    },
  };
}
