import { describe, expect, it } from 'vitest';
import { CUT, SceneManager } from '../src/engine/scene';
import { OverlayStack } from '../src/engine/modal';
import type { Surface } from '../src/engine/surfaces';
import { FlowMachine, viewOf } from '../src/game/flow';
import { Router } from '../src/game/router';
import { RunSession } from '../src/game/run';
import { PAGE_ACTIONS, PlaceholderScene } from '../src/game/scenes/placeholder';
import { gridCell, SELECT_LAYOUT as L, skillSeals } from '../src/game/select/layout';
import { canStart, canSwap, clearSlot, comboOf, initialState, mainSkillsOf, pickHero, roster, starterDeckSize, swap } from '../src/game/select/model';
import { detailCloseRect, isLocked, SelectScene, wrapChars, wrapWidth } from '../src/game/select/scene';
import { t } from '../src/data/text';

const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 记录调用的 2D 上下文替身：任意方法都可调用，createXxxGradient 返回带 addColorStop 的对象 */
function recordingCtx() {
  const calls: string[] = [];
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = { calls };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k.startsWith('create')) return () => grad;
      if (k === 'measureText') return (s: string) => ({ width: s.length * 12 });
      return (...a: unknown[]) => calls.push(`${k}:${typeof a[0] === 'string' ? a[0] : ''}`);
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
  return { ctx, calls };
}
const surface = (name: Surface['name']) => {
  const r = recordingCtx();
  return { s: { name, ctx: r.ctx, canvas: { width: 780, height: 1688 }, scale: 1, dirty: true } as unknown as Surface, calls: r.calls };
};

function mkScene(opts: Partial<ConstructorParameters<typeof SelectScene>[0]> = {}) {
  const started: { main: string; sub: string }[] = [];
  const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
  const sc = new SelectScene({ overlays, onStart: (s) => started.push(s), ...opts });
  sc.enter({ width: 390, height: 844, invalidate() {} });
  return { sc, started, overlays };
}

describe('点将：状态模型', () => {
  it('开局名单 8 将，不含关羽 H09', () => {
    const ids = roster().map((h) => h.id);
    expect(ids).toEqual(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08']);
    expect(() => pickHero({ main: null, sub: null }, 'H09')).toThrow();
  });
  it('先补主将再补副将；再点已选武将会移出；主副不能同人', () => {
    let s = pickHero({ main: null, sub: null }, 'H03');
    expect(s).toEqual({ main: 'H03', sub: null });
    s = pickHero(s, 'H03');
    expect(s).toEqual({ main: null, sub: null });
    s = pickHero(pickHero(s, 'H03'), 'H04');
    expect(s).toEqual({ main: 'H03', sub: 'H04' });
    expect(canStart(s)).toBe(true);
    s = pickHero(s, 'H05'); // 副将已满：替换副将
    expect(s).toEqual({ main: 'H03', sub: 'H05' });
    s = pickHero(s, 'H05');
    expect(s).toEqual({ main: 'H03', sub: null });
    expect(canStart(s)).toBe(false);
  });
  it('点槽位清空；主副都有人才能换位', () => {
    const s = { main: 'H03', sub: 'H04' };
    expect(clearSlot(s, 'main')).toEqual({ main: null, sub: 'H04' });
    expect(swap(s)).toEqual({ main: 'H04', sub: 'H03' });
    expect(canSwap({ main: 'H03', sub: null })).toBe(false);
    expect(swap({ main: 'H03', sub: null })).toEqual({ main: 'H03', sub: null });
  });
  it('珠联璧合：按主→副方向查找，停用的不提示', () => {
    expect(comboOf('H04', 'H03')?.name).toBe('长坂护主');
    expect(comboOf('H03', 'H04')?.name).toBe('托孤');
    expect(comboOf('H03', 'H05')?.name).toBe('白马');
    expect(comboOf('H09', 'H03')).toBeNull(); // 龙虎会 enabled:false
    expect(comboOf('H01', 'H08')).toBeNull();
    expect(comboOf('H01', null)).toBeNull();
  });
  it('起始牌组张数与 URL 预选', () => {
    expect(starterDeckSize('H03')).toBe(12);
    expect(starterDeckSize(null)).toBe(0);
    expect(initialState({ main: 'H03', sub: 'H04' })).toEqual({ main: 'H03', sub: 'H04' });
    expect(initialState({ main: 'H09', sub: 'H03' })).toEqual({ main: null, sub: 'H03' });
    expect(initialState({ main: 'H03', sub: 'H03' })).toEqual({ main: 'H03', sub: null });
  });
});

describe('点将：布局（acceptance §3 选将）', () => {
  it('主槽 176×240、副槽 122×166、网格 4×2 间距一致、技能印 46⌀、出征热区 ≥44', () => {
    expect([L.main.w, L.main.h, L.sub.w, L.sub.h]).toEqual([176, 240, 122, 166]);
    const cells = Array.from({ length: 8 }, (_, i) => gridCell(i));
    expect(cells[1].x - (cells[0].x + cells[0].w)).toBeCloseTo(8);
    expect(cells[4].y - (cells[0].y + cells[0].h)).toBe(10);
    expect(cells[3].x + cells[3].w).toBeCloseTo(376);
    expect(skillSeals(2, true).every((s) => s.rect.w === 46)).toBe(true);
    expect(L.start.h).toBeGreaterThanOrEqual(44);
  });
  it('锁定技读取 config 的 kind', () => {
    expect(isLocked('H03', 0)).toBe(true);
    expect(isLocked('H02', 0)).toBe(false); // 离间：主动技
  });
  it('详情折行', () => {
    expect(wrapChars('一二三四五', 2)).toEqual(['一二', '三四', '五']);
    expect(wrapWidth('一二三。', 39, 13)).toEqual(['一二三。']);
    expect(wrapWidth('一二三四五', 39, 13)).toEqual(['一二三', '四五']);
  });
  it('同名主将技合并（陆逊谦逊）', () => {
    const lx = roster().find((h) => h.id === 'H08')!;
    expect(mainSkillsOf(lx).map((s) => s.name)).toEqual(['连营', '谦逊']);
  });
});

describe('点将：场景交互', () => {
  it('点网格选主副将，主副未满时出征不可用（槽位闪烁 + toast）', () => {
    const { sc, started, overlays } = mkScene();
    sc.gesture({ type: 'tap', at: center(L.start) });
    expect(started).toEqual([]);
    expect(sc.animating()).toBe(true);
    expect(overlays.ids()).toContain('toast:select');
    sc.gesture({ type: 'tap', at: center(gridCell(2)) });
    sc.gesture({ type: 'tap', at: center(gridCell(3)) });
    expect(sc.state).toEqual({ main: 'H03', sub: 'H04' });
    sc.gesture({ type: 'tap', at: center(L.swap) });
    expect(sc.state).toEqual({ main: 'H04', sub: 'H03' });
    sc.gesture({ type: 'tap', at: center(L.start) });
    expect(started).toEqual([{ main: 'H04', sub: 'H03' }]);
  });
  it('点槽位清空', () => {
    const { sc } = mkScene({ initial: { main: 'H01', sub: 'H02' } });
    sc.gesture({ type: 'tap', at: center(L.sub) });
    expect(sc.state.sub).toBeNull();
  });
  it('长按武将 / 技能印弹出详情浮层，点外部关闭', () => {
    const { sc, overlays } = mkScene({ initial: { main: 'H03', sub: 'H04' } });
    expect(sc.gesture({ type: 'longpressprogress', at: center(gridCell(0)), progress: 0.5 })).toBe(true);
    sc.gesture({ type: 'longpress', at: center(gridCell(0)) });
    expect(overlays.ids()).toEqual(['detail:hero:H01']);
    overlays.gesture({ type: 'tap', at: { x: 2, y: 840 } });
    expect(overlays.size).toBe(0);
    const seal = skillSeals(2, true).find((s) => s.kind === 'sub')!;
    sc.gesture({ type: 'tap', at: center(seal.rect) });
    expect(overlays.ids()).toEqual(['detail:hero:H04']);
    sc.exit();
    expect(overlays.size).toBe(0);
  });
  it('#257 详情浮层：关闭按钮可关；点外部可关；文案走文本表', () => {
    const { sc, overlays } = mkScene({ initial: { main: 'H03', sub: 'H04' } });
    sc.gesture({ type: 'longpress', at: center(gridCell(0)) }); // 曹操 H01
    expect(overlays.ids()).toEqual(['detail:hero:H01']);
    const top = overlays.top()!;
    expect(top.rect).toBeTruthy();
    const btn = detailCloseRect(top.rect!);
    expect(btn.w).toBeGreaterThanOrEqual(44);
    expect(btn.h).toBeGreaterThanOrEqual(44);
    // 点面板内非按钮区域：不关（仍 modal 吞掉）
    expect(overlays.gesture({ type: 'tap', at: { x: top.rect!.x + 30, y: top.rect!.y + 40 } })).toBe(true);
    expect(overlays.size).toBe(1);
    // 点关闭按钮
    expect(overlays.gesture({ type: 'tap', at: center(btn) })).toBe(true);
    expect(overlays.size).toBe(0);
    // 再开：点外部关闭
    sc.gesture({ type: 'longpress', at: center(gridCell(0)) });
    expect(overlays.gesture({ type: 'tap', at: { x: 2, y: 840 } })).toBe(true);
    expect(overlays.size).toBe(0);
    expect(t('select.detail_close')).toBe('关闭');
    expect(t('select.detail_close_hint')).toBe('select.detail_close_hint'); // 提示已删
  });
  it('空闲时停帧；选满后「出征」呼吸光只持续 2.4s', () => {
    const { sc } = mkScene();
    expect(sc.animating()).toBe(false);
    sc.gesture({ type: 'tap', at: center(gridCell(0)) });
    sc.gesture({ type: 'tap', at: center(gridCell(1)) });
    expect(sc.animating()).toBe(true);
    sc.update(2500);
    expect(sc.animating()).toBe(false);
  });
  it('各层都能绘制（空态、满态、详情浮层），名字用书法字体', () => {
    for (const initial of [
      { main: null, sub: null },
      { main: 'H08', sub: 'H07' },
    ]) {
      const { sc, overlays } = mkScene({ initial });
      for (const n of ['bg', 'ambient', 'main'] as const) {
        const { s } = surface(n);
        expect(() => sc.draw(n, s)).not.toThrow();
      }
      sc.showDetail(roster()[7], 'main');
      const { s, calls } = surface('main');
      sc.draw('main', s);
      overlays.draw(s, 0);
      expect(calls.some((c) => c.startsWith('fillText:出征'))).toBe(true);
      expect(calls.some((c) => c.startsWith('fillText:主将技 · 连营'))).toBe(true);
    }
  });
});

describe('点将 → 出征 → core 新建局 → 地图', () => {
  it('RunSession 用所选主副将创建 Game；FlowMachine 读 core 状态；进入地图占位页', async () => {
    const run = new RunSession();
    const m = new SceneManager({ width: 390, height: 844, invalidate() {} }, {});
    const f = new FlowMachine(() => (run.game ? viewOf(run.game) : null));
    const ref: { r?: Router } = {};
    for (const p of Object.keys(PAGE_ACTIONS) as (keyof typeof PAGE_ACTIONS)[]) m.register(p, () => new PlaceholderScene(p, (e) => void ref.r!.send(e)));
    m.register(
      'select',
      () =>
        new SelectScene({
          initial: { main: 'H08', sub: 'H07' },
          onStart: (sel) => {
            run.start({ ...sel, seed: 20261012 });
            void ref.r!.send({ type: 'start_run' });
          },
        }),
    );
    const router = (ref.r = new Router(f, m, CUT));
    await router.start();
    m.gesture({ type: 'tap', at: center(L.start) });
    expect(run.game!.main.id).toBe('H08');
    expect(run.game!.sub.id).toBe('H07');
    expect(run.game!.p.hp).toBe(run.game!.main.hp);
    expect(run.game!.deckMaster).toHaveLength(12);
    expect(f.page).toBe('map');
    expect(m.current!.id).toBe('map');
  });
  it('主副同人时拒绝建局', () => {
    expect(() => new RunSession().start({ main: 'H01', sub: 'H01', seed: 1 })).toThrow();
  });
});
