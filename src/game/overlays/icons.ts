/**
 * 印章图标（render-spec §14）：图标一律按 PRD icon id 取，不用系统字符 / emoji。
 * 正式资源打进 `ui_sharp` 图集（2x，每个 48×48）；资源就绪前用 `STAMP_ICONS`（矢量路径绘制的印章占位），
 * 接口不变：资源到位后 `setIconSet(atlasIconSet)` 替换即可。
 */
import type { Ctx2DLike, Rect } from '../../engine/types';
import type { Suit } from '../../core/types';
import { C, ext } from './theme';

/** 本组件用到的 PRD 图标 id（§14）+ UI 专用 id */
export type IconId = 'sha' | 'sharp' | 'volley' | 'defend' | 'flash_mark' | 'curse' | 'armor' | 'ui_hp' | 'ui_hourglass' | `suit_${Suit}`;

export interface IconSet {
  has(id: string): boolean;
  /** 在 r 内绘制图标（正方形） */
  draw(c: Ctx2DLike, id: IconId, r: Rect, tint?: string): void;
}

/** 敌人意图动作 → 图标 id */
export const ACT_ICON: Record<string, IconId> = { 杀: 'sha', '杀+': 'sharp', 万箭: 'volley', 闪: 'flash_mark', 咒: 'curse' };
export const ACT_LABEL: Record<string, string> = { 杀: '杀', '杀+': '杀·锋锐', 万箭: '万箭', 闪: '备闪', 咒: '咒' };

const STAMP_BG: Partial<Record<IconId, string>> = {
  sha: C.cinnabar,
  sharp: C.cinnabar,
  volley: C.cinnabar,
  defend: '#2f6b6b',
  flash_mark: '#2c4a5c',
  curse: '#4a2d5c',
  armor: '#2f6b6b',
};

type Path = (x: Ctx2DExtLike, s: number) => void;
type Ctx2DExtLike = ReturnType<typeof ext>;

// 以 0–1 单位坐标描述的白色印文（缩放到 s）
const sword: Path = (g, s) => {
  g.moveTo!(0.25 * s, 0.75 * s);
  g.lineTo!(0.72 * s, 0.28 * s);
  g.moveTo!(0.33 * s, 0.55 * s);
  g.lineTo!(0.45 * s, 0.67 * s);
};
const plus: Path = (g, s) => {
  g.moveTo!(0.68 * s, 0.62 * s);
  g.lineTo!(0.86 * s, 0.62 * s);
  g.moveTo!(0.77 * s, 0.53 * s);
  g.lineTo!(0.77 * s, 0.71 * s);
};
const arrows: Path = (g, s) => {
  for (const d of [0, 0.18]) {
    g.moveTo!((0.22 + d) * s, 0.78 * s);
    g.lineTo!((0.62 + d) * s, 0.3 * s);
    g.moveTo!((0.62 + d) * s, 0.3 * s);
    g.lineTo!((0.5 + d) * s, 0.32 * s);
  }
};
const shield: Path = (g, s) => {
  g.moveTo!(0.5 * s, 0.22 * s);
  g.lineTo!(0.76 * s, 0.32 * s);
  g.lineTo!(0.72 * s, 0.6 * s);
  g.lineTo!(0.5 * s, 0.8 * s);
  g.lineTo!(0.28 * s, 0.6 * s);
  g.lineTo!(0.24 * s, 0.32 * s);
  g.lineTo!(0.5 * s, 0.22 * s);
};
const dodge: Path = (g, s) => {
  g.moveTo!(0.26 * s, 0.7 * s);
  g.quadraticCurveTo!(0.5 * s, 0.2 * s, 0.76 * s, 0.32 * s);
  g.moveTo!(0.3 * s, 0.5 * s);
  g.quadraticCurveTo!(0.5 * s, 0.35 * s, 0.7 * s, 0.5 * s);
};
const down: Path = (g, s) => {
  g.moveTo!(0.5 * s, 0.24 * s);
  g.lineTo!(0.5 * s, 0.74 * s);
  g.moveTo!(0.3 * s, 0.55 * s);
  g.lineTo!(0.5 * s, 0.76 * s);
  g.lineTo!(0.7 * s, 0.55 * s);
};
const GLYPH: Partial<Record<IconId, Path[]>> = {
  sha: [sword],
  sharp: [sword, plus],
  volley: [arrows],
  defend: [shield],
  armor: [shield],
  flash_mark: [dodge],
  curse: [down],
};

/** 花色 / 体力：实心矢量形（不用 ♠♥♣♦❤ 字符） */
function suitShape(g: Ctx2DExtLike, id: IconId, r: Rect) {
  const { x, y, w } = r;
  const p = (u: number, v: number) => [x + u * w, y + v * w] as const;
  g.beginPath!();
  if (id === 'suit_H' || id === 'ui_hp') {
    g.moveTo!(...p(0.5, 0.86));
    g.quadraticCurveTo!(...p(0.04, 0.5), ...p(0.2, 0.26));
    g.quadraticCurveTo!(...p(0.38, 0.08), ...p(0.5, 0.3));
    g.quadraticCurveTo!(...p(0.62, 0.08), ...p(0.8, 0.26));
    g.quadraticCurveTo!(...p(0.96, 0.5), ...p(0.5, 0.86));
  } else if (id === 'suit_D') {
    g.moveTo!(...p(0.5, 0.08));
    g.lineTo!(...p(0.84, 0.5));
    g.lineTo!(...p(0.5, 0.92));
    g.lineTo!(...p(0.16, 0.5));
  } else if (id === 'suit_S') {
    g.moveTo!(...p(0.5, 0.08));
    g.quadraticCurveTo!(...p(0.98, 0.5), ...p(0.72, 0.68));
    g.quadraticCurveTo!(...p(0.58, 0.74), ...p(0.54, 0.64));
    g.lineTo!(...p(0.62, 0.92));
    g.lineTo!(...p(0.38, 0.92));
    g.lineTo!(...p(0.46, 0.64));
    g.quadraticCurveTo!(...p(0.42, 0.74), ...p(0.28, 0.68));
    g.quadraticCurveTo!(...p(0.02, 0.5), ...p(0.5, 0.08));
  } else {
    // 梅花：三圆 + 柄
    for (const [u, v] of [
      [0.5, 0.3],
      [0.28, 0.58],
      [0.72, 0.58],
    ]) {
      g.moveTo!(...p(u + 0.17, v));
      g.arc!(...p(u, v), 0.17 * w, 0, Math.PI * 2);
    }
    g.moveTo!(...p(0.46, 0.55));
    g.lineTo!(...p(0.6, 0.92));
    g.lineTo!(...p(0.4, 0.92));
    g.lineTo!(...p(0.54, 0.55));
  }
  g.closePath!();
  g.fill!();
}

export const STAMP_ICONS: IconSet = {
  has: (id) => id in GLYPH || id.startsWith('suit_') || id === 'ui_hp' || id === 'ui_hourglass',
  draw(c, id, r, tint) {
    const g = ext(c);
    const vector = !!(g.beginPath && g.moveTo && g.lineTo && g.quadraticCurveTo && g.arc && g.fill && g.stroke && g.closePath);
    if (id.startsWith('suit_') || id === 'ui_hp') {
      c.fillStyle = tint ?? (id === 'suit_H' || id === 'suit_D' || id === 'ui_hp' ? '#d8463a' : C.paper);
      if (vector) suitShape(g, id, r);
      else c.fillRect(r.x + r.w * 0.2, r.y + r.h * 0.2, r.w * 0.6, r.h * 0.6);
      return;
    }
    // 印章：朱/青底方印 + 白色印文
    c.fillStyle = tint ?? STAMP_BG[id] ?? C.goldDeep;
    c.fillRect(r.x, r.y, r.w, r.h);
    if (!vector) return;
    g.save?.();
    g.strokeStyle = 'rgba(243,235,216,.85)';
    g.lineWidth = Math.max(1, r.w * 0.06);
    g.strokeRect?.(r.x + r.w * 0.08, r.y + r.w * 0.08, r.w * 0.84, r.w * 0.84);
    g.beginPath!();
    g.lineWidth = Math.max(1.5, r.w * 0.11);
    const s = r.w;
    const tr = (f: Path) =>
      f(
        {
          ...g,
          moveTo: (a: number, b: number) => g.moveTo!.call(c, r.x + a, r.y + b),
          lineTo: (a: number, b: number) => g.lineTo!.call(c, r.x + a, r.y + b),
          quadraticCurveTo: (a: number, b: number, d: number, e: number) => g.quadraticCurveTo!.call(c, r.x + a, r.y + b, r.x + d, r.y + e),
        } as Ctx2DExtLike,
        s,
      );
    for (const f of GLYPH[id] ?? []) tr(f);
    g.stroke!();
    g.restore?.();
  },
};

let current: IconSet = STAMP_ICONS;
export const icons = () => current;
/** 图集就绪后替换（ui_sharp 中按 icon id 取帧） */
export function setIconSet(s: IconSet) {
  current = s;
}

/**
 * 牌面花色：矢量形（Brush 霞鹜文楷子集没有 ♠♥♣♦ 字形，且只用 Brush、不加回退字体）。
 * (cx, cy) 为中心，size 为边长；color 默认红花色朱砂、黑花色墨色。
 */
export function drawSuit(c: Ctx2DLike, suit: Suit, cx: number, cy: number, size: number, color?: string) {
  const red = suit === 'H' || suit === 'D';
  STAMP_ICONS.draw(c, `suit_${suit}` as IconId, { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, color ?? (red ? C.cinnabar : C.ink));
}
