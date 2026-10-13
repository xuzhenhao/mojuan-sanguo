import { describe, expect, it } from 'vitest';
import { showStatusBar } from '../src/platform/web/platform';
import { battleResultDelta, emptyStats, mergeStats, parseStats } from '../src/game/run/stats';
import { OverlayStack } from '../src/engine/modal';
import { SceneManager, CUT } from '../src/engine/scene';
import { FlowMachine } from '../src/game/flow';
import { Router } from '../src/game/router';
import { PAGE_ACTIONS, PlaceholderScene } from '../src/game/scenes/placeholder';
import { demoOutcome, outcomeFromGame, outcomeFromSave } from '../src/game/result/adapter';
import { ABANDON_TEXT, dialogButtons, ABANDON_H, RESUME_H, resumeFlow } from '../src/game/result/resume';
import { RESULT_LAYOUT, ResultScene } from '../src/game/result/scene';
import { EMPTY_META, applyOutcome, buildView, computeSoul, fmtDuration, unlockAfter, type RunOutcome } from '../src/game/result/settlement';
import { MetaStore, RUN_SAVE_KEY, RunSaveSlot, summarize } from '../src/game/result/store';
import PAGES_CONFIG, { PAGES_BASE } from '../vite.config';
import { fakeCanvas } from './engine-fakes';
import { mkGame } from './helpers';

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const frameCtx = { width: 390, height: 844, invalidate() {} };
const surface = () => {
  const c = fakeCanvas(390, 844);
  return { canvas: c, ctx: c.ctx2d } as never;
};

describe('将魂公式（PRD 14.5）', () => {
  it('胜利：通关章×30 + 精英×8 + 胜场×2 + Boss×40，再乘天命加成', () => {
    const o = demoOutcome(true); // 1 章、精英 2、胜 7、Boss 1、天命 1
    const s = computeSoul(o);
    expect(s.base).toBe(30 + 16 + 14 + 40);
    expect(s.afterDefeat).toBe(100);
    expect(s.total).toBe(110);
    expect(s.lines.map((l) => l.value)).toEqual([30, 16, 14, 40]);
  });
  it('失败与放弃：×0.5 向下取整；天命 3 时 ×1.3 无浮点误差', () => {
    const o: RunOutcome = { ...demoOutcome(false), tianming: 3 }; // 精英 1、胜 4 → 16
    const s = computeSoul(o);
    expect(s.base).toBe(16);
    expect(s.afterDefeat).toBe(8);
    expect(s.total).toBe(10);
    expect(computeSoul({ ...o, tianming: 0, stats: { ...o.stats, battlesWon: 5 } }).afterDefeat).toBe(9); // 18×0.5
    expect(computeSoul({ ...o, tianming: 3, stats: { ...o.stats, elitesKilled: 0, battlesWon: 5 } }).total).toBe(6); // 10→5×1.3=6.5→6
  });
});

describe('解锁与局外存档（PRD 15.1/15.3）', () => {
  it('通关天命 N 解锁 N+1；失败、低于已解锁档或天命 10 不解锁', () => {
    const meta = { ...EMPTY_META, tianmingUnlocked: 1 };
    expect(unlockAfter({ ...demoOutcome(true), tianming: 1 }, meta)).toBe('解锁天命 2');
    expect(unlockAfter({ ...demoOutcome(true), tianming: 0 }, meta)).toBeNull();
    expect(unlockAfter(demoOutcome(false), meta)).toBeNull();
    expect(unlockAfter({ ...demoOutcome(true), tianming: 10 }, { ...meta, tianmingUnlocked: 10 })).toBeNull();
  });
  it('入账幂等：同一 runSeed 只记一次', () => {
    const o = { ...demoOutcome(true), tianming: 0 };
    const a = applyOutcome(EMPTY_META, o);
    expect(a).toMatchObject({ soul: 100, tianmingUnlocked: 1, runs: 1, wins: 1 });
    expect(applyOutcome(a, o)).toBe(a);
  });
  it('MetaStore 读写；损坏数据回退为空', () => {
    const st = memStorage();
    const ms = new MetaStore(st);
    expect(ms.load().soul).toBe(0);
    ms.settle(demoOutcome(false));
    expect(ms.load().soul).toBe(computeSoul(demoOutcome(false)).total);
    st.set(ms.key, '{bad');
    expect(ms.load()).toEqual(EMPTY_META);
  });
});

describe('结算页 8 项（PRD 14.5）', () => {
  it('buildView 给出结果、阵容、战报、牌组、将魂、解锁、进化牌', () => {
    const v = buildView(demoOutcome(true), { ...EMPTY_META, soul: 500, tianmingUnlocked: 1 }, (id) => ({ H03: '赵云', H04: '刘备' })[id] ?? id);
    expect(v.title).toBe('大捷');
    expect(v.reach).toBe('第一章 · 黄巾 · Boss');
    expect(v.duration).toBe('31:12');
    expect(v.lineup).toEqual({ main: '赵云', sub: '刘备', combo: undefined });
    expect(v.report.map((r) => r.label)).toEqual(['战斗胜利', '总回合数', '造成伤害', '承受伤害', '最大单回合掉血', '灵光一闪', '复活']);
    expect(v.report[0].value).toBe('7（普通 4 / 精英 2 / Boss 1）');
    expect(v.evolved.map((c) => c.name)).toEqual(['杀', '闪', '桃']);
    expect(v.soulTotalBefore).toBe(500);
    expect(v.unlock).toBe('解锁天命 2');
    expect(fmtDuration(3_725_000)).toBe('1:02:05');
  });
  it('场景：绘制不抛错；长按出明细浮层；底栏点按离开且防连点', () => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const left: string[] = [];
    const sc = new ResultScene({ overlays: ov, view: () => buildView(demoOutcome(false), EMPTY_META), leave: (to) => left.push(to) });
    sc.enter(frameCtx);
    for (const l of ['bg', 'ambient', 'main'] as const) sc.draw(l, surface());
    expect(sc.animating()).toBe(true);
    sc.update(900);
    expect(sc.animating()).toBe(false);
    const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    expect(sc.gesture({ type: 'longpress', at: mid(RESULT_LAYOUT.soul) })).toBe(true);
    expect(ov.ids()).toEqual(['result-detail:soul']);
    expect(sc.details('soul').lines).toContain('失败 ×0.5（向下取整）= 8');
    ov.draw(surface(), 0);
    sc.gesture({ type: 'tap', at: mid(RESULT_LAYOUT.again) });
    sc.gesture({ type: 'tap', at: mid(RESULT_LAYOUT.back) });
    expect(left).toEqual(['map']);
    sc.exit();
    expect(ov.size).toBe(0);
  });
  it('场景内不再自行缩放：rect 即设计坐标（缩放由引擎统一做，#111）', () => {
    const sc = new ResultScene({ view: () => buildView(demoOutcome(true), EMPTY_META), leave() {} });
    sc.enter(frameCtx);
    const r = sc.rect(RESULT_LAYOUT.back);
    expect(r).toEqual(RESULT_LAYOUT.back);
    expect(sc.hit({ x: r.x + 5, y: r.y + 5 })).toBe('back');
  });
});

describe('流程：结算出口与放弃本局（PRD 4.5 / 5.13）', () => {
  it('再来一局 → 地图；返回点将 → 点将；未指定默认点将', () => {
    const f = new FlowMachine();
    f.page = 'result';
    expect(f.send({ type: 'result_done', to: 'map' })).toBe('map');
    f.page = 'result';
    expect(f.send({ type: 'result_done', to: 'select' })).toBe('select');
    f.page = 'result';
    expect(f.send({ type: 'result_done' })).toBe('select');
  });
  it('放弃本局：点将（启动弹窗）、地图、战斗、奖励、集市都能进入结算；结算页不接受', () => {
    for (const p of ['select', 'map', 'battle', 'reward', 'shop'] as const) {
      const f = new FlowMachine();
      f.page = p;
      expect(f.send({ type: 'abandon' })).toBe('result');
    }
    const f = new FlowMachine();
    f.page = 'result';
    expect(f.can({ type: 'abandon' })).toBe(false);
  });
});

describe('启动续玩弹窗 → 放弃 → 二次确认 → 败北结算 → 删档（UI #62/#73）', () => {
  const save = {
    heroMain: 'H03',
    heroSub: 'H04',
    chapter: 1,
    runSeed: 99,
    hp: 5,
    maxHp: 8,
    gold: 86,
    tianming: 0,
    deck: [
      { id: 'sha', mods: ['x'] },
      { id: 'shan', mods: [] },
    ],
    reviveLeft: 0,
    stats: { battlesWon: 3, elitesKilled: 1 },
    mapState: { current: 'n5', nodes: [{ id: 'n5', layer: 5 }] },
  };
  it('摘要解析：层数取自 mapState.current；结构不对返回 null', () => {
    expect(summarize(save)).toMatchObject({ layer: 5, deckSize: 2, hp: 5, maxHp: 8 });
    expect(summarize({ foo: 1 })).toBeNull();
    const st = memStorage();
    st.set(RUN_SAVE_KEY, 'not json');
    expect(new RunSaveSlot(st).peek()).toBeNull();
  });
  it('放弃 → 返回 → 回到续玩弹窗；再放弃 → 确定放弃 → abandon；文案一字不差', async () => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const s = summarize(save)!;
    const p = resumeFlow(ov, frameCtx, s);
    const tap = (r: { x: number; y: number; w: number; h: number }) => ov.gesture({ type: 'tap', at: { x: r.x + 4, y: r.y + 4 } });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    ov.draw(surface(), 0);
    expect(ov.ids()).toEqual(['resume']);
    expect(ov.gesture({ type: 'tap', at: { x: 2, y: 2 } })).toBe(true); // 点外部不关闭
    expect(ov.ids()).toEqual(['resume']);
    tap(dialogButtons(frameCtx, RESUME_H).left); // 放弃本局
    await tick();
    expect(ov.ids()).toEqual(['abandon']);
    ov.draw(surface(), 0);
    tap(dialogButtons(frameCtx, ABANDON_H).left); // 返回
    await tick();
    expect(ov.ids()).toEqual(['resume']);
    tap(dialogButtons(frameCtx, RESUME_H).left);
    await tick();
    tap(dialogButtons(frameCtx, ABANDON_H).right); // 确定放弃
    expect(await p).toBe('abandon');
    expect(ABANDON_TEXT).toBe('放弃后本局按失败结算，将魂减半，存档将被删除。确定放弃？');
  });
  it('继续本局 → continue', async () => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const p = resumeFlow(ov, frameCtx, summarize(save)!);
    const r = dialogButtons(frameCtx, RESUME_H).right;
    ov.gesture({ type: 'tap', at: { x: r.x + 4, y: r.y + 4 } });
    expect(await p).toBe('continue');
  });
  it('端到端：放弃后进入败北结算（将魂减半），离开结算页才删存档并入账', async () => {
    const st = memStorage();
    st.set(RUN_SAVE_KEY, JSON.stringify(save));
    const slot = new RunSaveSlot(st);
    const meta = new MetaStore(st);
    const o = outcomeFromSave(slot.peek()!, slot.raw(), 0);
    expect(o).toMatchObject({ win: false, abandoned: true, reviveUsed: true, layer: 5 });
    expect(o.deck[0].affixes).toEqual(['x']);
    const m = new SceneManager(frameCtx, {});
    const f = new FlowMachine();
    const ref: { r?: Router } = {};
    for (const p of Object.keys(PAGE_ACTIONS) as (keyof typeof PAGE_ACTIONS)[]) m.register(p, () => new PlaceholderScene(p, (e) => void ref.r!.send(e)));
    m.register(
      'result',
      () =>
        new ResultScene({
          view: () => buildView(o, meta.load()),
          leave(to) {
            meta.settle(o);
            slot.remove();
            void ref.r!.send({ type: 'result_done', to });
          },
        }),
    );
    const router = (ref.r = new Router(f, m, CUT));
    await router.start();
    await router.send({ type: 'abandon' });
    const sc = m.current as ResultScene;
    expect(sc.view.title).toBe('败北');
    expect(sc.view.soul.afterDefeat).toBe(Math.floor(sc.view.soul.base / 2));
    expect(st.m.has(RUN_SAVE_KEY)).toBe(true); // 结算页展示时还没删
    const b = sc.rect(RESULT_LAYOUT.back);
    m.gesture({ type: 'tap', at: { x: b.x + 4, y: b.y + 4 } });
    expect(st.m.has(RUN_SAVE_KEY)).toBe(false);
    expect(meta.load().soul).toBe(sc.view.soul.total);
    expect(f.page).toBe('select');
  });
});

describe('core Game 适配（只读）', () => {
  it('失败时取主副将、牌组、致命敌人', () => {
    const { g } = mkGame({}, 3);
    g.startBattle();
    g.p.hp = 0;
    const o = outcomeFromGame(g, { runSeed: 3, startedAt: 0, now: 60_000 });
    expect(o.win).toBe(false);
    expect(o.heroMain).toBe(g.main.id);
    expect(o.deck.length).toBe(g.deckMaster.length);
    expect(o.durationMs).toBe(60_000);
    expect(o.stats.battlesWon).toBe(0);
  });
});

describe('Pages 入口对调（#46）', () => {
  const cfg = (mode: string) => (PAGES_CONFIG as unknown as (e: { mode: string }) => { base: string; build: { outDir: string } })({ mode });
  it('Canvas 发布包在根目录，DOM 调试版在 /debug/', () => {
    expect(cfg('production').base).toBe('/mojuan-sanguo/');
    expect(cfg('production').build.outDir).toBe('dist');
    expect(cfg('debug').base).toBe('/mojuan-sanguo/debug/');
    expect(PAGES_BASE).toEqual({ h5: '/mojuan-sanguo/', debug: '/mojuan-sanguo/debug/' });
  });
});

describe('调试状态栏开关（#79）', () => {
  it('正式根目录默认隐藏；?debug=1 或 /debug/ 下显示', () => {
    expect(showStatusBar({}, '/mojuan-sanguo/')).toBe(false);
    expect(showStatusBar({ debug: '1' }, '/mojuan-sanguo/')).toBe(true);
    expect(showStatusBar({}, '/mojuan-sanguo/debug/')).toBe(true);
    expect(showStatusBar({ debug: '0' }, '/mojuan-sanguo/debug/')).toBe(false);
  });
});

describe('RunStats（PRD 21.4）', () => {
  it('empty / merge（maxTurnLoss 取最大，其余累加）/ battleResultDelta / parseStats', () => {
    const a = mergeStats(emptyStats(), { battlesWon: 1, dmgDealt: 10, maxTurnLoss: 5 });
    const b = mergeStats(a, { ...battleResultDelta('elite', true), dmgDealt: 4, maxTurnLoss: 3, turns: 6 });
    expect(b).toMatchObject({ battlesWon: 2, elitesKilled: 1, bossKilled: 0, dmgDealt: 14, maxTurnLoss: 5, turns: 6 });
    expect(a.battlesWon).toBe(1);
    expect(battleResultDelta('boss', false)).toEqual({});
    expect(parseStats({ turns: 3, dmgTaken: 'x' })).toEqual({ ...emptyStats(), turns: 3 });
  });
});
