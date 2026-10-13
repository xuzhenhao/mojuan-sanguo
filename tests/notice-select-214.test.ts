import { describe, expect, it } from 'vitest';
import { NOTICE_STYLE, NOTICE_TOP, noticeLines, noticeRect, noticeTextMaxW, setNoticeTop } from '../src/game/overlays/notice';
import { resumeFailure } from '../src/game/result/abandon';

describe('#214 跟进：坏档提示不压点将标题', () => {
  it('点将页提示起点 y=118，最大宽 340', () => {
    expect(NOTICE_TOP.select).toBe(118);
    setNoticeTop(() => NOTICE_TOP.select);
    const r = noticeRect(9999, 0);
    expect(r.y).toBe(118);
    expect(r.w).toBe(340);
    setNoticeTop(null);
  });
  it('超宽文字折行而不缩字号，高度随行数增长', () => {
    const c = { font: '', measureText: (t: string) => ({ width: [...t].length * 16 }) } as never;
    const text = resumeFailure('corrupt').text;
    const lines = noticeLines(c, text);
    expect(lines.length).toBe(2);
    expect(lines.join('')).toBe(text);
    for (const l of lines) expect([...l].length * 16).toBeLessThanOrEqual(noticeTextMaxW() + 16);
    expect(noticeRect(296, 0, 390, 2).h).toBe(2 * NOTICE_STYLE.lineH + NOTICE_STYLE.padY * 2);
  });
});
