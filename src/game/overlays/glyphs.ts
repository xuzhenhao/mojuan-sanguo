/**
 * Brush（霞鹜文楷子集）没有 → − ✗ ✓ × 字形，也不允许回退字体：canvas 上这些符号一律画矢量（#105 跟进）。
 * `glyphLabel` 与 p4-kit `label` 同参：文本里的这些符号拆出来画成线条，其余照常 fillText。
 */
import type { Ctx2DLike } from '../../engine/types';
import type { Suit } from '../../core/types';
import { suitPath, type IconId } from './icons';
import { C, ext } from './theme';

export const VEC_GLYPH = /[→−✗✓×]/;
type VecCh = '→' | '−' | '✗' | '✓' | '×';
/** 矢量符号占位宽（相对字号） */
const ADV: Record<VecCh, number> = { '→': 1.0, '−': 0.7, '✗': 0.8, '✓': 0.8, '×': 0.7 };

type P = Ctx2DLike &
  Partial<
    Pick<
      CanvasRenderingContext2D,
      'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'lineCap' | 'lineJoin' | 'lineWidth' | 'strokeStyle' | 'measureText' | 'textAlign'
    >
  >;

/** 以 (cx, cy) 为中心画一个符号；size = 字号 */
export function drawVecGlyph(c: Ctx2DLike, ch: VecCh, cx: number, cy: number, size: number, color: string) {
  const g = c as P;
  const s = size;
  const seg = (pts: [number, number][][]) => {
    g.beginPath?.();
    for (const line of pts) line.forEach(([x, y], i) => (i ? g.lineTo?.(cx + x * s, cy + y * s) : g.moveTo?.(cx + x * s, cy + y * s)));
    g.stroke?.();
  };
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.2, s * (ch === '✗' || ch === '✓' ? 0.13 : 0.08));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (ch === '→')
    seg([
      [
        [-0.4, 0],
        [0.38, 0],
      ],
      [
        [0.16, -0.2],
        [0.4, 0],
        [0.16, 0.2],
      ],
    ]);
  else if (ch === '−')
    seg([
      [
        [-0.26, 0],
        [0.26, 0],
      ],
    ]);
  else if (ch === '×' || ch === '✗')
    seg([
      [
        [-0.26, -0.26],
        [0.26, 0.26],
      ],
      [
        [0.26, -0.26],
        [-0.26, 0.26],
      ],
    ]);
  else
    seg([
      [
        [-0.3, 0],
        [-0.08, 0.24],
        [0.32, -0.28],
      ],
    ]);
}

function parts(s: string): string[] {
  return s.split(/([→−✗✓×♠♥♣♦])/).filter((x) => x !== '');
}
const isSuit = (p: string) => p.length === 1 && '♠♥♣♦'.includes(p);

function width(c: Ctx2DLike, s: string, px: number): number {
  return parts(s).reduce(
    (w, p) =>
      w + (isSuit(p) ? ICON_ADV * px : VEC_GLYPH.test(p) ? ADV[p as VecCh] * px : (((c as P).measureText?.(p).width as number | undefined) ?? p.length * px)),
    0,
  );
}

/** 同 `label`，但 → − ✗ ✓ × 与 ♠♥♣♦ 画矢量（花色按 suitColors 着色：红 T.cinnHi / 黑 T.paper）。px 为字号（用于矢量大小与中线） */
export function glyphLabel(
  c: Ctx2DLike,
  s: string,
  x: number,
  y: number,
  font: string,
  px: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
  suitColors?: { red: string; black: string },
) {
  const g = c as P;
  c.font = font;
  c.fillStyle = color;
  const w = width(c, s, px);
  let cx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  const had = 'textAlign' in g;
  if (had) g.textAlign = 'left';
  for (const p of parts(s)) {
    if (isSuit(p)) {
      const a = ICON_ADV * px;
      const red = p === '♥' || p === '♦';
      const col = suitColors ? (red ? suitColors.red : suitColors.black) : color;
      drawInlineIcon(c, `suit_${SUIT_OF[p]}`, cx + a / 2, y, px, col);
      cx += a;
    } else if (VEC_GLYPH.test(p)) {
      const a = ADV[p as VecCh] * px;
      drawVecGlyph(c, p as VecCh, cx + a / 2, y - px * 0.34, px, color);
      cx += a;
    } else {
      c.fillStyle = color;
      c.fillText?.(p, cx, y);
      cx += (g.measureText?.(p).width as number | undefined) ?? p.length * px;
    }
  }
}

/**
 * 行内图标（替代系统字符 ⚔ ✦ ◆ ♠♥♣♦，防止 iOS 渲染成彩色 emoji）。
 * 规格：高 = 0.8 × 字号，底边压基线，1px 墨色描边（70% 灰下仍可辨）。颜色由调用方从 T.* / C.* 传入。静态绘制，无动效、无 shadowBlur。
 */
export type InlineIcon = 'sword' | 'spark' | 'gem' | `suit_${Suit}`;
export const ICON_H = 0.8;
/** 行内图标占位宽（相对字号） */
export const ICON_ADV = 0.9;

export function drawInlineIcon(c: Ctx2DLike, id: InlineIcon, cx: number, baseline: number, px: number, color: string, outline: string = C.ink) {
  const g = ext(c) as ReturnType<typeof ext> & P;
  const h = px * ICON_H;
  const r = { x: cx - h / 2, y: baseline - h, w: h, h };
  const p = (u: number, v: number) => [r.x + u * h, r.y + v * h] as const;
  if (!(g.beginPath && g.moveTo && g.lineTo && g.quadraticCurveTo && g.arc && g.fill && g.stroke && g.closePath)) {
    // 无路径 API 的上下文（测试假画布等）：退化为实心方块，与 STAMP_ICONS 一致
    c.fillStyle = color;
    c.fillRect?.(r.x + h * 0.2, r.y + h * 0.2, h * 0.6, h * 0.6);
    return;
  }
  g.save?.();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (id === 'sword') {
    // 双剑交叉：先粗墨线做描边，再画主色
    const blades: [number, number, number, number][] = [
      [0.12, 0.12, 0.88, 0.88],
      [0.88, 0.12, 0.12, 0.88],
      [0.08, 0.66, 0.34, 0.92],
      [0.92, 0.66, 0.66, 0.92],
    ];
    const lw = Math.max(1.5, h * 0.14);
    for (const [col, w] of [
      [outline, lw + 2],
      [color, lw],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath?.();
      for (const [a, b, d, e] of blades) {
        g.moveTo?.(...p(a, b));
        g.lineTo?.(...p(d, e));
      }
      g.stroke?.();
    }
  } else {
    g.beginPath?.();
    if (id === 'spark') {
      g.moveTo?.(...p(0.5, 0));
      g.quadraticCurveTo?.(...p(0.56, 0.44), ...p(1, 0.5));
      g.quadraticCurveTo?.(...p(0.56, 0.56), ...p(0.5, 1));
      g.quadraticCurveTo?.(...p(0.44, 0.56), ...p(0, 0.5));
      g.quadraticCurveTo?.(...p(0.44, 0.44), ...p(0.5, 0));
      g.closePath?.();
    } else if (id === 'gem') {
      g.moveTo?.(...p(0.5, 0.04));
      g.lineTo?.(...p(0.9, 0.5));
      g.lineTo?.(...p(0.5, 0.96));
      g.lineTo?.(...p(0.1, 0.5));
      g.closePath?.();
    } else suitPath(g, id as IconId, r);
    g.strokeStyle = outline;
    g.lineWidth = 2; // 一半被填充盖住，外露 1px
    g.stroke?.();
    g.fillStyle = color;
    g.fill?.();
  }
  g.restore?.();
}

const SUIT_OF: Record<string, Suit> = { '♠': 'S', '♥': 'H', '♣': 'C', '♦': 'D' };
/** 文本里的花色 → 行内矢量（红花色 / 黑花色颜色由调用方给） */
export const SUIT_GLYPH = /[♠♥♣♦]/;
