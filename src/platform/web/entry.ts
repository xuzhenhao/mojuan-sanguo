/**
 * H5 发布入口：Canvas 引擎 + 页面流程框架（B 金漆屏风；未完成的页面先用占位场景）。
 * P5（#46）起本 Canvas 版部署在 Pages 根目录 /mojuan-sanguo/，DOM 可玩版移到 /mojuan-sanguo/debug/。
 */
import './style.css';
import { Engine } from '../../engine/engine';
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { FlowMachine, PAGES, viewOf, type FlowEvent, type Page } from '../../game/flow';
import { Router } from '../../game/router';
import { PlaceholderScene } from '../../game/scenes/placeholder';
import { RunSession } from '../../game/run';
import { initialState } from '../../game/select/model';
import { SelectScene } from '../../game/select/scene';
import { BattleOverlayDemoScene } from '../../game/scenes/battle-overlay-demo';
import { registerP4 } from '../../game/scenes/p4-register';
import { createWebPlatform, showStatusBar } from './platform';
import { ResultScene } from '../../game/result/scene';
import { buildView, type RunOutcome } from '../../game/result/settlement';
import { MetaStore, RunSaveSlot } from '../../game/result/store';
import { demoOutcome, heroName, outcomeFromSave } from '../../game/result/adapter';
import { resultBridge } from '../../game/result/bridge';
import { resumeFlow } from '../../game/result/resume';
import brushUrl from '../../../public/mockups/v3/fonts/brush.woff?url';

const root = document.getElementById('app')!;
const platform = createWebPlatform(root);
/** 配置开关：构建变量 VITE_WEBGL=0 可默认关闭；运行时 URL `?webgl=0|1` 优先 */
const cfg = { ...DEFAULT_RENDER_CONFIG, webgl: import.meta.env.VITE_WEBGL !== '0' };
const engine = new Engine(platform, {}, cfg);

const run = new RunSession();
const flow = new FlowMachine(() => (run.game ? viewOf(run.game) : null));
const send = (e: FlowEvent) => void router.send(e);
const pages: Page[] = PAGES;
for (const p of pages) engine.scenes.register(p, () => new PlaceholderScene(p, send, engine.overlays));
const query = platform.launchQuery();

// P5 结算页（#46）：离开时入账局外存档（将魂/天命解锁）并删除局内存档
const meta = new MetaStore(platform.storage);
const slot = new RunSaveSlot(platform.storage);
/** 当前结算对象：放弃本局 / 战斗页设置的 outcome；都没有时用示例（?demo=win|defeat，示例不入账） */
let abandoned: RunOutcome | null = null;
const outcome = () => abandoned ?? resultBridge.outcome ?? demoOutcome(query.demo === 'win');
const isDemo = () => !abandoned && !resultBridge.outcome;
engine.scenes.register(
  'result',
  () =>
    new ResultScene({
      overlays: engine.overlays,
      view: () => buildView(outcome(), meta.load(), heroName),
      leave(to) {
        const o = outcome();
        if (!isDemo()) meta.settle(o);
        slot.remove();
        abandoned = null;
        resultBridge.outcome = null;
        if (to === 'map' && resultBridge.restart) {
          resultBridge.restart({ main: o.heroMain, sub: o.heroSub, seed: Math.floor(platform.now() * 1000) >>> 0, tianming: o.tianming });
        }
        void router.send({ type: 'result_done', to });
      },
    }),
);
// P1 点将（#43）：出征 → core 新建局 → FlowMachine start_run → 地图
engine.scenes.register(
  'select',
  () =>
    new SelectScene({
      overlays: engine.overlays,
      initial: initialState(query),
      onStart(sel) {
        const seed = query.seed ? Number(query.seed) : Math.floor(platform.now() * 1000) >>> 0;
        run.start({ ...sel, seed });
        send({ type: 'start_run' });
      },
    }),
);
// 书法字体（马善政，与 mockups/v3/fonts 同一文件，打进发布包）：加载完成后重绘，避免系统字体回退
if (typeof FontFace !== 'undefined') {
  const brush = new FontFace('Brush', `url(${brushUrl})`);
  brush
    .load()
    .then((f) => {
      document.fonts.add(f);
      engine.invalidateAll();
    })
    .catch((e) => platform.warn('书法字体加载失败', e));
}
// P4 奖励 / 集市 / 宝箱（#45）：替换占位页
const economy = registerP4({ engine, query, safe: () => platform.systemInfo().safeArea, send, run });
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

// 状态栏（非模态系统层）：渲染路径与纹理内存。正式入口默认隐藏，`?debug=1` 或 /debug/ 路径下显示（#79）
if (showStatusBar(platform.launchQuery(), location.pathname))
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
const q = query.page as Page | undefined;
if (q && pages.includes(q)) {
  flow.page = q;
}
if (query.page === 'battle-overlay-demo') void engine.scenes.go('battle-overlay-demo');
else void router.start().then(checkResume);
engine.start();

/** H5 启动：在点将页上检查存档，弹「继续本局 / 放弃本局」（flow.md §1，PRD 5.13） */
async function checkResume() {
  if (flow.page !== 'select') return;
  const s = slot.peek();
  if (!s) return;
  const r = await resumeFlow(engine.overlays, engine, s, heroName);
  if (r === 'abandon') {
    abandoned = outcomeFromSave(s, slot.raw(), Date.now());
    void router.send({ type: 'abandon' });
  } else if (resultBridge.resume) resultBridge.resume(slot.raw());
  else platform.warn('继续本局：续玩恢复尚未接入（等待地图/战斗页的 run 模块）');
}
(window as unknown as { __mojuan: unknown }).__mojuan = { engine, flow, router, run, economy, meta, slot, resultBridge };
