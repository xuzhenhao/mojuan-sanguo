/**
 * 长按详情浮层（render-spec §6 Tooltip / §7.2；flow.md §3.9）。
 * - 宽 180、高 ≤200；深漆底 + 金描边；标题（书法 24）+ 费用 + 花色 + 1–N 行 body（13）。
 * - 对齐到手指上方，钳制在安全区内；点外部关闭（OverlayStack dismissOnTapOutside）。
 * - 内容来源：牌（CardInst + 词条）、敌人（意图 + 技能/词条）、武将技能。只读 core / config。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayHandle, OverlayStack } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { def, enemyIntent, RANK_CH } from '../../core/rules';
import type { CardInst, Enemy, Suit } from '../../core/types';
import { ACT_ICON, ACT_LABEL, icons } from './icons';
import { numFont } from './numfont';
import { AFFIXES } from '../../data/affixes';
import type { Ability } from '../../data/config';
import { C, ext, frame, text, textWidth, wrap } from './theme';

export const INTENT_ROW = 26;
export const DETAIL = { w: 180, maxH: 200, pad: 12, titlePx: 24, bodyPx: 13, lineH: 19.5, gap: 12 } as const;
export const TITLE_FONT = `${DETAIL.titlePx}px "Brush", serif`;
export const BODY_FONT = `${DETAIL.bodyPx}px "PingFang SC", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif`;

export interface DetailContent {
  title: string;
  /** 右上角：费用（数字） */
  cost?: number;
  /** 右上角：花色（印章矢量图标）+ 点数（数字字体） */
  suit?: Suit;
  rank?: number;
  /** 意图图标行（敌人）：动作 → 印章图标 + 张数 */
  intents?: { act: string; n: number }[];
  /** 副标题（类型、技能类别） */
  sub?: string;
  lines: string[];
}

export function cardDetail(c: CardInst): DetailContent {
  const d = def(c);
  const lines = [d.desc];
  for (const id of c.mods) {
    const a = AFFIXES.find((x) => x.id === id);
    if (a) lines.push(`墨·${a.n}：${a.d}`);
  }
  return { title: d.name, cost: d.cost, suit: c.suit, rank: c.rank, sub: d.type, lines };
}

export function enemyDetail(e: Enemy): DetailContent {
  const it = enemyIntent(e);
  const lines = [
    `体力 ${Math.max(0, e.hp)}/${e.max}${e.armor ? ` · 护甲 ${e.armor}` : ''}${e.marks ? ` · 闪标记 ${e.marks}` : ''}`,
    `本回合意图${it.dmg ? `：共 ${it.dmg} 点伤害` : ''}`,
  ];
  for (const t of it.tip.split('｜')[0].split('；')) if (t) lines.push(`· ${t}`);
  const cnt = new Map<string, number>();
  for (const a of it.acts) cnt.set(a, (cnt.get(a) ?? 0) + 1);
  if (e.skill) lines.push(e.skill);
  for (const a of e.abilities ?? []) if (a.desc && !e.skill?.includes(a.name)) lines.push(`${a.name}：${a.desc}`);
  return { title: e.name, sub: `${e.row === 'front' ? '前排' : '后排'}${e.elite ? ' · 精英' : ''}`, lines, intents: [...cnt].map(([act, n]) => ({ act, n })) };
}

export function skillDetail(a: Pick<Ability, 'name' | 'desc' | 'kind'>, owner?: string): DetailContent {
  return { title: a.name, sub: [owner, a.kind].filter(Boolean).join(' · '), lines: [a.desc] };
}

/** 计算浮层矩形：手指上方居中，钳制到安全区 */
export function placeDetail(at: Vec2, h: number, safe: Rect): Rect {
  const w = DETAIL.w;
  let x = at.x - w / 2;
  let y = at.y - DETAIL.gap - h - 24; // 留出手指遮挡
  if (y < safe.y + 4) y = at.y + DETAIL.gap + 24; // 上方放不下则放到下方
  x = Math.min(Math.max(x, safe.x + 4), safe.x + safe.w - w - 4);
  y = Math.min(Math.max(y, safe.y + 4), safe.y + safe.h - h - 4);
  return { x, y, w, h };
}

/** 排版：返回行与总高（≤ maxH，超出截断加省略号） */
export function layoutDetail(ctx: Surface['ctx'], c: DetailContent) {
  const inner = DETAIL.w - DETAIL.pad * 2;
  ctx.font = BODY_FONT;
  let lines = c.lines.flatMap((l) => wrap(ctx, l, inner, DETAIL.bodyPx));
  const head = DETAIL.pad + DETAIL.titlePx + (c.sub ? 18 : 6) + (c.intents?.length ? INTENT_ROW : 0);
  const maxLines = Math.floor((DETAIL.maxH - head - DETAIL.pad) / DETAIL.lineH);
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), lines[maxLines - 1].slice(0, -1) + '…'];
  return { lines, h: Math.min(DETAIL.maxH, head + lines.length * DETAIL.lineH + DETAIL.pad) };
}

export function drawDetail(s: Surface, c: DetailContent, r: Rect, lines: string[]) {
  const g = s.ctx;
  g.fillStyle = C.lacquerDeep;
  g.fillRect(r.x, r.y, r.w, r.h);
  frame(g, r, C.gold, 1.5);
  frame(g, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, 'rgba(217,180,106,.35)', 1);
  let y = r.y + DETAIL.pad + DETAIL.titlePx - 4;
  text(g, c.title, r.x + DETAIL.pad, y, TITLE_FONT, C.gold);
  // 右上：费用珠 + 花色（矢量印章图标）+ 点数（数字字体）
  const nf = numFont();
  let rx = r.x + r.w - DETAIL.pad;
  if (c.suit) {
    const rk = RANK_CH[c.rank ?? 0] ?? String(c.rank);
    const red = c.suit === 'H' || c.suit === 'D';
    rx -= nf.measure(g, rk, 15);
    nf.draw(g, rk, rx, y - 4, 15, red ? '#e0605a' : C.paper);
    rx -= 16;
    icons().draw(g, `suit_${c.suit}`, { x: rx, y: y - 17, w: 14, h: 14 });
    rx -= 8;
  }
  if (c.cost != null) {
    const cx = rx - 10;
    const x = ext(g);
    g.fillStyle = C.jade;
    if (x.arc && x.beginPath && x.fill) {
      x.beginPath();
      x.arc(cx, y - 9, 10, 0, Math.PI * 2);
      x.fill();
    } else g.fillRect(cx - 9, y - 18, 18, 18);
    const cs = String(c.cost);
    nf.draw(g, cs, cx - nf.measure(g, cs, 14) / 2, y - 4, 14, C.paper);
  }
  if (c.sub) {
    y += 18;
    text(g, c.sub, r.x + DETAIL.pad, y, BODY_FONT, 'rgba(243,235,216,.6)');
  }
  if (c.intents?.length) {
    // 意图行：印章图标 + 名称 + ×N（不用 emoji）
    let ix = r.x + DETAIL.pad;
    const iy = y + 8;
    for (const { act, n } of c.intents) {
      const id = ACT_ICON[act];
      if (id) icons().draw(g, id, { x: ix, y: iy, w: 18, h: 18 });
      ix += 21;
      const lab = ACT_LABEL[act] ?? act;
      text(g, lab, ix, iy + 14, BODY_FONT, C.paper);
      g.font = BODY_FONT;
      ix += textWidth(g, lab, DETAIL.bodyPx) + 2;
      if (n > 1) ix += nf.draw(g, `×${n}`, ix, iy + 14, 13, C.gold);
      ix += 8;
    }
    y += INTENT_ROW;
  }
  y += 6;
  for (const l of lines) {
    y += DETAIL.lineH;
    text(g, l, r.x + DETAIL.pad, y - 5, BODY_FONT, C.paper);
  }
}

/** 打开详情浮层（同时只保留一个详情） */
export function openDetail(stack: OverlayStack, content: DetailContent, at: Vec2, safe: Rect, measure: Surface['ctx']): OverlayHandle {
  stack.closeAll('detail');
  const { lines, h } = layoutDetail(measure, content);
  const rect = placeDetail(at, h, safe);
  return stack.push({
    id: `detail:${content.title}`,
    kind: 'detail',
    dismissOnTapOutside: true,
    rect,
    draw: (s) => drawDetail(s, content, rect, lines),
    // 点浮层自身也关闭
    gesture: (e, h2) => {
      if (e.type === 'tap' && e.at.x >= rect.x && e.at.x <= rect.x + rect.w && e.at.y >= rect.y && e.at.y <= rect.y + rect.h) {
        h2.close();
        return true;
      }
      return false;
    },
  });
}

/**
 * 长按环形进度（flow.md §3.9：0–420ms 金色环形进度，到点弹详情）。
 * 场景把手势先交给它：longpressprogress 记进度并请求重绘，longpress 时调用 resolve 命中测试并打开详情。
 */
export class LongPressDetail {
  progress = 0;
  at: Vec2 | null = null;
  constructor(
    private stack: OverlayStack,
    private resolve: (at: Vec2) => DetailContent | null,
    private env: { safe(): Rect; measure(): Surface['ctx']; invalidate(): void },
  ) {}
  /** 返回 true 表示已处理（longpress 命中了可看详情的对象） */
  gesture(e: GestureEvent): boolean {
    if (e.type === 'longpressprogress') {
      // 只在可看详情的对象上显示环
      if (!this.at && !this.resolve(e.at)) return false;
      this.at = e.at;
      this.progress = e.progress;
      this.env.invalidate();
      return false;
    }
    const had = !!this.at;
    this.at = null;
    this.progress = 0;
    if (had) this.env.invalidate();
    if (e.type !== 'longpress') return false;
    const c = this.resolve(e.at);
    if (!c) return false;
    openDetail(this.stack, c, e.at, this.env.safe(), this.env.measure());
    return true;
  }
  /** 环形进度：直径 30、金色，绘制在手指上方 */
  draw(s: Surface) {
    if (!this.at || this.progress <= 0) return;
    const g = ext(s.ctx);
    const { x, y } = this.at;
    const cy = y - 44;
    if (g.arc && g.beginPath && g.stroke) {
      g.beginPath();
      g.strokeStyle = 'rgba(217,180,106,.25)';
      g.lineWidth = 3;
      g.arc(x, cy, 15, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.strokeStyle = C.gold;
      g.arc(x, cy, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.progress));
      g.stroke();
    } else {
      s.ctx.fillStyle = C.gold;
      s.ctx.fillRect(x - 15, cy, 30 * this.progress, 3);
    }
  }
}
