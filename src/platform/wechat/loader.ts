/**
 * 微信分包加载（#204 空实现；M2 资源全进主包，见 wechat-minigame-m2.md §3.3）。
 */
import type { SubpackageLoader } from '../types';

export function createWechatLoader(): SubpackageLoader {
  return { async load() {} };
}
