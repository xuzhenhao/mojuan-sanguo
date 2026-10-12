/**
 * H5 发布入口：Canvas 引擎 + 页面流程框架（B 金漆屏风 6 个页面先用占位场景）。
 * 可玩的 DOM 版部署在 Pages 根目录 /mojuan-sanguo/，本 Canvas 版在 /mojuan-sanguo/next/（P5 #46 对调）。
 */
import './style.css';
import { Engine } from '../../engine/engine';
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { FlowMachine, PAGES, type FlowEvent, type Page } from '../../game/flow';
import { Router } from '../../game/router';
import { PlaceholderScene } from '../../game/scenes/placeholder';
import { BattleOverlayDemoScene } from '../../game/scenes/battle-overlay-demo';
import { registerP4 } from '../../game/scenes/p4-register';
import { createWebPlatform } from './platform';

const root = document.getElementById('app')!;
const platform = createWebPlatform(root);
/** 配置开关：构建变量 VITE_WEBGL=0 可默认关闭；运行时 URL `?webgl=0|1` 优先 */
const cfg = { ...DEFAULT_RENDER_CONFIG, webgl: import.meta.env.VITE_WEBGL !== '0' };
const engine = new Engine(platform, {}, cfg);

const flow = new FlowMachine();
const send = (e: FlowEvent) => void router.send(e);
const pages: Page[] = PAGES;
for (const p of pages) engine.scenes.register(p, () => new PlaceholderScene(p, send, engine.overlays));
// P4 奖励 / 集市 / 宝箱（#45）：替换占位页
const economy = registerP4({ engine, query: platform.launchQuery(), safe: () => platform.systemInfo().safeArea, send });
const router = new Router(flow, engine.scenes);
// P1b 演示页（?page=battle-overlay-demo）：响应弹窗 + 长按详情
engine.scenes.register(
  'battle-overlay-demo',
  () =>
    new BattleOverlayDemoScene({
      overlays: engine.overlays,
      safe: () => platform.systemInfo().safeArea,
      measure: () => engine.surfaces.main.ctx,
      paused: () => engine.scenes.isPaused,
    }),
);

// 状态栏（非模态系统层）：渲染路径与纹理内存
engine.overlays.push({
  id: 'status',
  kind: 'system',
  modal: false,
  draw(s) {
    const mb = (n: number) => (n / 1048576).toFixed(1);
    s.ctx.fillStyle = '#8c7448';
    s.ctx.font = '11px sans-serif';
    s.ctx.fillText?.(
      `WebGL ${engine.webgl.enabled ? '开' : '关'}（${engine.webgl.reason}） · dpr ${engine.dpr} · 纹理 ${mb(engine.budget.used)}/${mb(engine.budget.totalLimit)}MB · ${flow.page}`,
      16,
      engine.height - 24,
    );
  },
});

// 启动页可用 ?page=map 等直接进入（截图与测试用）
const q = platform.launchQuery().page as Page | undefined;
if (q && pages.includes(q)) {
  flow.page = q;
}
if (platform.launchQuery().page === 'battle-overlay-demo') void engine.scenes.go('battle-overlay-demo');
else void router.start();
engine.start();
(window as unknown as { __mojuan: unknown }).__mojuan = { engine, flow, router, economy };
