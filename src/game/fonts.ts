/**
 * 首屏字体门控（#202；取代 #142 的 web/brush-font.ts，两端共用）。规则来自 rules.fonts，按平台取字体角色：
 * - 角色为 system：用系统通用字族，不加载；
 * - 只有真正要加载的 gate 字体参与门控，全部就绪才开首帧，最多 gateTimeoutMs；期间引擎只画墨底不出字（engine.holdFramesUntil）；
 * - 超时或任一失败：回退系统字体（字体栈 "族名", serif / sans-serif，字号布局不变），不提示玩家，只打一行日志；
 * - gate 字体晚到、非 gate 字体后台加载完成：调 onLoaded 清量宽缓存并重绘。
 * 加载经 platform.fonts.load，永不抛错。
 */
import type { FontRoleName, FontsConfig } from '../data/config';
import type { Platform, PlatformFonts } from '../platform/types';

type PlatformName = Platform['name'];
export interface GameFontHooks {
  warn(msg: string): void;
  /** 任一字体到位（含超时后晚到）：清量宽缓存、重绘 */
  onLoaded(): void;
  setTimeout?(fn: () => void, ms: number): unknown;
}
const ROLES: FontRoleName[] = ['brush', 'sans'];

/** 当前平台要加载的字体文件（system 角色不加载；同族同路径去重） */
export function facesOf(cfg: FontsConfig, platform: PlatformName) {
  const out: { family: string; url: string; gate: boolean }[] = [];
  for (const r of ROLES) {
    const role = cfg.platforms[platform][r];
    if (role === 'system') continue;
    for (const f of role.faces ?? []) if (!out.some((o) => o.family === role.family && o.url === f.url)) out.push({ family: role.family, ...f });
  }
  return out;
}

/** 返回 Promise 在门控字体全部就绪（true）或超时 / 失败（false）时 resolve，永不 reject；没有门控字体时立即 true */
export function loadGameFonts(fonts: PlatformFonts, cfg: FontsConfig, platform: PlatformName, h: GameFontHooks): Promise<boolean> {
  const later = h.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const safeLoad = (family: string, url: string) => fonts.load(family, url).catch(() => false);
  const faces = facesOf(cfg, platform);
  const gate = faces.filter((f) => f.gate);
  const rest = faces.filter((f) => !f.gate);
  const loadRest = () => {
    for (const f of rest) void safeLoad(f.family, f.url).then((r) => r && h.onLoaded());
  };
  if (!gate.length) {
    loadRest();
    return Promise.resolve(true);
  }
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
  return Promise.race([gateAll, timeout]).then((ok) => {
    if (!ok) {
      const roles = ROLES.filter((r) => cfg.platforms[platform][r] !== 'system')
        .map((r) => `${r}→${cfg.fallback[r]}`)
        .join('，');
      h.warn(`字体${timedOut ? `超过 ${cfg.gateTimeoutMs}ms 未就绪` : '加载失败'}，回退系统字体（${roles}）`);
    }
    loadRest();
    return ok;
  });
}

/** 字体栈：system 角色只用通用字族；否则 "族名", 通用字族 */
export function fontStack(cfg: FontsConfig, platform: PlatformName, role: FontRoleName) {
  const r = cfg.platforms[platform][role];
  return r === 'system' ? cfg.fallback[role] : `"${r.family}", ${cfg.fallback[role]}`;
}

/** 运行时字体栈（boot 按平台设置；未设置时按 web）。sans 在微信端为系统字体，所以 game 层正文字体须经此取 */
let activePlatform: PlatformName = 'web';
let activeCfg: FontsConfig | null = null;
export function setFontPlatform(cfg: FontsConfig, platform: PlatformName) {
  activeCfg = cfg;
  activePlatform = platform;
}
export const activeFontStack = (role: FontRoleName, fallbackCfg: FontsConfig) => fontStack(activeCfg ?? fallbackCfg, activePlatform, role);
