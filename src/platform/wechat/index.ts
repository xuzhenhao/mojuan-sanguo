/**
 * 微信小游戏平台（#204）：实现 Platform（画布/触摸/生命周期/systemInfo/存储/launchQuery）。
 * 不引入 weapp-adapter；不采集 openid 或任何用户信息。
 * 字体加载见 createWechatFonts（#205）；埋点 transport 见 telemetry.ts（#208，RealtimeLogManager）。
 */
export { createWechatPlatform, paintWechatBackdrop } from './platform';
export { createWechatFonts } from './fonts';
export type { WxFontApi, WechatFonts } from './fonts';
export { createWechatStorage, estimateBytes, STORAGE_WARN_BYTES } from './storage';
export type { WxStorageApi, StorageHooks } from './storage';
export { createWechatTelemetry, stripTelemetryPii, formatTelemetryLog, TELEMETRY_PII_KEYS } from './telemetry';
export { createWechatAudio } from './audio';
export { createWechatLoader } from './loader';
export { startWechat } from './start';
export type { WxStartApi } from './start';
export type { WxApi, WxCanvas, WxTouch, WxTouchEvent, WxWindowInfo } from './wx-api';
