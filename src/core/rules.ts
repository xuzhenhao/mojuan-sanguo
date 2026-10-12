import { AFFIXES, EPIPHANY, RARITY_WEIGHT } from '../data/affixes';
import { CARDS } from '../data/cards';
import { ENEMY_CARDS } from '../data/enemies';
import { RULES } from '../data/heroes';
import type { AffixDef, CardInst, Enemy } from './types';
import type { Rng } from './rng';

/** 纯函数规则集：不依赖 DOM / 平台，可直接单测 */
export const def = (c: CardInst) => CARDS[c.id];
export const isRed = (c: CardInst) => c.suit === 'H' || c.suit === 'D';
export const hasMod = (c: CardInst | undefined, id: string) => !!c && c.mods.includes(id);
export const isShaPlay = (c: CardInst) => !!c.asSha || !!def(c).sha;
export const SUIT_CH = { S: '♠', H: '♥', C: '♣', D: '♦' } as const;
export const RANK_CH = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** PRD 5.4：手牌上限 = max(2, 当前体力) */
export const handLimit = (hp: number) => Math.max(RULES.minHandLimit, hp);

/** PRD 5.7：受伤先扣护甲再扣体力 */
export function applyDamage(t: { hp: number; armor: number }, n: number) {
  const absorbed = Math.min(t.armor, n);
  t.armor -= absorbed;
  t.hp -= n - absorbed;
  return { absorbed, hpLoss: n - absorbed };
}

/** 判定结果（PRD 5.10）：返回该判定是否“生效” */
export const judgeRed = (c: CardInst) => isRed(c);
export const lebuSkips = (c: CardInst) => c.suit !== 'H';

/** 玩家杀的伤害：基础 1 + 牌面加成 + 词条 + 酒/傲骨/义勇 */
export function playerShaDamage(c: CardInst, buffs: { jiu: number; aogu: number; yiyong: number }, bonus = 0, extra = 0) {
  return 1 + bonus + extra + buffs.jiu + buffs.aogu + buffs.yiyong;
}

/** PRD 5.12.2：敌人被杀时自动消耗闪标记抵消（无影不可闪） */
export function enemyDodges(e: Enemy, unblockable: boolean, need = 1) {
  if (e.marks >= need && !unblockable) {
    e.marks -= need;
    return true;
  }
  return false;
}

/** 敌人意图：本回合将出的牌与总伤害（伤害全部来自牌） */
export function enemyIntent(e: Enemy, skipAtk = false) {
  const acts = e.pat[e.step % e.pat.length];
  let dmg = 0;
  const cnt: Record<string, number> = {};
  for (const a of acts) {
    const k = ENEMY_CARDS[a];
    if (k.dmg && !skipAtk) dmg += k.dmg;
    cnt[a] = (cnt[a] || 0) + 1;
  }
  const nm = (a: string) => (a === '杀+' ? '杀[锋锐]' : a === '万箭' ? '万箭齐发' : a === '咒' ? '咒·弃1' : a);
  const ic = (a: string) => ({ 杀: '🗡', '杀+': '🗡', 万箭: '🏹', 闪: '🛡', 咒: '⬇' })[a];
  const txt = Object.entries(cnt)
    .map(([a, n]) => `${ic(a)}${nm(a)}${n > 1 ? '×' + n : ''}`)
    .join(' ');
  const tip =
    acts
      .map((a) =>
        a === '杀'
          ? '杀：1点伤害，可闪'
          : a === '杀+'
            ? '杀[锋锐]：2点伤害，可闪'
            : a === '万箭'
              ? '万箭齐发：1点伤害，不可闪'
              : a === '闪'
                ? '备闪：获得1枚闪标记'
                : '咒：随机弃你1张手牌',
      )
      .join('；') + (e.skill ? '｜' + e.skill : '');
  return { acts, txt, dmg, tip };
}

/** 灵光一闪触发判定（PRD 8.3）。sincePity 为本次计入后的累计未触发张数 */
export function epiphanyRoll(rng: Rng, count: number, sincePity: number, rate: number = EPIPHANY.baseRate) {
  if (count >= EPIPHANY.maxPerBattle) return false;
  if (sincePity > EPIPHANY.pityPlays) return true; // 累计 12 张未触发 → 下一张必触发
  return rng() < rate;
}

export function affixCat(c: CardInst): AffixDef['cat'] | null {
  const d = def(c);
  if (c.asSha) return null;
  if (d.sha) return 'sha';
  if (d.shan) return 'shan';
  if (d.tao) return 'tao';
  if (d.jiu) return 'jiu';
  if (d.slot) return 'equip';
  if (d.trick || d.type.includes('锦囊')) return 'trick';
  return null;
}

/** 候选池；deck 传入时按 maxPerDeck 过滤（如锋锐：同牌组最多 2 张杀带锋锐） */
export function affixPool(c: CardInst, deck: CardInst[] = []): AffixDef[] {
  const cat = affixCat(c);
  if (!cat) return [];
  const d = def(c);
  return AFFIXES.filter(
    (a) =>
      a.cat === cat &&
      !c.mods.includes(a.id) &&
      (!a.only || a.only === c.id) &&
      (!a.slot || a.slot === d.slot) &&
      !(a.mutex === 'fire' && d.fire) &&
      !(a.maxPerDeck != null && deck.filter((x) => x.mods.includes(a.id)).length >= a.maxPerDeck),
  );
}

/** 按稀有度加权不放回抽 3 */
export function pick3(rng: Rng, pool: AffixDef[]): AffixDef[] {
  const out: AffixDef[] = [];
  const p = pool.slice();
  while (out.length < 3 && p.length) {
    const tot = p.reduce((s, a) => s + RARITY_WEIGHT[a.r], 0);
    let x = rng() * tot;
    let i = 0;
    for (; i < p.length; i++) {
      x -= RARITY_WEIGHT[p[i].r];
      if (x <= 0) break;
    }
    out.push(p.splice(Math.min(i, p.length - 1), 1)[0]);
  }
  return out;
}

/** PRD 8.6：最多 2 条，满则替换最早一条 */
export function addAffix(c: CardInst, id: string) {
  if (c.mods.length >= 2) c.mods.shift();
  c.mods.push(id);
}
