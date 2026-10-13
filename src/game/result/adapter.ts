/**
 * 局状态 → RunOutcome 的表现层适配（不改 src/core）。
 * core 目前没有 RunSave / stats 记账（PRD 21.4），由地图/奖励（P3/P4）的 run 模块补齐前：
 * - 战斗结束：从 Game 读取主副将、牌组（含词条）、灵光次数、回合数、已打场次；stats 其余项为 0。
 * - 放弃本局：从存档摘要读取；存档里有 stats 时直接使用。
 */
import type { Game } from '../../core/battle';
import { CARDS } from '../../data/cards';
import { HEROES } from '../../data/heroes';
import { CONFIG } from '../../data/config';
import { emptyStats, mergeStats, parseStats } from '../run/stats';
import { SETTLEMENT_CONFIG, type ResultCard, type RunOutcome, type RunStats } from './settlement';
import type { ResumeSummary } from './store';

/** 复活「已使用」只按 reviveLeft 实际值判断（PRD 4.4.1：reviveLeft < 每局次数），不能用胜负推断（#106） */
export const reviveUsedOf = (reviveLeft: unknown) => typeof reviveLeft === 'number' && reviveLeft < CONFIG.rules.revive.count;
export const heroName = (id: string) => HEROES[id]?.name ?? id;
export const CHAPTER_NAME: Record<number, string> = { 1: '黄巾', 2: '讨董', 3: '赤壁' };

/** 放弃本局：按失败结算（PRD 5.13） */
export function outcomeFromSave(s: ResumeSummary, raw: unknown, now: number): RunOutcome {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    win: false,
    abandoned: true,
    runSeed: s.runSeed,
    heroMain: s.heroMain,
    heroSub: s.heroSub,
    chapter: s.chapter,
    chapterName: CHAPTER_NAME[s.chapter],
    layer: s.layer,
    durationMs: s.startedAt ? Math.max(0, now - s.startedAt) : 0,
    tianming: s.tianming,
    chaptersCleared: 0,
    reviveUsed: reviveUsedOf(r.reviveLeft),
    stats: parseStats(r.stats),
    deck: Array.isArray(r.deck) ? r.deck.map(cardOf) : [],
    relics: Array.isArray(r.relics) ? r.relics.map(String) : [],
    gold: s.gold,
  };
}

function cardOf(c: unknown): ResultCard {
  const x = (c ?? {}) as { id?: string; mods?: string[] };
  const id = String(x.id ?? '?');
  return { id, name: CARDS[id]?.name ?? id, affixes: Array.isArray(x.mods) ? x.mods.map(String) : [] };
}

/** 战斗结束（整局胜/负）：从 core Game 只读 */
export function outcomeFromGame(
  g: Pick<Game, 'p' | 'main' | 'sub' | 'deckMaster' | 'battleIdx' | 'epiCount' | 'turn' | 'isLast' | 'affixName'> & {
    reviveLeft?: number;
    en?: { hp: number; name?: string }[];
  },
  o: { runSeed: number; startedAt: number; now: number; tianming?: number; gold?: number; stats?: Partial<RunStats> },
): RunOutcome {
  const win = g.p.hp > 0 && g.isLast;
  const won = g.battleIdx + (g.p.hp > 0 ? 1 : 0);
  const stats: RunStats = o.stats
    ? mergeStats(emptyStats(), o.stats)
    : { ...emptyStats(), battlesWon: won, bossKilled: win ? 1 : 0, epiphanies: g.epiCount, turns: g.turn };
  const killer = g.p.hp <= 0 ? g.en?.find((e) => e.hp > 0)?.name : undefined;
  return {
    win,
    abandoned: false,
    runSeed: o.runSeed,
    heroMain: g.main.id,
    heroSub: g.sub.id,
    chapter: 1,
    chapterName: CHAPTER_NAME[1],
    layer: win ? 9 : g.battleIdx + 1,
    durationMs: Math.max(0, o.now - o.startedAt),
    tianming: o.tianming ?? 0,
    chaptersCleared: win ? SETTLEMENT_CONFIG.lastChapter : 0,
    reviveUsed: reviveUsedOf(g.reviveLeft),
    stats,
    deck: g.deckMaster.map((c) => ({ id: c.id, name: CARDS[c.id]?.name ?? c.id, affixes: c.mods.map((m) => g.affixName(m)) })),
    relics: [],
    gold: o.gold ?? 0,
    killer,
  };
}

/** 截图 / 测试用示例（?page=result&demo=win|defeat） */
export function demoOutcome(win: boolean, reviveLeft: number = CONFIG.rules.revive.count): RunOutcome {
  return {
    win,
    abandoned: false,
    runSeed: 20261012,
    heroMain: 'H03',
    heroSub: 'H04',
    chapter: 1,
    chapterName: '黄巾',
    layer: win ? 9 : 6,
    durationMs: win ? 31 * 60_000 + 12_000 : 17 * 60_000 + 40_000,
    tianming: win ? 1 : 0,
    chaptersCleared: win ? 1 : 0,
    reviveUsed: reviveUsedOf(reviveLeft),
    stats: win
      ? { battlesWon: 7, elitesKilled: 2, bossKilled: 1, turns: 41, dmgDealt: 214, dmgTaken: 38, maxTurnLoss: 6, epiphanies: 3 }
      : { battlesWon: 4, elitesKilled: 1, bossKilled: 0, turns: 26, dmgDealt: 103, dmgTaken: 41, maxTurnLoss: 7, epiphanies: 1 },
    deck: [
      { id: 'sha', name: '杀', affixes: win ? ['龙胆'] : [] },
      { id: 'shan', name: '闪', affixes: win ? ['疾'] : [] },
      { id: 'tao', name: '桃', affixes: ['回春'] },
      ...Array.from({ length: 12 }, (_, i) => ({ id: i % 2 ? 'shan' : 'sha', name: i % 2 ? '闪' : '杀', affixes: [] })),
    ],
    relics: ['青囊书'],
    gold: win ? 86 : 42,
    killer: win ? undefined : '黄巾力士',
  };
}
