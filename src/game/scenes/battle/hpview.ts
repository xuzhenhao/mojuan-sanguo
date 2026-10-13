import { clearTextWidthCache } from '../../overlays/theme';
/**
 * 战斗页体力显示（#129，render-spec §8.8.2）——纯布局函数，场景只负责照着画。
 * - 武将：上限 ≤6 用勾玉（17⌀，间距 clamp((innerW − n×17)/(n−1), 2, 4)，整排居中，不出卡框）；
 *   上限 >6 用紧凑式：1 颗勾玉 + 数字（满血「×N」，掉血「cur/max」），胶囊底，底部居中 y = 卡底 − 6。
 * - 敌人：一律数字。普通 / 精英：底部小牌「● cur/max」；Boss 或体力 >10：血条（h=10）+ 居中数字。
 */
export const BEAD_D = 17;
export const HERO_DOTS_MAX = 6;

export type HeroHpView =
  { mode: 'dots'; xs: number[]; r: number; filled: number } | { mode: 'compact'; full: boolean; cur: number; max: number; empty: boolean };

/** cx：卡中心；innerW：卡内窗宽 − 12（主将 128 − 12 = 116） */
export function heroHpView(hp: number, max: number, cx: number, innerW: number): HeroHpView {
  const cur = Math.max(0, hp);
  if (max > HERO_DOTS_MAX) return { mode: 'compact', full: cur >= max, cur, max, empty: cur <= 0 };
  const n = Math.max(1, max);
  const gap = n > 1 ? Math.max(2, Math.min(4, (innerW - n * BEAD_D) / (n - 1))) : 0;
  const total = n * BEAD_D + (n - 1) * gap;
  const x0 = cx - total / 2 + BEAD_D / 2;
  return { mode: 'dots', xs: Array.from({ length: n }, (_, i) => x0 + i * (BEAD_D + gap)), r: BEAD_D / 2, filled: Math.min(cur, n) };
}

export type EnemyHpView = { mode: 'plate'; text: string } | { mode: 'bar'; text: string; ratio: number };
export function enemyHpView(hp: number, max: number, boss: boolean): EnemyHpView {
  const cur = Math.max(0, hp);
  const text = `${cur}/${max}`;
  if (boss || max > 10) return { mode: 'bar', text, ratio: max > 0 ? Math.min(1, cur / max) : 0 };
  return { mode: 'plate', text };
}

// ───────── 牌名自适应（§8.8.3） ─────────
export const NAME_MAX_PX = 20;
export const NAME_MIN_PX = 11;
export const NAME_SIDE = 3;
/** 按字数分档（「·」不计字数）：1–3 / 4 / ≥5 */
export const NAME_TIERS = { small: [20, 16, 13], large: [26, 21, 17] } as const;
export const NAME_LONG_MIN_PX = 12;
export function nameChars(name: string) {
  return [...name].filter((ch) => ch !== '·' && ch !== '・').length;
}
export function nameTierPx(name: string, size: 'small' | 'large' = 'small') {
  const n = nameChars(name);
  const t = NAME_TIERS[size];
  return n <= 3 ? t[0] : n === 4 ? t[1] : t[2];
}
/**
 * #141 卡名字号：按字数分档（小牌 20/16/13，大牌 26/21/17），左右各留 3px。
 * ≥5 字：字距 0、保留「·」、不换行不省略，放不下最小缩到 12。
 * 1–4 字放不下时逐 1px 缩到 11，仍放不下才省略（兜底）。
 */
export function fitName(
  name: string,
  cardW: number,
  measure: (t: string, px: number) => number,
  size: 'small' | 'large' = 'small',
): { text: string; px: number; truncated: boolean } {
  const maxW = cardW - NAME_SIDE * 2;
  const start = nameTierPx(name, size);
  const long = nameChars(name) >= 5;
  const min = long ? NAME_LONG_MIN_PX : NAME_MIN_PX;
  for (let px = start; px >= min; px--) if (measure(name, px) <= maxW) return { text: name, px, truncated: false };
  if (long) return { text: name, px: NAME_LONG_MIN_PX, truncated: false };
  const chars = [...name];
  for (let n = chars.length - 1; n > 0; n--) {
    const t = chars.slice(0, n).join('') + '…';
    if (measure(t, NAME_MIN_PX) <= maxW) return { text: t, px: NAME_MIN_PX, truncated: true };
  }
  return { text: '…', px: NAME_MIN_PX, truncated: true };
}
const nameCache = new Map<string, { text: string; px: number; truncated: boolean }>();
/** 同名牌只算一次（按 名字 + 卡宽 缓存） */
export function fitNameCached(name: string, cardW: number, measure: (t: string, px: number) => number, size: 'small' | 'large' = 'small') {
  const k = `${size}|${cardW}|${name}`;
  let v = nameCache.get(k);
  if (!v) nameCache.set(k, (v = fitName(name, cardW, measure, size)));
  return v;
}
export function clearNameFitCache() {
  nameCache.clear();
}
/** 等 document.fonts 里的霞鹜文楷（族名 Brush）可用后：清牌名字号缓存与量宽缓存，再重绘（加载前量的是回退字体宽度） */
export function refitAfterBrush(fonts: Pick<FontFaceSet, 'load'>, redraw: () => void): Promise<void> {
  return fonts.load('20px "Brush"').then(
    () => {
      clearNameFitCache();
      clearTextWidthCache();
      redraw();
    },
    () => undefined,
  );
}

// ───────── 主将 dying（render-spec §3.3：体力 ≤1 边框朱砂脉冲；spec 未给周期/alpha，取 1.2s、.35–.9 正弦） ─────────
export const DYING_PERIOD_MS = 1200;
export const DYING_ALPHA_MIN = 0.35;
export const DYING_ALPHA_MAX = 0.9;
export const isDying = (hp: number) => hp <= 1;
export function dyingAlpha(nowMs: number): number {
  const mid = (DYING_ALPHA_MIN + DYING_ALPHA_MAX) / 2;
  const amp = (DYING_ALPHA_MAX - DYING_ALPHA_MIN) / 2;
  return mid + amp * Math.sin((nowMs / DYING_PERIOD_MS) * Math.PI * 2);
}
