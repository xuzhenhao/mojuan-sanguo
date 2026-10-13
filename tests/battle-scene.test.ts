import { testNow } from './helpers';
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine/engine';
import { OverlayStack } from '../src/engine/modal';
import type { Surface } from '../src/engine/surfaces';
import { CARD_W, HAND_MIN_STEP, layoutHand, lockDirection } from '../src/game/scenes/battle/hand';
import type { BattleOverlayHooks } from '../src/game/scenes/battle/hooks';
import { judgeViewOf } from '../src/game/scenes/battle/judge';
import { diff, PresentationQueue } from '../src/game/scenes/battle/present';
import { BACK_ROW_GAP, BEAD_R_ENEMY, BEAD_R_MAIN, BattleScene } from '../src/game/scenes/battle/scene';
import { battleSkillButtons, skillReason, skillTargetOk } from '../src/game/scenes/battle/skills';
import { fakePlatform } from './engine-fakes';
import { card } from './helpers';

const area = { x: 12, y: 600, w: 366, h: 104 };
function recCtx() {
  const texts: string[] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    setTransform() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    fillText: (t: string) => texts.push(t),
  };
  return { texts, s: { name: 'main', canvas: {} as never, ctx, scale: 1, dirty: true } as unknown as Surface };
}
function mkScene(hooks?: BattleOverlayHooks, main?: string, sub?: string) {
  const inv: string[] = [];
  const overlays = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
  const ends: boolean[] = [];
  const sc = new BattleScene({ now: testNow, overlays, hooks, onEnd: (w) => ends.push(w), debugDefaults: true });
  sc.enter({ width: 390, height: 844, invalidate: (l) => inv.push(l ?? 'all') }, { seed: 7, main, sub });
  return { sc, overlays, ends };
}
/** 推进表现队列直到 promise 结束 */
async function settle(sc: BattleScene, p: Promise<unknown>, max = 400) {
  let done = false;
  void p.then(() => (done = true));
  for (let i = 0; i < max && !done; i++) {
    sc.update(50);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
  expect(done).toBe(true);
}

describe('手牌布局（B：平铺叠放 + 自动压缩 + 滚动兜底）', () => {
  it('≤7 张居中不滚动', () => {
    const l = layoutHand(5, area);
    expect(l.maxScroll).toBe(0);
    expect(l.rects[0].x).toBeGreaterThanOrEqual(area.x);
  });
  it('10+ 张自动压缩间距，整手都在可用宽度内不被裁切（#57）', () => {
    for (const n of [10, 11, 12]) {
      const l = layoutHand(n, area);
      expect(l.maxScroll).toBe(0);
      expect(l.rects[0].x).toBeGreaterThanOrEqual(area.x);
      expect(l.rects[n - 1].x + CARD_W).toBeLessThanOrEqual(area.x + area.w + 0.01);
      expect(l.step).toBeGreaterThanOrEqual(HAND_MIN_STEP);
    }
  });
  it('压到最小间距仍放不下才滚动；方向锁定', () => {
    const l = layoutHand(20, area);
    expect(l.step).toBe(HAND_MIN_STEP);
    expect(l.maxScroll).toBeGreaterThan(0);
    expect(lockDirection({ x: 0, y: 0 }, { x: 20, y: 3 }, true, true)).toBe('scroll');
    expect(lockDirection({ x: 0, y: 0 }, { x: 3, y: -20 }, true, true)).toBe('card');
    expect(lockDirection({ x: 0, y: 0 }, { x: 20, y: 3 }, false, true)).toBe('card');
  });
});

describe('表现队列', () => {
  it('阻塞步骤串行、非阻塞并行，倍速生效', async () => {
    const q = new PresentationQueue();
    const log: string[] = [];
    void q.push('a', 100).then(() => log.push('a'));
    void q.push('b', 100).then(() => log.push('b'));
    void q.push('f', 50, false).then(() => log.push('f'));
    q.speed = 2;
    q.update(30);
    await Promise.resolve();
    expect(log).toEqual(['f']);
    q.update(30);
    q.update(40);
    await Promise.resolve();
    expect(log).toEqual(['f', 'a', 'b']);
  });
  it('快照差分产出表现事件', () => {
    const a = { hp: 5, armor: 0, ling: 3, hand: [1], en: { 9: { hp: 3, armor: 0, marks: 0, alive: true } } };
    const b = { hp: 4, armor: 0, ling: 2, hand: [1, 2], en: { 9: { hp: 0, armor: 0, marks: 0, alive: false } } };
    expect(diff(a, b).map((e) => e.t)).toEqual(['player_hp', 'ling', 'draw', 'enemy_hp', 'enemy_die']);
  });
});

describe('战斗场景', () => {
  it('顶条全部读 core 状态（#55）', () => {
    const { sc } = mkScene();
    const { texts, s } = recCtx();
    sc.draw('main', s);
    const g = sc.g;
    expect(texts).toContain(`第${g.battleIdx + 1}战 · ${g.battle.name}`);
    expect(texts).toContain(`第 ${g.turn} 回合 · 牌堆 ${g.draw.length}`);
    g.turn = 5;
    g.battleIdx = 1;
    const r2 = recCtx();
    sc.draw('main', r2.s);
    expect(r2.texts).toContain(`第 5 回合 · 牌堆 ${g.draw.length}`);
    expect(r2.texts.some((t) => t.startsWith('第2战 · '))).toBe(true);
  });
  it('点杀 → 点合法目标出牌，敌人掉血', async () => {
    const { sc } = mkScene();
    const g = sc.g;
    const sha = card('B001', 'S', 7);
    g.hand = [sha];
    g.en.forEach((e) => (e.marks = 0));
    const tgt = g.alive().find((e) => g.canTarget(e, sha))!;
    const hp = tgt.hp + tgt.armor;
    await sc.tapCard(sha);
    expect(sc.mode).toBe('target');
    await settle(sc, sc.tapEnemy(tgt));
    expect(tgt.hp + tgt.armor).toBeLessThan(hp);
    expect(sc.q.played).toContain('play_fly');
  });
  it('拖拽出牌：无目标牌拖过出牌线生效，拖回手牌区取消', async () => {
    const { sc } = mkScene();
    const g = sc.g;
    const tao = card('B005', 'H', 3);
    g.hand = [tao];
    g.p.hp = g.p.maxHp - 1;
    const r = sc.handLayout().rects[0];
    const start = { x: r.x + 30, y: r.y + 50 };
    sc.gesture({ type: 'dragstart', start, at: { x: start.x, y: start.y - 20 } });
    sc.gesture({ type: 'dragend', start, at: { x: start.x, y: r.y + 10 } });
    expect(g.hand).toContain(tao);
    sc.gesture({ type: 'dragstart', start, at: { x: start.x, y: start.y - 20 } });
    sc.gesture({ type: 'dragmove', start, at: { x: start.x, y: 300 } });
    sc.gesture({ type: 'dragend', start, at: { x: start.x, y: 300 } });
    await settle(
      sc,
      new Promise<void>((res) => {
        const t = setInterval(() => {
          if (!g.hand.includes(tao) && sc.mode === 'idle') {
            clearInterval(t);
            res();
          }
        }, 0);
      }),
    );
    expect(g.p.hp).toBe(g.p.maxHp);
  });
  it('结束回合 → 敌方回合（响应钩子带攻击者）→ 回到我方回合', async () => {
    const reqs: string[] = [];
    const { sc } = mkScene({
      respond: async (req) => {
        reqs.push(req.attacker?.name ?? '?');
        return null;
      },
    });
    const g = sc.g;
    g.hand = [];
    g.en.forEach((e) => (e.pat = [['杀']]));
    g.p.hp = 99;
    g.p.maxHp = 99;
    g.hand = [card('B002', 'D', 2)];
    await settle(sc, sc.tapEndTurn());
    expect(g.turn).toBe(2);
    expect(reqs.length).toBeGreaterThan(0);
    expect(reqs[0]).not.toBe('?');
    expect(sc.q.played).toContain('enemy_act');
  });
  it('长按命中元素时调用 detail 钩子；hitTest / rectOf 一致', () => {
    const hits: string[] = [];
    const { sc } = mkScene({ detail: (h) => (hits.push(h.kind), true) });
    const e = sc.g.alive()[0];
    const r = sc.enemyRect(e)!;
    sc.gesture({ type: 'longpress', at: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
    const c = sc.g.hand[sc.g.hand.length - 1];
    const cr = sc.overlayCtx.rectOf({ kind: 'card', card: c })!;
    sc.gesture({ type: 'longpress', at: { x: cr.x + 40, y: cr.y + 50 } });
    expect(hits).toEqual(['enemy', 'card']);
  });
  it('主动技：目标只认 core legalTargets；原因先查「没有可选目标」', () => {
    const { sc } = mkScene(undefined, 'H02', 'H04');
    const g = sc.g;
    const b = battleSkillButtons(g).find((x) => x.id === 'lijian')!;
    expect(b.disabled).toBe(false);
    for (const e of g.alive()) expect(skillTargetOk(g, 'lijian', e)).toBe(g.legalTargets('lijian').includes(e));
    // 只剩 1 个敌人：离间（hasAlly）没有合法目标
    g.en.slice(1).forEach((e) => (e.hp = 0));
    expect(skillReason(g, 'lijian')).toBe('没有可选目标');
    sc.tapSkill('lijian');
    expect(sc.mode).toBe('idle');
    expect(sc.hint).toContain('没有可选目标');
  });
  it('10+ 张手牌全部可点中（没有被裁切）', () => {
    const { sc } = mkScene();
    sc.g.hand = Array.from({ length: 11 }, (_, i) => card('B001', 'S', i + 1));
    const l = sc.handLayout();
    expect(l.maxScroll).toBe(0);
    sc.g.hand.forEach((c, i) => {
      const r = l.rects[i];
      const h = sc.hitTest({ x: r.x + 4, y: r.y + 50 });
      expect(h && h.kind === 'card' && h.card).toBe(c);
    });
  });
  it('判定展示只用事件载荷的牌面数据（#52）', () => {
    const v = judgeViewOf('乐不思蜀', { suit: 'H', rank: 12, name: '桃', result: { effective: false } });
    expect(v).toMatchObject({ face: '♥Q', red: true, name: '桃', effective: false });
    expect(judgeViewOf('闪电', { suit: 'S', rank: 1 }).face).toBe('♠A');
  });
  it('灵光一闪：正式版未接入弹层时不自动选第一个', async () => {
    const warns: string[] = [];
    const rel = new BattleScene({ now: testNow, warn: (m) => warns.push(m) });
    rel.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    const opts = [{ id: 'a', r: 'N', n: 'A', d: '', cat: 'sha' }] as never;
    expect(await rel.io.epiphany(rel.g.hand[0], opts, () => opts)).toBeNull();
    expect(warns.length).toBe(1);
    const { sc } = mkScene();
    expect(await sc.io.epiphany(sc.g.hand[0], opts, () => opts)).toBe((opts as unknown[])[0]);
  });
  it('drawElement 支持 disabled；rectOf 与 hitTest 一致', () => {
    const { sc } = mkScene();
    const { s } = recCtx();
    const alphas: number[] = [];
    const ctx = s.ctx as unknown as { fillRect: () => void; globalAlpha: number };
    ctx.fillRect = () => alphas.push(ctx.globalAlpha);
    sc.drawElement(s.ctx, { kind: 'endTurn' }, 'disabled');
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.45);
    for (const el of [{ kind: 'endTurn' as const }, { kind: 'hero' as const, which: 'main' as const }, { kind: 'enemy' as const, enemy: sc.g.alive()[0] }]) {
      const r = sc.rectOf(el)!;
      expect(sc.hitTest({ x: r.x + r.w / 2, y: r.y + r.h / 2 })?.kind).toBe(el.kind);
    }
  });
  it('默认接入 P1b 响应弹窗（makeRespond）：有合法牌时压入 response 弹层', async () => {
    const { sc, overlays } = mkScene(undefined);
    const shan = card('B004', 'D', 2);
    sc.g.hand = [shan, card('B001', 'S', 3)];
    const p = sc.io.respond('黄巾步卒 对你使用【杀】，伤害 1', (c) => c === shan, '不出闪', true);
    expect(overlays.ids().some((id) => id.includes('respon'))).toBe(true);
    overlays.closeAll('response');
    expect(await p).toBeNull();
  });
  it('接入 Engine（WebGL 关闭路径）可绘制', () => {
    const fp = fakePlatform({ query: { webgl: '0' } });
    const eng = new Engine(fp.p);
    eng.scenes.register('battle', () => new BattleScene({ now: testNow, overlays: eng.overlays }));
    void eng.scenes.go('battle');
    eng.frame(16);
    expect(eng.overlay).toBeNull();
    expect(fp.offscreens.some((c) => c.calls.includes('fillText'))).toBe(true);
  });
});

describe('战斗页跟进（勾玉 / 致命脉冲 / 手满 Toast / 后排间距）', () => {
  it('勾玉半径对齐 render-spec ⌀17 / ⌀11', () => {
    expect(BEAD_R_MAIN * 2).toBe(17);
    expect(BEAD_R_ENEMY * 2).toBe(11);
  });
  it('后排默认间距 120', () => {
    expect(BACK_ROW_GAP).toBe(120);
  });
  it('手牌硬上限触发 handOverflow Toast「手满，弃置」', () => {
    const { sc } = mkScene(undefined, 'H03', 'H04');
    const c = card('B001', 'S', 7);
    sc.io.handOverflow?.({ type: 'discard', reason: 'hand_overflow', card: c, cap: 10 });
    expect(sc.hint).toContain('手满，弃置');
    expect(sc.hint).toContain('杀');
  });
  it('武将名随 main/sub 变化（#55 战斗页）', () => {
    const { sc } = mkScene(undefined, 'H06', 'H04');
    expect(sc.g.main.name).toBe('曹操');
    expect(sc.g.sub.name).toBe('刘备');
    const { texts, s } = recCtx();
    sc.draw('main', s);
    // 竖排逐字绘制，断言每个字都出现过
    for (const ch of '曹操刘备') expect(texts).toContain(ch);
  });
});
