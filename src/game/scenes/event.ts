/**
 * 奇遇页 event（#91；docs/specs/events-v05.md §6，PRD §13，设计稿 v3/event.html）。
 * - 进节点（进节点快照已写）后用局内 event 流无放回抽事件；中途刷新回到快照，重抽结果一致。
 * - 选项：条件不满足置灰并在下方写原因；点选即执行。V05 卖牌先开删牌页，取消不扣牌不给钱。
 * - 结果：结果文案 + 数值变化（体力 5→7 / 铜钱 / + 牌名），点「继续」→ completeNode 写档 → 回地图。
 * - V13 剿灭 / 事件池抽空：立刻进 1 场 easy 战斗（env.battle）。
 * - 美术未到：插画区先用纸色底 + 奇遇节点「？」印占位（§6.3-10）。prefers-reduced-motion 时结果不做淡入。
 */
import type { Rng } from '../../core/rng';
import type { CardInst } from '../../core/types';
import type { EventCfg } from '../../data/config';
import { ECONOMY } from '../../data/economy';
import { canBurn } from '../../core/run/rest';
import type { GestureEvent } from '../../engine/input';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect } from '../../engine/types';
import type { Inventory } from '../economy/inventory';
import type { EventRouteParams } from '../map/route';
import { inside, wrap } from '../overlays/theme';
import { applyOption, drawEvent, eventDef, needsRemove, optionBlocked, type EventResult, type EventRun } from '../event/logic';
import {
  BAR_H,
  BRUSH,
  circle,
  drawBackdrop,
  drawBottomBar,
  drawButton,
  drawTag,
  frame3,
  hitButton,
  label,
  SANS,
  T,
  vgrad,
  type Button,
  type Env,
} from './p4-kit';
import { pickDeckCard } from './shop';
import { FULL_SCRIM } from './rest';

/** 事件页读写的局状态（正式局 = RunSession；直达调试 = 不落盘的临时局） */
export interface EventRunIO {
  /** 当前局数值（副本） */
  read(): EventRun & { chapter: number; eventsSeen: string[] };
  /** 写回（不写盘：存档点在进事件前，「继续」时 completeNode 才写） */
  write(s: EventRun & { eventsSeen?: string[] }): void;
}
export interface EventEnv extends Env {
  run(): EventRunIO;
  rng(): Rng;
  /** 删牌页用的背包视图（牌组） */
  inventory(): Inventory;
  /** 结果页「继续」：completeNode + event_done */
  done(): void;
  /** 进战斗（V13 剿灭 goldMult=2；池抽空降级 goldMult=1） */
  battle(goldMult: number): void;
  /** 直达调试：?page=event&id=V01（只在开发构建传入） */
  debugId?: string;
  /** 调试：直接给出结果页（选项序号） */
  debugPick?: number;
  reducedMotion?(): boolean;
  track?(ev: string, data: Record<string, unknown>): void;
}
export type EventParams = Partial<EventRouteParams> | undefined;

export const FADE_MS = 300;

export class EventScene implements Scene<EventParams> {
  readonly id = 'event';
  readonly atlasScene = 'reward';
  ctx!: SceneContext;
  ev: EventCfg | null = null;
  result: EventResult | null = null;
  busy = false;
  t = 0;
  readonly log: string[] = [];
  constructor(private env: EventEnv) {}

  enter(ctx: SceneContext) {
    this.ctx = ctx;
    this.result = null;
    this.busy = false;
    this.t = 0;
    const st = this.env.run().read();
    const forced = this.env.debugId ? eventDef(this.env.debugId) : undefined;
    this.ev = forced ?? drawEvent(this.env.rng(), st.chapter, st.eventsSeen);
    if (this.ev && !forced) this.env.run().write({ ...st, eventsSeen: [...st.eventsSeen, this.ev.id] });
    this.track('event_enter', { id: this.ev?.id ?? null });
    if (this.ev && this.env.debugPick !== undefined) void this.choose(this.env.debugPick);
  }
  exit() {
    this.env.overlays.closeAll('popup');
  }
  private track(ev: string, data: Record<string, unknown>) {
    this.log.push(ev);
    this.env.track?.(ev, data);
  }

  // ---------- 布局（v3/event.html） ----------
  static readonly PIC: Rect = { x: 18, y: 56, w: 354, h: 300 };
  optRect(i: number): Rect {
    return { x: 18, y: 430 + i * 76, w: this.ctx.width - 36, h: 64 };
  }
  blocked(i: number): string | null {
    const o = this.ev?.options[i];
    return o ? optionBlocked(o, this.env.run().read()) : '无此选项';
  }
  buttons(): Button[] {
    const { width: w, height: h } = this.ctx;
    const y = h - BAR_H + 15;
    if (this.result) return [{ id: 'continue', rect: { x: w - 126, y, w: 116, h: 44 }, text: '继续', kind: 'primary', font: BRUSH(18) }];
    if (!this.ev) return [{ id: 'fight', rect: { x: w - 126, y, w: 116, h: 44 }, text: '迎战', kind: 'primary', font: BRUSH(18) }];
    return [];
  }

  gesture(e: GestureEvent) {
    if (e.type !== 'tap' || this.busy) return e.type === 'tap';
    const b = hitButton(this.buttons(), e.at);
    if (b?.id === 'continue') {
      if (this.result?.battle) this.env.battle(this.result.battle.goldMult);
      else this.env.done();
      return true;
    }
    if (b?.id === 'fight') {
      this.env.battle(1);
      return true;
    }
    if (!this.ev || this.result) return !!b;
    const i = this.ev.options.findIndex((_, k) => inside(this.optRect(k), e.at));
    if (i < 0) return false;
    if (!this.blocked(i)) void this.choose(i);
    return true;
  }

  /** 执行选项；删牌页取消返回 false（回到选项，不扣牌不给钱） */
  async choose(i: number): Promise<boolean> {
    const ev = this.ev;
    if (!ev || this.result || this.blocked(i)) return false;
    this.busy = true;
    try {
      const io = this.env.run();
      const st = io.read();
      let uid: number | undefined;
      if (needsRemove(ev.options[i])) {
        const { width: w, height: h } = this.ctx;
        uid = await pickDeckCard(this.env, w, h, this.env.inventory(), '卖一张牌', {
          ok: (c: CardInst) => canBurn(st.deck, c.uid, ECONOMY.minDeck),
          scrim: FULL_SCRIM,
        }).result;
        if (uid === undefined) return false;
      }
      const r = applyOption(ev, i, st, this.env.rng(), uid);
      io.write(st);
      this.result = r;
      this.t = 0;
      this.track('event_choose', { id: ev.id, option: i });
      return true;
    } finally {
      this.busy = false;
      this.ctx.invalidate('main');
    }
  }

  animating() {
    return !!this.result && this.t < FADE_MS && !this.reduced();
  }
  private reduced() {
    if (this.env.reducedMotion) return this.env.reducedMotion();
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  update(dt: number) {
    if (this.animating()) {
      this.t += dt;
      this.ctx.invalidate('main');
    }
  }
  /** 结果层透明度：减少动态时直接 1 */
  resultAlpha() {
    return this.reduced() ? 1 : Math.min(1, this.t / FADE_MS);
  }

  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      drawBackdrop(c, w, h);
      return;
    }
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    drawTag(c, '奇遇');
    this.drawPic(c);
    if (!this.ev) {
      label(c, '此处空无一物，忽闻伏兵四起……', w / 2, 400, SANS(15), T.paper, 'center');
    } else if (this.result) this.drawResult(c);
    else {
      c.font = SANS(14);
      const lines = wrap(c, this.ev.desc, w - 48, 14);
      lines.slice(0, 2).forEach((ln, k) => label(c, ln, w / 2, 384 + k * 22, SANS(14), '#d8c8a0', 'center'));
      this.ev.options.forEach((_, i) => this.drawOption(c, i));
    }
    drawBottomBar(c, w, h, this.env.run().read().deck.length);
    for (const b of this.buttons()) drawButton(c, b);
  }

  /** 插画占位：纸色底 + 「？」奇遇印；标题竖排在右 */
  private drawPic(c: Surface['ctx']) {
    const r = EventScene.PIC;
    c.fillStyle = T.paper2;
    c.fillRect(r.x, r.y, r.w, r.h);
    frame3(c, r, T.goldMid);
    circle(c, r.x + r.w / 2 - 20, r.y + r.h / 2, 54, 'rgba(143,195,224,.25)', '#8fc3e0', 3);
    label(c, '？', r.x + r.w / 2 - 20, r.y + r.h / 2 + 22, BRUSH(64), '#2D4C5A', 'center');
    const title = this.ev?.title ?? '伏兵';
    [...title].forEach((ch, k) => label(c, ch, r.x + r.w - 32, r.y + 56 + k * 44, BRUSH(40), T.ink, 'center'));
  }

  private drawOption(c: Surface['ctx'], i: number) {
    const o = this.ev!.options[i];
    const r = this.optRect(i);
    const why = this.blocked(i);
    const ga = c.globalAlpha;
    if (why) c.globalAlpha = ga * 0.4;
    vgrad(c, r, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, r, T.goldMid);
    label(c, o.text, r.x + 14, r.y + (o.hint ? 30 : 40), BRUSH(22), T.gold);
    if (o.hint) label(c, o.hint, r.x + 14, r.y + 52, SANS(12), T.paper3);
    c.globalAlpha = ga;
    if (why) label(c, why, r.x + r.w - 12, r.y + 38, SANS(12), '#ff8a73', 'right');
  }

  private drawResult(c: Surface['ctx']) {
    const w = this.ctx.width;
    const r = this.result!;
    const ga = c.globalAlpha;
    c.globalAlpha = ga * this.resultAlpha();
    c.font = BRUSH(18);
    const lines = wrap(c, r.text, w - 72, 18).slice(0, 2);
    const box = { x: 24, y: 380, w: w - 48, h: 30 + lines.length * 24 + (r.changes.length + (r.judge ? 1 : 0)) * 26 + 10 };
    vgrad(c, box, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, box, T.goldHi);
    let y = box.y + 36;
    for (const ln of lines) {
      label(c, ln, w / 2, y, BRUSH(18), T.goldHi, 'center');
      y += 24;
    }
    if (r.judge) {
      const suit = { S: '♠', H: '♥', C: '♣', D: '♦' }[r.judge.suit];
      label(c, `签：${suit}${r.judge.rank}（${r.judge.red ? '红' : '黑'}）`, w / 2, y + 4, SANS(14), r.judge.red ? '#ff8a73' : T.paper, 'center');
      y += 26;
    }
    for (const ch of r.changes) {
      label(c, ch.text, w / 2, y + 6, SANS(15), ch.kind === 'card-' || ch.text.includes('→') ? T.paper : T.jadeHi, 'center');
      y += 26;
    }
    c.globalAlpha = ga;
  }
}

/** 正式局读写 RunSession.state（不写盘，completeNode 写） */
export function eventRunOf(r: {
  state: {
    hp: number;
    maxHp: number;
    gold: number;
    deck: CardInst[];
    nextUid: number;
    heroMain: string;
    heroSub: string;
    chapter: number;
    nextBattleArmor?: number;
    eventsSeen?: string[];
  };
  update(fn: (d: never) => void): unknown;
}): EventRunIO {
  return {
    read: () => {
      const s = r.state;
      return {
        hp: s.hp,
        maxHp: s.maxHp,
        gold: s.gold,
        deck: s.deck,
        nextUid: s.nextUid,
        heroMain: s.heroMain,
        heroSub: s.heroSub,
        nextBattleArmor: s.nextBattleArmor ?? 0,
        chapter: s.chapter,
        eventsSeen: s.eventsSeen ?? [],
      };
    },
    write: (v) =>
      r.update(((d: typeof r.state) => {
        d.hp = v.hp;
        d.maxHp = v.maxHp;
        d.gold = v.gold;
        d.deck = v.deck.map((c) => ({ ...c, mods: [...c.mods] }));
        d.nextUid = v.nextUid;
        d.nextBattleArmor = v.nextBattleArmor;
        if (v.eventsSeen) d.eventsSeen = [...v.eventsSeen];
      }) as never),
  };
}
