/**
 * 两端共用启动流程（M2-W2 #201；wechat-minigame-m2.md §3.1「入口复用」）：
 * engine / router / 场景注册 / 续玩检查 / 字体门控都在这里；各端 entry 只做平台创建 + 调 bootGame(platform)。
 * 字体经 platform.fonts 按 rules.fonts 加载（#202），entry 不再碰字体。
 * 约束：本文件不得 import 任何 platform/web|wechat 模块，也不碰 window / document / location。
 */
import { Engine, type EngineHooks } from '../engine/engine';
import { FlowMachine, PAGES, viewOf, type FlowEvent, type Page } from './flow';
import { Router } from './router';
import { triggerDebugRevive, wantDebugRevive } from './scenes/battle/debug-revive';
import { triggerDebugEpiphany, wantDebugEpiphany } from './scenes/battle/debug-epiphany';
import { wantDebugLing } from './scenes/battle/debug-ling';
import { BattleScene } from './scenes/battle/scene';
import { SeenBossStore } from './prefs/seen-bosses';
import { PlaceholderScene } from './scenes/placeholder';
import { RunSession } from './run';
import { initialState } from './select/model';
import { SelectScene } from './select/scene';
import { BattleOverlayDemoScene } from './scenes/battle-overlay-demo';
import { bindMapRun, createMapScene, mapSession } from './map';
import { CONFIG_VERSION, noticeText } from './run/state';
import { NOTICE_BOTTOM, NOTICE_TOP, NOTICE_TOP_DEFAULT, setNoticeBottom, setNoticeTop, showNotice } from './overlays/notice';
import { registerP4 } from './scenes/p4-register';
import { drawEventEasy } from './event/logic';
import { poolsOf } from '../data/map';
import { DESIGN_RECT } from '../engine/viewport';
import { ResultScene } from './result/scene';
import { buildView, type RunOutcome } from './result/settlement';
import { MetaStore, RunSaveSlot } from './result/store';
import { demoOutcome, heroName, outcomeFromRunState, outcomeFromSave } from './result/adapter';
import { resultBridge } from './result/bridge';
import { resumeFlow, resumePlan, showVersionDialog } from './result/resume';
import { abandonRun, resumeFailure } from './result/abandon';
import { pauseFlow } from './result/pause';
import { SettingsStore, battleSettings } from './prefs/settings';
import type { Platform } from '../platform/types';
import type { RenderConfig } from '../engine/settings';
import { brushFont, loadGameFonts, setFontPlatform } from './fonts';
import { FONTS } from '../data/config';
import { refitFonts } from './scenes/battle/hpview';
import { setReducedMotionSource } from './motion';
import { bindTelemetry, flushTelemetry, trackMatch } from './telemetry';

export interface BootOptions {
  /** 渲染配置（入口按构建变量决定，如 VITE_WEBGL） */
  renderConfig: RenderConfig;
  /** 底纹层绘制（H5：paintPaperBackdrop） */
  backdrop?: EngineHooks['backdrop'];
  /** 是否显示状态栏（渲染路径 / 纹理内存，#79） */
  statusBar?: boolean;
}

export function bootGame(platform: Platform, opts: BootOptions) {
  /** 底纹层：真实视口 W×H 铺满宣纸色（cover），设计框外的余量不留黑边（render-spec §4.0） */
  setFontPlatform(FONTS, platform.name);
  setReducedMotionSource(() => platform.prefersReducedMotion());
  bindTelemetry(platform.telemetry, () => platform.now());
  platform.onHide(flushTelemetry);
  const engine = new Engine(platform, { backdrop: opts.backdrop }, opts.renderConfig);
  /** 场景安全区一律用设计坐标：设备安全区已在引擎缩放时扣除 */
  const designSafe = () => ({ ...DESIGN_RECT });

  const run = new RunSession();
  // #122 PR2：本局唯一数据源 RunState，存档只写新键 mojuan.runstate.v1（旧键读到即迁移并删除）
  run.store = platform.storage;
  bindMapRun(run, platform.storage);
  // 有 core Game 读战斗视图；续玩后（game 未建）由 RunState 推出（奖励 / 事件 / 营地节点都读同一份 state）
  const flow = new FlowMachine(() => (run.game ? viewOf(run.game) : run.view));
  // toast 起点跟随当前页 HUD（不盖 HUD）
  setNoticeTop(() => NOTICE_TOP[flow.page] ?? NOTICE_TOP_DEFAULT);
  setNoticeBottom(() => NOTICE_BOTTOM[flow.page] ?? null);
  const send = (e: FlowEvent) => void router.send(e);
  const pages: Page[] = PAGES;
  for (const p of pages) engine.scenes.register(p, () => new PlaceholderScene(p, send, engine.overlays));
  const query = platform.launchQuery();

  // P5 结算页（#46）：离开时入账局外存档（将魂/天命解锁）并删除局内存档
  const meta = new MetaStore(platform.storage);
  const slot = new RunSaveSlot(platform.storage);
  /** 暂停/设置浮层的局外偏好（mojuan.prefs.v1，#108） */
  const settingsStore = new SettingsStore(platform.storage);
  /** 当前结算对象：放弃本局 / 战斗页设置的 outcome；都没有时用示例（?demo=win|defeat，示例不入账） */
  let abandoned: RunOutcome | null = null;
  /** #212：整局结束（Boss 收入 / 战斗失败）由真实 RunState 生成并缓存，示例只在没有进行中的局时用 */
  let killer: string | undefined;
  const outcome = () => {
    if (!abandoned && !resultBridge.outcome && run.active) resultBridge.outcome = outcomeFromRunState(run.state, { now: Date.now(), killer });
    return abandoned ?? resultBridge.outcome ?? demoOutcome(query.demo === 'win');
  };
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
          if (!isDemo() && !abandoned) {
            const st = run.active ? run.state : null;
            const boss = st?.map?.nodes.find((n) => n.type === 'BOSS')?.id;
            trackMatch('run_end', {
              result: o.win ? 'victory' : 'defeat',
              abandoned: false,
              chapter: o.chapter,
              layer: o.layer,
              tianming: o.tianming,
              boss_node: boss,
              death_node: o.win ? undefined : (st?.ended?.nodeId ?? undefined),
              duration_ms: o.durationMs,
              runSeed: o.runSeed,
            });
          }
          slot.remove();
          run.clear();
          abandoned = null;
          killer = undefined;
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
          run.begin({ ...sel, seed }, platform.storage, { configVersion: CONFIG_VERSION, now: Date.now() });
          send({ type: 'start_run' });
        },
      }),
  );
  // 字体（#202）：经 platform.fonts 按 rules.fonts 加载；首帧等门控字体（最多 gateTimeoutMs），超时 / 失败回退系统字体
  const fontsReady = loadGameFonts(platform.fonts, FONTS, platform.name, {
    warn: (m) => platform.warn(m),
    onLoaded: () => refitFonts(() => engine.invalidateAll()),
  });
  const framesReleased = engine.holdFramesUntil(fontsReady);
  // P3 地图（#44）：局种子取点将出征时 core 建局的种子
  engine.scenes.register('map', () =>
    createMapScene(
      engine,
      (e, p) => void router.send(e, p),
      undefined,
      () => run.params?.seed,
      () => run.params,
      () => void openPause(),
    ),
  );
  // P4 奖励 / 集市 / 宝箱（#45）：替换占位页
  const economy = registerP4({ engine, query, safe: designSafe, send, run, eventBattle });
  /**
   * 奇遇进战斗（#91 V13 剿灭 / 事件池抽空）：easy 池独立抽组包写到该奇遇节点，倍率进 RunState，
   * 以 BATTLE 类型重新进节点（新快照：刷新重打同一组包），再路由战斗页。
   */
  function eventBattle(goldMult: number) {
    const pend = run.inNode;
    if (!run.active || !pend) return send({ type: 'event_battle' });
    const st = run.state;
    const { encounterId, group } = drawEventEasy(st.runSeed, st.chapter, pend.id, poolsOf(st.chapter));
    run.update((d) => {
      const n = d.map?.nodes.find((x) => x.id === pend.id);
      if (n) n.encounterId = encounterId;
      if (goldMult > 1) d.eventGoldMult = goldMult;
    });
    run.enterNode({ id: pend.id, type: 'BATTLE' }, platform.storage);
    void router.send({ type: 'event_battle' }, { nodeId: pend.id, nodeType: 'BATTLE', encounterName: group.name, enemies: group.enemies });
  }
  // P1a：战斗页正式场景（已接入 P1b #64：响应弹窗 makeRespond + LongPressDetail）
  let battleScene: BattleScene | null = null;
  engine.scenes.register(
    'battle',
    () =>
      (battleScene = new BattleScene({
        // 暂停/设置浮层的设置项（#108）：每次进战斗读一次局外偏好
        ...battleSettings(settingsStore.load()),
        overlays: engine.overlays,
        now: () => platform.now(),
        safe: designSafe(),
        measure: () => engine.surfaces.main.ctx,
        paused: () => engine.scenes.isPaused,
        debugDefaults: import.meta.env.MODE === 'debug',
        nodeType: () => run.inNode?.type,
        seenBosses: new SeenBossStore(platform.storage),
        // 仅开发构建：UI 截图验收参数（#129），生产构建整段被摇掉
        dev: import.meta.env.DEV
          ? {
              hp: Number(query.hp) || undefined,
              maxHp: Number(query.maxHp) || undefined,
              ehp: Number(query.ehp) || undefined,
              boss: query.boss === '1',
              longName: query.longname === '1',
              detail: query.detail || undefined,
              intro: query.intro === 'first' || query.intro === 'repeat' || query.intro === 'phase' ? query.intro : undefined,
              introT: query.introT != null && query.introT !== '' ? Number(query.introT) : undefined,
            }
          : undefined,
        warn: (m) => platform.warn(m),
        onEnd: (win) => {
          const pend = run.inNode;
          if (run.active && run.game) {
            run.settleBattle(win);
            if (!win) killer = run.game.en.find((e) => e.hp > 0)?.name;
            if (win) run.completeNode(platform.storage);
            else run.endRun(platform.storage); // 失败：存档标记「结束本局」，刷新直接进结算页
            // 胜利 → 奖励页也是一个节点：先存进节点快照，刷新后奖励候选一致
            if (win && pend) run.enterNode({ id: `${pend.id}#reward`, type: 'REWARD' }, platform.storage);
          }
          const kind = pend?.type === 'BOSS' ? 'boss' : pend?.type === 'ELITE' ? 'elite' : 'normal';
          void router.send({ type: 'battle_end', win }, win ? { kind } : undefined);
        },
        heroes: () => run.params,
        battleNo: () => (run.active ? run.battleNo : undefined),
        build: (io, p) =>
          run.active && p.nodeId && p.nodeType && p.enemies
            ? run.buildBattle(io, { nodeId: p.nodeId, nodeType: p.nodeType, encounterName: p.encounterName ?? '', enemies: p.enemies }, false)
            : null,
      })),
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

  // 状态栏（非模态系统层）：渲染路径与纹理内存。是否显示由入口判定（H5：`?debug=1` 或 /debug/ 路径，#79）
  if (opts.statusBar)
    engine.overlays.push({
      id: 'status',
      kind: 'system',
      modal: false,
      draw(s) {
        const mb = (n: number) => (n / 1048576).toFixed(1);
        s.ctx.fillStyle = '#8c7448';
        s.ctx.font = brushFont(11);
        s.ctx.fillText?.(
          `WebGL ${engine.webgl.enabled ? '开' : '关'}（${engine.webgl.reason}） · dpr ${engine.dpr} · 纹理 ${mb(engine.budget.used)}/${mb(engine.budget.totalLimit)}MB · ${flow.page}`,
          16,
          flow.page === 'battle' ? 52 : engine.height - 24,
        );
      },
    });

  // 调试 ?debug=hit（#118）：描边画出所有可点区域的命中框（≥44）。只在开发构建，正式构建整段被摇树去掉
  if (import.meta.env.DEV && query.debug === 'hit') {
    void import('../engine/hit').then(({ hitDebug }) => {
      hitDebug.on = true;
      let page = flow.page;
      engine.overlays.push({
        id: 'debug-hit',
        kind: 'system',
        modal: false,
        animating: () => true,
        draw(s) {
          if (page !== flow.page) {
            page = flow.page;
            hitDebug.rects.clear(); // 换页清空，新页重绘时 markHit 重新登记
          }
          const c = s.ctx as unknown as CanvasRenderingContext2D;
          c.save?.();
          c.strokeStyle = '#00E5FF';
          c.lineWidth = 1;
          for (const r of hitDebug.rects.values()) c.strokeRect?.(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
          c.restore?.();
        },
      });
    });
  }

  // 启动页可用 ?page=map 等直接进入（截图与测试用）
  const q = query.page as Page | undefined;
  if (q && pages.includes(q)) {
    flow.page = q;
  }
  const seed = Number(query.seed);
  if (query.page === 'battle-overlay-demo') void engine.scenes.go('battle-overlay-demo');
  else void router.start(flow.page === 'battle' && Number.isFinite(seed) ? { seed } : undefined).then(checkResume);
  // #142：首帧等霞鹜文楷 core 就绪（最多 FONT_GATE_TIMEOUT_MS），避免先用浏览器默认字体画字
  void framesReleased.then(() => engine.start());
  // 调试：?toast=2 同时弹两条提示（看堆叠样式）；?toast=1 弹一条；?version=1 弹 §21.4 确认框
  if (query.toast) {
    const n = Number(query.toast) || 1;
    const texts = ['存档已更新，本场战斗重新开始', '已回到进入此处前', '已回到本场战斗开打前'];
    const at = (ms: number) => setTimeout(() => texts.slice(0, n).forEach((t) => showNotice(engine.overlays, t, 600000)), ms);
    at(800);
  }
  if (wantDebugRevive(query, import.meta.env.DEV))
    setTimeout(() => {
      if (battleScene?.g) void triggerDebugRevive(battleScene.g);
    }, 1200);
  const debugEpi = wantDebugEpiphany(query, import.meta.env.DEV);
  if (debugEpi)
    setTimeout(() => {
      if (battleScene?.g) void triggerDebugEpiphany(battleScene.g, debugEpi, Number(query.epiN) || undefined);
    }, 1200);
  const debugLing = wantDebugLing(query, import.meta.env.DEV);
  if (debugLing)
    setTimeout(() => {
      const sc = battleScene as { applyLingQa?(k: typeof debugLing, n: number): void } | null;
      sc?.applyLingQa?.(debugLing, platform.now());
    }, 900);
  if (query.version === '1') setTimeout(() => void showVersionDialog(engine.overlays, engine), 800);

  /** H5 启动：在点将页上检查存档，弹「继续本局 / 放弃本局」（flow.md §1，PRD 5.13） */
  async function checkResume() {
    if (flow.page !== 'select') return;
    const s = slot.peek();
    if (!s) {
      // #214：JSON 截断 / 无法解析的坏档与结构损坏同口径：提示并删档
      if (slot.unreadable()) {
        platform.warn('继续本局：存档无法解析');
        const f = resumeFailure('corrupt');
        if (f.clearSave) slot.remove();
        showNotice(engine.overlays, f.text);
      }
      return;
    }
    const raw0 = slot.raw() as { ended?: unknown } | null;
    if (raw0?.ended) {
      // 已「结束本局」（战斗失败后刷新）：不弹续玩，直接进结算页
      resultBridge.outcome = { ...outcomeFromSave(s, raw0, Date.now()), abandoned: false };
      flow.page = 'result';
      flow.history.push('result');
      await engine.scenes.go('result', undefined, { durationMs: 0 });
      return;
    }
    const r = await resumeFlow(engine.overlays, engine, s, heroName);
    if (r === 'abandon') {
      abandoned = abandonRun(s, slot.raw(), Date.now(), 1);
      void router.send({ type: 'abandon' });
    } else void resumeRun();
  }

  /** 入口 2（#108）：地图暂停钮 → 暂停/设置浮层；确定放弃 → 按失败进结算页（与战斗失败同口径） */
  async function openPause() {
    if (engine.overlays.ids().includes('pause')) return;
    const r = await pauseFlow(engine.overlays, engine, settingsStore);
    if (r !== 'abandon' || !flow.can({ type: 'abandon' })) return;
    if (run.active) run.save(platform.storage);
    const s = slot.peek();
    if (!s) return platform.warn('放弃本局：没有存档');
    abandoned = abandonRun(s, slot.raw(), Date.now(), 2);
    void router.send({ type: 'abandon' });
  }

  /**
   * 继续本局（#122 PR2）：RunSession.load 读新键（旧键迁移一次并删除）；节点内中途刷新 → 回到进节点快照重进该节点。
   * 提示走通用 toast 钩子 noticeText（PR3 出正式样式）。
   */
  async function resumeRun() {
    const r = run.load(platform.storage, { configVersion: CONFIG_VERSION });
    if (!r.ok) {
      // 损坏 / 新版本存档：提示后留在点将页（不留空白页）；损坏档删掉，免得每次启动都弹
      platform.warn(`继续本局：读档失败（${r.reason}）`);
      const f = resumeFailure(r.reason);
      if (f.clearSave) slot.remove();
      showNotice(engine.overlays, f.text);
      return;
    }
    let st = run.state;
    const pend = st.pendingNode;
    const plan = resumePlan({ configChanged: r.configChanged, migration: r.migration, pendingType: pend?.type ?? null, toast: noticeText(r.notice, pend) });
    if (plan.upgradeConfig) st = run.update((d) => void (d.configVersion = CONFIG_VERSION));
    // §21.4：战斗中版本不一致 → 先弹「继续」确认框，点击后本场战斗从第 1 回合重开（进节点快照）；不叠 toast
    if (plan.dialog) await showVersionDialog(engine.overlays, engine).result;
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
    } else if (pend?.type === 'SHOP') await go('shop', { kind: 'shop' });
    else if (pend?.type === 'CHEST') await go('chest', { kind: 'chest' });
    else if (pend?.type === 'EVENT') await go('event', { kind: 'event', nodeId: pend.id });
    else if (pend?.type === 'REST') {
      const n = st.map?.nodes.find((x) => x.id === pend.id);
      await go('rest', { kind: 'rest', nodeId: pend.id, layer: n?.layer, fixed: n?.layer === 8 });
    } else await go('map');
    showNotice(engine.overlays, plan.toast);
  }
  return { engine, flow, router, run, economy, meta, slot, resultBridge };
}
