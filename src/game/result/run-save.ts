/**
 * 局内存档的薄适配层（结算页 / 续玩只依赖这里）。
 * #122 PR2：局内存档改为 RunState（新键 mojuan.runstate.v1）；旧键 mojuan.run.v1 只读（迁移前的续玩摘要），不再写入。
 * 删档时新旧键一起删。
 */
import type { StorageAdapter } from '../../platform/types';
import { LEGACY_RUN_SAVE_KEY, RUN_STATE_KEY } from '../run/state';

/** 局内存档键（新） */
export const RUN_SAVE_KEY = RUN_STATE_KEY;
export { LEGACY_RUN_SAVE_KEY };

export function hasRunSave(storage: StorageAdapter): boolean {
  return loadRunSave(storage) !== null;
}
const parse = (t: string | null): unknown => {
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
};
/** 读档（新键优先，旧键兜底，只读不迁移；迁移由 RunSession.load 做） */
export function loadRunSave(storage: StorageAdapter): unknown {
  return parse(storage.get(RUN_STATE_KEY)) ?? parse(storage.get(LEGACY_RUN_SAVE_KEY));
}
export function writeRunSave(storage: StorageAdapter, s: unknown): void {
  storage.set(RUN_STATE_KEY, JSON.stringify(s));
}
export function clearRunSave(storage: StorageAdapter): void {
  storage.remove(RUN_STATE_KEY);
  storage.remove(LEGACY_RUN_SAVE_KEY);
}
