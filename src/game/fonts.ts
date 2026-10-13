/**
 * 首屏字体门控（#202；取代 #142 的 web/brush-font.ts，两端共用）。
 * - rules.fonts.faces 中 gate=true 的字体全部就绪才开首帧，最多 gateTimeoutMs；期间引擎只画墨底不出字（engine.holdFramesUntil）。
 * - 超时或任一失败：回退系统字体（字体栈 "Brush", serif / sans-serif，字号与布局不变），不提示玩家，只打一行日志。
 * - gate 字体晚到、gate=false 的字体后台加载完成：调 onLoaded 清量宽缓存并重绘。
 * 加载经 platform.fonts.load，永不抛错。
 */
import type { FontsConfig } from '../data/config';
import type { PlatformFonts } from '../platform/types';

export interface GameFontHooks {
  warn(msg: string): void;
  /** 任一字体到位（含超时后晚到）：清量宽缓存、重绘 */
  onLoaded(): void;
  setTimeout?(fn: () => void, ms: number): unknown;
}

/** 返回 Promise 在门控字体全部就绪（true）或超时 / 失败（false）时 resolve，永不 reject */
export function loadGameFonts(fonts: PlatformFonts, cfg: FontsConfig, h: GameFontHooks): Promise<boolean> {
  const later = h.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const safeLoad = (family: string, url: string) => fonts.load(family, url).catch(() => false);
  const gate = cfg.faces.filter((f) => f.gate);
  const rest = cfg.faces.filter((f) => !f.gate);
  const gateAll = Promise.all(gate.map((f) => safeLoad(f.family, f.url))).then((rs) => rs.every(Boolean));
  let timedOut = false;
  const timeout = new Promise<boolean>((r) =>
    later(() => {
      timedOut = true;
      r(false);
    }, cfg.gateTimeoutMs),
  );
  void gateAll.then((ok) => {
    if (ok) h.onLoaded();
  });
  const result = Promise.race([gateAll, timeout]).then((ok) => {
    if (!ok)
      h.warn(
        `字体${timedOut ? `超过 ${cfg.gateTimeoutMs}ms 未就绪` : '加载失败'}，回退系统字体（${cfg.families.brush}→${cfg.fallback.brush}，${cfg.families.sans}→${cfg.fallback.sans}）`,
      );
    for (const f of rest) void safeLoad(f.family, f.url).then((r) => r && h.onLoaded());
    return ok;
  });
  return result;
}

/** 字体栈：族名 + 系统回退（与配置一致，供 game 层拼 ctx.font） */
export const fontStack = (cfg: FontsConfig, kind: 'brush' | 'sans') => `"${cfg.families[kind]}", ${cfg.fallback[kind]}`;
