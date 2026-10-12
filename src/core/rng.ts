export type Rng = () => number;
/** mulberry32：可复现随机数（PRD 技术章：保留随机种子） */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rndInt = (rng: Rng, n: number) => Math.floor(rng() * n);
export function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rndInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
