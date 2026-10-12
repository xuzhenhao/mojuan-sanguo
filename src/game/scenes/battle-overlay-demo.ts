/**
 * P1b 演示页（?page=battle-overlay-demo）：在真实 core 对局上演示响应弹窗与长按详情。
 * 只是挂载示例，不是战斗页主体（主体布局由 P1a #41 负责）；这里的牌位/敌阵只是简化占位。
 * - 点「敌人出杀」：调用 core 的 Game.enemySha → BattleIO.respond 决策点 → 响应弹窗（Promise 返回）。
 * - 长按手牌 / 敌人 / 主将牌：420ms 环形进度后弹出详情浮层。
 */
import { Game, type BattleIO } from '../../core/battle';
import { seeded } from '../../core/rng';
import type { CardInst } from '../../core/types';
import { CONFIG } from '../../data/config';
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import { cardDetail, enemyDetail, LongPressDetail, skillDetail, type DetailContent } from '../overlays/detail';
import { makeRespond, type ResponseLayout } from '../overlays/response';
import { C, frame, inside, text } from '../overlays/theme';
import { def, RANK_CH, SUIT_CH } from '../../core/rules';

export interface DemoEnv {
  overlays: OverlayStack;
  safe(): Rect;
  measure(): Surface['ctx'];
  paused(): boolean;
}

const HAND: [string, CardInst['suit'], number][] = [
  ['B001', 'S', 1],
  ['B004', 'H', 13],
  ['B001', 'C', 9],
  ['B005', 'D', 3],
  ['T012', 'S', 12],
];

export class BattleOverlayDemoScene implements Scene {
  readonly id = 'battle-overlay-demo';
  readonly atlasScene = 'battle';
  private ctx!: SceneContext;
  g!: Game;
  last = '点「敌人出杀」触发响应；长按牌/敌人/武将看详情';
  private lp!: LongPressDetail;
  private busy = false;
  constructor(private env: DemoEnv) {}

  enter(ctx: SceneContext) {
    this.ctx = ctx;
    const io: BattleIO = {
      log: () => {},
      update: () => ctx.invalidate('main'),
      sleep: async () => {},
      showJudge: async () => {},
      respond: makeRespond(this.env.overlays, () => this.g.hand, { layout: () => this.layout(), paused: this.env.paused }),
      epiphany: async () => null,
      onBattleEnd: () => {},
    };
    this.g = new Game(seeded(7), io, { autoShan: false, main: 'H03', sub: 'H04', epiphanyRate: 0 });
    this.g.battleIdx = 2; // 精英·张宝
    this.g.startBattle();
    this.dealDemoHand();
    this.lp = new LongPressDetail(this.env.overlays, (at) => this.detailAt(at), {
      safe: this.env.safe,
      measure: this.env.measure,
      invalidate: () => ctx.invalidate('main'),
    });
  }
  exit() {
    this.env.overlays.closeAll('detail');
    this.env.overlays.closeAll('response');
  }
  private dealDemoHand() {
    this.g.hand = HAND.map(([id, suit, rank], i) => ({
      uid: 9000 + i,
      id,
      suit,
      rank,
      mods: id === 'B004' ? ['E_D01'].filter((m) => CONFIG.affixes.some((a) => a.id === m)) : [],
    }));
  }

  // ---------- 简化布局（仅演示；正式布局见 P1a） ----------
  enemyRects(): Rect[] {
    const w = this.ctx.width;
    const en = this.g.alive();
    return en.map((e, i) => {
      const back = e.row === 'back';
      const cw = back ? 76 : 96;
      const ch = back ? 104 : 132;
      const row = en.filter((x) => x.row === e.row);
      const k = row.indexOf(e);
      const span = row.length * (cw + 16) - 16;
      return { x: (w - span) / 2 + k * (cw + 16), y: back ? 70 : 200, w: cw, h: ch, i } as Rect;
    });
  }
  heroRect(): Rect {
    return { x: this.ctx.width - 140, y: this.ctx.height - 380, w: 120, h: 168 };
  }
  cardRect(i: number, n: number): Rect {
    const step = 58;
    const span = (n - 1) * step + 72;
    return { x: (this.ctx.width - span) / 2 + i * step, y: this.ctx.height - 196, w: 72, h: 104 };
  }
  button(): Rect {
    return { x: 24, y: this.ctx.height - 72, w: 150, h: 48 };
  }
  layout(): ResponseLayout {
    const front = this.g.alive().findIndex((e) => e.row === 'front');
    return { cardRect: (i, n) => this.cardRect(i, n), attacker: front >= 0 ? this.enemyRects()[front] : null, hero: this.heroRect() };
  }

  private detailAt(at: Vec2): DetailContent | null {
    const n = this.g.hand.length;
    for (let i = n - 1; i >= 0; i--) if (inside(this.cardRect(i, n), at)) return cardDetail(this.g.hand[i]);
    const rs = this.enemyRects();
    const en = this.g.alive();
    for (let i = 0; i < rs.length; i++) if (inside(rs[i], at)) return enemyDetail(en[i]);
    if (inside(this.heroRect(), at)) {
      const h = CONFIG.heroes[this.g.main.id];
      const sk = h.mainSkills[0];
      const d = skillDetail(sk, `${h.name} · 主将技`);
      for (const s of h.mainSkills.slice(1)) d.lines.push(`${s.name}：${s.desc}`);
      d.lines.push(`副将 ${CONFIG.heroes[this.g.sub.id].subSkill.name}：${CONFIG.heroes[this.g.sub.id].subSkill.desc}`);
      return d;
    }
    return null;
  }

  async enemyAttack() {
    if (this.busy) return;
    const e = this.g.alive().find((x) => x.row === 'front');
    if (!e) return;
    this.busy = true;
    const hp0 = this.g.p.hp;
    const r = await this.g.enemySha(e, 2, '锋锐');
    this.last = r === 'shan' ? `已出闪：${this.g.logs[this.g.logs.length - 1] ?? ''}` : `承受：体力 ${hp0} → ${this.g.p.hp}`;
    if (this.g.hand.length < 3 || this.g.p.hp <= 2) {
      this.g.p.hp = this.g.p.maxHp;
      this.dealDemoHand();
    }
    this.busy = false;
    this.ctx.invalidate('main');
  }

  draw(layer: SurfaceName, s: Surface) {
    const g = s.ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') {
      g.fillStyle = C.lacquer;
      g.fillRect(0, 0, w, h);
      g.fillStyle = C.gold;
      g.fillRect(12, 12, w - 24, 2);
      g.fillRect(12, h - 14, w - 24, 2);
      return;
    }
    g.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    text(g, 'P1b 演示 · 响应与详情', 20, 44, `20px "Ma Shan Zheng", "STKaiti", serif`, C.gold);
    const en = this.g.alive();
    this.enemyRects().forEach((r, i) => {
      const e = en[i];
      g.fillStyle = '#3b2a22';
      g.fillRect(r.x, r.y, r.w, r.h);
      frame(g, r, C.goldDeep, 1.5);
      text(g, e.name.split('·')[0], r.x + 8, r.y + 28, `20px "Ma Shan Zheng", "STKaiti", serif`, C.paper);
      text(g, `${Math.max(0, e.hp)}/${e.max}${e.armor ? ` 甲${e.armor}` : ''}`, r.x + 8, r.y + r.h - 10, '12px sans-serif', C.paper);
    });
    const hr = this.heroRect();
    g.fillStyle = '#e9dcc0';
    g.fillRect(hr.x, hr.y, hr.w, hr.h);
    frame(g, hr, C.gold, 2);
    text(g, this.g.main.name, hr.x + 10, hr.y + 34, `28px "Ma Shan Zheng", "STKaiti", serif`, C.ink);
    text(g, `体力 ${this.g.p.hp}/${this.g.p.maxHp}`, hr.x + 10, hr.y + hr.h - 12, '13px sans-serif', C.ink);
    const n = this.g.hand.length;
    this.g.hand.forEach((c, i) => {
      const r = this.cardRect(i, n);
      const d = def(c);
      g.fillStyle = '#4a3a2e';
      g.fillRect(r.x, r.y, r.w, r.h);
      frame(g, r, C.goldDeep, 1.5);
      const red = c.suit === 'H' || c.suit === 'D';
      text(g, `${SUIT_CH[c.suit]}${RANK_CH[c.rank]}`, r.x + 6, r.y + 34, 'bold 13px sans-serif', red ? '#ff8a80' : C.paper);
      text(g, d.name, r.x + 14, r.y + r.h - 14, `20px "Ma Shan Zheng", "STKaiti", serif`, C.paper);
    });
    const b = this.button();
    g.fillStyle = '#7a2418';
    g.fillRect(b.x, b.y, b.w, b.h);
    frame(g, b, C.gold, 1.5);
    text(g, '敌人出杀', b.x + 30, b.y + 32, `22px "Ma Shan Zheng", "STKaiti", serif`, C.paper);
    text(g, this.last, 20, h - 92 - 120 - 8, '12px sans-serif', 'rgba(243,235,216,.7)');
    this.lp.draw(s);
  }

  gesture(e: GestureEvent) {
    if (this.lp.gesture(e)) return true;
    if (e.type === 'tap' && inside(this.button(), e.at)) {
      void this.enemyAttack();
      return true;
    }
    return false;
  }
  animating() {
    return this.lp.progress > 0;
  }
}
