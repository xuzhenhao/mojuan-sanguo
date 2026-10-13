/**
 * 局外偏好的唯一存储键与读取（#136：合并 #107 seen-bosses 与 #108 settings 各自声明的键）。
 * 不进 RunState、不动存档版本；各模块写入时须保留其他字段。
 */
import type { StorageAdapter } from '../../platform/types';

export const PREFS_KEY = 'mojuan.prefs.v1';

/** 读整份偏好对象；缺失 / 坏 JSON / 非对象一律视为空 */
export function readPrefs(storage: StorageAdapter): Record<string, unknown> {
  try {
    const v = JSON.parse(storage.get(PREFS_KEY) ?? 'null') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
