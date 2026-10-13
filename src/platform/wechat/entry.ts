/**
 * 微信小游戏入口（`vite build --mode wechat` → dist-wechat/game.js，M2 §3.2 / #204+#206）。
 * 先读设备 benchmark（可选）再 boot；不访问 window/document。
 * 战斗帧率 / 首屏可交互时延须真机验收，本入口只接渲染倍率钩子。
 */
import { DEFAULT_RENDER_CONFIG, renderScaleFromBenchmark } from '../../engine/settings';
import { bootGame } from '../../game/boot';
import { createWechatPlatform, fetchBenchmarkLevel, paintWechatBackdrop } from './index';
import type { WxApi } from './wx-api';

declare const wx: WxApi;

void (async () => {
  const level = await fetchBenchmarkLevel(wx);
  const platform = createWechatPlatform(wx, { benchmarkLevel: level });
  const scale = renderScaleFromBenchmark(level, platform.systemInfo().platform);
  bootGame(platform, {
    // M2 默认关 WebGL（规格 §5）；启动参数 webgl=1 仍可经 launchQuery 打开探测路径
    renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: false, ...scale },
    backdrop: paintWechatBackdrop,
    statusBar: false,
  });
})();
