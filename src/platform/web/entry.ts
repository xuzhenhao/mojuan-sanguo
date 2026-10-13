/**
 * H5 发布入口：只做 Web 平台相关的事——创建平台、加载字体、判定状态栏，然后调 bootGame（#201）。
 * P5（#46）起本 Canvas 版部署在 Pages 根目录 /mojuan-sanguo/，DOM 可玩版移到 /mojuan-sanguo/debug/。
 */
import './style.css';
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { bootGame } from '../../game/boot';
import { refitAfterBrush } from '../../game/scenes/battle/hpview';
import { createWebPlatform, paintPaperBackdrop, showStatusBar } from './platform';
import { loadBrushFonts, webFontDeps } from './brush-font';
import wenkaiCoreUrl from '../../../public/assets/fonts/wenkai-core.woff2?url';
import wenkaiExtUrl from '../../../public/assets/fonts/wenkai-ext.woff2?url';

const root = document.getElementById('app')!;
const platform = createWebPlatform(root);
const game = bootGame(platform, {
  /** 配置开关：构建变量 VITE_WEBGL=0 可默认关闭；运行时 URL `?webgl=0|1` 优先 */
  renderConfig: { ...DEFAULT_RENDER_CONFIG, webgl: import.meta.env.VITE_WEBGL !== '0' },
  backdrop: paintPaperBackdrop,
  // 书法字体（霞鹜文楷 LXGW WenKai，OFL）：core 进首包，ext 异步补齐；CSS 族名仍为 Brush
  // #142 门控 + 失败重试；#129：Brush 到位后清牌名字号/量宽缓存再重绘
  fonts: (engine) =>
    loadBrushFonts(
      webFontDeps((m, e) => {
        if (import.meta.env.DEV) console.warn(m, e ?? '');
      }),
      { core: wenkaiCoreUrl, ext: wenkaiExtUrl },
      () => void refitAfterBrush(document.fonts, () => engine.invalidateAll()),
    ),
  // 状态栏：正式入口默认隐藏，`?debug=1` 或 /debug/ 路径下显示（#79）
  statusBar: showStatusBar(platform.launchQuery(), location.pathname),
});
(window as unknown as { __mojuan: unknown }).__mojuan = game;
