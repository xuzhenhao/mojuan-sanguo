import { bossConfirmLayout } from '../src/game/map/scene';
import { t } from '../src/data/text';
import { describe, expect, it } from 'vitest';
import { MapScene, type MapSceneDeps } from '../src/game/map/scene';
import { MapSession } from '../src/game/map/session';
import { setRunSaveStore } from '../src/core/run/save';
import { loadMapSave, resetMapSession, runPersist } from '../src/game/map';
import { RUN_STATE_KEY } from '../src/game/run/state';
import { isComingSoon, routeFor } from '../src/game/map/route';
import { MAP_CONFIG, poolsOf } from '../src/data/map';
import { OverlayStack } from '../src/engine/modal';
import { BakeCache, TextureBudget, AtlasManager, CANVAS2D_ATLASES } from '../src/engine/memory';
import { FlowMachine } from '../src/game/flow';
import { SceneManager } from '../src/engine/scene';
import type { Surface } from '../src/engine/surfaces';
import type { Canvas2DLike } from '../src/engine/types';
import { BOSS_ID } from '../src/core/run/map';

/** 万能假 2D 上下文：记录所有调用 */
function anyCtx() {
  const calls: string[] = [];
  const grad = { addColorStop() {} };
  const ctx: Record<string | symbol, unknown> = {};
  return {
    calls,
    ctx: new Proxy(ctx, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        return (...a: unknown[]) => calls.push(`${String(k)}:${a.length}`);
      },
      set(t, k, v) {
        t[k] = v;
        return true;
      },
    }),
  };
}
const memStore = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
};

function setup(seed = 3) {
  const store = memStore();
  setRunSaveStore(store);
  resetMapSession();
  const session = new MapSession(seed, 1, MAP_CONFIG, poolsOf(1), runPersist());
  const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
  const budget = new TextureBudget(50 * 1048576, 45 * 1048576);
  const atlases = new AtlasManager(budget, CANVAS2D_ATLASES, () => 'rgba8', {}, { halfSize: true });
  const bakes = new BakeCache(budget, undefined, undefined, { ensure: (n) => atlases.ensure(n), baked: (n) => void atlases.markBaked(n) });
  const sent: { e: unknown; p: unknown }[] = [];
  const deps: MapSceneDeps = {
    session,
    hud: () => ({ hp: 7, maxHp: 7, gold: 10, potions: ['P1', null, null], hero: '赵云' }),
    bossName: '张角',
    bossGlyph: '角',
    overlays,
    bakes,
    bakeScale: 1.5,
    createOffscreen: (w, h) => {
      const c = anyCtx();
      return { width: w, height: h, getContext: () => c.ctx } as unknown as Canvas2DLike;
    },
    go: (e, p) => sent.push({ e, p }),
  };
  const scene = new MapScene(deps);
  const mgr = new SceneManager({ invalidate() {}, width: 390, height: 844 }, { atlases, bakes });
  mgr.register('map', () => scene);
  void mgr.go('map');
  return { scene, session, overlays, sent, store, bakes, atlases, budget };
}
const surface = () => {
  const c = anyCtx();
  return { s: { name: 'main', ctx: c.ctx, canvas: {}, scale: 1, dirty: true } as unknown as Surface, calls: c.calls };
};
/** 测试辅助：走一步（奇遇用 pass，其余 enter） */
const walk = (session: MapSession) => {
  const id = session.available[0];
  const t = session.node(id)!.type;
  if (t === 'EVENT') session.pass(id);
  else session.enter(id);
};
const tick = (scene: MapScene, ms: number) => {
  for (let t = 0; t < ms; t += 16) scene.update(16);
};

describe('P3 地图页', () => {
  it('进入：自动滚到当前层（未出发 = 底部），卷轴烘焙一张 mapscroll，源图 map_base 半尺寸、烘焙后释放', () => {
    const { scene, bakes, atlases } = setup();
    expect(scene.scroll).toBe(scene.maxScroll());
    const sf = surface();
    scene.draw('main', sf.s);
    scene.draw('main', sf.s);
    expect(bakes.count('mapscroll')).toBe(1);
    expect(atlases.isBaked('map_base')).toBe(true);
    expect(atlases.isLoaded('map_base')).toBe(false);
    expect(atlases.size(atlases.def('map_base')!)).toEqual({ w: 512, h: 1024 });
    expect(sf.calls.some((c) => c.startsWith('drawImage'))).toBe(true);
  });
  it('点可走节点：头像移动 500ms → core 走一步 + 写盘 → 路由到战斗页（带组包参数）', () => {
    const { scene, session, sent, store } = setup();
    const id = session.available[0];
    expect(scene.gesture({ type: 'tap', at: scene.screenPos(session.node(id)!) })).toBe(true);
    expect(sent).toHaveLength(0);
    tick(scene, 480);
    expect(sent).toHaveLength(0);
    tick(scene, 40);
    expect(sent).toHaveLength(1);
    expect(sent[0].e).toEqual({ type: 'enter_node', node: 'battle' });
    expect(sent[0].p).toMatchObject({ kind: 'battle', nodeType: 'BATTLE', nodeId: id, layer: 1, intro: 'none' });
    expect((sent[0].p as { encounterId: string }).encounterId).toMatch(/^easy:/);
    expect(session.state.current).toBe(id);
    expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).map.current).toBe(id);
    expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).pendingNode).toEqual({ id, type: 'BATTLE' });
    expect(loadMapSave()!.nodePath).toEqual([id]);
    expect([...store.m.keys()]).toEqual([RUN_STATE_KEY]); // 不写旧键 mojuan.run.v1
  });
  it('点不可走节点只弹类型详情；长按弹说明', () => {
    const { scene, session, overlays, sent } = setup();
    const locked = session.state.nodes.find((n) => n.layer === 3)!;
    scene.gesture({ type: 'tap', at: scene.screenPos(locked) });
    expect(overlays.ids()).toEqual([`detail:map:${locked.id}`]);
    tick(scene, 600);
    expect(sent).toHaveLength(0);
  });
  it('Boss：弹首领确认框；整备返回地图，出战才进入（#188：按钮热区、不可点外部关闭）', async () => {
    const { scene, session, overlays, sent } = setup();
    for (let i = 0; i < 8; i++) walk(session);
    expect(session.available).toEqual([BOSS_ID]);
    const L = bossConfirmLayout(MAP_CONFIG.bossConfirm, 844);
    for (const r of [L.prepare, L.fight]) {
      expect(r.w).toBeGreaterThanOrEqual(44);
      expect(r.h).toBeGreaterThanOrEqual(44);
    }
    expect(L.panel).toMatchObject({ x: 28, y: 150, w: 334 });
    const mid = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    scene.gesture({ type: 'tap', at: scene.screenPos(session.node(BOSS_ID)!) });
    expect(overlays.ids()).toEqual(['popup:boss-confirm']);
    const sf = surface();
    overlays.update(300);
    overlays.draw(sf.s, 16);
    // 点外部不关闭
    expect(overlays.gesture({ type: 'tap', at: { x: 5, y: 830 } })).toBe(true);
    overlays.update(500);
    expect(overlays.size).toBe(1);
    // 整备
    overlays.gesture({ type: 'tap', at: mid(L.prepare) });
    overlays.update(MAP_CONFIG.bossConfirm.fadeOutMs + 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(overlays.size).toBe(0);
    tick(scene, 600);
    const before = sent.length;
    expect(sent.length).toBe(before);
    // 出战
    scene.gesture({ type: 'tap', at: scene.screenPos(session.node(BOSS_ID)!) });
    overlays.gesture({ type: 'tap', at: mid(L.fight) });
    overlays.update(MAP_CONFIG.bossConfirm.fadeOutMs + 1);
    await Promise.resolve();
    await Promise.resolve();
    tick(scene, 600);
    const last = sent[sent.length - 1];
    expect(last.p).toMatchObject({ kind: 'battle', nodeType: 'BOSS', intro: 'boss', enemies: ['B1'] });
    expect(scene.log).toContain('boss_confirm:prepare');
    expect(scene.log).toContain('boss_confirm:fight');
  });
  it('#188 首领确认：矮屏面板上移不低于 minTop；文案走文本表', () => {
    const cfg = MAP_CONFIG.bossConfirm;
    const L = bossConfirmLayout(cfg, 640);
    expect(L.panel.y).toBeGreaterThanOrEqual(cfg.panel.minTop);
    expect(L.panel.y).toBeLessThanOrEqual(cfg.panel.top);
    expect(t('map.boss_confirm_title')).toBe('进入首领战？');
    expect(t('map.boss_confirm_prepare')).toBe('整备');
    expect(t('map.boss_confirm_fight')).toBe('出战');
  });
  it('拖动滚动带惯性，两端回弹', () => {
    const { scene } = setup();
    const s0 = scene.scroll;
    scene.gesture({ type: 'dragstart', at: { x: 200, y: 400 }, start: { x: 200, y: 400 } });
    scene.update(16);
    scene.gesture({ type: 'dragmove', at: { x: 200, y: 500 }, start: { x: 200, y: 400 } });
    expect(scene.scroll).toBe(s0 - 100);
    scene.gesture({ type: 'dragend', at: { x: 200, y: 500 }, start: { x: 200, y: 400 } });
    tick(scene, 2000);
    expect(scene.scroll).toBeGreaterThanOrEqual(0);
    expect(scene.scroll).toBeLessThanOrEqual(scene.maxScroll());
  });
  it('续玩：同种子从存档恢复 mapState', () => {
    const { session } = setup(11);
    walk(session);
    const again = new MapSession(11, 1, MAP_CONFIG, poolsOf(1), runPersist());
    expect(again.state.current).toBe(session.state.current);
  });
});

describe('营地/奇遇（营地走营地页，奇遇走奇遇页 #91）', () => {
  /** 走到第一个可达营地/奇遇的父节点，返回该节点 */
  const reach = (session: MapSession, type: 'REST' | 'EVENT') => {
    for (let guard = 0; guard < 9; guard++) {
      const hit = session.available.map((id) => session.node(id)!).find((x) => x.type === type);
      if (hit) return hit;
      walk(session);
    }
    return null;
  };
  it('营地（#90）：移动后 core 走一步 + 写盘 → 路由到营地页（不在地图内自动回血）', () => {
    const { scene, session, overlays, sent, store } = setup(3);
    session.save({ hp: 3, maxHp: 8 });
    const rest = reach(session, 'REST')!;
    expect(session.restPreview()).toEqual({ hp: 5, healed: 2, maxHp: 8 }); // max(2, floor(8×0.3)) = 2
    scene.tapNode(rest);
    tick(scene, 520);
    expect(overlays.size).toBe(0);
    expect(sent.at(-1)!.e).toEqual({ type: 'enter_node', node: 'rest' });
    expect(sent.at(-1)!.p).toMatchObject({ kind: 'rest', nodeId: rest.id, layer: rest.layer, fixed: rest.layer === 8 });
    expect(session.state.current).toBe(rest.id);
    expect(store.m.has('mojuan.run.v1')).toBe(false);
    const saved = JSON.parse(store.m.get(RUN_STATE_KEY)!);
    // 进营地节点：写进节点快照（pendingNode = 营地），体力未变
    expect([saved.hp, saved.map.current, saved.pendingNode]).toEqual([3, rest.id, { id: rest.id, type: 'REST' }]);
    expect(scene.log).toContain('enter_node:rest');
    expect(() => session.pass(rest.id)).toThrow(/只用于奇遇/);
  });
  it('营地疗伤预览含青囊书 +2（存档宝物 R03）', () => {
    const { session } = setup(3);
    session.save({ hp: 1, maxHp: 8, relics: ['R03'] });
    expect(session.restPreview()).toEqual({ hp: 5, healed: 4, maxHp: 8 });
  });
  it('营地回血不超过体力上限；最大体力 10 → 回复 3', () => {
    const { session } = setup(3);
    session.save({ hp: 9, maxHp: 9 });
    expect(session.restPreview()).toEqual({ hp: 9, healed: 0, maxHp: 9 });
    session.save({ hp: 1, maxHp: 10 });
    expect(session.restPreview()).toEqual({ hp: 4, healed: 3, maxHp: 10 });
  });
  it('奇遇（#91）：进奇遇页（kind=event），写进节点快照 pendingNode=EVENT', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { scene, session, sent, store } = setup(seed);
      const ev = reach(session, 'EVENT');
      if (!ev) continue;
      scene.tapNode(ev);
      tick(scene, 520);
      expect(session.state.current).toBe(ev.id);
      expect(sent.at(-1)!.e).toEqual({ type: 'enter_node', node: 'event' });
      expect(sent.at(-1)!.p).toMatchObject({ kind: 'event', nodeId: ev.id, layer: ev.layer });
      expect(JSON.parse(store.m.get(RUN_STATE_KEY)!).pendingNode).toEqual({ id: ev.id, type: 'EVENT' });
      return;
    }
    throw new Error('没有找到奇遇');
  });
  it('第 8 层固定营地：同样进营地页（fixed=true），之后可去 Boss', () => {
    const { scene, session, sent } = setup(5);
    for (let i = 0; i < 7; i++) walk(session);
    const r8 = session.node(session.available[0])!;
    expect(r8.layer).toBe(8);
    scene.tapNode(r8);
    tick(scene, 520);
    expect(sent.at(-1)!.p).toMatchObject({ kind: 'rest', layer: 8, fixed: true });
    expect(session.available).toEqual([BOSS_ID]);
  });
});

describe('路由约定', () => {
  it('节点类型 → 页面', () => {
    const n = (type: 'SHOP' | 'CHEST' | 'REST' | 'EVENT') => ({ id: 'L2C0', layer: 2, col: 0, type });
    expect(isComingSoon('EVENT')).toBe(false);
    expect(isComingSoon('REST')).toBe(false);
    expect(routeFor(1, n('EVENT'))).toEqual({
      event: { type: 'enter_node', node: 'event' },
      params: { from: 'map', chapter: 1, nodeId: 'L2C0', layer: 2, kind: 'event' },
    });
    expect(routeFor(1, n('REST'))).toEqual({
      event: { type: 'enter_node', node: 'rest' },
      params: { from: 'map', chapter: 1, nodeId: 'L2C0', layer: 2, kind: 'rest', fixed: false },
    });
    expect(routeFor(1, n('SHOP'))).toEqual({
      event: { type: 'enter_node', node: 'shop' },
      params: { from: 'map', chapter: 1, nodeId: 'L2C0', layer: 2, kind: 'shop' },
    });
    expect(routeFor(1, n('CHEST'))).toEqual({
      event: { type: 'enter_node', node: 'chest' },
      params: { from: 'map', chapter: 1, nodeId: 'L2C0', layer: 2, kind: 'chest' },
    });
  });
  it('FlowMachine：地图 → 宝箱 → chest_done → 地图', () => {
    const f = new FlowMachine();
    f.send({ type: 'start_run' });
    expect(f.send({ type: 'enter_node', node: 'chest' })).toBe('chest');
    expect(f.send({ type: 'chest_done' })).toBe('map');
  });
});

describe('#108 地图暂停钮', () => {
  it('点右上暂停钮触发 onPause，不走节点', () => {
    const { scene, sent } = setup();
    let n = 0;
    (scene as unknown as { d: MapSceneDeps }).d.onPause = () => void n++;
    const r = scene.pauseHit();
    expect(r.w).toBeGreaterThanOrEqual(44);
    expect(scene.gesture({ type: 'tap', at: { x: r.x + r.w / 2, y: r.y + r.h / 2 } })).toBe(true);
    expect(n).toBe(1);
    expect(sent).toEqual([]);
  });
});
