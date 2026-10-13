/**
 * 小游戏字体加载（#205，按 #202 待定接口 `PlatformFonts.load(family, url): Promise<boolean>` 的形状准备）。
 * wx.loadFont(包内路径) 同步返回字体实际 family（或 null）；这里把调用方的逻辑字族（如 "Brush"）映射到它。
 * 失败只返回 false、不抛错，且只打一次日志；等待超时与 serif/sans-serif 降级由 boot（#202）处理。
 * 尚未接入游戏代码。
 */
export interface WxFontApi {
  loadFont(path: string): string | null | undefined;
}

export interface WechatFonts {
  load(family: string, url: string): Promise<boolean>;
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
