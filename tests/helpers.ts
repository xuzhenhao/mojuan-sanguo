import { Game, type BattleIO } from '../src/core/battle';
import { seeded } from '../src/core/rng';
import type { CardInst } from '../src/core/types';

export function mkIO(over: Partial<BattleIO> = {}): BattleIO & { ended: boolean[] } {
  const ended: boolean[] = [];
  return {
    ended,
    log: () => {},
    update: () => {},
    sleep: async () => {},
    showJudge: async () => {},
    respond: async () => null,
    epiphany: async (_c, o) => o[0] ?? null,
    onBattleEnd: (w) => ended.push(w),
    ...over,
  };
}
export function mkGame(over: Partial<BattleIO> = {}, seed = 1, heroes: { main?: string; sub?: string; preset?: string } = { preset: 'legacy_guanyu_zhaoyun' }) {
  const io = mkIO(over);
  const g = new Game(seeded(seed), io, { autoShan: false, ...heroes });
  return { g, io };
}
let u = 1000;
export const card = (id: string, suit: CardInst['suit'] = 'S', rank = 7, mods: string[] = []): CardInst => ({ uid: ++u, id, suit, rank, mods });

/** #202：可控假时钟（固定值，只在测试显式 advance/set 时前进）；BattleScene.deps.now 等统一注入 clock.now */
export interface FakeClock {
  now(): number;
  advance(ms: number): void;
  set(t: number): void;
}
export function fakeClock(start = 0): FakeClock {
  let t = start;
  return { now: () => t, advance: (ms) => void (t += ms), set: (v) => void (t = v) };
}
