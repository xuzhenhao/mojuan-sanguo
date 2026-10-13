/**
 * 数字字体接口（render-spec §2：数字用位图字体）。
 * 位图数字图集尚未交付：默认 `SERIF_DIGITS` 用霞鹜文楷数字占位（#142：不回退任何系统字体），
 * 资源到位后实现 `NumFont`（按字符取图集帧）并 `setNumFont()` 替换，调用方不变。
 */
import type { Ctx2DLike } from '../../engine/types';
import { ext } from './theme';

export interface NumFont {
  /** 绘制数字串（0-9 / + − × / A J Q K 和空格），基线在 y；返回宽度 */
  draw(c: Ctx2DLike, s: string, x: number, y: number, px: number, color: string): number;
  measure(c: Ctx2DLike, s: string, px: number): number;
}

const font = (px: number) => `bold ${px}px "Brush"`;

export const SERIF_DIGITS: NumFont = {
  measure(c, s, px) {
    c.font = font(px);
    const m = ext(c).measureText;
    return m ? m.call(c, s).width : s.length * px * 0.6;
  },
  draw(c, s, x, y, px, color) {
    c.font = font(px);
    c.fillStyle = color;
    c.fillText?.(s, x, y);
    return this.measure(c, s, px);
  },
};

let current: NumFont = SERIF_DIGITS;
export const numFont = () => current;
export function setNumFont(f: NumFont) {
  current = f;
}
