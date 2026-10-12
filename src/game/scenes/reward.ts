/**
 * P4 奖励页 reward（#45；flow.md §3.7，render-spec §8.3，设计稿 v3/reward.html）。
 * - 进入：大印“胜”落下 600ms → 战利品胶囊依次弹出（120ms）→ 3 张大牌依次翻开（间隔 100ms，每张 300ms）；翻牌中不可点。
 * - 铜钱、丹药进入时自动入账；丹药栏满时弹“丹药已满”层（替换 / 放弃）。
 * - 点牌选中（上浮）；再点同一张或「收入」入卷；「略过」二次确认；「免费刷新（本局 1 次）」只换卡牌。
 * - 精英：宝物条点击领取（独立于选卡）；Boss：宝物条打开三选一。
 * - 长按牌 / 宝物 / 丹药看详情（复用 overlays/detail）。
 * 规则只读 core 与 src/data；数值见 src/data/economy.ts。
 */
import type { Rng } from '../../core/rng';
import { seeded } from '../../core/rng';
import { def } from '../../core/rules';
import { ECONOMY, type BattleKind } from '../../data/economy';
import type { GestureEvent } from '../../engine/input';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { inside } from '../overlays/theme';
import { cardDetail, LongPressDetail, openDetail, type DetailContent } from '../overlays/detail';
import { potionCount, type Inventory } from '../economy/inventory';
import { potionDef, relicDef } from '../economy/pools';
import { canRefresh, enterReward, refreshReward, resolvePotion, rollReward, takeCard, takeRelic, type RewardOffer, type RewardState } from '../economy/reward';
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
  drawChest,
  drawTag,
  frame3,
  gourd,
  gx,
  hitButton,
  label,
  paintCard,
  paintMedal,
  pill,
  RARITY_COLOR,
  SANS,
  stroke,
  T,
  vgrad,
  type Button,
  type Env,
} from './p4-kit';

export interface RewardEnv extends Env {
  /** 局内背包（来自 RunSession；直入时为演示背包） */
  inventory(): Inventory;
  rng(): Rng;
  /** 完成：发出 reward_done */
  done(): void;
  /** 未传 params 时的战斗类型（直入 ?reward=elite 等） */
  defaultKind?: BattleKind;
}
export interface RewardParams {
  kind?: BattleKind;
  /** 已生成的候选（断线重进恢复，不重新随机；或宝箱铜钱分支传入） */
  offer?: RewardOffer;
  /** 顶签文字 */
  tag?: string;
  /** 宝箱铜钱分支：不显示“胜”大印 */
  fromChest?: boolean;
}

export const REWARD_ANIM = { seal: 600, pillGap: 120, flipGap: 100, flip: 300 } as const;

export const RELIC_GLYPH = (id: string) => relicDef(id).name.slice(0, 1);

export class RewardScene implements Scene<RewardParams | undefined> {
  readonly id: string = 'reward';
  readonly atlasScene: string = 'reward';
  ctx!: SceneContext;
  st!: RewardState;
  selected = -1;
  t = 0;
  tag = '第一章 · 黄巾';
  fromChest = false;
  private lp!: LongPressDetail;
  private finished = false;
  constructor(protected env: RewardEnv) {}

  get inv() {
    return this.env.inventory();
  }

  enter(ctx: SceneContext, p?: RewardParams) {
    this.ctx = ctx;
    const kind = p?.kind ?? this.env.defaultKind ?? 'normal';
    const offer = p?.offer ?? rollReward(this.env.rng(), this.inv, kind);
    this.st = enterReward(this.inv, offer);
    this.fromChest = !!p?.fromChest;
    this.tag = p?.tag ?? `第${['一', '二', '三'][Math.min(3, this.inv.chapter) - 1]}章 · 黄巾`;
    this.t = this.fromChest ? REWARD_ANIM.seal : 0;
    this.selected = -1;
    this.finished = false;
    this.lp = new LongPressDetail(this.env.overlays, (at) => this.detailAt(at), {
      safe: this.env.safe,
      measure: this.env.measure,
      invalidate: () => ctx.invalidate('main'),
    });
  }
  exit() {
    this.env.overlays.closeAll('detail');
    this.env.overlays.closeAll('popup');
  }

  // ---------- 动画时间线 ----------
  get flipStart() {
    return REWARD_ANIM.seal + 2 * REWARD_ANIM.pillGap;
  }
  get animEnd() {
    return this.flipStart + 2 * REWARD_ANIM.flipGap + REWARD_ANIM.flip;
  }
  get flipping() {
    return this.t < this.animEnd;
  }
  /** 第 i 张牌翻开进度 0..1 */
  flipOf(i: number) {
    return Math.max(0, Math.min(1, (this.t - this.flipStart - i * REWARD_ANIM.flipGap) / REWARD_ANIM.flip));
  }
  update(dt: number) {
    if (this.t >= this.animEnd) return;
    const was = this.flipping;
    this.t += dt;
    this.ctx.invalidate('main');
    if (was && !this.flipping && this.st.potion === 'full') this.openPotionFull();
  }
  animating() {
    return this.flipping || this.lp?.progress > 0;
  }
  /** 跳过演出（点击）：直接到终态 */
  skipAnim() {
    this.update(this.animEnd - this.t);
  }

  // ---------- 布局（390×844 基准，按宽度居中） ----------
  get ox() {
    return (this.ctx.width - 390) / 2;
  }
  cardRect(i: number): Rect {
    const r = { x: this.ox + 25 + i * 118, y: 376, w: CARD_W, h: CARD_H };
    if (i === this.selected) r.y -= 10;
    return r;
  }
  goldPill(): Rect {
    return { x: this.ox + (this.st.offer.potion ? 95 : 150), y: 232, w: 90, h: 40 };
  }
  potionPill(): Rect {
    return { x: this.ox + 192, y: 232, w: 103, h: 40 };
  }
  relicBar(): Rect {
    return { x: this.ox + 40, y: 655, w: 310, h: 73 };
  }
  buttons(): Button[] {
    const h = this.ctx.height;
    const done = !!this.st.cardTaken || this.st.skipped;
    return [
      {
        id: 'refresh',
        rect: { x: this.ox + 55, y: 588, w: 210, h: 40 },
        text: `↻ 免费刷新（本局 ${ECONOMY.rewardFreeRefresh} 次）`,
        kind: 'secondary',
        disabled: !canRefresh(this.inv, this.st),
        font: BRUSH(15),
      },
      { id: 'skip', rect: { x: this.ox + 271, y: 588, w: 64, h: 40 }, text: '略过', kind: 'secondary', disabled: done, font: BRUSH(17) },
      {
        id: 'take',
        rect: { x: this.ctx.width - 75, y: h - BAR_H + 7, w: 65, h: 40 },
        text: '收入',
        kind: 'confirm',
        disabled: this.selected < 0 && !done,
        font: BRUSH(17),
      },
    ];
  }

  // ---------- 详情 ----------
  detailAt(at: Vec2): DetailContent | null {
    if (this.flipping) return null;
    for (let i = 0; i < this.st.offer.cards.length; i++) {
      if (inside(this.cardRect(i), at)) {
        const c = this.st.offer.cards[i];
        return cardDetail({ uid: 0, id: c.id, suit: c.suit, rank: c.rank, mods: [] });
      }
    }
    if (this.st.offer.relics.length && inside(this.relicBar(), at)) {
      const id = this.st.relicTaken ?? this.st.offer.relics[0];
      return this.st.offer.relicPick === 'choose' && !this.st.relicTaken
        ? { title: '宝物三选一', sub: 'Boss 奖励', lines: this.st.offer.relics.map((r) => `${relicDef(r).name}：${relicDef(r).desc}`) }
        : relicDetail(id);
    }
    if (this.st.offer.potion && inside(this.potionPill(), at)) return potionDetail(this.st.offer.potion);
    return null;
  }

  // ---------- 交互 ----------
  gesture(e: GestureEvent) {
    if (this.lp.gesture(e)) return true;
    if (e.type !== 'tap') return false;
    if (this.flipping) {
      this.skipAnim();
      return true;
    }
    const p = e.at;
    for (let i = 0; i < this.st.offer.cards.length; i++) {
      if (!inside(this.cardRect(i), p)) continue;
      if (this.st.cardTaken || this.st.skipped) return true;
      if (this.selected === i) this.collect();
      else this.selected = i;
      this.ctx.invalidate('main');
      return true;
    }
    if (this.st.offer.relics.length && inside(this.relicBar(), p)) {
      this.claimRelic();
      return true;
    }
    if (this.st.potion === 'full' && inside(this.potionPill(), p)) {
      this.openPotionFull();
      return true;
    }
    const b = hitButton(this.buttons(), p);
    if (!b) return false;
    if (b.id === 'refresh' && refreshReward(this.env.rng(), this.inv, this.st)) {
      this.selected = -1;
      this.t = this.flipStart; // 重新翻牌
    }
    if (b.id === 'skip') void this.askSkip();
    if (b.id === 'take') this.collect();
    this.ctx.invalidate('main');
    return true;
  }

  /** 收入：有选中则入卷，然后离开 */
  collect() {
    if (this.selected >= 0 && !this.st.cardTaken && !this.st.skipped) takeCard(this.inv, this.st, this.selected);
    if (!this.st.cardTaken && !this.st.skipped) return;
    this.finish();
  }
  async askSkip() {
    const ok = await confirm(this.env.overlays, this.ctx.width, this.ctx.height, { title: '略过', lines: ['放弃本次卡牌？'], ok: '放弃', okKind: 'primary' })
      .result;
    if (!ok) return;
    this.st.skipped = true;
    this.selected = -1;
    this.finish();
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.st.potion === 'full') resolvePotion(this.inv, this.st, null); // 离开视同放弃
    this.env.done();
  }

  claimRelic() {
    if (this.st.relicTaken) return;
    if (this.st.offer.relicPick === 'one') {
      takeRelic(this.inv, this.st, this.st.offer.relics[0]);
      this.ctx.invalidate('main');
      return;
    }
    openRelicChoice(this.env, this.ctx.width, this.ctx.height, this.st.offer.relics).result.then((id) => {
      if (id) takeRelic(this.inv, this.st, id);
      this.ctx.invalidate('main');
    });
  }

  openPotionFull() {
    if (this.env.overlays.ids().includes('potion-full')) return;
    const w = this.ctx.width;
    const h = this.ctx.height;
    const inv = this.inv;
    const st = this.st;
    const newId = st.offer.potion!;
    const r = { x: (w - 320) / 2, y: 250, w: 320, h: 300 };
    const slot = (i: number): Rect => ({ x: r.x + 24 + i * 96, y: r.y + 128, w: 80, h: 92 });
    const giveUp: Button = {
      id: 'giveup',
      rect: { x: r.x + (r.w - 120) / 2, y: r.y + r.h - 60, w: 120, h: 42 },
      text: '放弃新丹药',
      kind: 'secondary',
      font: BRUSH(16),
    };
    this.env.overlays
      .push<number | null>({
        id: 'potion-full',
        kind: 'popup',
        rect: r,
        draw: (s) => {
          const c = s.ctx;
          c.fillStyle = 'rgba(5,2,1,.72)';
          c.fillRect(0, 0, w, h);
          vgrad(c, r, 'rgba(42,20,16,.98)', 'rgba(15,7,5,.98)');
          frame3(c, r);
          label(c, '丹药已满', r.x + r.w / 2, r.y + 40, BRUSH(24), T.gold, 'center');
          label(c, `新得：${potionDef(newId).name}（${potionDef(newId).desc}）`, r.x + r.w / 2, r.y + 72, SANS(13), T.jadeHi, 'center');
          label(c, '选择替换哪一格，或放弃新丹药', r.x + r.w / 2, r.y + 100, SANS(13), T.paper, 'center');
          inv.potions.forEach((id, i) => {
            const q = slot(i);
            c.fillStyle = T.lac1;
            c.fillRect(q.x, q.y, q.w, q.h);
            stroke(c, q, T.goldMid, 1.5);
            gourd(c, q.x + q.w / 2, q.y + 32, 1.6);
            label(c, id ? potionDef(id).name : '空', q.x + q.w / 2, q.y + 72, SANS(13), T.paper, 'center');
          });
          drawButton(c, giveUp);
        },
        gesture: (e, hd) => {
          if (e.type !== 'tap') return true;
          for (let i = 0; i < inv.potions.length; i++) if (inside(slot(i), e.at)) hd.close(i);
          if (inside(giveUp.rect, e.at)) hd.close(null);
          return true;
        },
      })
      .result.then((v) => {
        if (v === undefined) return; // 关闭但未决定：仍保持 full，可再点胶囊
        resolvePotion(inv, st, v);
        this.ctx.invalidate('main');
      });
  }

  // ---------- 绘制 ----------
  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      drawBackdrop(c, w, h);
      if (!this.fromChest) drawRays(c, w / 2, 125, 230);
      return;
    }
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    drawTag(c, this.tag);
    if (!this.fromChest) this.drawSeal(s);
    else drawChest(c, w / 2, 150, 1);
    this.drawPills(s);
    label(c, '择 一 入 卷', w / 2, 340, BRUSH(21), T.gold, 'center');
    c.fillStyle = 'rgba(185,138,60,.55)';
    c.fillRect(this.ox + 110, 350, 170, 1);
    this.drawCards(s);
    for (const b of this.buttons()) if (b.id !== 'take') drawButton(c, b);
    if (this.st.offer.relics.length) this.drawRelicBar(s);
    drawBottomBar(c, w, h, this.inv.deck.length);
    drawButton(c, this.buttons()[2]);
    this.lp.draw(s);
  }

  private drawSeal(s: Surface) {
    const c = s.ctx;
    const g = gx(c);
    const k = Math.min(1, this.t / REWARD_ANIM.seal);
    const sc = 2 - k; // 2 → 1
    const ga = c.globalAlpha;
    c.globalAlpha = ga * Math.min(1, k * 1.6);
    const cx = this.ctx.width / 2;
    const cy = 125;
    if (g.save && g.translate && g.rotate && g.scale) {
      g.save();
      g.translate(cx, cy);
      g.rotate((-6 * Math.PI) / 180);
      g.scale(sc, sc);
      paintSeal(c, -55, -55);
      g.restore?.();
    } else paintSeal(c, cx - 55, cy - 55);
    c.globalAlpha = ga;
  }

  private drawPills(s: Surface) {
    const c = s.ctx;
    const vis = (i: number) => this.t >= REWARD_ANIM.seal + i * REWARD_ANIM.pillGap;
    if (vis(0)) pill(c, this.goldPill(), (x, y) => coin(c, x, y, 10), `+${this.st.offer.gold}`);
    if (this.st.offer.potion && vis(1)) {
      const full = this.st.potion === 'full';
      pill(
        c,
        this.potionPill(),
        (x, y) => gourd(c, x, y, 1, full ? T.dmg : T.jadeHi),
        full ? '已满' : '+1',
        `${potionCount(this.inv)}/${this.inv.potions.length}`,
        T.cinnHi,
      );
    }
  }

  private drawCards(s: Surface) {
    const c = s.ctx;
    this.st.offer.cards.forEach((f, i) => {
      const r = this.cardRect(i);
      const p = this.flipOf(i);
      // 翻牌：前半程牌背收窄，后半程牌面展开
      const k = Math.abs(Math.cos(p * Math.PI));
      const rr = { x: r.x + (r.w * (1 - k)) / 2, y: r.y, w: Math.max(1, r.w * k), h: r.h };
      if (p < 0.5) {
        c.fillStyle = T.lac3;
        c.fillRect(rr.x, rr.y, rr.w, rr.h);
        stroke(c, rr, T.goldMid, 2);
        if (rr.w > 40) label(c, '墨', rr.x + rr.w / 2, rr.y + rr.h / 2 + 12, BRUSH(36), T.goldLo, 'center');
        return;
      }
      const taken = this.st.cardTaken === f;
      const dim = (this.st.cardTaken && !taken) || this.st.skipped;
      const ga = c.globalAlpha;
      if (dim) c.globalAlpha = ga * 0.4;
      if (i === this.selected || taken) {
        // 选中：金光（半透明叠色，不用 shadowBlur）
        c.fillStyle = 'rgba(233,200,119,.28)';
        c.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
        stroke(c, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, T.goldHi, 2);
      }
      blit(s, this.env, 'reward', `card:${f.id}:${f.suit}${f.rank}`, 'bigcard', rr, (g) => paintCard(g, f), { w: CARD_W, h: CARD_H });
      if (k > 0.9) costBead(c, r.x + 14, r.y + 8, def({ uid: 0, id: f.id, suit: f.suit, rank: f.rank, mods: [] }).cost);
      c.globalAlpha = ga;
    });
  }

  private drawRelicBar(s: Surface) {
    const c = s.ctx;
    const r = this.relicBar();
    const taken = this.st.relicTaken;
    const choose = this.st.offer.relicPick === 'choose';
    const id = taken ?? this.st.offer.relics[0];
    const ga = c.globalAlpha;
    if (taken) c.globalAlpha = ga * 0.5;
    vgrad(c, r, 'rgba(42,20,16,.92)', 'rgba(15,7,5,.95)');
    frame3(c, r, T.goldMid);
    circle(c, r.x + 40, r.y + r.h / 2, 24, T.lac1, T.gold, 1.5);
    label(c, choose && !taken ? '宝' : RELIC_GLYPH(id), r.x + 40, r.y + r.h / 2 + 8, BRUSH(22), T.gold, 'center');
    label(c, choose && !taken ? '宝物 · 三选一' : relicDef(id).name, r.x + 76, r.y + r.h / 2 + 8, BRUSH(21), T.gold);
    label(c, taken ? '已领取' : choose ? '点击挑选' : '点击领取', r.x + r.w - 50, r.y + r.h / 2 + 5, SANS(12), T.paper3, 'right');
    if (!choose || taken) {
      const rar = relicDef(id).rarity;
      c.fillStyle = RARITY_COLOR[rar];
      c.fillRect(r.x + r.w - 32, r.y + r.h / 2 - 5, 10, 10);
    }
    c.globalAlpha = ga;
  }
}

/** 大印“胜”：110×110，朱砂 3 层描边（静态，可缓存） */
export function paintSeal(c: Surface['ctx'], x: number, y: number) {
  c.fillStyle = 'rgba(166,61,47,.25)';
  c.fillRect(x - 8, y - 8, 126, 126);
  vgrad(c, { x, y, w: 110, h: 110 }, T.cinnHi, '#8E2A1E');
  stroke(c, { x: x + 4, y: y + 4, w: 102, h: 102 }, T.paper, 2);
  stroke(c, { x, y, w: 110, h: 110 }, '#5E1A12', 1.5);
  label(c, '胜', x + 55, y + 78, BRUSH(66), T.paper, 'center');
}

/** 放射光（bg 层静态绘制；render-spec 允许 30fps 低频旋转，这里先静态，空闲不重绘） */
export function drawRays(c: Surface['ctx'], cx: number, cy: number, r: number) {
  const g = gx(c);
  if (!g.beginPath || !g.moveTo || !g.lineTo || !g.fill) return;
  c.fillStyle = 'rgba(233,200,119,.06)';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a - 0.05) * r, cy + Math.sin(a - 0.05) * r);
    g.lineTo(cx + Math.cos(a + 0.05) * r, cy + Math.sin(a + 0.05) * r);
    g.closePath?.();
    g.fill();
  }
}

export function relicDetail(id: string): DetailContent {
  const d = relicDef(id);
  return { title: d.name, sub: `宝物 · ${d.rarity === 'Boss' ? '首领' : d.rarity}`, lines: [d.desc] };
}
export function potionDetail(id: string): DetailContent {
  const d = potionDef(id);
  return { title: d.name, sub: '丹药 · 战斗内使用', lines: [d.desc] };
}

/** 宝物三选一浮层（Boss 奖励；布局同宝箱）：结果为所选宝物 id，略过为 undefined */
export function openRelicChoice(env: Env, w: number, h: number, ids: string[]) {
  let sel = -1;
  const col = (i: number): Rect => ({ x: (w - 370) / 2 + i * 125, y: 300, w: 120, h: 228 });
  const ok: Button = { id: 'ok', rect: { x: w - 75, y: h - BAR_H + 7, w: 65, h: 40 }, text: '收入', kind: 'confirm', font: BRUSH(17) };
  const skip: Button = { id: 'skip', rect: { x: w / 2 - 33, y: h - BAR_H + 7, w: 66, h: 40 }, text: '略过', kind: 'secondary', font: BRUSH(17) };
  return env.overlays.push<string>({
    id: 'relic-choice',
    kind: 'popup',
    draw: (s) => {
      const c = s.ctx;
      c.fillStyle = 'rgba(5,2,1,.8)';
      c.fillRect(0, 0, w, h);
      label(c, '择 一', w / 2, 270, BRUSH(22), T.gold, 'center');
      ids.forEach((id, i) => drawRelicColumn(c, col(i), id, i === sel));
      ok.disabled = sel < 0;
      drawButton(c, skip);
      drawButton(c, ok);
    },
    gesture: (e, hd) => {
      if (e.type === 'longpress') {
        const i = ids.findIndex((_, k) => inside(col(k), e.at));
        if (i >= 0) {
          // 详情浮层叠在三选一之上（同 z 后开在上）
          openDetail(env.overlays, relicDetail(ids[i]), e.at, env.safe(), env.measure());
        }
        return true;
      }
      if (e.type !== 'tap') return true;
      const i = ids.findIndex((_, k) => inside(col(k), e.at));
      if (i >= 0) {
        if (sel === i) hd.close(ids[i]);
        sel = i;
      } else if (!ok.disabled && inside(ok.rect, e.at)) hd.close(ids[sel]);
      else if (inside(skip.rect, e.at)) hd.close(undefined);
      return true;
    },
  });
}

/** 宝物竖条（宝箱 / Boss 三选一共用）：圆章 + 名 + 简述 */
export function drawRelicColumn(c: Surface['ctx'], r: Rect, id: string, selected: boolean) {
  const d = relicDef(id);
  vgrad(c, r, selected ? 'rgba(30,14,10,.98)' : 'rgba(21,10,8,.92)', 'rgba(10,4,3,.95)');
  stroke(c, r, selected ? T.goldHi : T.goldLo, selected ? 2 : 1);
  if (selected) stroke(c, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, 'rgba(233,200,119,.35)', 3);
  paintMedal(c, r.x + r.w / 2, r.y + 70, 76, d.name.slice(0, 1), d.rarity);
  label(c, d.name, r.x + r.w / 2, r.y + 136, BRUSH(d.name.length > 3 ? 18 : 22), T.gold, 'center');
  const lines = wrapShort(d.desc, 8);
  lines.slice(0, 3).forEach((l, k) => label(c, l, r.x + r.w / 2, r.y + 164 + k * 18, SANS(12), T.paper, 'center'));
}
const wrapShort = (s: string, n: number) => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
};

/** 直入（?page=reward）用的确定性 RNG */
export const demoRng = (seed = 45) => seeded(seed);
