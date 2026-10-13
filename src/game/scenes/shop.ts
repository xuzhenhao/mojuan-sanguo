/**
 * P4 集市 shop（#45；flow.md §3.10，render-spec §8.4，设计稿 v3/shop.html）。
 * - 卡牌行 + 货架（宝物 / 丹药 / 删牌服务）；价签买不起变红、已售灰、丹药满时丹药价签灰。
 * - 点商品弹购买确认（大图 + 详情 + 购买）；买不起抖动 + toast；丹药满 toast「丹药已满」。
 * - 删牌服务：打开牌组选择（删后不足 8 张或无杀类的牌不可选），每次进店限 1 次。
 * - 刷新：H5 每局首次免费，之后 25 铜钱（铜钱不足 disabled）；刷新后已售格也补货，不重置删牌。
 * - 长按商品看详情。数值见 src/data/economy.ts。
 */
import type { Rng } from '../../core/rng';
import { def } from '../../core/rules';
import type { CardInst } from '../../core/types';
import type { GestureEvent } from '../../engine/input';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { inside } from '../overlays/theme';
import { cardDetail, LongPressDetail, type DetailContent } from '../overlays/detail';
import { canRemove, type Inventory } from '../economy/inventory';
import { relicDef } from '../economy/pools';
import { buy, canBuy, canUseRemove, openShop, refreshCost, refreshShop, removePrice, removeService, type ShopItem, type ShopState } from '../economy/shop';
import {
  BAR_H,
  blit,
  BRUSH,
  CARD_H,
  CARD_W,
  circle,
  coin,
  confirm,
  costBead,
  drawBackdrop,
  drawBottomBar,
  drawButton,
  drawTag,
  frame3,
  gourd,
  gx,
  hitButton,
  label,
  paintCard,
  paintMedal,
  SANS,
  stroke,
  T,
  toast,
  vgrad,
  type Button,
  type Env,
} from './p4-kit';
import { potionDetail, relicDetail } from './reward';

export interface ShopEnv extends Env {
  inventory(): Inventory;
  rng(): Rng;
  /** 离开：发出 shop_done */
  done(): void;
}
export interface ShopParams {
  /** 已生成的货架（断线重进恢复，不重新随机） */
  state?: ShopState;
}

type Slot = { kind: 'card'; i: number } | { kind: 'good'; i: number } | { kind: 'remove' };

export class ShopScene implements Scene<ShopParams | undefined> {
  readonly id = 'shop';
  readonly atlasScene = 'shop';
  ctx!: SceneContext;
  st!: ShopState;
  private lp!: LongPressDetail;
  /** 抖动：槽位 key → 剩余 ms */
  shake = new Map<string, number>();
  constructor(private env: ShopEnv) {}

  get inv() {
    return this.env.inventory();
  }
  enter(ctx: SceneContext, p?: ShopParams) {
    this.ctx = ctx;
    this.st = p?.state ?? openShop(this.env.rng(), this.inv);
    this.lp = new LongPressDetail(this.env.overlays, (at) => this.detailAt(at), {
      safe: this.env.safe,
      measure: this.env.measure,
      invalidate: () => ctx.invalidate('main'),
    });
  }
  exit() {
    this.env.overlays.closeAll('detail');
    this.env.overlays.closeAll('popup');
    this.env.overlays.closeAll('toast');
  }
  update(dt: number) {
    if (!this.shake.size) return;
    for (const [k, v] of this.shake) {
      if (v - dt <= 0) this.shake.delete(k);
      else this.shake.set(k, v - dt);
    }
    this.ctx.invalidate('main');
  }
  animating() {
    return this.shake.size > 0 || this.lp?.progress > 0;
  }

  // ---------- 布局 ----------
  cardRect(i: number): Rect {
    return { x: 22 + i * 121, y: 244, w: CARD_W, h: CARD_H };
  }
  /** 货架第 i 格圆心（宝物、丹药…，最后一格为删牌服务） */
  goodCenter(i: number, n: number): Vec2 {
    const gap = 360 / n;
    return { x: 15 + gap * (i + 0.5), y: 502 };
  }
  goodRect(i: number, n: number): Rect {
    const c = this.goodCenter(i, n);
    return { x: c.x - 36, y: c.y - 36, w: 72, h: 72 };
  }
  get nGoods() {
    return this.st.goods.length + 1;
  }
  slots(): { slot: Slot; rect: Rect }[] {
    return [
      ...this.st.cards.map((_, i) => ({ slot: { kind: 'card', i } as Slot, rect: this.cardRect(i) })),
      ...this.st.goods.map((_, i) => ({ slot: { kind: 'good', i } as Slot, rect: this.goodRect(i, this.nGoods) })),
      { slot: { kind: 'remove' } as Slot, rect: this.goodRect(this.nGoods - 1, this.nGoods) },
    ];
  }
  slotAt(p: Vec2): Slot | null {
    return this.slots().find((s) => inside(s.rect, p))?.slot ?? null;
  }
  item(s: Slot): ShopItem | null {
    return s.kind === 'card' ? this.st.cards[s.i] : s.kind === 'good' ? this.st.goods[s.i] : null;
  }
  buttons(): Button[] {
    const cost = refreshCost(this.inv);
    return [
      {
        id: 'refresh',
        rect: { x: this.ctx.width / 2 - 60, y: 636, w: 120, h: 40 },
        text: cost ? `↻ ${cost}` : '↻ 免费刷新',
        kind: 'secondary',
        disabled: this.inv.gold < cost,
        font: BRUSH(17),
      },
      { id: 'leave', rect: { x: this.ctx.width - 75, y: this.ctx.height - BAR_H + 7, w: 65, h: 40 }, text: '离开', kind: 'primary', font: BRUSH(17) },
    ];
  }

  detailAt(at: Vec2): DetailContent | null {
    const s = this.slotAt(at);
    if (!s) return null;
    if (s.kind === 'remove')
      return {
        title: '删牌服务',
        sub: `${removePrice(this.inv)} 铜钱 · 每次进店限 1 次`,
        lines: ['删除牌组 1 张牌（删后至少 8 张，且至少保留 1 张杀类）。本局每用一次 +25。'],
      };
    return itemDetail(this.item(s)!);
  }

  // ---------- 交互 ----------
  gesture(e: GestureEvent) {
    if (this.lp.gesture(e)) return true;
    if (e.type !== 'tap') return false;
    const s = this.slotAt(e.at);
    if (s) {
      void this.tapSlot(s);
      return true;
    }
    const b = hitButton(this.buttons(), e.at);
    if (!b) return false;
    if (b.id === 'refresh' && refreshShop(this.env.rng(), this.inv, this.st)) this.ctx.invalidate('main');
    if (b.id === 'leave') this.env.done();
    return true;
  }

  private nope(key: string, msg: string) {
    this.shake.set(key, 300);
    toast(this.env.overlays, msg, this.ctx.width, 150);
    this.ctx.invalidate('main');
  }

  async tapSlot(s: Slot) {
    const key = slotKey(s);
    if (s.kind === 'remove') {
      if (this.st.removeDone) return;
      if (this.inv.gold < removePrice(this.inv)) return this.nope(key, '铜钱不足');
      if (!canUseRemove(this.inv, this.st)) return this.nope(key, '牌组已无可删的牌');
      const uid = await pickDeckCard(this.env, this.ctx.width, this.ctx.height, this.inv, `删牌 · ${removePrice(this.inv)} 铜钱`).result;
      if (uid !== undefined && removeService(this.inv, this.st, uid)) this.st.dialog = '旧稿已焚';
      this.ctx.invalidate('main');
      return;
    }
    const it = this.item(s)!;
    const r = canBuy(this.inv, it);
    if (r === 'sold') return;
    if (r === 'potion_full') return this.nope(key, '丹药已满');
    if (r === 'gold') return this.nope(key, '铜钱不足');
    const d = itemDetail(it);
    const ok = await confirm(this.env.overlays, this.ctx.width, this.ctx.height, {
      title: d.title,
      lines: [d.sub ?? '', ...d.lines],
      ok: `购买 ${it.price}`,
      bodyH: it.type === 'card' ? CARD_H : 90,
      body: (c, rr) => {
        if (it.type === 'card') {
          const g = gx(c);
          g.save?.();
          g.translate?.(rr.x + (rr.w - CARD_W) / 2, rr.y);
          paintCard(c, it);
          g.restore?.();
        } else if (it.type === 'relic') paintMedal(c, rr.x + rr.w / 2, rr.y + 45, 84, relicDef(it.id).name.slice(0, 1), relicDef(it.id).rarity);
        else {
          circle(c, rr.x + rr.w / 2, rr.y + 45, 42, T.lac1, T.goldMid, 2);
          gourd(c, rr.x + rr.w / 2, rr.y + 45, 2.2);
        }
      },
    }).result;
    if (ok && buy(this.inv, this.st, it) === 'ok') this.ctx.invalidate('main');
  }

  // ---------- 绘制 ----------
  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      drawBackdrop(c, w, h);
      drawAwning(c, 14, 48, 362);
      drawMerchant(c, 40, 100);
      // 货架横梁
      for (const y of [445, 597]) {
        vgrad(c, { x: 10, y, w: w - 20, h: 9 }, T.goldMid, T.goldDk);
        c.fillStyle = T.goldHi;
        c.fillRect(10, y, w - 20, 1);
      }
      return;
    }
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    drawTag(c, '集市');
    // 对白
    const dr = { x: 147, y: 115, w: 143, h: 47 };
    vgrad(c, dr, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, dr, T.goldMid);
    label(c, this.st.dialog, dr.x + dr.w / 2, dr.y + 31, BRUSH(20), T.paper, 'center');
    // 铜钱
    coin(c, 318, 211, 10);
    label(c, String(this.inv.gold), 337, 219, SANS(21), T.paper);
    this.st.cards.forEach((it, i) => this.drawCardSlot(s, it, i));
    this.st.goods.forEach((it, i) => this.drawGood(s, it, i));
    this.drawRemove(s);
    drawBottomBar(c, w, h, this.inv.deck.length);
    for (const b of this.buttons()) drawButton(c, b);
    this.lp.draw(s);
  }

  private dx(key: string) {
    const v = this.shake.get(key);
    return v ? Math.sin(v / 20) * 4 : 0;
  }

  private priceTag(c: Surface['ctx'], cx: number, y: number, it: { price: number; sold?: boolean }, state: 'ok' | 'gold' | 'potion_full' | 'sold') {
    const r = { x: cx - 25, y, w: 50, h: 22 };
    const ga = c.globalAlpha;
    if (state === 'sold' || state === 'potion_full') c.globalAlpha = ga * 0.45;
    c.fillStyle = T.lac1;
    c.fillRect(r.x, r.y, r.w, r.h);
    stroke(c, r, T.goldLo, 1);
    coin(c, r.x + 11, r.y + 11, 6);
    label(c, state === 'sold' ? '已售' : String(it.price), r.x + 32, r.y + 16, SANS(13), state === 'gold' ? T.cinnHi : T.paper, 'center');
    c.globalAlpha = ga;
  }

  private drawCardSlot(s: Surface, it: ShopItem, i: number) {
    if (it.type !== 'card') return;
    const c = s.ctx;
    const st = canBuy(this.inv, it);
    const r0 = this.cardRect(i);
    const r = { ...r0, x: r0.x + this.dx(`card${i}`) };
    const ga = c.globalAlpha;
    if (it.sold) c.globalAlpha = ga * 0.3;
    blit(s, this.env, 'shop', `card:${it.id}:${it.suit}${it.rank}`, 'bigcard', r, (g) => paintCard(g, it), { w: CARD_W, h: CARD_H });
    costBead(c, r.x + 14, r.y + 8, def({ uid: 0, id: it.id, suit: it.suit, rank: it.rank, mods: [] }).cost);
    c.globalAlpha = ga;
    this.priceTag(c, r0.x + r0.w / 2, 401, it, st);
  }

  private drawGood(s: Surface, it: ShopItem, i: number) {
    const c = s.ctx;
    const p0 = this.goodCenter(i, this.nGoods);
    const p = { x: p0.x + this.dx(`good${i}`), y: p0.y };
    const st = canBuy(this.inv, it);
    const ga = c.globalAlpha;
    if (it.sold || st === 'potion_full') c.globalAlpha = ga * 0.35;
    if (it.type === 'relic') {
      const d = relicDef(it.id);
      blit(s, this.env, 'shop', `relic:${it.id}`, 'badge', { x: p.x - 36, y: p.y - 36, w: 72, h: 72 }, (g) =>
        paintMedal(g, 36, 36, 68, d.name.slice(0, 1), d.rarity),
      );
    } else if (it.type === 'potion') {
      circle(c, p.x, p.y, 34, T.lac1, T.goldMid, 2);
      gourd(c, p.x, p.y, 1.8);
    }
    c.globalAlpha = ga;
    this.priceTag(c, p0.x, 541, it, st);
  }

  private drawRemove(s: Surface) {
    const c = s.ctx;
    const n = this.nGoods;
    const p0 = this.goodCenter(n - 1, n);
    const p = { x: p0.x + this.dx('remove'), y: p0.y };
    const done = this.st.removeDone;
    const ga = c.globalAlpha;
    if (done) c.globalAlpha = ga * 0.35;
    circle(c, p.x, p.y, 34, '#6E2418', T.goldMid, 2);
    // 纸篓
    c.fillStyle = T.paper;
    c.fillRect(p.x - 11, p.y - 9, 22, 22);
    c.fillRect(p.x - 14, p.y - 14, 28, 4);
    c.globalAlpha = ga;
    const price = removePrice(this.inv);
    this.priceTag(c, p0.x, 541, { price }, done ? 'sold' : this.inv.gold < price ? 'gold' : 'ok');
  }
}

const slotKey = (s: Slot) => (s.kind === 'remove' ? 'remove' : `${s.kind}${s.i}`);

export function itemDetail(it: ShopItem): DetailContent {
  if (it.type === 'card') return cardDetail({ uid: 0, id: it.id, suit: it.suit, rank: it.rank, mods: [] });
  return it.type === 'relic' ? relicDetail(it.id) : potionDetail(it.id);
}

/** 店招布幔：朱砂锯齿 */
export function drawAwning(c: Surface['ctx'], x: number, y: number, w: number) {
  const g = gx(c);
  c.fillStyle = '#B5473A';
  c.fillRect(x, y, w, 22);
  const n = 12;
  const step = w / n;
  if (g.beginPath && g.moveTo && g.lineTo && g.fill) {
    g.beginPath();
    g.moveTo(x, y + 22);
    for (let i = 0; i < n; i++) {
      g.lineTo(x + step * (i + 0.5), y + 34);
      g.lineTo(x + step * (i + 1), y + 22);
    }
    g.closePath?.();
    g.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < n; i += 2) c.fillRect(x + step * i, y, step, 22);
}

/** 商人剪影（占位：正式美术进 scene_misc 图集） */
export function drawMerchant(c: Surface['ctx'], x: number, y: number) {
  c.fillStyle = 'rgba(10,6,4,.55)';
  circle(c, x + 50, y + 22, 16, 'rgba(10,6,4,.55)');
  c.fillRect(x + 28, y + 2, 44, 6);
  const g = gx(c);
  if (g.beginPath && g.moveTo && g.lineTo && g.fill) {
    g.beginPath();
    g.moveTo(x + 50, y + 36);
    g.lineTo(x + 92, y + 130);
    g.lineTo(x + 8, y + 130);
    g.closePath?.();
    g.fill();
  }
  // 折扇
  c.fillStyle = 'rgba(243,235,216,.55)';
  if (g.beginPath && g.arc && g.fill) {
    g.beginPath();
    g.moveTo?.(x + 66, y + 70);
    g.arc(x + 66, y + 70, 36, -0.9, 0.3);
    g.closePath?.();
    g.fill();
  }
}

export interface DeckPickOpts {
  /** 可选判定（默认集市删牌规则 canRemove） */
  ok?(c: CardInst): boolean;
  /** 标题下的规则提示 */
  hint?: string;
  /** 点可选牌后的二次确认（默认焚稿确认）；null = 不确认，直接返回 */
  confirm?: { title: string; line(c: CardInst): string; ok: string } | null;
  /** 点置灰牌时的 toast（不填则无反馈） */
  reject?(c: CardInst): string | null;
  /** 卡右上角金签（如淬炼满词条「可替换」，render-spec §8.7） */
  tag?(c: CardInst): string | null;
}
const BURN_CONFIRM = { title: '焚稿', line: (c: CardInst) => `删除「${def(c).name}」？`, ok: '删除' };

/** 牌组选择（删牌 / 淬炼）：不可选的牌置灰；结果为 uid，取消为 undefined */
export function pickDeckCard(env: Env, w: number, h: number, inv: Inventory, title: string, o: DeckPickOpts = {}) {
  const cols = 5;
  const cw = 64;
  const ch = 92;
  const gap = 8;
  const x0 = (w - (cols * cw + (cols - 1) * gap)) / 2;
  const y0 = 150;
  const rect = (i: number): Rect => ({ x: x0 + (i % cols) * (cw + gap), y: y0 + Math.floor(i / cols) * (ch + gap), w: cw, h: ch });
  const cancel: Button = { id: 'cancel', rect: { x: w / 2 - 50, y: h - BAR_H - 56, w: 100, h: 42 }, text: '取消', kind: 'secondary', font: BRUSH(17) };
  const deck = [...inv.deck];
  const ok = o.ok ?? ((c: CardInst) => canRemove(inv, c.uid));
  const hint = o.hint ?? '删后至少 8 张，且至少保留 1 张杀类';
  const cf = o.confirm === undefined ? BURN_CONFIRM : o.confirm;
  return env.overlays.push<number>({
    id: 'deck-pick',
    kind: 'popup',
    scrim: { color: 'rgba(5,2,1,.88)' },
    draw: (s) => {
      const c = s.ctx;
      label(c, title, w / 2, 110, BRUSH(24), T.gold, 'center');
      label(c, hint, w / 2, 134, SANS(12), T.paper3, 'center');
      deck.forEach((card, i) => {
        const r = rect(i);
        const ga = c.globalAlpha;
        if (!ok(card)) c.globalAlpha = ga * 0.35;
        const g = gx(c);
        g.save?.();
        g.translate?.(r.x, r.y);
        g.scale?.(cw / CARD_W, ch / CARD_H);
        paintCard(c, card);
        g.restore?.();
        c.globalAlpha = ga;
        if (card.mods.length) label(c, '◆'.repeat(card.mods.length), r.x + r.w - 4, r.y + r.h - 4, SANS(10), T.gold, 'right');
        const tg = ok(card) ? o.tag?.(card) : null;
        if (tg) {
          c.fillStyle = T.gold;
          c.fillRect(r.x + r.w - 40, r.y - 6, 42, 16);
          label(c, tg, r.x + r.w - 19, r.y + 6, BRUSH(11), T.lac1, 'center');
        }
      });
      drawButton(c, cancel);
    },
    gesture: (e, hd) => {
      if (e.type === 'longpress') {
        const i = deck.findIndex((_, k) => inside(rect(k), e.at));
        if (i >= 0) toast(env.overlays, `${def(deck[i]).name}：${def(deck[i]).desc}`.slice(0, 22), w, 80);
        return true;
      }
      if (e.type !== 'tap') return true;
      const i = deck.findIndex((_, k) => inside(rect(k), e.at));
      if (i >= 0 && ok(deck[i])) {
        const card = deck[i];
        if (!cf) hd.close(card.uid);
        else
          void confirm(env.overlays, w, h, { title: cf.title, lines: [cf.line(card)], ok: cf.ok, okKind: 'primary' }).result.then(
            (y) => y && hd.close(card.uid),
          );
      } else if (i >= 0) {
        const m = o.reject?.(deck[i]);
        if (m) toast(env.overlays, m, w, 80);
      } else if (inside(cancel.rect, e.at)) hd.close(undefined);
      return true;
    },
  });
}
