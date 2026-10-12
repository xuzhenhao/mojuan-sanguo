/**
 * 点将页（P1，issue #43）的状态模型：纯逻辑，不依赖渲染，便于测试。
 * 规则来源：PRD 4.5 / 7.1 / 7.4，flow.md §3.2。
 * - 主副不能同一人：点已是主将（或副将）的武将，会把他移出对应槽位。
 * - 点空的网格武将：主将空则补主将，否则补（或替换）副将。
 * - 点槽位：清空该槽；⇄ 主副都有人时才可用。
 */
import { CONFIG } from '../../data/config';
import { HEROES, ROSTER } from '../../data/heroes';
import type { HeroDef } from '../../core/types';

export interface ComboInfo {
  name: string;
  desc: string;
}

export interface SelectState {
  main: string | null;
  sub: string | null;
}

export type Slot = 'main' | 'sub';

/** 开局名单（不含 H09 关羽，roster:false） */
export function roster(): HeroDef[] {
  return ROSTER.map((id) => HEROES[id]);
}

export function pickHero(s: SelectState, id: string): SelectState {
  if (!ROSTER.includes(id)) throw new Error(`武将 ${id} 不在开局名单`);
  if (s.main === id) return { ...s, main: null };
  if (s.sub === id) return { ...s, sub: null };
  if (!s.main) return { ...s, main: id };
  return { ...s, sub: id };
}

export function clearSlot(s: SelectState, slot: Slot): SelectState {
  return { ...s, [slot]: null };
}

export function canSwap(s: SelectState) {
  return !!s.main && !!s.sub;
}
export function swap(s: SelectState): SelectState {
  return canSwap(s) ? { main: s.sub, sub: s.main } : s;
}

export function canStart(s: SelectState): s is { main: string; sub: string } {
  return !!s.main && !!s.sub && s.main !== s.sub;
}

/** 珠联璧合（PRD 7.4）：方向有序（主将 + 副将），停用的（如龙虎会）不提示 */
export function comboOf(main: string | null, sub: string | null): ComboInfo | null {
  if (!main || !sub) return null;
  const c = CONFIG.heroes[main]?.combos?.find((x) => x.partner === sub && x.enabled !== false);
  if (!c) return null;
  return { name: c.name, desc: c.abilities.map((a) => a.desc).join('') };
}

/** 起始牌组张数（主将决定，PRD 7.2） */
export function starterDeckSize(main: string | null) {
  return main ? CONFIG.heroes[main].starterDeck.length : 0;
}

/** URL 预选（截图/测试用）：?main=H03&sub=H04；非法 id 忽略 */
export function initialState(q: Record<string, string | undefined>): SelectState {
  let s: SelectState = { main: null, sub: null };
  if (q.main && ROSTER.includes(q.main)) s = pickHero(s, q.main);
  if (q.sub && ROSTER.includes(q.sub) && q.sub !== s.main) s = { ...s, sub: q.sub };
  return s;
}

/** 主将技（同名条目合并：如陆逊「谦逊」在 config 里拆成两条能力） */
export function mainSkillsOf(h: HeroDef): { name: string; desc: string; indices: number[] }[] {
  const out: { name: string; desc: string; indices: number[] }[] = [];
  h.mainSkills.forEach((s, i) => {
    const prev = out.find((x) => x.name === s.name);
    if (prev) {
      prev.desc += s.desc;
      prev.indices.push(i);
    } else out.push({ name: s.name, desc: s.desc, indices: [i] });
  });
  return out;
}
