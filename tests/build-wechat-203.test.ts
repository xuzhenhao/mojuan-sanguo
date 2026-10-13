import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWechat,
  DEFAULT_APPID,
  findBrowserGlobals,
  gameJson,
  projectConfig,
  resolveAppId,
  wechatFontPackageUrls,
  wechatFontSource,
} from '../scripts/build-wechat';

const ROOT = resolve(import.meta.dirname, '..');

describe('#203 build-wechat', () => {
  it('appid 默认 wx3dd635e3cc359d30，WX_APPID 可覆盖并校验格式', () => {
    expect(DEFAULT_APPID).toBe('wx3dd635e3cc359d30');
    expect(resolveAppId({})).toBe(DEFAULT_APPID);
    expect(resolveAppId({ WX_APPID: ' ' })).toBe(DEFAULT_APPID);
    expect(resolveAppId({ WX_APPID: 'touristappid' })).toBe('touristappid');
    expect(resolveAppId({ WX_APPID: 'wx0123456789abcdef' })).toBe('wx0123456789abcdef');
    expect(() => resolveAppId({ WX_APPID: 'abc' })).toThrow(/WX_APPID/);
  });

  it('game.json 竖屏、无分包；project.config 为小游戏', () => {
    expect(gameJson()).toMatchObject({ deviceOrientation: 'portrait' });
    expect(gameJson()).not.toHaveProperty('subpackages');
    const p = projectConfig('wx3dd635e3cc359d30', 'x');
    expect(p).toMatchObject({ appid: 'wx3dd635e3cc359d30', compileType: 'game', projectname: 'x' });
  });

  it('守卫命中 document./window.，不误报 wx/属性名', () => {
    expect(findBrowserGlobals('window.foo;document.body')).toEqual(['document.', 'window.']);
    expect(findBrowserGlobals('wx.createCanvas();a.mywindow;x.windowWidth')).toEqual([]);
  });

  it('#205 字体路径从 rules.fonts.wechat 读，不写死', () => {
    expect(wechatFontPackageUrls(ROOT)).toEqual(['assets/fonts/wenkai.ttf']);
    expect(wechatFontSource('assets/fonts/wenkai.ttf')).toBe('wechat-assets/fonts/wenkai.ttf');
    expect(() => wechatFontSource('public/x.ttf')).toThrow(/assets\/fonts/);
  });

  it('后处理：生成 json、按配置拷 ttf；无 game.js 或含 window. 时失败', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wx203-'));
    expect(() => buildWechat(dir, ROOT, {})).toThrow(/game\.js/);
    writeFileSync(join(dir, 'game.js'), 'window.x=1');
    expect(() => buildWechat(dir, ROOT, {})).toThrow(/浏览器全局/);
    writeFileSync(join(dir, 'game.js'), 'wx.createCanvas()');
    const files = buildWechat(dir, ROOT, { WX_APPID: 'touristappid' });
    expect(files.length).toBe(4);
    expect(JSON.parse(readFileSync(join(dir, 'project.config.json'), 'utf8')).appid).toBe('touristappid');
    expect(existsSync(join(dir, 'assets/fonts/wenkai.ttf'))).toBe(true);
    expect(existsSync(join(dir, 'game.json'))).toBe(true);
  });
});
