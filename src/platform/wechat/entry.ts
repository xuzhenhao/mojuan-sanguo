/**
 * 微信小游戏入口（`vite build --mode wechat` → dist-wechat/game.js，M2 §3.2）。
 * W4 阶段只起黑屏占位；W5（#204）在此改为 createWechatPlatform() + 共享 boot。
 */
import { startWechat, type WxStartApi } from './start';

declare const wx: WxStartApi;

startWechat(wx);
