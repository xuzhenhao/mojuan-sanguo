/**
 * H5 发布入口：Canvas 引擎 + 页面流程框架（B 金漆屏风；未完成的页面先用占位场景）。
 * P5（#46）起本 Canvas 版部署在 Pages 根目录 /mojuan-sanguo/，DOM 可玩版移到 /mojuan-sanguo/debug/。
 */
import './style.css';
import { Engine } from '../../engine/engine';
import { DEFAULT_RENDER_CONFIG } from '../../engine/settings';
import { FlowMachine, PAGES, viewOf, type FlowEvent, type Page } from '../../game/flow';
import { Router } from '../../game/router';
import { BattleScene } from '../../game/scenes/battle/scene';
import { PlaceholderScene } from '../../game/scenes/placeholder';
import { RunSession } from '../../game/run';
import { initialState } from '../../game/select/model';
import { SelectScene } from '../../game/select/scene';
import { BattleOverlayDemoScene } from '../../game/scenes/battle-overlay-demo';
import { bindMapRun, createMapScene, mapSession } from '../../game/map';
import { noticeText } from '../../game/run/state';
import { showNotice } from '../../game/overlays/notice';
import { registerP4 } from '../../game/scenes/p4-register';
import { createWebPlatform, paintPaperBackdrop, showStatusBar } from './platform';
import { DESIGN_RECT } from '../../engine/viewport';
import { ResultScene } from '../../game/result/scene';
import { buildView, type RunOutcome } from '../../game/result/settlement';
import { MetaStore, RunSaveSlot } from '../../game/result/store';
import { demoOutcome, heroName, outcomeFromSave } from '../../game/result/adapter';
import { resultBridge } from '../../game/result/bridge';
import { resumeFlow } from '../../game/result/resume';
import wenkaiCoreUrl from '../../../public/assets/fonts/wenkai-core.woff2?url';
import wenkaiExtUrl from '../../../public/assets/fonts/wenkai-ext.woff2?url';

const root = document.getElementById('app')!;
const platform = createWebPlatform(root);
/** 配置开关：构建变量 VITE_WEBGL=0 可默认关闭；运行时 URL `?webgl=0|1` 优先 */
const cfg = { ...DEFAULT_RENDER_CONFIG, webgl: import.meta.env.VITE_WEBGL !== '0' };
/** 底纹层：真实视口 W×H 铺满宣纸色（cover），设计框外的余量不留黑边（render-spec §4.0） */
const engine = new Engine(platform, { backdrop: paintPaperBackdrop }, cfg);
/** 场景安全区一律用设计坐标：设备安全区已在引擎缩放时扣除 */
const designSafe = () => ({ ...DESIGN_RECT });

const run = new RunSession();
// #122 PR2：本局唯一数据源 RunState，存档只写新键 mojuan.runstate.v1（旧键读到即迁移并删除）
run.store = platform.storage;
bindMapRun(run, platform.storage);
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
        run.clear();
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
// 书法字体（霞鹜文楷 LXGW WenKai，OFL）：core 进首包，ext 异步补齐；CSS 族名仍为 Brush
if (typeof FontFace !== 'undefined') {
  const loadBrush = (url: string, kind: string) =>
    new FontFace('Brush', `url(${url}) format('woff2')`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        engine.invalidateAll();
      })
      .catch((e) => platform.warn(`书法字体 ${kind} 加载失败`, e));
  void loadBrush(wenkaiCoreUrl, 'core').then(() => void loadBrush(wenkaiExtUrl, 'ext'));
}
// P3 地图（#44）：局种子取点将出征时 core 建局的种子
engine.scenes.register('map', () =>
  createMapScene(
    engine,
    (e, p) => void router.send(e, p),
    undefined,
    () => run.params?.seed,
    () => run.params,
  ),
);
// P4 奖励 / 集市 / 宝箱（#45）：替换占位页
const economy = registerP4({ engine, query, safe: designSafe, send, run });
// P1a：战斗页正式场景（已接入 P1b #64：响应弹窗 makeRespond + LongPressDetail）
engine.scenes.register(
  'battle',
  () =>
    new BattleScene({
      overlays: engine.overlays,
      now: () => platform.now(),
      safe: designSafe(),
      measure: () => engine.surfaces.main.ctx,
      paused: () => engine.scenes.isPaused,
      debugDefaults: import.meta.env.MODE === 'debug',
      warn: (m) => platform.warn(m),
      onEnd: (win) => {
        const pend = run.inNode;
        if (run.active && run.game) {
          run.settleBattle(win);
          run.completeNode(platform.storage);
          // 胜利 → 奖励页也是一个节点：先存进节点快照，刷新后奖励候选一致
          if (win && pend) run.enterNode({ id: `${pend.id}#reward`, type: 'REWARD' }, platform.storage);
        }
        const kind = pend?.type === 'BOSS' ? 'boss' : pend?.type === 'ELITE' ? 'elite' : 'normal';
        void router.send({ type: 'battle_end', win }, win ? { kind } : undefined);
      },
      heroes: () => run.params,
      build: (io, p) =>
        run.active && p.nodeId && p.nodeType && p.enemies
          ? run.buildBattle(io, { nodeId: p.nodeId, nodeType: p.nodeType, encounterName: p.encounterName ?? '', enemies: p.enemies })
          : null,
    }),
);
const router = new Router(flow, engine.scenes);
// P1b 演示页（?page=battle-overlay-demo）：响应弹窗 + 长按详情
engine.scenes.register(
  'battle-overlay-demo',
  () =>
    new BattleOverlayDemoScene({
      overlays: engine.overlays,
      safe: designSafe,
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
        flow.page === 'battle' ? 52 : engine.height - 24,
      );
    },
  });

// 启动页可用 ?page=map 等直接进入（截图与测试用）
const q = query.page as Page | undefined;
if (q && pages.includes(q)) {
  flow.page = q;
}
const seed = Number(query.seed);
if (query.page === 'battle-overlay-demo') void engine.scenes.go('battle-overlay-demo');
else void router.start(flow.page === 'battle' && Number.isFinite(seed) ? { seed } : undefined).then(checkResume);
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
  } else void resumeRun();
}

/**
 * 继续本局（#122 PR2）：RunSession.load 读新键（旧键迁移一次并删除）；节点内中途刷新 → 回到进节点快照重进该节点。
 * 提示走通用 toast 钩子 noticeText（PR3 出正式样式）。
 */
async function resumeRun() {
  const r = run.load(platform.storage, { configVersion: 'dev' });
  if (!r.ok) {
    platform.warn(`继续本局：读档失败（${r.reason}）`);
    return;
  }
  const st = run.state;
  const pend = st.pendingNode;
  const go = (page: Page, params?: unknown) => {
    flow.page = page;
    flow.history.push(page);
    return engine.scenes.go(page, params, { durationMs: 0 });
  };
  if (pend && (pend.type === 'BATTLE' || pend.type === 'ELITE' || pend.type === 'BOSS')) {
    const node = st.map?.nodes.find((n) => n.id === pend.id) as { encounterId?: string } | undefined;
    const grp = node?.encounterId ? mapSession(engine, st.chapter, st.runSeed).group(node.encounterId) : null;
    await go('battle', { nodeId: pend.id, nodeType: pend.type, encounterName: grp?.name ?? '', enemies: grp?.enemies ?? [] });
  } else if (pend?.type === 'REWARD') {
    const t = st.map?.nodes.find((n) => `${n.id}#reward` === pend.id)?.type;
    await go('reward', { kind: t === 'BOSS' ? 'boss' : t === 'ELITE' ? 'elite' : 'normal' });
  }
  else if (pend?.type === 'SHOP') await go('shop', { kind: 'shop' });
  else if (pend?.type === 'CHEST') await go('chest', { kind: 'chest' });
  else await go('map');
  showNotice(engine.overlays, noticeText(r.notice, pend));
}
(window as unknown as { __mojuan: unknown }).__mojuan = { engine, flow, router, run, economy, meta, slot, resultBridge };
