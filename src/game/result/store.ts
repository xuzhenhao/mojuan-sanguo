/**
 * 存档读写（表现层适配，经 Platform.storage，不直接碰 localStorage / wx）。
 * - 局内存档 RunSave（PRD 21.4）的写入由地图/战斗负责；这里只做启动时的「有没有存档」摘要和结算后的删除。
 * - 局外存档 MetaProgress 由结算页写入。
 */
import type { StorageAdapter } from '../../platform/types';
import { EMPTY_META, META_KEY, applyOutcome, type MetaProgress, type RunOutcome } from './settlement';

import { RUN_SAVE_KEY, clearRunSave, loadRunSave } from './run-save';

export { RUN_SAVE_KEY };

/** 续玩弹窗显示用的摘要（flow.md §1：主副将、章节/层、体力、铜钱、牌组张数、天命） */
export interface ResumeSummary {
  heroMain: string;
  heroSub: string;
  chapter: number;
  layer: number;
  hp: number;
  maxHp: number;
  gold: number;
  deckSize: number;
  tianming: number;
  runSeed: number;
  /** 开局时间戳（用于结算用时；没有则为 null） */
  startedAt: number | null;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** 宽松解析 RunSave（只读需要的字段；字段缺失给默认值，结构不对返回 null） */
export function summarize(raw: unknown): ResumeSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.heroMain !== 'string' || typeof s.heroSub !== 'string') return null;
  const map = (s.mapState ?? {}) as { current?: unknown; nodes?: { id: unknown; layer: unknown }[] };
  const cur = Array.isArray(map.nodes) ? map.nodes.find((n) => n && n.id === map.current) : undefined;
  return {
    heroMain: s.heroMain,
    heroSub: s.heroSub,
    chapter: num(s.chapter, 1),
    layer: num(cur?.layer, num(s.layer, 0)),
    hp: num(s.hp),
    maxHp: num(s.maxHp, num(s.hp)),
    gold: num(s.gold),
    deckSize: Array.isArray(s.deck) ? s.deck.length : 0,
    tianming: num(s.tianming),
    runSeed: num(s.runSeed),
    startedAt: typeof s.startedAt === 'number' ? s.startedAt : null,
  };
}

/** 局内存档（经 run-save 适配层，与 #78 同键同名） */
export class RunSaveSlot {
  readonly key = RUN_SAVE_KEY;
  constructor(private storage: StorageAdapter) {}
  raw(): unknown {
    return loadRunSave(this.storage);
  }
  peek(): ResumeSummary | null {
    return summarize(this.raw());
  }
  remove() {
    clearRunSave(this.storage);
  }
}

export class MetaStore {
  constructor(
    private storage: StorageAdapter,
    readonly key = META_KEY,
  ) {}
  load(): MetaProgress {
    try {
      const m = JSON.parse(this.storage.get(this.key) ?? 'null') as MetaProgress | null;
      return m && m.schema === 1 ? { ...EMPTY_META, ...m } : { ...EMPTY_META };
    } catch {
      return { ...EMPTY_META };
    }
  }
  /** 结算入账（幂等） */
  settle(o: RunOutcome): MetaProgress {
    const next = applyOutcome(this.load(), o);
    this.storage.set(this.key, JSON.stringify(next));
    return next;
  }
}
