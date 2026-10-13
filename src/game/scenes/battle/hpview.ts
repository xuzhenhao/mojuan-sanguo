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
/** 手牌小牌显示名：有 shortName 用简称，否则全名（详情浮层始终全名） */
export const handName = (d: { name: string; shortName?: string }) => d.shortName || d.name;
export const NAME_SCALE_MIN = 0.85;
export type NameFit = { text: string; px: number; scaleX: number; overflow: boolean };
/**
 * #141 卡名字号：按字数分档（小牌 20/16/13，大牌 26/21/17），左右各留 3px。
 * 任何字数都不低于 12px、不省略（字距 0、保留「·」、不换行）：
 * 12px 仍放不下 → scaleX 横向压缩，最小 0.85；再放不下就溢出（dev 下 console.warn）。
 */
export function fitName(name: string, cardW: number, measure: (t: string, px: number) => number, size: 'small' | 'large' = 'small'): NameFit {
  const maxW = cardW - NAME_SIDE * 2;
  for (let px = nameTierPx(name, size); px >= NAME_LONG_MIN_PX; px--) if (measure(name, px) <= maxW) return { text: name, px, scaleX: 1, overflow: false };
  const w = measure(name, NAME_LONG_MIN_PX);
  const k = maxW / w;
  if (k >= NAME_SCALE_MIN) return { text: name, px: NAME_LONG_MIN_PX, scaleX: k, overflow: false };
  if (import.meta.env.DEV) console.warn(`[#141] 牌名「${name}」在 ${cardW}px 卡上 12px×${NAME_SCALE_MIN} 仍放不下，已溢出`);
  return { text: name, px: NAME_LONG_MIN_PX, scaleX: NAME_SCALE_MIN, overflow: true };
}
const nameCache = new Map<string, NameFit>();
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
/** #141 定稿：朱砂 #b8322a，2px，只描主将卡外轮廓 */
export const DYING_EDGE_COLOR = '#b8322a';
export const DYING_EDGE_W = 2;
export const isDying = (hp: number) => hp <= 1;
export function dyingAlpha(nowMs: number): number {
  const mid = (DYING_ALPHA_MIN + DYING_ALPHA_MAX) / 2;
  const amp = (DYING_ALPHA_MAX - DYING_ALPHA_MIN) / 2;
  return mid + amp * Math.sin((nowMs / DYING_PERIOD_MS) * Math.PI * 2);
}

/** #141：体力回到 ≥2 时红边 200ms 淡出到 0（不瞬间消失） */
export const DYING_FADE_MS = 200;
export type DyingEdgeState = { a: number; fadeAt: number | null; fromA: number };
export const newDyingEdge = (): DyingEdgeState => ({ a: 0, fadeAt: null, fromA: 0 });
/** prefers-reduced-motion：不脉动，常亮 .75 */
export const DYING_STATIC_ALPHA = 0.75;
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function dyingEdgeAlpha(st: DyingEdgeState, hp: number, now: number, reduced = false): number {
  if (isDying(hp)) {
    st.a = reduced ? DYING_STATIC_ALPHA : dyingAlpha(now);
    st.fadeAt = null;
    return st.a;
  }
  if (st.a <= 0) return 0;
  if (st.fadeAt == null) {
    st.fadeAt = now;
    st.fromA = st.a;
  }
  const k = 1 - (now - st.fadeAt) / DYING_FADE_MS;
  if (k <= 0) {
    st.a = 0;
    st.fadeAt = null;
    return 0;
  }
  return st.fromA * k;
}
/** 正在淡出（需继续重绘） */
export const dyingFading = (st: DyingEdgeState) => st.a > 0;
