/**
 * 响应弹窗（render-spec §6「响应弹层」/ §7；flow.md §3.6；acceptance「响应」）。
 * 接 core 的决策点 BattleIO.respond(text, legal, pass, timed)：返回 Promise<CardInst | null>。
 * - 全屏遮罩 rgba(5,2,1,.72)；合法手牌提到遮罩之上（上浮 22 + 金外圈），非法牌留在遮罩下。
 * - 弧形红箭：攻击者 → 我方主将；横幅 + 进度条在主将牌左侧，确定 / 承受(❤−N) 在横幅下方。
 * - 超时（timed）自动承受；倒计时用真实时间，场景暂停（切后台）时冻结。
 * - 无合法牌：不弹窗，0.6s 横幅「无闪可出」后直接结算；自动出闪打开且只有 1 张合法牌：自动打出。
 * 布局（牌、攻击者、主将的位置）由宿主场景提供，本组件不改战斗页主体布局。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayHandle, OverlayStack, Scrim } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { def, RANK_CH } from '../../core/rules';
import type { BattleIO } from '../../core/battle';
import type { CardInst } from '../../core/types';
import { C, ext, frame, inside, text, textCenter, textWidth } from './theme';
import { icons } from './icons';
import { numFont } from './numfont';
import { BODY_FONT, TITLE_FONT } from './detail';
import { brushFont } from '../fonts';

const CARD_FONT = () => brushFont(22);
export const RESPONSE = { lift: 22, bannerW: 230, bannerH: 56, barH: 6, btnW: 108, btnH: 44, gap: 10, defaultSeconds: 8, noLegalMs: 600 } as const;

/** 宿主场景提供的布局（逻辑像素） */
export interface ResponseLayout {
  /** 手牌第 i 张（共 n 张）的矩形（未上浮时） */
  cardRect(i: number, n: number): Rect;
  /** 攻击者牌矩形（没有攻击者时不画箭头） */
  attacker?: Rect | null;
  /** 我方主将牌矩形 */
  hero: Rect;
}

export type ResponseKind = 'shan' | 'dying' | 'other';
export interface ResponseRequest {
  /** core 给出的提示文本，如「张宝 对你使用【杀】，伤害 2」 */
  text: string;
  legal: (c: CardInst) => boolean;
  /** 放弃按钮文本（core 给出：不出闪 / 放弃） */
  pass: string;
  timed: boolean;
  hand: CardInst[];
}

export interface ResponseOptions {
  layout: () => ResponseLayout;
  /** 响应时限（秒）：设置 5/8/12，默认 8 */
  seconds?: number;
  /** 自动出闪 */
  autoShan?: boolean;
  /** 场景是否暂停（暂停时倒计时冻结） */
  paused?: () => boolean;
}

/** 从 core 文本解析出种类与伤害（core 不改，只读其提示） */
export function parseRequest(t: string): { kind: ResponseKind; dmg: number; title: string; attacker: string | null } {
  const m = /^(.+?) 对你使用【(.+?)】，伤害 (\d+)/.exec(t);
  if (m) return { kind: m[2] === '杀' ? 'shan' : 'other', dmg: Number(m[3]), title: `出闪`, attacker: m[1] };
  if (t.startsWith('濒死')) return { kind: 'dying', dmg: 0, title: '濒死求桃', attacker: null };
  return { kind: 'other', dmg: 0, title: '响应', attacker: null };
}

export interface ResponseState {
  req: ResponseRequest;
  info: ReturnType<typeof parseRequest>;
  selected: CardInst | null;
  /** 剩余毫秒（不限时为 Infinity） */
  left: number;
  total: number;
  /** 弹出动画 0→1（250ms） */
  intro: number;
}

/** 计算可交互元素的位置 */
export function responseGeometry(lay: ResponseLayout, st: ResponseState) {
  const n = st.req.hand.length;
  const cards = st.req.hand.map((c, i) => {
    const r = lay.cardRect(i, n);
    const legal = st.req.legal(c);
    return { card: c, legal, rect: legal ? { ...r, y: r.y - RESPONSE.lift * st.intro } : r };
  });
  const h = lay.hero;
  const bw = RESPONSE.bannerW;
  const banner: Rect = { x: Math.max(8, h.x - bw - 8), y: h.y + 4, w: bw, h: RESPONSE.bannerH };
  const bar: Rect = { x: banner.x, y: banner.y + banner.h + 8, w: bw, h: RESPONSE.barH };
  const by = bar.y + bar.h + 14;
  const ok: Rect = { x: banner.x, y: by, w: RESPONSE.btnW, h: RESPONSE.btnH };
  const take: Rect = { x: banner.x + bw - RESPONSE.btnW, y: by, w: RESPONSE.btnW, h: RESPONSE.btnH };
  return { cards, banner, bar, ok, take };
}

/** 箭头终点：主将牌顶边中点（稿：指向武将牌本身） */
export const arrowEnd = (to: Rect): Vec2 => ({ x: to.x + to.w / 2, y: to.y + 2 });

function drawArrow(s: Surface, from: Rect, to: Rect, p: number) {
  const g = ext(s.ctx);
  if (!g.beginPath || !g.moveTo || !g.quadraticCurveTo || !g.stroke || !g.lineTo) return;
  const a: Vec2 = { x: from.x + from.w * 0.75, y: from.y + from.h };
  const b = arrowEnd(to);
  const c: Vec2 = { x: Math.max(a.x, b.x) + 40, y: (a.y + b.y) / 2 - 20 };
  // 描线进度：按二次贝塞尔参数截断
  const steps = 24;
  const k = Math.max(0, Math.min(1, p));
  const pt = (t: number) => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  g.beginPath();
  g.strokeStyle = 'rgba(226,74,58,.92)';
  g.lineWidth = 4;
  g.moveTo(a.x, a.y);
  for (let i = 1; i <= steps * k; i++) {
    const q = pt(i / steps);
    g.lineTo(q.x, q.y);
  }
  g.stroke();
  if (k >= 1 && g.fill && g.closePath) {
    const q = pt(0.92);
    const ang = Math.atan2(b.y - q.y, b.x - q.x);
    g.beginPath();
    g.fillStyle = 'rgba(226,74,58,.95)';
    g.moveTo(b.x, b.y);
    g.lineTo(b.x - 14 * Math.cos(ang - 0.45), b.y - 14 * Math.sin(ang - 0.45));
    g.lineTo(b.x - 14 * Math.cos(ang + 0.45), b.y - 14 * Math.sin(ang + 0.45));
    g.closePath();
    g.fill();
  }
}

function drawCard(s: Surface, c: CardInst, r: Rect, sel: boolean) {
  const g = s.ctx;
  const d = def(c);
  // 合法态：金色外圈 2px + 光（选中更亮）
  g.fillStyle = sel ? 'rgba(255,214,120,.55)' : 'rgba(217,180,106,.28)';
  g.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  g.fillStyle = d.shan ? '#2c4a5c' : d.tao ? '#3b5a3a' : '#7a2418';
  g.fillRect(r.x, r.y, r.w, r.h);
  frame(g, r, sel ? '#ffe2a0' : C.gold, 2);
  const red = c.suit === 'H' || c.suit === 'D';
  const nf = numFont();
  // 花色在左：点数（数字字体）+ 花色（矢量图标）
  const rk = RANK_CH[c.rank] ?? String(c.rank);
  nf.draw(g, rk, r.x + 6, r.y + 40, 14, red ? '#ff8a80' : C.paper);
  icons().draw(g, `suit_${c.suit}`, { x: r.x + 6, y: r.y + 44, w: 13, h: 13 }, red ? '#ff8a80' : C.paper);
  // 费用珠
  g.fillStyle = C.jade;
  g.fillRect(r.x + 4, r.y + 4, 18, 18);
  const cs = String(d.cost);
  nf.draw(g, cs, r.x + 13 - nf.measure(g, cs, 13) / 2, r.y + 18, 13, C.paper);
  textCenter(g, d.name, r.x + r.w / 2, r.y + r.h - 14, CARD_FONT(), C.paper, 22);
}

/** 响应窗遮罩：随弹出动画淡入（由引擎全屏绘制） */
export function responseScrim(st: Pick<ResponseState, 'intro'>): Scrim {
  return { color: C.mask, alpha: Math.min(1, st.intro * 1.25) };
}

export function drawResponse(s: Surface, lay: ResponseLayout, st: ResponseState) {
  const g = s.ctx;
  const geo = responseGeometry(lay, st);
  if (lay.attacker) drawArrow(s, lay.attacker, lay.hero, st.intro);
  for (const it of geo.cards) if (it.legal) drawCard(s, it.card, it.rect, it.card === st.selected);
  // 横幅
  const b = geo.banner;
  g.fillStyle = 'rgba(26,8,6,.92)';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = C.gold;
  g.fillRect(b.x, b.y, b.w, 1.5);
  g.fillRect(b.x, b.y + b.h - 1.5, b.w, 1.5);
  g.font = TITLE_FONT();
  text(g, st.info.title, b.x + 16, b.y + 37, TITLE_FONT(), C.paper);
  if (st.info.dmg) {
    // 伤害：杀印章 + 数字（不用 ⚔ 字符）
    const x0 = b.x + 16 + textWidth(g, st.info.title, 24) + 10;
    icons().draw(g, 'sha', { x: x0, y: b.y + 18, w: 20, h: 20 });
    numFont().draw(g, String(st.info.dmg), x0 + 24, b.y + 36, 20, '#f0c0b0');
  }
  if (st.info.attacker) {
    g.font = BODY_FONT();
    text(g, st.info.attacker, b.x + b.w - 14 - textWidth(g, st.info.attacker, 13), b.y + 22, BODY_FONT(), 'rgba(243,235,216,.6)');
  }
  drawCountdown(s, geo, st);
  // 按钮：确定（选中合法牌后可用）/ 承受
  const ok = geo.ok;
  g.fillStyle = st.selected ? C.jade : 'rgba(47,107,79,.35)';
  g.fillRect(ok.x, ok.y, ok.w, ok.h);
  frame(g, ok, C.gold, 1.5);
  textCenter(g, '确定', ok.x + ok.w / 2, ok.y + 30, TITLE_FONT(), st.selected ? C.paper : 'rgba(243,235,216,.45)', 24);
  const tk = geo.take;
  g.fillStyle = '#3a1712';
  g.fillRect(tk.x, tk.y, tk.w, tk.h);
  frame(g, tk, C.gold, 1.5);
  if (st.info.dmg) {
    // 承受：体力印（矢量）+ −N（数字字体），整体居中
    const nf = numFont();
    const lab = `−${st.info.dmg}`;
    const w = 18 + 4 + nf.measure(g, lab, 18);
    const x0 = tk.x + (tk.w - w) / 2;
    icons().draw(g, 'ui_hp', { x: x0, y: tk.y + 13, w: 18, h: 18 });
    nf.draw(g, lab, x0 + 22, tk.y + 29, 18, '#f0c0b0');
  } else textCenter(g, st.req.pass, tk.x + tk.w / 2, tk.y + 29, TITLE_FONT(), '#f0c0b0', 24);
}

/** 倒计时区（不透明底）：进度条 + 秒数。倒计时期间只重绘这一小块 */
export function countdownRect(geo: ReturnType<typeof responseGeometry>): Rect {
  const bar = geo.bar;
  return { x: bar.x - 2, y: bar.y - 5, w: bar.w + 4, h: bar.h + 10 };
}
function drawCountdown(s: Surface, geo: ReturnType<typeof responseGeometry>, st: ResponseState) {
  const g = s.ctx;
  const r = countdownRect(geo);
  g.fillStyle = COUNTDOWN_BG;
  g.fillRect(r.x, r.y, r.w, r.h);
  // 秒数放在倒计时块右端（块不越出横幅，不压主将牌）
  const bar = { ...geo.bar, w: geo.bar.w - 24 };
  g.fillStyle = 'rgba(243,235,216,.15)';
  g.fillRect(bar.x, bar.y, bar.w, bar.h);
  if (!Number.isFinite(st.total)) return;
  const k = Math.max(0, st.left / st.total);
  g.fillStyle = k < 0.3 ? C.cinnabar : '#e0a060';
  g.fillRect(bar.x, bar.y, bar.w * k, bar.h);
  const sec = Math.ceil(st.left / 1000);
  numFont().draw(g, String(sec), bar.x + bar.w + 6, bar.y + 8, 13, C.paper);
}
/** 倒计时区底色：遮罩叠在场景上的近似色（不透明，便于局部重绘不叠加） */
export const COUNTDOWN_BG = '#140806';

/** 处理手势；返回 'ok'|'take'|'select'|null */
export function responseTap(lay: ResponseLayout, st: ResponseState, at: Vec2): 'ok' | 'take' | 'select' | null {
  const geo = responseGeometry(lay, st);
  if (inside(geo.take, at)) return 'take';
  if (inside(geo.ok, at)) return st.selected ? 'ok' : null;
  // 后画的牌在上：倒序命中
  for (const it of [...geo.cards].reverse())
    if (it.legal && inside(it.rect, at)) {
      st.selected = st.selected === it.card ? null : it.card;
      return 'select';
    }
  return null;
}

/**
 * 打开响应弹窗，返回玩家选择（牌或 null）。
 * 无合法牌 / 自动出闪的情况在 respond() 中处理，不弹窗。
 */
export function openResponse(stack: OverlayStack, req: ResponseRequest, o: ResponseOptions): { handle: OverlayHandle<CardInst | null>; state: ResponseState } {
  const total = req.timed ? (o.seconds ?? RESPONSE.defaultSeconds) * 1000 : Infinity;
  const st: ResponseState = { req, info: parseRequest(req.text), selected: null, left: total, total, intro: 0 };
  const handle = stack.push<CardInst | null>({
    id: 'response',
    kind: 'response',
    modal: true,
    dismissOnTapOutside: false,
    scrim: () => responseScrim(st),
    // 弹出动画（250ms）整层重绘；之后倒计时只局部重绘（秒数或进度条像素变化时）
    animating: () => (st.intro < 1 ? true : Number.isFinite(st.left) && st.left > 0 ? 'tick' : false),
    update: (dt) => {
      const step = Math.min(dt, 100); // 卡顿/切后台回来时不一次扣光
      if (o.paused?.()) return;
      st.intro = Math.min(1, st.intro + step / 250);
      if (Number.isFinite(st.left)) {
        st.left -= step;
        if (st.left <= 0) {
          st.left = 0;
          queueMicrotask(() => handle.close(null)); // 超时自动承受
        }
      }
    },
    tick: (s) => drawCountdown(s, responseGeometry(o.layout(), st), st),
    draw: (s) => drawResponse(s, o.layout(), st),
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true; // 响应期间只接受点按，长按等一律吞掉
      const r = responseTap(o.layout(), st, e.at);
      if (r === 'ok') h.close(st.selected);
      else if (r === 'take') h.close(null);
      return true;
    },
  });
  return { handle, state: st };
}

/** 无合法牌时的 0.6s 横幅（toast，不吞输入） */
export function toastNoLegal(stack: OverlayStack, label: string, at: () => Rect): Promise<void> {
  let t = 0;
  const h = stack.push({
    id: 'toast:no-legal',
    kind: 'toast',
    modal: false,
    animating: () => t < RESPONSE.noLegalMs,
    update: (dt) => {
      t += Math.min(dt, 100);
      if (t >= RESPONSE.noLegalMs) queueMicrotask(() => h.close());
    },
    draw: (s) => {
      const r = at();
      s.ctx.globalAlpha = Math.max(0, Math.min(1, (RESPONSE.noLegalMs - t) / 150));
      s.ctx.fillStyle = 'rgba(26,8,6,.9)';
      s.ctx.fillRect(r.x, r.y, r.w, r.h);
      text(s.ctx, label, r.x + 16, r.y + r.h / 2 + 8, TITLE_FONT(), C.paper);
      s.ctx.globalAlpha = 1;
    },
  });
  return h.result.then(() => undefined);
}

/**
 * 生成 BattleIO.respond：core 的决策点 → 弹窗 → Promise 返回选择。
 * 用法：`io.respond = makeRespond(engine.overlays, () => game.hand, opts)`
 */
export function makeRespond(stack: OverlayStack, hand: () => CardInst[], o: ResponseOptions): BattleIO['respond'] {
  return async (text, legal, pass, timed) => {
    const cards = hand();
    const ok = cards.filter(legal);
    const info = parseRequest(text);
    if (!ok.length) {
      if (info.kind === 'shan') {
        const hero = o.layout().hero;
        await toastNoLegal(stack, '无闪可出', () => ({
          x: Math.max(8, hero.x - RESPONSE.bannerW - 8),
          y: hero.y + 4,
          w: RESPONSE.bannerW,
          h: RESPONSE.bannerH,
        }));
      }
      return null;
    }
    if (o.autoShan && info.kind === 'shan' && ok.length === 1) return ok[0];
    const { handle } = openResponse(stack, { text, legal, pass, timed, hand: cards }, o);
    return (await handle.result) ?? null;
  };
}
