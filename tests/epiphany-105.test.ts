/** #105 灵光一闪弹层：布局、必选 / 满词条替换 / 放弃、墨聚与减少动态、core 替换写回、调试入口 */
import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import { affixPool } from '../src/core/rules';
import type { AffixDef } from '../src/core/types';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { readFileSync } from 'node:fs';
import {
  EPIPHANY_ID,
  EPIPHANY_INTRO_MS,
  EPIPHANY_SCRIM,
  EPIPHANY_TEXT,
  SEL_MS,
  drawRarity,
  epiphanyCommit,
  epiphanyLayout,
  epiphanyUiEnd,
  openEpiphany,
  outMs,
  scrimAlpha,
  type EpiphanyInfo,
} from '../src/game/overlays/epiphany';
import { triggerDebugEpiphany, wantDebugEpiphany } from '../src/game/scenes/battle/debug-epiphany';
import { card, mkGame } from './helpers';
import { center, flush, surface, tap } from './p4-helpers';

const W = 390;
const H = 844;
const mk = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
const info = (mods: string[] = []): EpiphanyInfo => {
  const c = card('B001', 'S', 7, mods);
  return { card: c, options: affixPool(c).slice(0, 3), count: 1, max: 2 };
};
/** 提交后走完飞入 + 退场动画 */
const finish = (ov: OverlayStack) => ov.top()?.update?.(1000);
const tapR = (ov: OverlayStack, r: { x: number; y: number; w: number; h: number }) => ov.gesture(tap(...center(r)));

describe('#105 布局（render-spec §8.6）', () => {
  it('默认：大牌 116 起 104×150；候选 310 起每条 76 间距 12', () => {
    const L = epiphanyLayout(W, H, false, 3);
    expect(L.card).toMatchObject({ y: 116, w: 104, h: 150 });
    expect(L.opts.map((r) => [r.y, r.h])).toEqual([
      [310, 76],
      [398, 76],
      [486, 76],
    ]);
    expect(L.olds).toEqual([]);
    expect(L.giveUp).toBeNull();
  });
  it('满词条：已有词条 282 起两列 48 高；候选 362 起每条 68；有放弃', () => {
    const L = epiphanyLayout(W, H, true, 3);
    expect(L.olds.map((r) => [r.y, r.h])).toEqual([
      [282, 48],
      [282, 48],
    ]);
    expect(L.opts[0]).toMatchObject({ y: 362, h: 68 });
    expect(L.giveUp).not.toBeNull();
    expect(L.opts.at(-1)!.y + 68).toBeLessThan(L.hintY);
  });
  it('候选不足 3 条按实际数量', () => expect(epiphanyLayout(W, H, false, 2).opts).toHaveLength(2));
});

describe('#105 提交规则', () => {
  it('词条 < 2：未选不能提交；选中即可', () => {
    const i = info();
    expect(epiphanyCommit(i, { sel: -1, target: null, t: 0 })).toBeUndefined();
    expect(epiphanyCommit(i, { sel: 1, target: null, t: 0 })).toMatchObject({ id: i.options[1].id });
  });
  it('词条 = 2：要同时选新词条和替换目标', () => {
    const pool = affixPool(card('B001'));
    const i = info([pool[3].id, pool[4].id]);
    expect(epiphanyCommit(i, { sel: 0, target: null, t: 0 })).toBeUndefined();
    expect(epiphanyCommit(i, { sel: 0, target: pool[4].id, t: 0 })).toMatchObject({ replace: pool[4].id });
  });
});

describe('#105 弹层交互', () => {
  it('默认态：减少动态跳过墨聚；无取消，点遮罩不关；选后铭刻', async () => {
    const ov = mk();
    const i = info();
    const ev: string[] = [];
    const p = openEpiphany(ov, i, { width: W, height: H, reducedMotion: () => true, track: (e) => ev.push(e) });
    const L = epiphanyLayout(W, H, false, 3);
    expect(ov.top()?.id).toBe(EPIPHANY_ID);
    expect(ov.top()?.pausesScene).toBe(true);
    ov.draw(surface(), 16);
    ov.gesture(tap(5, 5)); // 遮罩
    tapR(ov, L.ok); // 未选：disabled
    expect(ov.top()?.id).toBe(EPIPHANY_ID);
    tapR(ov, L.opts[2]);
    tapR(ov, L.ok);
    finish(ov);
    expect(await p).toMatchObject({ id: i.options[2].id });
    expect(ev).toEqual(['epiphany_show', 'epiphany_pick']);
  });
  it('墨聚 900ms 内不接受点击；之后可选', async () => {
    const ov = mk();
    const i = info();
    const p = openEpiphany(ov, i, { width: W, height: H, reducedMotion: () => false });
    const L = epiphanyLayout(W, H, false, 3);
    expect(ov.top()?.animating?.()).toBe(true);
    tapR(ov, L.opts[0]);
    ov.top()!.update!(EPIPHANY_INTRO_MS + 400);
    expect(ov.top()?.animating?.()).toBe(false);
    tapR(ov, L.ok);
    expect(ov.top()?.id).toBe(EPIPHANY_ID); // 墨聚期间的点选没生效
    tapR(ov, L.opts[0]);
    tapR(ov, L.ok);
    finish(ov);
    expect(await p).toMatchObject({ id: i.options[0].id });
  });
  it('满词条：选新词条 + 替换目标 → 替换；放弃 → null', async () => {
    const pool = affixPool(card('B001'));
    const i = info([pool[3].id, pool[4].id]);
    i.options = pool.slice(0, 3);
    const L = epiphanyLayout(W, H, true, 3);
    const ov = mk();
    const p = openEpiphany(ov, i, { width: W, height: H, reducedMotion: () => true });
    tapR(ov, L.opts[1]);
    tapR(ov, L.ok);
    expect(ov.top()?.id).toBe(EPIPHANY_ID);
    tapR(ov, L.olds[0]);
    ov.draw(surface(), 16);
    tapR(ov, L.ok);
    finish(ov);
    expect(await p).toMatchObject({ id: pool[1].id, replace: pool[3].id });
    const ov2 = mk();
    const p2 = openEpiphany(ov2, i, { width: W, height: H, reducedMotion: () => true });
    tapR(ov2, L.giveUp!);
    finish(ov2);
    expect(await p2).toBeNull();
  });
});

describe('#105 core 写回', () => {
  it('满 2 条带 replace：替换指定词条（不再挤掉最旧的）', async () => {
    const pool = affixPool(card('B001'));
    let seen: AffixDef[] = [];
    const { g } = mkGame({ epiphany: async (_c, o) => ((seen = o), { ...o[0], replace: pool[4].id }) });
    const c = card('B001', 'S', 7, []);
    const p = affixPool(c, g.deckMaster).filter((a) => ![pool[3].id, pool[4].id].includes(a.id));
    c.mods = [pool[3].id, pool[4].id];
    g.settings.epiphanyRate = 1;
    await g.maybeEpiphany(c, true);
    expect(c.mods).toEqual([pool[3].id, seen[0].id]);
    expect(p.length).toBeGreaterThan(0);
    expect(g.epiCount).toBe(1);
  });
  it('放弃：词条不变，次数照常消耗', async () => {
    const { g } = mkGame({ epiphany: async () => null });
    const c = card('B001');
    g.settings.epiphanyRate = 1;
    await g.maybeEpiphany(c, true);
    expect([c.mods, g.epiCount, g.sincePity]).toEqual([[], 1, 0]);
  });
});

describe('#105 战斗页接入与调试入口', () => {
  it('正式战斗页默认弹灵光一闪层', async () => {
    const ov = mk();
    const sc = new BattleScene({ overlays: ov, reducedMotion: () => true });
    sc.enter({ width: W, height: H, invalidate() {} }, { seed: 7 });
    const i = info();
    const p = sc.io.epiphany(i.card, i.options, () => i.options);
    await flush();
    expect(ov.top()?.id).toBe(EPIPHANY_ID);
    const L = epiphanyLayout(W, H, false, 3);
    tapR(ov, L.opts[0]);
    tapR(ov, L.ok);
    finish(ov);
    expect(await p).toMatchObject({ id: i.options[0].id });
  });
  it('?page=battle&epiphany=1|full 只在开发构建生效', () => {
    expect(wantDebugEpiphany({ page: 'battle', epiphany: '1' }, true)).toBe('default');
    expect(wantDebugEpiphany({ page: 'battle', epiphany: 'full' }, true)).toBe('full');
    expect(wantDebugEpiphany({ page: 'battle', epiphany: '1' }, false)).toBeNull();
    expect(wantDebugEpiphany({ page: 'map', epiphany: '1' }, true)).toBeNull();
  });
  it('调试触发：满态先给牌 2 条词条，走 core 流程', async () => {
    let mods: string[] = [];
    const { g } = mkGame({ epiphany: async (c) => ((mods = [...c.mods]), null) });
    g.startBattle();
    await triggerDebugEpiphany(g, 'full');
    expect(mods).toHaveLength(2);
  });
});

describe('#105 视觉规格（docs/art/specs/spec-105-epiphany.md）', () => {
  it('§1 尺寸：候选 350 宽 x=20；已有行 169×48 x=20/201；铭刻 96×44 x=274，放弃 x=20', () => {
    const d = epiphanyLayout(W, H, false, 3);
    expect(d.opts.every((r) => r.x === 20 && r.w === 350)).toBe(true);
    expect(d.ok).toMatchObject({ x: 274, w: 96, h: 44 });
    const f = epiphanyLayout(W, H, true, 3);
    expect(f.olds.map((r) => [r.x, r.y, r.w, r.h])).toEqual([
      [20, 282, 169, 48],
      [201, 282, 169, 48],
    ]);
    expect(f.opts.map((r) => r.y)).toEqual([362, 442, 522]);
    expect(f.giveUp).toMatchObject({ x: 20, w: 96, h: 44 });
    expect(f.hintY).toBe(f.barY - 30);
    expect(f.opts.at(-1)!.y + 68).toBeLessThan(f.hintY - 8);
  });
  it('§3 遮罩：径向 .30 → .88，圆心 50%/30%，半径对角线 60%；入场 200ms 淡入', () => {
    expect(EPIPHANY_SCRIM.radial).toMatchObject({ cx: 0.5, cy: 0.3, r: 0.6 });
    expect(EPIPHANY_SCRIM.radial.stops.map((s) => s[1])).toEqual(['rgba(60,40,10,.30)', 'rgba(0,0,0,.88)']);
    expect(scrimAlpha({ sel: -1, target: null, t: 100 }, false)).toBeCloseTo(0.5);
    expect(scrimAlpha({ sel: -1, target: null, t: 75 }, true)).toBeCloseTo(0.5);
  });
  it('§4 900ms 起可点，点击跳到入场终态并生效', () => {
    const ov = mk();
    const i = info();
    void openEpiphany(ov, i, { width: W, height: H, reducedMotion: () => false });
    const L = epiphanyLayout(W, H, false, 3);
    ov.top()!.update!(EPIPHANY_INTRO_MS);
    expect(ov.top()!.animating!()).toBe(true); // 候选还在入场
    tapR(ov, L.opts[1]);
    ov.top()!.update!(SEL_MS);
    ov.draw(surface(), 16);
    expect(ov.top()!.animating!()).toBe(false);
    expect(epiphanyUiEnd(false, 3)).toBe(700 + 2 * 60 + 220);
    expect(epiphanyUiEnd(true, 3)).toBe(700 + 3 * 60 + 220);
  });
  it('§4 铭刻后先飞入 300ms + 退场 200ms 才给结果；减少动态飞入 150ms', async () => {
    expect(outMs({ ...info().options[0] }, false)).toBe(500);
    expect(outMs({ ...info().options[0] }, true)).toBe(350);
    expect(outMs(null, false)).toBe(200);
    const ov = mk();
    let done = false;
    const p = openEpiphany(ov, info(), { width: W, height: H, reducedMotion: () => true }).then((r) => ((done = true), r));
    const L = epiphanyLayout(W, H, false, 3);
    tapR(ov, L.opts[0]);
    tapR(ov, L.ok);
    ov.top()!.update!(300);
    await flush();
    expect(done).toBe(false);
    ov.top()!.update!(60);
    expect(await p).not.toBeNull();
  });
  it('§3 稀有度菱形形状编码：N 只描边，R 实心，E 多一个暗点，L 多一圈描边', () => {
    const calls = (r: 'N' | 'R' | 'E' | 'L') => {
      const log: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (o, k) => (typeof k === 'string' && k in o ? o[k] : () => void log.push(String(k))),
        set: (o, k, v) => ((o[k as string] = v), true),
      });
      drawRarity(ctx as never, r, 10, 10, 14);
      return log.filter((x) => x === 'fill' || x === 'stroke').join(',');
    };
    expect([calls('N'), calls('R'), calls('E'), calls('L')]).toEqual(['stroke', 'fill', 'fill,fill', 'fill,stroke']);
  });
  it('§3 新增书法文案都在霞鹜文楷子集里（构建字表）', () => {
    const chars = readFileSync('scripts/wenkai-chars-core.txt', 'utf8') + readFileSync('scripts/wenkai-chars-ext.txt', 'utf8');
    const miss = [...new Set(Object.values(EPIPHANY_TEXT).join('').replace(/\s/g, ''))].filter((ch) => !chars.includes(ch));
    expect(miss).toEqual([]);
  });
  it('§2 排队的响应窗口等灵光一闪关闭后再开', async () => {
    const ov = mk();
    const sc = new BattleScene({
      overlays: ov,
      reducedMotion: () => true,
      hooks: { respond: async () => (order.push(`respond:${ov.top()?.id ?? 'none'}`), null) },
    });
    const order: string[] = [];
    sc.enter({ width: W, height: H, invalidate() {} }, { seed: 7 });
    const i = info();
    const pe = sc.io.epiphany(i.card, i.options, () => i.options);
    await flush();
    const pr = sc.io.respond('闪', () => true, '不出闪', false);
    await flush();
    expect(order).toEqual([]);
    const L = epiphanyLayout(W, H, false, 3);
    tapR(ov, L.opts[0]);
    tapR(ov, L.ok);
    finish(ov);
    await Promise.all([pe, pr]);
    expect(order).toEqual(['respond:none']); // 打开响应时灵光一闪已关闭
  });
});

describe('#105 调试 epiN', () => {
  it('epiN=2：只给 2 条候选', async () => {
    let n = 0;
    const { g } = mkGame({ epiphany: async (_c, o) => ((n = o.length), null) });
    g.startBattle();
    await triggerDebugEpiphany(g, 'default', 2);
    expect(n).toBe(2);
  });
});
