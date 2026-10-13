/**
 * 通用顶部提示（#122 读档 / 中途刷新回退 toast，runstate-migration.md §4/§5）。
 * PR3 正式样式：墨底白字胶囊（lac0 α.9 + 1px goldLo 描边），霞鹜文楷（FontFace 族名 Brush，不回退系统字体），
 * 显示 2.5s（含 180ms 淡入 / 淡出），非模态不挡输入；同时多条时自上而下堆叠（间距 8）。
 * setNoticeRenderer 仍可替换渲染（测试 / 小游戏端）。
 */
import type { OverlayHandle, OverlayStack } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import type { Ctx2DLike } from '../../engine/types';
import { DESIGN_RECT } from '../../engine/viewport';

export const NOTICE_MS = 2500;
export const NOTICE_FADE_MS = 180;
/** 字体只用霞鹜文楷（Brush），不写任何系统字体回退 */
export const NOTICE_FONT = '16px "Brush"';
export const NOTICE_STYLE = { bg: 'rgba(7,3,2,0.9)', line: '#8A6A2A', text: '#F3EBD8', y: 64, h: 40, padX: 22, gap: 8, minW: 200, maxW: 350 } as const;
/** slot：堆叠序号（0 = 最上面一条） */
export type NoticeRenderer = (s: Surface, text: string, t: number, slot: number) => void;

const alphaAt = (t: number, ms = NOTICE_MS) => Math.max(0, Math.min(1, t / NOTICE_FADE_MS, (ms - t) / NOTICE_FADE_MS));

function capsule(c: Ctx2DLike, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  const g = c as Ctx2DLike & { beginPath?(): void; arc?(...a: number[]): void; closePath?(): void; fill?(): void; stroke?(): void };
  if (g.beginPath && g.arc && g.fill) {
    g.beginPath();
    g.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
    g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    g.closePath?.();
    g.fill();
    g.stroke?.();
  } else c.fillRect(x, y, w, h);
}

export const formalNotice: NoticeRenderer = (s, text, t, slot) => {
  const c = s.ctx;
  const S = NOTICE_STYLE;
  const W = DESIGN_RECT.w; // 弹层用 390 设计坐标（render-spec §4.0）
  c.font = NOTICE_FONT;
  const tw = (c as Ctx2DLike & { measureText?(t: string): { width: number } }).measureText?.(text).width ?? text.length * 16;
  const w = Math.max(S.minW, Math.min(S.maxW, tw + S.padX * 2));
  const x = (W - w) / 2;
  const y = S.y + slot * (S.h + S.gap);
  const ga = c.globalAlpha;
  c.globalAlpha = ga * alphaAt(t);
  c.fillStyle = S.bg;
  (c as Ctx2DLike & { strokeStyle?: string; lineWidth?: number }).strokeStyle = S.line;
  (c as Ctx2DLike & { lineWidth?: number }).lineWidth = 1;
  capsule(c, x, y, w, S.h);
  c.fillStyle = S.text;
  (c as Ctx2DLike & { textAlign?: string }).textAlign = 'center';
  (c as Ctx2DLike & { textBaseline?: string }).textBaseline = 'middle';
  c.fillText?.(text, W / 2, y + S.h / 2 + 1);
  (c as Ctx2DLike & { textBaseline?: string }).textBaseline = 'alphabetic';
  c.globalAlpha = ga;
};

let renderer: NoticeRenderer = formalNotice;
export function setNoticeRenderer(r: NoticeRenderer | null) {
  renderer = r ?? formalNotice;
}

/** 当前在屏的提示（堆叠用） */
const live: OverlayHandle[] = [];
export const liveNotices = () => live.length;

/** 弹出提示（非模态，不挡输入）；text 为空则不弹。多条同时在屏时依次往下排 */
export function showNotice(ov: Pick<OverlayStack, 'push'>, text: string | null, ms = NOTICE_MS): OverlayHandle | null {
  if (!text) return null;
  let t = 0;
  const h: OverlayHandle = ov.push({
    id: `notice:${live.length}`,
    kind: 'toast',
    modal: false,
    draw: (s) => renderer(s, text, t, Math.max(0, live.indexOf(h))),
    animating: () => true,
    update(dt) {
      t += dt;
      if (t >= ms) {
        const i = live.indexOf(h);
        if (i >= 0) live.splice(i, 1);
        h.close();
      }
    },
  });
  live.push(h);
  // 被外部 closeAll('toast') 关掉时也出栈，避免堆叠位错
  void h.result.then(() => {
    const i = live.indexOf(h);
    if (i >= 0) live.splice(i, 1);
  });
  return h;
}
