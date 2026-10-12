/* 配置加载与校验：读取 config/**.yaml → JSON Schema 校验 → 业务校验 → 合并为一个对象（构建期使用，运行时不带 YAML 解析器） */
/* eslint-disable @typescript-eslint/no-explicit-any -- YAML 未经类型化，结构由 JSON Schema 保证 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { IMPLEMENTED as IMPL } from '../src/core/implemented';

export interface Built {
  rules: Record<string, any>;
  cards: Record<string, any>;
  affixes: any[];
  heroes: Record<string, any>;
  enemies: Record<string, any>;
  encounters: Record<string, any>;
  decks: Record<string, any>;
}

const SCHEMA_OF: Record<string, string> = {
  cards: 'card',
  affixes: 'affix',
  heroes: 'hero',
  enemies: 'enemy',
  encounters: 'encounter',
  decks: 'deck',
};
const AFFIX_ORDER = ['sha', 'shan', 'tao', 'jiu', 'trick', 'equip'];

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.yaml') ? [p] : [];
    });
}

export function loadConfig(root: string): { config: Built; errors: string[] } {
  const errors: string[] = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const f of readdirSync(join(root, 'schema'))) ajv.addSchema(JSON.parse(readFileSync(join(root, 'schema', f), 'utf8')));
  const check = (schema: string, data: unknown, file: string) => {
    const v = ajv.getSchema(schema + '.schema.json')!;
    if (!v(data))
      for (const e of v.errors!)
        errors.push(
          `${file}: ${e.instancePath || '/'} ${e.message}${e.params && 'allowedValues' in e.params ? ' ' + JSON.stringify(e.params.allowedValues) : ''}`,
        );
  };
  const read = (file: string) => {
    try {
      return parse(readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${relative(root, file)}: YAML 解析失败 ${(e as Error).message}`);
      return null;
    }
  };

  const config: Built = { rules: {}, cards: {}, affixes: [], heroes: {}, enemies: {}, encounters: {}, decks: {} };
  const rulesFile = join(root, 'rules.yaml');
  config.rules = read(rulesFile) ?? {};
  check('rules', config.rules, 'rules.yaml');

  for (const [dir, schema] of Object.entries(SCHEMA_OF)) {
    let files: string[] = [];
    try {
      files = walk(join(root, dir));
    } catch {
      errors.push(`缺少目录 ${dir}/`);
    }
    for (const f of files) {
      const rel = relative(root, f).split(sep).join('/');
      const d = read(f);
      if (d == null) continue;
      check(schema, d, rel);
      const key = dir === 'encounters' ? `ch${d.chapter}` : d.id;
      const bucket = config[dir as keyof Built] as any;
      if (dir === 'affixes') {
        if (bucket.some((a: any) => a.id === d.id)) errors.push(`${rel}: id 重复 ${d.id}`);
        bucket.push(d);
      } else {
        if (bucket[key]) errors.push(`${rel}: id 重复 ${key}`);
        bucket[key] = d;
      }
    }
  }
  config.affixes.sort((a, b) => AFFIX_ORDER.indexOf(a.category) - AFFIX_ORDER.indexOf(b.category) || (a.id < b.id ? -1 : 1));
  if (!errors.length) errors.push(...businessChecks(config));
  return { config, errors };
}

/** 业务校验：跨文件引用与设计约束 */
export function businessChecks(c: Built): string[] {
  const errs: string[] = [];
  const card = (id: string, where: string) => c.cards[id] || errs.push(`${where}: 引用了不存在的卡牌 ${id}`);
  const affixIds = new Set(c.affixes.map((a) => a.id));
  const deck = c.rules.starterDeck === 'hero' ? null : c.decks[c.rules.starterDeck];
  if (c.rules.starterDeck !== 'hero' && !deck) errs.push(`rules.yaml: starterDeck 引用了不存在的牌组 ${c.rules.starterDeck}`);
  for (const [k, ps] of Object.entries<any>(c.rules.presets ?? {})) {
    for (const h of [ps.main, ps.sub]) if (!c.heroes[h]) errs.push(`rules.yaml: 预设 ${k} 引用了不存在的武将 ${h}`);
    if (ps.deck && !c.decks[ps.deck]) errs.push(`rules.yaml: 预设 ${k} 引用了不存在的牌组 ${ps.deck}`);
  }
  for (const k of ['main', 'sub'] as const) {
    const h = c.rules.defaultHeroes?.[k];
    if (h && (!c.heroes[h] || c.heroes[h].roster === false)) errs.push(`rules.yaml: defaultHeroes.${k} ${h} 不存在或不在开局名单`);
  }
  // 效果原子 / 触发时机 / 条件必须是引擎已实现的
  const abilities: [string, any][] = [];
  for (const h of Object.values(c.heroes)) {
    for (const a of [...h.mainSkills, h.subSkill]) abilities.push([`heroes/${h.id}`, a]);
    for (const cb of h.combos ?? []) if (cb.enabled !== false) for (const a of cb.abilities) abilities.push([`heroes/${h.id}.combos.${cb.name}`, a]);
  }
  for (const x of Object.values(c.cards)) for (const a of x.abilities) abilities.push([`cards/${x.id}`, a]);
  for (const x of c.affixes) for (const a of x.abilities ?? []) abilities.push([`affixes/${x.id}`, a]);
  for (const x of Object.values(c.enemies)) if (x.enabled !== false) for (const a of x.abilities ?? []) abilities.push([`enemies/${x.id}`, a]);
  const walkDo = (where: string, xs: any[]) => {
    for (const d of xs) {
      if (!IMPL.atoms.includes(d.do)) errs.push(`${where}: 效果原子 ${d.do} 引擎尚未实现`);
      if (d.do === 'modify' && !IMPL.stats.includes(d.stat)) errs.push(`${where}: modify.stat ${d.stat} 引擎尚未实现`);
      if (d.do === 'apply_status' && !IMPL.statuses.includes(d.status)) errs.push(`${where}: 状态 ${d.status} 引擎尚未实现`);
      walkDo(where, [...(d.then ?? []), ...(d.else ?? [])]);
    }
  };
  for (const [where, a] of abilities) {
    if (!IMPL.whens.includes(a.trigger.when)) errs.push(`${where}: 触发时机 ${a.trigger.when} 引擎尚未实现`);
    for (const cond of a.if ?? []) if (!IMPL.conds.includes(cond.type)) errs.push(`${where}: 条件 ${cond.type} 引擎尚未实现`);
    walkDo(where, a.do);
  }
  for (const d of Object.values(c.decks)) for (const x of d.cards) card(x.card, `decks/${d.id}`);
  const ratio = c.rules.checks?.starterRedRatio;
  const redRatio = (cards: any[]) => cards.filter((x) => x.suit === 'H' || x.suit === 'D').length / cards.length;
  if (ratio != null) {
    if (deck && Math.abs(redRatio(deck.cards) - ratio) > 1e-9)
      errs.push(`decks/${deck.id}: 红色比例 ${(redRatio(deck.cards) * 100).toFixed(1)}% ≠ ${ratio * 100}%`);
    for (const h of Object.values(c.heroes))
      if (h.roster !== false && h.starterDeck && Math.abs(redRatio(h.starterDeck) - ratio) > 1e-9)
        errs.push(`heroes/${h.id}: 起始牌组红色比例 ${(redRatio(h.starterDeck) * 100).toFixed(1)}% ≠ ${ratio * 100}%`);
  }
  for (const h of Object.values(c.heroes)) {
    for (const x of h.starterDeck ?? []) card(x.card, `heroes/${h.id}.starterDeck`);
    for (const x of h.exclusiveCards ?? []) card(x, `heroes/${h.id}.exclusiveCards`);
    for (const cb of h.combos ?? []) {
      if (!c.heroes[cb.partner]) errs.push(`heroes/${h.id}: 珠联「${cb.name}」的搭档 ${cb.partner} 不存在`);
      const max = c.rules.checks?.comboStartArmorMax;
      const armor = (cb.abilities ?? [])
        .filter((a: any) => a.trigger.when === 'battle_start')
        .flatMap((a: any) => a.do)
        .filter((x: any) => x.do === 'armor')
        .reduce((s: number, x: any) => s + (x.amount ?? 0), 0);
      if (max != null && armor > max) errs.push(`heroes/${h.id}: 珠联「${cb.name}」开场护甲 ${armor} > ${max}`);
    }
  }
  for (const card_ of Object.values(c.cards)) {
    if (card_.exclusiveHero && !c.heroes[card_.exclusiveHero]) errs.push(`cards/${card_.id}: 专属武将 ${card_.exclusiveHero} 不存在`);
    if (c.rules.checks?.zeroCostDrawNeedsLimit && card_.cost === 0) {
      const draws = card_.abilities.some((a: any) => a.trigger.when === 'play' && a.do.some((x: any) => x.do === 'draw') && !a.limit);
      if (draws) errs.push(`cards/${card_.id}: 0 费摸牌牌必须设置 limit（M4）`);
    }
  }
  for (const a of c.affixes) if (a.only) card(a.only, `affixes/${a.id}.only`);
  for (const e of Object.values(c.enemies)) {
    if (e.enabled === false) continue;
    for (const [act, mods] of Object.entries(e.cardMods ?? {}))
      for (const m of mods as string[]) if (!affixIds.has(m)) errs.push(`enemies/${e.id}: cardMods.${act} 引用了不存在的词条 ${m}`);
    const checkIntents = (list: string[][], where: string) =>
      list.forEach((it: string[], i: number) => {
        for (const act of it) {
          const [base, ref] = act.split(':');
          if (base === '召唤' && !c.enemies[ref]) errs.push(`enemies/${e.id}: ${where}意图 ${i + 1} 召唤了不存在的敌人 ${act}`);
          else if (base === '锦囊' && !c.cards[ref]) errs.push(`enemies/${e.id}: ${where}意图 ${i + 1} 的锦囊 ${ref} 不存在`);
          else if (base !== '召唤' && base !== '锦囊' && !c.rules.enemyCards?.[act])
            errs.push(`enemies/${e.id}: ${where}意图 ${i + 1} 的牌「${act}」未在 rules.enemyCards 中定义`);
        }
      });
    checkIntents(e.intents, '');
    (e.phases ?? []).forEach((ph: any, k: number) => {
      checkIntents(ph.intents ?? [], `阶段 ${k + 2} `);
      if (ph.abilities?.length) errs.push(`enemies/${e.id}: 阶段 ${k + 2} 的 abilities 引擎未实装`);
      for (const s of ph.summon ?? [])
        if (!c.enemies[s.enemy] || c.enemies[s.enemy].enabled === false) errs.push(`enemies/${e.id}: 阶段 ${k + 2} 召唤了不存在或停用的敌人 ${s.enemy}`);
    });
  }
  for (const enc of Object.values(c.encounters))
    for (const b of enc.battles)
      for (const id of b.enemies) if (!c.enemies[id]) errs.push(`encounters/ch${enc.chapter}: 战斗「${b.name}」引用了不存在的敌人 ${id}`);
  return errs;
}
