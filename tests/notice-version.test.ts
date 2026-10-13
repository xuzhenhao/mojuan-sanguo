/** #122 PR3：toast 正式样式 + PRD §21.4 配置版本确认框 */
import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../src/engine/modal';
import { formalNotice, liveNotices, NOTICE_FONT, NOTICE_MS, NOTICE_STYLE, setNoticeRenderer, showNotice } from '../src/game/overlays/notice';
import { resumePlan, showVersionDialog, VERSION_TEXT, versionButton } from '../src/game/result/resume';
import { deserializeRunState, noticeText } from '../src/game/run/state';
import { RunSession } from '../src/game/run';
import { surface } from './p4-helpers';

const ov = () => new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });

describe('toast 正式样式', () => {
  it('字体只用霞鹜文楷（Brush），不带系统字体回退；2.5s 后关闭', () => {
    expect(NOTICE_FONT).toBe('16px "Brush"');
    expect(NOTICE_FONT).not.toMatch(/serif|sans|PingFang|Kai|楷/);
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
    const before = liveNotices();
    showNotice(o, 'A');
    showNotice(o, 'B');
    expect(liveNotices() - before).toBe(2);
    o.draw(surface(), 16);
    setNoticeRenderer(null);
    expect(slots.slice(-2)).toEqual([before, before + 1]);
    expect(NOTICE_STYLE.h + NOTICE_STYLE.gap).toBe(48);
  });
});

describe('§21.4 配置版本不一致', () => {
  it('文案一字不差，只有「继续」一个按钮', async () => {
    expect(VERSION_TEXT).toBe('游戏已更新。为保证规则一致，本场战斗将从头开始；进入本场战斗前的进度（体力、牌组、铜钱、地图路线）均已保留。');
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
