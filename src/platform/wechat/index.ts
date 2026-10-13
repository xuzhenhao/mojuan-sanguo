/**
 * 微信小游戏平台（本期只保留接口，engine-design §7：先做 H5）。
 * 接入时在此实现 Platform：wx.createCanvas（首个为上屏画布）、wx.onTouchStart…、
 * wx.getWindowInfo().safeArea、wx.getMenuButtonBoundingClientRect()（胶囊）、
 * wx.setStorageSync、wx.createRewardedVideoAd、wx.loadSubpackage、wx.onError。
 * 字体（#205）：`fonts: createWechatFonts(wx)`，经 Platform.fonts.load → wx.loadFont(包内路径)。
 */
import type { Platform } from '../types';

export { createWechatFonts } from './fonts';
export type { WxFontApi, WechatFonts } from './fonts';

export function createWechatPlatform(): Platform {
  throw new Error('微信小游戏平台尚未实现（P0 仅保留接口；字体加载器见 createWechatFonts，#204 挂到 Platform.fonts）');
}
