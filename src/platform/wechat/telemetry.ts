/**
 * 微信埋点传输（#208）：走 wx.getRealtimeLogManager 实时日志，不自建服务器。
 * - 字段 schema 仍在 game/telemetry.ts（#181/#202）；本模块只负责发送
 * - 永不采集 / 转发 openid 或任何用户标识（隐私指引声明「未处理」，见 wechat-minigame-m2.md §5）
 * - 无 RealtimeLogManager 时静默丢弃（devtools 可调用但不上报 / 旧基础库缺 API）
 */
import type { TelemetryEvent, TelemetryTransport } from '../types';
import type { WxRealtimeLog } from './wx-api';

/**
 * 禁止出现在上报 data 里的键（大小写不敏感）。
 * 即便上层误传也剥掉，保证验收「上报内容不含 openid/用户标识」。
 */
export const TELEMETRY_PII_KEYS = [
  'openid',
  'open_id',
  'openId',
  'unionid',
  'union_id',
  'unionId',
  'userid',
  'user_id',
  'userId',
  'uid',
  'nickname',
  'nick_name',
  'nickName',
  'avatarurl',
  'avatar_url',
  'avatarUrl',
  'phone',
  'mobile',
  'phonenumber',
  'phone_number',
  'phoneNumber',
  'session_key',
  'sessionKey',
  'token',
  'accesstoken',
  'access_token',
  'accessToken',
] as const;

const PII_KEY_SET = new Set(TELEMETRY_PII_KEYS.map((k) => k.toLowerCase()));

/** 剥掉 data 中的用户标识字段；返回新对象，不改入参 */
export function stripTelemetryPii(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (PII_KEY_SET.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/** 实时日志 FilterMsg 不能带空格；事件名截到 20 字以便后台检索 */
function filterTag(ev: string): string {
  return ev.replace(/\s+/g, '_').slice(0, 20);
}

function tagFilters(log: WxRealtimeLog, ev: string) {
  const tag = filterTag(ev);
  if (!tag) return;
  try {
    if (typeof log.addFilterMsg === 'function') log.addFilterMsg(tag);
    else if (typeof log.setFilterMsg === 'function') log.setFilterMsg(tag);
  } catch {
    /* filter 失败不影响发送 */
  }
}

/** 单条事件 → 实时日志结构化对象（可检索、无 PII） */
export function formatTelemetryLog(e: TelemetryEvent): { ev: string; t: number; data: Record<string, unknown> } {
  return { ev: e.ev, t: e.t, data: stripTelemetryPii(e.data ?? {}) };
}

/**
 * @param log `wx.getRealtimeLogManager()` 的返回值；缺省 / 抛错时传 null，send 静默
 */
export function createWechatTelemetry(log: WxRealtimeLog | null | undefined): TelemetryTransport {
  return {
    send(batch) {
      if (!log || !batch.length) return;
      try {
        for (const e of batch) {
          const payload = formatTelemetryLog(e);
          tagFilters(log, payload.ev);
          // 首参固定 'telemetry'，次参为事件名，便于后台按关键字搜 run_start / run_end / run_abandon
          log.info('telemetry', payload.ev, payload);
        }
      } catch {
        /* 传输失败不影响游戏 */
      }
    },
  };
}
