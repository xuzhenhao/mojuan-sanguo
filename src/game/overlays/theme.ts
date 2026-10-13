/**
 * 战斗弹层的共用绘制工具（render-spec §1 令牌色）。只用 Ctx2DLike 必备方法；
 * 弧线、描边等可选方法存在时才使用（测试替身里没有也不报错）。
 */
import { hitInside } from '../../engine/hit';
import type { Ctx2DLike, Rect, Vec2 } from '../../engine/types';

export const C = {
  lacquer: '#2a0f0c',
  lacquerDeep: '#1a0806',
  gold: '#d9b46a',
  goldDeep: '#8c6a2e',
  paper: '#f3ebd8',
  ink: '#1a1a1a',
  cinnabar: '#c0392b',
  jade: '#2f6b4f',
  mask: 'rgba(5,2,1,.72)',
  dim: 'rgba(5,2,1,.55)',
} as const;

/** Canvas 2D 的可选扩展方法 */
export type Ctx2DExt = Ctx2DLike &
  Partial<{
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    stroke(): void;
    fill(): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    measureText(t: string): { width: number };
    save(): void;
    restore(): void;
    strokeStyle: unknown;
    lineWidth: number;
    textAlign: string;
    textBaseline: string;
  }>;

export const ext = (c: Ctx2DLike) => c as Ctx2DExt;
/** 可点区域命中：命中框补足到 ≥ 44×44（#118，engine/hit.ts），视觉不变 */
export const inside = (r: Rect, p: Vec2) => hitInside(r, p);

/** 金描边框（strokeRect 不可用时退化为 4 条细矩形） */
export function frame(c: Ctx2DLike, r: Rect, color: string = C.gold, w = 1.5) {
  const x = ext(c);
  if (x.strokeRect) {
    x.strokeStyle = color;
    x.lineWidth = w;
    x.strokeRect(r.x, r.y, r.w, r.h);
    return;
  }
  c.fillStyle = color;
  c.fillRect(r.x, r.y, r.w, w);
  c.fillRect(r.x, r.y + r.h - w, r.w, w);
  c.fillRect(r.x, r.y, w, r.h);
  c.fillRect(r.x + r.w - w, r.y, w, r.h);
}

export function text(c: Ctx2DLike, s: string, x: number, y: number, font: string, color: string) {
  c.font = font;
  c.fillStyle = color;
  c.fillText?.(s, x, y);
}

/** 文字宽度：优先 measureText（按 font+文本缓存）；无 measureText 时按字号估算 */
const widthCache = new Map<string, number>();
/** 字体换装后（如霞鹜文楷加载完成）宽度全部作废 */
export function clearTextWidthCache() {
  widthCache.clear();
}
export function textWidth(c: Ctx2DLike, s: string, px: number) {
  const m = ext(c).measureText;
  if (m) {
    const k = `${c.font}|${s}`;
    let w = widthCache.get(k);
    if (w == null) {
      w = m.call(c, s).width;
      if (widthCache.size > 2000) widthCache.clear();
      widthCache.set(k, w);
    }
    return w;
  }
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? px : px * 0.55;
  return w;
}

/** 水平居中绘制（measureText 定宽） */
export function textCenter(c: Ctx2DLike, s: string, cx: number, y: number, font: string, color: string, px: number) {
  c.font = font;
  text(c, s, cx - textWidth(c, s, px) / 2, y, font, color);
}

/** 避头：不能出现在行首的标点；避尾：不能出现在行尾的标点 */
export const NO_LINE_START = new Set('）)」』】》〉，。、；：！？…—·%'.split(''));
export const NO_LINE_END = new Set('（(「『【《〈'.split(''));

/** 按宽度折行（逐字，中文无空格），带标点避头尾：行首标点挂到上一行末（悬挂），行尾开括号移到下一行 */
export function wrap(c: Ctx2DLike, s: string, maxW: number, px: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (cur && textWidth(c, cur + ch, px) > maxW) {
      if (NO_LINE_START.has(ch)) {
        cur += ch; // 悬挂标点：允许略超行宽
        continue;
      }
      let carry = '';
      while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1])) {
        carry = cur[cur.length - 1] + carry;
        cur = cur.slice(0, -1);
      }
      out.push(cur);
      cur = carry + ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
