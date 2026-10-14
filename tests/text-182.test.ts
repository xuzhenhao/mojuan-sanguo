/** #182 文本表 + 书法收字 CI 校验 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { t, hasText } from '../src/data/text';
import { noticeText } from '../src/game/run/state';
import { fontCheck, textKeysDefined, textKeysUsed } from '../scripts/font-check';
import { collectGlyphs } from '../scripts/font-glyphs';

const ROOT = resolve(import.meta.dirname, '..');

describe('#182 文本表', () => {
  it('t() 取值、插值、缺 key 返回 key', () => {
    expect(t('notice.migrate_node_rollback')).toBe('存档已更新，已回到上一处');
    expect(t('notice.nope')).toBe('notice.nope');
    expect(hasText('notice.node_restart_other')).toBe(true);
  });
  it('第一批迁移：noticeText 文案来自文本表', () => {
    expect(noticeText('migrate_battle_restart')).toBe(t('notice.migrate_battle_restart'));
    expect(noticeText('node_restart', { type: 'BOSS' } as never)).toBe(t('notice.node_restart_battle'));
    expect(noticeText('node_restart', null)).toBe(t('notice.node_restart_other'));
  });
  it('src 中所有 t() key 都在 config/text 定义', () => {
    const def = textKeysDefined(ROOT);
    const used = [...textKeysUsed(ROOT).keys()];
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((k) => !def.has(k))).toEqual([]);
  });
  it('文本表文案自动进入收字', () => {
    const g = collectGlyphs(ROOT);
    expect(g.get('档')?.some((s) => s.includes('config/text/notice.yaml'))).toBe(true);
  });
});

describe('#182 font:check', () => {
  it('当前仓库通过（字表同步、微信字体无缺字、key 齐全）', () => {
    expect(fontCheck(ROOT).errors).toEqual([]);
  });
});
