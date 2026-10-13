/**
 * 战斗教程 2：「如何产令连打」（#231；PRD §18.2 / ui-specs/231-ling-cycle-ui.md §4）。
 * 文案键走本模块常量（等同配置表）；禁止出现「每回合 3 张」「令用完结束回合」。
 * 可跳过；每步可点「下一步」或完成动作后自动进。
 */
import type { Ctx2DLike, Rect } from '../../../engine/types';
import type { OverlayStack } from '../../../engine/modal';
import { C, FONT, button, frame, rect, text } from './paint';
import { DESIGN_RECT } from '../../../engine/viewport';
import { CONFIG } from '../../../data/config';

/** 文案键（字体收集走 #205/#228；书法仅标题，正文 SANS） */
export const LING_TUTORIAL_TEXT = {
  title: '如何产令连打',
  skip: '跳过',
  next: '下一步',
  steps: [
    { id: 'highlight-tally', body: '每回合先回满 3 令，这是地板，不是上限。', highlight: 'tally' as const },
    { id: 'play-gain', body: '先打产令，令会马上回来。', highlight: 'gain-card' as const },
    { id: 'play-again', body: '令续上了，可以继续出牌。', highlight: 'action-card' as const },
    { id: 'wrap', body: '循环没续上才会令不够；3 令是地板，不是出牌上限。', highlight: null },
  ],
} as const;

const FORBIDDEN = [/每回合\s*只能出/, /每回合\s*3\s*张(?!.*地板)/, /令用完.*结束/, /花完.*结束回合/, /只能出\s*3\s*张/];

export function tutorialCopyOk(s: string) {
  return !FORBIDDEN.some((re) => re.test(s));
}

export type LingTutorialHighlight = 'tally' | 'gain-card' | 'action-card' | null;

/** 产令牌：abilities 含 gain_ling（教程默认用 T017 待令） */
export const TUTORIAL_GAIN_CARD_ID = 'T017';

export function isGainLingCard(cardId: string): boolean {
  const abs = CONFIG.cards[cardId]?.abilities ?? [];
  return abs.some((a) => a.do?.some((d) => d.do === 'gain_ling'));
}

/** 在手牌中定位高亮下标：产令优先待令；主动牌取第一张非产令、非响应 */

/** 强制手牌含产令「待令」+ 至少一张主动牌（杀），供教程步骤 2/3 高亮 */
export function ensureTutorialHand(hand: { uid: number; id: string; suit: string; rank: number; mods: string[] }[], nextUid: () => number) {
  const out = hand.map((c) => ({ ...c, mods: [...c.mods] }));
  if (!out.some((c) => isGainLingCard(c.id))) {
    out.unshift({ uid: nextUid(), id: TUTORIAL_GAIN_CARD_ID, suit: 'H', rank: 5, mods: [] });
  } else {
    // 把待令/产令挪到可见位置（靠前）
    const i =
      out.findIndex((c) => c.id === TUTORIAL_GAIN_CARD_ID) >= 0
        ? out.findIndex((c) => c.id === TUTORIAL_GAIN_CARD_ID)
        : out.findIndex((c) => isGainLingCard(c.id));
    if (i > 0) {
      const [c] = out.splice(i, 1);
      out.unshift(c);
    }
  }
  // 保证有一张非产令主动牌（杀）方便步骤 3
  if (!out.some((c) => c.id === 'B001')) {
    out.push({ uid: nextUid(), id: 'B001', suit: 'S', rank: 7, mods: [] });
  }
  return out;
}

export function tutorialHandHighlightIndex(hand: { id: string }[], highlight: LingTutorialHighlight): number {
  if (!hand.length) return -1;
  if (highlight === 'gain-card') {
    const prefer = hand.findIndex((c) => c.id === TUTORIAL_GAIN_CARD_ID);
    if (prefer >= 0) return prefer;
    return hand.findIndex((c) => isGainLingCard(c.id));
  }
  if (highlight === 'action-card') {
    return hand.findIndex((c) => {
      const d = CONFIG.cards[c.id];
      if (!d) return false;
      if (isGainLingCard(c.id)) return false;
      if (d.tags?.includes('response')) return false;
      // 闪 / 无懈
      if ((d.tags ?? []).some((t) => t === 'shan' || t === 'wuxie')) return false;
      return true;
    });
  }
  return -1;
}

export interface LingTutorialState {
  step: number;
  done: boolean;
  skipped: boolean;
}

export function createLingTutorial(): LingTutorialState {
  return { step: 0, done: false, skipped: false };
}

export function tutorialStep(st: LingTutorialState) {
  return LING_TUTORIAL_TEXT.steps[st.step] ?? null;
}

export function advanceTutorial(st: LingTutorialState) {
  if (st.done || st.skipped) return st;
  if (st.step >= LING_TUTORIAL_TEXT.steps.length - 1) return { ...st, done: true };
  return { ...st, step: st.step + 1 };
}

export function skipTutorial(st: LingTutorialState): LingTutorialState {
  return { ...st, skipped: true, done: true };
}

/** 玩家打出产令牌 → 步骤 2 完成；再打出主动牌 → 步骤 3 完成 */
export function onTutorialPlay(st: LingTutorialState, kind: 'gain' | 'action'): LingTutorialState {
  if (st.done || st.skipped) return st;
  const cur = tutorialStep(st);
  if (cur?.id === 'play-gain' && kind === 'gain') return advanceTutorial(st);
  if (cur?.id === 'play-again' && kind === 'action') return advanceTutorial(st);
  return st;
}

export interface TutorialLayout {
  panel: Rect;
  next: Rect;
  skip: Rect;
}

export function tutorialLayout(w = DESIGN_RECT.w, h = DESIGN_RECT.h): TutorialLayout {
  const panel = { x: 24, y: h - 200, w: w - 48, h: 120 };
  return {
    panel,
    next: { x: panel.x + panel.w - 108, y: panel.y + panel.h - 44, w: 96, h: 36 },
    skip: { x: panel.x + 12, y: panel.y + panel.h - 44, w: 72, h: 36 },
  };
}

export function drawLingTutorial(ctx: Ctx2DLike, st: LingTutorialState, highlightRect: Rect | null) {
  if (st.done || st.skipped) return;
  const step = tutorialStep(st);
  if (!step) return;
  const L = tutorialLayout();
  // 高亮挖孔：半透明遮罩，高亮区留空（简化：高亮框金描边）
  rect(ctx, { x: 0, y: 0, w: DESIGN_RECT.w, h: DESIGN_RECT.h }, 'rgba(5,2,1,.55)');
  if (highlightRect) {
    frame(ctx, { x: highlightRect.x - 4, y: highlightRect.y - 4, w: highlightRect.w + 8, h: highlightRect.h + 8 }, C.goldHi, 2);
  }
  rect(ctx, L.panel, 'rgba(15,7,5,.95)');
  frame(ctx, L.panel, C.gold, 1.5);
  text(ctx, LING_TUTORIAL_TEXT.title, L.panel.x + 16, L.panel.y + 28, {
    size: 22,
    color: C.gold,
    font: FONT.brush,
  });
  text(ctx, step.body, L.panel.x + 16, L.panel.y + 58, { size: 14, color: C.paper, font: FONT.body });
  button(ctx, L.skip, LING_TUTORIAL_TEXT.skip, 'secondary', false, 14);
  button(ctx, L.next, LING_TUTORIAL_TEXT.next, 'primary', false, 14);
}

export function hitTutorial(st: LingTutorialState, at: { x: number; y: number }): 'next' | 'skip' | null {
  if (st.done || st.skipped) return null;
  const L = tutorialLayout();
  const inR = (r: Rect) => at.x >= r.x && at.x <= r.x + r.w && at.y >= r.y && at.y <= r.y + r.h;
  if (inR(L.next)) return 'next';
  if (inR(L.skip)) return 'skip';
  return null;
}

/** 挂到 OverlayStack 的简易驱动（截图 / 测试用）；正式战斗由 BattleScene 内嵌绘制 */
export function pushLingTutorialOverlay(overlays: OverlayStack, onDone?: () => void) {
  let st = createLingTutorial();
  const id = 'tutorial:ling-cycle';
  const lay = tutorialLayout();
  overlays.push({
    id,
    kind: 'popup',
    modal: true,
    rect: lay.panel,
    scrim: { color: 'rgba(5,2,1,.55)' },
    draw(s) {
      drawLingTutorial(s.ctx, st, null);
    },
    gesture(e, hd) {
      if (e.type !== 'tap') return true;
      const hit = hitTutorial(st, e.at);
      if (hit === 'skip') {
        st = skipTutorial(st);
        hd.close();
        onDone?.();
      } else if (hit === 'next') {
        st = advanceTutorial(st);
        if (st.done) {
          hd.close();
          onDone?.();
        }
      }
      return true;
    },
  });
  return {
    get state() {
      return st;
    },
    advance: () => (st = advanceTutorial(st)),
    skip: () => (st = skipTutorial(st)),
  };
}
