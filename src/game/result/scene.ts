/**
 * P5 结算页（PRD 14.5，flow.md §3.12，render-spec §4「结算」/ §8.5）：B 金漆屏风 Canvas 场景。
 * 布局（390×844 dp）：立绘 + 竖排大字 40–330 ｜ 统计 4 图标 340 ｜ 将魂 430 ｜ 牌组/宝物/铜钱 510 ｜ 兵书抄录 548–756 ｜ 底栏 772。
 * - 统计、将魂、牌组行长按看明细（战报 7 项 / 将魂逐行公式 / 最终牌组）。
 * - 底栏：「返回点将」→ select，「再来一局」→ map（同主副将、新 runSeed）。离开时才入账局外存档并删除局内存档（flow.md §1）。
 * - 兵书抄录：PRD 第 9 章的兵书系统尚未实现，首版只展示本局进化牌（无则「此卷无灵光」），「抄录」置灰。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Ctx2DLike, Rect, Vec2 } from '../../engine/types';
import { frame, inside, textWidth, wrap } from '../overlays/theme';
import { B, body, brush, button, center, num, panel, portraitEdges, right, silhouette, strike, vertical } from './paint';
import type { ResultView } from './settlement';
import { HEROES } from '../../data/heroes';
import { drawPortrait } from '../portrait';

/** 立绘软边：左右下淡出宽度、底部压暗高度、阵容行基线距立绘顶（dp，#177 UI 复核） */
const PORTRAIT_EDGE = 40;
const PORTRAIT_SHADE = 96;
const LINEUP_GAP = 8;

/** 设计稿坐标（dp，390×844） */
export const RESULT_LAYOUT = {
  portrait: { x: 20, y: 40, w: 250, h: 290 } as Rect,
  titleX: 330,
  titleY: 110,
  stats: { x: 20, y: 340, w: 350, h: 80 } as Rect,
  soul: { x: 20, y: 430, w: 350, h: 70 } as Rect,
  inventory: { x: 20, y: 508, w: 350, h: 32 } as Rect,
  book: { x: 20, y: 548, w: 350, h: 208 } as Rect,
  copy: { x: 270, y: 700, w: 88, h: 44 } as Rect,
  back: { x: 40, y: 784, w: 140, h: 44 } as Rect,
  again: { x: 210, y: 784, w: 140, h: 44 } as Rect,
} as const;

export interface ResultDeps {
  /** 进入时取结算视图（由入口从局状态适配） */
  view(): ResultView;
  /** 离开结算页：入账局外存档 + 删除局内存档，然后推进流程 */
  leave(to: 'select' | 'map'): void;
  overlays?: OverlayStack;
}

export class ResultScene implements Scene {
  readonly id = 'result';
  private ctx!: SceneContext;
  /** 立绘加载完成后重绘（#177） */
  private repaint = () => this.ctx?.invalidate('main');
  private v!: ResultView;
  private t = 0;
  private left = false;
  constructor(private deps: ResultDeps) {}

  enter(ctx: SceneContext) {
    this.ctx = ctx;
    this.v = this.deps.view();
    this.t = 0;
    this.left = false;
  }
  exit() {
    this.deps.overlays?.closeAll('detail');
  }
  get view() {
    return this.v;
  }

  /** 等比缩放已由引擎统一处理（render-spec §4.0），场景内 dp 即绘制坐标，k 恒为 1 */
  private readonly k = 1;
  rect(r: Rect): Rect {
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }
  private pt(x: number, y: number): Vec2 {
    const r = this.rect({ x, y, w: 0, h: 0 });
    return { x: r.x, y: r.y };
  }

  update(dt: number) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 800); // 将魂数字滚动 800ms（render-spec §8.5）
      this.ctx.invalidate('main');
    }
  }
  animating() {
    return this.t < 1;
  }

  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') return this.drawBg(c, w, h);
    c.clearRect(0, 0, w, h);
    if (layer === 'main') this.drawMain(c);
  }

  private drawBg(c: Ctx2DLike, w: number, h: number) {
    c.fillStyle = B.lac0;
    c.fillRect(0, 0, w, h);
    c.fillStyle = B.lac2;
    c.fillRect(6, 6, w - 12, h - 12);
    c.globalAlpha = 0.5;
    c.fillStyle = this.win ? B.lac4 : '#2b1d18';
    const p = this.rect(RESULT_LAYOUT.portrait);
    c.fillRect(0, p.y, w, p.h);
    c.globalAlpha = 1;
    frame(c, { x: 6, y: 6, w: w - 12, h: h - 12 }, B.goldLo, 1);
    // 底栏背景延伸到物理屏底
    const bar = this.rect({ x: 0, y: 772, w: 390, h: 72 });
    c.fillStyle = B.lac1;
    c.fillRect(0, bar.y, w, h - bar.y);
    c.fillStyle = B.goldLo;
    c.fillRect(0, bar.y, w, 1);
  }

  private get win() {
    return this.v.title === '大捷';
  }

  private drawMain(c: Ctx2DLike) {
    const v = this.v;
    const k = this.k;
    const L = RESULT_LAYOUT;
    const win = this.win;
    // 1. 立绘（#177：主将大图 cover + 顶对齐；没图回退剪影；败北半透明；左右下 40px 淡出到底色、底部 96px 压暗）+ 竖排大字
    const p = this.rect(L.portrait);
    c.globalAlpha = win ? 0.9 : 0.45;
    const art = { x: p.x + 20 * k, y: p.y + 10 * k, w: p.w - 40 * k, h: p.h - 10 * k };
    const hero = v.lineup.mainId ? HEROES[v.lineup.mainId] : undefined;
    if (!drawPortrait(c, art, hero?.portrait, 'large', { onReady: this.repaint })) silhouette(c, art, win ? '#120807' : '#1c1714');
    c.globalAlpha = 1;
    portraitEdges(c, art, PORTRAIT_EDGE * k, PORTRAIT_SHADE * k, win ? B.portraitBgWin : B.portraitBgLose, win ? B.portraitBgWinClear : B.portraitBgLoseClear);
    const tp = this.pt(L.titleX, L.titleY);
    vertical(c, v.title, tp.x, tp.y, 64 * k, win ? B.gold : B.cinnHi);
    vertical(c, v.chapterName.slice(0, 4), tp.x, tp.y + 170 * k, 20 * k, B.paper3);
    // 结果信息：章与层、用时、runSeed（留在立绘底部压暗区内）
    const info = this.pt(28, 300);
    c.font = body(12 * k);
    c.fillStyle = B.paper3;
    c.fillText?.(`${v.reach} · 用时 ${v.duration}`, info.x, info.y);
    c.fillText?.(`种子 ${v.seed}${v.abandoned ? ' · 放弃本局' : ''}`, info.x, info.y + 16 * k);
    // 阵容：一行放在立绘上方（基线 = 立绘顶 − 8），不压图（#177 UI 复核）
    c.font = brush(18 * k);
    let lx = this.pt(28, 0).x;
    const ly = art.y - LINEUP_GAP * k;
    const seg = (s: string, color: string) => {
      c.fillStyle = color;
      c.fillText?.(s, lx, ly);
      lx += textWidth(c, s, 18 * k) + 14 * k;
    };
    seg(`主 ${v.lineup.main}`, B.gold);
    seg(`副 ${v.lineup.sub}`, B.silver);
    if (v.lineup.combo) seg(`珠联 · ${v.lineup.combo}`, B.cinnHi);
    if (!win && v.killer) this.killerCard(c, v.killer);

    // 3. 统计 4 图标（长按看完整战报）
    const st = this.rect(L.stats);
    panel(c, st);
    const s4 = this.stat4();
    s4.forEach((it, i) => {
      const cx = st.x + (st.w / 4) * (i + 0.5);
      center(c, it.label, cx, st.y + 26 * k, brush(15 * k), B.goldMid, 15 * k);
      center(c, it.value, cx, st.y + 60 * k, num(22 * k), B.paper, 22 * k);
    });

    // 5. 将魂：本局 +N（败北显示折半前划线）与累计
    const so = this.rect(L.soul);
    panel(c, so);
    const roll = Math.round(v.soul.total * easeOut(this.t));
    c.font = num(28 * k);
    c.fillStyle = B.paper;
    const sy = so.y + 42 * k;
    c.fillStyle = B.cinnHi;
    c.fillRect(so.x + 16 * k, sy - 18 * k, 10 * k, 18 * k); // 将魂火焰（图标占位）
    c.fillStyle = B.paper;
    c.fillText?.(`+${roll}`, so.x + 36 * k, sy);
    if (!win && v.soul.base > 0) {
      // 折半前（划线）→ 折半后（render-spec §8.5 失败版）
      const bx = so.x + 120 * k;
      const bw = 14 * k * 0.6 * String(v.soul.base).length;
      c.font = num(14 * k);
      c.fillStyle = B.paper3;
      c.fillText?.(String(v.soul.base), bx, sy - 4 * k);
      strike(c, bx - 2 * k, sy - 9 * k, bw + 4 * k, B.cinnHi);
      c.font = body(11 * k);
      c.fillText?.('失败折半', bx + bw + 8 * k, sy - 4 * k);
    }
    right(c, `累计 ${v.soulTotalBefore + roll}`, so.x + so.w - 16 * k, sy, num(18 * k), B.gold, 18 * k);
    if (v.unlock) center(c, `✦ ${v.unlock}`, so.x + so.w / 2, so.y + so.h - 6 * k, brush(13 * k), B.goldHi, 13 * k);
    else if (win) center(c, 'H5 首版：将魂只累计和展示', so.x + so.w / 2, so.y + so.h - 6 * k, body(10 * k), B.goldLo, 10 * k);

    // 4. 最终牌组 / 宝物 / 铜钱（长按看牌组）
    const inv = this.rect(L.inventory);
    c.fillStyle = 'rgba(21,10,8,.8)';
    c.fillRect(inv.x, inv.y, inv.w, inv.h);
    frame(c, inv, B.goldLo, 1);
    c.font = body(13 * k);
    c.fillStyle = B.paper;
    c.fillText?.(`牌组 ${v.deck.length} 张 · 宝物 ${v.relics.length} · 铜钱 ${v.gold}`, inv.x + 12 * k, inv.y + 21 * k);
    right(c, '长按查看', inv.x + inv.w - 10 * k, inv.y + 21 * k, body(11 * k), B.goldLo, 11 * k);

    // 7. 兵书抄录（可跳过）
    const bk = this.rect(L.book);
    panel(c, bk);
    c.font = brush(20 * k);
    c.fillStyle = B.gold;
    c.fillText?.('兵书抄录', bk.x + 16 * k, bk.y + 32 * k);
    c.font = body(11 * k);
    c.fillStyle = B.paper3;
    c.fillText?.('可跳过', bk.x + 104 * k, bk.y + 30 * k);
    if (!v.evolved.length) {
      center(c, '此卷无灵光', bk.x + bk.w / 2, bk.y + 112 * k, brush(26 * k), B.goldLo, 26 * k);
    } else {
      v.evolved.slice(0, 3).forEach((cd, i) => {
        const r = { x: bk.x + (16 + i * 82) * k, y: bk.y + 50 * k, w: 70 * k, h: 98 * k };
        c.fillStyle = B.paper;
        c.fillRect(r.x, r.y, r.w, r.h);
        frame(c, r, B.gold, 1.5);
        center(c, cd.name, r.x + r.w / 2, r.y + 56 * k, brush(20 * k), B.ink, 20 * k);
        center(c, cd.affixes[0] ?? '', r.x + r.w / 2, r.y + r.h - 10 * k, body(10 * k), B.cinnabar, 10 * k);
      });
    }
    c.font = body(10 * k);
    c.fillStyle = B.goldLo;
    c.fillText?.('兵书系统待接入（PRD 第 9 章）', bk.x + 16 * k, bk.y + bk.h - 14 * k);
    button(c, this.rect(L.copy), '抄录', 'confirm', true);

    // 8. 底栏
    button(c, this.rect(L.back), '返回点将', 'secondary');
    button(c, this.rect(L.again), '再来一局', 'primary');

    if (!win) {
      // 败北：整体去饱和（2D 路径用暗色叠加近似）
      c.globalAlpha = 0.18;
      c.fillStyle = '#3a3a3a';
      c.fillRect(0, 0, this.ctx.width, this.rect(L.back).y - 14 * k);
      c.globalAlpha = 1;
    }
  }

  private killerCard(c: Ctx2DLike, name: string) {
    const k = this.k;
    const r = this.rect({ x: 28, y: 170, w: 56, h: 78 });
    c.fillStyle = B.lac1;
    c.fillRect(r.x, r.y, r.w, r.h);
    frame(c, r, B.cinnabar, 1.5);
    center(c, name.slice(0, 4), r.x + r.w / 2, r.y + 44 * k, brush(14 * k), B.paper, 14 * k);
    center(c, '致命', r.x + r.w / 2, r.y + r.h + 14 * k, body(10 * k), B.cinnHi, 10 * k);
  }

  /** 统计 4 项：胜场 / 精英 / 回合 / 灵光（完整 7 项见长按） */
  stat4() {
    const r = this.v.report;
    const won = r[0].value.split('（')[0];
    const elite = /精英 (\d+)/.exec(r[0].value)?.[1] ?? '0';
    return [
      { label: '胜场', value: won },
      { label: '精英', value: elite },
      { label: '回合', value: r[1].value },
      { label: '灵光', value: r[5].value.replace(' 次', '') },
    ];
  }

  /** 明细浮层内容 */
  details(kind: 'stats' | 'soul' | 'deck'): { title: string; lines: string[] } {
    const v = this.v;
    if (kind === 'stats') return { title: '战报', lines: v.report.map((x) => `${x.label}：${x.value}`) };
    if (kind === 'soul') {
      const s = v.soul;
      const lines = s.lines.map((l) => `${l.label} ${l.count} × ${l.each} = ${l.value}`);
      lines.push(`小计 ${s.base}`);
      if (v.title === '败北') lines.push(`失败 ×0.5（向下取整）= ${s.afterDefeat}`);
      lines.push(`天命加成 ×${s.tianmingMul.toFixed(1)} → ${s.total}`);
      return { title: '将魂明细', lines };
    }
    const deck = v.deck.map((d) => (d.affixes.length ? `${d.name}（${d.affixes.join('、')}）` : d.name));
    return { title: '最终牌组', lines: [deck.join('、') || '（空）', `宝物：${v.relics.join('、') || '无'}`, `剩余铜钱：${v.gold}`] };
  }

  private showDetail(kind: 'stats' | 'soul' | 'deck', at: Vec2) {
    const ov = this.deps.overlays;
    if (!ov) return;
    const k = this.k;
    const d = this.details(kind);
    const w = Math.min(300 * k, this.ctx.width - 16);
    const measure = { measureText: undefined } as unknown as Ctx2DLike;
    const lines = d.lines.flatMap((l) => wrap(measure, l, w - 24, 13 * k));
    const h = (44 + lines.length * 20) * k;
    const rect = { x: Math.max(8, Math.min(at.x - w / 2, this.ctx.width - w - 8)), y: Math.max(8, Math.min(at.y - h - 12, this.ctx.height - h - 8)), w, h };
    ov.closeAll('detail');
    ov.push({
      id: `result-detail:${kind}`,
      kind: 'detail',
      dismissOnTapOutside: true,
      rect,
      draw: (s) => {
        const c = s.ctx;
        c.fillStyle = B.lac1;
        c.fillRect(rect.x, rect.y, rect.w, rect.h);
        frame(c, rect, B.gold, 1.5);
        c.font = brush(20 * k);
        c.fillStyle = B.gold;
        c.fillText?.(d.title, rect.x + 12, rect.y + 28 * k);
        c.font = body(13 * k);
        c.fillStyle = B.paper;
        lines.forEach((l, i) => c.fillText?.(l, rect.x + 12, rect.y + (52 + i * 20) * k));
      },
    });
  }

  /** 命中测试：返回点中的区域 */
  hit(p: Vec2): 'back' | 'again' | 'stats' | 'soul' | 'deck' | null {
    const L = RESULT_LAYOUT;
    const pad = (r: Rect) => {
      const x = this.rect(r);
      const dx = Math.max(0, (44 - x.w) / 2);
      const dy = Math.max(0, (44 - x.h) / 2);
      return { x: x.x - dx, y: x.y - dy, w: x.w + 2 * dx, h: x.h + 2 * dy };
    };
    if (inside(pad(L.back), p)) return 'back';
    if (inside(pad(L.again), p)) return 'again';
    if (inside(this.rect(L.stats), p)) return 'stats';
    if (inside(this.rect(L.soul), p)) return 'soul';
    if (inside(this.rect(L.inventory), p)) return 'deck';
    return null;
  }

  gesture(e: GestureEvent) {
    if (e.type !== 'tap' && e.type !== 'longpress') return false;
    const h = this.hit(e.at);
    if (!h) return false;
    if (e.type === 'tap' && (h === 'back' || h === 'again')) {
      if (this.left) return true; // 防连点
      this.left = true;
      this.deps.leave(h === 'again' ? 'map' : 'select');
      return true;
    }
    if (h === 'stats' || h === 'soul' || h === 'deck') {
      this.showDetail(h, e.at);
      return true;
    }
    return false;
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
