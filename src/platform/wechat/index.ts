/**
 * 微信小游戏平台（本期只保留接口，engine-design §7：先做 H5）。
 * 接入时在此实现 Platform：wx.createCanvas（首个为上屏画布）、wx.onTouchStart…、
 * wx.getWindowInfo().safeArea、wx.getMenuButtonBoundingClientRect()（胶囊）、
 * wx.setStorageSync、wx.createRewardedVideoAd、wx.loadSubpackage、wx.onError。
 */
import type { Platform } from '../types';

export function createWechatPlatform(): Platform {
  throw new Error('微信小游戏平台尚未实现（P0 仅保留接口）');
}
