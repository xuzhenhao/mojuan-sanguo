/**
 * P1a 战斗页主体（B 金漆屏风，render-spec §3/§4/§7，flow.md §3.4）。
 * 表现层新写：逻辑全部来自 src/core 的 Game（不改 core），通过 BattleIO 适配器把逻辑回调转成表现队列步骤。
 * 弹层（响应窗口、长按详情、灵光一闪）走 hooks.ts 的接入点，由 P1b 注入。
 */
import { openEpiphany } from '../../overlays/epiphany';
import { drawVecGlyph } from '../../overlays/glyphs';
import { EPIPHANY } from '../../../data/affixes';
import { CARDS } from '../../../data/cards';
import {
  handName,
  BEAD_D,
  DYING_EDGE_COLOR,
  DYING_EDGE_W,
  dyingEdgeAlpha,
  dyingFading,
  newDyingEdge,
  prefersReducedMotion,
  enemyHpView,
  isDying,
  fitNameCached,
  heroHpView,
} from './hpview';
import { textWidth } from '../../overlays/theme';
import { hitInside } from '../../../engine/hit';
import { Game, type BattleIO } from '../../../core/battle';
import { seeded } from '../../../core/rng';
import { def, enemyIntent, isRed, RANK_CH } from '../../../core/rules';
import { drawSuit } from '../../overlays/icons';
import type { CardInst, Enemy } from '../../../core/types';
import type { GestureEvent } from '../../../engine/input';
import type { OverlayStack } from '../../../engine/modal';
import type { Scene, SceneContext } from '../../../engine/scene';
import type { Surface, SurfaceName } from '../../../engine/surfaces';
import type { Ctx2DLike, Rect, Vec2 } from '../../../engine/types';
import { CARD_H, CARD_W, clamp, hitHand, layoutHand, lockDirection, type DragMode, type HandLayout } from './hand';
import { cardDetail, enemyDetail, LongPressDetail, openDetail, skillDetail, type DetailContent } from '../../overlays/detail';
import { makeRespond } from '../../overlays/response';
import { openRevive } from '../../overlays/revive';
import { reviveFxDone, reviveFxFrame, type ReviveFx } from './revive-fx';
import { CONFIG } from '../../../data/config';
import { drawBossIntro, INTRO_MS, introFrame, SKIP_FADE_MS, type IntroData, type IntroKind } from './boss-intro';
import type { SeenBosses } from '../../prefs/seen-bosses';
import type { BattleElement, ElementState, BattleHit, BattleOverlayContext, BattleOverlayHooks, BattleParams, ResponseRequest } from './hooks';
import { arrow, button, C, circle, FONT, frame, goldFrame, inset, panel, rect, ring, text, vtext } from './paint';
import { drawScreenBg } from './screen';
import { judgeViewOf, type JudgeView } from './judge';
import { diff, PresentationQueue, type Snapshot } from './present';
import { battleSkillButtons, nextSkillStep, skillCardOk, skillTargetOk, type SkillButton, type SkillPick } from './skills';

/** render-spec §3.4：主将勾玉 ⌀17、敌人/小牌 ⌀11 */
/** 紧凑式体力胶囊宽：左 8 + 勾玉 17 + 6 + 数字 + 右 10 */
function compactHpW(v: { full: boolean; cur: number; max: number }) {
  const numW = v.full ? 12 + String(v.max).length * 9 : String(v.cur).length * 9 + 6 + String(v.max).length * 7;
  return 8 + BEAD_D + 6 + numW + 10;
}
export const BEAD_R_MAIN = 8.5;
export const BEAD_R_ENEMY = 5.5;
/** 后排牌间距（acceptance §3；过宽时由 enemyRect 压缩以塞进屏宽） */
export const BACK_ROW_GAP = 120;

export type BattleMode = 'idle' | 'target' | 'redSel' | 'skillCard' | 'skillTarget' | 'discard' | 'busy' | 'over';
export type CardState = 'normal' | 'selected' | 'legal' | 'illegal' | 'unaffordable';

/** `?hp=&maxHp=&ehp=&boss=1&longname=1&detail=<牌 id>` 解析结果 */
export interface BattleDevOverrides {
  hp?: number;
  maxHp?: number;
  ehp?: number;
  boss?: boolean;
  longName?: boolean;
  detail?: string;
  /** `?intro=first|repeat|phase[&introT=<ms>]`：预览首领登场 / 阶段台词（#107）；introT 定格在该时刻供截图 */
  intro?: IntroKind;
  introT?: number;
}

export interface BattleDeps {
  overlays?: OverlayStack;
  hooks?: BattleOverlayHooks;
  /** 战斗结束（胜利大印播完后）回调：交给流程发 battle_end */
  onEnd?(win: boolean): void;
  now?(): number;
  /** 是否减少动态（默认读 prefers-reduced-motion）：#129 濒死红边、#106 复活动画均立即切换 */
  reducedMotion?(): boolean;
  safe?: Rect;
  /** 结束回合二次确认（1.5s） */
  confirmEnd?: boolean;
  /** 详情浮层测量文字用的上下文（P1b LongPressDetail） */
  measure?(): Surface['ctx'];
  /** 场景是否暂停（响应倒计时冻结） */
  paused?(): boolean;
  responseSeconds?: number;
  autoShan?: boolean;
  /** 本局点将结果：地图进战斗的 params 不带主副将时用它（否则回落默认武将） */
  heroes?(): { main: string; sub: string } | null | undefined;
  /**
   * 由 RunState 建本场 Game（#122 PR2，入口接 RunSession.buildBattle(io, node, false)，未开战，场景挂好后 startBattle）：
   * 返回 null（没有局 / 直达调试）则按旧逻辑用 seed + 默认体力牌组建。
   */
  build?(io: BattleIO, params: BattleParams): Game | null;
  /** 本局战斗序号（1 起，RunSession.battleNo）；不给时退回 core battleIdx + 1（直达调试） */
  battleNo?(): number | undefined;
  /** 调试版/测试：允许“灵光一闪默认选第一个”等调试默认；正式版必须为 false */
  debugDefaults?: boolean;
  /** 仅开发构建（entry 用 import.meta.env.DEV 包住）：UI 截图验收用的强制状态（#129） */
  dev?: BattleDevOverrides;
  /** 当前地图节点类型（'BOSS' / 'ELITE' / …）；Boss 血条判定优先看它，没有再看敌人数据 tier（#129） */
  nodeType?(): string | undefined;
  warn?(msg: string): void;
  /** 局外偏好：已看过登场的首领 id（#107；不给则每次按首次播） */
  seenBosses?: SeenBosses;
}

const inside = (r: Rect, p: Vec2) => hitInside(r, p); // #118：命中框 ≥ 44

/** 意图图标：只出闪 = 「闪」（config/rules.yaml maxFlashMarks「敌人闪标记」，PRD 4.4 ②），不是护盾 */
export function intentIcon(dmg: number, defOnly: boolean) {
  return dmg > 0 ? '⚔' : defOnly ? '闪' : '✦';
}

export class BattleScene implements Scene<BattleParams> {
  readonly id = 'battle';
  g!: Game;
  mode: BattleMode = 'idle';
  /** 复活后的化墨 / 意图交叉淡入（PRD 4.4.1） */
  reviveFx: ReviveFx | null = null;
  /** 灵光一闪弹层打开中（关闭后再开排队的响应窗口，#105 规格 §2） */
  private epiOpen: Promise<void> | null = null;
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

  private dyingEdge = newDyingEdge();
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
    } else if (this.deps.build && (this.g = this.deps.build(this.io, p) as Game)) {
      this.snap = this.snapshot();
      this.g.startBattle();
    } else {
      const hs = this.deps.heroes?.();
      this.g = new Game(seeded(p.seed ?? 20261012), this.io, { autoShan: false, main: p.main ?? hs?.main, sub: p.sub ?? hs?.sub });
      this.g.reviveLeft = CONFIG.rules.revive.count; // 直达战斗（无 RunState）：按每局次数给，便于验收复活层
      this.snap = this.snapshot();
      this.g.startBattle();
    }
    if (!p.game) this.startIntro();
    if (this.deps.dev && !p.game) this.applyDev(this.deps.dev);
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
      if (this.epiOpen) await this.epiOpen; // 规格 §2：排队的响应窗口等灵光一闪关闭后再开
      const req: ResponseRequest = { text: txt, legal, pass, timed, attacker: this.lastActor, legalCards: this.g.hand.filter(legal) };
      const h = this.deps.hooks?.respond;
      if (h) return h(req, this.overlayCtx);
      if (this.respondImpl) return this.respondImpl(txt, legal, pass, timed);
      return null; // 没有弹层栈（单测替身）：承受
    },
    epiphany: async (card, options, reroll) => {
      const h = this.deps.hooks?.epiphany;
      if (h) return h({ card, options, reroll }, this.overlayCtx);
      if (this.deps.debugDefaults) return options[0] ?? null; // 仅调试版（/debug/）/测试：自动选第一个
      // #105：默认用正式灵光一闪弹层（H5 无刷新，reroll 不用）
      if (this.deps.overlays) {
        const p = openEpiphany(
          this.deps.overlays,
          { card, options, count: this.g.epiCount, max: EPIPHANY.maxPerBattle },
          { width: this.W, height: this.H, reducedMotion: () => this.reducedMotion() },
        );
        const done = p.then(() => undefined);
        this.epiOpen = done;
        void done.then(() => {
          if (this.epiOpen === done) this.epiOpen = null;
        });
        return p;
      }
      this.deps.warn?.('[battle] 未接入灵光一闪弹层，本次不铭刻');
      return null;
    },
    revive: async (ev) => {
      const h = this.deps.hooks?.revive;
      if (h) return h(ev, this.overlayCtx);
      const ov = this.deps.overlays;
      if (!ov) return !!this.deps.debugDefaults; // 单测替身：调试默认复活，正式无弹层栈则放弃
      return openRevive(
        ov,
        { hero: this.g.main.name, hp: ev.hp, armor: ev.armor, perRun: CONFIG.rules.revive.count, left: ev.left, enemies: this.g.alive().length },
        () => this.deps.safe ?? { x: 0, y: 0, w: this.W, h: this.H },
      );
    },
    enemyPhase: (ev) => {
      // #107 阶段切换：阶段台词约 1s（不重开墨带）；召唤的弓手同时按入场出现
      const line = ev.enemy.intro?.phaseLine;
      if (line) void this.q.push('boss_phase', INTRO_MS.phase, true, { intro: this.introData(ev.enemy, 'phase', line) });
    },
    revived: (ev) => {
      this.reviveFx = { start: this.fxNow(), prev: ev.prev, cancelled: new Set(ev.cancelled) };
      this.ctx.invalidate('main');
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
    handOverflow: (ev) => {
      this.flash(`手满，弃置${ev.card ? `「${def(ev.card).name}」` : ''}`, 1800);
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
    const top = safe.y;
    const main: Rect = { x: w - 138 - 14, y: Math.min(top + 478, handArea.y - 188 - 8), w: 138, h: 188 };
    const sub: Rect = { x: main.x - 64, y: main.y + 22, w: 76, h: 104 };
    return {
      top: { x: 0, y: top + 10, w, h: 26 },
      backY: top + 58,
      frontY: top + 200,
      judge: { x: (w - 220) / 2, y: top + 388, w: 220, h: 80 },
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
    let gap = front ? 18 : BACK_ROW_GAP;
    if (!front && row.length > 1) {
      const maxGap = Math.max(8, (this.W - 24 - row.length * cw) / (row.length - 1));
      gap = Math.min(gap, maxGap);
    }
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
    if (this.introStep) {
      if (e.type === 'tap') this.skipIntro();
      return true; // 演出期间阻塞输入，只接受点击跳过
    }
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
    // 致命光晕：减少动态时为常亮（不脉冲），不需要逐帧重绘
    const lethalPulse =
      !this.reducedMotion() &&
      this.g?.alive().some((e) => {
        const it = enemyIntent(e);
        return it.dmg > 0 && it.dmg >= this.g.p.hp + this.g.p.armor;
      });
    const before =
      this.q.busy ||
      !!this.drag ||
      this.hintT > 0 ||
      this.confirmT > 0 ||
      this.shakeT > 0 ||
      !!lethalPulse ||
      (!!this.g && isDying(this.g.p.hp) && this.g.p.hp > 0) ||
      dyingFading(this.dyingEdge);
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
  fxNow() {
    return this.deps.now?.() ?? performance.now();
  }
  reducedMotion() {
    return this.deps.reducedMotion?.() ?? prefersReducedMotion();
  }
  reviveFxActive() {
    if (this.reviveFx && reviveFxDone(this.reviveFx, this.fxNow(), this.reducedMotion())) this.reviveFx = null;
    return !!this.reviveFx;
  }
  animating() {
    return this.reviveFxActive() || this.q.busy || !!this.drag || this.hintT > 0 || this.confirmT > 0 || this.shakeT > 0 || (this.lp?.progress ?? 0) > 0;
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
    const is = this.introStep;
    if (is) {
      const d = is.data as { intro: IntroData; skipAt?: number; freezeT?: number };
      const tt = d.freezeT ?? is.t;
      drawBossIntro(ctx, d.intro, introFrame(d.intro.kind, tt, this.reducedMotion(), d.skipAt), w, h, d.intro.kind === 'first');
    }
    this.drawSeal(ctx);
    this.lp?.draw(s);
  }

  /** 顶条文案：全部读 core 状态，不写死（#55） */
  topBar() {
    const g = this.g;
    return { left: `第${this.deps.battleNo?.() ?? g.battleIdx + 1}战 · ${g.battle?.name ?? ''}`, right: `第 ${g.turn} 回合 · 牌堆 ${g.draw.length}` };
  }

  /**
   * 金山影矩形（#118 测试用）：全部在 0…W 内。
   * #130 起屏风（screen.ts）自带描金山影，drawBg 不再画这组矩形，避免山影画两遍；保留为 #118 的出框回归基准。
   */
  mountainRects(): Rect[] {
    const w = this.W;
    return Array.from({ length: 5 }, (_, i) => {
      const x0 = Math.max(0, i * (w / 5) - 10);
      const x1 = Math.min(w, i * (w / 5) + w / 5 + 20);
      return { x: x0, y: 150 + (i % 2) * 30, w: x1 - x0, h: 220 };
    });
  }

  /** 金漆屏风（#130，render-spec §8.8.1），替换原 6 层同心色块占位与矩形山影 */
  drawBg(ctx: Ctx2DLike) {
    drawScreenBg(ctx, this.W, this.H);
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
    drawSuit(ctx, c.suit, x + 11, r.y + 27, 11, red ? C.cinnabar : C.ink);
    text(ctx, RANK_CH[c.rank], x + 11, r.y + 45, { size: 11, color: red ? C.cinnabar : C.ink, font: FONT.num, align: 'center', bold: true });
    // 卡名（底部书法）
    // #141：按字数分档 20/16/13（·不计），最小 12、不省略，再不够 scaleX≥0.85；全名见长按详情
    const nm = this.cardName(ctx, handName(d), r.w);
    const sx = ctx as unknown as { save?(): void; restore?(): void; translate?(x: number, y: number): void; scale?(x: number, y: number): void };
    if (nm.scaleX < 1 && sx.save && sx.translate && sx.scale && sx.restore) {
      // 12px 仍放不下：以卡中线为轴横向压缩（≥0.85）
      sx.save();
      sx.translate(x + r.w / 2, 0);
      sx.scale(nm.scaleX, 1);
      text(ctx, nm.text, 0, r.y + r.h - 15, { size: nm.px, color: C.ink, font: FONT.brush, align: 'center' });
      sx.restore();
    } else text(ctx, nm.text, x + r.w / 2, r.y + r.h - 15, { size: nm.px, color: C.ink, font: FONT.brush, align: 'center' });
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
    // 体力（#129，§8.8.2）：一律数字。普通 / 精英底部小牌「● cur/max」；Boss 或 >10 血条
    this.drawEnemyHp(ctx, r, e);
    // 护盾（左下）
    if (e.armor > 0) this.shield(ctx, r.x - 10, r.y + r.h - 34, e.armor, 24);
    // 意图（右上）
    const ir = this.intentRect(e)!;
    const it = enemyIntent(e);
    const lethal = it.dmg > 0 && it.dmg >= this.g.p.hp + this.g.p.armor;
    if (lethal) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * lethalGlowAlpha(this.deps.now?.() ?? performance.now(), this.reducedMotion()) * 0.35;
      rect(ctx, { x: ir.x - 4, y: ir.y - 4, w: ir.w + 8, h: ir.h + 8 }, C.cinnGlow);
      ctx.globalAlpha = a0;
    }
    const fx = this.reviveFx && this.reviveFx.prev.has(e.uid) ? reviveFxFrame(this.reviveFx, e.uid, this.fxNow(), this.reducedMotion()) : null;
    if (fx && fx.oldAlpha > 0) {
      const old = { ...it, ...this.reviveFx!.prev.get(e.uid)! };
      const ia = ctx.globalAlpha;
      ctx.globalAlpha = ia * fx.oldAlpha;
      this.drawIntent(ctx, ir, old, false);
      if (fx.ink > 0) {
        ctx.globalAlpha = ia * fx.oldAlpha * fx.ink;
        rect(ctx, ir, C.ink); // 化墨
      }
      ctx.globalAlpha = ia;
    }
    const introA = this.intentIntroAlpha();
    if (introA > 0) {
      const ia = ctx.globalAlpha;
      ctx.globalAlpha = ia * (fx ? fx.newAlpha : 1) * introA;
      this.drawIntent(ctx, ir, it, lethal);
      ctx.globalAlpha = ia;
    }
    // 闪标记 / 判定区
    const cr = this.countdownRect(e)!;
    circle(ctx, cr.x + 15, cr.y + 15, 14, C.lac0);
    ring(ctx, cr.x + 15, cr.y + 15, 14, C.cinnabar, 2);
    text(ctx, '1', cr.x + 15, cr.y + 16, { size: 13, color: C.paper, font: FONT.num, align: 'center', bold: true });
    if (e.marks > 0) text(ctx, `闪×${e.marks}`, r.x + r.w / 2, r.y + r.h + 10, { size: 11, color: C.defIntent, align: 'center' });
    if (e.judge.length) text(ctx, e.judge.map((c) => def(c).name[0]).join(''), r.x + r.w - 8, r.y + r.h + 10, { size: 11, color: C.gold, align: 'right' });
    ctx.globalAlpha = a0;
  }

  /** 意图框（图标 + 数字） */
  drawIntent(ctx: Ctx2DLike, ir: Rect, it: ReturnType<typeof enemyIntent>, lethal: boolean) {
    rect(ctx, ir, lethal ? C.cinnabar : C.lac1);
    frame(ctx, ir, lethal ? C.cinnGlow : C.gold, lethal ? 1.5 : 1);
    const defOnly = it.dmg === 0 && it.acts.includes('闪');
    const icon = intentIcon(it.dmg, defOnly);
    text(ctx, icon, ir.x + 13, ir.y + 14, { size: 15, color: it.dmg > 0 ? C.dmg : defOnly ? C.defIntent : C.gold, align: 'center' });
    text(ctx, it.dmg > 0 ? String(it.dmg) : defOnly ? `${it.acts.filter((x) => x === '闪').length}` : '?', ir.x + 34, ir.y + 14, {
      size: 16,
      color: C.paper,
      font: FONT.num,
      align: 'center',
      bold: true,
    });
  }

  /**
   * 武将体力（#129，render-spec §8.8.2）：≤6 勾玉（间距按卡内窗宽算，不出框）；>6 紧凑式 1 勾玉 + 「×N」/「cur/max」胶囊。
   * 底部居中 y = 卡底 − 6（胶囊下沿）。
   */
  drawHeroHp(ctx: Ctx2DLike, card: Rect, hp: number, max: number) {
    const cx = card.x + card.w / 2;
    const innerW = card.w - 10 - 12; // 卡内窗（左右各 5 描边）− 12
    const v = heroHpView(hp, max, cx, innerW);
    if (v.mode === 'dots') {
      const cy = card.y + card.h - 6 - BEAD_D / 2;
      v.xs.forEach((x, i) => circle(ctx, x, cy, v.r, i < v.filled ? C.jade : '#3A3A3A'));
      return;
    }
    const capH = 24;
    const capW = compactHpW(v);
    const cap = { x: cx - capW / 2, y: card.y + card.h - 6 - capH, w: capW, h: capH };
    rect(ctx, cap, 'rgba(15,7,5,0.85)');
    frame(ctx, cap, C.goldLo, 1);
    const cy = cap.y + capH / 2;
    const bx = cap.x + 8 + BEAD_D / 2;
    circle(ctx, bx, cy, BEAD_D / 2, v.empty ? '#3A3A3A' : C.jade);
    const tx = bx + BEAD_D / 2 + 6;
    if (v.full) text(ctx, `×${v.max}`, tx, cy + 1, { size: 15, color: C.paper, font: FONT.num, bold: true });
    else {
      const cs = String(v.cur);
      text(ctx, cs, tx, cy + 1, { size: 15, color: C.paper, font: FONT.num, bold: true });
      text(ctx, `/${v.max}`, tx + cs.length * 9 + 1, cy + 2, { size: 11, color: C.paper3, font: FONT.num });
    }
  }
  /** 敌人体力矩形（不出卡框；测试与绘制共用） */
  /** 开发调试：强制血量 / Boss / 最长牌名 / 打开某张牌的详情（只在开发构建传入） */
  // ---------- 首领登场演出（#107） ----------
  /** 正在播的登场 / 阶段演出步骤 */
  get introStep() {
    const s = this.q.current;
    return s && (s.id === 'boss_intro' || s.id === 'boss_phase') ? s : null;
  }
  introData(e: Enemy, kind: IntroKind, line?: string): IntroData {
    return { kind, name: e.name, chapter: CONFIG.enemies[e.id]?.chapter ?? 1, line };
  }
  /** 开战：首领（节点类型 boss，直达调试看 tier）有台词就播登场；看过的首领播 0.8s */
  startIntro(force?: IntroKind, freezeT?: number) {
    const boss = this.g.en.find((e) => e.tier === 'Boss' && e.intro?.line && this.isBoss(e));
    const src = boss ?? (force ? this.previewBoss() : null);
    if (!src) return;
    const seen = this.deps.seenBosses;
    let kind: IntroKind = force ?? (seen?.has(src.id) ? 'repeat' : 'first');
    if (!force) seen?.add(src.id);
    const line = kind === 'phase' ? src.intro?.phaseLine : src.intro?.line;
    if (!line && kind === 'phase') kind = 'first';
    const data: Record<string, unknown> = { intro: this.introData(src, kind, line ?? src.intro?.line) };
    if (freezeT != null) data.freezeT = freezeT;
    const dur = freezeT != null ? 1e9 : INTRO_MS[kind];
    void this.q.pushFront(kind === 'phase' ? 'boss_phase' : 'boss_intro', dur, data);
    const step = this.q.current!;
    const resolve = step.done;
    // 同步接上意图弹出（不等微任务，避免演出结束那一帧意图闪现）
    step.done = () => {
      resolve?.();
      if (kind !== 'phase') void this.q.push('intent_in', this.reducedMotion() ? 0 : 250, false);
    };
  }
  /** 调试预览：本场没有首领时借第 1 章首领的名字与台词 */
  private previewBoss(): Enemy | null {
    const id = String((CONFIG.rules as { boss?: Record<string, string> }).boss?.[1] ?? 'B1');
    const cfg = CONFIG.enemies[id];
    return cfg?.intro ? ({ id, name: cfg.name, tier: cfg.tier, intro: cfg.intro } as Enemy) : null;
  }
  /** 点击跳过：从当前帧起 150ms 淡出 */
  skipIntro() {
    const s = this.introStep;
    if (!s || !s.data || s.data.skipAt != null) return;
    if (s.data.freezeT != null) return;
    s.data.skipAt = s.t;
    s.durationMs = Math.min(s.durationMs, s.t + SKIP_FADE_MS);
  }
  /** 意图：登场演出中不显示；结束后 250ms 弹出 */
  intentIntroAlpha(): number {
    const s = this.q.current;
    if (s?.id === 'boss_intro') return 0;
    const f = this.q.free.find((x) => x.id === 'intent_in');
    return f ? this.q.progress(f) : 1;
  }

  applyDev(d: BattleDevOverrides) {
    const g = this.g;
    if (d.intro) {
      // 预览：替换开战时自动排上的登场演出
      const cur = this.introStep;
      if (cur) {
        cur.durationMs = 0;
        this.q.update(0);
      }
      this.startIntro(d.intro, d.introT);
    }
    const max = d.maxHp ?? d.hp;
    if (max) {
      g.p.maxHp = max;
      g.p.hp = Math.min(d.hp ?? max, max);
    }
    if (d.ehp) for (const e of g.en) e.hp = e.max = d.ehp;
    const put = (id: string) => {
      if (!CARDS[id]) return -1;
      const i = g.hand.findIndex((c) => c.id === id);
      if (i >= 0) return i;
      if (!g.hand.length) return -1;
      g.hand[0] = { ...g.hand[0], id, mods: [] };
      return 0;
    };
    if (d.longName) put(Object.entries(CARDS).sort((a, b) => b[1].name.length - a[1].name.length)[0][0]);
    if (d.detail) {
      const i = put(d.detail);
      const ov = this.deps.overlays;
      if (i >= 0 && ov && this.deps.measure) {
        const r = this.handLayoutAt(-1).rects[i];
        const safe = this.deps.safe ?? { x: 0, y: 0, w: this.W, h: this.H };
        if (r) openDetail(ov, cardDetail(g.hand[i]), { x: r.x + r.w / 2, y: r.y + r.h / 2 }, safe, this.deps.measure());
      }
    }
  }
  /** Boss 判定：地图节点类型优先；直达调试（无节点）退回敌人数据 tier === 'Boss' */
  isBoss(e: Pick<Enemy, 'tier'>): boolean {
    if (this.deps.dev?.boss) return true;
    const t = this.deps.nodeType?.();
    return t ? t === 'BOSS' : e.tier === 'Boss';
  }
  enemyHpRect(r: Rect, e: Pick<Enemy, 'hp' | 'max' | 'tier'>, boss = this.isBoss(e)): Rect {
    const v = enemyHpView(e.hp, e.max, boss);
    if (v.mode === 'bar') return { x: r.x + 6, y: r.y + r.h - 16, w: r.w - 12, h: 10 };
    const w = Math.min(r.w - 8, 8 + 8 + 4 + v.text.length * 7 + 8);
    return { x: r.x + (r.w - w) / 2, y: r.y + r.h - 20, w, h: 16 };
  }
  drawEnemyHp(ctx: Ctx2DLike, r: Rect, e: Enemy) {
    const v = enemyHpView(e.hp, e.max, this.isBoss(e));
    const b = this.enemyHpRect(r, e);
    if (v.mode === 'bar') {
      rect(ctx, b, '#2A2A2A');
      rect(ctx, { ...b, w: b.w * v.ratio }, C.cinnabar);
      rect(ctx, { ...b, h: 3, w: b.w * v.ratio }, C.cinnGlow);
      frame(ctx, b, C.gold, 1);
      text(ctx, v.text, b.x + b.w / 2, b.y + b.h / 2, { size: 10, color: C.paper, font: FONT.num, align: 'center', bold: true });
      return;
    }
    rect(ctx, b, 'rgba(15,7,5,0.85)');
    frame(ctx, b, C.goldLo, 1);
    circle(ctx, b.x + 8 + 4, b.y + b.h / 2, 4, C.cinnabar);
    text(ctx, v.text, b.x + 8 + 8 + 4, b.y + b.h / 2 + 1, { size: 12, color: C.paper, font: FONT.num, bold: true });
  }
  heroHpRect(card: Rect, hp: number, max: number): Rect {
    const v = heroHpView(hp, max, card.x + card.w / 2, card.w - 22);
    if (v.mode === 'dots') return { x: v.xs[0] - v.r, y: card.y + card.h - 6 - BEAD_D, w: v.xs[v.xs.length - 1] - v.xs[0] + BEAD_D, h: BEAD_D };
    const capW = compactHpW(v);
    return { x: card.x + card.w / 2 - capW / 2, y: card.y + card.h - 30, w: capW, h: 24 };
  }

  /** 卡名适配（按名字+卡宽缓存）；量宽用当前 ctx 的 Brush 字体 */
  cardName(ctx: Ctx2DLike, name: string, cardW: number) {
    return fitNameCached(name, cardW, (t, px) => {
      const prev = ctx.font;
      ctx.font = `${px}px ${FONT.brush}`;
      const w = textWidth(ctx, t, px);
      ctx.font = prev;
      return w;
    });
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
      // dying（§3.3）：朱砂 2px 外轮廓脉动，只给主将
      const ea = dyingEdgeAlpha(this.dyingEdge, g.p.hp, this.deps.now?.() ?? performance.now(), this.deps.reducedMotion?.() ?? prefersReducedMotion());
      if (ea > 0) {
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * ea;
        frame(ctx, inset(r, -DYING_EDGE_W), DYING_EDGE_COLOR, DYING_EDGE_W); // 只描外轮廓，不动牌面
        ctx.globalAlpha = a;
      }
      goldFrame(ctx, r, 'gold', 4);
      rect(ctx, { x: r.x + 6, y: r.y + 6, w: r.w - 12, h: r.h - 34 }, '#3B2C22');
      text(ctx, g.main.name.slice(-1), r.x + r.w / 2 + 10, r.y + 80, { size: 64, color: 'rgba(243,235,216,0.2)', font: FONT.brush, align: 'center' });
      vtext(ctx, g.main.name, r.x + 20, r.y + 24, 26, C.paper);
      this.drawHeroHp(ctx, r, g.p.hp, g.p.maxHp);
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
      // 花色矢量形 + 点数（Brush 无 ♠♥♣♦ 字形）
      drawSuit(ctx, j.suit, cr.x + cr.w / 2 - 9, cr.y + 29, 14, j.red ? C.cinnabar : C.ink);
      text(ctx, RANK_CH[j.rank] ?? String(j.rank), cr.x + cr.w / 2 + 8, cr.y + 34, {
        size: 16,
        color: j.red ? C.cinnabar : C.ink,
        align: 'center',
        bold: true,
      });
      if (j.name) text(ctx, j.name, cr.x + cr.w / 2, cr.y + 56, { size: 11, color: C.ink, align: 'center' });
      if (j.effective != null) drawVecGlyph(ctx, j.effective ? '✗' : '✓', r.x + r.w - 26, r.y + 32, 22, j.effective ? C.cinnabar : C.jade); // Brush 无 ✗✓：画矢量
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

/** 致命意图光晕强度：正常 1.2s 脉冲（.55–1）；减少动态时常亮 1（#136） */
export function lethalGlowAlpha(now: number, reduced: boolean) {
  return reduced ? 1 : 0.55 + 0.45 * Math.sin((now / 1200) * Math.PI * 2);
}
