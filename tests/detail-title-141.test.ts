import { describe, expect, it } from 'vitest';
import { badgeWidth, cardDetail, DETAIL, layoutDetail, layoutHead, TITLE_MIN_PX } from '../src/game/overlays/detail';
import { fitName, nameChars, nameTierPx } from '../src/game/scenes/battle/hpview';

// 无 measureText 的假 ctx：CJK 按字号、其他按 0.55 估算
const ctx = () => ({ font: '' }) as never;
const cjk = (t: string, px: number) => [...t].reduce((w, ch) => w + (ch === '·' ? px * 0.55 : px), 0);

describe('#141 详情浮层标题与右上徽记不重叠', () => {
  const x101 = cardDetail({ uid: 1, id: 'X101', suit: 'S', rank: 7, mods: [] } as never);
  it('X101 标题是「方天戟·破阵」，带费用与花色', () => {
    expect(x101.title).toBe('方天戟·破阵');
    expect(x101.cost).not.toBeUndefined();
  });
  it('20 仍放不下 → 徽记移到下一行，与副标题同行或副标题下移', () => {
    const g = ctx();
    const h = layoutHead(g, x101);
    const inner = DETAIL.w - DETAIL.pad * 2;
    expect(cjk(x101.title, TITLE_MIN_PX)).toBeGreaterThan(inner - badgeWidth(g, x101) - 8);
    expect(h.badgesBelow).toBe(true);
    expect(h.titlePx).toBeLessThanOrEqual(TITLE_MIN_PX);
    expect(cjk(x101.title, h.titlePx)).toBeLessThanOrEqual(inner);
  });
  it('短标题保持 24、徽记留在右上', () => {
    const h = layoutHead(ctx(), { title: '杀', cost: 1, suit: 'S' as never, rank: 7, lines: [] });
    expect(h).toEqual({ titlePx: DETAIL.titlePx, badgesBelow: false, subSplit: false, extra: 0 });
  });
  it('略超宽时缩字号（≥20）而不移动徽记', () => {
    // 4 字：24×4=96 > maxW；20×4=80 ≤ maxW
    const c = { title: '无中生有', cost: 1, suit: 'S' as never, rank: 7, lines: [] };
    const g = ctx();
    const maxW = DETAIL.w - DETAIL.pad * 2 - badgeWidth(g, c) - 8;
    const h = layoutHead(g, c);
    expect(h.badgesBelow).toBe(false);
    expect(h.titlePx).toBeGreaterThanOrEqual(TITLE_MIN_PX);
    expect(h.titlePx * 4).toBeLessThanOrEqual(maxW);
  });
  it('徽记下移时浮层高度计入额外行', () => {
    const a = layoutDetail(ctx(), { title: '方天戟·破阵长', cost: 2, suit: 'S' as never, rank: 7, lines: ['x'] });
    const b = layoutDetail(ctx(), { title: '杀', cost: 2, suit: 'S' as never, rank: 7, lines: ['x'] });
    expect(a.h).toBeGreaterThan(b.h);
  });
});

describe('#141 牌名按字数分档（· 不计）', () => {
  it('字数统计忽略「·」', () => {
    expect(nameChars('方天戟·破阵')).toBe(5);
  });
  it('小牌 20/16/13，大牌 26/21/17', () => {
    expect(['杀', '决斗', '无懈可', '无中生有', '方天戟·破阵'].map((n) => nameTierPx(n))).toEqual([20, 20, 20, 16, 13]);
    expect(['杀', '无中生有', '方天戟·破阵'].map((n) => nameTierPx(n, 'large'))).toEqual([26, 21, 17]);
  });
  it('≥5 字放得下用 13，保留「·」、不省略，左右各 3px', () => {
    const r = fitName('方天戟·破阵', 80, cjk);
    expect(r).toEqual({ text: '方天戟·破阵', px: 13, truncated: false });
    expect(cjk(r.text, r.px)).toBeLessThanOrEqual(80 - 6);
  });
  it('≥5 字放不下缩到 12，仍不省略', () => {
    expect(fitName('方天戟·破阵', 60, cjk)).toEqual({ text: '方天戟·破阵', px: 12, truncated: false });
    expect(fitName('借刀杀人之长名测试牌', 60, cjk)).toEqual({ text: '借刀杀人之长名测试牌', px: 12, truncated: false });
  });
  it('大牌 ≥5 字从 17 起', () => {
    expect(fitName('方天戟·破阵', 120, cjk, 'large').px).toBe(17);
  });
});
