/**
 * 小游戏字体加载（#205）：实现 #202/`PlatformFonts.load(family, url): Promise<boolean>`。
 * 微信小游戏用 wx.loadFont(包内路径)（同步返回实际 family 或 null；不支持远程 URL）。
 * 失败只返回 false、不抛错，且只打一次日志；门控超时与 serif/sans-serif 降级由 game/fonts.ts（#202）处理。
 * #204 平台实现时挂到 Platform.fonts；本模块不碰 window/document。
 */
import type { PlatformFonts } from '../types';

export interface WxFontApi {
  /** 微信小游戏：wx.loadFont(包内路径) → 实际 family / null */
  loadFont(path: string): string | null | undefined;
}

export interface WechatFonts extends PlatformFonts {
  /** 逻辑字族 → wx 返回的实际 family；未加载成功时返回 undefined */
  resolve(family: string): string | undefined;
}

export function createWechatFonts(api: WxFontApi, log: (msg: string) => void = (m) => console.warn(m)): WechatFonts {
  const families = new Map<string, string>();
  let logged = false;
  const fail = (msg: string) => {
    if (!logged) {
      logged = true;
      log(msg);
    }
    return false;
  };
  return {
    async load(family, url) {
      try {
        const actual = api.loadFont(url);
        if (!actual) return fail(`[fonts] wx.loadFont 失败：${family} ← ${url}`);
        families.set(family, actual);
        return true;
      } catch (e) {
        return fail(`[fonts] wx.loadFont 异常：${family} ← ${url}：${(e as Error)?.message ?? String(e)}`);
      }
    },
    resolve: (family) => families.get(family),
  };
}
