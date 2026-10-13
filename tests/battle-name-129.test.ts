import { describe, expect, it } from 'vitest';
import { fitName, fitNameCached, refitAfterBrush } from '../src/game/scenes/battle/hpview';
import { cardDetail } from '../src/game/overlays/detail';
import { CARDS } from '../src/data/cards';

const cjk = (t: string, px: number) => [...t].length * px;

describe('#129 卡名适配（§8.8.3）', () => {
  it('放得下保持 20px', () => {
    expect(fitName('杀', 76, cjk)).toEqual({ text: '杀', px: 20, truncated: false });
  });
  it('逐 1px 缩小到刚好放得下', () => {
    const r = fitName('无中生有', 60, cjk); // 4 字档 16；54/4=13.5 → 13
    expect(r).toEqual({ text: '无中生有', px: 13, truncated: false });
  });
  it('1–4 字最小 11px 仍放不下则省略号，且宽度不超过卡内宽', () => {
    const r = fitName('借刀杀人', 40, cjk);
    expect(r.px).toBe(11);
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith('…')).toBe(true);
    expect(cjk(r.text, 11)).toBeLessThanOrEqual(34);
  });
  it('缓存：同名同宽只量一次', () => {
    let n = 0;
    const m = (t: string, px: number) => (n++, cjk(t, px));
    fitNameCached('南蛮入侵', 71, m);
    const k = n;
    fitNameCached('南蛮入侵', 71, m);
    expect(n).toBe(k);
  });
  it('长按详情标题是全名', () => {
    const [id, long] = Object.entries(CARDS).sort((a, b) => b[1].name.length - a[1].name.length)[0];
    const d = cardDetail({ uid: 1, id, suit: 'spade', rank: 1, mods: [] } as never);
    expect(d.title).toBe(long.name);
  });
});

describe('#129 霞鹜文楷加载后重算牌名', () => {
  it('fonts.load 完成后清缓存并重绘，下次按新宽度量', async () => {
    let wide = true;
    const m = (t: string, px: number) => [...t].length * px * (wide ? 1.5 : 1);
    expect(fitNameCached('无中生有', 76, m).px).toBe(11); // 回退字体量得偏宽（16×4×1.5 > 70）
    wide = false;
    expect(fitNameCached('无中生有', 76, m).px).toBe(11); // 仍是缓存
    let redraws = 0;
    let loaded = '';
    await refitAfterBrush({ load: (f: string) => ((loaded = f), Promise.resolve([])) } as never, () => redraws++);
    expect(loaded).toContain('Brush');
    expect(redraws).toBe(1);
    expect(fitNameCached('无中生有', 76, m).px).toBe(16);
  });
  it('加载失败不重绘', async () => {
    let redraws = 0;
    await refitAfterBrush({ load: () => Promise.reject(new Error('x')) } as never, () => redraws++);
    expect(redraws).toBe(0);
  });
});
