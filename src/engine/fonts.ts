/**
 * 全局字体栈（#142）：游戏内只用霞鹜文楷（LXGW WenKai，FontFace 族名 Brush），
 * 正文、数字、书法字同一族名，绝不回退系统字体。字体加载完成后 entry 调 invalidateAll() 重绘。
 */
export const FONT_FAMILY = '"Brush"';
export const font = (px: number, bold = false): string => `${bold ? 'bold ' : ''}${px}px ${FONT_FAMILY}`;
