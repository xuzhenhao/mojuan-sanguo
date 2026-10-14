/**
 * P3 地图页（#44，flow.md §3.3、render-spec §8.2、v3/map.html）。
 * 层级：背景 → 顶条 → HUD → 卷轴（烘焙长图：纸底 + 远山 + 路径 + 节点 + Boss 牌）→ 可走节点脉冲（每帧叠加）→ 金轴 → 底栏 → 浮层。
 * 卷轴烘焙走 BakeCache（mapscroll，源图 map_base 半尺寸，烘焙后释放）；走完一步重烘一次。
 */
import { hitInside } from '../../engine/hit';
import type { GestureEvent } from '../../engine/input';
import type { BakeCache } from '../../engine/memory';
import type { OverlayStack } from '../../engine/modal';
import type { Scene, SceneContext } from '../../engine/scene';
import type { Surface, SurfaceName } from '../../engine/surfaces';
import type { Canvas2DLike, Rect, Vec2 } from '../../engine/types';
import { BOSS_ID, walkedEdges, type MapNode, type NodeType } from '../../core/run/map';
import type { FlowEvent } from '../flow';
import { isComingSoon, type MapRouteParams } from './route';
import type { HudInfo, MapSession } from './session';
import { brushFont, sansFont } from '../fonts';
import { MAP_CONFIG, type BossConfirmConfig } from '../../data/map';
import { t } from '../../data/text';
import { prefersReducedMotion } from '../motion';
import { T } from '../scenes/p4-kit';

type C2D = CanvasRenderingContext2D;

export const MAP_ATLAS = 'map_base';
export const TYPE_LABEL: Record<NodeType, string> = { BATTLE: '战斗', ELITE: '精英', EVENT: '奇遇', REST: '营地', SHOP: '集市', CHEST: '宝箱', BOSS: '首领' };
export const TYPE_DESC: Record<NodeType, string> = {
  BATTLE: '普通战斗，敌人进入后揭示',
  ELITE: '精英战斗，奖励更好',
  EVENT: '奇遇，内容进入后揭示',
  REST: '营地：疗伤 / 淬炼 / 焚稿',
  SHOP: '集市：铜钱购物',
  CHEST: '宝箱：宝物或铜钱',
  BOSS: '章末首领，之后无法返回',
};
const GLYPH: Record<NodeType, string> = { BATTLE: '战', ELITE: '精', EVENT: '？', REST: '营', SHOP: '市', CHEST: '宝', BOSS: '首' };
const GLYPH_COLOR: Record<NodeType, string> = {
  BATTLE: '#f3ebd8',
  ELITE: '#f3ebd8',
  EVENT: '#8fc3e0',
  REST: '#9ad4b8',
  SHOP: '#d9b46a',
  CHEST: '#d9b46a',
  BOSS: '#f3ebd8',
};

const GOLD = '#d9b46a';
const GOLD_HI = '#e9c877';
const CINNABAR = '#a63d2f';
const PAPER = '#f3ebd8';

export interface MapSceneDeps {
  session: MapSession;
  hud: () => HudInfo;
  bossName: string;
  bossGlyph: string;
  overlays: OverlayStack;
  bakes?: BakeCache;
  bakeScale?: number;
  createOffscreen?: (w: number, h: number) => Canvas2DLike;
  /** 发出流程事件并带页面参数（Router.send） */
  go: (e: FlowEvent, params: MapRouteParams) => void;
  /** 右上暂停钮（#108）：打开暂停/设置浮层 */
  onPause?: () => void;
  layerSpacing?: number;
  /** 首领确认弹层参数（默认 rules.yaml map.bossConfirm） */
  bossConfirm?: BossConfirmConfig;
  moveMs?: number;
  pulseMs?: number;
}

export class MapScene implements Scene {
  readonly id = 'map';
  readonly atlasScene = 'map';
  private ctx!: SceneContext;
  scroll = 0;
  private vel = 0;
  private dragFrom: { y: number; scroll: number; lastY: number; lastT: number } | null = null;
  private t = 0;
  /** 头像移动动画 */
  moving: { to: string; from: Vec2 | null; elapsed: number } | null = null;
  private bakeVersion = 0;
  readonly log: string[] = [];

  constructor(private d: MapSceneDeps) {}

  get spacing() {
    return this.d.layerSpacing ?? 62;
  }
  /** 卷轴视口（dp） */
  viewport(): Rect {
    return { x: 18, y: 106, w: this.ctx.width - 36, h: this.ctx.height - 106 - 84 };
  }
  get contentH() {
    return 150 + (this.d.session.cfg.layers - 1) * this.spacing + 60;
  }
  maxScroll() {
    return Math.max(0, this.contentH - this.viewport().h);
  }
  /** 节点在卷轴内容坐标中的位置（第 1 层在底部，Boss 在顶部） */
  pos(n: MapNode): Vec2 {
    const w = this.viewport().w;
    if (n.id === BOSS_ID) return { x: w / 2, y: 70 };
    const C = this.d.session.cfg.columns;
    const pad = 44;
    const x = pad + (n.col * (w - 2 * pad)) / Math.max(1, C - 1);
    return { x, y: this.contentH - 50 - (n.layer - 1) * this.spacing };
  }
  /** 屏幕坐标 */
  screenPos(n: MapNode): Vec2 {
    const v = this.viewport();
    const p = this.pos(n);
    return { x: v.x + p.x, y: v.y + p.y - this.scroll };
  }
  /** 进入时自动滚到当前层 */
  scrollToCurrent() {
    const s = this.d.session;
    const cur = s.state.current ? s.node(s.state.current) : null;
    const y = cur ? this.pos(cur).y : this.contentH;
    this.scroll = clamp(y - this.viewport().h * 0.7, 0, this.maxScroll());
  }

  enter(ctx: SceneContext) {
    this.ctx = ctx;
    this.scrollToCurrent();
    this.log.push('enter');
  }
  exit() {
    this.d.overlays.closeAll('detail');
    this.d.overlays.closeAll('popup');
  }

  update(dt: number) {
    this.t += dt;
    if (this.moving) {
      this.moving.elapsed += dt;
      if (this.moving.elapsed >= (this.d.moveMs ?? 500)) {
        const to = this.moving.to;
        this.moving = null;
        this.commit(to);
      }
    }
    if (!this.dragFrom && this.vel) {
      this.scroll += this.vel * dt;
      this.vel *= Math.pow(0.92, dt / 16);
      if (Math.abs(this.vel) < 0.01) this.vel = 0;
    }
    if (!this.dragFrom) {
      // 两端回弹
      const m = this.maxScroll();
      if (this.scroll < 0) this.scroll *= 0.7;
      else if (this.scroll > m) this.scroll = m + (this.scroll - m) * 0.7;
      if (Math.abs(this.scroll) < 0.5 && this.scroll < 0) this.scroll = 0;
      if (this.scroll > m && this.scroll - m < 0.5) this.scroll = m;
    }
    this.ctx.invalidate('main');
  }
  animating() {
    return true; // 可走节点脉冲常驻（1.4s 循环）
  }

  // ───────── 绘制 ─────────
  draw(layer: SurfaceName, s: Surface) {
    const c = s.ctx as unknown as C2D;
    const { width: w, height: h } = this.ctx;
    if (layer === 'bg') return this.drawBg(c, w, h);
    c.clearRect(0, 0, w, h);
    if (layer !== 'main') return;
    this.drawTop(c, w);
    this.drawHud(c, w);
    this.drawScroll(c);
    this.drawBottom(c, w, h);
  }

  private drawBg(c: C2D, w: number, h: number) {
    const g = c.createRadialGradient?.(w / 2, h * 0.38, 10, w / 2, h * 0.38, h * 0.8);
    if (g) {
      g.addColorStop(0, '#4a1d14');
      g.addColorStop(0.5, '#22100b');
      g.addColorStop(1, '#070302');
    }
    c.fillStyle = g ?? '#22100b';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(138,106,42,.6)';
    c.lineWidth = 1;
    c.strokeRect?.(6, 6, w - 12, h - 12);
  }
  private drawTop(c: C2D, w: number) {
    c.fillStyle = GOLD;
    c.font = brushFont(16);
    c.textAlign = 'left';
    c.fillText(`第${['一', '二', '三'][this.d.session.chapter - 1] ?? this.d.session.chapter}章 · 黄巾`, 16, 32);
    // 暂停：右上，位于胶囊左侧
    // 暂停符号用矢量两竖（书法字库无 Ⅱ）
    this.drawRoundBtn(c, w - 130, 14, 28, '');
    c.fillStyle = GOLD;
    c.fillRect(w - 130 + 9, 14 + 8, 3, 12);
    c.fillRect(w - 130 + 16, 14 + 8, 3, 12);
  }
  private drawHud(c: C2D, w: number) {
    const hud = this.d.hud();
    const y = 48;
    panel(c, 12, y, w - 24, 50);
    // 头像
    circle(c, 42, y + 25, 20, PAPER, GOLD);
    c.fillStyle = '#1a1a1a';
    c.font = brushFont(20);
    c.textAlign = 'center';
    c.fillText(hud.hero.slice(0, 1), 42, y + 32);
    // 勾玉体力（珠径 12）
    for (let i = 0; i < hud.maxHp; i++) circle(c, 74 + i * 15, y + 16, 6, i < hud.hp ? CINNABAR : '#3a2a20', GOLD);
    c.fillStyle = PAPER;
    c.font = sansFont(12);
    c.textAlign = 'left';
    c.fillText(`${hud.hp}/${hud.maxHp}`, 70, y + 40);
    // 铜钱
    circle(c, 130, y + 36, 7, GOLD, null);
    c.fillStyle = GOLD;
    c.fillText(String(hud.gold), 142, y + 40);
    // 丹药 3 格
    for (let i = 0; i < 3; i++) {
      const x = w - 24 - 30 * (3 - i);
      c.fillStyle = '#1a0d09';
      c.fillRect(x, y + 13, 24, 24);
      c.strokeStyle = GOLD;
      c.strokeRect?.(x, y + 13, 24, 24);
      if (hud.potions[i]) {
        c.fillStyle = '#4f9a7c';
        c.fillText('丹', x + 6, y + 30);
      }
    }
  }
  private drawBottom(c: C2D, w: number, h: number) {
    c.fillStyle = 'rgba(20,8,5,.92)';
    c.fillRect(0, h - 72, w, 72);
    c.fillStyle = GOLD;
    c.fillRect(0, h - 72, w, 1);
    this.drawRoundBtn(c, 24, h - 58, 40, '牌');
    c.fillStyle = PAPER;
    c.font = sansFont(13);
    c.textAlign = 'left';
    const n = this.d.session.available.length;
    c.fillText(this.moving ? '行军中…' : n ? `选择下一处（${n} 条路）` : '本章已终', 76, h - 42);
  }
  private drawRoundBtn(c: C2D, x: number, y: number, s: number, label: string) {
    circle(c, x + s / 2, y + s / 2, s / 2, '#2a120c', GOLD);
    c.fillStyle = GOLD;
    c.font = brushFont(Math.round(s * 0.45));
    c.textAlign = 'center';
    c.fillText(label, x + s / 2, y + s * 0.65);
  }

  /** 烘焙卷轴长图（只在节点状态变化时重烘） */
  bakeKey() {
    const st = this.d.session.state;
    return `map:${st.seed}:${st.visited.join(',')}:${this.viewport().w}`;
  }
  private scrollImage(): unknown {
    const d = this.d;
    if (!d.bakes || !d.createOffscreen) return null;
    const v = this.viewport();
    const k = d.bakeScale ?? 1.5;
    const W = Math.ceil(v.w * k);
    const H = Math.ceil(this.contentH * k);
    return d.bakes.get(
      this.bakeKey(),
      'mapscroll',
      'map',
      W,
      H,
      () => {
        const cv = d.createOffscreen!(W, H);
        const c = cv.getContext('2d') as unknown as C2D;
        c.setTransform(k, 0, 0, k, 0, 0);
        this.paintContent(c, v.w);
        this.bakeVersion++;
        return cv;
      },
      { source: MAP_ATLAS },
    );
  }

  private drawScroll(c: C2D) {
    const v = this.viewport();
    // 卷轴框
    c.fillStyle = '#6e4a18';
    c.fillRect(v.x - 5, v.y - 5, v.w + 10, v.h + 10);
    c.save();
    c.beginPath();
    c.rect(v.x, v.y, v.w, v.h);
    c.clip();
    const img = this.scrollImage();
    if (img) c.drawImage(img as CanvasImageSource, v.x, v.y - this.scroll, v.w, this.contentH);
    else {
      c.translate(v.x, v.y - this.scroll);
      this.paintContent(c, v.w);
    }
    c.restore();
    c.save();
    c.beginPath();
    c.rect(v.x, v.y, v.w, v.h);
    c.clip();
    this.drawLive(c);
    c.restore();
    // 上下金轴（盖在内容上方）
    for (const y of [v.y - 6, v.y + v.h - 6]) {
      const g = c.createLinearGradient?.(0, y, 0, y + 12);
      if (g) {
        g.addColorStop(0, '#6e4a18');
        g.addColorStop(0.5, GOLD_HI);
        g.addColorStop(1, '#6e4a18');
      }
      c.fillStyle = g ?? GOLD;
      c.fillRect(v.x - 6, y, v.w + 12, 12);
    }
  }

  /** 每帧叠加：可走节点脉冲、当前头像、移动中的头像 */
  private drawLive(c: C2D) {
    const s = this.d.session;
    const period = this.d.pulseMs ?? 1400;
    const ph = 0.5 - 0.5 * Math.cos(((this.t % period) / period) * Math.PI * 2);
    if (!this.moving)
      for (const id of s.available) {
        const n = s.node(id)!;
        const p = this.screenPos(n);
        const r = n.type === 'BOSS' ? 34 : 19;
        c.globalAlpha = 0.35 + 0.45 * ph;
        c.strokeStyle = GOLD_HI;
        c.lineWidth = 3 + 3 * ph;
        c.beginPath();
        c.arc(p.x, p.y, r + 4 + 3 * ph, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
    // 当前头像（44⌀，朱砂圈）
    const cur = s.state.current ? s.node(s.state.current) : null;
    let at: Vec2 | null = cur ? this.screenPos(cur) : null;
    if (this.moving) {
      const to = this.screenPos(s.node(this.moving.to)!);
      const from = at ?? { x: to.x, y: to.y + this.spacing };
      const k = easeInOut(Math.min(1, this.moving.elapsed / (this.d.moveMs ?? 500)));
      at = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    }
    if (at) {
      circle(c, at.x, at.y, 22, PAPER, CINNABAR, 3);
      c.fillStyle = '#1a1a1a';
      c.font = brushFont(22);
      c.textAlign = 'center';
      c.fillText(this.d.hud().hero.slice(0, 1), at.x, at.y + 8);
    }
  }

  /** 卷轴内容（烘焙用）：纸底 → 远山 → 路径 → 节点 → Boss 牌 */
  paintContent(c: C2D, w: number) {
    const H = this.contentH;
    const s = this.d.session;
    const g = c.createLinearGradient?.(0, 0, 0, H);
    if (g) {
      g.addColorStop(0, '#e8dcc0');
      g.addColorStop(0.3, PAPER);
      g.addColorStop(0.7, '#efe3c6');
      g.addColorStop(1, '#e2d4b4');
    }
    c.fillStyle = g ?? PAPER;
    c.fillRect(0, 0, w, H);
    // 远山晕染
    c.fillStyle = 'rgba(40,34,24,.08)';
    for (let i = 0; i < 4; i++) {
      const y0 = 160 + i * 140;
      c.beginPath();
      c.moveTo(0, y0 + 60);
      for (let x = 0; x <= w; x += w / 6) c.lineTo(x, y0 + ((x / (w / 6)) % 2 ? 0 : 50));
      c.lineTo(w, y0 + 120);
      c.lineTo(0, y0 + 120);
      c.fill();
    }
    // 层号
    c.fillStyle = '#8a7a5a';
    c.font = sansFont(11);
    c.textAlign = 'left';
    for (let l = 1; l <= s.cfg.layers; l++) c.fillText(String(l), 6, this.contentH - 46 - (l - 1) * this.spacing);
    // 路径：已走朱砂实线 3.5，未走虚线
    const walked = new Set(walkedEdges(s.state).map(([a, b]) => `${a}>${b}`));
    for (const [a, b] of s.state.edges) {
      const pa = this.pos(s.node(a)!);
      const pb = this.pos(s.node(b)!);
      const done = walked.has(`${a}>${b}`);
      c.strokeStyle = done ? CINNABAR : 'rgba(40,30,20,.55)';
      c.lineWidth = done ? 3.5 : 1.6;
      c.setLineDash?.(done ? [] : [4, 5]);
      c.beginPath();
      c.moveTo(pa.x, pa.y);
      c.lineTo(pb.x, pb.y);
      c.stroke();
    }
    c.setLineDash?.([]);
    // 节点（38⌀）
    const visited = new Set(s.state.visited);
    for (const n of s.state.nodes) {
      if (n.type === 'BOSS') continue;
      const p = this.pos(n);
      const done = visited.has(n.id) && n.id !== s.state.current;
      c.globalAlpha = done ? 0.55 : 1;
      const fill = n.type === 'ELITE' ? '#7d2418' : '#1a1a1a';
      circle(c, p.x, p.y, 19, done ? '#555' : fill, done ? '#777' : '#b98a3c', 2);
      c.fillStyle = done ? '#bbb' : GLYPH_COLOR[n.type];
      c.font = brushFont(17);
      c.textAlign = 'center';
      c.fillText(GLYPH[n.type], p.x, p.y + 6);
      c.globalAlpha = 1;
    }
    // Boss 牌（名称与头像开局可见，常驻淡红光）
    const bp = this.pos(s.node(BOSS_ID)!);
    c.fillStyle = 'rgba(166,61,47,.18)';
    c.beginPath();
    c.arc(bp.x, bp.y, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a0d09';
    c.fillRect(bp.x - 44, bp.y - 54, 88, 108);
    c.strokeStyle = GOLD;
    c.lineWidth = 2;
    c.strokeRect(bp.x - 44, bp.y - 54, 88, 108);
    c.fillStyle = PAPER;
    c.font = brushFont(44);
    c.textAlign = 'center';
    c.fillText(this.d.bossGlyph, bp.x, bp.y + 8);
    c.fillStyle = CINNABAR;
    c.fillRect(bp.x - 34, bp.y + 42, 68, 22);
    c.fillStyle = PAPER;
    c.font = brushFont(14);
    c.fillText(this.d.bossName, bp.x, bp.y + 58);
  }

  // ───────── 交互 ─────────
  hitNode(at: Vec2): MapNode | null {
    const v = this.viewport();
    if (at.x < v.x || at.x > v.x + v.w || at.y < v.y || at.y > v.y + v.h) return null;
    let best: MapNode | null = null;
    let bd = Infinity;
    for (const n of this.d.session.state.nodes) {
      const p = this.screenPos(n);
      const r = n.type === 'BOSS' ? 50 : 24;
      const dd = Math.hypot(p.x - at.x, p.y - at.y);
      if (dd <= r && dd < bd) {
        best = n;
        bd = dd;
      }
    }
    return best;
  }

  gesture(e: GestureEvent): boolean {
    if (e.type === 'dragstart') {
      this.dragFrom = { y: e.start.y, scroll: this.scroll, lastY: e.at.y, lastT: this.t };
      this.vel = 0;
      return true;
    }
    if (e.type === 'dragmove' && this.dragFrom) {
      const dt = Math.max(1, this.t - this.dragFrom.lastT);
      this.vel = -(e.at.y - this.dragFrom.lastY) / dt;
      this.dragFrom.lastY = e.at.y;
      this.dragFrom.lastT = this.t;
      this.scroll = this.dragFrom.scroll - (e.at.y - this.dragFrom.y);
      this.ctx.invalidate('main');
      return true;
    }
    if (e.type === 'dragend') {
      this.dragFrom = null;
      return true;
    }
    if (e.type === 'tap') {
      if (this.moving) return true;
      if (this.d.onPause && hitInside(this.pauseHit(), e.at)) {
        this.d.onPause();
        return true;
      }
      const n = this.hitNode(e.at);
      if (!n) return false;
      this.tapNode(n);
      return true;
    }
    if (e.type === 'longpress') {
      const n = this.hitNode(e.at);
      if (!n) return false;
      this.showDetail(n, e.at);
      return true;
    }
    return false;
  }

  /** 暂停钮热区（圆钮 28，热区扩到 44） */
  pauseHit(): Rect {
    return { x: this.ctx.width - 130 - 8, y: 14 - 8, w: 44, h: 44 };
  }

  tapNode(n: MapNode) {
    if (!this.d.session.available.includes(n.id)) {
      this.showDetail(n, this.screenPos(n)); // 不可走：只弹类型详情
      return;
    }
    if (n.type === 'BOSS') {
      void this.confirmBoss().then((ok) => ok && this.startMove(n.id));
      return;
    }
    this.startMove(n.id);
  }
  private startMove(id: string) {
    this.log.push(`move:${id}`);
    this.moving = { to: id, from: null, elapsed: 0 };
  }
  /** 移动动画结束：core 走一步 + 写盘 → 路由到节点页 */
  private commit(id: string) {
    const node = this.d.session.node(id)!;
    if (isComingSoon(node.type)) {
      // 奇遇页未实现：弹提示，点「确定」后记为完成并前进
      this.notice(node);
      return;
    }
    const r = this.d.session.enter(id);
    this.log.push(`enter_node:${r.params.kind}`);
    this.d.go(r.event, r.params);
  }

  /** 奇遇提示框：提示跳过；点「确定」后 session.pass */
  notice(n: MapNode) {
    const { width: w, height: h } = this.ctx;
    const rect = { x: 40, y: h / 2 - 90, w: w - 80, h: 180 };
    const btn = { x: w / 2 - 70, y: rect.y + rect.h - 62, w: 140, h: 44 };
    const title = '奇遇';
    const line = '此处奇遇尚未开放，继续前行';
    this.log.push(`notice:${n.type}`);
    this.d.overlays.closeAll('detail');
    const handle = this.d.overlays.push({
      id: `popup:map:notice:${n.id}`,
      kind: 'popup',
      modal: true,
      rect,
      scrim: { color: 'rgba(0,0,0,.5)' },
      draw: (sf) => {
        const c = sf.ctx as unknown as C2D;
        c.fillStyle = '#2a0f0c';
        c.fillRect(rect.x, rect.y, rect.w, rect.h);
        c.strokeStyle = GOLD;
        c.lineWidth = 2;
        c.strokeRect(rect.x, rect.y, rect.w, rect.h);
        c.textAlign = 'center';
        c.fillStyle = GOLD_HI;
        c.font = brushFont(26);
        c.fillText(title, w / 2, rect.y + 44);
        c.fillStyle = PAPER;
        c.font = sansFont(14);
        c.fillText(line, w / 2, rect.y + 84);
        c.fillStyle = CINNABAR;
        c.fillRect(btn.x, btn.y, btn.w, btn.h);
        c.strokeStyle = GOLD;
        c.strokeRect(btn.x, btn.y, btn.w, btn.h);
        c.fillStyle = PAPER;
        c.font = brushFont(20);
        c.fillText('确定', w / 2, btn.y + 30);
      },
      gesture: (e, hd) => {
        if (e.type === 'tap' && e.at.x >= btn.x && e.at.x <= btn.x + btn.w && e.at.y >= btn.y && e.at.y <= btn.y + btn.h) hd.close();
        return true;
      },
    });
    return handle.result.then(() => {
      const r = this.d.session.pass(n.id);
      this.log.push(r.type === 'EVENT' ? 'event_skip' : r.type);
      this.scrollToCurrent();
      this.ctx.invalidate();
      return r;
    });
  }

  showDetail(n: MapNode, at: Vec2) {
    const w = this.ctx.width;
    const rect = { x: clamp(at.x - 100, 8, w - 208), y: Math.max(8, at.y - 110), w: 200, h: 78 };
    const s = this.d.session;
    const title = n.type === 'BOSS' ? `首领 · ${this.d.bossName}` : `${TYPE_LABEL[n.type]} · 第 ${n.layer} 层`;
    const enc = n.encounterId ? s.group(n.encounterId) : undefined;
    const body = enc ? `已交战：${enc.name}` : TYPE_DESC[n.type];
    this.d.overlays.closeAll('detail');
    this.d.overlays.push({
      id: `detail:map:${n.id}`,
      kind: 'detail',
      dismissOnTapOutside: true,
      rect,
      draw: (sf) => {
        const c = sf.ctx as unknown as C2D;
        c.fillStyle = PAPER;
        c.fillRect(rect.x, rect.y, rect.w, rect.h);
        c.strokeStyle = GOLD;
        c.lineWidth = 2;
        c.strokeRect(rect.x, rect.y, rect.w, rect.h);
        c.fillStyle = '#1a1a1a';
        c.textAlign = 'left';
        c.font = brushFont(15);
        c.fillText(title, rect.x + 12, rect.y + 28);
        c.font = sansFont(12);
        c.fillText(body, rect.x + 12, rect.y + 54);
      },
    });
  }

  /** 首领确认框（#188 / spec-107 A）：整备 → false，出战 → true；必须点按钮，不能点外部关闭 */
  confirmBoss(): Promise<boolean> {
    const cfg = this.d.bossConfirm ?? MAP_CONFIG.bossConfirm;
    const L = bossConfirmLayout(cfg, this.ctx.height);
    const hud = this.d.hud();
    const reduced = prefersReducedMotion();
    const popMs = reduced ? Math.min(150, cfg.popInMs) : cfg.popInMs;
    let el = 0;
    let closing: { r: boolean; el: number } | null = null;
    let glowT = 0;
    this.log.push('boss_confirm');
    const alpha = () => {
      const a = popMs > 0 ? Math.min(1, el / popMs) : 1;
      return closing ? a * Math.max(0, 1 - closing.el / Math.max(1, cfg.fadeOutMs)) : a;
    };
    const handle = this.d.overlays.push<boolean>({
      id: 'popup:boss-confirm',
      kind: 'popup',
      modal: true,
      rect: L.panel,
      scrim: () => ({ color: `rgba(5,2,1,${cfg.scrimAlpha})`, alpha: alpha() }),
      animating: () => closing !== null || el < popMs || !reduced,
      update: (dt) => {
        el += dt;
        glowT += dt;
        if (closing) {
          closing.el += dt;
          if (closing.el >= cfg.fadeOutMs) handle.close(closing.r);
        }
      },
      draw: (sf) => {
        const c = sf.ctx as unknown as C2D;
        const a = alpha();
        const k = reduced || closing ? 1 : 0.92 + 0.08 * easeOutBack(popMs > 0 ? Math.min(1, el / popMs) : 1);
        const cx = L.panel.x + L.panel.w / 2;
        const cy = L.panel.y + L.panel.h / 2;
        c.save();
        c.globalAlpha = a;
        c.translate(cx, cy);
        c.scale(k, k);
        c.translate(-cx, -cy);
        // 面板：漆底 + 金描边（水墨扁平，无模糊投影）
        c.fillStyle = T.lac2;
        c.fillRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h);
        c.strokeStyle = T.goldMid;
        c.lineWidth = 2;
        c.strokeRect(L.panel.x, L.panel.y, L.panel.w, L.panel.h);
        // Boss 牌：朱砂呼吸描边（代替 blur 光晕）
        const breath = reduced ? 0.45 : 0.3 + 0.25 * (0.5 - 0.5 * Math.cos((glowT / cfg.glowPeriodMs) * Math.PI * 2));
        c.strokeStyle = `rgba(212,96,76,${breath.toFixed(3)})`;
        c.lineWidth = 6;
        c.strokeRect(L.card.x - 4, L.card.y - 4, L.card.w + 8, L.card.h + 8);
        c.fillStyle = T.paper2;
        c.fillRect(L.card.x, L.card.y, L.card.w, L.card.h);
        c.strokeStyle = T.gold;
        c.lineWidth = 2;
        c.strokeRect(L.card.x, L.card.y, L.card.w, L.card.h);
        c.fillStyle = T.cinnabar;
        c.font = brushFont(72);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(this.d.bossGlyph, L.card.x + L.card.w / 2, L.card.y + L.card.h / 2 + 8);
        // 竖排名（左上内缩 12）
        c.fillStyle = T.ink;
        c.font = brushFont(26);
        c.textAlign = 'left';
        c.textBaseline = 'top';
        [...this.d.bossName].forEach((ch, i) => c.fillText(ch, L.card.x + 12, L.card.y + 12 + i * 28));
        // 标题 / 副标题
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = T.gold;
        c.font = brushFont(30);
        c.fillText(t('map.boss_confirm_title'), cx, L.titleY);
        c.fillStyle = T.paper3;
        c.font = brushFont(14);
        c.fillText(t('map.boss_confirm_sub'), cx, L.subY);
        // 状态条：体力勾玉 → 丹药 3 格 → 铜钱
        const st = L.status;
        c.fillStyle = T.lac1;
        c.fillRect(st.x, st.y, st.w, st.h);
        c.strokeStyle = T.goldLo;
        c.lineWidth = 1;
        c.strokeRect(st.x, st.y, st.w, st.h);
        const my = st.y + st.h / 2;
        let x = st.x + 14;
        for (let i = 0; i < hud.maxHp; i++) {
          circle(c, x + 7, my, 7, i < hud.hp ? T.jade : '#3a3a3a', null);
          x += 14 + 3;
        }
        x += 8;
        for (let i = 0; i < 3; i++) {
          circle(c, x + 11, my, 11, T.lac1, T.goldLo, 1.5);
          if (hud.potions[i]) {
            c.fillStyle = T.jadeHi;
            c.font = brushFont(13);
            c.fillText('丹', x + 11, my + 1);
          }
          x += 22 + 6;
        }
        c.textAlign = 'right';
        c.fillStyle = T.gold;
        c.font = sansFont(14);
        c.fillText(`${t('map.gold_prefix')}${hud.gold}`, st.x + st.w - 14, my);
        // 按钮：整备（secondary）/ 出战（primary 朱砂）
        c.textAlign = 'center';
        for (const [r, key, fill, stroke] of [
          [L.prepare, 'map.boss_confirm_prepare', T.lac3, T.goldLo],
          [L.fight, 'map.boss_confirm_fight', T.cinnabar, T.gold],
        ] as const) {
          c.fillStyle = fill;
          c.fillRect(r.x, r.y, r.w, r.h);
          c.strokeStyle = stroke;
          c.lineWidth = 1.5;
          c.strokeRect(r.x, r.y, r.w, r.h);
          c.fillStyle = T.paper;
          c.font = brushFont(20);
          c.fillText(t(key), r.x + r.w / 2, r.y + r.h / 2 + 1);
        }
        c.restore();
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
      },
      gesture: (e) => {
        if (e.type !== 'tap' || closing) return true; // 模态：吞掉其它输入，不允许点外部关闭
        if (hitInside(L.prepare, e.at)) closing = { r: false, el: 0 };
        else if (hitInside(L.fight, e.at)) closing = { r: true, el: 0 };
        if (closing && cfg.fadeOutMs <= 0) handle.close(closing.r);
        this.ctx.invalidate('main');
        return true;
      },
    });
    return handle.result.then((r) => {
      this.log.push(`boss_confirm:${r ? 'fight' : 'prepare'}`);
      return !!r;
    });
  }
}

/** 首领确认弹层布局（spec-107 A1，设计坐标；按钮 112×44 ≥ 44 热区） */
export function bossConfirmLayout(cfg: BossConfirmConfig, screenH: number) {
  const p = cfg.panel;
  const h = p.padTop + cfg.card.h + cfg.card.gap + 30 + 12 + 14 + cfg.status.gap + cfg.status.h + cfg.button.gap + 14 + cfg.button.h + p.padBottom;
  const top = Math.min(p.top, Math.max(p.minTop, (screenH - h) / 2));
  const panel: Rect = { x: p.x, y: top, w: p.w, h };
  const cx = p.x + p.w / 2;
  const card: Rect = { x: cx - cfg.card.w / 2, y: top + p.padTop, w: cfg.card.w, h: cfg.card.h };
  const titleY = card.y + card.h + cfg.card.gap + 15;
  const subY = titleY + 30;
  const status: Rect = { x: cx - cfg.status.w / 2, y: subY + 7 + cfg.status.gap, w: cfg.status.w, h: cfg.status.h };
  const by = status.y + status.h + cfg.button.gap + 14;
  const bw = cfg.button.w;
  const prepare: Rect = { x: cx - cfg.button.gap / 2 - bw, y: by, w: bw, h: cfg.button.h };
  const fight: Rect = { x: cx + cfg.button.gap / 2, y: by, w: bw, h: cfg.button.h };
  return { panel, card, titleY, subY, status, prepare, fight };
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function circle(c: C2D, x: number, y: number, r: number, fill: string | null, stroke: string | null, lw = 1.5) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}
function panel(c: C2D, x: number, y: number, w: number, h: number) {
  c.fillStyle = 'rgba(42,18,12,.85)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#8a6a2a';
  c.lineWidth = 1;
  c.strokeRect(x, y, w, h);
}
