/** #107 首领登场演出：台词配置、字表、时间轴、折行、已看过记录、场景接入 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { ENEMIES } from '../src/data/enemies';
import { OverlayStack } from '../src/engine/modal';
import { BattleScene } from '../src/game/scenes/battle/scene';
import { NAME_GLOW, chapterLabel, INTRO_MS, introFrame, nameSize, wrapIntroLine, LINE_MAX_W } from '../src/game/scenes/battle/boss-intro';
import { PREFS_KEY, SeenBossStore } from '../src/game/prefs/seen-bosses';
import type { StorageAdapter } from '../src/platform/types';

const LINE = '「苍天已死，黄天当立！」';
const PHASE = '「天雷在此——黄巾儿郎，随我死战！」';
const mem = (init: Record<string, string> = {}): StorageAdapter & { m: Record<string, string> } => {
  const m = { ...init };
  return { m, get: (k) => m[k] ?? null, set: (k, v) => void (m[k] = v), remove: (k) => void delete m[k] };
};
const w20 = (s: string) => [...s].length * 20;

describe('#107 配置', () => {
  it('张角有登场 / 阶段台词；精英与小怪没有', () => {
    expect(CONFIG.enemies.B1.intro).toEqual({ line: LINE, phaseLine: PHASE });
    expect(ENEMIES.B1.intro).toEqual({ line: LINE, phaseLine: PHASE });
    for (const [id, e] of Object.entries(CONFIG.enemies)) if (e.tier !== 'Boss') expect(e.intro, id).toBeUndefined();
  });
  it('台词的汉字都在书法字表（core + ext）里', () => {
    const chars = readFileSync('scripts/wenkai-chars-core.txt', 'utf8') + readFileSync('scripts/wenkai-chars-ext.txt', 'utf8');
    const miss = [...new Set(LINE + PHASE + chapterLabel(1) + '点击跳过')].filter((c) => !/\s/.test(c) && !chars.includes(c));
    expect(miss).toEqual([]);
  });
});

describe('#107 时间轴', () => {
  it('首次 2000ms：0 只有遮罩起步，450 墨带扫完，1000 名字写完，1500 停留，2000 结束', () => {
    expect(INTRO_MS).toEqual({ first: 2000, repeat: 800, phase: 1000 });
    expect(introFrame('first', 0, false)).toMatchObject({ band: 0, name: 0, line: 0 });
    expect(introFrame('first', 450, false).bandWipe).toBe(1);
    expect(introFrame('first', 1000, false).nameWipe).toBe(1);
    const hold = introFrame('first', 1500, false);
    expect(hold.scrim).toBeCloseTo(0.72);
    expect(hold.line).toBe(1);
    expect(hold.lineDy).toBe(0);
    expect(introFrame('first', 2000, false).scrim).toBe(0);
  });
  it('第 2 次起 800ms：墨带不扫，名与台词同时淡入', () => {
    const f = introFrame('repeat', 500, false);
    expect(f).toMatchObject({ bandWipe: 1, band: 1, name: 1, line: 1 });
    expect(introFrame('repeat', 300, false).name).toBe(introFrame('repeat', 300, false).line);
  });
  it('阶段切换：遮罩 .5，不画墨带和名字', () => {
    const f = introFrame('phase', 500, false);
    expect(f.scrim).toBeCloseTo(0.5);
    expect(f).toMatchObject({ band: 0, name: 0, line: 1 });
  });
  it('减少动态：不扫不擦，200ms 淡入 / 淡出，总时长不变', () => {
    expect(introFrame('first', 100, true)).toMatchObject({ bandWipe: 1, nameWipe: 1, lineDy: 0 });
    expect(introFrame('first', 100, true).line).toBeCloseTo(0.5);
    expect(introFrame('first', 1000, true).line).toBe(1);
    expect(introFrame('first', 1900, true).line).toBeCloseTo(0.5);
  });
  it('跳过：从跳过那一帧起 150ms 淡出', () => {
    const at = introFrame('first', 1300, false);
    expect(introFrame('first', 1375, false, 1300).line).toBeCloseTo(at.line * 0.5);
    expect(introFrame('first', 1450, false, 1300).scrim).toBe(0);
  });
});

describe('#107 排版', () => {
  it('不超过 330 一行；超过在「——」后折两行，字号不缩', () => {
    expect(wrapIntroLine(LINE, w20)).toEqual([LINE]);
    expect(w20(PHASE)).toBeGreaterThan(LINE_MAX_W);
    expect(wrapIntroLine(PHASE, w20)).toEqual(['「天雷在此——', '黄巾儿郎，随我死战！」']);
  });
  it('名字 ≤6 字 56，更长缩小但不低于 40', () => {
    expect(nameSize('张角·墨魇')).toBe(56);
    expect(nameSize('一二三四五六七八')).toBe(42);
    expect(nameSize('一二三四五六七八九十一二')).toBe(40);
    expect(chapterLabel(1)).toBe('第一章 · 首领');
  });
});

describe('#107 名字发光', () => {
  it('三层 T.cinnHi 描边：12/7/3px，不透明度 .15/.30/.60，从最宽的画起', () => {
    expect(NAME_GLOW).toEqual([
      [12, 0.15],
      [7, 0.3],
      [3, 0.6],
    ]);
  });
});

describe('#107 已看过的首领（局外偏好）', () => {
  it('按 id 记集合，保留偏好键里的其他字段，坏数据当空', () => {
    const s = mem({ [PREFS_KEY]: JSON.stringify({ other: 1 }) });
    const st = new SeenBossStore(s);
    expect(st.has('B1')).toBe(false);
    st.add('B1');
    st.add('B1');
    expect(JSON.parse(s.m[PREFS_KEY])).toEqual({ other: 1, seenBosses: ['B1'] });
    expect(new SeenBossStore(mem({ [PREFS_KEY]: '{bad' })).has('B1')).toBe(false);
  });
});

function bossScene(storage = mem(), reduced = false) {
  const sc = new BattleScene({
    overlays: new OverlayStack({ invalidate() {}, pauseScene() {}, resumeScene() {} }),
    debugDefaults: true,
    seenBosses: new SeenBossStore(storage),
    reducedMotion: () => reduced,
  });
  sc.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
  sc.q.clear();
  sc.g.en = [sc.g.spawnEnemy('B1')];
  return sc;
}

describe('#107 战斗场景接入', () => {
  it('普通战斗不播；首领首次 2000ms、第 2 次 800ms，播完意图 250ms 弹出', () => {
    const plain = new BattleScene({ debugDefaults: true });
    plain.enter({ width: 390, height: 844, invalidate() {} }, { seed: 7 });
    expect(plain.q.played).not.toContain('boss_intro');

    const store = mem();
    const a = bossScene(store);
    a.startIntro();
    expect(a.introStep?.durationMs).toBe(2000);
    expect(a.intentIntroAlpha()).toBe(0);
    const b = bossScene(store);
    b.startIntro();
    expect(b.introStep?.durationMs).toBe(800);
    b.update(800);
    expect(b.introStep).toBeNull();
    expect(b.intentIntroAlpha()).toBe(0);
    b.update(125);
    expect(b.intentIntroAlpha()).toBeCloseTo(0.5);
  });
  it('倍速 2：首次演出 1000ms 播完', () => {
    const sc = bossScene();
    sc.q.speed = 2;
    sc.startIntro();
    sc.update(999);
    expect(sc.introStep).not.toBeNull();
    sc.update(2);
    expect(sc.introStep).toBeNull();
  });
  it('演出中阻塞输入，点击 → 150ms 淡出后结束', () => {
    const sc = bossScene();
    sc.startIntro();
    sc.update(500);
    expect(sc.gesture({ type: 'tap', at: { x: 195, y: 700 } } as never)).toBe(true);
    expect(sc.introStep?.data?.skipAt).toBe(500);
    sc.update(149);
    expect(sc.introStep).not.toBeNull();
    sc.update(2);
    expect(sc.introStep).toBeNull();
  });
  it('阶段 2 切换：播阶段台词约 1s', () => {
    const sc = bossScene();
    const boss = sc.g.en[0];
    sc.io.enemyPhase!({ type: 'enemy_phase', enemy: boss, phase: 2 });
    const s = sc.introStep!;
    expect(s.id).toBe('boss_phase');
    expect(s.durationMs).toBe(1000);
    expect((s.data as { intro: { line: string } }).intro.line).toBe(PHASE);
  });
});
