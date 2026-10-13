/**
 * Brush（霞鹜文楷子集）没有 → − ✗ ✓ × 字形，也不允许回退字体：canvas 上这些符号一律画矢量（#105 跟进）。
 * `glyphLabel` 与 p4-kit `label` 同参：文本里的这些符号拆出来画成线条，其余照常 fillText。
 */
import type { Ctx2DLike } from '../../engine/types';

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
  return s.split(/([→−✗✓×])/).filter((x) => x !== '');
}

function width(c: Ctx2DLike, s: string, px: number): number {
  return parts(s).reduce(
    (w, p) => w + (VEC_GLYPH.test(p) ? ADV[p as VecCh] * px : (((c as P).measureText?.(p).width as number | undefined) ?? p.length * px)),
    0,
  );
}

/** 同 `label`，但 → − ✗ ✓ × 画矢量。px 为字号（用于矢量大小与中线） */
export function glyphLabel(
  c: Ctx2DLike,
  s: string,
  x: number,
  y: number,
  font: string,
  px: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
) {
  const g = c as P;
  c.font = font;
  c.fillStyle = color;
  const w = width(c, s, px);
  let cx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  const had = 'textAlign' in g;
  if (had) g.textAlign = 'left';
  for (const p of parts(s)) {
    if (VEC_GLYPH.test(p)) {
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
