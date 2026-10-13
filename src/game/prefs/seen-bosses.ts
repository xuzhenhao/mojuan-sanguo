/**
 * 局外偏好：已看过登场演出的首领（#107，spec-107 §B3 / §D）。
 * 跨局保存在本机偏好键里（不进 RunState、不动存档版本）：首次 2s 完整演出，第 2 次起 0.8s。
 */
import type { StorageAdapter } from '../../platform/types';

export const PREFS_KEY = 'mojuan.prefs.v1';

interface PrefsShape {
  seenBosses?: string[];
}

function read(storage: StorageAdapter): PrefsShape {
  try {
    const v = JSON.parse(storage.get(PREFS_KEY) ?? 'null') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PrefsShape) : {};
  } catch {
    return {};
  }
}

export interface SeenBosses {
  has(id: string): boolean;
  add(id: string): void;
}

/** 已看过的首领 id 集合；写入时保留偏好键里的其他字段 */
export class SeenBossStore implements SeenBosses {
  constructor(private storage: StorageAdapter) {}
  list(): string[] {
    const s = read(this.storage).seenBosses;
    return Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string') : [];
  }
  has(id: string): boolean {
    return this.list().includes(id);
  }
  add(id: string): void {
    const cur = new Set(this.list());
    if (cur.has(id)) return;
    cur.add(id);
    try {
      this.storage.set(PREFS_KEY, JSON.stringify({ ...read(this.storage), seenBosses: [...cur] }));
    } catch {
      /* 存储不可用（隐私模式等）：本次不记，下次仍按首次播 */
    }
  }
}
