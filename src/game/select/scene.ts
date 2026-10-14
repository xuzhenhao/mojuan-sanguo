/**
 * P1 点将页（issue #43）：B 金漆屏风 Canvas 实现，对照 public/mockups/v3/select.html。
 * - 点网格武将选主/副将，点槽位清空，⇄ 主副对调；主副都选定才可「出征」。
 * - 长按武将或技能印：OverlayStack 详情浮层（简单版，P1b 的通用详情浮层完成后替换 showDetail）。
 * - 珠联璧合（PRD 7.4）：主副组合命中时在技能栏下方提示。
 * 只读 core / data；出征时通过 onStart 交给入口（RunSession + FlowMachine）。
 */
import { t } from '../../data/text';
import type { HeroDef } from '../../core/types';
import type { GestureEvent } from '../../engine/input';
import type { OverlayHandle, OverlayStack } from '../../engine/modal';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Rect } from '../../engine/types';
import { CONFIG } from '../../data/config';
import { HEROES } from '../../data/heroes';
import { drawNameBand, drawPortrait, nameBandRect, type PortraitTier } from '../portrait';
import { gridCell, hitPad, inside, SELECT_LAYOUT as L, skillSeals } from './layout';
import { canStart, canSwap, clearSlot, comboOf, mainSkillsOf, pickHero, roster, starterDeckSize, swap, type SelectState } from './model';
import { brushFont, brushStack, sansFont } from '../fonts';

/** render-spec §1 令牌色（与 mockups/v3/b.css 一致） */
export const C = {
  lac0: '#070302',
  lac1: '#150a08',
  lac2: '#22100b',
  lac3: '#2a1410',
  lac4: '#4a1d14',
  goldHi: '#f4dc9a',
  gold: '#e9c877',
  goldMid: '#b98a3c',
  goldLo: '#8a6a2a',
  goldDk: '#6e4a18',
  paper: '#f3ebd8',
  paper2: '#efe3c6',
  paper3: '#bfae88',
  ink: '#1a1a1a',
  cinnabar: '#a63d2f',
  cinnHi: '#d4604c',
  jade: '#4f9a7c',
  jadeDk: '#1d4a3a',
  silver: '#cfd6d9',
  /** 立绘上竖排名字的墨带（#177） */
  inkBand: 'rgba(15,7,5,.72)',
  /** 立绘上竖排名字的 1px 描边（#177） */
  nameStroke: 'rgba(0,0,0,.6)',
} as const;
export const FACTION_COLOR: Record<string, string> = { 群: '#7a6a58', 蜀: '#3f7a4f', 魏: '#3c5a8a', 吴: '#a63d2f' };
export const BRUSH = () => brushStack();
const NUM = () => sansFont(14, true);

type Ctx = CanvasRenderingContext2D;

export interface SelectSceneOptions {
  overlays?: OverlayStack;
  initial?: SelectState;
  /** 将魂（局外货币，H5 首版无养成，固定显示） */
  soul?: number;
  onStart(sel: { main: string; sub: string }): void;
}

export type SelectHit =
  | { kind: 'grid'; id: string; index: number }
  | { kind: 'slot'; slot: 'main' | 'sub' }
  | { kind: 'swap' }
  | { kind: 'skill'; which: 'main' | 'sub'; index: number }
  | { kind: 'start' };

export class SelectScene implements Scene {
  readonly id = 'select';
  state: SelectState;
  private ctx!: SceneContext;
  private heroes: HeroDef[] = roster();
  private flashMs = 0;
  private breatheMs = 0;
  private press: { at: { x: number; y: number }; progress: number } | null = null;
  detail: OverlayHandle | null = null;
  /** 立绘加载完成后重绘（#177） */
  private repaint = () => this.ctx?.invalidate('main');

  constructor(private opt: SelectSceneOptions) {
    this.state = opt.initial ?? { main: null, sub: null };
  }

  enter(ctx: SceneContext) {
    this.ctx = ctx;
  }
  exit() {
    this.opt.overlays?.closeAll('detail');
    this.opt.overlays?.closeAll('toast');
  }
  update(dt: number) {
    if (this.flashMs > 0) {
      this.flashMs = Math.max(0, this.flashMs - dt);
      this.ctx.invalidate('main');
    }
    if (this.breatheMs > 0) {
      this.breatheMs = Math.max(0, this.breatheMs - dt);
      this.ctx.invalidate('main');
    }
  }
  /** 空闲时停帧：只有槽位闪烁和「出征」呼吸光（启用后 2.4s）期间出帧 */
  animating() {
    return this.flashMs > 0 || this.breatheMs > 0;
  }

  private set(next: SelectState) {
    const was = canStart(this.state);
    this.state = next;
    if (!was && canStart(next)) this.breatheMs = 2400;
    this.ctx?.invalidate('main');
  }

  // ---------- 命中测试 ----------
  hitTest(p: { x: number; y: number }): SelectHit | null {
    if (inside(L.start, p)) return { kind: 'start' };
    if (inside(L.swap, p, hitPad(L.swap))) return { kind: 'swap' };
    const m = this.state.main ? HEROES[this.state.main] : null;
    for (const s of skillSeals(m ? mainSkillsOf(m).length : 0, !!this.state.sub))
      if (inside(s.rect, p)) return { kind: 'skill', which: s.kind, index: s.index };
    if (inside(L.main, p)) return { kind: 'slot', slot: 'main' };
    if (inside(L.sub, p)) return { kind: 'slot', slot: 'sub' };
    for (let i = 0; i < this.heroes.length; i++) if (inside(gridCell(i), p)) return { kind: 'grid', id: this.heroes[i].id, index: i };
    return null;
  }

  gesture(e: GestureEvent): boolean {
    if (e.type === 'longpressprogress') {
      const h = this.hitTest(e.at);
      this.press = h && (h.kind === 'grid' || h.kind === 'skill' || (h.kind === 'slot' && this.state[h.slot])) ? { at: e.at, progress: e.progress } : null;
      this.ctx.invalidate('main');
      return !!this.press;
    }
    if (e.type === 'cancel' || e.type === 'dragstart') {
      this.press = null;
      this.ctx.invalidate('main');
      return false;
    }
    const wasPress = this.press;
    this.press = null;
    if (wasPress) this.ctx.invalidate('main');
    const h = e.type === 'tap' || e.type === 'longpress' ? this.hitTest(e.at) : null;
    if (!h) return false;
    if (e.type === 'longpress') return this.longpress(h);
    switch (h.kind) {
      case 'grid':
        this.set(pickHero(this.state, h.id));
        return true;
      case 'slot':
        this.set(clearSlot(this.state, h.slot));
        return true;
      case 'swap':
        if (canSwap(this.state)) this.set(swap(this.state));
        else this.toast(t('select.toast_need_both_swap'));
        return true;
      case 'skill':
        return this.longpress(h); // 点技能印也看详情
      case 'start':
        if (canStart(this.state)) this.opt.onStart({ main: this.state.main, sub: this.state.sub });
        else {
          this.flashMs = 480;
          this.toast(this.state.main ? t('select.toast_need_sub') : t('select.toast_need_main'));
          this.ctx.invalidate('main');
        }
        return true;
    }
  }

  private longpress(h: SelectHit): boolean {
    if (h.kind === 'grid') return this.showDetail(HEROES[h.id], null);
    if (h.kind === 'slot' && this.state[h.slot]) return this.showDetail(HEROES[this.state[h.slot]!], h.slot);
    if (h.kind === 'skill') {
      const id = h.which === 'main' ? this.state.main : this.state.sub;
      if (id) return this.showDetail(HEROES[id], h.which);
    }
    return false;
  }

  private toast(text: string) {
    const ov = this.opt.overlays;
    if (!ov) return;
    ov.closeAll('toast');
    const w = this.ctx.width;
    const rect = { x: w / 2 - 110, y: 722, w: 220, h: 36 };
    const t = ov.push({
      id: 'toast:select',
      kind: 'toast',
      rect,
      draw: (s) => {
        const c = s.ctx as unknown as Ctx;
        panel(c, rect);
        c.fillStyle = C.paper;
        c.font = sansFont(14);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
        resetText(c);
      },
    });
    setTimeout(() => t.close(), 1600);
  }

  /**
   * 详情浮层（简单版）：武将名、势力、体力、主将技与副将技。
   * TODO(P1b #42)：改用通用详情浮层组件，接口保持 showDetail(hero, focus)。
   */
  showDetail(hero: HeroDef, focus: 'main' | 'sub' | null): boolean {
    const ov = this.opt.overlays;
    if (!ov) return false;
    ov.closeAll('detail');
    const w = this.ctx.width;
    const lines = detailLines(hero, focus);
    const rect: Rect = { x: 20, y: 120, w: w - 40, h: 0 };
    // 底部留出关闭按钮行（热区 ≥44dp）
    rect.h = 64 + lines.reduce((n, l) => n + l.h, 0) + 16 + DETAIL_CLOSE_ROW;
    const closeRect = detailCloseRect(rect);
    this.detail = ov.push({
      id: `detail:hero:${hero.id}`,
      kind: 'detail',
      dismissOnTapOutside: true,
      rect,
      scrim: { color: 'rgba(0,0,0,.55)' },
      draw: (s) => drawDetail(s.ctx as unknown as Ctx, rect, hero, lines, closeRect),
      gesture: (e, h) => {
        if (e.type !== 'tap') return false;
        // 显式关闭按钮（#257）；点面板其它区域不关，避免误触
        if (inside(closeRect, e.at)) {
          h.close();
          return true;
        }
        return false;
      },
    });
    return true;
  }

  // ---------- 绘制 ----------
  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx as unknown as Ctx;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') return drawBackground(c, w, h);
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    this.drawTop(c, w);
    this.drawSlots(c);
    this.drawSkills(c);
    this.drawGrid(c);
    this.drawBook(c);
    this.drawBar(c, w, h);
    if (this.press) longpressRing(c, this.press.at, this.press.progress);
  }

  private drawTop(c: Ctx, w: number) {
    const r = L.soul;
    c.fillStyle = vgrad(c, r.y, r.h, C.lac3, C.lac1);
    c.fillRect(r.x, r.y, r.w, r.h);
    strokeRect(c, r, C.goldLo, 1);
    soulIcon(c, r.x + 18, r.y + 13);
    c.fillStyle = C.paper;
    c.font = NUM();
    c.textBaseline = 'middle';
    c.fillText((this.opt.soul ?? 0).toLocaleString('en-US'), r.x + 30, r.y + 14);
    // 标题「点将」
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const ty = L.title.y + L.title.h / 2;
    const glow = c.createRadialGradient(w / 2, ty, 4, w / 2, ty, 90);
    glow.addColorStop(0, 'rgba(74,29,20,.9)');
    glow.addColorStop(1, 'rgba(74,29,20,0)');
    c.fillStyle = glow;
    c.fillRect(w / 2 - 110, L.title.y, 220, L.title.h);
    c.shadowColor = '#000';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    c.fillStyle = C.gold;
    c.font = `34px ${BRUSH()}`;
    c.fillText('点将', w / 2, ty);
    noShadow(c);
    for (const dir of [-1, 1]) {
      const x0 = w / 2 + dir * 46;
      const g = c.createLinearGradient(x0 + dir * 40, 0, x0, 0);
      g.addColorStop(0, 'rgba(233,200,119,0)');
      g.addColorStop(1, C.gold);
      c.fillStyle = g;
      c.fillRect(Math.min(x0, x0 + dir * 40), ty, 40, 1);
    }
    resetText(c);
  }

  private drawSlots(c: Ctx) {
    const flash = this.flashMs > 0 && Math.floor(this.flashMs / 120) % 2 === 0;
    const m = this.state.main ? HEROES[this.state.main] : null;
    const s = this.state.sub ? HEROES[this.state.sub] : null;
    if (m) {
      // 主槽外发光（mockup .main::after）
      c.shadowColor = 'rgba(233,200,119,.55)';
      c.shadowBlur = 28;
      c.fillStyle = C.goldMid;
      roundRect(c, L.main, 4);
      c.fill();
      noShadow(c);
      heroFrame(c, L.main, m, { name: 34, gold: true, beads: 16, tier: 'large', onReady: this.repaint });
    } else emptySlot(c, L.main, '主将', flash);
    if (s) heroFrame(c, L.sub, s, { name: 24, gold: false, tier: 'large', onReady: this.repaint });
    else emptySlot(c, L.sub, '副将', flash);
    roleSeal(c, L.main.x + L.main.w / 2, L.main.y - 12 + 16, 32, '主', false);
    roleSeal(c, L.sub.x + L.sub.w / 2, L.sub.y - 12 + 16, 32, '副', true);
    // ⇄ 换位
    const on = canSwap(this.state);
    c.globalAlpha = on ? 1 : 0.45;
    icoCircle(c, L.swap);
    refreshIcon(c, L.swap.x + L.swap.w / 2, L.swap.y + L.swap.h / 2, 10);
    c.globalAlpha = 1;
  }

  private drawSkills(c: Ctx) {
    const m = this.state.main ? HEROES[this.state.main] : null;
    const sub = this.state.sub ? HEROES[this.state.sub] : null;
    const skills = m ? mainSkillsOf(m) : [];
    const seals = skillSeals(skills.length, !!sub);
    let divX = 22;
    for (const s of seals) {
      if (s.kind === 'main') {
        const sk = skills[s.index];
        skillSeal(
          c,
          s.rect,
          sk.name,
          'main',
          sk.indices.every((i) => isLocked(m!.id, i)),
        );
        divX = s.rect.x + s.rect.w + 6;
      } else skillSeal(c, s.rect, sub!.subSkill.name, 'sub', false);
    }
    if (!m) {
      c.fillStyle = C.goldLo;
      c.font = sansFont(13);
      c.textBaseline = 'middle';
      c.fillText('选择主将后显示技能', 22, L.skillY + L.skillD / 2);
      resetText(c);
    } else {
      const g = c.createLinearGradient(0, L.skillY + 3, 0, L.skillY + 43);
      g.addColorStop(0, 'rgba(138,106,42,0)');
      g.addColorStop(0.5, C.goldLo);
      g.addColorStop(1, 'rgba(138,106,42,0)');
      c.fillStyle = g;
      c.fillRect(divX, L.skillY + 3, 1, 40);
    }
    // 牌组张数
    const n = starterDeckSize(this.state.main);
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    c.fillStyle = C.paper;
    c.font = NUM();
    c.fillText(String(n), 368, L.skillY + 23);
    deckIcon(c, 368 - 32, L.skillY + 13);
    resetText(c);
    // 珠联璧合
    const combo = comboOf(this.state.main, this.state.sub);
    if (combo) {
      c.fillStyle = C.gold;
      c.font = `15px ${BRUSH()}`;
      c.textBaseline = 'middle';
      const y = L.combo.y + L.combo.h / 2;
      c.fillText(`珠联·${combo.name}`, L.combo.x, y);
      const x = L.combo.x + c.measureText(`珠联·${combo.name}`).width + 8;
      c.fillStyle = C.paper3;
      c.font = sansFont(12);
      c.fillText(ellipsis(c, combo.desc, L.combo.w - (x - L.combo.x)), x, y);
      resetText(c);
    }
  }

  private drawGrid(c: Ctx) {
    this.heroes.forEach((h, i) => {
      const r = gridCell(i);
      const role = this.state.main === h.id ? '主' : this.state.sub === h.id ? '副' : null;
      heroFrame(c, r, h, { name: 17, gold: true, hpNum: true, tier: 'small', onReady: this.repaint });
      if (role) {
        // 已选：压暗（mockup brightness .55）并盖印
        c.fillStyle = 'rgba(0,0,0,.45)';
        roundRect(c, r, 4);
        c.fill();
        roleSeal(c, r.x + r.w / 2, r.y + r.h / 2, 30, role, role === '副');
      }
    });
  }

  private drawBook(c: Ctx) {
    // 兵书带入 / 墨值 / 天命：H5 首版无局外养成，仅显示空态（见 PR 未定事项）
    const y = L.book.y;
    bookIcon(c, 14, y + 17);
    c.setLineDash([4, 3]);
    c.strokeStyle = C.goldLo;
    c.lineWidth = 1.5;
    roundRect(c, { x: 38, y, w: 36, h: 52 }, 4);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = C.goldLo;
    c.font = sansFont(20);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('+', 56, y + 26);
    c.textAlign = 'left';
    c.font = sansFont(12);
    c.fillText('无可带兵书', 82, y + 26);
    for (let i = 0; i < 6; i++) {
      const x = 156 + i * 10;
      c.fillStyle = C.ink;
      roundRect(c, { x, y: y + 20, w: 7, h: 12 }, 2);
      c.fill();
      c.strokeStyle = C.goldLo;
      c.lineWidth = 1;
      c.stroke();
    }
    seal(c, { x: 334, y: y + 15, w: 22, h: 22 }, '命', 14);
    c.fillStyle = C.paper;
    c.font = sansFont(18, true);
    c.textAlign = 'left';
    c.fillText('0', 362, y + 27);
    resetText(c);
  }

  private drawBar(c: Ctx, w: number, h: number) {
    const y = L.bar.y;
    c.fillStyle = vgrad(c, y, L.bar.h, '#1a0c08', '#0a0504');
    c.fillRect(0, y, w, h - y);
    c.fillStyle = C.goldLo;
    c.fillRect(0, y - 1, w, 1);
    c.fillStyle = C.lac3;
    c.fillRect(0, y - 3, w, 2);
    const g = { x: 14, y: L.start.y + 9, w: 26, h: 26 };
    icoCircle(c, g);
    gearIcon(c, g.x + 13, g.y + 13);
    const on = canStart(this.state);
    let glow = 0;
    if (on && this.breatheMs > 0) glow = 0.5 + 0.5 * Math.sin(((2400 - this.breatheMs) / 1200) * Math.PI * 2);
    button(c, L.start, '出征', on, glow);
  }
}

// ---------- 详情浮层内容 ----------
interface Line {
  text: string;
  font: string;
  color: string;
  h: number;
}
function detailLines(hero: HeroDef, focus: 'main' | 'sub' | null): Line[] {
  const out: Line[] = [];
  const add = (title: string, desc: string, dim: boolean) => {
    out.push({ text: title, font: `18px ${BRUSH()}`, color: dim ? C.goldLo : C.gold, h: 26 });
    for (const l of wrapWidth(desc, 318, 13)) out.push({ text: l, font: sansFont(13), color: dim ? C.paper3 : C.paper, h: 19 });
    out.push({ text: '', font: '', color: '', h: 6 });
  };
  for (const s of mainSkillsOf(hero)) add(`主将技 · ${s.name}`, s.desc, focus === 'sub');
  add(`副将技 · ${hero.subSkill.name}`, hero.subSkill.desc, focus === 'main');
  return out;
}

/** 按宽度折行：CJK 记 1em、其余 0.55em（不依赖 measureText，便于测试）；句末标点不落单行首 */
export function wrapWidth(s: string, maxW: number, em: number): string[] {
  const out: string[] = [];
  let line = '';
  let w = 0;
  for (const ch of s) {
    const cw = ch.charCodeAt(0) < 0x100 ? em * 0.55 : em;
    if (w + cw > maxW && line && !/^[，。、；：）」』！？,.;:)]$/.test(ch)) {
      out.push(line);
      line = '';
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line || !out.length) out.push(line);
  return out;
}
/** 按字符数折行 */
export function wrapChars(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.length ? out : [''];
}

/** 详情底栏高度（含 ≥44dp 关闭热区，#257） */
export const DETAIL_CLOSE_ROW = 52;
/** 关闭按钮热区：面板底部居中，至少 44×44 */
export function detailCloseRect(panel: Rect): Rect {
  const bw = Math.max(120, Math.min(200, panel.w - 48));
  const bh = 44;
  return { x: panel.x + (panel.w - bw) / 2, y: panel.y + panel.h - DETAIL_CLOSE_ROW + (DETAIL_CLOSE_ROW - bh) / 2, w: bw, h: bh };
}

function drawDetail(c: Ctx, r: Rect, hero: HeroDef, lines: Line[], closeRect: Rect) {
  panel(c, r);
  c.fillStyle = C.gold;
  c.font = `28px ${BRUSH()}`;
  c.textBaseline = 'middle';
  c.fillText(hero.name, r.x + 16, r.y + 30);
  const fx = r.x + 16 + c.measureText(hero.name).width + 10;
  factionBadge(c, fx, r.y + 20, hero.faction);
  c.fillStyle = C.paper;
  c.font = NUM();
  beadRow(c, fx + 30, r.y + 30, hero.hp, 11);
  c.fillText(`体力 ${hero.hp}`, fx + 30 + hero.hp * 13 + 6, r.y + 31);
  let y = r.y + 64;
  for (const l of lines) {
    if (l.text) {
      c.fillStyle = l.color;
      c.font = l.font;
      c.fillText(l.text, r.x + 16, y + l.h / 2);
    }
    y += l.h;
  }
  // 右上角保留「点外部关闭」提示（#257：外部点击仍有效时保留）
  c.fillStyle = C.goldLo;
  c.font = sansFont(11);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillText(t('select.detail_close_hint'), r.x + r.w - 12, r.y + 18);
  // 底部主操作：关闭按钮
  c.fillStyle = C.lac3;
  c.fillRect(closeRect.x, closeRect.y, closeRect.w, closeRect.h);
  strokeRect(c, closeRect, C.gold, 1);
  c.fillStyle = C.paper;
  c.font = `18px ${BRUSH()}`;
  c.textAlign = 'center';
  c.fillText(t('select.detail_close'), closeRect.x + closeRect.w / 2, closeRect.y + closeRect.h / 2);
  resetText(c);
}

/** 锁定技右下角盖「锁」（mockup .sk.lock）；读 config 的 kind 字段 */
export function isLocked(heroId: string, i: number) {
  return CONFIG.heroes[heroId]?.mainSkills[i]?.kind === '锁定技';
}

// ---------- 绘制基元（程序化，替代 mockup 的 CSS/SVG；后续换烘焙贴图） ----------
function drawBackground(c: Ctx, w: number, h: number) {
  const g = c.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, Math.max(w, h) * 0.8);
  g.addColorStop(0, C.lac4);
  g.addColorStop(0.5, C.lac2);
  g.addColorStop(1, C.lac0);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // 回纹格（26dp，α .08）
  c.strokeStyle = 'rgba(201,165,90,.08)';
  c.lineWidth = 0.6;
  c.beginPath();
  for (let x = 0; x < w; x += 26) {
    c.moveTo(x + 13, 0);
    c.lineTo(x + 13, h);
  }
  for (let y = 0; y < h; y += 26) {
    c.moveTo(0, y + 13);
    c.lineTo(w, y + 13);
  }
  c.stroke();
  // 远山（金色淡影）
  const mt = c.createLinearGradient(0, 200, 0, 420);
  mt.addColorStop(0, 'rgba(201,165,90,.2)');
  mt.addColorStop(1, 'rgba(201,165,90,0)');
  c.fillStyle = mt;
  c.beginPath();
  const pts = [-20, 330, 40, 240, 90, 290, 150, 200, 220, 290, 280, 240, 340, 290, 410, 200, 410, 420, -20, 420];
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(138,106,42,.6)';
  c.lineWidth = 1;
  c.strokeRect(6.5, 6.5, w - 13, h - 13);
  c.strokeStyle = 'rgba(138,106,42,.35)';
  c.lineWidth = 0.5;
  c.strokeRect(10.25, 10.25, w - 20.5, h - 20.5);
}

function vgrad(c: Ctx, y: number, h: number, a: string, b: string) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}
/** 金框 5 段渐变（render-spec §10 / b.css .gf） */
function goldGrad(c: Ctx, r: Rect, silver: boolean) {
  const g = c.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  const stops: [number, string][] = silver
    ? [
        [0, '#e7ecee'],
        [0.35, '#6c7579'],
        [0.55, '#dfe5e8'],
        [1, '#4a5357'],
      ]
    : [
        [0, C.goldHi],
        [0.3, C.goldLo],
        [0.5, C.gold],
        [0.75, C.goldDk],
        [1, '#d6b065'],
      ];
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function roundRect(c: Ctx, r: Rect, rad: number) {
  c.beginPath();
  c.moveTo(r.x + rad, r.y);
  c.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  c.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  c.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  c.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  c.closePath();
}
function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}
function strokeRect(c: Ctx, r: Rect, col: string, lw: number) {
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);
}
function noShadow(c: Ctx) {
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
}
function resetText(c: Ctx) {
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}
function ellipsis(c: Ctx, s: string, max: number) {
  if (c.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function panel(c: Ctx, r: Rect) {
  c.shadowColor = '#000';
  c.shadowBlur = 24;
  c.shadowOffsetY = 10;
  c.fillStyle = vgrad(c, r.y, r.h, 'rgba(42,20,16,.96)', 'rgba(15,7,5,.98)');
  roundRect(c, r, 3);
  c.fill();
  noShadow(c);
  strokeRect(c, r, C.goldLo, 1);
  strokeRect(c, inflate(r, -4), 'rgba(138,106,42,.5)', 1);
}

function heroFrame(
  c: Ctx,
  r: Rect,
  h: HeroDef,
  o: { name: number; gold: boolean; beads?: number; hpNum?: boolean; tier?: PortraitTier; onReady?: () => void },
) {
  c.shadowColor = 'rgba(0,0,0,.7)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 8;
  c.fillStyle = goldGrad(c, r, !o.gold);
  roundRect(c, r, 4);
  c.fill();
  noShadow(c);
  const w = inflate(r, -4);
  const g = c.createRadialGradient(w.x + w.w / 2, w.y + w.h * 0.32, 2, w.x + w.w / 2, w.y + w.h * 0.32, Math.max(w.w, w.h) * 0.7);
  g.addColorStop(0, '#f6ecd2');
  g.addColorStop(0.68, C.paper3);
  g.addColorStop(1, '#7e6c4c');
  c.fillStyle = g;
  roundRect(c, w, 2);
  c.fill();
  c.save();
  roundRect(c, w, 2);
  c.clip();
  // 立绘（#177）：主/副槽大图、网格小图，cover + 顶对齐；没图（未配置 / 加载中 / 失败）画程序人形占位
  const art = drawPortrait(c, w, h.portrait, o.tier ?? 'small', { onReady: o.onReady });
  if (!art) inkFigure(c, w, h.id);
  const nx = w.x + 3 + o.name / 2;
  // 有立绘：竖排名字墨带 + 纸色字 1px 描边（#177 UI 复核）；占位时保持原墨字
  if (art) drawNameBand(c, nameBandRect(nx, w.y + 4 + o.name / 2, o.name, [...h.name].length, o.name, w), C.inkBand);
  c.restore();
  strokeRect(c, w, '#2a1a08', 1);
  // 竖排书法名（左上）
  c.font = `${o.name}px ${BRUSH()}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  if (art) {
    c.strokeStyle = C.nameStroke;
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.fillStyle = C.paper;
    [...h.name].forEach((ch, i) => {
      c.strokeText(ch, nx, w.y + 4 + i * o.name);
      c.fillText(ch, nx, w.y + 4 + i * o.name);
    });
  } else {
    c.fillStyle = C.ink;
    c.shadowColor = C.paper2;
    c.shadowBlur = 3;
    [...h.name].forEach((ch, i) => c.fillText(ch, nx, w.y + 4 + i * o.name));
    noShadow(c);
  }
  resetText(c);
  factionBadge(c, w.x + w.w - 24, w.y + 4, h.faction);
  if (o.beads) beadRow(c, w.x + w.w / 2 - (h.hp * (o.beads + 2) - 2) / 2 + o.beads / 2, w.y + w.h - 8 - o.beads / 2, h.hp, o.beads);
  if (o.hpNum) {
    const cy = w.y + w.h - 10;
    bead(c, w.x + w.w / 2 - 8, cy, 4.5);
    c.fillStyle = '#fff';
    c.shadowColor = '#000';
    c.shadowBlur = 3;
    c.font = sansFont(12, true);
    c.textBaseline = 'middle';
    c.fillText(String(h.hp), w.x + w.w / 2 - 1, cy + 1);
    noShadow(c);
    resetText(c);
  }
}

/** 程序化水墨人形（立绘缺失时的回退占位，#177） */
function inkFigure(c: Ctx, r: Rect, id: string) {
  const g = c.createLinearGradient(0, r.y + r.h * 0.1, 0, r.y + r.h);
  g.addColorStop(0, '#121212');
  g.addColorStop(0.7, 'rgba(26,26,26,.95)');
  g.addColorStop(1, 'rgba(42,42,42,.05)');
  c.fillStyle = g;
  const cx = r.x + r.w / 2;
  const s = r.w / 240;
  const top = r.y + r.h - 260 * s * 0.96;
  const X = (x: number) => cx + (x - 120) * s;
  const Y = (y: number) => top + y * s;
  c.beginPath();
  c.ellipse(X(120), Y(78), 20 * s, 24 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(X(60), Y(140));
  c.quadraticCurveTo(X(80), Y(112), X(120), Y(118));
  c.quadraticCurveTo(X(160), Y(112), X(180), Y(140));
  c.lineTo(X(226), Y(262));
  c.lineTo(X(14), Y(262));
  c.closePath();
  c.fill();
  // 头饰：按武将 id 变化一点（盔缨 / 冠 / 发髻）
  const n = Number(id.slice(1)) || 0;
  c.fillStyle = n % 3 === 0 ? C.cinnabar : '#151515';
  c.beginPath();
  if (n % 2) {
    c.moveTo(X(96), Y(60));
    c.lineTo(X(120), Y(20));
    c.lineTo(X(144), Y(60));
  } else {
    c.rect(X(98), Y(40), 44 * s, 14 * s);
  }
  c.fill();
  c.strokeStyle = 'rgba(233,224,204,.4)';
  c.lineWidth = Math.max(1, 2 * s);
  c.beginPath();
  c.moveTo(X(120), Y(122));
  c.lineTo(X(120), Y(260));
  c.stroke();
}

function factionBadge(c: Ctx, x: number, y: number, f: string) {
  c.fillStyle = FACTION_COLOR[f] ?? C.goldLo;
  c.fillRect(x, y, 20, 20);
  strokeRect(c, { x: x - 1, y: y - 1, w: 22, h: 22 }, C.paper, 1);
  c.fillStyle = '#fff';
  c.font = `14px ${BRUSH()}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(f, x + 10, y + 11);
  resetText(c);
}
function bead(c: Ctx, x: number, y: number, rad: number, empty = false) {
  const g = c.createRadialGradient(x - rad * 0.3, y - rad * 0.4, 0, x, y, rad);
  if (empty) {
    g.addColorStop(0, '#777');
    g.addColorStop(1, '#2a2a2a');
  } else {
    g.addColorStop(0, '#d6f0e0');
    g.addColorStop(0.45, C.jade);
    g.addColorStop(1, C.jadeDk);
  }
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, rad, 0, Math.PI * 2);
  c.fill();
}
function beadRow(c: Ctx, x0: number, y: number, n: number, d: number) {
  for (let i = 0; i < n; i++) bead(c, x0 + i * (d + 2), y, d / 2);
}
function seal(c: Ctx, r: Rect, text: string, size: number, silver = false) {
  c.shadowColor = '#000';
  c.shadowBlur = 6;
  c.shadowOffsetY = 3;
  const g = c.createRadialGradient(r.x + r.w * 0.35, r.y + r.h * 0.3, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.75);
  g.addColorStop(0, silver ? '#e7ecee' : C.cinnHi);
  g.addColorStop(1, silver ? '#6c7579' : '#7d2418');
  c.fillStyle = g;
  roundRect(c, r, 3);
  c.fill();
  noShadow(c);
  c.strokeStyle = C.paper;
  c.lineWidth = 1.5;
  roundRect(c, inflate(r, 0.75), 3);
  c.stroke();
  c.fillStyle = silver ? C.ink : C.paper;
  c.font = `${size}px ${BRUSH()}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  resetText(c);
}
function roleSeal(c: Ctx, cx: number, cy: number, d: number, t: string, silver: boolean) {
  seal(c, { x: cx - d / 2, y: cy - d / 2, w: d, h: d }, t, Math.round(d * 0.63), silver);
}
function emptySlot(c: Ctx, r: Rect, label: string, flash: boolean) {
  c.fillStyle = flash ? 'rgba(166,61,47,.35)' : 'rgba(21,10,8,.55)';
  roundRect(c, r, 4);
  c.fill();
  c.setLineDash([6, 4]);
  c.strokeStyle = flash ? C.cinnHi : C.goldLo;
  c.lineWidth = 1.5;
  roundRect(c, inflate(r, -1), 4);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = flash ? C.cinnHi : C.goldMid;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = brushFont(30);
  c.fillText('+', r.x + r.w / 2, r.y + r.h / 2 - 12);
  c.font = `${r.w > 150 ? 22 : 18}px ${BRUSH()}`;
  c.fillText(`点${label}`, r.x + r.w / 2, r.y + r.h / 2 + 20);
  resetText(c);
}
function icoCircle(c: Ctx, r: Rect) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const g = c.createRadialGradient(cx - r.w * 0.15, cy - r.h * 0.2, 0, cx, cy, r.w / 2);
  g.addColorStop(0, '#4a4a4a');
  g.addColorStop(1, '#0a0a0a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, r.w / 2, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = C.goldLo;
  c.lineWidth = 1.5;
  c.stroke();
}
function skillSeal(c: Ctx, r: Rect, name: string, kind: 'main' | 'sub', locked: boolean) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  c.shadowColor = '#000';
  c.shadowBlur = 8;
  c.shadowOffsetY = 4;
  const g = c.createRadialGradient(cx - 7, cy - 9, 0, cx, cy, 23);
  g.addColorStop(0, kind === 'main' ? '#4a4a4a' : '#7d8a8e');
  g.addColorStop(1, kind === 'main' ? '#0a0a0a' : '#2a3235');
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, 23, 0, Math.PI * 2);
  c.fill();
  noShadow(c);
  c.strokeStyle = kind === 'main' ? C.gold : C.silver;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, 24, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = C.lac3;
  c.beginPath();
  c.arc(cx, cy, 26, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = C.paper;
  c.font = `19px ${BRUSH()}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name.slice(0, 2), cx, cy + 1);
  resetText(c);
  if (locked) {
    const lr = { x: r.x + 30, y: r.y + 30, w: 16, h: 16 };
    c.fillStyle = C.cinnabar;
    roundRect(c, lr, 2);
    c.fill();
    c.fillStyle = C.paper;
    c.font = `11px ${BRUSH()}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('锁', lr.x + 8, lr.y + 9);
    resetText(c);
  }
}
function button(c: Ctx, r: Rect, text: string, enabled: boolean, glow: number) {
  c.save();
  if (!enabled) c.globalAlpha = 0.45;
  // 3 层描边（b.css .btn）
  c.shadowColor = glow > 0 ? `rgba(233,200,119,${0.35 + 0.5 * glow})` : '#000';
  c.shadowBlur = glow > 0 ? 10 + 12 * glow : 12;
  c.shadowOffsetY = glow > 0 ? 0 : 6;
  c.fillStyle = C.goldLo;
  roundRect(c, inflate(r, 5), 4);
  c.fill();
  noShadow(c);
  c.fillStyle = C.lac3;
  roundRect(c, inflate(r, 4), 4);
  c.fill();
  c.fillStyle = C.gold;
  roundRect(c, inflate(r, 1.5), 3);
  c.fill();
  c.fillStyle = enabled ? vgrad(c, r.y, r.h, '#c4513e', '#7d2418') : vgrad(c, r.y, r.h, '#6a5e56', '#3a332e');
  roundRect(c, r, 3);
  c.fill();
  c.fillStyle = '#fff3dc';
  c.shadowColor = '#000';
  c.shadowBlur = 2;
  c.shadowOffsetY = 2;
  c.font = `22px ${BRUSH()}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + 1);
  c.restore();
}
function longpressRing(c: Ctx, at: { x: number; y: number }, p: number) {
  c.strokeStyle = 'rgba(0,0,0,.5)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(at.x, at.y, 26, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = C.gold;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(at.x, at.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
  c.stroke();
}
// 图标（24 栅格，对照 mockup symbol）
function iconPath(c: Ctx, cx: number, cy: number, size: number, f: (c: Ctx) => void, color: string = C.gold) {
  c.save();
  c.translate(cx - size / 2, cy - size / 2);
  c.scale(size / 24, size / 24);
  c.fillStyle = color;
  f(c);
  c.restore();
}
function soulIcon(c: Ctx, cx: number, cy: number) {
  iconPath(c, cx, cy, 16, (c) => {
    c.beginPath();
    c.moveTo(12, 2);
    c.bezierCurveTo(14, 6, 18, 8, 18, 13);
    c.arc(12, 13, 6, 0, Math.PI);
    c.bezierCurveTo(6, 10, 8, 9, 9, 6);
    c.bezierCurveTo(10, 8, 11, 9, 12, 9);
    c.bezierCurveTo(11, 6, 12, 4, 12, 2);
    c.fill();
  });
}
function refreshIcon(c: Ctx, cx: number, cy: number, r: number) {
  c.strokeStyle = C.gold;
  c.lineWidth = 2.2;
  c.beginPath();
  c.arc(cx, cy, r * 0.62, -Math.PI * 0.15, Math.PI * 1.45);
  c.stroke();
  c.fillStyle = C.gold;
  c.beginPath();
  const a = -Math.PI * 0.15;
  const ex = cx + Math.cos(a) * r * 0.62;
  const ey = cy + Math.sin(a) * r * 0.62;
  c.moveTo(ex - 4, ey - 4);
  c.lineTo(ex + 4, ey - 4);
  c.lineTo(ex, ey + 2);
  c.fill();
}
function deckIcon(c: Ctx, x: number, y: number) {
  iconPath(
    c,
    x + 10,
    y + 10,
    20,
    (c) => {
      c.globalAlpha = 0.55;
      c.fillRect(6, 2, 13, 18);
      c.globalAlpha = 1;
      c.fillRect(3, 5, 13, 18);
    },
    C.goldMid,
  );
}
function bookIcon(c: Ctx, x: number, cy: number) {
  iconPath(c, x + 9, cy, 18, (c) => {
    c.beginPath();
    c.moveTo(3, 4);
    c.bezierCurveTo(6, 3, 9, 3, 12, 5);
    c.bezierCurveTo(15, 3, 18, 3, 21, 4);
    c.lineTo(21, 20);
    c.bezierCurveTo(18, 19, 15, 19, 12, 21);
    c.bezierCurveTo(9, 19, 6, 19, 3, 20);
    c.closePath();
    c.fill();
  });
}
function gearIcon(c: Ctx, cx: number, cy: number) {
  c.fillStyle = C.gold;
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? 5.2 : 7.2;
    c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.fillStyle = '#1a1a1a';
  c.beginPath();
  c.arc(cx, cy, 2.4, 0, Math.PI * 2);
  c.fill();
}
