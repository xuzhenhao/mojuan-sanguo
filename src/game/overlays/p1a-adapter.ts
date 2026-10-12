/**
 * P1a（#41/#61）接入适配层：把战斗场景的 `rectOf / hitTest` 上下文转成 P1b 弹层所需的布局与内容。
 * #61 尚未合并，这里用**结构类型**描述它的 BattleOverlayContext / BattleOverlayHooks 的最小子集，
 * 不 import #61 的文件；#61 合并后可把这些类型换成 `scenes/battle/hooks.ts` 的正式类型，并让
 * ResponseLayout 直接由 rectOf 计算（届时 ResponseLayout 只作为内部类型保留）。
 */
import type { OverlayStack } from '../../engine/modal';
import type { Surface } from '../../engine/surfaces';
import type { Rect, Vec2 } from '../../engine/types';
import type { Game } from '../../core/battle';
import type { CardInst, Enemy } from '../../core/types';
import { CONFIG } from '../../data/config';
import { cardDetail, enemyDetail, openDetail, skillDetail, type DetailContent } from './detail';
import { openResponse, type ResponseLayout } from './response';

/** 与 #61 BattleElement 同构 */
export type ElementRef =
  | { kind: 'card'; card: CardInst }
  | { kind: 'enemy'; enemy: Enemy }
  | { kind: 'intent'; enemy: Enemy }
  | { kind: 'countdown'; enemy: Enemy }
  | { kind: 'hero'; which: 'main' | 'sub' }
  | { kind: 'skill'; id: string }
  | { kind: 'endTurn' }
  | { kind: 'tally' };
export type HitRef = ElementRef & { rect: Rect };

/** #61 BattleOverlayContext 的最小子集 */
export interface RectContext {
  readonly overlays: OverlayStack;
  readonly game: Game;
  readonly safe: Rect;
  rectOf(el: ElementRef): Rect | null;
}

/** 由 rectOf 生成 ResponseLayout；手牌位置按 core 当前手牌顺序取 */
export function layoutFromRectOf(ctx: RectContext, attacker: Enemy | null, hand: () => CardInst[] = () => ctx.game.hand): ResponseLayout {
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  return {
    cardRect: (i) => {
      const c = hand()[i];
      return (c && ctx.rectOf({ kind: 'card', card: c })) || zero;
    },
    attacker: attacker ? ctx.rectOf({ kind: 'enemy', enemy: attacker }) : null,
    hero: ctx.rectOf({ kind: 'hero', which: 'main' }) ?? zero,
  };
}

/** 命中元素 → 详情内容 */
export function detailOfHit(hit: ElementRef, game: Game): DetailContent | null {
  switch (hit.kind) {
    case 'card':
      return cardDetail(hit.card);
    case 'enemy':
    case 'intent':
    case 'countdown':
      return enemyDetail(hit.enemy);
    case 'hero': {
      const h = CONFIG.heroes[(hit.which === 'main' ? game.main : game.sub).id];
      if (hit.which === 'sub') return skillDetail(h.subSkill, `${h.name} · 副将技`);
      const d = skillDetail(h.mainSkills[0], `${h.name} · 主将技`);
      for (const s of h.mainSkills.slice(1)) d.lines.push(`${s.name}：${s.desc}`);
      return d;
    }
    case 'skill': {
      for (const id of [game.main.id, game.sub.id]) {
        const h = CONFIG.heroes[id];
        const ab = [...h.mainSkills, h.subSkill].find((a) => a.id === hit.id);
        if (ab) return skillDetail(ab, h.name);
      }
      return null;
    }
    default:
      return null;
  }
}

/** 生成 #61 BattleOverlayHooks 的 respond / detail 实现 */
export function p1bHooks(o: { seconds?: number; autoShan?: boolean; paused?: () => boolean; measure: () => Surface['ctx'] }) {
  return {
    async respond(
      req: { text: string; legal: (c: CardInst) => boolean; pass: string; timed: boolean; attacker: Enemy | null; legalCards: CardInst[] },
      ctx: RectContext,
    ): Promise<CardInst | null> {
      if (!req.legalCards.length) return null;
      if (o.autoShan && req.legalCards.length === 1 && req.text.includes('【杀】')) return req.legalCards[0];
      const { handle } = openResponse(
        ctx.overlays,
        { text: req.text, legal: req.legal, pass: req.pass, timed: req.timed, hand: ctx.game.hand },
        { layout: () => layoutFromRectOf(ctx, req.attacker), seconds: o.seconds, paused: o.paused },
      );
      return (await handle.result) ?? null;
    },
    detail(hit: HitRef, ctx: RectContext): boolean {
      const c = detailOfHit(hit, ctx.game);
      if (!c) return false;
      const at: Vec2 = { x: hit.rect.x + hit.rect.w / 2, y: hit.rect.y };
      openDetail(ctx.overlays, c, at, ctx.safe, o.measure());
      return true;
    },
  };
}
