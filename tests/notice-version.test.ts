/** #122 PR3：toast 正式样式 + PRD §21.4 配置版本确认框 */
import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import {
  formalNotice,
  liveNotices,
  NOTICE_FONT,
  NOTICE_MAX,
  NOTICE_MS,
  NOTICE_STYLE,
  NOTICE_TOP,
  noticeRect,
  setNoticeRenderer,
  setNoticeTop,
  showNotice,
} from '../src/game/overlays/notice';
import { resumePlan, showVersionDialog, VERSION_TEXT, versionButton } from '../src/game/result/resume';
import { deserializeRunState, noticeText } from '../src/game/run/state';
import { RunSession } from '../src/game/run';
import { surface } from './p4-helpers';

const ov = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });

describe('toast 正式样式', () => {
  it('字体只用霞鹜文楷（Brush），未就绪回退 serif（#202）；2.5s 后关闭', () => {
    expect(NOTICE_FONT).toBe('16px "Brush", serif');
    expect(NOTICE_FONT).not.toMatch(/PingFang|Kai|楷/);
    const o = ov();
    const fonts: string[] = [];
    const s = surface();
    const ctx = s.ctx as unknown as { font: string };
    showNotice(o, '已回到进入此处前');
    o.update?.(100);
    formalNotice(s, '已回到进入此处前', 500, 0);
    fonts.push(ctx.font);
    expect(fonts).toEqual([NOTICE_FONT]);
    expect(NOTICE_MS).toBe(2500);
    expect(o.size).toBe(1);
    expect(showNotice(o, null)).toBeNull();
    expect(o.size).toBe(1);
  });
  it('两条同时在屏时堆叠：第二条 slot=1，位置下移 h+gap', () => {
    const o = ov();
    const slots: number[] = [];
    setNoticeRenderer((_s, _t, _time, slot) => slots.push(slot));
    showNotice(o, 'A');
    showNotice(o, 'B');
    o.draw(surface(), 16);
    setNoticeRenderer(null);
    expect(slots.slice(-2)).toEqual([0, 1]);
    expect(NOTICE_STYLE.h + NOTICE_STYLE.gap).toBe(48);
  });
});

describe('toast 位置 / 宽度 / 堆叠（UI 验收）', () => {
  it('起点在 HUD 下边缘 + 8：地图 = 金轴下方 120，战斗 = 顶条下 44，其他默认 64', () => {
    expect(NOTICE_TOP.map).toBe(120);
    expect(NOTICE_TOP.map).toBeGreaterThanOrEqual(48 + 50 + 8); // 地图 HUD y48 h50，绝不盖 HUD
    expect(NOTICE_TOP.battle).toBe(44);
    setNoticeTop(() => NOTICE_TOP.map);
    expect(noticeRect(100, 0).y).toBe(120);
    expect(noticeRect(100, 1).y).toBe(120 + 48);
    setNoticeTop(null);
    expect(noticeRect(100, 0).y).toBe(64);
  });
  it('宽度按内容自适应：最小 200，最大 min(屏宽 − 48, 340)，水平居中', () => {
    expect(noticeRect(10, 0)).toMatchObject({ w: 200, x: 95 });
    const mid = noticeRect(200, 0);
    expect(mid.w).toBe(200 + 44);
    expect(mid.x * 2 + mid.w).toBe(390);
    expect(noticeRect(1000, 0)).toMatchObject({ w: NOTICE_STYLE.maxW, x: 25 }); // #214 跟进：最大 340
    expect(noticeRect(1000, 0, 375).w).toBe(375 - 48);
  });
  it('新来的在下面、旧的往上挤；最多 2 条，超出移掉最旧', () => {
    const o = ov();
    const seen: string[] = [];
    setNoticeRenderer((_s, text, _t, slot) => seen.push(`${slot}:${text}`));
    expect(liveNotices(o)).toBe(0);
    showNotice(o, 'A');
    showNotice(o, 'B');
    showNotice(o, 'C');
    expect(NOTICE_MAX).toBe(2);
    expect(liveNotices(o)).toBe(2);
    o.draw(surface(), 16);
    setNoticeRenderer(null);
    expect(seen.sort()).toEqual(['0:B', '1:C']);
  });
});

describe('§21.4 配置版本不一致', () => {
  it('文案一字不差，只有「继续」一个按钮', async () => {
    expect(VERSION_TEXT).toBe('为保证规则一致，本场战斗将从头开始；进入本场战斗前的进度（体力、牌组、铜钱、地图路线）均已保留。');
    const o = ov();
    const f = { width: 390, height: 844 };
    const h = showVersionDialog(o, f);
    o.gesture({ type: 'tap', at: { x: 5, y: 5 } });
    expect(o.size).toBe(1);
    const b = versionButton(f);
    o.gesture({ type: 'tap', at: { x: b.x + b.w / 2, y: b.y + b.h / 2 } });
    expect(await h.result).toBe('continue');
  });
  it('战斗中：只弹确认框、不叠 toast；不在战斗中：静默升级；与旧档迁移同时触发：只弹确认框', () => {
    expect(resumePlan({ configChanged: true, migration: null, pendingType: 'BATTLE', toast: '已回到本场战斗开打前' })).toEqual({
      dialog: true,
      toast: null,
      upgradeConfig: true,
    });
    expect(resumePlan({ configChanged: true, migration: null, pendingType: 'SHOP', toast: null })).toEqual({ dialog: false, toast: null, upgradeConfig: true });
    expect(resumePlan({ configChanged: true, migration: null, pendingType: null, toast: null })).toEqual({ dialog: false, toast: null, upgradeConfig: true });
    expect(resumePlan({ configChanged: true, migration: { kind: 'node_rollback' }, pendingType: null, toast: '存档已更新，已回到上一处' })).toEqual({
      dialog: true,
      toast: null,
      upgradeConfig: true,
    });
    expect(resumePlan({ configChanged: false, migration: null, pendingType: 'SHOP', toast: '已回到进入此处前' })).toEqual({
      dialog: false,
      toast: '已回到进入此处前',
      upgradeConfig: false,
    });
  });
  it('读档：configVersion 不一致 → notice = config_confirm，noticeText 为空（无 toast）', () => {
    const run = new RunSession();
    run.start({ main: 'H03', sub: 'H04', seed: 3 }, undefined, { configVersion: 'old' });
    run.enterNode({ id: 'L1C0', type: 'BATTLE' });
    const r = deserializeRunState(run.serialize(), { configVersion: 'new' });
    expect(r.ok && [r.configChanged, r.notice, noticeText(r.notice, r.state.pendingNode)]).toEqual([true, 'config_confirm', null]);
  });
});
