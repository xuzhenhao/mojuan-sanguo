/**
 * P1a 战斗页主体（B 金漆屏风，render-spec §3/§4/§7，flow.md §3.4）。
 * 表现层新写：逻辑全部来自 src/core 的 Game（不改 core），通过 BattleIO 适配器把逻辑回调转成表现队列步骤。
 * 弹层（响应窗口、长按详情、灵光一闪）走 hooks.ts 的接入点，由 P1b 注入。
 */
import { Game, type BattleIO } from '../../../core/battle';
import { seeded } from '../../../core/rng';
import { def, enemyIntent, isRed, RANK_CH, SUIT_CH } from '../../../core/rules';
import type { CardInst, Enemy } from '../../../core/types';
import type { GestureEvent } from '../../../engine/input';
import type { OverlayStack } from '../../../engine/modal';
import type { Scene, SceneContext } from '../../../engine/scene';
import type { Surface, SurfaceName } from '../../../engine/surfaces';
import type { Ctx2DLike, Rect, Vec2 } from '../../../engine/types';
import { CARD_H, CARD_W, clamp, hitHand, layoutHand, lockDirection, type DragMode, type HandLayout } from './hand';
import { cardDetail, enemyDetail, LongPressDetail, skillDetail, type DetailContent } from '../../overlays/detail';
import { makeRespond } from '../../overlays/response';
import type { BattleElement, ElementState, BattleHit, BattleOverlayContext, BattleOverlayHooks, BattleParams, ResponseRequest } from './hooks';
import { arrow, button, C, circle, FONT, frame, goldFrame, inset, panel, rect, ring, text, vtext } from './paint';
import { judgeViewOf, type JudgeView } from './judge';
import { diff, PresentationQueue, type Snapshot } from './present';
import { battleSkillButtons, nextSkillStep, skillCardOk, skillTargetOk, type SkillButton, type SkillPick } from './skills';

export type BattleMode = 'idle' | 'target' | 'redSel' | 'skillCard' | 'skillTarget' | 'discard' | 'busy' | 'over';
export type CardState = 'normal' | 'selected' | 'legal' | 'illegal' | 'unaffordable';

export interface BattleDeps {
  overlays?: OverlayStack;
  hooks?: BattleOverlayHooks;
  /** 战斗结束（胜利大印播完后）回调：交给流程发 battle_end */
  onEnd?(win: boolean): void;
  now?(): number;
  safe?: Rect;
  /** 结束回合二次确认（1.5s） */
  confirmEnd?: boolean;
  /** 详情浮层测量文字用的上下文（P1b LongPressDetail） */
  measure?(): Surface['ctx'];
  /** 场景是否暂停（响应倒计时冻结） */
  paused?(): boolean;
  responseSeconds?: number;
  autoShan?: boolean;
  /** 调试版/测试：允许“灵光一闪默认选第一个”等调试默认；正式版必须为 false */
  debugDefaults?: boolean;
  warn?(msg: string): void;
}

const inside = (r: Rect, p: Vec2) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class BattleScene implements Scene<BattleParams> {
  readonly id = 'battle';
  g!: Game;
  mode: BattleMode = 'idle';
  readonly q = new PresentationQueue();
  private ctx!: SceneContext;
  private snap!: Snapshot;
  scroll = 0;
  selected: CardInst | null = null;
  private red: CardInst | null = null;
  skill: { b: SkillButton; pick: SkillPick } | null = null;
  discardPicks: CardInst[] = [];
  private discardNeed = 0;
  hint = '';
  private hintT = 0;
  private drag: { mode: DragMode; card: CardInst | null; pos: Vec2; target: Vec2; scroll0: number; hover: Enemy | null } | null = null;
  private press: { at: Vec2; p: number } | null = null;
  private confirmT = 0;
  private lastActor: Enemy | null = null;
  private shakeT = 0;
  private judging: JudgeView | null = null;
  ended: boolean | null = null;
  readonly logs: string[] = [];

  private lp: LongPressDetail | null = null;
  private respondImpl: BattleIO['respond'] | null = null;

  constructor(private deps: BattleDeps = {}) {
    const ov = deps.overlays;
    if (ov) {
      // P1b #64：响应弹窗。布局全部取自 rectOf，保证与绘制/命中一致
      this.respondImpl = makeRespond(ov, () => this.g.hand, {
        layout: () => ({
          cardRect: (i) => this.handLayoutAt(-1).rects[i],
          attacker: this.lastActor ? this.rectOf({ kind: 'enemy', enemy: this.lastActor }) : null,
          hero: this.rectOf({ kind: 'hero', which: 'main' })!,
        }),
        seconds: deps.responseSeconds,
        autoShan: deps.autoShan,
        paused: deps.paused,
      });
      if (deps.measure) {
        const measure = deps.measure;
        this.lp = new LongPressDetail(ov, (at) => this.detailAt(at), {
          safe: () => deps.safe ?? { x: 0, y: 0, w: this.W, h: this.H },
          measure,
          invalidate: () => this.ctx.invalidate('main'),
        });
      }
    }
  }

  /** 长按详情内容：命中测试 → P1b 的内容生成 */
  detailAt(at: Vec2): DetailContent | null {
    const h = this.hitTest(at);
    if (!h) return null;
    if (h.kind === 'card') return cardDetail(h.card);
    if (h.kind === 'enemy' || h.kind === 'intent' || h.kind === 'countdown') return enemyDetail(h.enemy);
    if (h.kind === 'skill') {
      const s = this.g.effects.activeAbility(h.id);
      return s ? skillDetail(s.ab) : null;
    }
    if (h.kind === 'hero') {
      const hero = h.which === 'main' ? this.g.main : this.g.sub;
      const sk = h.which === 'main' ? hero.mainSkills : [hero.subSkill];
      return { title: hero.name, sub: h.which === 'main' ? '主将' : '副将', lines: sk.map((x) => `【${x.name}】${x.desc}`) };
    }
    return null;
  }

  // ---------- 生命周期 ----------
  enter(ctx: SceneContext, params?: BattleParams) {
    this.ctx = ctx;
    const p = params ?? {};
    if (p.game) {
      this.g = p.game;
      this.g.io = this.io;
    } else {
      this.g = new Game(seeded(p.seed ?? 20261012), this.io, { autoShan: false, main: p.main, sub: p.sub });
      this.snap = this.snapshot();
      this.g.startBattle();
    }
    this.snap = this.snapshot();
    ctx.invalidate();
  }
  exit() {
    this.deps.overlays?.closeAll('detail');
    this.deps.overlays?.closeAll('response');
    this.q.clear();
  }
  pause() {}
  resume() {
    this.ctx.invalidate('main');
  }

  // ---------- BattleIO 适配：逻辑回调 → 表现队列 ----------
  readonly io: BattleIO = {
    log: (t) => {
      this.logs.push(t);
      if (this.logs.length > 40) this.logs.shift();
    },
    update: () => this.onLogicUpdate(),
    sleep: (ms) => this.q.push('sleep', ms),
    showJudge: ({ reason, card }) => {
      const h = this.deps.hooks?.judge;
      if (h) return h(reason, card, this.overlayCtx);
      this.judging = judgeViewOf(reason, card);
      return this.q.push('judge', 650, true, { reason }).then(() => this.q.push('judge_hold', 250).then(() => void (this.judging = null)));
    },
    respond: async (txt, legal, pass, timed) => {
      const req: ResponseRequest = { text: txt, legal, pass, timed, attacker: this.lastActor, legalCards: this.g.hand.filter(legal) };
      const h = this.deps.hooks?.respond;
      if (h) return h(req, this.overlayCtx);
      if (this.respondImpl) return this.respondImpl(txt, legal, pass, timed);
      return null; // 没有弹层栈（单测替身）：承受
    },
    epiphany: async (card, options, reroll) => {
      const h = this.deps.hooks?.epiphany;
      if (h) return h({ card, options, reroll }, this.overlayCtx);
      if (this.deps.debugDefaults) return options[0] ?? null; // 仅调试版/测试
      this.deps.warn?.('[battle] 未接入灵光一闪弹层，本次不铭刻');
      return null;
    },
    hurt: () => {
      this.shakeT = 250;
      void this.q.push('hurt', 250, false);
    },
    enemyHit: (e) => {
      this.lastActor = e;
      void this.q.push('enemy_act', 350, true, { uid: e.uid });
    },
    onBattleEnd: (win) => {
      this.ended = win;
      this.mode = 'over';
      void this.q.push(win ? 'seal_win' : 'seal_lose', 600, true).then(() => this.q.push('seal_hold', 600).then(() => this.deps.onEnd?.(win)));
    },
  };

  snapshot(): Snapshot {
    const g = this.g;
    const en: Snapshot['en'] = {};
    for (const e of g.en) en[e.uid] = { hp: e.hp, armor: e.armor, marks: e.marks, alive: e.hp > 0 };
    return { hp: g.p.hp, armor: g.p.armor, ling: g.p.ling, hand: g.hand.map((c) => c.uid), en };
  }
  /** core 调 update() 时做快照差分，生成飘字 / 抽牌 / 碎光等表现步骤 */
  onLogicUpdate() {
    const next = this.snapshot();
    for (const ev of diff(this.snap, next)) {
      if (ev.t === 'player_hp' || ev.t === 'player_armor') {
        const r = this.layout().main;
        const hp = ev.t === 'player_hp';
        void this.q.push('float', 700, false, {
          x: r.x + r.w / 2,
          y: r.y + (hp ? 40 : 80),
          text: `${ev.delta > 0 ? '+' : ''}${ev.delta}`,
          color: hp ? (ev.delta < 0 ? C.dmg : C.jadeHi) : C.azureHi,
        });
      } else if (ev.t === 'enemy_hp' || ev.t === 'enemy_armor') {
        const e = this.g.en.find((x) => x.uid === ev.uid);
        const r = e && this.enemyRect(e);
        if (r)
          void this.q.push('float', 700, false, {
            x: r.x + r.w / 2,
            y: r.y + 30,
            text: `${ev.delta > 0 ? '+' : ''}${ev.delta}`,
            color: ev.t === 'enemy_hp' ? (ev.delta < 0 ? C.dmg : C.jadeHi) : C.azureHi,
          });
        if (ev.t === 'enemy_hp' && ev.delta < 0) void this.q.push('ink_hit', 400, false, { uid: ev.uid });
      } else if (ev.t === 'enemy_die') void this.q.push('enemy_die', 400, false, { uid: ev.uid });
      else if (ev.t === 'draw') void this.q.push('draw', 220 + 60 * (ev.uids.length - 1), false, { uids: ev.uids });
      else if (ev.t === 'ling' && ev.delta < 0) void this.q.push('tally', 200, false);
    }
    this.snap = next;
    this.ctx?.invalidate('main');
  }

  // ---------- 布局（render-spec §4，dp） ----------
  get W() {
    return this.ctx.width;
  }
  get H() {
    return this.ctx.height;
  }
  layout() {
    const w = this.W;
    const h = this.H;
    const safe = this.deps.safe ?? { x: 0, y: 0, w, h };
    const bottomPad = Math.max(14, h - (safe.y + safe.h));
    const bar: Rect = { x: 0, y: h - 56 - bottomPad + 14, w, h: 56 + bottomPad - 14 };
    const handArea: Rect = { x: 12, y: bar.y - 6 - CARD_H, w: w - 24, h: CARD_H };
    const extra = Math.max(0, Math.min(24, h - 844)); // 长屏：前后排间距最多 +24
    const top = safe.y;
    const main: Rect = { x: w - 138 - 14, y: Math.min(top + 478 + extra, handArea.y - 188 - 8), w: 138, h: 188 };
    const sub: Rect = { x: main.x - 64, y: main.y + 22, w: 76, h: 104 };
    return {
      top: { x: 0, y: top + 10, w, h: 26 },
      backY: top + 58,
      frontY: top + 200 + extra,
      judge: { x: (w - 220) / 2, y: top + 388 + extra, w: 220, h: 80 },
      tally: { x: 18, y: main.y + 40, w: 30, h: 42 * 3 + 8 },
      skills: { x: 70, y: main.y + 4, w: 104, h: 34 },
      main,
      sub,
      hand: handArea,
      bar,
      endTurn: { x: w - 14 - 124, y: bar.y + 6, w: 124, h: 40 },
    };
  }
  enemyRect(e: Enemy): Rect | null {
    if (e.hp <= 0 && !this.dying(e)) return null;
    const L = this.layout();
    const row = this.g.en.filter((x) => x.row === e.row && (x.hp > 0 || this.dying(x)));
    const i = row.indexOf(e);
    if (i < 0) return null;
    const front = e.row === 'front';
    const boss = !!e.elite && e.tier === 'Boss';
    const cw = front ? (boss ? 116 : 96) : 76;
    const ch = front ? (boss ? 160 : 132) : 104;
    const gap = front ? 18 : 44;
    const total = row.length * cw + (row.length - 1) * gap;
    const x = (this.W - total) / 2 + i * (cw + gap);
    let y = front ? L.frontY - (boss ? 22 : 0) : L.backY;
    const act = this.q.current?.id === 'enemy_act' && this.q.current.data?.uid === e.uid ? this.q.progress(this.q.current) : 0;
    y += Math.sin(act * Math.PI) * 12;
    return { x, y, w: cw, h: ch };
  }
  private dying(e: Enemy) {
    return this.q.free.some((s) => s.id === 'enemy_die' && s.data?.uid === e.uid);
  }
  intentRect(e: Enemy): Rect | null {
    const r = this.enemyRect(e);
    return r && { x: r.x + r.w - 40, y: r.y - 14, w: 50, h: 28 };
  }
  countdownRect(e: Enemy): Rect | null {
    const r = this.enemyRect(e);
    return r && { x: r.x - 12, y: r.y - 12, w: 30, h: 30 };
  }
  handLayout(): HandLayout {
    const sel = this.selected ? this.g.hand.indexOf(this.selected) : -1;
    return this.handLayoutAt(this.mode === 'target' || this.mode === 'redSel' ? sel : -1);
  }
  /** 手牌布局（selected = 上浮的下标，-1 为不上浮） */
  handLayoutAt(selected: number): HandLayout {
    const l = layoutHand(this.g.hand.length, this.layout().hand, this.scroll, selected);
    this.scroll = clamp(this.scroll, 0, l.maxScroll);
    return l;
  }
  skillButtons() {
    return battleSkillButtons(this.g, this.mode === 'busy' || this.mode === 'over' || this.mode === 'discard');
  }
  skillRects(): { b: SkillButton; r: Rect }[] {
    const s = this.layout().skills;
    return this.skillButtons().map((b, i) => ({ b, r: { ...s, y: s.y + i * (s.h + 6) } }));
  }

  // ---------- 规则查询（只读 core） ----------
  /** 牌在当前模式下的状态 */
  cardState(c: CardInst): CardState {
    const g = this.g;
    if (this.mode === 'skillCard' && this.skill) return skillCardOk(g, this.skill.b.id, c) ? 'legal' : 'illegal';
    if (this.mode === 'redSel') return c === this.selected ? 'selected' : isRed(c) ? 'legal' : 'illegal';
    if (this.mode === 'discard') return this.discardPicks.includes(c) ? 'selected' : 'normal';
    if (c === this.selected) return 'selected';
    if (this.mode !== 'idle' && this.mode !== 'target') return 'normal';
    const err = this.playError(c);
    if (err === '军令不足') return 'unaffordable';
    return err ? 'illegal' : 'normal';
  }
  /** 出牌不合法原因：先看有没有可选目标，再看 core.checkPlay */
  playError(c: CardInst): string | null {
    const g = this.g;
    c.asSha = !!def(c).shan && g.canAsSha(c); // 龙胆等：闪当杀
    const err = g.checkPlay(c);
    const noTgt = g.needsTarget(c) && !g.alive().some((e) => g.canTarget(e, c));
    c.asSha = false;
    if (noTgt && err !== '军令不足') return '没有可选目标';
    return err;
  }
  cardTargetOk(c: CardInst, e: Enemy) {
    return e.hp > 0 && this.g.canTarget(e, c);
  }
  enemyTargetable(e: Enemy): boolean | null {
    if (this.mode === 'target' && this.selected) return this.cardTargetOk(this.selected, e);
    if (this.mode === 'skillTarget' && this.skill) return skillTargetOk(this.g, this.skill.b.id, e);
    if (this.drag?.card && this.g.needsTarget(this.drag.card)) return this.cardTargetOk(this.drag.card, e);
    return null;
  }

  // ---------- 输入 ----------
  get inputLocked() {
    return this.mode === 'busy' || this.mode === 'over' || this.q.blockingBusy;
  }
  hitTest(at: Vec2): BattleHit | null {
    const g = this.g;
    const L = this.layout();
    const hl = this.handLayout();
    const i = hitHand(hl, at);
    if (i >= 0) return { kind: 'card', card: g.hand[i], rect: hl.rects[i] };
    for (const { b, r } of this.skillRects()) if (inside(r, at)) return { kind: 'skill', id: b.id, rect: r };
    if (inside(L.endTurn, at)) return { kind: 'endTurn', rect: L.endTurn };
    for (const e of g.alive()) {
      const ir = this.intentRect(e);
      if (ir && inside(ir, at)) return { kind: 'intent', enemy: e, rect: ir };
      const cr = this.countdownRect(e);
      if (cr && inside(cr, at)) return { kind: 'countdown', enemy: e, rect: cr };
    }
    for (const e of g.alive()) {
      const r = this.enemyRect(e);
      if (r && inside(inset(r, -8), at)) return { kind: 'enemy', enemy: e, rect: r };
    }
    if (inside(L.main, at)) return { kind: 'hero', which: 'main', rect: L.main };
    if (inside(L.sub, at)) return { kind: 'hero', which: 'sub', rect: L.sub };
    if (inside(L.tally, at)) return { kind: 'tally', rect: L.tally };
    return null;
  }

  gesture(e: GestureEvent): boolean {
    const hk = this.deps.hooks;
    if (!hk?.detail && this.lp?.gesture(e)) return true;
    if (e.type === 'cancel') {
      this.press = null;
      this.endDrag(null);
      return true;
    }
    if (e.type === 'longpressprogress') {
      const hit = this.hitTest(e.at);
      if (hk?.longPressProgress) hk.longPressProgress(e.at, e.progress, hit, this.overlayCtx);
      else if (!this.lp || hk?.detail) this.press = hit ? { at: e.at, p: e.progress } : null;
      return true;
    }
    if (e.type === 'longpress') {
      this.press = null;
      const hit = this.hitTest(e.at);
      if (hit && hk?.detail?.(hit, this.overlayCtx)) return true;
      return !!hit;
    }
    this.press = null;
    if (this.q.blockingBusy && e.type === 'tap' && this.mode === 'busy') {
      this.q.skip(); // 点屏跳过当前可跳过动画
      return true;
    }
    if (this.inputLocked) return true;
    if (e.type === 'tap') return this.tap(e.at);
    if (e.type === 'dragstart') return this.dragStart(e.start, e.at);
    if (e.type === 'dragmove') return this.dragMove(e.at);
    if (e.type === 'dragend') return this.endDrag(e.at);
    return hk?.gesture?.(e, this.overlayCtx) ?? false;
  }

  tap(at: Vec2): boolean {
    const hit = this.hitTest(at);
    if (!hit) {
      this.cancelPending();
      return true;
    }
    if (hit.kind === 'card') void this.tapCard(hit.card);
    else if (hit.kind === 'enemy' || hit.kind === 'intent' || hit.kind === 'countdown') void this.tapEnemy(hit.enemy);
    else if (hit.kind === 'skill') this.tapSkill(hit.id);
    else if (hit.kind === 'endTurn') void this.tapEndTurn();
    else if (hit.kind === 'hero' && hit.which === 'sub') {
      const first = this.skillButtons()[0];
      if (first) this.tapSkill(first.id); // 副将牌点按发动技能
    } else this.cancelPending();
    this.ctx.invalidate('main');
    return true;
  }

  async tapCard(c: CardInst) {
    const g = this.g;
    if (this.mode === 'skillCard' && this.skill) {
      if (!skillCardOk(g, this.skill.b.id, c)) return this.flash('这张牌不能弃置');
      this.skill.pick.card = c;
      return this.advanceSkill();
    }
    if (this.mode === 'redSel') {
      if (c === this.selected) return this.cancelPending();
      if (!isRed(c)) return this.flash('需要一张红色牌');
      this.red = c;
      this.mode = 'target';
      return this.flash('选择目标');
    }
    if (this.mode === 'discard') {
      const i = this.discardPicks.indexOf(c);
      if (i >= 0) this.discardPicks.splice(i, 1);
      else this.discardPicks.push(c);
      if (this.discardPicks.length >= this.discardNeed) {
        const d = this.discardPicks.splice(0);
        await this.run(() => g.endTurn(d));
      } else this.flash(`弃牌：还需 ${this.discardNeed - this.discardPicks.length} 张`);
      return;
    }
    if (this.mode === 'target' || this.mode === 'skillTarget') {
      const same = this.selected === c;
      this.cancelPending();
      if (same) return;
    }
    if (this.mode !== 'idle') return;
    await this.beginPlay(c);
  }

  /** 选中一张牌：不需要目标直接打出，需要目标进入选目标模式 */
  async beginPlay(c: CardInst, immediate = false) {
    const g = this.g;
    const err = this.playError(c);
    if (err) {
      if (err === '军令不足') void this.q.push('shake_cost', 160, false, { uid: c.uid });
      return this.flash(err);
    }
    if (def(c).shan && g.canAsSha(c)) c.asSha = true;
    if (def(c).needRed && !c.asSha) {
      this.selected = c;
      this.mode = 'redSel';
      return this.flash(`${def(c).name}：选择一张红色牌`);
    }
    if (g.needsTarget(c)) {
      this.selected = c;
      this.mode = 'target';
      return immediate ? undefined : this.flash('选择目标（再点此牌取消）');
    }
    await this.playCard(c, null);
  }

  async tapEnemy(e: Enemy) {
    if (this.mode === 'skillTarget' && this.skill) {
      if (!skillTargetOk(this.g, this.skill.b.id, e)) return this.flash('不是合法目标');
      this.skill.pick.target = e;
      return this.advanceSkill();
    }
    if (this.mode !== 'target' || !this.selected) return;
    if (!this.cardTargetOk(this.selected, e)) return this.flash('目标不在攻击范围内');
    await this.playCard(this.selected, e);
  }

  async playCard(c: CardInst, tgt: Enemy | null) {
    const red = this.red ?? undefined;
    this.selected = null;
    this.red = null;
    const from = this.handLayout().rects[this.g.hand.indexOf(c)];
    const to = tgt ? this.enemyRect(tgt) : this.layout().judge;
    this.mode = 'busy';
    await this.q.push('play_fly', 250, true, { card: c, from, to });
    await this.run(() => this.g.play(c, tgt, red));
  }

  tapSkill(id: string) {
    if (this.skill?.b.id === id) return this.cancelPending();
    if (this.mode !== 'idle') return;
    const b = this.skillButtons().find((x) => x.id === id);
    if (!b) return;
    if (b.disabled) return this.flash(`${b.name}：${b.reason}`);
    this.skill = { b, pick: {} };
    void this.advanceSkill();
  }
  async advanceSkill() {
    const sk = this.skill;
    if (!sk) return;
    const step = nextSkillStep(sk.b, sk.pick);
    if (step === 'card') {
      this.mode = 'skillCard';
      this.flash(`${sk.b.name}：选择要弃置的牌`);
    } else if (step === 'target') {
      this.mode = 'skillTarget';
      this.flash(`${sk.b.name}：选择一名敌人`);
    } else {
      this.skill = null;
      await this.run(() => this.g.activate(sk.b.id, sk.pick.card, sk.pick.target));
    }
  }

  async tapEndTurn() {
    if (this.mode !== 'idle' && this.mode !== 'target' && this.mode !== 'skillCard' && this.mode !== 'skillTarget') return;
    this.cancelPending();
    if (this.deps.confirmEnd && this.confirmT <= 0) {
      this.confirmT = 1500;
      return;
    }
    this.confirmT = 0;
    const g = this.g;
    g.turnEnd();
    const need = g.discardNeeded();
    if (need > 0) {
      this.mode = 'discard';
      this.discardNeed = need;
      this.discardPicks = [];
      return this.flash(`手牌上限 ${g.handLimit()}：选择 ${need} 张弃置`, 2500);
    }
    await this.run(() => g.endTurn());
  }

  cancelPending() {
    if (this.mode === 'target' || this.mode === 'redSel' || this.mode === 'skillCard' || this.mode === 'skillTarget') this.mode = 'idle';
    if (this.selected) this.selected.asSha = false;
    this.selected = null;
    this.red = null;
    this.skill = null;
    this.ctx.invalidate('main');
  }

  /** 执行一个 core 动作：期间锁输入，结束后等阻塞动画播完 */
  async run(f: () => Promise<void> | void) {
    this.mode = 'busy';
    this.ctx.invalidate('main');
    try {
      await f();
    } finally {
      if (this.g.over) this.mode = 'over';
      else this.mode = 'idle';
      this.onLogicUpdate();
    }
  }

  dragStart(start: Vec2, at: Vec2): boolean {
    const hl = this.handLayout();
    const L = this.layout();
    const inHand = start.y >= L.hand.y - 30 && start.y <= L.hand.y + L.hand.h + 10;
    const i = hitHand(hl, start);
    if (!inHand && i < 0) return true;
    const mode = lockDirection(start, at, hl.maxScroll > 0, i >= 0 && this.mode === 'idle');
    const card = mode === 'card' ? this.g.hand[i] : null;
    if (card && this.playError(card)) {
      this.flash(this.playError(card)!);
      this.drag = null;
      return true;
    }
    this.drag = { mode, card, pos: { x: at.x - CARD_W / 2, y: at.y - CARD_H / 2 }, target: at, scroll0: this.scroll + (at.x - start.x), hover: null };
    if (card) this.selected = card;
    return true;
  }
  dragMove(at: Vec2): boolean {
    const d = this.drag;
    if (!d) return true;
    if (d.mode === 'scroll') {
      this.scroll = clamp(d.scroll0 - at.x, 0, this.handLayout().maxScroll);
      d.scroll0 = this.scroll + at.x;
    } else if (d.mode === 'card' && d.card) {
      d.target = at;
      d.hover =
        this.g.alive().find((e) => {
          const r = this.enemyRect(e);
          return r && inside(inset(r, -8), at) && this.cardTargetOk(d.card!, e);
        }) ?? null;
    }
    this.ctx.invalidate('main');
    return true;
  }
  endDrag(at: Vec2 | null): boolean {
    const d = this.drag;
    this.drag = null;
    if (!d || d.mode !== 'card' || !d.card || !at) {
      if (d?.card) this.selected = null;
      return true;
    }
    const L = this.layout();
    const c = d.card;
    this.selected = null;
    if (at.y > L.hand.y - 20) return true; // 拖回手牌区取消
    if (this.g.needsTarget(c)) {
      if (d.hover) {
        if (def(c).needRed && !c.asSha) {
          void this.beginPlay(c);
          return true;
        }
        void this.beginPlay(c, true).then(() => (this.mode === 'target' ? this.playCard(c, d.hover) : undefined));
      }
      return true;
    }
    if (at.y < L.hand.y - 60) void this.beginPlay(c);
    return true;
  }

  flash(msg: string, ms = 1500) {
    this.hint = msg;
    this.hintT = ms;
    this.ctx?.invalidate('main');
  }

  update(dt: number) {
    const before = this.q.busy || !!this.drag || this.hintT > 0 || this.confirmT > 0 || this.shakeT > 0;
    this.q.update(dt);
    if (this.hintT > 0) this.hintT -= dt;
    if (this.confirmT > 0) this.confirmT -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    const d = this.drag;
    if (d?.card) {
      d.pos.x += (d.target.x - CARD_W / 2 - d.pos.x) * 0.35;
      d.pos.y += (d.target.y - CARD_H / 2 - d.pos.y) * 0.35;
    }
    if (before || this.press) this.ctx.invalidate('main');
  }
  animating() {
    return this.q.busy || !!this.drag || this.hintT > 0 || this.confirmT > 0 || this.shakeT > 0 || (this.lp?.progress ?? 0) > 0;
  }

  // ---------- 弹层上下文 ----------
  get overlayCtx(): BattleOverlayContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      overlays: this.deps.overlays!,
      game: this.g,
      width: this.W,
      height: this.H,
      safe: this.deps.safe ?? { x: 0, y: 0, w: this.W, h: this.H },
      rectOf: (el) => self.rectOf(el),
      hitTest: (at) => self.hitTest(at),
      drawElement: (s, el, st) => self.drawElement(s.ctx, el, st),
      invalidate: () => self.ctx.invalidate('main'),
      now: () => self.deps.now?.() ?? 0,
    };
  }
  rectOf(el: BattleElement): Rect | null {
    const L = this.layout();
    switch (el.kind) {
      case 'card': {
        const i = this.g.hand.indexOf(el.card);
        return i < 0 ? null : this.handLayout().rects[i];
      }
      case 'enemy':
        return this.enemyRect(el.enemy);
      case 'intent':
        return this.intentRect(el.enemy);
      case 'countdown':
        return this.countdownRect(el.enemy);
      case 'hero':
        return el.which === 'main' ? L.main : L.sub;
      case 'skill':
        return this.skillRects().find((x) => x.b.id === el.id)?.r ?? null;
      case 'endTurn':
        return L.endTurn;
      case 'tally':
        return L.tally;
    }
  }
  drawElement(ctx: Ctx2DLike, el: BattleElement, st?: ElementState) {
    const r = this.rectOf(el);
    if (!r) return;
    const a0 = ctx.globalAlpha;
    const disabled = st === 'disabled';
    if (disabled) ctx.globalAlpha = a0 * 0.45;
    this.drawElementInner(ctx, el, r, disabled ? 'normal' : st);
    if (disabled) {
      ctx.globalAlpha = a0 * 0.35;
      rect(ctx, r, '#3a3a3a'); // 去饱和近似：灰罩
    }
    ctx.globalAlpha = a0;
  }
  private drawElementInner(ctx: Ctx2DLike, el: BattleElement, r: Rect, st?: Exclude<ElementState, 'disabled'>) {
    if (el.kind === 'card') this.drawCard(ctx, el.card, r, st ?? this.cardState(el.card));
    else if (el.kind === 'skill') {
      const b = this.skillButtons().find((x) => x.id === el.id);
      if (b) button(ctx, r, b.name, 'secondary', b.disabled, 16);
    } else if (el.kind === 'enemy') this.drawEnemy(ctx, el.enemy);
    else if (el.kind === 'hero') this.drawHeroes(ctx, el.which);
    else if (el.kind === 'tally') this.drawTally(ctx);
    else if (el.kind === 'endTurn') this.drawBar(ctx);
  }

  // ---------- 绘制 ----------
  draw(layer: SurfaceName, s: Surface) {
    const ctx = s.ctx;
    const w = this.W;
    const h = this.H;
    if (layer === 'bg') return this.drawBg(ctx);
    ctx.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    const L = this.layout();
    // 顶条
    const tb = this.topBar();
    text(ctx, tb.left, 16, L.top.y + 13, { size: 18, color: C.gold, font: FONT.brush });
    text(ctx, tb.right, w - 16, L.top.y + 13, { size: 14, color: C.goldLo, align: 'right' });
    // 敌阵：后排 → 前排 → 附件
    const back = this.g.en.filter((e) => e.row === 'back');
    const front = this.g.en.filter((e) => e.row === 'front');
    for (const e of [...back, ...front]) this.drawEnemy(ctx, e);
    this.drawJudge(ctx);
    this.drawHeroes(ctx);
    this.drawTally(ctx);
    this.drawSkills(ctx);
    this.drawBar(ctx);
    this.drawHand(ctx);
    this.drawFx(ctx);
    // 提示横幅
    if (this.hintT > 0 && this.hint) {
      const y = L.hand.y - 44;
      ctx.globalAlpha = Math.min(1, this.hintT / 200);
      rect(ctx, { x: 0, y, w, h: 30 }, 'rgba(10,4,2,0.82)');
      rect(ctx, { x: 0, y, w, h: 1 }, C.goldLo);
      rect(ctx, { x: 0, y: y + 29, w, h: 1 }, C.goldLo);
      text(ctx, this.hint, w / 2, y + 15, { size: 16, color: C.paper, font: FONT.brush, align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (this.press && this.press.p > 0.15) {
      ring(ctx, this.press.at.x, this.press.at.y - 30, 16, 'rgba(233,200,119,0.35)', 3);
      ring(ctx, this.press.at.x, this.press.at.y - 30, 16, C.gold, 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.press.p);
    }
    this.drawSeal(ctx);
    this.lp?.draw(s);
  }

  /** 顶条文案：全部读 core 状态，不写死（#55） */
  topBar() {
    const g = this.g;
    return { left: `第${g.battleIdx + 1}战 · ${g.battle?.name ?? ''}`, right: `第 ${g.turn} 回合 · 牌堆 ${g.draw.length}` };
  }

  drawBg(ctx: Ctx2DLike) {
    const w = this.W;
    const h = this.H;
    rect(ctx, { x: 0, y: 0, w, h }, C.lac0);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      rect(ctx, { x: w * k * 0.25, y: h * k * 0.2, w: w * (1 - k * 0.5), h: h * (1 - k * 0.4) }, [C.lac1, C.lac2, C.lac3, C.lac2, C.lac4, C.lac3][i]);
    }
    // 金山影
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 5; i++) rect(ctx, { x: i * (w / 5) - 10, y: 150 + (i % 2) * 30, w: w / 5 + 30, h: 220 }, C.goldDk);
    ctx.globalAlpha = 1;
    frame(ctx, { x: 6, y: 6, w: w - 12, h: h - 12 }, C.goldLo, 1);
    frame(ctx, { x: 9, y: 9, w: w - 18, h: h - 18 }, C.goldDk, 1);
  }

  drawCard(ctx: Ctx2DLike, c: CardInst, r: Rect, st: CardState) {
    const d = def(c);
    const a0 = ctx.globalAlpha;
    if (st === 'illegal') ctx.globalAlpha = a0 * 0.45;
    const shake = this.q.free.find((s) => s.id === 'shake_cost' && s.data?.uid === c.uid);
    const x = r.x + (shake ? Math.sin(this.q.progress(shake) * Math.PI * 6) * 4 : 0);
    const rr = { ...r, x };
    if (st === 'selected' || st === 'legal') rect(ctx, inset(rr, -3), st === 'selected' ? C.goldHi : 'rgba(233,200,119,0.6)');
    const variant = c.mods.length ? 'jade' : d.type === '基本' ? 'bronze' : d.type === '装备' ? 'silver' : 'gold';
    goldFrame(ctx, rr, variant, 3);
    const win = { x: x + 22, y: r.y + 22, w: r.w - 28, h: r.h - 48 };
    const tint = d.sha ? C.cinnabar : d.shan ? C.azure : d.tao || d.jiu ? C.jade : d.slot ? C.goldDk : '#8A5A3A';
    rect(ctx, win, tint);
    ctx.globalAlpha *= 0.35;
    rect(ctx, inset(win, 6), C.paper);
    ctx.globalAlpha = st === 'illegal' ? a0 * 0.45 : a0;
    // 费用珠（左上）+ 花色点数（左侧竖排）
    const cost = this.g.costOf(c);
    circle(ctx, x + 11, r.y + 11, 10, st === 'unaffordable' ? C.cinnabar : C.jade);
    text(ctx, String(cost), x + 11, r.y + 12, { size: 14, color: C.paper, font: FONT.num, align: 'center', bold: true });
    const red = isRed(c);
    text(ctx, SUIT_CH[c.suit], x + 11, r.y + 31, { size: 12, color: red ? C.cinnabar : C.ink, align: 'center' });
    text(ctx, RANK_CH[c.rank], x + 11, r.y + 45, { size: 11, color: red ? C.cinnabar : C.ink, font: FONT.num, align: 'center', bold: true });
    // 卡名（底部书法）
    const nm = d.name.length > 2 ? d.name.slice(0, 4) : d.name;
    text(ctx, nm, x + r.w / 2, r.y + r.h - 15, { size: nm.length > 2 ? 15 : 20, color: C.ink, font: FONT.brush, align: 'center' });
    if (c.mods.length) {
      rect(ctx, { x: x + 3, y: r.y + r.h - 16, w: 12, h: 12 }, C.cinnabar);
      frame(ctx, { x: x + 3, y: r.y + r.h - 16, w: 12, h: 12 }, C.gold, 1);
    }
    ctx.globalAlpha = a0;
  }

  drawEnemy(ctx: Ctx2DLike, e: Enemy) {
    const r = this.enemyRect(e);
    if (!r) return;
    const a0 = ctx.globalAlpha;
    const die = this.q.free.find((s) => s.id === 'enemy_die' && s.data?.uid === e.uid);
    let a = e.row === 'back' ? 0.85 : 1;
    if (die) a *= 1 - this.q.progress(die);
    const tg = this.enemyTargetable(e);
    if (tg === false) a *= 0.35;
    ctx.globalAlpha = a0 * a;
    if (tg === true || this.drag?.hover === e) rect(ctx, inset(r, -4), this.drag?.hover === e ? C.goldHi : 'rgba(233,200,119,0.7)');
    goldFrame(ctx, r, e.elite ? 'gold' : 'bronze', 4);
    rect(ctx, { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 34 }, '#2B1E16');
    text(ctx, e.g ?? e.name[0], r.x + r.w / 2, r.y + (r.h - 28) / 2 + 4, {
      size: r.w * 0.42,
      color: 'rgba(243,235,216,0.85)',
      font: FONT.brush,
      align: 'center',
    });
    vtext(ctx, e.name.slice(0, 4), r.x + 14, r.y + 18, e.row === 'front' ? 15 : 13, C.paper);
    const hit = this.q.free.find((s) => s.id === 'ink_hit' && s.data?.uid === e.uid);
    if (hit) {
      ctx.globalAlpha = a0 * a * (1 - this.q.progress(hit)) * 0.7;
      rect(ctx, inset(r, 4), C.ink);
      ctx.globalAlpha = a0 * a;
    }
    // 体力：≤10 用勾玉，>10 / Boss 用血条
    const by = r.y + r.h - 18;
    if (e.max > 10) {
      const bw = r.w - 12;
      rect(ctx, { x: r.x + 6, y: by, w: bw, h: 12 }, '#2A2A2A');
      rect(ctx, { x: r.x + 6, y: by, w: (bw * Math.max(0, e.hp)) / e.max, h: 12 }, C.cinnabar);
      frame(ctx, { x: r.x + 6, y: by, w: bw, h: 12 }, C.gold, 1);
      text(ctx, `${Math.max(0, e.hp)}/${e.max}`, r.x + r.w / 2, by + 6, { size: 10, color: C.paper, font: FONT.num, align: 'center', bold: true });
    } else this.beads(ctx, r.x + r.w / 2, by + 6, e.hp, e.max, 5);
    // 护盾（左下）
    if (e.armor > 0) this.shield(ctx, r.x - 10, r.y + r.h - 34, e.armor, 24);
    // 意图（右上）
    const ir = this.intentRect(e)!;
    const it = enemyIntent(e);
    const lethal = it.dmg > 0 && it.dmg >= this.g.p.hp + this.g.p.armor;
    rect(ctx, ir, lethal ? C.cinnabar : C.lac1);
    frame(ctx, ir, lethal ? C.cinnGlow : C.gold, 1);
    const defOnly = it.dmg === 0 && it.acts.includes('闪');
    const icon = it.dmg > 0 ? '⚔' : defOnly ? '盾' : '✦';
    text(ctx, icon, ir.x + 13, ir.y + 14, { size: 15, color: it.dmg > 0 ? C.dmg : defOnly ? C.defIntent : C.gold, align: 'center' });
    text(ctx, it.dmg > 0 ? String(it.dmg) : defOnly ? `${it.acts.filter((x) => x === '闪').length}` : '?', ir.x + 34, ir.y + 14, {
      size: 16,
      color: C.paper,
      font: FONT.num,
      align: 'center',
      bold: true,
    });
    // 闪标记 / 判定区
    const cr = this.countdownRect(e)!;
    circle(ctx, cr.x + 15, cr.y + 15, 14, C.lac0);
    ring(ctx, cr.x + 15, cr.y + 15, 14, C.cinnabar, 2);
    text(ctx, '1', cr.x + 15, cr.y + 16, { size: 13, color: C.paper, font: FONT.num, align: 'center', bold: true });
    if (e.marks > 0) text(ctx, `闪×${e.marks}`, r.x + r.w / 2, r.y + r.h + 10, { size: 11, color: C.defIntent, align: 'center' });
    if (e.judge.length) text(ctx, e.judge.map((c) => def(c).name[0]).join(''), r.x + r.w - 8, r.y + r.h + 10, { size: 11, color: C.gold, align: 'right' });
    ctx.globalAlpha = a0;
  }

  beads(ctx: Ctx2DLike, cx: number, cy: number, hp: number, max: number, r: number) {
    if (max > 9) {
      circle(ctx, cx - 14, cy, r, C.jade);
      text(ctx, `×${Math.max(0, hp)}`, cx + 4, cy, { size: 12, color: C.paper, font: FONT.num, bold: true });
      return;
    }
    const step = r * 2 + 3;
    const x0 = cx - ((max - 1) * step) / 2;
    for (let i = 0; i < max; i++) circle(ctx, x0 + i * step, cy, r, i < hp ? C.jade : '#3A3A3A');
  }
  shield(ctx: Ctx2DLike, x: number, y: number, n: number, s: number) {
    rect(ctx, { x, y, w: s, h: s + 2 }, C.azure);
    frame(ctx, { x, y, w: s, h: s + 2 }, C.azureHi, 1);
    text(ctx, String(n), x + s / 2, y + s / 2 + 1, { size: 14, color: C.paper, font: FONT.num, align: 'center', bold: true });
  }

  drawHeroes(ctx: Ctx2DLike, only?: 'main' | 'sub') {
    const L = this.layout();
    const g = this.g;
    const shake = this.shakeT > 0 ? Math.sin(this.shakeT / 20) * 4 : 0;
    if (!only || only === 'sub') {
      const r = { ...L.sub, x: L.sub.x + shake };
      goldFrame(ctx, r, 'silver', 3);
      rect(ctx, { x: r.x + 5, y: r.y + 5, w: r.w - 10, h: r.h - 10 }, '#3B2C22');
      vtext(ctx, g.sub.name, r.x + 14, r.y + 18, 15, C.paper);
      const ready = this.skillButtons().some((b) => !b.disabled);
      if (ready) {
        circle(ctx, r.x + r.w - 6, r.y + r.h - 6, 9, C.gold);
        ring(ctx, r.x + r.w - 6, r.y + r.h - 6, 12, 'rgba(244,220,154,0.5)', 2);
      }
    }
    if (!only || only === 'main') {
      const r = { ...L.main, x: L.main.x + shake };
      const dying = g.p.hp <= 1;
      if (dying) rect(ctx, inset(r, -3), C.cinnabar);
      goldFrame(ctx, r, 'gold', 4);
      rect(ctx, { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 34 }, '#3B2C22');
      text(ctx, g.main.name.slice(-1), r.x + r.w / 2 + 10, r.y + 80, { size: 64, color: 'rgba(243,235,216,0.2)', font: FONT.brush, align: 'center' });
      vtext(ctx, g.main.name, r.x + 20, r.y + 24, 26, C.paper);
      this.beads(ctx, r.x + r.w / 2, r.y + r.h - 14, g.p.hp, g.p.maxHp, 7);
      if (g.p.armor > 0) this.shield(ctx, r.x - 14, r.y + r.h - 48, g.p.armor, 30);
      const st: string[] = [];
      if (g.p.jiu) st.push(`酒${g.p.jiu}`);
      if (g.p.aogu) st.push('傲骨');
      if (g.p.yiyong) st.push('义勇');
      for (const [k, v] of Object.entries(g.p.status)) if (v) st.push(k);
      const eq = Object.values(g.p.equip).map((c) => c && def(c).name);
      const tags = [...st, ...eq.filter(Boolean)] as string[];
      tags.slice(0, 4).forEach((t, i) => text(ctx, t, r.x + r.w - 8, r.y + 20 + i * 18, { size: 11, color: C.goldHi, align: 'right' }));
    }
    const hurt = this.q.free.find((s) => s.id === 'hurt');
    if (hurt && !only) {
      ctx.globalAlpha = 0.28 * (1 - this.q.progress(hurt));
      rect(ctx, { x: 0, y: 0, w: this.W, h: this.H }, C.cinnabar);
      ctx.globalAlpha = 1;
    }
  }

  drawTally(ctx: Ctx2DLike) {
    const L = this.layout();
    const { ling, maxLing } = this.g.p;
    const n = Math.min(5, Math.max(maxLing, ling));
    const k = n > 3 ? 32 : 46;
    for (let i = 0; i < n; i++) {
      const y = L.tally.y + i * k;
      const lit = i >= n - ling;
      rect(ctx, { x: L.tally.x, y, w: 30, h: k - 4 }, lit ? C.goldMid : '#3A3027');
      frame(ctx, { x: L.tally.x, y, w: 30, h: k - 4 }, lit ? C.goldHi : C.goldDk, 1);
      text(ctx, '令', L.tally.x + 15, y + (k - 4) / 2, { size: 16, color: lit ? C.lac1 : '#5a4a3a', font: FONT.brush, align: 'center' });
    }
    text(ctx, `${ling}/${maxLing}`, L.tally.x + 15, L.tally.y - 14, { size: 15, color: C.paper, font: FONT.num, align: 'center', bold: true });
  }

  drawSkills(ctx: Ctx2DLike) {
    for (const { b, r } of this.skillRects()) {
      const on = this.skill?.b.id === b.id;
      if (on) rect(ctx, inset(r, -3), C.goldHi);
      button(ctx, r, b.name + (Number.isFinite(b.remaining) ? ` ${b.remaining}` : ''), 'secondary', b.disabled, 16);
      if (b.disabled && b.reason) text(ctx, b.reason, r.x + r.w / 2, r.y + r.h + 1, { size: 9, color: C.goldLo, align: 'center' });
    }
  }

  drawBar(ctx: Ctx2DLike) {
    const L = this.layout();
    const b = L.bar;
    rect(ctx, b, 'rgba(15,7,5,0.95)');
    rect(ctx, { x: 0, y: b.y, w: b.w, h: 1 }, C.gold);
    text(ctx, `牌堆 ${this.g.draw.length}`, 18, b.y + 26, { size: 13, color: C.paper });
    text(ctx, `弃牌 ${this.g.discard.length}`, 92, b.y + 26, { size: 13, color: C.paper });
    text(ctx, `手牌 ${this.g.hand.length}/${this.g.handLimit()}`, 166, b.y + 26, { size: 13, color: C.goldLo });
    const enemyTurn = this.mode === 'busy' || this.mode === 'over';
    const label = this.mode === 'discard' ? `弃 ${this.discardPicks.length}/${this.discardNeed}` : this.confirmT > 0 ? '确定？' : '结束回合';
    const attention = this.mode === 'idle' && this.g.p.ling === 0;
    if (attention) rect(ctx, inset(L.endTurn, -3), 'rgba(244,220,154,0.55)');
    button(ctx, L.endTurn, label, 'primary', enemyTurn || this.mode === 'discard', 19);
  }

  drawHand(ctx: Ctx2DLike) {
    const hl = this.handLayout();
    const fly = this.q.current?.id === 'play_fly' ? this.q.current : null;
    const drawStep = this.q.free.find((s) => s.id === 'draw');
    this.g.hand.forEach((c, i) => {
      if (this.drag?.card === c || fly?.data?.card === c) return;
      let r = hl.rects[i];
      if (drawStep && (drawStep.data?.uids as number[]).includes(c.uid)) {
        const j = (drawStep.data?.uids as number[]).indexOf(c.uid);
        const p = clamp((drawStep.t - j * 60) / 220, 0, 1);
        if (p < 1) {
          ctx.globalAlpha = p;
          r = { ...r, x: r.x - (1 - p) * 80, y: r.y + (1 - p) * 40 };
        }
      }
      this.drawCard(ctx, c, r, this.cardState(c));
      ctx.globalAlpha = 1;
    });
    if (hl.maxScroll > 0) {
      const L = this.layout().hand;
      const k = this.scroll / hl.maxScroll;
      rect(ctx, { x: L.x, y: L.y + L.h + 3, w: L.w, h: 2 }, 'rgba(138,106,42,0.4)');
      rect(ctx, { x: L.x + k * (L.w - 60), y: L.y + L.h + 3, w: 60, h: 2 }, C.gold);
    }
    const d = this.drag;
    if (d?.card) {
      const tg = this.g.needsTarget(d.card);
      if (tg) arrow(ctx, d.pos.x + CARD_W / 2, d.pos.y, d.target.x, d.target.y, d.hover ? C.goldHi : C.cinnGlow);
      else if (d.target.y < this.layout().hand.y - 60) rect(ctx, { x: 0, y: this.layout().hand.y - 60, w: this.W, h: 1 }, C.gold);
      this.drawCard(ctx, d.card, { x: d.pos.x, y: d.pos.y, w: CARD_W, h: CARD_H }, 'selected');
    }
    if (this.mode === 'target' && this.selected) {
      const i = this.g.hand.indexOf(this.selected);
      const r = hl.rects[i];
      if (r) text(ctx, '选择目标', r.x + r.w / 2, r.y - 10, { size: 12, color: C.goldHi, align: 'center' });
    }
    if (fly) {
      const p = this.q.progress(fly);
      const a = fly.data?.from as Rect | undefined;
      const b = fly.data?.to as Rect | null;
      if (a && b) {
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const x = a.x + (b.x + b.w / 2 - CARD_W / 2 - a.x) * e;
        const y = a.y + (b.y + b.h / 2 - CARD_H / 2 - a.y) * e;
        ctx.globalAlpha = 1 - p * 0.4;
        this.drawCard(ctx, fly.data!.card as CardInst, { x, y, w: CARD_W, h: CARD_H }, 'normal');
        ctx.globalAlpha = 1;
      }
    }
  }

  drawJudge(ctx: Ctx2DLike) {
    const j = this.judging;
    if (!j) return;
    const r = this.layout().judge;
    panel(ctx, r);
    text(ctx, j.reason, r.x + 10, r.y + 14, { size: 12, color: C.gold });
    const s = this.q.current?.id === 'judge' ? this.q.progress(this.q.current) : 1;
    const flip = Math.abs(Math.cos(Math.PI * clamp((s - 0.3) / 0.46, 0, 1)));
    const cw = 48 * (s < 0.3 ? 1 : flip);
    const face = s > 0.53;
    const cr = { x: r.x + r.w / 2 - cw / 2, y: r.y + 8, w: Math.max(2, cw), h: 68 };
    if (face) {
      goldFrame(ctx, cr, 'bronze', 2);
      text(ctx, j.face, cr.x + cr.w / 2, cr.y + 34, { size: 16, color: j.red ? C.cinnabar : C.ink, align: 'center', bold: true });
      if (j.name) text(ctx, j.name, cr.x + cr.w / 2, cr.y + 56, { size: 11, color: C.ink, align: 'center' });
      if (j.effective != null)
        text(ctx, j.effective ? '✗' : '✓', r.x + r.w - 26, r.y + 40, { size: 22, color: j.effective ? C.cinnabar : C.jade, align: 'center', bold: true });
    } else {
      rect(ctx, cr, C.cinnabar);
      frame(ctx, cr, C.gold, 1);
    }
  }

  drawFx(ctx: Ctx2DLike) {
    for (const s of this.q.free) {
      if (s.id !== 'float') continue;
      const p = this.q.progress(s);
      const d = s.data as { x: number; y: number; text: string; color: string };
      ctx.globalAlpha = 1 - p * p;
      text(ctx, d.text, d.x, d.y - 40 * p, { size: 26 * (1.3 - 0.3 * Math.min(1, p * 3)), color: d.color, font: FONT.num, align: 'center', bold: true });
    }
    ctx.globalAlpha = 1;
  }

  drawSeal(ctx: Ctx2DLike) {
    if (this.ended == null) return;
    const s =
      this.q.current && this.q.current.id.startsWith('seal_win')
        ? this.q.progress(this.q.current)
        : this.q.current?.id === 'seal_lose'
          ? this.q.progress(this.q.current)
          : 1;
    const k = 2 - Math.min(1, s);
    const size = 110 * k;
    const cx = this.W / 2;
    const cy = this.H * 0.4;
    ctx.globalAlpha = 0.6;
    rect(ctx, { x: 0, y: 0, w: this.W, h: this.H }, C.lac0);
    ctx.globalAlpha = Math.min(1, s * 1.5);
    const r = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    rect(ctx, r, this.ended ? C.cinnabar : '#3a3a3a');
    frame(ctx, r, C.gold, 3);
    frame(ctx, inset(r, 6), C.goldLo, 1);
    text(ctx, this.ended ? '胜' : '败', cx, cy + 2, { size: 64 * k, color: C.paper, font: FONT.brush, align: 'center' });
    ctx.globalAlpha = 1;
  }
}
