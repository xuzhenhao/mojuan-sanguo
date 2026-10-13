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
/** 宽度按内容自适应：最小 200dp，最大 屏宽 − 48dp，水平居中；多条同时在屏时统一取最宽一条的宽度（#136） */
export const NOTICE_STYLE = { bg: 'rgba(7,3,2,0.9)', line: '#8A6A2A', text: '#F3EBD8', h: 40, padX: 22, gap: 8, minW: 200, sideMargin: 24 } as const;
/** 同时最多显示条数：新来的在下、旧的往上挤，超出移掉最旧 */
export const NOTICE_MAX = 2;
/**
 * 堆叠起点（设计坐标 y）：页面顶部 HUD 下边缘往下 8dp，绝不盖 HUD。
 * 地图：HUD 底 98 → 卷轴金轴 100–112 → 120；战斗：顶条 10+26 → 44；其他无 HUD 页默认 64。
 */
export const NOTICE_TOP: Record<string, number> = { map: 112 + 8, battle: 36 + 8 };
export const NOTICE_TOP_DEFAULT = 64;
let topOf: () => number = () => NOTICE_TOP_DEFAULT;
/** 入口按当前页设置起点（entry.ts：NOTICE_TOP[flow.page] ?? 默认） */
export function setNoticeTop(f: (() => number) | null) {
  topOf = f ?? (() => NOTICE_TOP_DEFAULT);
}
/** 第 slot 条的矩形（slot 0 = 最上面 = 最旧） */
export function noticeRect(textW: number, slot: number, W: number = DESIGN_RECT.w) {
  const S = NOTICE_STYLE;
  const w = Math.max(S.minW, Math.min(W - S.sideMargin * 2, textW + S.padX * 2));
  return { x: (W - w) / 2, y: topOf() + slot * (S.h + S.gap), w, h: S.h };
}
/** slot：堆叠序号（0 = 最上面一条） */
/** stackW：同屏各条文字宽度的最大值（统一胶囊宽度用）；缺省按本条文字宽 */
export type NoticeRenderer = (s: Surface, text: string, t: number, slot: number, stackW?: number) => void;
/** 量文字宽（无 measureText 的环境按 16dp/字估） */
export function measureNotice(c: Ctx2DLike, text: string) {
  c.font = NOTICE_FONT;
  return (c as Ctx2DLike & { measureText?(t: string): { width: number } }).measureText?.(text).width ?? text.length * 16;
}

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

export const formalNotice: NoticeRenderer = (s, text, t, slot, stackW) => {
  const c = s.ctx;
  const S = NOTICE_STYLE;
  const W = DESIGN_RECT.w; // 弹层用 390 设计坐标（render-spec §4.0）
  const tw = Math.max(measureNotice(c, text), stackW ?? 0);
  const { x, y, w } = noticeRect(tw, slot, W);
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
/** 按弹层栈分别记（多个引擎 / 测试互不影响） */
const lives = new WeakMap<object, OverlayHandle[]>();
const liveOf = (ov: object) => {
  let l = lives.get(ov);
  if (!l) lives.set(ov, (l = []));
  return l;
};
/** 各条的文字宽（绘制时量，堆叠统一宽度用） */
const widths = new WeakMap<OverlayHandle, number>();
let seq = 0;
/** 当前同屏各条文字宽的最大值（测试用） */
export const noticeStackWidth = (ov: object) => Math.max(0, ...liveOf(ov).map((x) => widths.get(x) ?? 0));
export const liveNotices = (ov: object) => liveOf(ov).length;

/** 弹出提示（非模态，不挡输入）；text 为空则不弹。多条同时在屏时依次往下排 */
export function showNotice(ov: Pick<OverlayStack, 'push'>, text: string | null, ms = NOTICE_MS): OverlayHandle | null {
  if (!text) return null;
  const live = liveOf(ov);
  // 超过上限：移掉最旧的（slot 0），其余往上挤
  while (live.length >= NOTICE_MAX) {
    const old = live.shift()!;
    old.close();
  }
  let t = 0;
  const h: OverlayHandle = ov.push({
    id: `notice:${++seq}`,
    kind: 'toast',
    modal: false,
    draw: (s) => {
      widths.set(h, measureNotice(s.ctx, text));
      renderer(s, text, t, Math.max(0, live.indexOf(h)), noticeStackWidth(ov));
    },
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
