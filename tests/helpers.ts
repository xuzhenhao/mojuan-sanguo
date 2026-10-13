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

/** #201：BattleScene.deps.now 已改必填，单测统一注入此时钟（行为同改动前的 performance.now 回退） */
export const testNow = (): number => performance.now();
