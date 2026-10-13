/**
 * 微信小游戏存储（#204）：wx.get/set/removeStorageSync，同步 API 对齐 StorageAdapter。
 * - try/catch：读失败当无档；写失败上报且不删旧档（set 失败时旧值仍在）
 * - 单 key >512KB 报警（硬限 1MB，见 wechat-minigame-m2.md §3.4）
 * 存档键与格式沿用 core/run/save.ts / game/prefs（本模块不解析内容）。
 */
import type { StorageAdapter } from '../types';

/** 单 key 报警阈值（字节，UTF-16 码元近似；硬限 1MB） */
export const STORAGE_WARN_BYTES = 512 * 1024;

export interface WxStorageApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, data: unknown): void;
  removeStorageSync(key: string): void;
}

export interface StorageHooks {
  warn(msg: string, data?: unknown): void;
  reportError(e: { message: string; stack?: string }): void;
}

/** UTF-16 码元数 ≈ JS 字符串占用量的常用估计（与 TextEncoder 字节数接近中文场景） */
export const estimateBytes = (v: string): number => v.length * 2;

export function createWechatStorage(api: WxStorageApi, hooks: StorageHooks): StorageAdapter {
  return {
    get(key) {
      try {
        const v = api.getStorageSync(key);
        if (v === '' || v === undefined || v === null) return null;
        return typeof v === 'string' ? v : String(v);
      } catch (e) {
        hooks.warn(`[storage] get 失败：${key}`, e);
        return null;
      }
    },
    set(key, v) {
      const bytes = estimateBytes(v);
      if (bytes > STORAGE_WARN_BYTES) {
        hooks.warn(`[storage] 单 key 超过 ${STORAGE_WARN_BYTES} 字节（当前 ${bytes}）：${key}`);
      }
      try {
        api.setStorageSync(key, v);
      } catch (e) {
        // 写失败不调用 remove：旧档仍留在微信存储里
        hooks.reportError({
          message: `[storage] set 失败（旧档保留）：${key}`,
          stack: e instanceof Error ? e.stack : String(e),
        });
      }
    },
    remove(key) {
      try {
        api.removeStorageSync(key);
      } catch (e) {
        hooks.warn(`[storage] remove 失败：${key}`, e);
      }
    },
  };
}
