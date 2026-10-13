/**
 * 复活子层「将星未陨」（PRD 4.4.1、subpages-v05 §2、mockups-v3/revive.html，#106）。
 * - 模态、暂停场景，不可点遮罩关闭，H5 无倒计时、无广告图标。
 * - 内容：标题、主将名、复活收益（体力 +hp、护甲 +armor）、「敌下回合」每个敌人闪 +1、按钮「放弃」「复活」、小字「本局剩余 N 次」。
 */
import type { OverlayStack } from '../../engine/modal';
import type { Rect, Vec2 } from '../../engine/types';
import { C, frame, inside, textCenter } from './theme';
import { drawPortrait } from '../portrait';

export interface ReviveInfo {
  hero: string;
  /** 主将立绘 OSS 相对路径（#177，缺省画名字占位） */
  portrait?: string;
  /** 立绘加载完成后重绘 */
  onPortraitReady?: () => void;
  hp: number;
  armor: number;
  /** 每局复活总次数 */
  perRun: number;
  /** 选复活前本局剩余次数（文案「本局剩余 N 次」） */
  left?: number;
  /** 存活敌人数（「敌下回合」每人闪 +1） */
  enemies: number;
}

export interface ReviveLayout {
  dlg: Rect;
  giveUp: Rect;
  revive: Rect;
}

/** 对话框 left/right 30、高 440，居中；按钮各 ≥44 高 */
export function reviveLayout(safe: Rect): ReviveLayout {
  const w = Math.min(330, safe.w - 60);
  const h = Math.min(440, safe.h - 40);
  const dlg = { x: safe.x + (safe.w - w) / 2, y: safe.y + Math.max(20, (safe.h - h) / 2), w, h };
  const bw = (w - 36 - 12) / 2;
  const by = dlg.y + h - 22 - 48 - 26;
  return { dlg, giveUp: { x: dlg.x + 18, y: by, w: bw, h: 48 }, revive: { x: dlg.x + 18 + bw + 12, y: by, w: bw, h: 48 } };
}

export const reviveCountText = (left: number) => `本局剩余 ${left} 次`;
export const REVIVE_ID = 'revive';

/** 打开复活层，resolve true = 复活，false = 放弃 */
export function openRevive(ov: OverlayStack, info: ReviveInfo, safe: () => Rect): Promise<boolean> {
  const h = ov.push<boolean>({
    id: REVIVE_ID,
    kind: 'popup',
    modal: true,
    dismissOnTapOutside: false,
    pausesScene: true,
    scrim: { color: 'rgba(5,2,1,0.78)' },
    draw: (s) => drawRevive(s.ctx, reviveLayout(safe()), info),
    gesture: (e, hd) => {
      if (e.type !== 'tap') return true; // 模态：吞掉一切输入
      const L = reviveLayout(safe());
      const at: Vec2 = e.at;
      if (inside(L.revive, at)) hd.close(true);
      else if (inside(L.giveUp, at)) hd.close(false);
      return true;
    },
  });
  return h.result.then((r) => r === true);
}

type Ctx = Parameters<typeof frame>[0];
const fill = (c: Ctx, r: Rect, col: string) => {
  c.fillStyle = col;
  c.fillRect(r.x, r.y, r.w, r.h);
};

export function drawRevive(c: Ctx, L: ReviveLayout, info: ReviveInfo) {
  const { dlg } = L;
  const cx = dlg.x + dlg.w / 2;
  fill(c, dlg, C.lacquerDeep);
  frame(c, dlg, C.gold, 1.5);
  frame(c, { x: dlg.x + 4, y: dlg.y + 4, w: dlg.w - 8, h: dlg.h - 8 }, C.goldDeep, 1);
  // 主将剪影位（灰度）+ 名
  const fig = { x: cx - 60, y: dlg.y + 26, w: 120, h: 164 };
  fill(c, fig, '#3a3430');
  // 立绘（#177）：小图 cover + 顶对齐；没图保留名字占位
  if (!drawPortrait(c, fig, info.portrait, 'small', { onReady: info.onPortraitReady }))
    textCenter(c, info.hero, cx, fig.y + fig.h / 2, '22px "Brush", serif', '#a89c84', 22);
  frame(c, fig, C.goldLo, 1); // 立绘 1px 金描边（#177 UI 复核）
  textCenter(c, '将星未陨', cx, fig.y + fig.h + 40, '30px "Brush", serif', '#e0705a', 30);
  textCenter(c, `体力 +${info.hp}  护甲 +${info.armor}`, cx, fig.y + fig.h + 76, '18px sans-serif', C.paper, 18);
  textCenter(c, `敌下回合  ${Array.from({ length: info.enemies }, () => '闪+1').join(' ')}`, cx, fig.y + fig.h + 104, '13px sans-serif', '#a89c84', 13);
  fill(c, L.giveUp, '#2a1f16');
  frame(c, L.giveUp, C.goldDeep, 1.5);
  textCenter(c, '放弃', L.giveUp.x + L.giveUp.w / 2, L.giveUp.y + 31, '20px "Brush", serif', C.paper, 20);
  fill(c, L.revive, C.jade);
  frame(c, L.revive, C.gold, 1.5);
  textCenter(c, '复活', L.revive.x + L.revive.w / 2, L.revive.y + 31, '20px "Brush", serif', C.paper, 20);
  textCenter(c, reviveCountText(info.left ?? info.perRun), cx, L.revive.y + L.revive.h + 20, '12px "Brush", serif', '#a89c84', 12);
}
