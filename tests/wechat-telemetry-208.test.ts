/**
 * #208 微信遥测 transport：RealtimeLogManager；run_start/run_end/run_abandon 可查；无 openid/用户标识。
 */
import { describe, expect, it } from 'vitest';
import { bindTelemetry, flushTelemetry, resetTelemetry, track } from '../src/game/telemetry';
import { createWechatTelemetry, formatTelemetryLog, stripTelemetryPii, TELEMETRY_PII_KEYS } from '../src/platform/wechat/telemetry';
import type { WxRealtimeLog } from '../src/platform/wechat/wx-api';

function mockRealtimeLog(): WxRealtimeLog & {
  infos: unknown[][];
  filters: string[];
} {
  const infos: unknown[][] = [];
  const filters: string[] = [];
  return {
    infos,
    filters,
    info: (...args: unknown[]) => void infos.push(args),
    warn: () => {},
    error: () => {},
    addFilterMsg: (msg: string) => void filters.push(msg),
    setFilterMsg: (msg: string) => void filters.push(`set:${msg}`),
  };
}

describe('#208 stripTelemetryPii', () => {
  it('剥掉 openid / userId 等用户标识，保留业务字段', () => {
    const clean = stripTelemetryPii({
      main: 'zhaoyun',
      openid: 'oXXX',
      openId: 'oYYY',
      userId: 1,
      unionid: 'u',
      nickName: '张三',
      avatarUrl: 'http://x',
      chapter: 1,
      runSeed: '42',
    });
    expect(clean).toEqual({ main: 'zhaoyun', chapter: 1, runSeed: '42' });
    expect(TELEMETRY_PII_KEYS.length).toBeGreaterThan(5);
  });
});

describe('#208 createWechatTelemetry → RealtimeLogManager', () => {
  it('run_start / run_end / run_abandon 写入 info，且带 filter 标签', () => {
    const log = mockRealtimeLog();
    const t = createWechatTelemetry(log);
    t.send([
      { ev: 'run_start', t: 10, data: { main: 'zhaoyun', sub: 'liubei', tianming: 0 } },
      { ev: 'run_end', t: 20, data: { result: 'defeat', chapter: 1, layer: 3, soul: 10, runSeed: 's' } },
      { ev: 'run_abandon', t: 30, data: { entry: 1, layer: 3, chapter: 1 } },
    ]);
    expect(log.infos).toHaveLength(3);
    const evs = log.infos.map((a) => a[1]);
    expect(evs).toEqual(['run_start', 'run_end', 'run_abandon']);
    expect(log.infos.every((a) => a[0] === 'telemetry')).toBe(true);
    // 结构化第三参含 ev + 业务字段
    const start = log.infos[0][2] as { ev: string; t: number; data: Record<string, unknown> };
    expect(start).toEqual({
      ev: 'run_start',
      t: 10,
      data: { main: 'zhaoyun', sub: 'liubei', tianming: 0 },
    });
    expect(log.filters).toEqual(['run_start', 'run_end', 'run_abandon']);
  });

  it('上报 payload 不含 openid / 用户标识（误传也会被剥）', () => {
    const log = mockRealtimeLog();
    createWechatTelemetry(log).send([
      {
        ev: 'run_start',
        t: 1,
        data: { main: 'zhaoyun', openid: 'secret', userId: 'u1', unionId: 'u2', phone: '138' },
      },
    ]);
    const payload = log.infos[0][2] as { data: Record<string, unknown> };
    const blob = JSON.stringify(payload);
    expect(blob).not.toMatch(/openid|userId|unionId|phone|secret|138/i);
    expect(payload.data).toEqual({ main: 'zhaoyun' });
  });

  it('log 为 null / 空 batch：不调用、不抛', () => {
    expect(() => createWechatTelemetry(null).send([{ ev: 'run_start', t: 0, data: {} }])).not.toThrow();
    expect(() => createWechatTelemetry(undefined).send([])).not.toThrow();
    const log = mockRealtimeLog();
    createWechatTelemetry(log).send([]);
    expect(log.infos).toHaveLength(0);
  });

  it('RealtimeLogManager.info 抛错不影响游戏', () => {
    const log: WxRealtimeLog = {
      info: () => {
        throw new Error('quota');
      },
      warn: () => {},
      error: () => {},
    };
    expect(() => createWechatTelemetry(log).send([{ ev: 'run_end', t: 0, data: { result: 'win' } }])).not.toThrow();
  });

  it('无 addFilterMsg 时回退 setFilterMsg', () => {
    const filters: string[] = [];
    const log: WxRealtimeLog & { infos: unknown[][] } = {
      infos: [],
      info: (...a) => void log.infos.push(a),
      warn: () => {},
      error: () => {},
      setFilterMsg: (m) => void filters.push(m),
    };
    createWechatTelemetry(log).send([{ ev: 'run_end', t: 0, data: {} }]);
    expect(filters).toEqual(['run_end']);
  });

  it('formatTelemetryLog 与 strip 一致', () => {
    expect(formatTelemetryLog({ ev: 'x', t: 5, data: { a: 1, openId: 'o' } })).toEqual({
      ev: 'x',
      t: 5,
      data: { a: 1 },
    });
  });
});

describe('#208 经 game/telemetry 缓冲再发到 wx transport', () => {
  it('flush 后 RealtimeLog 可见 run_* 且无 PII', () => {
    resetTelemetry();
    const log = mockRealtimeLog();
    bindTelemetry(createWechatTelemetry(log), () => 100);
    track('run_start', { main: 'zhaoyun', openid: 'leak' });
    track('run_abandon', { entry: 2, layer: 1, chapter: 1 });
    track('run_end', { result: 'defeat', abandoned: true, chapter: 1, layer: 1, soul: 0, runSeed: 's' });
    flushTelemetry();
    const evs = log.infos.map((a) => a[1]);
    expect(evs).toEqual(['run_start', 'run_abandon', 'run_end']);
    const all = JSON.stringify(log.infos);
    expect(all).not.toMatch(/openid|leak/i);
    resetTelemetry();
  });
});

describe('#208 源码不采用户信息', () => {
  it('telemetry.ts / platform 接线不含 login / getUserInfo / openid 采集', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '../src/platform/wechat');
    for (const f of ['telemetry.ts', 'platform.ts', 'entry.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/\bgetUserInfo\b|\bgetUserProfile\b|\bgetOpenId\b|\bwx\.login\b/);
      // 允许注释与剥 PII 列表里出现 openid 字样，但不允许调用采集 API
      expect(src, f).not.toMatch(/getRealtimeLogManager\([^)]*openid/i);
    }
    // transport 必须走 RealtimeLogManager
    const tel = fs.readFileSync(path.join(root, 'telemetry.ts'), 'utf8');
    expect(tel).toContain('RealtimeLog');
    expect(tel).toContain('stripTelemetryPii');
  });
});
