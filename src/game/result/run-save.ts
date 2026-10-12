/**
 * 局内存档的薄适配层：名字和键与 #78（feat/44-map）src/core/run/save.ts 约定一致
 * （RUN_SAVE_KEY = 'mojuan.run.v1'、hasRunSave / loadRunSave / writeRunSave / clearRunSave，地图状态合并在同一个键）。
 * #78 合并后，把本文件改为从 '../../core/run/save' 重新导出即可；结算页 / 续玩只依赖这里。
 */
import type { StorageAdapter } from '../../platform/types';

export const RUN_SAVE_KEY = 'mojuan.run.v1';

export function hasRunSave(storage: StorageAdapter): boolean {
  return loadRunSave(storage) !== null;
}
export function loadRunSave(storage: StorageAdapter): unknown {
  const t = storage.get(RUN_SAVE_KEY);
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}
export function writeRunSave(storage: StorageAdapter, s: unknown): void {
  storage.set(RUN_SAVE_KEY, JSON.stringify(s));
}
export function clearRunSave(storage: StorageAdapter): void {
  storage.remove(RUN_SAVE_KEY);
}
