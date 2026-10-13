import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPLEMENTED } from '../src/core/implemented';

const src = ['battle', 'effects', 'rules'].map((f) => readFileSync(new URL(`../src/core/${f}.ts`, import.meta.url), 'utf8')).join('\n');

describe('IMPLEMENTED 词汇表', () => {
  for (const [k, list] of Object.entries(IMPLEMENTED)) {
    it(`${k}：非空、无重复、均为 snake_case`, () => {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) expect(w).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  }
  for (const k of ['atoms', 'conds', 'statuses', 'whens'] as const) {
    it(`${k}：每个声明已实现的词在 core 源码里都有处理分支`, () => {
      const missing = IMPLEMENTED[k].filter((w) => !new RegExp(`'${w}'|\\b${w}\\s*[(:]`).test(src));
      expect(missing).toEqual([]);
    });
  }
});
