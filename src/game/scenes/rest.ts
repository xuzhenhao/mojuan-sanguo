/**
 * P4b 营地 rest（#90；docs/specs/rest-v05.md，PRD 10.6，设计稿 v3/rest.html 与 rest.html#wx）。
 * - 三个行动圆章：疗伤 / 淬炼 / 焚稿，点选高亮后「确定」执行；每次营地只做一项，完成后显示结果并「回地图」。
 * - 疗伤：applyRestHeal + 青囊书加成；体力满置灰。
 * - 淬炼：选牌（无可用词条的牌置灰）→ 均匀随机 1 条 N/R 词条 → 铭刻；已有 2 条走「替换 / 放弃」。
 * - 焚稿：选牌删除（删后 ≥8 且留 1 张杀，与集市删牌同规则）。
 * - 微信（env.wx）：焚稿需广告解锁（广告未接入，先置灰提示）。
 * - 只用 390×844 设计坐标；弹层遮罩由引擎按 scrim 全屏绘制（render-spec §4.0）。
 */
import type { Rng } from '../../core/rng';
import type { AffixDef, CardInst } from '../../core/types';
import { def } from '../../core/rules';
import {
  applyRestHeal,
  applyTemper,
  canBurn,
  canBurnAny,
  canTemper,
  canTemperCard,
  MAX_AFFIXES,
  restHealAmount,
  restRelicBonus,
  rollTemper,
  type RestAction,
  type RestConfig,
} from '../../core/run/rest';
import { AFFIXES } from '../../data/affixes';
import { ECONOMY } from '../../data/economy';
import type { GestureEvent } from '../../engine/input';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect } from '../../engine/types';
import type { Inventory } from '../economy/inventory';
import { inside, wrap } from '../overlays/theme';
import type { RestRouteParams } from '../map/route';
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
  toast,
  vgrad,
  type Button,
  type Env,
} from './p4-kit';
import { pickDeckCard } from './shop';

/** 局内体力与存档（地图会话提供；直入调试用内存替身） */
export interface RestRun {
  head(): { hp: number; maxHp: number };
  /** 写回体力与牌组并落盘 */
  save(patch: { hp: number; deck: CardInst[] }): void;
  readonly restConfig: RestConfig;
}
export interface RestEnv extends Env {
  inventory(): Inventory;
  rng(): Rng;
  run(): RestRun;
  /** 回地图：发出 rest_done */
  done(): void;
  /** 微信端：焚稿需广告解锁 */
  wx?: boolean;
  /** 埋点（rest_enter / rest_choose / rest_temper / rest_burn） */
  track?(ev: string, data: Record<string, unknown>): void;
}
export type RestParams = Partial<RestRouteParams> | undefined;

export interface RestResult {
  action: RestAction;
  text: string;
  /** 疗伤后的体力（其余行动不变） */
  hp?: number;
}

const affix = (id: string): AffixDef | undefined => AFFIXES.find((a) => a.id === id);

export class RestScene implements Scene<RestParams> {
  readonly id = 'rest';
  /** 营地与宝箱、商人共用 scene_misc 图集（flow.md §5） */
  readonly atlasScene = 'reward';
  ctx!: SceneContext;
  selected: RestAction | null = null;
  /** 本次营地已完成的行动（完成后其它行动锁定） */
  result: RestResult | null = null;
  /** 选牌/铭刻流程进行中（防连点） */
  busy = false;
  readonly log: string[] = [];
  constructor(private env: RestEnv) {}

  get inv() {
    return this.env.inventory();
  }
  enter(ctx: SceneContext, p?: RestParams) {
    this.ctx = ctx;
    this.selected = null;
    this.result = null;
    this.busy = false;
    this.track('rest_enter', { fixed: !!p?.fixed, layer: p?.layer });
  }
  exit() {
    this.env.overlays.closeAll('popup');
    this.env.overlays.closeAll('toast');
  }
  private track(ev: string, data: Record<string, unknown>) {
    this.log.push(ev);
    this.env.track?.(ev, data);
  }

  // ---------- 规则视图 ----------
  healPreview() {
    const h = this.env.run().head();
    return { ...applyRestHeal(h.hp, h.maxHp, this.env.run().restConfig, restRelicBonus(this.inv.relics)), maxHp: h.maxHp, before: h.hp };
  }
  /** 疗伤公式值（含青囊书；圆章上显示，不受当前体力影响） */
  healAmount() {
    return restHealAmount(this.env.run().head().maxHp, this.env.run().restConfig, restRelicBonus(this.inv.relics));
  }
  /** 行动不可用原因（null = 可用） */
  blocked(a: RestAction): string | null {
    if (this.result) return '本次营地已行动';
    if (a === 'heal') return this.healPreview().healed <= 0 ? '体力已满' : null;
    if (a === 'temper') return canTemper(this.inv.deck) ? null : '牌组暂无可淬炼的牌';
    if (this.env.wx) return '看一段视频即可解锁焚稿（广告暂未接入）';
    return canBurnAny(this.inv.deck, ECONOMY.minDeck) ? null : '牌组已无可焚的牌';
  }

  // ---------- 布局（v3/rest.html） ----------
  static readonly ACTIONS: RestAction[] = ['heal', 'temper', 'burn'];
  optRect(i: number): Rect {
    return { x: 14 + i * 125, y: 360, w: 112, h: 200 };
  }
  buttons(): Button[] {
    const { width: w, height: h } = this.ctx;
    const y = h - BAR_H + 15;
    if (this.result) return [{ id: 'back', rect: { x: w - 130, y, w: 120, h: 44 }, text: '回地图', kind: 'confirm', font: BRUSH(18) }];
    return [
      { id: 'leave', rect: { x: w - 222, y, w: 86, h: 44 }, text: '离开', kind: 'secondary', font: BRUSH(18) },
      {
        id: 'ok',
        rect: { x: w - 126, y, w: 116, h: 44 },
        text: '确定',
        kind: 'primary',
        disabled: !this.selected || !!this.blocked(this.selected) || this.busy,
        font: BRUSH(18),
      },
    ];
  }

  // ---------- 交互 ----------
  gesture(e: GestureEvent) {
    if (e.type !== 'tap' || this.busy) return e.type === 'tap';
    const i = RestScene.ACTIONS.findIndex((_, k) => inside(this.optRect(k), e.at));
    if (i >= 0 && !this.result) {
      const a = RestScene.ACTIONS[i];
      const why = this.blocked(a);
      if (why) toast(this.env.overlays, why, this.ctx.width, 300);
      else this.selected = a;
      this.ctx.invalidate('main');
      return true;
    }
    const b = hitButton(this.buttons(), e.at);
    if (!b) return false;
    if (b.id === 'leave') {
      this.track('rest_choose', { action: 'leave' });
      this.env.done();
    } else if (b.id === 'back') this.env.done();
    else if (b.id === 'ok' && this.selected) void this.perform(this.selected);
    return true;
  }

  /** 执行一项行动；取消选牌返回 false（不消耗本次营地） */
  async perform(a: RestAction): Promise<boolean> {
    if (this.result || this.blocked(a)) return false;
    this.busy = true;
    try {
      const r = a === 'heal' ? this.heal() : a === 'temper' ? await this.temper() : await this.burn();
      if (!r) return false;
      this.result = r;
      this.track('rest_choose', { action: a });
      this.env.run().save({ hp: r.hp ?? this.env.run().head().hp, deck: this.inv.deck });
      return true;
    } finally {
      this.busy = false;
      this.ctx.invalidate('main');
    }
  }

  private heal(): RestResult {
    const p = this.healPreview();
    return { action: 'heal', hp: p.hp, text: `围炉小憩，回复 ${p.healed} 点体力（${p.hp}/${p.maxHp}）` };
  }

  private async temper(): Promise<RestResult | null> {
    const deck = this.inv.deck;
    const { width: w, height: h } = this.ctx;
    const uid = await pickDeckCard(this.env, w, h, this.inv, '淬炼 · 择一张牌', {
      ok: (c) => canTemperCard(c, deck),
      hint: `随机获得 1 条 N/R 词条 · 每张牌最多 ${MAX_AFFIXES} 条`,
      confirm: null,
      reject: () => '此牌暂无可用词条',
    }).result;
    if (uid === undefined) return null;
    const card = deck.find((c) => c.uid === uid)!;
    const a = rollTemper(this.env.rng(), card, deck);
    if (!a) return null;
    const name = def(card).name;
    const full = card.mods.length >= MAX_AFFIXES;
    const opts: ChoiceOpt[] = full
      ? [
          ...card.mods.map((m) => ({ id: m, text: `替换「${affix(m)?.n ?? m}」`, kind: 'primary' as const })),
          { id: 'skip', text: '放弃', kind: 'secondary' as const },
        ]
      : [{ id: 'ok', text: '铭刻', kind: 'confirm' as const }];
    const lines = [`「${name}」获得词条「${a.n}」（${a.r}）：${a.d}`];
    if (full) lines.push(`此牌已有 ${MAX_AFFIXES} 条词条：替换其中一条，或放弃（本次营地仍算已行动）。`);
    const pick = await choice(this.env, w, h, '淬炼', lines, opts).result;
    if (pick === 'skip' || pick === undefined) return { action: 'temper', text: `放弃淬炼，「${name}」保持原样` };
    applyTemper(card, a.id, full ? pick : undefined);
    this.track('rest_temper', { cardId: card.id, affixId: a.id, replaced: full ? pick : null });
    return { action: 'temper', text: `「${name}」铭刻词条「${a.n}」` };
  }

  private async burn(): Promise<RestResult | null> {
    const inv = this.inv;
    const { width: w, height: h } = this.ctx;
    const uid = await pickDeckCard(this.env, w, h, inv, '焚稿 · 删 1 张牌', { ok: (c) => canBurn(inv.deck, c.uid, ECONOMY.minDeck) }).result;
    if (uid === undefined) return null;
    const i = inv.deck.findIndex((c) => c.uid === uid);
    if (i < 0 || !canBurn(inv.deck, uid, ECONOMY.minDeck)) return null;
    const [card] = inv.deck.splice(i, 1); // 原地删：与 core deckMaster 共享引用
    this.track('rest_burn', { cardId: card.id });
    return { action: 'burn', text: `「${def(card).name}」已焚，牌组余 ${inv.deck.length} 张` };
  }

  // ---------- 绘制 ----------
  animating() {
    return false;
  }
  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      drawBackdrop(c, w, h);
      drawFire(c, w / 2, 150);
      return;
    }
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    drawTag(c, '营地');
    this.drawHp(c);
    RestScene.ACTIONS.forEach((a, i) => this.drawOption(c, a, i));
    if (this.result) {
      const r = { x: 24, y: 584, w: w - 48, h: 64 };
      vgrad(c, r, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
      frame3(c, r, T.goldMid);
      const lines = wrap(c, this.result.text, r.w - 24, 14);
      lines.slice(0, 2).forEach((ln, k) => label(c, ln, w / 2, r.y + 28 + k * 20 - (lines.length > 1 ? 8 : 0), SANS(14), T.paper, 'center'));
    } else if (this.env.wx) {
      label(c, '焚稿：看一段视频即可获得，不看也不影响进度', w / 2, 600, SANS(11), T.paper3, 'center');
    }
    drawBottomBar(c, w, h, this.inv.deck.length);
    for (const b of this.buttons()) drawButton(c, b);
  }

  /** 体力珠：已有实心、疗伤预览（选中疗伤时）为浅玉、空为暗 */
  private drawHp(c: Surface['ctx']) {
    const h = this.env.run().head();
    const p = this.healPreview();
    const show = this.selected === 'heal' && !this.result ? p.hp : h.hp;
    const n = Math.max(1, h.maxHp);
    const gap = 23;
    const x0 = this.ctx.width / 2 - ((n - 1) * gap) / 2;
    for (let k = 0; k < n; k++) {
      const fill = k < h.hp ? T.jade : k < show ? T.jadeHi : T.lac3;
      circle(c, x0 + k * gap, 318, 7.5, fill, T.goldLo, 1);
    }
  }

  private drawOption(c: Surface['ctx'], a: RestAction, i: number) {
    const r = this.optRect(i);
    const sel = this.selected === a && !this.result;
    const off = !!this.blocked(a) && !(this.result?.action === a);
    const ga = c.globalAlpha;
    if (off) c.globalAlpha = ga * 0.45;
    const y = sel ? r.y - 8 : r.y;
    vgrad(c, { ...r, y }, 'rgba(42,20,16,.95)', 'rgba(15,7,5,.95)');
    frame3(c, { ...r, y }, sel ? T.goldHi : T.goldMid);
    const cx = r.x + r.w / 2;
    const color = a === 'heal' ? T.jadeHi : a === 'temper' ? T.gold : T.dmg;
    circle(c, cx, y + 51, 33, T.lac1, a === 'burn' && this.env.wx ? T.goldLo : T.gold, 2);
    label(c, a === 'heal' ? '♥' : a === 'temper' ? '火' : '焚', cx, y + 63, BRUSH(30), color, 'center');
    label(c, a === 'heal' ? '疗伤' : a === 'temper' ? '淬炼' : '焚稿', cx, y + 124, BRUSH(26), T.gold, 'center');
    const v = a === 'heal' ? `+${this.healAmount()}` : a === 'temper' ? '+词条' : '−1';
    label(c, v, cx, y + 156, a === 'temper' ? BRUSH(16) : SANS(15), color, 'center');
    if (a === 'burn' && this.env.wx) label(c, '▶ 解锁', cx, y + 182, SANS(12), T.gold, 'center');
    c.globalAlpha = ga;
  }
}

/** 营火（占位：正式美术进 scene_misc 图集） */
function drawFire(c: Surface['ctx'], cx: number, y: number) {
  circle(c, cx, y + 80, 150, 'rgba(255,150,70,.10)');
  circle(c, cx, y + 80, 90, 'rgba(255,150,70,.14)');
  circle(c, cx, y + 92, 34, 'rgba(255,154,74,.85)');
  circle(c, cx, y + 70, 22, 'rgba(255,233,168,.9)');
  c.fillStyle = '#2a1a08';
  c.fillRect(cx - 40, y + 124, 80, 8);
}

export interface ChoiceOpt {
  id: string;
  text: string;
  kind: Button['kind'];
}
/** 必选浮层（不可点外部关闭）：结果为选项 id */
export function choice(env: Env, w: number, h: number, title: string, lines: string[], opts: ChoiceOpt[]) {
  const pw = 320;
  const m = env.measure();
  const wrapped = lines.flatMap((l) => wrap(m, l, pw - 48, 14));
  const ph = 70 + wrapped.length * 20 + 20 + opts.length * 52;
  const r = { x: (w - pw) / 2, y: Math.max(60, (h - ph) / 2 - 20), w: pw, h: ph };
  const btn = (i: number): Button => ({
    id: opts[i].id,
    rect: { x: r.x + 30, y: r.y + 70 + wrapped.length * 20 + 14 + i * 52, w: pw - 60, h: 44 },
    text: opts[i].text,
    kind: opts[i].kind,
    font: BRUSH(18),
  });
  const bs = opts.map((_, i) => btn(i));
  return env.overlays.push<string>({
    id: `rest-choice:${title}`,
    kind: 'popup',
    rect: r,
    scrim: { color: 'rgba(5,2,1,.72)' },
    draw: (s) => {
      const c = s.ctx;
      vgrad(c, r, 'rgba(42,20,16,.98)', 'rgba(15,7,5,.98)');
      frame3(c, r);
      label(c, title, r.x + pw / 2, r.y + 40, BRUSH(24), T.gold, 'center');
      wrapped.forEach((ln, k) => label(c, ln, r.x + 24, r.y + 76 + k * 20, SANS(14), T.paper));
      for (const b of bs) drawButton(c, b);
    },
    gesture: (e, hd) => {
      if (e.type !== 'tap') return true;
      const b = bs.find((x) => inside(x.rect, e.at));
      if (b) hd.close(b.id);
      return true;
    },
  });
}
