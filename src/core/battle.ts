import { CARDS, STARTER_DECK } from '../data/cards';
import { BATTLES, ENEMIES, ENEMY_CARDS, MAX_FLASH_MARKS } from '../data/enemies';
import { HEROES, RULES } from '../data/heroes';
import { CONFIG } from '../data/config';
import { cardMatches, Effects, standardJudgeDeck } from './effects';
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
  handLimit,
  hasMod,
  isRed,
  isShaPlay,
  lebuSkips,
  pick3,
  playerShaDamage,
  RANK_CH,
  SUIT_CH,
} from './rules';
import type { AffixDef, CardInst, Enemy, EnemyAct, Slot } from './types';

/** 平台适配层需实现的 IO（Web DOM / 微信小游戏 Canvas 各自实现） */
export interface BattleIO {
  log(t: string): void;
  update(): void;
  sleep(ms: number): Promise<void>;
  showJudge(reason: string, c: CardInst): Promise<void>;
  /** 响应窗口：返回打出的牌或 null（放弃/超时） */
  respond(text: string, legal: (c: CardInst) => boolean, pass: string, timed: boolean): Promise<CardInst | null>;
  /** 灵光一闪三选一：reroll 可调用一次（看广告刷新） */
  epiphany(c: CardInst, options: AffixDef[], reroll: () => AffixDef[]): Promise<AffixDef | null>;
  hurt?(): void;
  enemyHit?(e: Enemy): void;
  onBattleEnd(win: boolean): void;
}

export interface Settings {
  autoShan: boolean;
  epiphanyRate?: number;
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
  /** 事件总线 + DSL 解释器 */
  effects = new Effects(this);
  /** 天机签筒（rules.mechanics.judgeSource = pool 时使用） */
  judgeDeck: CardInst[] = [];
  /** 本回合各 0 费牌已打出次数（M4） */
  zeroCostPlays = new Map<string, number>();
  /** 敌人本回合追加的意图牌（墨影 / add_enemy_acts） */
  extraActs = new Map<Enemy, string[]>();
  logs: string[] = [];
  main = HEROES.H01;
  sub = HEROES.H02;

  constructor(
    public rng: Rng,
    public io: BattleIO,
    public settings: Settings,
  ) {
    this.deckMaster = STARTER_DECK.map(([id, suit, rank]) => ({ uid: ++this.uid, id, suit, rank, mods: [] }));
    this.p = { hp: this.main.hp, maxHp: this.main.hp, armor: 0, ling: 3, maxLing: RULES.lingPerTurn, equip: {}, jiu: 0, aogu: 0, yiyong: 0, lianShan: 0 };
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
    let r = w ? (def(w).range ?? 1) : 1;
    if (hasMod(w, 'E_W02')) r++;
    r -= this.effects.stat('distance'); // 赤兔等：距离 -1 = 范围 +1
    return r;
  }
  dist(e: Enemy) {
    return e.row === 'front' ? 1 : this.front().length ? 2 : 1;
  }
  inRange(e: Enemy, c?: CardInst) {
    if (c && hasMod(c, 'E_S04')) return true;
    if (this.p.yiyong && c && isShaPlay(c)) return true;
    return this.dist(e) <= this.attackRange();
  }
  canTarget(e: Enemy, c: CardInst) {
    return isShaPlay(c) ? this.inRange(e, c) : true;
  }
  costOf(c: CardInst) {
    const d = def(c);
    let k = c.asSha ? 1 : d.cost;
    if (isShaPlay(c)) {
      if (hasMod(c, 'E_S02')) k--;
      k += this.effects.stat('sha_cost'); // 诸葛弩等常驻减费（受 limit 约束）
      if (this.p.lianShan) k--;
    }
    if (d.type.includes('锦囊') && hasMod(c, 'E_T01')) k--;
    return Math.max(0, k);
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
      this.hand.push(this.draw.pop()!);
    }
  }
  toDiscard(c: CardInst) {
    this.hand = this.hand.filter((x) => x !== c);
    this.discard.push(c);
    c.asSha = false;
  }
  async judge(reason: string) {
    if (CONFIG.rules.mechanics.judgeSource === 'pool') {
      // M1：独立天机签筒，抽空洗回
      if (!this.judgeDeck.length) this.judgeDeck = shuffle(this.rng, standardJudgeDeck());
      const c = this.judgeDeck.pop()!;
      await this.io.showJudge(reason, c);
      this.log(`判定（${reason}）：${SUIT_CH[c.suit]}${RANK_CH[c.rank]}`);
      return c;
    }
    if (!this.draw.length) {
      this.draw = shuffle(this.rng, this.discard);
      this.discard = [];
    }
    const c = this.draw.pop()!;
    this.discard.push(c);
    await this.io.showJudge(reason, c);
    this.log(`判定（${reason}）：${SUIT_CH[c.suit]}${RANK_CH[c.rank]}`);
    return c;
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
    this.en = this.battle.en.map((id) => {
      const d = ENEMIES[id];
      return { ...d, pat: d.pat, id, uid: ++this.uid, max: d.hp, armor: 0, step: 0, marks: d.flash, judge: [] };
    });
    this.log(`—— 第${this.battleIdx + 1}战：${this.battle.name} ——`);
    this.effects.emitSync('battle_start', this.effects.playerSources()); // 龙虎会开场护甲等
    this.playerTurn();
  }
  playerTurn() {
    this.turn++;
    const p = this.p;
    p.ling = p.maxLing;
    p.jiu = 0;
    p.aogu = 0;
    p.yiyong = 0;
    p.lianShan = 0;
    // 难度方案 D ①：回合开始护甲最多保留 RULES.armorKeep 点（首回合不削，保留龙虎会开场护甲）
    if (this.turn > 1 && p.armor > RULES.armorKeep) {
      this.log(`护甲保留上限：${p.armor}→${RULES.armorKeep}`);
      p.armor = RULES.armorKeep;
    }
    this.effects.reset('turn');
    this.zeroCostPlays.clear();
    const n = RULES.drawPerTurn + (this.turn === 1 ? RULES.firstTurnBonus : 0);
    this.drawN(n);
    this.log(`你的回合${this.turn}：军令回满，摸${n}张`);
    this.io.update();
  }
  /** 出牌前校验，返回错误提示或 null */
  checkPlay(c: CardInst): string | null {
    const d = def(c);
    if (d.shan && !c.asSha) return '闪只能在响应窗口打出';
    if (this.costOf(c) > this.p.ling) return '军令不足';
    if (d.tao && !c.asSha && this.p.hp >= this.p.maxHp) return '体力已满';
    if (d.needRed && !c.asSha && !this.hand.some((x) => x !== c && isRed(x))) return `${d.name}需另一张红色牌`;
    const zl = CONFIG.rules.mechanics.zeroCostPerTurn;
    if (zl != null && !d.shan && this.costOf(c) === 0 && (this.zeroCostPlays.get(c.id) ?? 0) >= zl) return `0 费牌每回合限 ${zl} 次`;
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
    if (cost === 0 && !d.shan) this.zeroCostPlays.set(c.id, (this.zeroCostPlays.get(c.id) ?? 0) + 1);
    if (isShaPlay(c) && d.cost > 0) this.effects.stat('sha_cost', true); // 计入诸葛弩等的每回合次数
    if (isShaPlay(c)) p.lianShan = 0;
    if (hasMod(c, 'E_T06')) p.ling++;
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
      if (hasMod(c, 'E_W03')) this.drawN(2);
    } else this.toDiscard(c);
    if (wasSha) {
      c.asSha = true; // 结算期间保留“当杀”标记
      // 转化（武执等）：按被当作的牌（杀）的能力结算
      const as =
        this.effects
          .playerSources()
          .flatMap((s) => s.ab.do)
          .find((x) => x.do === 'convert' && x.as && CONFIG.cards[x.as]?.tags?.includes('sha'))?.as ?? 'B001';
      const srcs = (CONFIG.cards[as].abilities ?? []).map((ab) => ({ ab, key: `conv:${c.uid}:${ab.id}`, card: c }));
      ok = !!(await this.effects.emit('play', srcs, { card: c, chosen: tgt })).hit;
    } else if (!d.slot) {
      const r = await this.effects.emit('play', this.effects.cardSources(c, false), { card: c, chosen: tgt, red });
      if (isShaPlay(c)) ok = !!r.hit;
      if (d.tao)
        await this.effects.emit(
          'heal',
          this.effects.cardSources(c).filter((s) => s.key.startsWith('affix:')),
          { card: c },
        );
    }
    if (d.type.includes('锦囊') && hasMod(c, 'E_T02')) this.drawN(1);
    c.asSha = false;
    this.io.update();
    if (this.checkWin()) return;
    await this.maybeEpiphany(c, ok, wasSha);
    this.io.update();
    this.checkWin();
  }

  async playerSha(c: CardInst, e: Enemy, bonus: number) {
    const p = this.p;
    const n = playerShaDamage(c, p, bonus);
    p.jiu = 0;
    p.aogu = 0;
    p.yiyong = 0;
    const fire = def(c).fire || hasMod(c, 'E_S05');
    const nm = c.asSha ? `${def(c).name}(当杀)` : def(c).name;
    // 玩家使用杀时的常驻能力（龙虎会：每场首次杀摸 1 等）
    await this.effects.emit(
      'play',
      this.effects.playerSources().filter((s) => !s.card),
      { card: c },
      c,
    );
    const targets = [e];
    if (hasMod(c, 'E_S06')) {
      const o = this.alive().filter((x) => x !== e && this.inRange(x, c));
      if (o.length) targets.push(o[0]);
    }
    let anyHit = false;
    for (const t of targets) {
      if (hasMod(c, 'E_S07')) t.armor = Math.max(0, t.armor - 2);
      this.log(`你对${t.name}使用【${nm}】`);
      if (enemyDodges(t, hasMod(c, 'E_S08'))) {
        this.log(`${t.name}消耗闪标记，闪避`);
        this.io.enemyHit?.(t);
        await this.io.sleep(300);
        continue;
      }
      const killed = await this.dmgEnemy(t, n, fire ? '火' : '普通');
      anyHit = true;
      if (killed && hasMod(c, 'E_S03')) this.drawN(1);
    }
    return anyHit;
  }
  async dmgEnemy(e: Enemy, n: number, attr: string) {
    const { absorbed } = applyDamage(e, n);
    this.log(`${e.name}受到${n}点${attr === '火' ? '火' : ''}伤害${absorbed ? `（护甲抵${absorbed}）` : ''}`);
    this.io.enemyHit?.(e);
    this.io.update();
    await this.io.sleep(350);
    if (e.hp <= 0) {
      this.log(`${e.name}被击破`);
      this.fixRows();
      this.io.update();
      return true;
    }
    return false;
  }
  heal(n: number) {
    const b = this.p.hp;
    this.p.hp = Math.min(this.p.maxHp, this.p.hp + n);
    this.log(`回复${this.p.hp - b}点体力`);
  }

  /** 主动技（如傲骨）：配置里 trigger.when = active；弃牌筛选取 discard.from */
  canActivate(id: string) {
    const s = this.effects.activeAbility(id);
    if (!s || !this.effects.ready(s, {})) return false;
    const from = s.ab.do.find((a) => a.do === 'discard')?.from;
    return !from || this.hand.some((c) => cardMatches(c, from));
  }
  /** 主动技为同步结算（弃牌 + 状态），保证调用返回时已生效 */
  activate(id: string, c?: CardInst) {
    const s = this.effects.activeAbility(id);
    if (!s || !this.canActivate(id)) return;
    const from = s.ab.do.find((a) => a.do === 'discard')?.from;
    if (from && (!c || !cardMatches(c, from))) return;
    this.effects.emitSync('active', [s], { card: c });
    this.io.update();
  }
  get aoguUsed() {
    const s = this.effects.activeAbility('aogu');
    return !s || this.effects.remaining(s) <= 0;
  }
  canAogu() {
    return this.canActivate('aogu');
  }
  aogu(c: CardInst) {
    this.activate('aogu', c);
  }

  // ---------- 灵光一闪 ----------
  async maybeEpiphany(c: CardInst, ok: boolean, wasSha = false) {
    if (!ok) return;
    this.sincePity++;
    if (!epiphanyRoll(this.rng, this.epiCount, this.sincePity, this.settings.epiphanyRate)) return;
    if (wasSha) return;
    const pool = affixPool(c);
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
  discardNeeded() {
    return Math.max(0, this.hand.length - handLimit(this.p.hp));
  }
  async endTurn(discards: CardInst[] = []) {
    discards.forEach((c) => this.toDiscard(c));
    if (discards.length) this.log('回合结束弃牌');
    await this.enemyTurn();
  }
  async enemyTurn() {
    this.io.update();
    await this.io.sleep(400);
    const order = [...this.front(), ...this.alive().filter((e) => e.row === 'back')];
    this.effects.reset('enemy_turn');
    this.extraActs.clear();
    for (const e of order) {
      if (e.hp <= 0 || this.over) continue;
      await this.effects.emit('enemy_turn_start', this.effects.enemySources(e), { owner: e });
      if (CONFIG.rules.mechanics.moying && e.tier !== '小怪' && this.p.hp >= this.p.maxHp) {
        this.extraActs.set(e, [...(this.extraActs.get(e) ?? []), '杀']);
        this.log(`${e.name}·墨影：你体力已满，本回合多出 1 张【杀】`);
      }
      let skipAtk = false;
      if (e.judge.length) {
        this.discard.push(e.judge.shift()!);
        const r = await this.judge(`${e.name}·乐不思蜀`);
        if (lebuSkips(r)) {
          skipAtk = true;
          this.log(`${e.name}乐不思蜀生效，不出杀/锦囊`);
        } else this.log('判定为♥，乐不思蜀失效');
      }
      this.io.enemyHit?.(e);
      await this.io.sleep(300);
      for (const a of [...enemyIntent(e).acts, ...((this.extraActs.get(e) ?? []) as EnemyAct[])]) {
        if (this.over) return;
        const k = ENEMY_CARDS[a];
        if (k.t === '杀') {
          if (!skipAtk) await this.enemySha(e, k.dmg!, k.mod);
        } else if (k.t === '万箭') {
          if (!skipAtk) {
            this.log(`${e.name}使用【万箭齐发】（不可闪）`);
            await this.dmgPlayer(k.dmg!);
          }
        } else if (k.t === '闪') {
          if (e.marks < MAX_FLASH_MARKS) e.marks++;
          this.log(`${e.name}备下一张【闪】`);
        } else if (k.t === '咒' && !skipAtk && this.hand.length) {
          const c = this.hand[rndInt(this.rng, this.hand.length)];
          this.toDiscard(c);
          this.log(`${e.name}妖咒：你弃置了【${def(c).name}】`);
        }
        this.io.update();
        await this.io.sleep(250);
      }
      e.step++;
      this.io.update();
      await this.io.sleep(350);
      if (this.over) return;
    }
    this.alive().forEach((e) => {
      e.marks = Math.min(MAX_FLASH_MARKS, Math.max(e.marks, e.flash));
    });
    if (!this.over) this.playerTurn();
  }
  /** 敌人出杀 → 护主判定 → 八卦阵判定 → 玩家闪响应窗口（PRD 5.9.1） */
  async enemySha(e: Enemy, n: number, mod?: string) {
    const p = this.p;
    this.log(`${e.name}对你出【杀】${mod ? '[' + mod + ']' : ''}（${n}点）`);
    // 成为杀的目标：护主、八卦阵等（判定类，受被动免伤配额约束）
    const r = await this.effects.emit('targeted_by_sha', this.effects.playerSources(), { source: e });
    if (r.negatedBy) {
      this.log(`${r.negatedName}：判定成功，此杀无效`);
      return r.negatedBy.split('_')[0];
    }
    const shans = this.hand.filter((c) => def(c).shan);
    let used: CardInst | null = null;
    if (shans.length)
      used = this.settings.autoShan ? shans[0] : await this.io.respond(`${e.name} 对你使用【杀】，伤害 ${n}`, (c) => !!def(c).shan, '不出闪', true);
    if (used) {
      this.toDiscard(used);
      this.log('你打出【闪】抵消');
      if (hasMod(used, 'E_D01')) this.drawN(1);
      if (hasMod(used, 'E_D02')) await this.dmgEnemy(e, 1, '普通');
      if (hasMod(used, 'E_D03')) p.lianShan = 1;
      this.io.update();
      await this.maybeEpiphany(used, true);
      this.checkWin();
      return 'shan';
    }
    await this.dmgPlayer(n);
    return 'hit';
  }
  async dmgPlayer(n: number) {
    const { absorbed } = applyDamage(this.p, n);
    this.log(`你受到${n}点伤害${absorbed ? `（护甲抵${absorbed}）` : ''}`);
    this.io.hurt?.();
    this.io.update();
    await this.io.sleep(300);
    if (this.p.hp <= 0) await this.dying();
  }
  /** PRD 5.9.3 濒死：可连续用桃/酒 */
  async dying() {
    const ok = (c: CardInst) => !!(def(c).tao || def(c).jiu);
    while (this.p.hp <= 0) {
      if (!this.hand.some(ok)) break;
      const c = await this.io.respond(`濒死！体力 ${this.p.hp}，可用【桃】或【酒】自救`, ok, '放弃', false);
      if (!c) break;
      this.toDiscard(c);
      this.heal(1 + (def(c).tao && hasMod(c, 'E_P01') ? 1 : 0));
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
  nextBattle() {
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
