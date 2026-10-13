/**
 * 局外偏好：暂停/设置浮层的设置项（#108，v3/settings.html）。
 * 跨局保存在本机偏好键 mojuan.prefs.v1 的 `settings` 字段（不进 RunState、不动存档版本）；
 * 写入时保留偏好键里的其他字段（如 #107 的 seenBosses）。默认值与可选项只来自 rules.yaml `settings:`。
 */
import { CONFIG } from '../../data/config';
import type { StorageAdapter } from '../../platform/types';

export const PREFS_KEY = 'mojuan.prefs.v1';

export type SettingsCfg = (typeof CONFIG)['rules']['settings'];
export interface Settings {
  toggles: Record<string, boolean>;
  choices: Record<string, string>;
}

function readPrefs(storage: StorageAdapter): Record<string, unknown> {
  try {
    const v = JSON.parse(storage.get(PREFS_KEY) ?? 'null') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function defaultSettings(cfg: SettingsCfg = CONFIG.rules.settings): Settings {
  const toggles: Record<string, boolean> = {};
  const choices: Record<string, string> = {};
  for (const [k, t] of Object.entries(cfg.toggles)) toggles[k] = t.default;
  for (const [k, c] of Object.entries(cfg.choices)) choices[k] = c.default;
  return { toggles, choices };
}

/** 宽松合并：只认配置里有的键、类型对、选项合法的值，其余回默认 */
export function sanitizeSettings(raw: unknown, cfg: SettingsCfg = CONFIG.rules.settings): Settings {
  const s = defaultSettings(cfg);
  const r = (raw && typeof raw === 'object' ? raw : {}) as { toggles?: Record<string, unknown>; choices?: Record<string, unknown> };
  for (const k of Object.keys(s.toggles)) if (typeof r.toggles?.[k] === 'boolean') s.toggles[k] = r.toggles[k] as boolean;
  for (const k of Object.keys(s.choices)) {
    const v = r.choices?.[k];
    if (typeof v === 'string' && cfg.choices[k].options.includes(v)) s.choices[k] = v;
  }
  return s;
}

export class SettingsStore {
  constructor(
    private storage: StorageAdapter,
    private cfg: SettingsCfg = CONFIG.rules.settings,
  ) {}
  load(): Settings {
    return sanitizeSettings(readPrefs(this.storage).settings, this.cfg);
  }
  save(s: Settings): void {
    try {
      this.storage.set(PREFS_KEY, JSON.stringify({ ...readPrefs(this.storage), settings: sanitizeSettings(s, this.cfg) }));
    } catch {
      /* 存储不可用（隐私模式等）：本次设置只在内存里生效 */
    }
  }
}
