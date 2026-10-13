/**
 * 暂停 / 设置浮层（#108，subpages-v05 §4.1-2，mockup v3/settings.html）：P3 地图（及后续 P2 战斗）右上暂停钮打开。
 * 设置项读写局外偏好（mojuan.prefs.v1，不进 RunState）；底部「放弃本局」（左，次）/「继续」（右，主）。
 * 「放弃本局」进二次确认 confirmAbandon；「返回」回到本浮层（§4.2 入口 2）。
 * 无动画（不涉及减少动态效果）；遮罩 .90、面板 .97、描边分层，不用模糊。
 */
import type { GestureEvent } from '../../engine/input';
import type { OverlayStack } from '../../engine/modal';
import type { Ctx2DLike, Rect } from '../../engine/types';
import { CONFIG } from '../../data/config';
import { frame, inside } from '../overlays/theme';
import type { Settings, SettingsCfg } from '../prefs/settings';
import { B, body, brush, button, center, panel } from './paint';
import { confirmAbandon, type DialogFrame } from './resume';

/** 行序按设计稿（配置只管默认值与选项，展示顺序属于版式） */
export const SETTINGS_ROWS: { key: string; kind: 'toggle' | 'choice' }[] = [
  { key: 'autoDodge', kind: 'toggle' },
  { key: 'endTurnConfirm', kind: 'toggle' },
  { key: 'animSpeed', kind: 'choice' },
  { key: 'responseSec', kind: 'choice' },
  { key: 'highContrastHand', kind: 'toggle' },
  { key: 'hurtVibrate', kind: 'toggle' },
  { key: 'quality', kind: 'choice' },
  { key: 'sound', kind: 'toggle' },
];
export const PAUSE_ROW_H = 46;
const HEAD = 64;
const FOOT = 92;

export function pauseLayout(f: DialogFrame) {
  const w = Math.min(350, f.width - 40);
  const h = HEAD + SETTINGS_ROWS.length * PAUSE_ROW_H + FOOT;
  const r: Rect = { x: (f.width - w) / 2, y: Math.max(16, (f.height - h) / 2), w, h };
  const rows = SETTINGS_ROWS.map((row, i) => ({ ...row, rect: { x: r.x + 16, y: r.y + HEAD + i * PAUSE_ROW_H, w: r.w - 32, h: PAUSE_ROW_H } }));
  const bw = 140;
  const by = r.y + r.h - 70;
  return {
    r,
    rows,
    abandon: { x: r.x + r.w / 2 - 8 - bw, y: by, w: bw, h: 48 },
    resume: { x: r.x + r.w / 2 + 8, y: by, w: bw, h: 48 },
  };
}

/** 开关轨道（右对齐） */
export function toggleRect(row: Rect): Rect {
  return { x: row.x + row.w - 52, y: row.y + (row.h - 26) / 2, w: 52, h: 26 };
}
/** 分段按钮各段（右对齐，每段 44 宽满足热区） */
export function segmentRects(row: Rect, n: number): Rect[] {
  const sw = 44;
  const x0 = row.x + row.w - sw * n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * sw, y: row.y + (row.h - 28) / 2, w: sw, h: 28 }));
}

function pill(c: Ctx2DLike, r: Rect, fill: string) {
  const x = c as Ctx2DLike & { beginPath?(): void; arc?(...a: number[]): void; fill?(): void; closePath?(): void };
  c.fillStyle = fill;
  if (x.beginPath && x.arc && x.fill) {
    const rad = r.h / 2;
    x.beginPath();
    x.arc(r.x + rad, r.y + rad, rad, Math.PI / 2, (Math.PI * 3) / 2);
    x.arc(r.x + r.w - rad, r.y + rad, rad, -Math.PI / 2, Math.PI / 2);
    x.closePath?.();
    x.fill();
  } else c.fillRect(r.x, r.y, r.w, r.h);
}
function dot(c: Ctx2DLike, cx: number, cy: number, rad: number, fill: string) {
  const x = c as Ctx2DLike & { beginPath?(): void; arc?(...a: number[]): void; fill?(): void };
  c.fillStyle = fill;
  if (x.beginPath && x.arc && x.fill) {
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fill();
  } else c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
}

export function drawPause(c: Ctx2DLike, f: DialogFrame, s: Settings, cfg: SettingsCfg = CONFIG.rules.settings) {
  const L = pauseLayout(f);
  panel(c, L.r, 0.97);
  center(c, '暂停', L.r.x + L.r.w / 2, L.r.y + 44, brush(30), B.gold, 30);
  for (const row of L.rows) {
    const label = row.kind === 'toggle' ? cfg.toggles[row.key]?.label : cfg.choices[row.key]?.label;
    c.font = body(15);
    c.fillStyle = B.paper;
    c.fillText?.(label ?? row.key, row.rect.x, row.rect.y + row.rect.h / 2 + 5);
    // 行分隔：goldLo 1px（设计稿 .35 透明）
    c.globalAlpha = 0.35;
    c.fillStyle = B.goldLo;
    c.fillRect(row.rect.x, row.rect.y + row.rect.h - 1, row.rect.w, 1);
    c.globalAlpha = 1;
    if (row.kind === 'toggle') {
      const on = !!s.toggles[row.key];
      const t = toggleRect(row.rect);
      pill(c, t, on ? B.jade : B.lac3);
      if (!on) frame(c, t, B.goldLo, 1);
      dot(c, on ? t.x + t.w - 13 : t.x + 13, t.y + 13, 10, on ? B.paper : B.paper3);
    } else {
      const opts = cfg.choices[row.key]?.options ?? [];
      segmentRects(row.rect, opts.length).forEach((sr, i) => {
        const on = s.choices[row.key] === opts[i];
        c.fillStyle = on ? B.gold : B.lac1;
        c.fillRect(sr.x, sr.y, sr.w, sr.h);
        frame(c, sr, B.goldLo, 1);
        center(c, opts[i], sr.x + sr.w / 2, sr.y + 20, body(14, true), on ? B.lac1 : B.paper, 14);
      });
    }
  }
  button(c, L.abandon, '放弃本局', 'secondary');
  button(c, L.resume, '继续', 'confirm');
}

/** 点击设置项：返回新设置（未命中返回 null） */
export function tapSetting(f: DialogFrame, s: Settings, at: { x: number; y: number }, cfg: SettingsCfg = CONFIG.rules.settings): Settings | null {
  for (const row of pauseLayout(f).rows) {
    if (row.kind === 'toggle') {
      if (inside(row.rect, at)) return { ...s, toggles: { ...s.toggles, [row.key]: !s.toggles[row.key] } };
    } else {
      const opts = cfg.choices[row.key]?.options ?? [];
      const i = segmentRects(row.rect, opts.length).findIndex((sr) => inside(sr, at));
      if (i >= 0) return { ...s, choices: { ...s.choices, [row.key]: opts[i] } };
    }
  }
  return null;
}

export interface PauseDeps {
  load(): Settings;
  save(s: Settings): void;
}

/** 暂停浮层：继续 → 'continue'，放弃本局 → 'abandon'（尚未确认） */
export function showPause(ov: OverlayStack, f: DialogFrame, d: PauseDeps) {
  let s = d.load();
  /** 设置变了重绘一帧（弹层栈没有单独的 invalidate） */
  let dirty = false;
  return ov.push<'continue' | 'abandon'>({
    id: 'pause',
    kind: 'popup',
    modal: true,
    pausesScene: true,
    scrim: { color: B.maskDeep },
    draw: (sf) => {
      dirty = false;
      drawPause(sf.ctx, f, s);
    },
    animating: () => dirty,
    gesture: (e: GestureEvent, h) => {
      if (e.type !== 'tap') return true;
      const L = pauseLayout(f);
      if (inside(L.abandon, e.at)) h.close('abandon');
      else if (inside(L.resume, e.at)) h.close('continue');
      else {
        const n = tapSetting(f, s, e.at);
        if (n) {
          s = n;
          d.save(s);
          dirty = true;
        }
      }
      return true;
    },
  });
}

/** 入口 2：暂停 → 放弃本局 → 二次确认（返回则回到暂停浮层）；确定放弃 → 'abandon' */
export async function pauseFlow(ov: OverlayStack, f: DialogFrame, d: PauseDeps): Promise<'continue' | 'abandon'> {
  for (;;) {
    const r = await showPause(ov, f, d).result;
    if (r !== 'abandon') return 'continue';
    if (await confirmAbandon(ov, f).result) return 'abandon';
  }
}
