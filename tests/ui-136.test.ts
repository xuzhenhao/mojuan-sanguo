/** #136：营地子层隐藏选项卡；§21.4 去重复标题；toast 堆叠等宽；减少动态下致命光晕常亮 */
import { describe, expect, it, vi } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import { formalNotice, noticeRect, noticeStackWidth, setNoticeRenderer, showNotice } from '../src/game/overlays/notice';
import { VERSION_TEXT } from '../src/game/result/resume';
import { VERSION_DIALOG_TEXT } from '../src/core/run/save';
import { lethalGlowAlpha } from '../src/game/scenes/battle/scene';
import { RestScene, type RestRun } from '../src/game/scenes/rest';
import { MAP_CONFIG } from '../src/data/map';
import { flush, p4env, surface } from './p4-helpers';

const ov = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });

describe('#136 营地子层', () => {
  function setup() {
    const t = p4env();
    const st = { hp: 3, maxHp: 8 };
    const run: RestRun = { head: () => st, save: (p) => void (st.hp = p.hp), restConfig: MAP_CONFIG.rest };
    const s = new RestScene({ ...t.env, run: () => run });
    s.enter(t.ctx, { kind: 'rest', layer: 3, fixed: false });
    const spy = vi.spyOn(s as unknown as { drawOption: () => void }, 'drawOption');
    return { t, s, spy };
  }
  it('选牌层打开时不画底层三张选项卡，关闭后恢复', async () => {
    const { t, s, spy } = setup();
    s.draw('main', surface());
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockClear();
    const p = s.perform('burn');
    await flush();
    expect(s.sub).toBe(true);
    s.draw('main', surface());
    expect(spy).not.toHaveBeenCalled();
    t.overlays.closeAll();
    await p;
    expect(s.sub).toBe(false);
    s.draw('main', surface());
    expect(spy).toHaveBeenCalledTimes(3);
  });
  it('疗伤没有子层，不隐藏', async () => {
    const { s } = setup();
    await s.perform('heal');
    expect(s.sub).toBe(false);
  });
});

describe('#136 §21.4 版本确认框', () => {
  it('正文不再重复标题「游戏已更新」', () => {
    expect(VERSION_TEXT.startsWith('游戏已更新')).toBe(false);
    expect(VERSION_DIALOG_TEXT).toBe(VERSION_TEXT);
    expect(VERSION_TEXT).toBe('为保证规则一致，本场战斗将从头开始；进入本场战斗前的进度（体力、牌组、铜钱、地图路线）均已保留。');
  });
});

describe('#136 toast 堆叠等宽', () => {
  it('两条同屏时传给渲染器的 stackW 相同（取最宽一条）', () => {
    const o = ov();
    const got: (number | undefined)[] = [];
    setNoticeRenderer((_s, _t, _time, _slot, w) => got.push(w));
    showNotice(o, '短');
    showNotice(o, '这是一条明显更长的提示文字');
    o.draw(surface(), 16);
    o.draw(surface(), 16);
    setNoticeRenderer(null);
    const [a, b] = got.slice(-2);
    expect(a).toBe(b);
    expect(a).toBe(noticeStackWidth(o));
    expect(a!).toBeGreaterThan(0);
  });
  it('formalNotice 用 stackW 画出同宽胶囊', () => {
    const wide = noticeRect(300, 0).w;
    const rects: number[] = [];
    const s = surface();
    const c = s.ctx as unknown as { arc?: unknown; fillRect: (x: number, y: number, w: number) => void };
    const orig = c.fillRect.bind(c);
    delete c.arc;
    c.fillRect = (x: number, y: number, w: number) => (rects.push(w), orig(x, y, w));
    formalNotice(s, '短', 500, 0, 300);
    expect(rects[0]).toBe(wide);
  });
});

describe('#136 致命意图光晕', () => {
  it('减少动态：常亮 1，不随时间变化', () => {
    expect([0, 300, 600, 900].map((t) => lethalGlowAlpha(t, true))).toEqual([1, 1, 1, 1]);
  });
  it('正常：1.2s 脉冲在 .55–1 之间', () => {
    const v = [0, 300, 900].map((t) => lethalGlowAlpha(t, false));
    expect(v[1]).toBeCloseTo(1);
    expect(v[2]).toBeCloseTo(0.1);
  });
});
