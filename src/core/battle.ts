import { CARDS, starterDeck } from '../data/cards';
import { BATTLES, ENEMIES, ENEMY_CARDS, MAX_FLASH_MARKS } from '../data/enemies';
import { HEROES, RULES } from '../data/heroes';
import { CONFIG } from '../data/config';
import { cardMatches, Effects, judgeFromCard, standardJudgeDeck, type Source } from './effects';
import { AFFIXES } from '../data/affixes';
import { rndInt, shuffle, type Rng } from './rng';
import {
  addAffix,
  affixPool,
  applyDamage,
  def,
  enemyDodges,
  enemyIntent,
  epiphanyRoll,
  isRed,
  isShaPlay,
  lebuSkips,
  pick3,
  playerShaDamage,
  RANK_CH,
  SUIT_CH,
} from './rules';
import type { AffixDef, CardInst, Enemy, EnemyAct, JudgeCard, JudgeEvent, Slot } from './types';

/** 战间回复后的体力（core 与自动试玩共用同一规则，#56） */
/** 战间回复：amount 默认取 rules.map.betweenBattleHeal（游戏，H5 = 0，PRD §10.4）；模拟传 rules.sim.baselineBetweenBattleHeal */
export const betweenBattleHeal = (hp: number, maxHp: number, amount: number = CONFIG.rules.map.betweenBattleHeal) => Math.min(maxHp, hp + Math.max(0, amount));

/** 响应决策点类型 */
export type RespondKind = 'shan' | 'tao' | 'wuxie';

/** 手满弃置事件（PRD §5.4：reason = hand_overflow，不触发任何弃置时/弃牌后效果） */
export interface HandOverflowEvent {
  type: 'discard';
  reason: 'hand_overflow';
  card: CardInst;
  /** 当前硬上限（rules.handHardCap） */
  cap: number;
}

/** 平台适配层需实现的 IO（Web DOM / 微信小游戏 Canvas 各自实现） */
export interface BattleIO {
  log(t: string): void;
  update(): void;
  sleep(ms: number): Promise<void>;
  /** 判定事件：ev.card 是完整判定牌数据（签筒的签没有卡牌定义，不得按 id 查牌库） */
  showJudge(ev: JudgeEvent): Promise<void>;
  /**
   * 响应窗口：返回打出的牌或 null（放弃/超时）。
   * kind：决策点类型（shan = 被杀出闪；tao = 濒死求桃/酒；wuxie = 敌方锦囊出无懈可击），旧实现可忽略。
   */
  respond(text: string, legal: (c: CardInst) => boolean, pass: string, timed: boolean, kind?: RespondKind): Promise<CardInst | null>;
  /** 灵光一闪三选一：reroll 可调用一次（看广告刷新） */
  epiphany(c: CardInst, options: AffixDef[], reroll: () => AffixDef[]): Promise<AffixDef | null>;
  /** 手满弃置（PRD §5.4）：新摸到的牌因手牌达到硬上限直接进弃牌堆；可选，表现层用来提示「手满，弃置」 */
  handOverflow?(ev: HandOverflowEvent): void;
  hurt?(): void;
  enemyHit?(e: Enemy): void;
  onBattleEnd(win: boolean): void;
}

export interface Settings {
  autoShan: boolean;
  epiphanyRate?: number;
  /** 主将 / 副将（默认 rules.defaultHeroes） */
  main?: string;
  sub?: string;
  /** rules.presets 中的预设（如 legacy_guanyu_zhaoyun） */
  preset?: string;
}

export interface Player {
  hp: number;
  maxHp: number;
  armor: number;
  ling: number;
  maxLing: number;
  equip: Partial<Record<Slot, CardInst>>;
  jiu: number;
  aogu: number;
  yiyong: number;
  lianShan: number;
  /** 其余状态：yice / xieling / empty_draw */
  status: Record<string, number>;
}

export class Game {
  uid = 0;
  battleIdx = 0;
  deckMaster: CardInst[];
  p: Player;
  draw: CardInst[] = [];
  discard: CardInst[] = [];
  hand: CardInst[] = [];
  en: Enemy[] = [];
  turn = 0;
  epiCount = 0;
  sincePity = 0;
  over = false;
  /** 本回合已使用的杀张数（虓烈 / 破阵） */
  shaIndex = 0;
  effects = new Effects(this);
  judgeDeck: JudgeCard[] = [];
  zeroCostPlays = new Map<string, number>();
  extraActs = new Map<Enemy, string[]>();
  logs: string[] = [];
  main;
  sub;
  private turnEndDone = false;

  constructor(
    public rng: Rng,
    public io: BattleIO,
    public settings: Settings,
  ) {
    const R = CONFIG.rules;
    const pre = settings.preset ? R.presets?.[settings.preset] : undefined;
    if (settings.preset && !pre) throw new Error(`未知预设 ${settings.preset}`);
    this.main = HEROES[settings.main ?? pre?.main ?? R.defaultHeroes.main];
    this.sub = HEROES[settings.sub ?? pre?.sub ?? R.defaultHeroes.sub];
    if (!this.main || !this.sub) throw new Error('未知武将');
    this.effects.forceCombos = pre?.forceCombos ?? [];
    this.deckMaster = starterDeck(this.main.id, pre?.deck).map(([id, suit, rank]) => ({ uid: ++this.uid, id, suit, rank, mods: [] }));
    this.p = {
      hp: this.main.hp,
      maxHp: this.main.hp,
      armor: 0,
      ling: 3,
      maxLing: RULES.lingPerTurn,
      equip: {},
      jiu: 0,
      aogu: 0,
      yiyong: 0,
      lianShan: 0,
      status: {},
    };
  }

  get battle() {
    return BATTLES[this.battleIdx];
  }
  get isLast() {
    return this.battleIdx >= BATTLES.length - 1;
  }
  log(t: string) {
    this.logs.push(t);
    if (this.logs.length > 60) this.logs.shift();
    this.io.log(t);
  }

  // ---------- 场面 ----------
  alive() {
    return this.en.filter((e) => e.hp > 0);
  }
  front() {
    return this.alive().filter((e) => e.row === 'front');
  }
  fixRows() {
    if (!this.front().length)
      this.alive().forEach((e) => {
        if (e.row === 'back') {
          e.row = 'front';
          this.log(`${e.name}前移至前排`);
        }
      });
  }
  attackRange() {
    const w = this.p.equip.weapon;
    // 武器射程 + range 修正（长柄词条、破阵）；distance -1 = 范围 +1（赤兔）
    return (w ? (def(w).range ?? 1) : 1) + this.effects.stat('range') - this.effects.stat('distance');
  }
  dist(e: Enemy) {
    return e.row === 'front' ? 1 : this.front().length ? 2 : 1;
  }
  inRange(e: Enemy, c?: CardInst) {
    if (c && this.effects.cardStat(c, 'ignore_range') > 0) return true;
    if (this.p.yiyong && c && isShaPlay(c)) return true;
    return this.dist(e) <= this.attackRange();
  }
  canTarget(e: Enemy, c: CardInst) {
    return isShaPlay(c) ? this.inRange(e, c) : true;
  }
  costOf(c: CardInst) {
    const d = def(c);
    let k = c.asSha ? 1 : d.cost;
    k += this.effects.cardStat(c, 'card_cost'); // 轻招 / 巧思
    if (isShaPlay(c)) {
      k += this.effects.stat('sha_cost'); // 诸葛弩（受 limit 约束）
      if (this.p.lianShan) k--;
    }
    return Math.max(0, k);
  }
  /** 手牌上限 = max(2, 体力) + hand_limit（遗计、托孤…） */
  handLimit() {
    return Math.max(RULES.minHandLimit, this.p.hp) + this.effects.stat('hand_limit');
  }
  /** 可否把这张牌当杀使用（武执、龙胆闪→杀） */
  canAsSha(c: CardInst) {
    return !def(c).sha && !!this.effects.convertFor(c, 'B001');
  }
  canAsShan(c: CardInst) {
    return !!def(c).shan || !!this.effects.convertFor(c, 'B004');
  }

  // ---------- 牌堆 ----------
  drawN(n: number) {
    for (let i = 0; i < n; i++) {
      if (!this.draw.length) {
        if (!this.discard.length) break;
        this.draw = shuffle(this.rng, this.discard);
        this.discard = [];
        this.log('弃牌堆洗入摸牌堆');
      }
      this.addToHand(this.draw.pop()!);
    }
  }
  /** 所有进手牌的路径都必须走这里：手牌已达硬上限时直接进弃牌堆（PRD §5.4），不触发弃置类效果 */
  addToHand(c: CardInst): boolean {
    const cap = CONFIG.rules.handHardCap;
    if (this.hand.length >= cap) {
      this.discard.push(c);
      this.log(`手满，弃置：${def(c)?.name ?? c.id}`);
      this.io.handOverflow?.({ type: 'discard', reason: 'hand_overflow', card: c, cap });
      return false;
    }
    this.hand.push(c);
    return true;
  }
  toDiscard(c: CardInst) {
    this.hand = this.hand.filter((x) => x !== c);
    this.discard.push(c);
    c.asSha = false;
  }
  /** 价值最低的手牌（仁义赠牌、自动弃牌） */
  worstCard() {
    const v = (c: CardInst) => (def(c).tao ? 5 : def(c).shan ? 4 : def(c).sha ? 3 : def(c).slot ? 1 : 2);
    return this.hand.slice().sort((a, b) => v(a) - v(b))[0];
  }
  async judge(reason: string): Promise<JudgeCard> {
    let j: JudgeCard;
    if (CONFIG.rules.mechanics.judgeSource === 'pool') {
      if (!this.judgeDeck.length) this.judgeDeck = shuffle(this.rng, standardJudgeDeck());
      j = this.judgeDeck.pop()!;
    } else {
      if (!this.draw.length) {
        this.draw = shuffle(this.rng, this.discard);
        this.discard = [];
      }
      const c = this.draw.pop()!;
      this.discard.push(c);
      j = judgeFromCard(c, def(c)?.name ?? c.id);
    }
    await this.io.showJudge({ type: 'judge', reason, card: j });
    this.log(`判定（${reason}）：${SUIT_CH[j.suit]}${RANK_CH[j.rank]}`);
    return j;
  }

  // ---------- 流程 ----------
  startBattle() {
    this.draw = shuffle(this.rng, this.deckMaster.slice());
    this.discard = [];
    this.hand = [];
    this.turn = 0;
    this.epiCount = 0;
    this.sincePity = 0;
    this.over = false;
    this.effects.reset('battle');
    this.p.armor = 0;
    this.p.equip = {};
    this.p.status = {};
    this.en = this.battle.en.map((id) => {
      const d = ENEMIES[id];
      return { ...d, pat: d.pat, id, uid: ++this.uid, max: d.hp, armor: d.armorStart ?? 0, step: 0, marks: d.flash, judge: [] };
    });
    this.log(`—— 第${this.battleIdx + 1}战：${this.battle.name} ——`);
    this.effects.emitSync('battle_start', this.effects.playerSources());
    this.playerTurn();
  }
  playerTurn() {
    this.turn++;
    const p = this.p;
    p.ling = p.maxLing;
    if (this.turn > 1) p.jiu = 0; // 首回合保留战斗开始获得的酒（凤仪亭）
    p.aogu = 0;
    p.yiyong = 0;
    p.lianShan = 0;
    delete p.status.xieling;
    delete p.status.empty_draw;
    this.shaIndex = 0;
    this.turnEndDone = false;
    if (this.turn > 1 && p.armor > RULES.armorKeep) {
      this.log(`护甲保留上限：${p.armor}→${RULES.armorKeep}`);
      p.armor = RULES.armorKeep;
    }
    this.effects.reset('turn');
    this.zeroCostPlays.clear();
    const n = RULES.drawPerTurn + (this.turn === 1 ? RULES.firstTurnBonus : 0) + this.effects.stat('draw_per_turn');
    this.drawN(n);
    this.log(`你的回合${this.turn}：军令回满，摸${n}张`);
    this.effects.emitSync('turn_start', this.effects.playerSources());
    this.io.update();
  }
  checkPlay(c: CardInst): string | null {
    const d = def(c);
    if (d.shan && !c.asSha) return '闪只能在响应窗口打出';
    if (d.wuxie && !c.asSha) return '无懈可击只能在响应窗口打出';
    if (c.asSha && !this.canAsSha(c)) return '此牌不能当杀使用';
    if (this.costOf(c) > this.p.ling) return '军令不足';
    if (d.tao && !c.asSha && this.p.hp >= this.p.maxHp) return '体力已满';
    if (d.needRed && !c.asSha && !this.hand.some((x) => x !== c && isRed(x))) return `${d.name}需另一张红色牌`;
    const zl = CONFIG.rules.mechanics.zeroCostPerTurn;
    if (zl != null && !d.shan && !d.response && this.costOf(c) === 0 && (this.zeroCostPlays.get(c.id) ?? 0) >= zl) return `0 费牌每回合限 ${zl} 次`;
    const own = this.effects.cardSources(c, false).find((s) => s.ab.trigger.when === 'play' && !c.asSha);
    if (own && this.effects.remaining(own) <= 0) return '本回合已使用过';
    return null;
  }
  needsTarget(c: CardInst) {
    return isShaPlay(c) || !!def(c).tgt;
  }

  async play(c: CardInst, tgt: Enemy | null, red?: CardInst) {
    const d = def(c);
    const p = this.p;
    const cost = this.costOf(c);
    p.ling -= cost;
    if (cost === 0 && !d.shan && !d.response) this.zeroCostPlays.set(c.id, (this.zeroCostPlays.get(c.id) ?? 0) + 1);
    if (isShaPlay(c) && d.cost + this.effects.cardStat(c, 'card_cost') > 0) this.effects.stat('sha_cost', true);
    if (isShaPlay(c)) p.lianShan = 0;
    const wasSha = !!c.asSha;
    let ok = true;
    if (red) this.toDiscard(red);
    if (d.slot && !wasSha) {
      this.hand = this.hand.filter((x) => x !== c);
      const old = p.equip[d.slot];
      if (old) this.discard.push(old);
      p.equip[d.slot] = c;
      this.log(`装备【${d.name}】`);
      await this.effects.emit('equip', this.effects.cardSources(c), { card: c });
    } else this.toDiscard(c);
    if (wasSha) {
      c.asSha = true;
      const conv = this.effects.convertFor(c, 'B001')!;
      this.effects.consume(conv);
      const as = conv.ab.do.find((x) => x.do === 'convert' && x.as === 'B001')!.as!;
      const srcs = (CONFIG.cards[as].abilities ?? []).map((ab) => ({ ab, key: `conv:${c.uid}:${ab.id}`, card: c }));
      ok = !!(await this.effects.emit('play', srcs, { card: c, chosen: tgt })).hit;
      await this.effects.emit('card_converted', this.effects.playerSources(), { card: c });
    } else if (!d.slot) {
      const r = await this.effects.emit('play', this.effects.cardSources(c, false), { card: c, chosen: tgt });
      if (isShaPlay(c)) ok = !!r.hit;
      if (d.trick) await this.effects.emit('play', this.effects.affixSources(c), { card: c, chosen: tgt });
    }
    c.asSha = false;
    this.io.update();
    if (this.checkWin()) return;
    await this.maybeEpiphany(c, ok, wasSha);
    await this.checkEmpty();
    this.io.update();
    this.checkWin();
  }
  /** 手牌打空：连营 / 连营策 */
  async checkEmpty() {
    if (this.hand.length || this.over) return;
    await this.effects.emit('hand_empty', this.effects.playerSources());
    if (!this.hand.length && this.p.status.empty_draw) {
      delete this.p.status.empty_draw;
      this.drawN(1);
      this.log('连营策：手牌打空，摸 1 张');
    }
  }

  async playerSha(c: CardInst, e: Enemy, bonus: number) {
    const p = this.p;
    const fx = this.effects;
    this.shaIndex++;
    const n = playerShaDamage(c, p, bonus, fx.cardStat(c, 'sha_damage') + fx.stat('sha_damage'));
    p.jiu = 0;
    p.aogu = 0;
    p.yiyong = 0;
    const fire = def(c).fire || fx.cardStat(c, 'sha_fire') > 0 || fx.stat('sha_fire', true) > 0;
    const nm = c.asSha ? `${def(c).name}(当杀)` : def(c).name;
    await fx.emit(
      'play',
      fx.playerSources().filter((s) => !s.card),
      { card: c },
      c,
    );
    const targets = [e];
    for (let i = 0; i < fx.cardStat(c, 'extra_targets'); i++) {
      const o = this.alive().filter((x) => !targets.includes(x) && this.inRange(x, c));
      if (o.length) targets.push(o[0]);
    }
    const brk = fx.cardStat(c, 'armor_break');
    let anyHit = false;
    for (const t of targets) {
      if (brk) t.armor = Math.max(0, t.armor - brk);
      this.log(`你对${t.name}使用【${nm}】`);
      if (this.enemyDodges(t, fx.cardStat(c, 'undodgeable') > 0)) {
        this.log(`${t.name}消耗闪标记，闪避`);
        this.io.enemyHit?.(t);
        await this.io.sleep(300);
        continue;
      }
      await this.dmgEnemy(t, n, fire ? '火' : '普通', c, true);
      anyHit = true;
    }
    return anyHit;
  }
  /** 敌人消耗闪标记抵消玩家的杀；无俦：需 2 枚 */
  enemyDodges(e: Enemy, undodgeable: boolean) {
    return enemyDodges(e, undodgeable, Math.max(1, this.effects.stat('flash_marks_to_dodge')));
  }
  async dmgEnemy(e: Enemy, n: number, attr: string, card?: CardInst, byPlayer = true, conducted = false): Promise<boolean> {
    if (e.hp <= 0) return false;
    if (byPlayer && attr === '火') n += this.effects.stat('fire_damage', true); // 纵火
    const { absorbed } = applyDamage(e, n);
    this.log(`${e.name}受到${n}点${attr === '火' ? '火' : attr === '雷' ? '雷' : ''}伤害${absorbed ? `（护甲抵${absorbed}）` : ''}`);
    this.io.enemyHit?.(e);
    this.io.update();
    await this.io.sleep(350);
    if (byPlayer) await this.effects.emit('deal_damage', this.effects.playerSources(), { card, chosen: e, element: attr }, card);
    let killed = false;
    if (e.hp <= 0) {
      killed = true;
      this.log(`${e.name}被击破`);
      this.fixRows();
      this.io.update();
      if (byPlayer)
        await this.effects.emit('kill', [...this.effects.playerSources(), ...(card ? this.effects.affixSources(card) : [])], { card, chosen: e }, card);
    }
    // 连环传导：火 / 雷属性伤害传给其余连环中的敌人
    if (!conducted && (attr === '火' || attr === '雷') && e.chained) {
      e.chained = false;
      for (const o of this.alive().filter((x) => x.chained)) {
        o.chained = false;
        this.log(`连环传导：${o.name}`);
        await this.dmgEnemy(o, n, attr, card, byPlayer, true);
      }
    }
    return killed;
  }
  /** 兼容旧接口 */
  heal(n: number) {
    const b = this.p.hp;
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + n);
    this.log(`回复${this.p.hp - b}点体力`);
  }
  async healPlayer(n: number, card?: CardInst) {
    this.heal(n);
    await this.effects.emit('heal', [...this.effects.playerSources(), ...(card ? this.effects.affixSources(card) : [])], { card }, card);
  }

  // ---------- 主动技 ----------
  canActivate(id: string) {
    const s = this.effects.activeAbility(id);
    if (!s || !this.effects.ready(s, {})) return false;
    if (this.activeNeeds(id).target && !this.legalTargets(id).length) return false;
    const dis = s.ab.do.find((a) => a.do === 'discard');
    if (!dis) return true;
    return this.hand.some((c) => cardMatches(c, dis.from));
  }
  /** 主动技的合法敌人目标（按配置 targets 筛选）；不需要选敌人的技能返回 [] */
  legalTargets(id: string): Enemy[] {
    const s = this.effects.activeAbility(id);
    if (!s || !this.activeNeeds(id).target) return [];
    const f = s.ab.targets ?? {};
    return this.alive().filter(
      (e) =>
        (!f.row || e.row === f.row) &&
        (!f.hasAlly || this.alive().some((o) => o !== e)) &&
        (f.armorAtLeast == null || e.armor >= f.armorAtLeast) &&
        (!f.inRange || this.inRange(e)),
    );
  }
  isLegalTarget(id: string, e: Enemy) {
    return this.legalTargets(id).includes(e);
  }
  /** 主动技需要的东西：弃牌 / 敌人目标 */
  activeNeeds(id: string) {
    const s = this.effects.activeAbility(id);
    const json = JSON.stringify(s?.ab.do ?? []);
    return { card: !!s?.ab.do.some((a) => a.do === 'discard'), target: json.includes('"chosen"') && !json.includes('"choose":"chosen"') };
  }
  /** 无判定的主动技同步生效（傲骨、挟令）；有判定的（离间）需 await */
  async activate(id: string, c?: CardInst, tgt?: Enemy) {
    const s = this.effects.activeAbility(id);
    if (!s || !this.canActivate(id)) return;
    const dis = s.ab.do.find((a) => a.do === 'discard');
    if (dis && (!c || !cardMatches(c, dis.from))) return;
    if (this.activeNeeds(id).target && (!tgt || !this.isLegalTarget(id, tgt))) return;
    const ctx = { card: c, chosen: tgt ?? null };
    if (JSON.stringify(s.ab.do).includes('"judge"')) await this.effects.emit('active', [s], ctx);
    else this.effects.emitSync('active', [s], ctx);
    this.io.update();
    await this.checkEmpty();
  }
  get aoguUsed() {
    const s = this.effects.activeAbility('aogu');
    return !s || this.effects.remaining(s) <= 0;
  }
  canAogu() {
    return this.canActivate('aogu');
  }
  aogu(c: CardInst) {
    void this.activate('aogu', c);
  }

  // ---------- 灵光一闪 ----------
  async maybeEpiphany(c: CardInst, ok: boolean, wasSha = false) {
    if (!ok) return;
    this.sincePity++;
    if (!epiphanyRoll(this.rng, this.epiCount, this.sincePity, this.settings.epiphanyRate)) return;
    if (wasSha) return;
    const pool = affixPool(c, this.deckMaster);
    if (!pool.length) return;
    this.epiCount++;
    this.sincePity = 0;
    const a = await this.io.epiphany(c, pick3(this.rng, pool), () => pick3(this.rng, pool));
    if (a) {
      addAffix(c, a.id);
      this.log(`灵光一闪！【${def(c).name}】获得「${a.n}」`);
    }
  }

  // ---------- 回合结束 / 敌方回合 ----------
  /** 回合结束时机（月隐、仁义、挟势）：在弃牌前调用；endTurn 会补调 */
  turnEnd() {
    if (this.turnEndDone) return;
    this.turnEndDone = true;
    this.effects.emitSync('turn_end', this.effects.playerSources());
    this.io.update();
  }
  discardNeeded() {
    return Math.max(0, this.hand.length - this.handLimit());
  }
  async endTurn(discards: CardInst[] = []) {
    this.turnEnd();
    discards.filter((c) => this.hand.includes(c)).forEach((c) => this.toDiscard(c));
    while (this.discardNeeded() > 0) this.toDiscard(this.worstCard());
    if (discards.length) this.log('回合结束弃牌');
    await this.enemyTurn();
  }
  /** 敌人判定区：乐不思蜀（持续 N 回合）、闪电（命中移除，最多 N 次） */
  async resolveJudgeArea(e: Enemy) {
    let skipAtk = false;
    for (const c of e.judge.slice()) {
      if (e.hp <= 0 || this.over) break;
      const left = (e.delayLeft?.[c.uid] ?? 1) - 1;
      let done = left <= 0;
      if (c.id === 'D001') {
        const r = await this.judge(`${e.name}·乐不思蜀`);
        if (lebuSkips(r)) {
          skipAtk = true;
          this.log(`${e.name}乐不思蜀生效，不出杀/锦囊`);
        } else this.log('判定为♥，乐不思蜀本回合失效');
      } else {
        const srcs: Source[] = this.effects.cardSources(c, false).filter((s) => s.ab.trigger.when === 'enemy_turn_start');
        const r = await this.effects.emit('enemy_turn_start', srcs, { owner: e, card: c });
        if (r.judged) done = true;
      }
      e.delayLeft = { ...(e.delayLeft ?? {}), [c.uid]: left };
      if (done) {
        e.judge = e.judge.filter((x) => x !== c);
        this.discard.push(c);
      }
    }
    if (e.hp <= 0) this.checkWin();
    return skipAtk;
  }
  async enemyTurn() {
    this.io.update();
    await this.io.sleep(400);
    const order = [...this.front(), ...this.alive().filter((e) => e.row === 'back')];
    this.effects.reset('enemy_turn');
    this.extraActs.clear();
    for (const e of order) {
      if (e.hp <= 0 || this.over) continue;
      const skipAtk = await this.resolveJudgeArea(e);
      if (e.hp <= 0 || this.over) continue;
      const eak = CONFIG.rules.enemyArmorKeep;
      if (eak != null && this.turn > 1 && e.armor > eak) {
        this.log(`${e.name}护甲保留上限：${e.armor}→${eak}`);
        e.armor = eak;
      }
      await this.effects.emit('enemy_turn_start', this.effects.enemySources(e), { owner: e });
      if (CONFIG.rules.mechanics.moying && e.tier !== '小怪' && this.p.hp >= this.p.maxHp) {
        this.extraActs.set(e, [...(this.extraActs.get(e) ?? []), '杀']);
        this.log(`${e.name}·墨影：你体力已满，本回合多出 1 张【杀】`);
      }
      this.io.enemyHit?.(e);
      await this.io.sleep(300);
      for (const a of [...enemyIntent(e).acts, ...((this.extraActs.get(e) ?? []) as EnemyAct[])]) {
        if (this.over || e.hp <= 0) break;
        const k = ENEMY_CARDS[a];
        if (!k) continue;
        if (k.t === '杀') {
          if (skipAtk) continue;
          if (e.noSha) {
            this.log(`${e.name}受离魂影响，不出杀`);
            continue;
          }
          if (e.redirect) {
            const allies = this.alive().filter((x) => x !== e);
            if (allies.length) {
              const t = allies[rndInt(this.rng, allies.length)];
              this.log(`${e.name}受离间，【杀】打向${t.name}`);
              await this.dmgEnemy(t, 1, '普通', undefined, true);
              if (this.checkWin()) return;
              continue;
            }
          }
          await this.enemySha(e, k.dmg!, k.mod);
        } else if (k.t === '万箭') {
          if (!skipAtk) {
            this.log(`${e.name}使用【万箭齐发】（不可闪）`);
            await this.dmgPlayer(k.dmg!, e);
          }
        } else if (k.t === '闪') {
          if (e.marks < MAX_FLASH_MARKS) e.marks++;
          this.log(`${e.name}备下一张【闪】`);
        } else if (k.t === '咒' && !skipAtk && this.hand.length) {
          if (this.effects.stat('immune_curse') > 0) {
            this.log(`谦逊：${e.name}的妖咒无效`);
          } else if (await this.wuxieWindow('妖咒', e)) {
            this.log(`${e.name}的妖咒被无懈可击抵消`);
          } else {
            const c = this.hand[rndInt(this.rng, this.hand.length)];
            this.toDiscard(c);
            this.log(`${e.name}妖咒：你弃置了【${def(c).name}】`);
          }
        }
        this.io.update();
        await this.io.sleep(250);
      }
      e.step++;
      e.noSha = false;
      e.redirect = false;
      this.io.update();
      await this.io.sleep(350);
      if (this.over) return;
    }
    this.alive().forEach((e) => {
      e.marks = Math.min(MAX_FLASH_MARKS, Math.max(e.marks, e.flash));
    });
    if (!this.over) this.playerTurn();
  }
  /**
   * 锦囊 → 无懈可击决策点（PRD 5.9.2）：敌方锦囊对你生效前，若手里有无懈可击，询问是否打出。
   * 返回 true = 该锦囊被抵消。手里没有合法牌时不开窗口。
   * 未实装：敌人「无懈标记」与再无懈连锁（MVP 最多 2 次）——敌人侧尚无配置。
   */
  async wuxieWindow(trick: string, from: Enemy | null): Promise<boolean> {
    const legal = (c: CardInst) => !!def(c)?.wuxie;
    if (!this.hand.some(legal)) return false;
    const who = from ? `${from.name} ` : '';
    const used = await this.io.respond(`${who}对你使用【${trick}】，可打出【无懈可击】使其无效`, legal, '不出无懈', true, 'wuxie');
    if (!used || !this.hand.includes(used) || !legal(used)) return false;
    this.toDiscard(used);
    const r = await this.effects.emit('targeted_by_trick', this.effects.cardSources(used, false), { source: from ?? undefined });
    if (!r.negatedBy) return false;
    this.log(`你打出【${def(used).name}】，【${trick}】无效`);
    this.io.update();
    await this.checkEmpty();
    return true;
  }
  /** 敌人出杀 → 护主 → 八卦阵（被动免伤配额）→ 玩家闪响应窗口（含龙胆/倾国转化） */
  async enemySha(e: Enemy, n: number, mod?: string): Promise<string> {
    this.log(`${e.name}对你出【杀】${mod ? '[' + mod + ']' : ''}（${n}点）`);
    const r = await this.effects.emit('targeted_by_sha', this.effects.playerSources(), { source: e });
    if (r.negatedBy) {
      this.log(`${r.negatedName}：判定成功，此杀无效`);
      return r.negatedBy.split('_')[0];
    }
    const legal = (c: CardInst) => this.canAsShan(c);
    const shans = this.hand.filter(legal);
    let used: CardInst | null = null;
    if (shans.length) {
      const real = shans.find((c) => def(c).shan);
      used = this.settings.autoShan ? (real ?? shans[0]) : await this.io.respond(`${e.name} 对你使用【杀】，伤害 ${n}`, legal, '不出闪', true, 'shan');
    }
    if (used) {
      const conv = !def(used).shan ? this.effects.convertFor(used, 'B004') : undefined;
      if (conv) this.effects.consume(conv);
      this.toDiscard(used);
      this.log(conv ? `你将【${def(used).name}】当【闪】打出（${conv.ab.name}）` : '你打出【闪】抵消');
      await this.effects.emit('dodged', this.effects.affixSources(used), { source: e, card: used });
      if (conv) await this.effects.emit('card_converted', this.effects.playerSources(), { card: used });
      this.io.update();
      await this.maybeEpiphany(used, true, !!conv);
      await this.checkEmpty();
      this.checkWin();
      return 'shan';
    }
    await this.dmgPlayer(n, e);
    return 'hit';
  }
  async dmgPlayer(n: number, src?: Enemy) {
    const had = this.p.armor;
    const { absorbed, hpLoss } = applyDamage(this.p, n);
    this.log(`你受到${n}点伤害${absorbed ? `（护甲抵${absorbed}）` : ''}`);
    this.io.hurt?.();
    this.io.update();
    await this.io.sleep(300);
    if (this.p.status.xieling && had > 0 && this.p.armor === 0 && hpLoss > 0 && src && src.hp > 0) {
      delete this.p.status.xieling;
      this.log(`挟令：护甲被打穿，反击${src.name}`);
      await this.dmgEnemy(src, 1, '普通', undefined, true);
    }
    if (this.p.hp <= 0) await this.dying();
    if (this.over) return;
    // 受到伤害（只计实际扣体力的伤害；被护甲完全吸收不触发）
    if (hpLoss > 0) {
      await this.effects.emit('damaged', this.effects.playerSources(), { source: src });
      if (this.p.status.yice) {
        delete this.p.status.yice;
        this.drawN(1);
        this.log('遗策：额外摸 1 张');
      }
    }
  }
  async dying() {
    const ok = (c: CardInst) => !!(def(c).tao || def(c).jiu);
    while (this.p.hp <= 0) {
      if (!this.hand.some(ok)) break;
      const c = await this.io.respond(`濒死！体力 ${this.p.hp}，可用【桃】或【酒】自救`, ok, '放弃', false, 'tao');
      if (!c) break;
      this.toDiscard(c);
      this.heal(1 + (def(c).tao ? this.effects.cardStat(c, 'heal_amount') : 0));
      this.io.update();
    }
    if (this.p.hp <= 0) {
      this.over = true;
      this.io.onBattleEnd(false);
    }
  }
  checkWin() {
    if (this.over) return true;
    if (!this.alive().length) {
      this.over = true;
      this.io.onBattleEnd(true);
      return true;
    }
    return false;
  }
  /** 战间回复：默认 rules.map.betweenBattleHeal（H5 = 0，不回血）；只在胜利后进入下一场时生效，不超过体力上限 */
  nextBattle(heal: number = CONFIG.rules.map.betweenBattleHeal) {
    const healed = betweenBattleHeal(this.p.hp, this.p.maxHp, heal);
    if (healed > this.p.hp) this.log(`战间休整：回复 ${healed - this.p.hp} 点体力`);
    this.p.hp = healed;
    this.battleIdx++;
    this.startBattle();
  }
  evolved() {
    return this.deckMaster.filter((c) => c.mods.length);
  }
  affixName(id: string) {
    return AFFIXES.find((a) => a.id === id)?.n ?? id;
  }
}
export { CARDS };

/** 列出主动技 id 当前的合法敌人目标（按配置 targets 筛选；不需选敌人的技能返回 []）。UI / AI 统一用它判断可选目标。 */
export function legalTargets(g: Game, id: string): Enemy[] {
  return g.legalTargets(id);
}
