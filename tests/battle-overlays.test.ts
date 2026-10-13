import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import type { Surface } from '../src/engine/surfaces';
import { cardDetail, DETAIL, enemyDetail, layoutDetail, LongPressDetail, openDetail, placeDetail, skillDetail } from '../src/game/overlays/detail';
import { arrowEnd, makeRespond, openResponse, parseRequest, responseGeometry, type ResponseLayout } from '../src/game/overlays/response';
import { NO_LINE_END, NO_LINE_START, wrap } from '../src/game/overlays/theme';
import { setIconSet, STAMP_ICONS } from '../src/game/overlays/icons';
import { SERIF_DIGITS, setNumFont } from '../src/game/overlays/numfont';
import { detailOfHit, layoutFromRectOf, p1bHooks } from '../src/game/overlays/p1a-adapter';
import { Engine } from '../src/engine/engine';
import { CONFIG } from '../src/data/config';
import { card, mkGame } from './helpers';
import { fakeCanvas, fakePlatform } from './engine-fakes';

const surface = (): Surface => {
  const c = fakeCanvas(390, 844);
  return { name: 'main', canvas: c, ctx: c.ctx2d, scale: 1, dirty: true };
};
const stack = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
const layout: ResponseLayout = {
  cardRect: (i) => ({ x: 20 + i * 58, y: 648, w: 72, h: 104 }),
  attacker: { x: 150, y: 200, w: 96, h: 132 },
  hero: { x: 250, y: 464, w: 120, h: 168 },
};
const tap = (x: number, y: number) => ({ type: 'tap' as const, at: { x, y } });
const center = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
const step = (st: OverlayStack) => {
  st.update(100);
  st.draw(surface(), 100);
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('响应弹窗：接 core 决策点，Promise 返回选择', () => {
  it('解析 core 提示文本', () => {
    expect(parseRequest('张宝·墨影 对你使用【杀】，伤害 2')).toMatchObject({ kind: 'shan', dmg: 2, attacker: '张宝·墨影' });
    expect(parseRequest('濒死！体力 0，可用【桃】或【酒】自救').kind).toBe('dying');
  });
  it('有合法闪：默认选中第一张，确定可直接出；非法牌不可选；承受返回 null', async () => {
    const st = stack();
    const hand = [card('B001'), card('B004', 'H', 13), card('B005')];
    const { handle, state } = openResponse(
      st,
      { text: '甲 对你使用【杀】，伤害 1', legal: (c) => c.id === 'B004', pass: '不出闪', timed: true, hand },
      { layout: () => layout },
    );
    expect(st.top()?.kind).toBe('response');
    expect(state.selected).toBe(hand[1]); // #236 默认选中合法闪
    for (let i = 0; i < 3; i++) step(st); // 弹出动画完成（250ms）
    const geo = responseGeometry(layout, state);
    expect(geo.cards.filter((c) => c.legal).map((c) => c.card)).toEqual([hand[1]]);
    expect(geo.cards[1].rect.y).toBe(648 - 22); // 合法牌上浮 22
    st.gesture(tap(...center(geo.cards[0].rect)));
    expect(state.selected).toBe(hand[1]); // 非法牌不可改选
    st.gesture(tap(...center(geo.ok)));
    expect(await handle.result).toBe(hand[1]); // 未再点选也能直接确定
    const r2 = openResponse(st, { text: '甲 对你使用【杀】，伤害 1', legal: () => true, pass: '不出闪', timed: true, hand }, { layout: () => layout });
    expect(r2.state.selected).toBe(hand[0]); // 多合法时默认第一张
    st.gesture(tap(...center(responseGeometry(layout, r2.state).take)));
    expect(await r2.handle.result).toBeNull();
  });
  it('#236 多张合法闪：可点其他闪改选；点已选可取消后确定无效', async () => {
    const st = stack();
    const a = card('B004', 'H', 13);
    const b = card('B004', 'D', 7);
    const hand = [card('B001'), a, b];
    const legal = (c: (typeof hand)[number]) => c.id === 'B004';
    const { handle, state } = openResponse(st, { text: '甲 对你使用【杀】，伤害 1', legal, pass: '不出闪', timed: false, hand }, { layout: () => layout });
    expect(state.selected).toBe(a);
    for (let i = 0; i < 3; i++) step(st);
    const geo = responseGeometry(layout, state);
    st.gesture(tap(...center(geo.cards[2].rect)));
    expect(state.selected).toBe(b); // 改选另一张闪
    st.gesture(tap(...center(geo.cards[2].rect)));
    expect(state.selected).toBeNull(); // 再点已选 → 取消
    st.gesture(tap(...center(geo.ok)));
    expect(st.size).toBe(1); // 未选时确定无效
    st.gesture(tap(...center(geo.cards[1].rect)));
    expect(state.selected).toBe(a);
    st.gesture(tap(...center(geo.ok)));
    expect(await handle.result).toBe(a);
  });
  it('不允许点外部关闭；长按被吞掉', () => {
    const st = stack();
    openResponse(st, { text: 'x', legal: () => true, pass: '放弃', timed: false, hand: [card('B005')] }, { layout: () => layout });
    expect(st.gesture(tap(5, 5))).toBe(true);
    expect(st.gesture({ type: 'longpress', at: { x: 5, y: 5 } })).toBe(true);
    expect(st.size).toBe(1);
  });
  it('超时自动承受；场景暂停时倒计时冻结；需要持续出帧', async () => {
    const st = stack();
    let paused = true;
    const { handle, state } = openResponse(
      st,
      { text: '甲 对你使用【杀】，伤害 1', legal: () => true, pass: '不出闪', timed: true, hand: [card('B004')] },
      { layout: () => layout, seconds: 5, paused: () => paused },
    );
    expect(st.animating()).toBe('full');
    for (let i = 0; i < 100; i++) step(st);
    expect(state.left).toBe(5000);
    paused = false;
    for (let i = 0; i < 51; i++) step(st);
    await flush();
    expect(await handle.result).toBeNull();
    expect(st.size).toBe(0);
  });
  it('无合法牌：不弹窗，toast「无闪可出」后返回 null；自动出闪且仅 1 张合法牌：直接打出', async () => {
    const st = stack();
    const respond = makeRespond(st, () => [card('B001')], { layout: () => layout, autoShan: true });
    const p = respond('甲 对你使用【杀】，伤害 1', (c) => c.id === 'B004', '不出闪', true);
    await flush();
    expect(st.ids()).toEqual(['toast:no-legal']);
    expect(st.top()?.modal).toBe(false);
    for (let i = 0; i < 7; i++) step(st);
    expect(await p).toBeNull();
    const shan = card('B004');
    const r = makeRespond(st, () => [shan, card('B001')], { layout: () => layout, autoShan: true });
    expect(await r('甲 对你使用【杀】，伤害 1', (c) => c.id === 'B004', '不出闪', true)).toBe(shan);
    expect(st.size).toBe(0);
  });
  it('真实 core：Game.enemySha → respond 弹窗 → 出闪抵消；承受则扣血', async () => {
    const st = stack();
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.io.respond = makeRespond(st, () => g.hand, { layout: () => layout });
    g.startBattle();
    const shan = card('B004', 'H', 13);
    g.hand = [card('B005'), shan];
    const e = g.alive()[0];
    let res = g.enemySha(e, 1);
    await flush();
    const top = () => st.top()!;
    expect(top().kind).toBe('response');
    for (let i = 0; i < 3; i++) step(st);
    // #236：合法闪已默认选中，直接点确定
    st.gesture(tap(...center({ x: layout.hero.x - 238, y: layout.hero.y + 4 + 56 + 8 + 6 + 14, w: 108, h: 44 })));
    expect(await res).toBe('shan');
    expect(g.hand).not.toContain(shan);
    const hp = g.p.hp;
    g.hand = [card('B004')];
    res = g.enemySha(e, 1);
    await flush();
    for (let i = 0; i < 3; i++) step(st);
    const s = st.top()!;
    expect(s.kind).toBe('response');
    st.gesture(tap(layout.hero.x - 238 + 230 - 54, layout.hero.y + 4 + 56 + 8 + 6 + 14 + 22));
    expect(await res).toBe('hit');
    expect(g.p.hp).toBe(hp - 1);
  });
});

describe('长按详情浮层', () => {
  const safe = { x: 0, y: 47, w: 390, h: 763 };
  it('内容：牌（含词条）、敌人（意图）、武将技能', () => {
    const aff = CONFIG.affixes[0];
    const c = cardDetail(card('B004', 'H', 13, [aff.id]));
    expect(c).toMatchObject({ title: '闪', cost: 0, suit: 'H', rank: 13 });
    expect(c.lines.join()).toContain(aff.name);
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.battleIdx = 2;
    g.startBattle();
    const zb = g.alive().find((e) => e.elite)!;
    const d = enemyDetail(zb);
    expect(d.lines.join()).toMatch(/意图：.*杀/);
    expect(d.lines.join()).toContain('黄天庇佑');
    expect(skillDetail({ name: '龙胆', desc: 'x', kind: '锁定技' }, '赵云').sub).toBe('赵云 · 锁定技');
  });
  it('宽 180、高 ≤200；对齐手指上方并钳制在安全区', () => {
    const s = surface();
    const long = { title: 't', lines: ['很长的说明'.repeat(40)] };
    const { h, lines } = layoutDetail(s.ctx, long);
    expect(h).toBeLessThanOrEqual(DETAIL.maxH);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
    const r = placeDetail({ x: 385, y: 400 }, 120, safe);
    expect(r.w).toBe(180);
    expect(r.x + r.w).toBeLessThanOrEqual(390);
    expect(r.y + r.h).toBeLessThan(400);
    const top = placeDetail({ x: 10, y: 60 }, 120, safe);
    expect(top.y).toBeGreaterThanOrEqual(safe.y);
    expect(top.x).toBeGreaterThanOrEqual(0);
  });
  it('长按：进度环 → 420ms 弹出；点外部关闭；同时只有一个详情', () => {
    const st = stack();
    const s = surface();
    const lp = new LongPressDetail(st, (at) => (at.y > 500 ? { title: '杀', lines: ['x'] } : null), {
      safe: () => safe,
      measure: () => s.ctx,
      invalidate() {},
    });
    lp.gesture({ type: 'longpressprogress', at: { x: 100, y: 600 }, progress: 0.5 });
    expect(lp.progress).toBe(0.5);
    lp.draw(s);
    expect(lp.gesture({ type: 'longpress', at: { x: 100, y: 600 } })).toBe(true);
    expect(lp.progress).toBe(0);
    expect(st.ids()).toEqual(['detail:杀']);
    openDetail(st, { title: '闪', lines: [] }, { x: 100, y: 600 }, safe, s.ctx);
    expect(st.ids()).toEqual(['detail:闪']);
    st.gesture(tap(5, 100));
    expect(st.size).toBe(0);
    // 空白处不显示环、不弹出
    lp.gesture({ type: 'longpressprogress', at: { x: 100, y: 100 }, progress: 0.5 });
    expect(lp.progress).toBe(0);
    expect(lp.gesture({ type: 'longpress', at: { x: 100, y: 100 } })).toBe(false);
  });
});

describe('#42 评审修正', () => {
  const textSurface = () => {
    const s = surface();
    const texts: string[] = [];
    const g = s.ctx as unknown as Record<string, unknown>;
    g.fillText = (t: string) => texts.push(t);
    return { s, texts };
  };
  it('P1-1：弹窗与详情不再用系统符号 / emoji（❤ ⚔ 🗡 ♠♥♣♦）', async () => {
    const { s, texts } = textSurface();
    const st = stack();
    openResponse(
      st,
      { text: '张宝 对你使用【杀】，伤害 2', legal: () => true, pass: '不出闪', timed: true, hand: [card('B004', 'H', 13), card('B001', 'S', 1)] },
      { layout: () => layout },
    );
    st.update(300);
    st.draw(s, 0);
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.battleIdx = 2;
    g.startBattle();
    openDetail(st, enemyDetail(g.alive().find((e) => e.elite)!), { x: 200, y: 400 }, { x: 0, y: 0, w: 390, h: 844 }, s.ctx);
    openDetail(st, cardDetail(card('B004', 'D', 12)), { x: 200, y: 400 }, { x: 0, y: 0, w: 390, h: 844 }, s.ctx);
    st.draw(s, 0);
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.join('')).not.toMatch(/[❤⚔🗡🏹🛡⬇♠♥♣♦]/u);
  });
  it('P2-3：标点避头尾——右括号不单独成行、开括号不留行尾', () => {
    const s = surface();
    const lines = wrap(s.ctx, '弃置一名敌人至多两点护甲（视为杀，可闪）', 13 * 13, 13);
    for (const l of lines.slice(1)) expect(NO_LINE_START.has(l[0])).toBe(false);
    for (const l of lines.slice(0, -1)) expect(NO_LINE_END.has(l[l.length - 1])).toBe(false);
    expect(lines.join('')).toBe('弃置一名敌人至多两点护甲（视为杀，可闪）');
    const l2 = wrap(s.ctx, '一二三四五六七八九十（甲）', 10 * 13, 13);
    expect(l2[1].startsWith('（')).toBe(true);
  });
  it('P2-4：倒计时期间只局部重绘（tick），不整层重绘', () => {
    const st = stack();
    openResponse(st, { text: '甲 对你使用【杀】，伤害 1', legal: () => true, pass: '不出闪', timed: true, hand: [card('B004')] }, { layout: () => layout });
    expect(st.animating()).toBe('full');
    for (let i = 0; i < 3; i++) st.update(100);
    expect(st.animating()).toBe('tick');
    const s = surface();
    const c = s.canvas as unknown as { calls: string[] };
    st.tick(s);
    const n = c.calls.length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10); // 只画倒计时块（底 + 槽 + 进度 + 秒数）
  });
  it('P2-4：引擎在 tick 模式下不重绘场景，只调用弹层 tick', async () => {
    const plat = fakePlatform();
    let sceneDraws = 0;
    const e = new Engine(plat.p);
    e.scenes.register('x', () => ({ id: 'x', enter() {}, exit() {}, draw: () => void sceneDraws++ }));
    await e.scenes.go('x');
    e.frame(16);
    const base = sceneDraws;
    openResponse(
      e.overlays,
      { text: '甲 对你使用【杀】，伤害 1', legal: () => true, pass: '不出闪', timed: true, hand: [card('B004')] },
      { layout: () => layout },
    );
    for (let i = 0; i < 4; i++) e.frame(100); // 弹出动画：整层重绘
    const afterIntro = sceneDraws;
    expect(afterIntro).toBeGreaterThan(base);
    for (let i = 0; i < 10; i++) e.frame(100);
    expect(sceneDraws).toBe(afterIntro);
    expect(e.needsFrame()).toBe(true);
  });
  it('P2-5：箭头终点在主将牌顶边中点', () => {
    expect(arrowEnd({ x: 250, y: 464, w: 120, h: 168 })).toEqual({ x: 310, y: 466 });
  });
  it('P2-1：数字字体 / 图标接口可替换', () => {
    const calls: string[] = [];
    setNumFont({ draw: (_c, s) => (calls.push(`n:${s}`), 10), measure: () => 10 });
    setIconSet({ has: () => true, draw: (_c, id) => void calls.push(`i:${id}`) });
    try {
      const st = stack();
      openResponse(
        st,
        { text: '甲 对你使用【杀】，伤害 2', legal: () => true, pass: '不出闪', timed: true, hand: [card('B004', 'H', 13)] },
        { layout: () => layout },
      );
      st.update(300);
      st.draw(surface(), 0);
      expect(calls).toContain('i:ui_hp');
      expect(calls).toContain('n:−2');
      expect(calls).toContain('i:suit_H');
      expect(calls).toContain('n:K');
    } finally {
      setNumFont(SERIF_DIGITS);
      setIconSet(STAMP_ICONS);
    }
  });
  it('P1a 适配层：rectOf → ResponseLayout；命中元素 → 详情', async () => {
    const st = stack();
    const { g } = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    g.startBattle();
    const hand = [card('B004'), card('B001')];
    g.hand = hand;
    const ctx = {
      overlays: st,
      game: g,
      safe: { x: 0, y: 0, w: 390, h: 844 },
      rectOf: (el: { kind: string; card?: unknown }) =>
        el.kind === 'card'
          ? { x: 20 + hand.indexOf(el.card as never) * 58, y: 648, w: 72, h: 104 }
          : el.kind === 'hero'
            ? layout.hero
            : el.kind === 'enemy'
              ? layout.attacker!
              : null,
    };
    const lay = layoutFromRectOf(ctx as never, g.alive()[0]);
    expect(lay.cardRect(1, 2)).toEqual({ x: 78, y: 648, w: 72, h: 104 });
    expect(lay.hero).toEqual(layout.hero);
    expect(detailOfHit({ kind: 'skill', id: 'longdan' }, g)?.title).toBe('龙胆');
    expect(detailOfHit({ kind: 'hero', which: 'sub' }, g)?.sub).toContain('副将技');
    const hooks = p1bHooks({ measure: () => surface().ctx });
    expect(hooks.detail({ kind: 'card', card: hand[0], rect: { x: 20, y: 648, w: 72, h: 104 } }, ctx as never)).toBe(true);
    expect(st.top()?.kind).toBe('detail');
    const p = hooks.respond(
      { text: '甲 对你使用【杀】，伤害 1', legal: (c) => c === hand[0], pass: '不出闪', timed: false, attacker: null, legalCards: [hand[0]] },
      ctx as never,
    );
    await flush();
    expect(st.ids()).toContain('response');
    st.closeAll('response');
    expect(await p).toBeNull();
  });
});
