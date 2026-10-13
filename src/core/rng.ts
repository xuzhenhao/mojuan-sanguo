export type Rng = () => number;
/** 可导出 / 恢复内部状态的随机流（存档用，#122）：状态是一个 uint32 */
export interface StatefulRng extends Rng {
  getState(): number;
  setState(state: number): void;
}
/** mulberry32：可复现随机数（PRD 技术章：保留随机种子）。getState/setState 读写内部状态，恢复后序列与不中断时一致 */
export function seeded(seed: number): StatefulRng {
  let a = seed >>> 0;
  const r = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as StatefulRng;
  r.getState = () => a;
  r.setState = (s: number) => {
    a = s >>> 0;
  };
  return r;
}
/** 从已导出的状态恢复随机流（mulberry32 的种子即初始状态） */
export const rngFromState = (state: number): StatefulRng => seeded(state);
export const rndInt = (rng: Rng, n: number) => Math.floor(rng() * n);
export function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
