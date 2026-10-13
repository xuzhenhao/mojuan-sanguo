import { describe, expect, it } from 'vitest';
import { fitName, fitNameCached } from '../src/game/scenes/battle/hpview';
import { cardDetail } from '../src/game/overlays/detail';
import { CARDS } from '../src/data/cards';

const cjk = (t: string, px: number) => [...t].length * px;

describe('#129 卡名适配（§8.8.3）', () => {
  it('放得下保持 20px', () => {
    expect(fitName('杀', 76, cjk)).toEqual({ text: '杀', px: 20, truncated: false });
  });
  it('逐 1px 缩小到刚好放得下', () => {
    const r = fitName('无中生有', 76, cjk); // 70/4=17.5 → 17
    expect(r).toEqual({ text: '无中生有', px: 17, truncated: false });
  });
  it('最小 11px 仍放不下则省略号，且宽度不超过卡内宽', () => {
    const r = fitName('借刀杀人之长名测试牌', 60, cjk);
    expect(r.px).toBe(11);
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith('…')).toBe(true);
    expect(cjk(r.text, 11)).toBeLessThanOrEqual(54);
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
