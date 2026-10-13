/**
 * 小游戏启动占位（M2 W4 #203）：只验证 `--mode wechat` 产物能在开发者工具中跑起来（黑屏、无报错）。
 * 平台实现（W5 #204）与共享启动 boot.ts（W2 #201）合入后，由 entry.ts 改为 createWechatPlatform() → boot。
 * 这里只用传入的 wx 对象，不访问 window/document。
 */

/** 本占位用到的 wx 子集（W5 会换成完整的平台实现） */
export interface WxStartApi {
  createCanvas(): { width: number; height: number; getContext(type: '2d'): WxCtx2D | null };
  getWindowInfo?(): { windowWidth: number; windowHeight: number; pixelRatio: number };
}
interface WxCtx2D {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** 创建上屏画布（首个 wx.createCanvas 即上屏画布）并清成黑色；返回画布供后续接管 */
export function startWechat(api: WxStartApi) {
  const canvas = api.createCanvas();
  const info = api.getWindowInfo?.();
  if (info) {
    canvas.width = Math.round(info.windowWidth * info.pixelRatio);
    canvas.height = Math.round(info.windowHeight * info.pixelRatio);
  }
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
