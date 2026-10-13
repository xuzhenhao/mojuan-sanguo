import { fakeClock } from './helpers';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { OverlayStack } from '../src/engine/modal';
import { abandonRun, resumeFailure } from '../src/game/result/abandon';
import { B } from '../src/game/result/paint';
import { PAUSE_BTN_GAP, PAUSE_ROW_H, pauseFlow, pauseLayout, segmentRects, SETTINGS_ROWS, tapSetting, toggleRect, visibleRows } from '../src/game/result/pause';
import { battleSettings } from '../src/game/prefs/settings';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { ABANDON_H, ABANDON_TEXT, confirmAbandon, DANGER_RING, dialogButtons } from '../src/game/result/resume';
import { buildView, computeSoul, EMPTY_META, applyOutcome } from '../src/game/result/settlement';
import { summarize } from '../src/game/result/store';
import { PREFS_KEY, SettingsStore, defaultSettings, sanitizeSettings } from '../src/game/prefs/settings';
import { RUN_STATE_KEY, RUN_STATE_VERSION } from '../src/game/run/state';
import { RunSession } from '../src/game/run';
import { fakeCanvas } from './engine-fakes';

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};
const frame = { width: 390, height: 844 };
const surface = () => {
  const c = fakeCanvas(390, 844);
  return { canvas: c, ctx: c.ctx2d } as never;
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const newStack = () => {
  const log: string[] = [];
  const ov = new OverlayStack({ invalidate() {}, pauseScene: () => void log.push('pause'), resumeScene: () => void log.push('resume') });
  return { ov, log };
};
const tapIn = (ov: OverlayStack, r: { x: number; y: number; w: number; h: number }) => ov.gesture({ type: 'tap', at: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
const save = {
  heroMain: 'H03',
  heroSub: 'H04',
  chapter: 1,
  runSeed: 7,
  hp: 4,
  maxHp: 8,
  gold: 50,
  tianming: 2,
  deck: [{ id: 'sha', mods: [] }],
  reviveLeft: 1,
  stats: { battlesWon: 5, elitesKilled: 1 },
  mapState: { current: 'n', nodes: [{ id: 'n', layer: 4 }] },
};

describe('#108 设置项：配置 + 局外偏好 mojuan.prefs.v1', () => {
  it('默认值来自 rules.yaml settings，默认值都在选项里', () => {
    const d = defaultSettings();
    expect(Object.keys(d.toggles).length).toBeGreaterThan(0);
    for (const [k, c] of Object.entries(CONFIG.rules.settings.choices)) expect(c.options).toContain(d.choices[k]);
    // 设计稿每一行都有配置
    for (const r of SETTINGS_ROWS) expect(r.kind === 'toggle' ? CONFIG.rules.settings.toggles[r.key] : CONFIG.rules.settings.choices[r.key]).toBeTruthy();
  });
  it('存到偏好键并保留其他字段（如 seenBosses），不写 RunState 键', () => {
    const st = memStorage();
    st.set(PREFS_KEY, JSON.stringify({ seenBosses: ['B1'] }));
    st.set(RUN_STATE_KEY, 'RUN');
    const s = new SettingsStore(st);
    const n = defaultSettings();
    n.toggles.sound = !n.toggles.sound;
    n.choices.animSpeed = '2x';
    s.save(n);
    expect(JSON.parse(st.get(PREFS_KEY)!).seenBosses).toEqual(['B1']);
    expect(st.get(RUN_STATE_KEY)).toBe('RUN');
    expect(new SettingsStore(st).load()).toEqual(n);
  });
  it('坏数据回默认：未知键丢弃，非法选项回默认，JSON 损坏不抛', () => {
    expect(sanitizeSettings({ toggles: { sound: 'yes', bogus: true }, choices: { animSpeed: '9x' } })).toEqual(defaultSettings());
    const st = memStorage();
    st.set(PREFS_KEY, '{oops');
    expect(new SettingsStore(st).load()).toEqual(defaultSettings());
  });
  it('点开关 / 分段切换对应设置', () => {
    const L = pauseLayout(frame);
    const d = defaultSettings();
    const tr = L.rows.find((r) => r.key === 'autoDodge')!;
    const t = toggleRect(tr.rect);
    expect(tapSetting(frame, d, { x: t.x + 5, y: t.y + 5 })!.toggles.autoDodge).toBe(!d.toggles.autoDodge);
    const sr = L.rows.find((r) => r.key === 'animSpeed')!;
    const seg = segmentRects(sr.rect, 3)[2];
    expect(tapSetting(frame, d, { x: seg.x + 5, y: seg.y + 5 })!.choices.animSpeed).toBe(CONFIG.rules.settings.choices.animSpeed.options[2]);
    expect(tapSetting(frame, d, { x: 1, y: 1 })).toBeNull();
  });
});

describe('#108 暂停浮层（入口 2）', () => {
  it('继续 → continue；暂停期间场景暂停，关闭后恢复；遮罩 .90', async () => {
    const { ov, log } = newStack();
    const st = memStorage();
    const store = new SettingsStore(st);
    const p = pauseFlow(ov, frame, store);
    expect(ov.ids()).toEqual(['pause']);
    expect(ov.top()!.scrim).toEqual({ color: B.maskDeep });
    expect(B.maskDeep).toBe('rgba(5,2,1,.9)');
    ov.draw(surface(), 0);
    tapIn(ov, pauseLayout(frame).resume);
    expect(await p).toBe('continue');
    expect(log).toEqual(['pause', 'resume']);
  });
  it('放弃本局 → 二次确认「返回」回到暂停浮层 → 再放弃 → 确定放弃（右）→ abandon', async () => {
    const { ov } = newStack();
    const p = pauseFlow(ov, frame, new SettingsStore(memStorage()));
    tapIn(ov, pauseLayout(frame).abandon);
    await tick();
    expect(ov.ids()).toEqual(['abandon']);
    expect(ov.top()!.scrim).toEqual({ color: B.maskDeep });
    tapIn(ov, dialogButtons(frame, ABANDON_H).left); // 返回（左）
    await tick();
    expect(ov.ids()).toEqual(['pause']);
    tapIn(ov, pauseLayout(frame).abandon);
    await tick();
    tapIn(ov, dialogButtons(frame, ABANDON_H).right); // 确定放弃（右）
    expect(await p).toBe('abandon');
  });
  it('在浮层里改设置立即写偏好键', async () => {
    const { ov } = newStack();
    const st = memStorage();
    const p = pauseFlow(ov, frame, new SettingsStore(st));
    const row = pauseLayout(frame).rows.find((r) => r.key === 'endTurnConfirm')!;
    tapIn(ov, toggleRect(row.rect));
    expect(JSON.parse(st.get(PREFS_KEY)!).settings.toggles.endTurnConfirm).toBe(!defaultSettings().toggles.endTurnConfirm);
    tapIn(ov, pauseLayout(frame).resume);
    await p;
  });
});

describe('#108 放弃本局 = 战斗失败结算', () => {
  it('结局 win:false，将魂与同进度战斗失败完全相同（无额外惩罚），结算页标题「败北」', () => {
    const s = summarize(save)!;
    const ev: { ev: string; data: Record<string, unknown> }[] = [];
    const o = abandonRun(s, save, 1000, 2, (e, d) => void ev.push({ ev: e, data: d }));
    expect(o.win).toBe(false);
    expect(o.abandoned).toBe(true);
    const defeat = { ...o, abandoned: false };
    expect(computeSoul(o)).toEqual(computeSoul(defeat));
    expect(applyOutcome(EMPTY_META, o).soul).toBe(applyOutcome(EMPTY_META, defeat).soul);
    expect(buildView(o, EMPTY_META, (x) => x).title).toBe(buildView(defeat, EMPTY_META, (x) => x).title);
    expect(buildView(o, EMPTY_META, (x) => x).title).toBe('败北');
    // 失败 ×0.5 向下取整、天命加成照常：胜 5×2 + 精英 1×8 = 18 → 9 → ×1.2 = 10
    expect(computeSoul(o).total).toBe(10);
  });
  it('埋点：run_abandon（入口、层数）+ run_end 按失败结算', () => {
    const ev: { ev: string; data: Record<string, unknown> }[] = [];
    abandonRun(summarize(save)!, save, 0, 1, (e, d) => void ev.push({ ev: e, data: d }));
    expect(ev.map((e) => e.ev)).toEqual(['run_abandon', 'run_end']);
    expect(ev[0].data).toMatchObject({ entry: 1, layer: 4 });
    expect(ev[1].data).toMatchObject({ result: 'defeat', abandoned: true, soul: 10 });
  });
});

describe('#108 继续本局读档校验', () => {
  it('损坏档：提示并删档；新版本档：提示但保留', () => {
    expect(resumeFailure('corrupt')).toMatchObject({ clearSave: true });
    expect(resumeFailure('newer')).toMatchObject({ clearSave: false });
    for (const r of ['corrupt', 'newer', 'empty']) expect(resumeFailure(r).text.length).toBeGreaterThan(0);
  });
  it('RunSession.load：损坏 / 未知新版本都返回失败且不建局（入口据此提示后留在点将页）', () => {
    const st = memStorage();
    st.set(RUN_STATE_KEY, '{broken');
    const run = new RunSession();
    expect(run.load(st)).toMatchObject({ ok: false, reason: 'corrupt' });
    st.set(RUN_STATE_KEY, JSON.stringify({ version: RUN_STATE_VERSION + 1 }));
    expect(run.load(st)).toMatchObject({ ok: false, reason: 'newer' });
    expect(run.active).toBe(false);
  });
});

describe('#108 设置项生效 / 隐藏', () => {
  it('底层功能未实现的项（高对比手牌、受伤震动、画质、音乐音效）隐藏，只显示 4 项', () => {
    expect(visibleRows().map((r) => r.key)).toEqual(['autoDodge', 'endTurnConfirm', 'animSpeed', 'responseSec']);
    expect(pauseLayout(frame).rows.map((r) => r.key)).toEqual(visibleRows().map((r) => r.key));
  });
  it('面板高度按可见行数收缩，按钮在最后一个可见行下方 24', () => {
    const L = pauseLayout(frame);
    const last = L.rows[L.rows.length - 1].rect;
    expect(L.resume.y - (last.y + last.h)).toBe(PAUSE_BTN_GAP);
    expect(L.abandon.y).toBe(L.resume.y);
    expect(L.r.y + L.r.h).toBeGreaterThan(L.resume.y + L.resume.h);
    const all = {
      ...CONFIG.rules.settings,
      toggles: Object.fromEntries(Object.entries(CONFIG.rules.settings.toggles).map(([k, v]) => [k, { ...v, hidden: false }])),
    };
    all.choices = Object.fromEntries(Object.entries(CONFIG.rules.settings.choices).map(([k, v]) => [k, { ...v, hidden: false }]));
    expect(pauseLayout(frame, all).r.h - L.r.h).toBe(4 * PAUSE_ROW_H);
  });
  it('battleSettings：自动出闪 / 结束回合确认 / 响应时限秒数 / 动画倍速', () => {
    const d = defaultSettings();
    expect(battleSettings(d)).toEqual({ autoShan: false, confirmEnd: false, responseSeconds: 8, animSpeed: 1 });
    const s = { toggles: { ...d.toggles, autoDodge: true, endTurnConfirm: true }, choices: { ...d.choices, responseSec: '12', animSpeed: '1.5x' } };
    expect(battleSettings(s)).toEqual({ autoShan: true, confirmEnd: true, responseSeconds: 12, animSpeed: 1.5 });
  });
  it('动画速度进战斗表现队列倍速', () => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    expect(new BattleScene({ now: fakeClock().now, overlays: ov, animSpeed: 2 }).q.speed).toBe(2);
    expect(new BattleScene({ now: fakeClock().now, overlays: ov }).q.speed).toBe(1);
  });
  it('结束回合确认：开启时第一次点只进入确认态，不结束回合', async () => {
    const ov = new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} });
    const on = new BattleScene({ now: fakeClock().now, overlays: ov, confirmEnd: true, debugDefaults: true });
    on.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    const turn0 = on.g.turn;
    await on.tapEndTurn();
    expect((on as unknown as { confirmT: number }).confirmT).toBe(1500);
    expect(on.g.turn).toBe(turn0);
    const off = new BattleScene({
      now: fakeClock().now,
      overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }),
      confirmEnd: false,
      debugDefaults: true,
    });
    off.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    void off.tapEndTurn();
    expect((off as unknown as { confirmT: number }).confirmT).toBe(0);
  });
});

describe('#108 放弃确认框（UI 复审）', () => {
  it('文案去掉「将魂减半」', () => {
    expect(ABANDON_TEXT).toBe('放弃后本局按战败结算，存档将被删除。确定放弃？');
  });
  it('「确定放弃」：2px cinnHi 外描边 + 1px 暗环，字 goldHi', () => {
    const { ov } = newStack();
    void confirmAbandon(ov, frame);
    const c = fakeCanvas(390, 844);
    const strokes: { color: string; w: number }[] = [];
    const ctx = c.ctx2d as unknown as Record<string, unknown>;
    ctx.strokeRect = function (this: { strokeStyle: string; lineWidth: number }) {
      strokes.push({ color: this.strokeStyle, w: this.lineWidth });
    };
    const texts: { s: string; color: string }[] = [];
    ctx.fillText = function (this: { fillStyle: string }, s: string) {
      texts.push({ s, color: this.fillStyle });
    };
    ov.draw({ canvas: c, ctx } as never, 0);
    expect(strokes).toContainEqual({ color: B.cinnHi, w: 2 });
    expect(strokes).toContainEqual({ color: DANGER_RING, w: 1 });
    expect(texts.find((t) => t.s === '确定放弃')!.color).toBe(B.goldHi);
  });
});
