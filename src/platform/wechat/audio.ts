/**
 * 微信音频（#204 空实现；M2 暂无音频资源，见 wechat-minigame-m2.md §5）。
 * 后续用 InnerAudioContext 池接 BGM/SFX。
 */
import type { AudioAdapter } from '../types';

export function createWechatAudio(): AudioAdapter {
  return {
    playBgm() {},
    playSfx() {},
    stopBgm() {},
    setMuted() {},
  };
}
