import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { card, mkGame } from './helpers';
import { runChapter } from '../src/sim/autoplay';
import { ROSTER } from '../src/data/heroes';

const M0 = { ...CONFIG.rules.mechanics };
afterEach(() => Object.assign(CONFIG.rules.mechanics, M0));

function setup(main: string, sub = main === 'H04' ? 'H03' : 'H04') {
  const r = mkGame({}, 1, { main, sub });
  r.g.startBattle();
  r.g.en.forEach((e) => (e.pat = [['闪']]));
  return r.g;
}

describe('选将', () => {
  it('起始牌组取主将配置；预设回归关羽+赵云', () => {
    const g = setup('H01');
    expect(g.main.id).toBe('H01');
    expect(g.deckMaster.map((c) => c.id)).toEqual(CONFIG.heroes.H01.starterDeck.map((c) => c.card));
    const r = mkGame({}, 1);
    r.g.startBattle();
    expect(r.g.main.id).toBe('H09');
    expect(r.g.p.armor).toBe(3); // forceCombos: 龙虎会
  });
  it('停用的珠联不生效', () => {
    const g = setup('H09', 'H03'); // 龙虎会 enabled:false（非回归预设）
    expect(g.effects.combos()).toEqual([]);
  });
  it.each(ROSTER)('%s 能打完整章不报错', async (main) => {
    const r = await runChapter(5, { main });
    expect(r.res.length).toBeGreaterThan(0);
  });
});

describe('V1 武将技能', () => {
  it('吕布·无俦：敌人需 2 枚闪标记；虓烈：第 2 张杀 +1', async () => {
    const g = setup('H01');
    const e = g.en[0];
    e.marks = 1;
    e.hp = e.max = 9;
    const a = card('B001');
    const b = card('B001');
    g.hand.push(a, b);
    await g.play(a, e);
    expect(e.hp).toBe(8);
    expect(e.marks).toBe(1);
    await g.play(b, e);
    expect(e.hp).toBe(6);
  });
  it('赵云·龙胆：闪当杀、杀当闪，冲阵摸牌', async () => {
    const g = setup('H03');
    g.io.respond = async (_t, legal) => g.hand.find(legal) ?? null;
    g.hand = [card('B001')];
    g.effects.used.enemy_turn.set('sub:huzhu', 1);
    expect(await g.enemySha(g.en[0], 1)).toBe('shan');
    expect(g.hand.length).toBe(1); // 冲阵摸 1
    const s = card('B004');
    g.hand.push(s);
    s.asSha = true;
    expect(g.checkPlay(s)).toBeNull();
    const hp = g.en[0].hp;
    await g.play(s, g.en[0]);
    expect(g.en[0].hp).toBe(hp - 1);
  });
  it('貂蝉·离间：非 ♥ 时敌人的杀打向友军', async () => {
    CONFIG.rules.mechanics.judgeSource = 'deck';
    const g = setup('H02');
    g.draw.push(card('B001', 'S', 3));
    await g.activate('lijian', undefined, g.en[0]);
    expect(g.en[0].redirect).toBe(true);
    g.en[0].pat = [['杀']];
    const hp0 = g.p.hp;
    const ally = g.en[1].hp + g.en[2].hp;
    await g.endTurn();
    expect(g.p.hp).toBe(hp0);
    expect(g.en[1].hp + g.en[2].hp).toBe(ally - 1);
  });
  it('刘备·仁义：回合结束超上限赠牌得甲', () => {
    const g = setup('H04');
    g.p.armor = 0;
    g.p.hp = 2;
    g.hand = [card('B001'), card('B001'), card('B001')];
    g.turnEnd();
    expect(g.hand.length).toBe(2);
    expect(g.p.armor).toBe(1);
  });
  it('郭嘉·天策：受伤摸 1（护甲完全吸收不算）', async () => {
    const g = setup('H05');
    g.p.armor = 1;
    const n = g.hand.length;
    await g.dmgPlayer(1);
    expect(g.hand.length).toBe(n);
    await g.dmgPlayer(1);
    expect(g.hand.length).toBe(n + 1); // 平衡 v2：天策 1（副将刘备无天妒）
  });
  it('曹操·挟令：弃 1 得 2 甲，护甲被打穿反击', async () => {
    const g = setup('H06');
    g.p.armor = 0;
    g.hand.push(card('B001'));
    await g.activate('xieling', g.hand[0]);
    expect(g.p.armor).toBe(2);
    const e = g.en[0];
    const hp = e.hp;
    await g.dmgPlayer(3, e);
    expect(e.hp).toBe(hp - 1);
  });
  it('周瑜·铁索 + 火计：连环传导', async () => {
    const g = setup('H07');
    g.p.ling = 9;
    const t = card('X702');
    const f = card('X701');
    g.hand.push(t, f);
    await g.play(t, null);
    expect(g.en.every((e) => e.chained)).toBe(true);
    const hps = g.en.map((e) => e.hp);
    await g.play(f, g.en[0]);
    expect(g.en[0].hp).toBe(hps[0] - 2); // 纵火 +1
    expect(g.en[1].hp).toBeLessThan(hps[1]);
  });
  it('陆逊·谦逊免咒', async () => {
    const g = setup('H08');
    g.en[0].pat = [['咒']];
    const n = g.hand.length;
    await g.endTurn();
    expect(g.logs.some((l) => l.includes('谦逊'))).toBe(true);
    expect(g.hand.length).toBeGreaterThanOrEqual(n);
  });
});

describe('V1 卡牌', () => {
  it('乐不思蜀持续 2 个敌方回合', async () => {
    const g = setup('H03');
    const lb = card('D001');
    g.hand.push(lb);
    await g.play(lb, g.en[0]);
    expect(g.en[0].judge).toContain(lb);
    await g.endTurn();
    expect(g.en[0].judge).toContain(lb);
    await g.endTurn();
    expect(g.en[0].judge).not.toContain(lb);
  });
  it('闪电：判定 ♠2–9 造成 3 点雷伤并移除', async () => {
    CONFIG.rules.mechanics.judgeSource = 'deck';
    const g = setup('H03');
    const sd = card('D003');
    g.hand.push(sd);
    const e = g.en[0];
    e.hp = e.max = 9;
    await g.play(sd, e);
    g.draw.push(card('B001', 'S', 5));
    await g.endTurn();
    expect(e.hp).toBe(6);
    expect(e.judge).not.toContain(sd);
  });
});

describe('V1 定稿修正（design-v1 第 8 节）', () => {
  it('敌人护甲保留上限 2：第 2 回合起回合开始削到 2，张宝至多叠到 3', async () => {
    const r = mkGame({}, 1, { main: 'H03', sub: 'H04' });
    r.g.battleIdx = 2;
    r.g.startBattle();
    const g = r.g;
    g.en.forEach((e) => (e.pat = [['闪']]));
    const zb = g.en.find((e) => e.id === 'E1E1')!;
    expect(zb.max).toBe(9);
    zb.armor = 6;
    await g.endTurn(); // 第 1 回合：不削，黄天 +1
    expect(zb.armor).toBe(7);
    await g.endTurn(); // 第 2 回合：削到 2，黄天 +1
    expect(zb.armor).toBe(3);
  });
  it('5 个珠联已启用', () => {
    const on = (h: string, n: string) => CONFIG.heroes[h].combos!.find((c) => c.name === n)!.enabled !== false;
    expect(on('H01', '凤仪亭') && on('H02', '连环计') && on('H02', '铜雀') && on('H08', '火烧连营') && on('H08', '夷陵')).toBe(true);
  });
  it('凤仪亭：战斗开始获得酒', () => {
    const g = setup('H01', 'H02');
    expect(g.p.jiu).toBe(1);
  });
});

describe('V1 定稿：刘备仁义、陆逊连营与起始牌组', () => {
  it('仁义每 2 回合 1 次', () => {
    const g = setup('H04');
    g.p.hp = 2;
    g.p.armor = 0;
    g.hand = [card('B001'), card('B001'), card('B001')];
    g.turnEnd();
    expect(g.p.armor).toBe(1);
    g.turn = 2;
    g.effects.reset('turn');
    (g as unknown as { turnEndDone: boolean }).turnEndDone = false;
    g.hand = [card('B001'), card('B001'), card('B001')];
    g.turnEnd();
    expect(g.p.armor).toBe(1);
  });
  it('连营（平衡 v2 恢复原版）：手牌打空时摸 2，每回合限 2 次', async () => {
    const g = setup('H08');
    g.p.ling = 9;
    for (let i = 0; i < 3; i++) {
      g.hand = [];
      await g.checkEmpty();
    }
    expect(g.logs.filter((l) => l.startsWith('连营：')).length).toBe(2);
  });
  it('draw upTo + hand_count_at_most 仍可用（回合结束补牌写法）', () => {
    const ab = CONFIG.heroes.H08.mainSkills.find((a) => a.id === 'lianying')!;
    const old = { ...ab };
    try {
      Object.assign(ab, {
        trigger: { when: 'turn_end' },
        limit: undefined,
        if: [{ type: 'hand_count_at_most', value: 1 }],
        do: [{ do: 'draw', target: 'self', upTo: 2 }],
      });
      const g = setup('H08');
      g.hand = [card('B001')];
      g.turnEnd();
      expect(g.hand.length).toBe(2);
    } finally {
      Object.assign(ab, old);
    }
  });
  it('陆逊起始牌组：B006 ♣9 换成杀，红黑 6/6', () => {
    const d = CONFIG.heroes.H08.starterDeck;
    expect(d.some((c) => c.card === 'B006')).toBe(false);
    expect(d.find((c) => c.suit === 'C' && c.rank === 9)!.card).toBe('B001');
    expect(d.filter((c) => c.suit === 'H' || c.suit === 'D').length).toBe(6);
  });
});
