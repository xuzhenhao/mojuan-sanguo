/**
 * 局会话：点将「出征」后由 core 创建 run（new Game），供后续页面（地图/战斗…）读取。
 * 只调用 core 的公开构造函数，不修改 core。战斗页（P1a）接管时替换 io。
 */
import { Game, type BattleIO } from '../core/battle';
import { seeded } from '../core/rng';

/** 占位 IO：战斗页接入前不做任何表现 */
export const NULL_IO: BattleIO = {
  log() {},
  update() {},
  sleep: () => Promise.resolve(),
  showJudge: () => Promise.resolve(),
  respond: () => Promise.resolve(null),
  epiphany: () => Promise.resolve(null),
  onBattleEnd() {},
};

export interface RunParams {
  main: string;
  sub: string;
  seed: number;
}

export class RunSession {
  game: Game | null = null;
  params: RunParams | null = null;
  start(p: RunParams, io: BattleIO = NULL_IO): Game {
    if (p.main === p.sub) throw new Error('主副将不能是同一人');
    this.params = p;
    this.game = new Game(seeded(p.seed), io, { autoShan: false, main: p.main, sub: p.sub });
    return this.game;
  }
}
