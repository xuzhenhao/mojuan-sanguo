import { CARDS, starterDeck } from '../data/cards';
import { BATTLES, ENEMIES, ENEMY_CARDS, MAX_FLASH_MARKS } from '../data/enemies';
import { HEROES, RULES } from '../data/heroes';
import { abilitySum, CONFIG, relicAbility } from '../data/config';
import { cardMatches, Effects, judgeFromCard, judgeOk, standardJudgeDeck, type Source } from './effects';
import { AFFIXES, EPIPHANY } from '../data/affixes';
import { rndInt, shuffle, type Rng } from './rng';
import {
  addAffix,
  affixPool,
  applyDamage,
  def,
  enemyDodges,
  enemyIntent,
  epiphanyRoll,
  delayTrickCombat,
  isRed,
  isShaPlay,
  pick3,
  playerShaDamage,
  RANK_CH,
  reviveAllowed,
  reviveHp,
  SUIT_CH,
} from './rules';
import type { AffixDef, BattleDef, CardInst, Enemy, EnemyAct, JudgeCard, JudgeEvent, PlayerDelayed, Slot } from './types';
import {
  cardHasExemptTag,
  cardHasTag,
  costFloor,
  julingCfg,
  lingPerTurn,
  maxPlaysPerTurn,
  reduceStackMax,
  zeroCostPerTurn,
  type LingSlotSnapshot,
} from './juling';

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

/** 敌人阶段切换事件（Boss 低血换意图；表现层播约 1 秒演出，PRD 10.9） */
export interface EnemyPhaseEvent {
  type: 'enemy_phase';
  enemy: Enemy;
  /** 新阶段序号：2 = 阶段 2 */
  phase: number;
}
/** 敌人召唤事件：summoned 已加入 Game.en；summoned = null 表示达到场上上限、召唤落空 */
export interface EnemySummonEvent {
  type: 'enemy_summon';
  source: Enemy;
  enemyId: string;
  summoned: Enemy | null;
}
/** 敌方延时锦囊放入 / 移出玩家判定区（张角【闪电】） */
export interface PlayerDelayedEvent {
  type: 'player_delayed';
  action: 'place' | 'hit' | 'expire' | 'remove';
  trick: PlayerDelayed;
  source?: Enemy;
}

/** 平台适配层需实现的 IO（Web DOM / 微信小游戏 Canvas 各自实现） */
/** 灵光一闪选择：词条 + （满 2 条时）替换目标 */
export type EpiphanyPick = AffixDef & { replace?: string };

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
  /**
   * 灵光一闪三选一（subpages-v05 §1.3）：返回选中词条；该牌已满 2 条时可带 replace（被替换的旧词条 id）。
   * null = 放弃（次数照常消耗）。
   */
  epiphany(c: CardInst, options: AffixDef[], reroll: () => AffixDef[]): Promise<EpiphanyPick | null>;
  /** 手满弃置（PRD §5.4）：新摸到的牌因手牌达到硬上限直接进弃牌堆；可选，表现层用来提示「手满，弃置」 */
  handOverflow?(ev: HandOverflowEvent): void;
  /** 敌人阶段切换（可选） */
  enemyPhase?(ev: EnemyPhaseEvent): void;
  /** 敌人召唤（可选；新敌人从下一个敌方回合起行动） */
  enemySummon?(ev: EnemySummonEvent): void;
  /** 玩家判定区变化（可选；状态也可直接读 Game.pJudge） */
  playerDelayed?(ev: PlayerDelayedEvent): void;
  hurt?(): void;
  enemyHit?(e: Enemy): void;
  /**
   * 复活层（PRD 4.4.1，#106）：体力归 0、濒死未救回且可复活时询问玩家；true = 复活，false = 放弃。
   * 不提供则视为不弹层（直接战败）。
   */
  revive?(ev: ReviveEvent): Promise<boolean>;
  /** 选复活后（意图换成闪之前）通知表现层：各敌复活前意图、本回合被取消出牌的敌人（PRD 4.4.1 动画） */
  revived?(ev: { prev: Map<number, { acts: EnemyAct[]; dmg: number }>; cancelled: number[] }): void;
  onBattleEnd(win: boolean): void;
}

export interface ReviveEvent {
  /** 选复活前剩余次数 */
  left: number;
  /** 复活后体力 / 护甲 */
  hp: number;
  armor: number;
}

export interface Settings {
  autoShan: boolean;
  epiphanyRate?: number;
  /** 主将 / 副将（默认 rules.defaultHeroes） */
  main?: string;
  sub?: string;
  /** rules.presets 中的预设（如 legacy_guanyu_zhaoyun） */
  preset?: string;
  /** 本局宝物（战斗内效果走 config relics abilities，#238） */
  relics?: string[];
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
  /** 本局剩余复活次数（由 RunSession 从 RunState 写入；直达调试默认 0 = 不弹复活） */
  reviveLeft = 0;
  /** 天命档（≥5 无复活） */
  tianming = 0;
  /** 正在结算敌方回合 / 本敌方回合因复活被取消（PRD 4.4 ①） */
  private inEnemyTurn = false;
  private enemyTurnCancelled = false;
  /** 敌方回合中正在出手的敌人（复活时只有它的剩余出牌被取消、化墨，PRD 4.4 ⑤） */
  private acting: Enemy | null = null;
  /** 本回合已使用的杀张数（虓烈 / 破阵） */
  shaIndex = 0;
  effects = new Effects(this);
  judgeDeck: JudgeCard[] = [];
  zeroCostPlays = new Map<string, number>();
  /** 本回合额外产令（不含 perTurn 基础令；受 juling.maxGainPerTurn） */
  lingGainedThisTurn = 0;
  /** 本回合主动出牌次数（不含响应；受 loop.maxPlaysPerTurn） */
  playsThisTurn = 0;
  /** 埋点（#181）：每回合主动出牌数（下标 = 回合 − 1）与本场循环牌（loop tag）出牌数 */
  playsByTurn: number[] = [];
  loopPlays = 0;
  /** 最近一次军令变化，供 lingSlot().delta / 飘字 */
  lingDelta = 0;
  /** 本局宝物 id（战斗内效果最小接线） */
  relics: string[] = [];
  extraActs = new Map<Enemy, string[]>();
  /** 玩家判定区：敌方放置的延时锦囊（张角【闪电】） */
  pJudge: PlayerDelayed[] = [];
  /** 指定本场敌人（地图节点 / 单场模拟）；不设则按 BATTLES[battleIdx] */
  encounter?: BattleDef;
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
    this.relics = settings.relics ?? [];
    this.deckMaster = starterDeck(this.main.id, pre?.deck).map(([id, suit, rank]) => ({ uid: ++this.uid, id, suit, rank, mods: [] }));
    this.p = {
      hp: this.main.hp,
      maxHp: this.main.hp,
      armor: 0,
      ling: 0,
      maxLing: lingPerTurn(),
      equip: {},
      jiu: 0,
      aogu: 0,
      yiyong: 0,
      lianShan: 0,
      status: {},
    };
  }

  get battle(): BattleDef {
    return this.encounter ?? BATTLES[this.battleIdx];
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
    const base = c.asSha ? 1 : d.cost;
    let reduce = 0;
    reduce += this.effects.cardStat(c, 'card_cost'); // 轻招 / 精研（通常为负）
    if (isShaPlay(c)) {
      reduce += this.effects.stat('sha_cost'); // 诸葛弩（受 limit 约束）
      if (this.p.lianShan) reduce -= 1;
    }
    reduce += this.tempCostReduce(c);
    const cap = reduceStackMax();
    if (reduce < -cap) reduce = -cap;
    return Math.max(costFloor(), base + reduce);
  }
  /** 状态带来的临时费减（厉兵 / 整策 / 破军令 / 减负） */
  tempCostReduce(c: CardInst) {
    const p = this.p.status;
    let r = 0;
    if (isShaPlay(c)) {
      if (p.sha_cost_next) r -= 1;
      if (p.sha_cost_turn) r -= 1;
    } else if (def(c).trick) {
      if (p.trick_cost_next) r -= 1;
      if (p.trick_cost_turn) r -= 1;
    }
    return r;
  }
  /** 产令：受 hardCap 与 maxGainPerTurn（额外产令）约束；返回实际获得量。maxGain 截断静默（不标「满」）。 */
  addLing(n: number, opts: { countGain?: boolean } = {}) {
    if (n <= 0) {
      this.lingDelta = 0;
      return 0;
    }
    const j = julingCfg();
    let gain = n;
    if (opts.countGain !== false && j) {
      const left = Math.max(0, j.maxGainPerTurn - this.lingGainedThisTurn);
      gain = Math.min(gain, left); // 静默截断，不置 full
      this.lingGainedThisTurn += gain;
    }
    if (gain <= 0) {
      this.lingDelta = 0;
      return 0;
    }
    const hard = j?.hardCap ?? 99;
    const before = this.p.ling;
    this.p.ling = Math.min(hard, this.p.ling + gain);
    const got = this.p.ling - before;
    this.lingDelta = got;
    return got;
  }
  /** 回合结束保留军令（juling.carryMax） */
  applyLingCarry() {
    const j = julingCfg();
    if (!j) return;
    if (this.p.ling > j.carryMax) {
      const before = this.p.ling;
      this.log(`军令保留：${before}→${j.carryMax}`);
      this.p.ling = j.carryMax;
      this.lingDelta = this.p.ling - before;
    }
  }
  /**
   * 令槽只读快照（#230 锁定 → #231）：`LingSlotSnapshot`。
   * 「满」= full，仅 hardCap；maxGainPerTurn 截断不置 full。
   */
  lingSlot(): LingSlotSnapshot {
    const j = julingCfg();
    const cap = lingPerTurn();
    const hardCap = j?.hardCap ?? cap;
    const current = this.p.ling;
    return {
      current,
      cap,
      hardCap,
      overflow: current > cap,
      carryMax: j?.carryMax ?? 0,
      delta: this.lingDelta,
      full: current >= hardCap,
    };
  }
  /**
   * 使用丹药（#238：效果来自 config/potions abilities `on: use`，代码不按 id 判断）。
   * 返回 null 成功，否则错误文案。调用方负责从背包移除。
   */
  usePotion(id: string): string | null {
    const cfg = CONFIG.potions[id];
    const ling = abilitySum(cfg?.abilities, 'use', 'ling');
    if (!cfg || !ling) return `丹药 ${id} 暂未接线`;
    const got = this.addLing(ling);
    if (got) this.log(`${cfg.name}：军令 +${got}`);
    else this.log(`${cfg.name}：军令未增加（已触顶或本回合产令上限）`);
    this.io.update();
    return null;
  }
  /** 手牌上限 = max(2, 体力) + hand_limit（遗计、托孤…）+ 宝物 passive handLimit（如 R02 虎符 −1，#238） */
  handLimit() {
    return Math.max(RULES.minHandLimit, this.p.hp) + this.effects.stat('hand_limit') + relicAbility(this.relics, 'passive', 'handLimit');
  }
  /** 可否把这张牌当杀使用（武执、龙胆闪→杀） */
  canAsSha(c: CardInst) {
    return !def(c).sha && !!this.effects.convertFor(c, 'B001');
  }
  canAsShan(c: CardInst) {
    return !!def(c).shan || !!this.effects.convertFor(c, 'B004');
  }

  spawnEnemy(id: string, row?: 'front' | 'back'): Enemy {
    const d = ENEMIES[id];
    if (!d) throw new Error(`未知敌人 ${id}`);
    return {
      ...d,
      pat: d.pat,
      id,
      uid: ++this.uid,
      max: d.hp,
      armor: d.armorStart ?? 0,
      step: 0,
      marks: d.flash,
      judge: [],
      phase: 0,
      ...(row ? { row } : {}),
    };
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
  /** 本场开场额外护甲（V13 收编，#91）：battle_start 之后叠加，开场护甲总上限 4（PRD 开场护甲规则） */
  startArmorBonus = 0;
  startBattle() {
    this.draw = shuffle(this.rng, this.deckMaster.slice());
    this.discard = [];
    this.hand = [];
    this.turn = 0;
    this.playsByTurn = [];
    this.loopPlays = 0;
    this.epiCount = 0;
    this.sincePity = 0;
    this.over = false;
    this.effects.reset('battle');
    this.p.armor = 0;
    this.p.equip = {};
    this.p.status = {};
    this.pJudge = [];
    this.en = this.battle.en.map((id) => this.spawnEnemy(id));
    this.log(`—— 第${this.battleIdx + 1}战：${this.battle.name} ——`);
    this.effects.emitSync('battle_start', this.effects.playerSources());
    // 开场护甲（宝物 battle_start armor 如 R06 + 事件收编护甲）统一受 rules.event.startArmorCap 约束；
    // 只截断本次加成，不削减已有护甲（#195 / 总策划口径：不绕过开局护甲上限）
    this.addStartArmor(relicAbility(this.relics, 'battle_start', 'armor'));
    this.addStartArmor(this.startArmorBonus);
    this.playerTurn();
  }
  playerTurn() {
    this.turn++;
    const p = this.p;
    const per = lingPerTurn();
    p.maxLing = per;
    const j = julingCfg();
    const hard = j?.hardCap ?? 99;
    // 留令：上回合 carry 后的余量 + 本回合地板；首回合无留存
    const beforeLing = p.ling;
    if (this.turn === 1) p.ling = per;
    else p.ling = Math.min(hard, p.ling + per);
    this.lingDelta = p.ling - beforeLing;
    this.lingGainedThisTurn = 0;
    this.playsThisTurn = 0;
    if (this.turn > 1) p.jiu = 0; // 首回合保留战斗开始获得的酒（凤仪亭）
    p.aogu = 0;
    p.yiyong = 0;
    p.lianShan = 0;
    delete p.status.xieling;
    delete p.status.empty_draw;
    delete p.status.sha_cost_next;
    delete p.status.sha_cost_turn;
    delete p.status.trick_cost_next;
    delete p.status.trick_cost_turn;
    // pending_ling（蓄势）在摸牌前结算，计入额外产令
    if (p.status.pending_ling) {
      const got = this.addLing(p.status.pending_ling);
      if (got) this.log(`待令：下回合军令 +${got}`);
      delete p.status.pending_ling;
    }
    // 宝物 turn_start ling（如 R02 虎符 +1；#238 走 config abilities）：逐件 addLing → lingDelta / 飘字；受 maxGainPerTurn
    for (const id of this.relics) {
      const r = CONFIG.relics[id];
      const n = abilitySum(r?.abilities, 'turn_start', 'ling');
      if (!r || !n) continue;
      const got = this.addLing(n);
      if (got) this.log(`${r.name}：军令 +${got}`);
    }
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
    this.log(`你的回合${this.turn}：军令${p.ling}，摸${n}张`);
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
    const maxP = maxPlaysPerTurn();
    if (maxP != null && !d.shan && !d.response && this.playsThisTurn >= maxP) return `本回合最多出 ${maxP} 张牌`;
    const zl = zeroCostPerTurn();
    if (zl != null && !d.shan && !d.response && !cardHasExemptTag(c.id) && this.costOf(c) === 0 && (this.zeroCostPlays.get(c.id) ?? 0) >= zl)
      return `0 费牌每回合限 ${zl} 次`;
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
    this.lingDelta = -cost;
    if (!d.shan && !d.response) {
      this.playsThisTurn++;
      const ti = Math.max(0, this.turn - 1);
      while (this.playsByTurn.length <= ti) this.playsByTurn.push(0);
      this.playsByTurn[ti]++;
      if (cardHasTag(c.id, 'loop')) this.loopPlays++;
    }
    if (cost === 0 && !d.shan && !d.response && !cardHasExemptTag(c.id)) this.zeroCostPlays.set(c.id, (this.zeroCostPlays.get(c.id) ?? 0) + 1);
    // 消费「下一张」费减
    if (isShaPlay(c) && p.status.sha_cost_next) delete p.status.sha_cost_next;
    else if (d.trick && !c.asSha && p.status.trick_cost_next) delete p.status.trick_cost_next;
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
    if (e.hp <= 0) this.dropDelayedFrom(e);
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

  /** 开场护甲加成：加后不超过 startArmorCap；已高于上限时不加也不减 */
  addStartArmor(n: number) {
    if (n <= 0) return;
    this.p.armor = Math.min(this.p.armor + n, Math.max(this.p.armor, CONFIG.rules.event.startArmorCap));
  }

  // ---------- 灵光一闪 ----------
  /** 灵光一闪基础概率 = settings.epiphanyRate ?? 配置基础值，+ 宝物 passive epiphanyRate（如 R01 +5%，#195） */
  epiphanyRate() {
    return (this.settings.epiphanyRate ?? EPIPHANY.baseRate) + relicAbility(this.relics, 'passive', 'epiphanyRate');
  }
  async maybeEpiphany(c: CardInst, ok: boolean, wasSha = false) {
    if (!ok) return;
    this.sincePity++;
    if (!epiphanyRoll(this.rng, this.epiCount, this.sincePity, this.epiphanyRate())) return;
    if (wasSha) return;
    const pool = affixPool(c, this.deckMaster);
    if (!pool.length) return;
    this.epiCount++;
    this.sincePity = 0;
    const a = await this.io.epiphany(c, pick3(this.rng, pool), () => pick3(this.rng, pool));
    if (a) {
      const i = a.replace ? c.mods.indexOf(a.replace) : -1;
      if (i >= 0) c.mods[i] = a.id;
      else addAffix(c, a.id);
      this.log(`灵光一闪！【${def(c).name}】获得「${a.n}」`);
      this.io.update(); // 牌面词条标记立即重绘（#105 验收 8）
    }
  }

  // ---------- 回合结束 / 敌方回合 ----------
  /** 回合结束时机（月隐、仁义、挟势）：在弃牌前调用；endTurn 会补调 */
  turnEnd() {
    if (this.turnEndDone) return;
    this.turnEndDone = true;
    this.effects.emitSync('turn_end', this.effects.playerSources());
    this.applyLingCarry();
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
  /** 敌人判定区：通用延时锦囊结算（跳过出牌 / 命中移除均由卡牌 abilities 驱动，#176） */
  async resolveJudgeArea(e: Enemy) {
    let skipAtk = false;
    for (const c of e.judge.slice()) {
      if (e.hp <= 0 || this.over) break;
      const left = (e.delayLeft?.[c.uid] ?? 1) - 1;
      let done = left <= 0;
      const srcs: Source[] = this.effects.cardSources(c, false).filter((s) => s.ab.trigger.when === 'enemy_turn_start');
      const r = await this.effects.emit('enemy_turn_start', srcs, { owner: e, card: c });
      if (r.skipEnemyActs) skipAtk = true;
      if (r.removeDelayed) done = true;
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
    this.inEnemyTurn = true;
    this.enemyTurnCancelled = false;
    try {
      await this.enemyTurnBody();
    } finally {
      this.inEnemyTurn = false;
      this.acting = null;
    }
    if (this.enemyTurnCancelled) {
      this.enemyTurnCancelled = false;
      this.log('复活：本敌方回合剩余出牌取消');
    }
    if (!this.over) this.playerTurn();
  }
  private async enemyTurnBody() {
    const cut = () => this.over || this.enemyTurnCancelled;
    /** 本回合开始时已被复活替换为 [闪] 的敌人（打完本回合清除；被替换的那一步不补打） */
    const flashTurn = new Set(this.en.filter((e) => e.reviveFlash));
    this.io.update();
    await this.io.sleep(400);
    const order = [...this.front(), ...this.alive().filter((e) => e.row === 'back')];
    this.effects.reset('enemy_turn');
    this.extraActs.clear();
    for (const e of this.en) if (e.hp <= 0) this.dropDelayedFrom(e);
    /** PRD 4.4 ⑤（V0.5.12）：已开始出手 / 已推进步数的敌人 */
    const started = new Set<Enemy>();
    const stepped = new Set<Enemy>();
    for (const e of order) {
      if (e.hp <= 0 || cut()) continue;
      started.add(e);
      this.acting = e;
      const skipAtk = await this.resolveJudgeArea(e);
      if (e.hp <= 0 || cut()) continue;
      const eak = CONFIG.rules.enemyArmorKeep;
      if (eak != null && this.turn > 1 && e.armor > eak) {
        this.log(`${e.name}护甲保留上限：${e.armor}→${eak}`);
        e.armor = eak;
      }
      await this.effects.emit('enemy_turn_start', this.effects.enemySources(e), { owner: e });
      if (e.hp <= 0 || cut()) continue;
      this.checkPhase(e);
      await this.resolvePlayerJudge(e);
      if (cut()) continue;
      if (CONFIG.rules.mechanics.moying && !e.reviveFlash && e.tier !== '小怪' && this.p.hp >= this.p.maxHp) {
        this.extraActs.set(e, [...(this.extraActs.get(e) ?? []), '杀']);
        this.log(`${e.name}·墨影：你体力已满，本回合多出 1 张【杀】`);
      }
      this.io.enemyHit?.(e);
      await this.io.sleep(300);
      for (const a of [...enemyIntent(e).acts, ...((this.extraActs.get(e) ?? []) as EnemyAct[])]) {
        if (cut() || e.hp <= 0) break;
        if (a.startsWith('锦囊:')) {
          if (!skipAtk) await this.enemyTrick(e, a.slice(3));
          this.io.update();
          await this.io.sleep(250);
          continue;
        }
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
      // 只出闪的回合：上回合因复活未出手的敌人，保留的那一步不消耗（PRD 4.4 ⑤）
      if (flashTurn.has(e) && e.reviveKeep) e.reviveKeep = false;
      else e.step++;
      stepped.add(e);
      this.acting = null;
      if (flashTurn.has(e)) e.reviveFlash = false;
      e.noSha = false;
      e.redirect = false;
      this.io.update();
      await this.io.sleep(350);
      if (this.over) return;
    }
    for (const e of flashTurn) if (e.hp <= 0) e.reviveFlash = false;
    if (this.enemyTurnCancelled) {
      // PRD 4.4 ⑤：正在出手的敌人本步算用掉；未出手的敌人本步保留，在只出闪那回合之后先打出
      for (const e of order) {
        if (e.hp <= 0) continue;
        if (started.has(e)) {
          if (!stepped.has(e)) e.step++;
        } else e.reviveKeep = true;
      }
    }
    this.alive().forEach((e) => {
      e.marks = Math.min(MAX_FLASH_MARKS, Math.max(e.marks, e.flash));
    });
  }
  // ---------- Boss 机制：阶段 / 召唤 / 敌方延时锦囊 ----------
  /**
   * 阶段切换（PRD 11.2）：在该敌人自己的回合开始（判定区、回合开始被动之后、出牌之前）检查；
   * 体力 ≤ 上限 × 阈值即进入下一阶段：换意图表、步数归零、召唤。每个阶段只触发一次，不会回退。
   */
  checkPhase(e: Enemy) {
    const phases = e.phases ?? [];
    const cur = e.phase ?? 0;
    const next = phases[cur];
    if (!next || e.hp <= 0 || e.hp > e.max * next.hpAtMost) return false;
    e.phase = cur + 1;
    e.pat = next.pat;
    e.step = 0;
    this.log(`${e.name}进入阶段 ${e.phase + 1}`);
    this.io.enemyPhase?.({ type: 'enemy_phase', enemy: e, phase: e.phase + 1 });
    for (const s of next.summon) this.summon(e, s.enemy, s.row);
    this.io.update();
    return true;
  }
  /** 召唤：加到场上（默认后排）；场上存活敌人达到 rules.maxEnemiesAlive 时落空。本敌方回合不行动。 */
  summon(src: Enemy, id: string, row: 'front' | 'back' = 'back'): Enemy | null {
    const cap = CONFIG.rules.maxEnemiesAlive ?? 3;
    if (this.alive().length >= cap) {
      this.log(`${src.name}召唤${ENEMIES[id]?.name ?? id}：场上已满（${cap}），召唤落空`);
      this.io.enemySummon?.({ type: 'enemy_summon', source: src, enemyId: id, summoned: null });
      return null;
    }
    const n = this.spawnEnemy(id, row);
    n.summonedBy = src.uid;
    this.en.push(n);
    this.fixRows();
    this.log(`${src.name}召唤${n.name}（${n.row === 'back' ? '后排' : '前排'}）`);
    this.io.enemySummon?.({ type: 'enemy_summon', source: src, enemyId: id, summoned: n });
    return n;
  }
  /** 敌方锦囊（意图「锦囊:<id>」）：延时伤害类放入玩家判定区（同 id 同时最多 1 张；数值来自卡牌配置，#176） */
  async enemyTrick(e: Enemy, id: string) {
    const card = CONFIG.cards[id];
    const name = card?.name ?? id;
    const combat = card ? delayTrickCombat(card) : null;
    if (!combat?.hasDamage || combat.amount == null || combat.duration == null) {
      this.log(`${e.name}的锦囊【${name}】未实装，跳过`);
      return;
    }
    if (this.pJudge.some((t) => t.id === id)) {
      this.log(`${e.name}使用【${name}】：你的判定区已有【${name}】，无效`);
      return;
    }
    this.log(`${e.name}对你使用【${name}】`);
    if (await this.trickNegated(name, e)) return;
    const amount = e.trickOverrides?.[id]?.amount ?? combat.amount;
    const t: PlayerDelayed = { id, name, from: e.uid, amount, left: combat.duration };
    this.pJudge.push(t);
    this.io.playerDelayed?.({ type: 'player_delayed', action: 'place', trick: t, source: e });
  }
  /** 敌方锦囊对你生效前的无懈可击窗口（#74 wuxieWindow） */
  async trickNegated(name: string, from: Enemy): Promise<boolean> {
    return this.wuxieWindow(name, from);
  }
  /** 施放者阵亡：移除它放在你判定区的延时锦囊（不再判定） */
  dropDelayedFrom(e: Enemy) {
    for (const t of this.pJudge.filter((x) => x.from === e.uid)) {
      this.pJudge = this.pJudge.filter((x) => x !== t);
      this.log(`${e.name}阵亡，你判定区的【${t.name}】移除`);
      this.io.playerDelayed?.({ type: 'player_delayed', action: 'remove', trick: t, source: e });
    }
  }
  /** 玩家判定区：施放者每个回合开始判定 1 次（命中条件 / 伤害属性来自卡牌配置，#176） */
  async resolvePlayerJudge(e: Enemy) {
    for (const t of this.pJudge.filter((x) => x.from === e.uid)) {
      if (this.over) return;
      const combat = CONFIG.cards[t.id] ? delayTrickCombat(CONFIG.cards[t.id]) : null;
      const r = await this.judge(t.name);
      t.left--;
      const hit = combat?.success ? judgeOk(r, combat.success) : false;
      if (hit || t.left <= 0) {
        this.pJudge = this.pJudge.filter((x) => x !== t);
        this.io.playerDelayed?.({ type: 'player_delayed', action: hit ? 'hit' : 'expire', trick: t, source: e });
      }
      if (hit) {
        this.log(`【${t.name}】命中`);
        const el = combat?.element === 'thunder' ? '雷' : combat?.element === 'fire' ? '火' : undefined;
        await this.dmgPlayer(t.amount, e, el);
      } else this.log(t.left > 0 ? `【${t.name}】未命中（还剩 ${t.left} 次）` : `【${t.name}】判定次数用完，移除`);
      this.io.update();
    }
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
  async dmgPlayer(n: number, src?: Enemy, attr?: '雷' | '火') {
    const had = this.p.armor;
    const { absorbed, hpLoss } = applyDamage(this.p, n);
    this.log(`你受到${n}点${attr ?? ''}伤害${absorbed ? `（护甲抵${absorbed}）` : ''}`);
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
    if (this.p.hp <= 0 && this.canRevive() && this.io.revive) {
      const rv = CONFIG.rules.revive;
      if (await this.io.revive({ left: this.reviveLeft, hp: reviveHp(this.p.maxHp), armor: rv.armor })) {
        this.doRevive();
        return;
      }
    }
    if (this.p.hp <= 0) {
      this.over = true;
      this.io.onBattleEnd(false);
    }
  }
  canRevive() {
    return reviveAllowed(this.reviveLeft, this.tianming);
  }
  /** 选「复活」（PRD 4.4 / 4.4.1）：扣次数、回体力 + 护甲；敌方回合中则取消剩余出牌；下一敌方回合全员只出闪 */
  doRevive() {
    const rv = CONFIG.rules.revive;
    this.reviveLeft--;
    this.p.hp = reviveHp(this.p.maxHp);
    this.p.armor += rv.armor;
    const prev = new Map(
      this.alive().map((e) => {
        const i = enemyIntent(e);
        return [e.uid, { acts: [...i.acts], dmg: i.dmg }] as [number, { acts: EnemyAct[]; dmg: number }];
      }),
    );
    const cancelled = this.inEnemyTurn && this.acting && this.acting.hp > 0 ? [this.acting.uid] : [];
    for (const e of this.alive()) e.reviveFlash = true;
    if (this.inEnemyTurn) this.enemyTurnCancelled = true;
    this.io.revived?.({ prev, cancelled });
    this.log(`将星未陨：复活，体力 ${this.p.hp}，护甲 +${rv.armor}`);
    this.io.update();
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
