/**
 * P4 宝箱 chest（#45；flow.md §3.11，PRD 10.8，设计稿 v3/chest.html）。
 * - 箱盖开启 500ms 后显示宝物三选一（selected / long-press / 收入 / 略过）。
 * - 铜钱分支：铜钱入账 + 卡牌三选一，直接用奖励页的卡牌布局（内嵌 RewardScene，fromChest）。
 * - 宝物池耗尽时以铜钱替代（economy/chest.ts）。
 */
import type { Rng } from '../../core/rng';
import type { GestureEvent } from '../../engine/input';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { inside } from '../overlays/theme';
import { LongPressDetail, type DetailContent } from '../overlays/detail';
import type { Inventory } from '../economy/inventory';
import { rollChest, takeChestRelic, type ChestOffer } from '../economy/chest';
import { rollCards } from '../economy/reward';
import { BAR_H, BRUSH, drawBackdrop, drawBottomBar, drawButton, drawChest, drawTag, hitButton, label, T, type Button, type Env } from './p4-kit';
import { drawRays, drawRelicColumn, relicDetail, RewardScene } from './reward';

export interface ChestEnv extends Env {
  inventory(): Inventory;
  rng(): Rng;
  /** 完成：发出 chest_done */
  done(): void;
  /** 直入调试：强制分支 */
  force?: 'relic' | 'gold';
}
export interface ChestParams {
  /** 已生成的宝箱结果（断线重进恢复） */
  offer?: ChestOffer;
}

export const CHEST_OPEN_MS = 500;

export class ChestScene implements Scene<ChestParams | undefined> {
  readonly id = 'chest';
  /** 宝箱、营地、商人共用 scene_misc 图集（flow.md §5），与奖励页同组加载 */
  readonly atlasScene = 'reward';
  ctx!: SceneContext;
  offer!: ChestOffer;
  selected = -1;
  t = 0;
  taken: string | null = null;
  /** 铜钱分支：内嵌奖励页卡牌布局 */
  cards: RewardScene | null = null;
  private lp!: LongPressDetail;
  constructor(private env: ChestEnv) {}

  get inv() {
    return this.env.inventory();
  }
  enter(ctx: SceneContext, p?: ChestParams) {
    this.ctx = ctx;
    this.offer = p?.offer ?? this.roll();
    this.t = 0;
    this.selected = -1;
    this.taken = null;
    this.cards = null;
    if (this.offer.type === 'gold') {
      const inv = this.inv;
      this.cards = new RewardScene({ ...this.env, done: () => this.env.done() });
      (this.cards as { id: string }).id = 'chest';
      this.cards.enter(ctx, {
        fromChest: true,
        tag: '宝箱',
        offer: { kind: 'normal', gold: this.offer.gold, potion: null, relics: [], relicPick: 'none', cards: rollCards(this.env.rng(), inv, 'normal') },
      });
      return;
    }
    this.lp = new LongPressDetail(this.env.overlays, (at) => this.detailAt(at), {
      safe: this.env.safe,
      measure: this.env.measure,
      invalidate: () => ctx.invalidate('main'),
    });
  }
  private roll(): ChestOffer {
    const o = rollChest(this.env.rng(), this.inv);
    if (this.env.force === 'gold' && o.type === 'relic') return { type: 'gold', gold: 65 };
    if (this.env.force === 'relic' && o.type === 'gold') {
      for (let i = 0; i < 20; i++) {
        const r = rollChest(this.env.rng(), this.inv);
        if (r.type === 'relic') return r;
      }
    }
    return o;
  }
  exit() {
    this.cards?.exit();
    this.env.overlays.closeAll('detail');
    this.env.overlays.closeAll('popup');
  }
  update(dt: number) {
    if (this.cards) return this.cards.update(dt);
    if (this.t >= CHEST_OPEN_MS) return;
    this.t += dt;
    this.ctx.invalidate('main');
  }
  animating() {
    if (this.cards) return this.cards.animating();
    return this.t < CHEST_OPEN_MS || this.lp?.progress > 0;
  }

  get relics() {
    return this.offer.type === 'relic' ? this.offer.relics : [];
  }
  colRect(i: number): Rect {
    const n = this.relics.length;
    const w = 116;
    const gap = 9;
    const x0 = (this.ctx.width - (n * w + (n - 1) * gap)) / 2;
    return { x: x0 + i * (w + gap), y: i === this.selected ? 370 : 376, w, h: 228 };
  }
  buttons(): Button[] {
    const h = this.ctx.height;
    return [
      { id: 'skip', rect: { x: this.ctx.width / 2 - 33, y: h - BAR_H + 7, w: 66, h: 40 }, text: '略过', kind: 'secondary', font: BRUSH(17) },
      {
        id: 'take',
        rect: { x: this.ctx.width - 75, y: h - BAR_H + 7, w: 65, h: 40 },
        text: '收入',
        kind: 'confirm',
        disabled: this.selected < 0,
        font: BRUSH(17),
      },
    ];
  }
  detailAt(at: Vec2): DetailContent | null {
    if (this.t < CHEST_OPEN_MS) return null;
    const i = this.relics.findIndex((_, k) => inside(this.colRect(k), at));
    return i >= 0 ? relicDetail(this.relics[i]) : null;
  }

  gesture(e: GestureEvent) {
    if (this.cards) return this.cards.gesture(e);
    if (this.lp.gesture(e)) return true;
    if (e.type !== 'tap') return false;
    if (this.t < CHEST_OPEN_MS) {
      this.update(CHEST_OPEN_MS - this.t);
      return true;
    }
    const i = this.relics.findIndex((_, k) => inside(this.colRect(k), e.at));
    if (i >= 0) {
      if (this.selected === i) this.collect();
      else this.selected = i;
      this.ctx.invalidate('main');
      return true;
    }
    const b = hitButton(this.buttons(), e.at);
    if (!b) return false;
    if (b.id === 'take') this.collect();
    if (b.id === 'skip') this.env.done();
    return true;
  }
  collect() {
    if (this.selected < 0 || this.taken) return;
    const id = this.relics[this.selected];
    if (takeChestRelic(this.inv, this.offer, id)) this.taken = id;
    this.env.done();
  }

  draw(layer: SurfaceName, s: Surface, dt: number) {
    if (this.cards) return this.cards.draw(layer, s);
    void dt;
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      drawBackdrop(c, w, h);
      drawRays(c, w / 2, 230, 260);
      return;
    }
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    drawTag(c, '宝箱');
    drawChest(c, w / 2, 210, Math.min(1, this.t / CHEST_OPEN_MS));
    if (this.t >= CHEST_OPEN_MS) {
      label(c, '择 一', w / 2, 348, BRUSH(21), T.gold, 'center');
      this.relics.forEach((id, i) => drawRelicColumn(c, this.colRect(i), id, i === this.selected));
    }
    drawBottomBar(c, w, h, this.inv.deck.length);
    for (const b of this.buttons()) drawButton(c, b);
    this.lp.draw(s);
  }
}
