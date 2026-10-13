import { afterEach, describe, expect, it } from 'vitest';
import { NOTICE_BOTTOM, NOTICE_STYLE, NOTICE_TOP, noticeLines, noticeRect, setNoticeBottom } from '../src/game/overlays/notice';
import { resumeFailure } from '../src/game/result/abandon';
import { SELECT_LAYOUT } from '../src/game/select/layout';

const measure16 = { font: '', measureText: (t: string) => ({ width: [...t].length * 16 }) } as never;
afterEach(() => setNoticeBottom(null));

describe('#214 跟进 v2：点将页坏档提示一行、贴底', () => {
  it('文案为一行「存档已损坏，请重新点将出征」，不折行', () => {
    const t = resumeFailure('corrupt').text;
    expect(t).toBe('存档已损坏，请重新点将出征');
    expect(noticeLines(measure16, t)).toEqual([t]);
  });
  it('点将页：提示条底边 = 「出征」按钮顶边 − 12，水平居中，宽随内容、最大 340', () => {
    expect(NOTICE_TOP.select).toBeUndefined();
    expect(NOTICE_BOTTOM.select).toBe(SELECT_LAYOUT.start.y - 12);
    setNoticeBottom(() => NOTICE_BOTTOM.select);
    const r = noticeRect(13 * 16, 0);
    expect(r.y + r.h).toBe(SELECT_LAYOUT.start.y - 12);
    expect(r.h).toBe(NOTICE_STYLE.h);
    expect(r.w).toBe(13 * 16 + NOTICE_STYLE.padX * 2);
    expect(r.x * 2 + r.w).toBe(390);
    expect(noticeRect(9999, 0).w).toBe(340);
  });
  it('底部锚定时多条自下而上堆叠（最新在最下）', () => {
    setNoticeBottom(() => 700);
    const old = noticeRect(100, 0, 390, 1, 2);
    const neu = noticeRect(100, 1, 390, 1, 2);
    expect(neu.y + neu.h).toBe(700);
    expect(old.y).toBe(neu.y - NOTICE_STYLE.h - NOTICE_STYLE.gap);
  });
  it('其他页不受影响（仍从顶部起排）', () => {
    expect(noticeRect(100, 0).y).toBeLessThan(200);
  });
});
