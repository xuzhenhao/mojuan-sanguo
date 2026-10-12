/**
 * 效果引擎：事件总线 + DSL 原子解释器（数据驱动 ②③）。
 * 能力（ability）= trigger.when + limit + if[] + do[]，全部来自 config/**.yaml。
 * battle.ts 只负责流程，在固定时机 emit 事件；具体效果由这里按配置执行。
 */
import { CONFIG, type Ability } from '../data/config';
import type { Game } from './battle';
import type { CardInst, Enemy } from './types';
import { def, isRed, isShaPlay } from './rules';

export type When = Ability['trigger']['when'];
export type Action = Ability['do'][number];
type Filter = NonNullable<Ability['trigger']['filter']>;

/** 一次事件的上下文 */
export interface Ctx {
  /** 能力所属方：玩家（undefined）或某个敌人 */
  owner?: Enemy;
  /** 事件涉及的牌（打出的牌 / 造成伤害的牌 / 抵消用的闪） */
  card?: CardInst;
  /** 打出时选择的目标 */
  chosen?: Enemy | null;
  /** 杀的来源 / 伤害来源 */
  source?: Enemy;
  /** 伤害属性（deal_damage 事件） */
  element?: string;
  /** 杀已被抵消：抵消它的能力 id 与名称 */
  negatedBy?: string;
  negatedName?: string;
  /** 杀是否至少命中一个目标（灵光一闪用） */
  hit?: boolean;
  /** 判定成功（主动技用于后续联动） */
  judged?: boolean;
  /** 覆盖原子数值（如张角的闪电 amount 2） */
  amountOverride?: number;
}

export interface Source {
  ab: Ability;
  key: string;
  card?: CardInst;
  owner?: Enemy;
}

export type Atom = (g: Game, a: Action, ctx: Ctx, src: Source) => Promise<void> | void;

const SUITS = ['S', 'H', 'C', 'D'] as const;
/** 天机签筒（M1）：52 张标准花色点数 */
export const standardJudgeDeck = (): CardInst[] =>
  SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ uid: -(i + 1), id: 'JUDGE', suit, rank: i + 1, mods: [] })));

function targets(g: Game, t: string | undefined, ctx: Ctx): (Enemy | 'player')[] {
  switch (t ?? 'self') {
    case 'self':
      return [ctx.owner ?? 'player'];
    case 'chosen':
      return ctx.chosen ? [ctx.chosen] : [];
    case 'source':
      return ctx.source && ctx.source.hp > 0 ? [ctx.source] : [];
    case 'all_enemies':
      return g.alive();
    case 'front_row':
      return g.front();
    case 'back_row':
      return g.alive().filter((e) => e.row === 'back');
    case 'random_enemy': {
      const a = g.alive();
      return a.length ? [a[Math.floor(g.rng() * a.length)]] : [];
    }
    default:
      return [];
  }
}

export function judgeOk(c: CardInst, s: NonNullable<Action['success']>) {
  let ok = true;
  if (s.color) ok &&= (s.color === 'red') === isRed(c);
  if (s.suit) ok &&= s.suit.includes(c.suit);
  if (s.rankRange) ok &&= c.rank >= s.rankRange[0] && c.rank <= s.rankRange[1];
  return s.not ? !ok : ok;
}

const amt = (a: Action, ctx: Ctx, d = 1) => ctx.amountOverride ?? a.amount ?? d;

/** 效果原子：每个原子一个函数 */
export const ATOMS: Record<string, Atom> = {
  async damage(g, a, ctx) {
    const c = ctx.card;
    if (a.asSha && a.target === 'chosen' && c && !ctx.owner) {
      // 玩家用杀：走闪标记、酒/傲骨/义勇、词条、技能等完整流程
      ctx.hit = await g.playerSha(c, ctx.chosen!, amt(a, ctx) - 1);
      return;
    }
    const aoe = a.target === 'all_enemies' || a.target === 'front_row' || a.target === 'back_row';
    const n = amt(a, ctx) + (aoe && c ? g.effects.cardStat(c, 'aoe_damage') : 0);
    const el = a.element === 'fire' ? '火' : a.element === 'thunder' ? '雷' : '普通';
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') {
        await g.dmgPlayer(n, ctx.owner);
        continue;
      }
      if (a.asSha && !a.undodgeable && g.enemyDodges(t, false)) g.log(`${t.name}消耗闪标记，闪避${c ? def(c).name : ''}`);
      else await g.dmgEnemy(t, n, el, c, !ctx.owner || !!c);
    }
  },
  lose_hp(g, a, ctx) {
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') g.p.hp -= amt(a, ctx);
      else t.hp -= amt(a, ctx);
    }
  },
  async heal(g, a, ctx) {
    const n = amt(a, ctx) + (ctx.card ? g.effects.cardStat(ctx.card, 'heal_amount') : 0);
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') await g.healPlayer(n, ctx.card);
      else t.hp = Math.min(t.max, t.hp + n);
    }
  },
  armor(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx)) {
      const who = t === 'player' ? g.p : t;
      who.armor += amt(a, ctx, 0);
      g.log(`${t === 'player' ? '' : t.name + '·'}${src.ab.name}：护甲+${amt(a, ctx, 0)}`);
    }
  },
  remove_armor(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') {
        g.p.armor = Math.max(0, g.p.armor - amt(a, ctx, 0));
        continue;
      }
      const k = Math.min(amt(a, ctx, 0), t.armor);
      t.armor -= k;
      g.log(`${src.ab.name}：${t.name}失去${k}护甲`);
    }
  },
  draw(g, a, ctx, src) {
    const n =
      a.upTo != null
        ? Math.max(0, a.upTo - g.hand.length)
        : amt(a, ctx) + (src.ab.trigger.when === 'play' && ctx.card && src.card === ctx.card ? g.effects.cardStat(ctx.card, 'draw_amount') : 0);
    g.drawN(n);
    g.log(`${src.ab.name}：摸${n}张`);
  },
  discard(g, a, ctx) {
    for (let i = 0; i < amt(a, ctx); i++) {
      let c: CardInst | undefined;
      if (i === 0 && ctx.card && g.hand.includes(ctx.card) && a.choose !== 'hand_worst') c = ctx.card;
      else if (a.choose === 'hand_worst') c = g.worstCard();
      else c = g.hand[Math.floor(g.rng() * g.hand.length)];
      if (c) g.toDiscard(c);
    }
  },
  gain_ling(g, a, ctx) {
    g.p.ling += amt(a, ctx);
  },
  negate_sha(_g, _a, ctx, src) {
    ctx.negatedBy = src.ab.id;
    ctx.negatedName = src.ab.name;
  },
  async judge(g, a, ctx, src) {
    const r = await g.judge(src.ab.name);
    const ok = judgeOk(r, a.success ?? {});
    ctx.judged = ok;
    for (const x of (ok ? a.then : a.else) ?? []) await g.effects.runAtom(x, ctx, src);
  },
  apply_status(g, a, ctx, src) {
    const p = g.p;
    const c = ctx.card;
    const t = ctx.chosen;
    switch (a.status) {
      case 'jiu':
        p.jiu = 1 + (c ? g.effects.cardStat(c, 'jiu_bonus') : 0);
        g.log(`${src.ab.name}：下一张杀伤害+${p.jiu}`);
        break;
      case 'aogu':
        p.aogu = 1;
        g.log(`${src.ab.name}：本回合下一张杀伤害+1`);
        break;
      case 'yiyong':
        p.yiyong = 1;
        g.log(`${src.ab.name}：下一张杀+1且无视距离`);
        break;
      case 'lian_shan':
        p.lianShan = 1;
        break;
      case 'yice':
      case 'xieling':
      case 'empty_draw':
        p.status[a.status] = 1;
        break;
      case 'no_sha':
        if (t) {
          t.noSha = true;
          g.log(`${src.ab.name}：${t.name}本回合不出杀`);
        }
        break;
      case 'lebu':
      case 'shandian':
        if (t && c) {
          t.judge.push(c);
          t.delayLeft = { ...(t.delayLeft ?? {}), [c.uid]: a.duration ?? 1 };
          g.discard = g.discard.filter((x) => x !== c);
          g.log(`${src.ab.name}置入${t.name}判定区`);
        }
        break;
      default:
        throw new Error(`未实现的状态 ${a.status}`);
    }
  },
  /** modify 由 Effects.stat()/cardStat() 汇总；在事件里出现时无即时效果 */
  modify() {},
  /** convert 由 Effects.converts() 查询（出牌 / 响应窗口），无即时效果 */
  convert() {},
  reveal_intent(g, a, ctx, src) {
    const t = ctx.chosen;
    if (!t) return;
    const xs = Array.from({ length: amt(a, ctx) }, (_, i) => t.pat[(t.step + 1 + i) % t.pat.length].join('+'));
    g.log(`${src.ab.name}：${t.name}之后意图 ${xs.join(' → ')}`);
  },
  remove_flash_mark(g, a, ctx) {
    for (const t of targets(g, a.target, ctx)) if (t !== 'player') t.marks = Math.max(0, t.marks - amt(a, ctx));
  },
  add_enemy_acts(g, a, ctx) {
    if (ctx.owner) g.extraActs.set(ctx.owner, [...(g.extraActs.get(ctx.owner) ?? []), ...((a.acts ?? []) as string[])]);
  },
  redirect_sha(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx))
      if (t !== 'player') {
        t.redirect = true;
        g.log(`${src.ab.name}：${t.name}本回合的杀改为打向其友军`);
      }
  },
  chain(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx)) if (t !== 'player') t.chained = true;
    g.log(`${src.ab.name}：敌人进入连环状态`);
  },
};

type Cond = (g: Game, c: { value?: unknown }, ctx: Ctx) => boolean;
const COND: Record<string, Cond> = {
  hp_full: (g) => g.p.hp >= g.p.maxHp,
  hp_at_least: (g, c) => g.p.hp >= Number(c.value),
  hp_lost: (g) => g.p.hp < g.p.maxHp,
  hand_less_than_hp: (g) => g.hand.length < g.p.hp,
  hand_count_at_least: (g, c) => g.hand.length >= Number(c.value),
  hand_count_at_most: (g, c) => g.hand.length <= Number(c.value),
  hand_over_limit: (g) => g.hand.length > g.handLimit(),
  sha_index_in_turn_at_least: (g, c) => g.shaIndex >= Number(c.value),
  has_back_row_ally: (g, _c, ctx) => g.alive().some((x) => x.row === 'back' && x !== ctx.owner),
  target_armor_zero: (_g, _c, ctx) => !!ctx.chosen && ctx.chosen.armor === 0,
  target_chained: (_g, _c, ctx) => !!ctx.chosen?.chained,
  ling_left_at_least: (g, c) => g.p.ling >= Number(c.value),
  partner_is: (g, c) => g.sub.id === c.value,
  partner_faction_is: (g, c) => g.sub.faction === c.value,
  turn_is: (g, c) => g.turn === Number(c.value),
  target_flash_marks_at_least: (_g, c, ctx) => (ctx.chosen?.marks ?? 0) >= Number(c.value),
  alive_enemies_at_least: (g, c) => g.alive().length >= Number(c.value),
  has_skill: (g, c) => [...CONFIG.heroes[g.main.id].mainSkills, CONFIG.heroes[g.sub.id].subSkill].some((a) => a.id === c.value),
};

/** 牌筛选（trigger.filter / convert.from） */
export function cardMatches(c: CardInst | undefined, f: Filter | undefined, element?: string) {
  if (!f) return true;
  if (!c && !(f.tag === 'fire' && element === '火')) return false;
  if (!c) return true;
  if (f.card && c.id !== f.card) return false;
  if (f.color && (f.color === 'red') !== isRed(c)) return false;
  if (f.suit && !f.suit.includes(c.suit)) return false;
  if (f.tag === 'sha' && !isShaPlay(c)) return false;
  if (f.tag === 'shan' && !def(c).shan) return false;
  if (f.tag === 'fire' && element !== '火' && !CONFIG.cards[c.id]?.tags?.includes('fire')) return false;
  if (f.tag && !['sha', 'shan', 'fire'].includes(f.tag) && !CONFIG.cards[c.id]?.tags?.includes(f.tag)) return false;
  return true;
}

export class Effects {
  /** limit 计数：key → 次数；按 per 分桶，在对应时机清零 */
  used: Record<'turn' | 'enemy_turn' | 'battle' | 'run', Map<string, number>> = {
    turn: new Map(),
    enemy_turn: new Map(),
    battle: new Map(),
    run: new Map(),
  };
  /** 本敌方回合已生效的被动免伤次数（M2） */
  quotaUsed = 0;
  /** 强制启用的珠联（回归预设） */
  forceCombos: string[] = [];
  constructor(public g: Game) {}

  reset(per: keyof Effects['used']) {
    this.used[per].clear();
    if (per === 'enemy_turn') this.quotaUsed = 0;
  }

  /** 生效中的珠联 */
  combos() {
    const g = this.g;
    return (CONFIG.heroes[g.main.id].combos ?? []).filter((cb) => cb.partner === g.sub.id && (cb.enabled !== false || this.forceCombos.includes(cb.name)));
  }
  /** 玩家侧常驻能力：主将技 → 副将技 → 珠联 → 装备（含装备上的词条） */
  playerSources(): Source[] {
    const { g } = this;
    const H = CONFIG.heroes;
    const out: Source[] = [];
    for (const ab of H[g.main.id].mainSkills) out.push({ ab, key: 'main:' + ab.id });
    const sub = H[g.sub.id].subSkill;
    out.push({ ab: sub, key: 'sub:' + sub.id });
    for (const cb of this.combos()) for (const ab of cb.abilities) out.push({ ab, key: 'combo:' + ab.id });
    for (const c of Object.values(g.p.equip)) if (c) out.push(...this.cardSources(c));
    return out;
  }
  /** 一张牌自身 + 其词条的能力 */
  cardSources(c: CardInst, withAffixes = true): Source[] {
    const out: Source[] = (CONFIG.cards[c.id]?.abilities ?? []).map((ab) => ({ ab, key: `card:${c.uid}:${ab.id}`, card: c }));
    if (withAffixes) out.push(...this.affixSources(c));
    return out;
  }
  affixSources(c: CardInst): Source[] {
    const out: Source[] = [];
    for (const m of c.mods) for (const ab of CONFIG.affixes.find((a) => a.id === m)?.abilities ?? []) out.push({ ab, key: `affix:${c.uid}:${ab.id}`, card: c });
    return out;
  }
  enemySources(e: Enemy): Source[] {
    return (e.abilities ?? []).map((ab) => ({ ab, key: `enemy:${e.uid}:${ab.id}`, owner: e }));
  }

  /** limit 剩余次数（不消耗）；everyNTurns：只在第 1、1+N、1+2N… 回合可用 */
  remaining(s: Source) {
    const l = s.ab.limit;
    if (l?.everyNTurns && (this.g.turn - 1) % l.everyNTurns !== 0) return 0;
    if (!l?.per || !l.times) return Infinity;
    return l.times - (this.used[l.per as 'turn'].get(s.key) ?? 0);
  }
  consume(s: Source) {
    const l = s.ab.limit;
    if (l?.per && l.times) {
      const m = this.used[l.per as 'turn'];
      m.set(s.key, (m.get(s.key) ?? 0) + 1);
    }
    if (l?.passiveQuota) this.quotaUsed++;
  }
  /** if 条件全部满足（not / negate 取反） */
  condsOk(s: Source, ctx: Ctx) {
    for (const c of s.ab.if ?? []) if (COND[c.type](this.g, c, ctx) === !!(c.not || c.negate)) return false;
    return true;
  }
  ready(s: Source, ctx: Ctx, conds?: boolean) {
    if (this.remaining(s) <= 0) return false;
    const q = CONFIG.rules.mechanics.passiveQuotaPerEnemyTurn;
    if (s.ab.limit?.passiveQuota && q != null && this.quotaUsed >= q) return false;
    return conds ?? this.condsOk(s, ctx);
  }

  async runAtom(a: Action, ctx: Ctx, src: Source) {
    const f = ATOMS[a.do];
    if (!f) throw new Error(`未实现的效果原子 ${a.do}（${src.ab.id}）`);
    await f(this.g, a, ctx, src);
  }

  /** 触发事件：按顺序执行所有匹配的能力；返回 ctx（含 negatedBy 等结果） */
  async emit(when: When, sources: Source[], ctx: Ctx = {}, eventCard?: CardInst): Promise<Ctx> {
    // 打出牌（play）时，本牌各 ability 的 if 条件在结算前一次性求值（顺手牵羊：去掉闪标记后不再去护甲）
    const snap = when === 'play' ? new Map(sources.map((s) => [s, this.condsOk(s, ctx)])) : null;
    for (const s of sources) {
      if (s.ab.trigger.when !== when) continue;
      if (!cardMatches(eventCard ?? ctx.card, s.ab.trigger.filter, ctx.element)) continue;
      if (!this.ready(s, ctx, snap?.get(s))) continue;
      this.consume(s);
      const local: Ctx = { ...ctx, owner: s.owner ?? ctx.owner, card: s.card ?? ctx.card };
      for (const a of s.ab.do) {
        await this.runAtom(a, local, s);
        if (local.negatedBy) break;
      }
      ctx.hit = local.hit ?? ctx.hit;
      ctx.judged = local.judged ?? ctx.judged;
      if (local.negatedBy) {
        ctx.negatedBy = local.negatedBy;
        ctx.negatedName = local.negatedName;
        break;
      }
    }
    return ctx;
  }
  /** 同步触发（只允许同步原子，如开场护甲、主动技）：保证调用返回时效果已生效 */
  emitSync(when: When, sources: Source[], ctx: Ctx = {}) {
    for (const s of sources) {
      if (s.ab.trigger.when !== when || !this.ready(s, ctx)) continue;
      this.consume(s);
      for (const a of s.ab.do) {
        const r = ATOMS[a.do]?.(this.g, a, { ...ctx, owner: s.owner ?? ctx.owner, card: s.card ?? ctx.card }, s);
        if (r instanceof Promise) throw new Error(`${when} 只支持同步原子（${s.ab.id}.${a.do}）`);
      }
    }
  }

  /** 汇总玩家侧常驻 modify（static）：如 sha_cost、distance；consume=true 时计入 limit */
  stat(stat: string, consume = false) {
    let v = 0;
    for (const s of this.playerSources()) {
      if (s.ab.trigger.when !== 'static' || !this.ready(s, {})) continue;
      const m = s.ab.do.find((a) => a.do === 'modify' && a.stat === stat);
      if (!m) continue;
      v += m.amount ?? 0;
      if (consume) this.consume(s);
    }
    return v;
  }
  /** 某张牌上词条的常驻 modify（如锋锐 sha_damage、轻招 card_cost） */
  cardStat(c: CardInst, stat: string) {
    let v = 0;
    for (const s of this.affixSources(c)) {
      if (s.ab.trigger.when !== 'static') continue;
      for (const a of s.ab.do) if (a.do === 'modify' && a.stat === stat) v += a.amount ?? 0;
    }
    return v;
  }
  /** 可用的转化：from 筛选 → as 卡牌 id（龙胆、倾国、武执…） */
  converts(as: string): Source[] {
    return this.playerSources().filter((s) => s.ab.trigger.when === 'static' && this.ready(s, {}) && s.ab.do.some((a) => a.do === 'convert' && a.as === as));
  }
  convertFor(c: CardInst, as: string): Source | undefined {
    return this.converts(as).find((s) => s.ab.do.some((a) => a.do === 'convert' && a.as === as && cardMatches(c, a.from)));
  }
  /** 主动技 */
  activeAbility(id: string) {
    return this.playerSources().find((s) => s.ab.trigger.when === 'active' && s.ab.id === id);
  }
  activeAbilities() {
    return this.playerSources().filter((s) => s.ab.trigger.when === 'active');
  }
}
