import { describe, expect, it } from 'vitest';
import { mkGame } from './helpers';
import { triggerDebugRevive, wantDebugRevive } from '../src/game/scenes/battle/debug-revive';

describe('#151 dev 参数 ?revive=1', () => {
  it('只在 dev + 战斗页生效', () => {
    expect(wantDebugRevive({ page: 'battle', revive: '1' }, true)).toBe(true);
    expect(wantDebugRevive({ page: 'battle', revive: '1' }, false)).toBe(false);
    expect(wantDebugRevive({ page: 'map', revive: '1' }, true)).toBe(false);
  });
  it('触发后弹复活询问', async () => {
    let asked = 0;
    const { g } = mkGame({ revive: async () => (asked++, true) });
    g.startBattle();
    await triggerDebugRevive(g);
    expect(asked).toBe(1);
    expect(g.over).toBe(false);
  });
  it('entry 用 import.meta.env.DEV 门控', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/platform/web/entry.ts', 'utf8')).toContain('wantDebugRevive(query, import.meta.env.DEV)');
  });
});
