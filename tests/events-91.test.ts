/** #91 奇遇：8 个事件的效果（docs/specs/events-v05.md §4/§6）、抽取规则、奇遇页交互与 V13 开场护甲 */
import { describe, expect, it } from 'vitest';
import { seeded } from '../src/core/rng';
import { CONFIG } from '../src/data/config';
import { poolsOf } from '../src/data/map';
import { starterDeck } from '../src/data/cards';
import type { CardInst } from '../src/core/types';
import { addPool, applyOption, drawEvent, drawEventEasy, eventDef, eventPool, optionBlocked, type EventRun } from '../src/game/event/logic';
import { EventScene, eventRunOf } from '../src/game/scenes/event';
import { RunSession } from '../src/game/run';
import { FlowMachine } from '../src/game/flow';
import { center, flush, p4env, surface, tap } from './p4-helpers';

const deck = (): CardInst[] => starterDeck('H01').map(([id, suit, rank], i) => ({ uid: i + 1, id, suit, rank, mods: [] }));
const st = (o: Partial<EventRun> = {}): EventRun => ({
  hp: 5,
  maxHp: 8,
  gold: 100,
  deck: deck(),
  nextUid: 100,
  heroMain: 'H01',
  heroSub: 'H03',
  nextBattleArmor: 0,
  ...o,
});
const ev = (id: string) => eventDef(id)!;
/** 固定返回 v 的 rng */
const fixed = (v: number) => () => v;
const isExcl = (id: string) => !!(CONFIG.cards[id] as { exclusiveHero?: string }).exclusiveHero;

describe('#91 配置', () => {
  it('第 1 章启用 8 个事件（PRD §13 H5 首版子集）', () => {
    expect(eventPool(1).map((e) => e.id)).toEqual(['V01', 'V04', 'V05', 'V06', 'V09', 'V13', 'V14', 'V19']);
  });
  it('无放回抽取；抽空返回 null；同种子可复现', () => {
    const rng = seeded(3);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) seen.push(drawEvent(rng, 1, seen)!.id);
    expect(new Set(seen).size).toBe(8);
    expect(drawEvent(rng, 1, seen)).toBeNull();
    expect(drawEvent(seeded(9), 1, [])!.id).toBe(drawEvent(seeded(9), 1, [])!.id);
  });
  it('奇遇 easy 战斗独立抽取：只从 easy 池，同节点同结果', () => {
    const p = poolsOf(1);
    const a = drawEventEasy(5, 1, 'L3C1', p);
    expect(a.encounterId).toMatch(/^easy:\d$/);
    expect(drawEventEasy(5, 1, 'L3C1', p)).toEqual(a);
    expect(p.pools.easy).toContain(a.group);
  });
});

describe('#91 V01 路边桃园', () => {
  it('歇脚：回 2 体力；满血置灰', () => {
    const s = st({ hp: 5 });
    const r = applyOption(ev('V01'), 0, s, fixed(0));
    expect(s.hp).toBe(7);
    expect(r.text).toBe('回复 2 点体力。');
    expect(r.changes.map((c) => c.text)).toEqual(['体力 5→7']);
    expect(optionBlocked(ev('V01').options[0], st({ hp: 8 }))).toBe('体力已满');
  });
  it('摘桃：加 1 张桃（B005），新 uid', () => {
    const s = st();
    const r = applyOption(ev('V01'), 1, s, seeded(1));
    expect(r.added[0]).toMatchObject({ id: 'B005', uid: 100 });
    expect(s.deck.length).toBe(deck().length + 1);
    expect(r.text).toBe('获得一张「桃」。');
    expect(r.changes.map((c) => c.text)).toContain('+ 桃');
  });
  it('离开：无变化', () => {
    const s = st();
    const r = applyOption(ev('V01'), 2, s, fixed(0));
    expect(r.changes).toEqual([]);
    expect(s).toEqual(st());
  });
});

describe('#91 V04 赌坊', () => {
  it('赢：−30 +70；输：−30', () => {
    const a = st({ gold: 50 });
    expect(applyOption(ev('V04'), 0, a, fixed(0.1)).text).toBe('赢了！得 70 铜钱。');
    expect(a.gold).toBe(90);
    const b = st({ gold: 50 });
    const r = applyOption(ev('V04'), 0, b, fixed(0.9));
    expect([b.gold, r.text, r.changes[0].text]).toEqual([20, '血本无归。', '铜钱 50→20']);
  });
  it('铜钱 < 30 置灰', () => {
    expect(optionBlocked(ev('V04').options[0], st({ gold: 29 }))).toBe('铜钱不足');
    expect(() => applyOption(ev('V04'), 0, st({ gold: 29 }), fixed(0))).toThrow();
  });
});

describe('#91 V05 黑市', () => {
  it('卖牌：删所选牌 +30；牌组不能再少时置灰', () => {
    const s = st({ gold: 0 });
    const uid = s.deck.find((c) => c.id !== 'B001')!.uid;
    const r = applyOption(ev('V05'), 0, s, fixed(0), uid);
    expect(s.deck.some((c) => c.uid === uid)).toBe(false);
    expect(s.gold).toBe(30);
    expect(r.text).toMatch(/^卖出「.+」，得 30 铜钱。$/);
    expect(optionBlocked(ev('V05').options[0], st({ deck: deck().slice(0, 8) }))).toBe('牌组不能再少');
  });
  it('卖牌未选（取消）不执行', () => {
    expect(() => applyOption(ev('V05'), 0, st(), fixed(0))).toThrow();
  });
  it('买珍品：−75，得 1 张非专属 E 牌', () => {
    for (let k = 1; k < 30; k++) {
      const s = st({ gold: 80 });
      const r = applyOption(ev('V05'), 1, s, seeded(k));
      expect(s.gold).toBe(5);
      const id = r.added[0].id;
      expect(CONFIG.cards[id].rarity).toBe('E');
      expect(isExcl(id)).toBe(false);
    }
    expect(optionBlocked(ev('V05').options[1], st({ gold: 74 }))).toBe('铜钱不足');
  });
});

describe('#91 V06 古井', () => {
  it('红签回 2；黑签失 1（不致死）得 1 张非专属 R 牌', () => {
    // drawJudge：k = floor(r*52)，suit = SHCD[k%4]；r=1/52 → H（红），r=0 → S（黑）
    const red = st({ hp: 5 });
    const r1 = applyOption(ev('V06'), 0, red, fixed(1.5 / 52));
    expect([r1.judge?.red, red.hp, r1.text]).toEqual([true, 7, '吉签，回复 2 点体力。']);
    const black = st({ hp: 1 });
    const r2 = applyOption(ev('V06'), 0, black, fixed(0));
    expect(r2.judge?.red).toBe(false);
    expect(black.hp).toBe(1);
    expect(CONFIG.cards[r2.added[0].id].rarity).toBe('R');
    expect(isExcl(r2.added[0].id)).toBe(false);
    expect(r2.text).toContain('凶签');
  });
  it('R / E 池不含专属牌', () => {
    for (const r of ['R', 'E'] as const) expect(addPool({ heroMain: 'H02', heroSub: 'H01' }, { rarity: r }).some((c) => isExcl(c.id))).toBe(false);
  });
});

describe('#91 V09 华佗诊所', () => {
  it('刮骨：先扣上限 1 再回满（固定顺序）', () => {
    const s = st({ hp: 3, maxHp: 8 });
    const r = applyOption(ev('V09'), 0, s, fixed(0));
    expect([s.hp, s.maxHp]).toEqual([7, 7]);
    expect(r.changes.map((c) => c.text)).toEqual(['体力上限 8→7', '体力 3→7']);
  });
  it('刮骨：体力上限 1 置灰', () => {
    expect(optionBlocked(ev('V09').options[0], st({ hp: 1, maxHp: 1 }))).toBe('体力上限过低');
  });
  it('抓药：−40 回 3；满血 / 钱不够置灰', () => {
    const s = st({ hp: 2, gold: 40 });
    applyOption(ev('V09'), 1, s, fixed(0));
    expect([s.hp, s.gold]).toEqual([5, 0]);
    expect(optionBlocked(ev('V09').options[1], st({ hp: 8 }))).toBe('体力已满');
    expect(optionBlocked(ev('V09').options[1], st({ gold: 39 }))).toBe('铜钱不足');
  });
});

describe('#91 V13 叛军劝降', () => {
  it('收编：下一场开场护甲 3（存 RunState 字段）', () => {
    const s = st();
    const r = applyOption(ev('V13'), 0, s, fixed(0));
    expect(s.nextBattleArmor).toBe(3);
    expect(r.battle).toBeUndefined();
  });
  it('剿灭：进战斗，铜钱 ×2', () => {
    expect(applyOption(ev('V13'), 1, st(), fixed(0)).battle).toEqual({ goldMult: 2 });
  });
  it('开场护甲写进 RunState → 下一场战斗（含 Boss）开场生效并清零；总上限 4', () => {
    const run = new RunSession();
    run.start({ main: 'H01', sub: 'H03', seed: 11 });
    run.update((d) => void (d.nextBattleArmor = 3));
    expect(new RunSession().resume(run.serialize()).ok).toBe(true); // 存档可读
    const g = run.buildBattle(
      {
        log() {},
        update() {},
        sleep: () => Promise.resolve(),
        showJudge: () => Promise.resolve(),
        respond: () => Promise.resolve(null),
        epiphany: () => Promise.resolve(null),
        onBattleEnd() {},
      } as never,
      { nodeId: 'BOSS', nodeType: 'BOSS', encounterName: 'x', enemies: ['B1'] },
    );
    expect(g.p.armor).toBeGreaterThanOrEqual(3);
    expect(g.p.armor).toBeLessThanOrEqual(4);
    expect(run.state.nextBattleArmor).toBe(0);
  });
});

describe('#91 V14 铜雀演出', () => {
  it('貂蝉在队（主或副）：得 X201', () => {
    for (const [m, sb] of [
      ['H02', 'H01'],
      ['H01', 'H02'],
    ]) {
      const s = st({ heroMain: m, heroSub: sb });
      const r = applyOption(ev('V14'), 0, s, seeded(2));
      expect(r.added.map((c) => c.id)).toEqual(['X201']);
      expect(s.gold).toBe(100);
    }
  });
  it('否则得 40 铜钱', () => {
    const s = st();
    const r = applyOption(ev('V14'), 0, s, seeded(2));
    expect([s.gold, r.added.length, r.text]).toEqual([140, 0, '打赏如雨，你也分得 40 铜钱。']);
  });
});

describe('#91 V19 驿站', () => {
  it('歇一晚 +2；包上房 −60 回满；离开总能点', () => {
    const a = st({ hp: 3 });
    applyOption(ev('V19'), 0, a, fixed(0));
    expect(a.hp).toBe(5);
    const b = st({ hp: 3, gold: 60 });
    applyOption(ev('V19'), 1, b, fixed(0));
    expect([b.hp, b.gold]).toEqual([8, 0]);
    const full = st({ hp: 8, gold: 0 });
    expect(ev('V19').options.map((o) => optionBlocked(o, full))).toEqual(['体力已满', '铜钱不足', null]);
  });
});

describe('#91 奇遇页', () => {
  function setup(id: string, o: { hp?: number; gold?: number } = {}) {
    const t = p4env();
    const run = new RunSession();
    run.start({ main: 'H01', sub: 'H03', seed: 5 });
    run.update((d) => {
      if (o.hp !== undefined) d.hp = o.hp;
      if (o.gold !== undefined) d.gold = o.gold;
    });
    const battles: number[] = [];
    let done = 0;
    const s = new EventScene({
      ...t.env,
      inventory: () => run.inventory,
      rng: () => run.rng('event'),
      run: () => eventRunOf(run as never),
      done: () => void done++,
      battle: (m) => void battles.push(m),
      debugId: id,
      reducedMotion: () => true,
    });
    s.enter(t.ctx);
    return { t, s, run, battles, done: () => done };
  }
  it('选项执行后显示结果与数值变化，「继续」回地图；减少动态时无淡入', () => {
    const { s, run, done } = setup('V19', { hp: 3 });
    s.gesture(tap(...center(s.optRect(0))));
    expect(run.state.hp).toBe(5);
    expect(s.result?.changes.map((c) => c.text)).toEqual(['体力 3→5']);
    expect(s.animating()).toBe(false);
    expect(s.resultAlpha()).toBe(1);
    s.draw('main', surface());
    s.gesture(tap(...center(s.buttons()[0].rect)));
    expect(done()).toBe(1);
  });
  it('置灰选项不能点', () => {
    const { s, run } = setup('V04', { gold: 10 });
    s.gesture(tap(...center(s.optRect(0))));
    expect(s.result).toBeNull();
    expect(run.state.gold).toBe(10);
  });
  it('V05 卖牌：删牌页取消 → 不扣牌不给钱，回到选项', async () => {
    const { s, run, t } = setup('V05', { gold: 0 });
    const n = run.state.deck.length;
    const p = s.choose(0);
    await flush();
    expect(t.overlays.top()?.id).toBe('deck-pick');
    t.overlays.gesture(tap(195, 844 - 74 - 56 + 21)); // 取消
    expect(await p).toBe(false);
    expect([run.state.deck.length, run.state.gold, s.result]).toEqual([n, 0, null]);
  });
  it('V13 剿灭：继续 → 进战斗（铜钱 ×2）', () => {
    const { s, battles } = setup('V13');
    s.gesture(tap(...center(s.optRect(1))));
    s.gesture(tap(...center(s.buttons()[0].rect)));
    expect(battles).toEqual([2]);
  });
  it('正常抽取：记入 eventsSeen；刷新回快照重抽同一事件', () => {
    const run = new RunSession();
    run.start({ main: 'H01', sub: 'H03', seed: 8 });
    const snap = run.serialize();
    const draw = (r: RunSession) => {
      const t = p4env();
      const s = new EventScene({
        ...t.env,
        inventory: () => r.inventory,
        rng: () => r.rng('event'),
        run: () => eventRunOf(r as never),
        done() {},
        battle() {},
      });
      s.enter(t.ctx);
      return s.ev!.id;
    };
    const a = draw(run);
    expect(run.state.eventsSeen).toEqual([a]);
    const r2 = new RunSession();
    r2.resume(snap);
    expect(draw(r2)).toBe(a);
  });
  it('流程：event → event_done → map；event_battle → battle', () => {
    const f = new FlowMachine();
    f.page = 'map';
    expect(f.send({ type: 'enter_node', node: 'event' })).toBe('event');
    expect(f.send({ type: 'event_done' })).toBe('map');
    f.page = 'event';
    expect(f.send({ type: 'event_battle' })).toBe('battle');
  });
});

describe('#91 结果数值色', () => {
  it('收益 goldHi；体力下降朱砂；无绿色', async () => {
    const { changeColor } = await import('../src/game/scenes/event');
    const { T } = await import('../src/game/scenes/p4-kit');
    expect(changeColor({ kind: 'card+', text: '+ 桃' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'gold', text: '铜钱 50→120' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'hp', text: '体力 3→5' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'armor', text: '下一战开场护甲 +3' })).toBe(T.goldHi);
    expect(changeColor({ kind: 'hp', text: '体力 4→3' })).toBe(T.cinnHi);
    expect(changeColor({ kind: 'maxHp', text: '体力上限 8→7' })).toBe(T.cinnHi);
    expect(changeColor({ kind: 'gold', text: '铜钱 50→20' })).toBe(T.paper);
  });
});
