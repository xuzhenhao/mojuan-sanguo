/**
 * 效果引擎（数据驱动 ②）：事件总线 + DSL 原子解释器。
 * 能力（ability）= trigger.when + limit + if[] + do[]，全部来自 config/**.yaml。
 * battle.ts 只负责流程，在固定时机 emit 事件；具体效果由这里按配置执行。
 */
import { CONFIG, type Ability } from '../data/config';
import type { Game } from './battle';
import type { CardInst, Enemy } from './types';
import { def, enemyDodges, hasMod, isRed, isShaPlay } from './rules';

export type When = Ability['trigger']['when'];
export type Action = Ability['do'][number];
type Filter = NonNullable<Ability['trigger']['filter']>;

/** 一次事件的上下文 */
export interface Ctx {
  /** 能力所属方：玩家（undefined）或某个敌人 */
  owner?: Enemy;
  /** 触发能力的牌（卡牌自身能力 / 词条能力） */
  card?: CardInst;
  /** 打出时选择的目标 */
  chosen?: Enemy | null;
  /** 当杀使用时额外弃置的红牌（武圣斩） */
  red?: CardInst;
  /** 敌人出杀时的来源 */
  source?: Enemy;
  /** 杀已被抵消：记录抵消它的能力 id */
  negatedBy?: string;
  /** 抵消它的能力名（日志用） */
  negatedName?: string;
  /** 杀是否至少命中一个目标（灵光一闪用） */
  hit?: boolean;
}

/** 一个能力挂在哪里：用于 limit 计数的 key */
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
      return ctx.source ? [ctx.source] : [];
    case 'all_enemies':
      return g.alive();
    case 'front_row':
      return g.front();
    case 'back_row':
      return g.alive().filter((e) => e.row === 'back');
    default:
      return [];
  }
}

function judgeOk(c: CardInst, s: NonNullable<Action['success']>) {
  let ok = true;
  if (s.color) ok &&= (s.color === 'red') === isRed(c);
  if (s.suit) ok &&= s.suit.includes(c.suit);
  if (s.rankRange) ok &&= c.rank >= s.rankRange[0] && c.rank <= s.rankRange[1];
  return s.not ? !ok : ok;
}

/** 效果原子：每个原子一个函数 */
export const ATOMS: Record<string, Atom> = {
  async damage(g, a, ctx) {
    const c = ctx.card!;
    if (a.asSha && a.target === 'chosen') {
      // 玩家用杀：走闪标记、酒/傲骨/义勇、词条、龙虎会等完整流程
      ctx.hit = await g.playerSha(c, ctx.chosen!, (a.amount ?? 1) - 1);
      return;
    }
    const n = (a.amount ?? 1) + (hasMod(c, 'E_T05') ? 1 : 0);
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') {
        await g.dmgPlayer(n);
        continue;
      }
      if (a.asSha && !a.undodgeable && enemyDodges(t, false)) g.log(`${t.name}消耗闪标记，闪避${def(c).name}`);
      else await g.dmgEnemy(t, n, a.element === 'fire' ? '火' : '普通');
    }
  },
  lose_hp(g, a, ctx) {
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') g.p.hp -= a.amount ?? 1;
      else t.hp -= a.amount ?? 1;
    }
  },
  heal(g, a, ctx) {
    const n = (a.amount ?? 1) + (ctx.card && hasMod(ctx.card, 'E_P01') ? 1 : 0);
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') g.heal(n);
      else t.hp = Math.min(t.max, t.hp + n);
    }
  },
  armor(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx)) {
      const who = t === 'player' ? g.p : t;
      who.armor += a.amount ?? 0;
      g.log(`${t === 'player' ? '' : t.name + '·'}${src.ab.name}：护甲+${a.amount}`);
    }
  },
  remove_armor(g, a, ctx, src) {
    for (const t of targets(g, a.target, ctx)) {
      if (t === 'player') {
        g.p.armor = Math.max(0, g.p.armor - (a.amount ?? 0));
        continue;
      }
      const k = Math.min(a.amount ?? 0, t.armor);
      t.armor -= k;
      g.log(`${src.ab.name}：${t.name}失去${k}护甲`);
    }
  },
  draw(g, a, ctx, src) {
    const n = (a.amount ?? 1) + (src.ab.trigger.when === 'play' && ctx.card && hasMod(ctx.card, 'E_T04') ? 1 : 0);
    g.drawN(n);
    g.log(`${src.ab.name}：摸${n}张`);
  },
  discard(g, a, ctx) {
    // 主动技的弃牌：由调用方选定（ctx.card）；否则随机弃
    for (let i = 0; i < (a.amount ?? 1); i++) {
      const c = i === 0 && ctx.card && g.hand.includes(ctx.card) ? ctx.card : g.hand[Math.floor(g.rng() * g.hand.length)];
      if (c) g.toDiscard(c);
    }
  },
  gain_ling(g, a) {
    g.p.ling += a.amount ?? 1;
  },
  negate_sha(_g, _a, ctx, src) {
    ctx.negatedBy = src.ab.id;
    ctx.negatedName = src.ab.name;
  },
  async judge(g, a, ctx, src) {
    const r = await g.judge(src.ab.name);
    const ok = judgeOk(r, a.success ?? {});
    for (const x of (ok ? a.then : a.else) ?? []) await g.effects.runAtom(x, ctx, src);
  },
  apply_status(g, a, ctx, src) {
    const p = g.p;
    const c = ctx.card;
    switch (a.status) {
      case 'jiu':
        p.jiu = c && hasMod(c, 'E_P03') ? 2 : 1;
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
      case 'lebu':
        if (ctx.chosen && c) {
          ctx.chosen.judge.push(c);
          g.discard = g.discard.filter((x) => x !== c);
          g.log(`${src.ab.name}置入${ctx.chosen.name}判定区`);
        }
        break;
      default:
        throw new Error(`未实现的状态 ${a.status}`);
    }
  },
  /** modify 在 static 能力里由 Effects.stat() 汇总；在事件里出现时无即时效果 */
  modify() {},
  /** convert 由 Effects.converts() 查询（UI/响应窗口用），无即时效果 */
  convert() {},
  reveal_intent(g, a, ctx, src) {
    const t = ctx.chosen;
    if (!t) return;
    const xs = Array.from({ length: a.amount ?? 1 }, (_, i) => t.pat[(t.step + 1 + i) % t.pat.length].join('+'));
    g.log(`${src.ab.name}：${t.name}之后意图 ${xs.join(' → ')}`);
  },
  remove_flash_mark(g, a, ctx) {
    for (const t of targets(g, a.target, ctx)) if (t !== 'player') t.marks = Math.max(0, t.marks - (a.amount ?? 1));
  },
  add_enemy_acts(g, a, ctx) {
    if (ctx.owner) g.extraActs.set(ctx.owner, [...(g.extraActs.get(ctx.owner) ?? []), ...((a.acts ?? []) as string[])]);
  },
};

const COND: Record<string, (g: Game, c: Filter, ctx: Ctx) => boolean> = {
  hp_full: (g) => g.p.hp >= g.p.maxHp,
  hp_at_least: (g, c) => g.p.hp >= Number(c.value),
  hp_lost: (g) => g.p.hp < g.p.maxHp,
  hand_less_than_hp: (g) => g.hand.length < g.p.hp,
  hand_count_at_least: (g, c) => g.hand.length >= Number(c.value),
  has_back_row_ally: (g, _c, ctx) => g.alive().some((x) => x.row === 'back' && x !== ctx.owner),
  target_armor_zero: (_g, _c, ctx) => !!ctx.chosen && ctx.chosen.armor === 0,
  ling_left_at_least: (g, c) => g.p.ling >= Number(c.value),
  partner_is: (g, c) => g.sub.id === c.value,
};

/** 牌筛选（trigger.filter / convert.from） */
export function cardMatches(c: CardInst | undefined, f: Filter | undefined) {
  if (!f) return true;
  if (!c) return false;
  if (f.card && c.id !== f.card) return false;
  if (f.color && (f.color === 'red') !== isRed(c)) return false;
  if (f.suit && !f.suit.includes(c.suit)) return false;
  if (f.tag === 'sha' && !isShaPlay(c)) return false;
  if (f.tag === 'shan' && !def(c).shan) return false;
  if (f.tag && f.tag !== 'sha' && f.tag !== 'shan' && !CONFIG.cards[c.id]?.tags?.includes(f.tag)) return false;
  return true;
}

export class Effects {
  /** limit 计数：key → 次数；按 per 分桶，在对应时机清零 */
  used: Record<'turn' | 'enemy_turn' | 'battle' | 'run', Map<string, number>> = { turn: new Map(), enemy_turn: new Map(), battle: new Map(), run: new Map() };
  /** 本敌方回合已生效的被动免伤次数（M2） */
  quotaUsed = 0;
  constructor(public g: Game) {}

  reset(per: keyof Effects['used']) {
    this.used[per].clear();
    if (per === 'enemy_turn') this.quotaUsed = 0;
  }

  /** 玩家侧常驻能力：主将技 → 副将技 → 珠联 → 装备（含装备上的词条） */
  playerSources(): Source[] {
    const { g } = this;
    const H = CONFIG.heroes;
    const out: Source[] = [];
    for (const ab of H[g.main.id].mainSkills) out.push({ ab, key: 'main:' + ab.id });
    const sub = H[g.sub.id].subSkill;
    out.push({ ab: sub, key: 'sub:' + sub.id });
    for (const cb of H[g.main.id].combos ?? []) if (cb.partner === g.sub.id) for (const ab of cb.abilities) out.push({ ab, key: 'combo:' + ab.id });
    for (const c of Object.values(g.p.equip)) if (c) out.push(...this.cardSources(c));
    return out;
  }
  /** 一张牌自身 + 其词条的能力 */
  cardSources(c: CardInst, withAffixes = true): Source[] {
    const out: Source[] = (CONFIG.cards[c.id]?.abilities ?? []).map((ab) => ({ ab, key: `card:${c.uid}:${ab.id}`, card: c }));
    if (withAffixes)
      for (const m of c.mods)
        for (const ab of CONFIG.affixes.find((a) => a.id === m)?.abilities ?? []) out.push({ ab, key: `affix:${c.uid}:${ab.id}`, card: c });
    return out;
  }
  enemySources(e: Enemy): Source[] {
    return (e.abilities ?? []).map((ab) => ({ ab, key: `enemy:${e.uid}:${ab.id}`, owner: e }));
  }

  /** limit 剩余次数（不消耗） */
  remaining(s: Source) {
    const l = s.ab.limit;
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
  ready(s: Source, ctx: Ctx) {
    if (this.remaining(s) <= 0) return false;
    const q = CONFIG.rules.mechanics.passiveQuotaPerEnemyTurn;
    if (s.ab.limit?.passiveQuota && q != null && this.quotaUsed >= q) return false;
    for (const c of s.ab.if ?? []) if (COND[c.type](this.g, c, ctx) === !!c.not) return false;
    return true;
  }

  async runAtom(a: Action, ctx: Ctx, src: Source) {
    const f = ATOMS[a.do];
    if (!f) throw new Error(`未实现的效果原子 ${a.do}（${src.ab.id}）`);
    await f(this.g, a, ctx, src);
  }
  /** 同步触发（只允许同步原子，如开场护甲）：保证 startBattle 返回时效果已生效 */
  emitSync(when: When, sources: Source[], ctx: Ctx = {}) {
    for (const s of sources) {
      if (s.ab.trigger.when !== when || !this.ready(s, ctx)) continue;
      this.consume(s);
      for (const a of s.ab.do) {
        const r = ATOMS[a.do]?.(this.g, a, { ...ctx, owner: s.owner ?? ctx.owner }, s);
        if (r instanceof Promise) throw new Error(`${when} 只支持同步原子（${s.ab.id}.${a.do}）`);
      }
    }
  }

  /** 触发事件：按顺序执行所有匹配的能力；返回 ctx（含 negatedBy 等结果） */
  async emit(when: When, sources: Source[], ctx: Ctx = {}, eventCard?: CardInst): Promise<Ctx> {
    for (const s of sources) {
      if (s.ab.trigger.when !== when) continue;
      if (!cardMatches(eventCard ?? ctx.card, s.ab.trigger.filter)) continue;
      if (!this.ready(s, ctx)) continue;
      this.consume(s);
      const local: Ctx = { ...ctx, owner: s.owner ?? ctx.owner, card: s.card ?? ctx.card };
      for (const a of s.ab.do) {
        await this.runAtom(a, local, s);
        if (local.negatedBy) break;
      }
      ctx.hit = local.hit ?? ctx.hit;
      if (local.negatedBy) {
        ctx.negatedBy = local.negatedBy;
        ctx.negatedName = local.negatedName;
        break;
      }
    }
    return ctx;
  }

  /** 汇总常驻 modify（static）：如 sha_cost、distance；consume=true 时计入 limit */
  stat(stat: string, consume = false) {
    let v = 0;
    for (const s of this.playerSources()) {
      if (s.ab.trigger.when !== 'static' || this.remaining(s) <= 0) continue;
      const m = s.ab.do.find((a) => a.do === 'modify' && a.stat === stat);
      if (!m) continue;
      v += m.amount ?? 0;
      if (consume) this.consume(s);
    }
    return v;
  }
  /** 主动技 */
  activeAbility(id: string) {
    return this.playerSources().find((s) => s.ab.trigger.when === 'active' && s.ab.id === id);
  }
}
