import { describe, expect, it } from 'vitest';
import { createWechatFonts } from '../src/platform/wechat/fonts';

describe('#205 wechat 字体加载器', () => {
  it('成功：返回 true，并把逻辑字族映射到 wx 返回的 family', async () => {
    const paths: string[] = [];
    const f = createWechatFonts({ loadFont: (p) => (paths.push(p), 'LXGW WenKai') });
    expect(await f.load('Brush', 'assets/fonts/wenkai.ttf')).toBe(true);
    expect(paths).toEqual(['assets/fonts/wenkai.ttf']);
    expect(f.resolve('Brush')).toBe('LXGW WenKai');
  });

  it('返回 null / 抛异常：返回 false 不抛错，日志只打一次', async () => {
    const logs: string[] = [];
    const f = createWechatFonts({ loadFont: () => null }, (m) => logs.push(m));
    expect(await f.load('Brush', 'a.ttf')).toBe(false);
    expect(f.resolve('Brush')).toBeUndefined();
    const g = createWechatFonts(
      {
        loadFont: () => {
          throw new Error('boom');
        },
      },
      (m) => logs.push(m),
    );
    await expect(g.load('Brush', 'a.ttf')).resolves.toBe(false);
    await expect(g.load('Brush', 'a.ttf')).resolves.toBe(false);
    await f.load('Brush', 'b.ttf');
    expect(logs).toHaveLength(2);
    expect(logs[1]).toContain('boom');
  });
});
