/**
 * 微信小游戏入口（`vite build --mode wechat` → dist-wechat/game.js，M2 §3.2 / #204）。
 * 创建 Platform → 与 H5 共用 bootGame；不访问 window/document。
 */
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { bootGame } from '../../game/boot';
import { createWechatPlatform, paintWechatBackdrop } from './index';
import type { WxApi } from './wx-api';

declare const wx: WxApi;

const platform = createWechatPlatform(wx);
bootGame(platform, {
  // M2 默认关 WebGL（规格 §5）；启动参数 webgl=1 仍可经 launchQuery 打开探测路径
  renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: false },
  backdrop: paintWechatBackdrop,
  statusBar: false,
});
