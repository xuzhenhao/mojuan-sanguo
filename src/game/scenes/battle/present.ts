/**
 * 表现队列（engine-design §4.4 的最小实现）：逻辑侧通过 BattleIO 产出事件（sleep / hurt / enemyHit / update 快照差分 / 判定），
 * 表现侧按队列播放。阻塞步骤（出牌飞行、敌人前冲、判定翻牌）串行；飘字、红闪等非阻塞轨并行。
 * 时长全部除以倍速；`skip()` 让当前队列直接对齐终态。
 */
export interface Step {
  id: string;
  durationMs: number;
  /** 阻塞：后续阻塞步骤等它结束；非阻塞：并行播放 */
  blocking: boolean;
  /** 已经过的时间（ms，已乘倍速） */
  t: number;
  data?: Record<string, unknown>;
  done?: () => void;
}

export class PresentationQueue {
  speed = 1;
  private queue: Step[] = [];
  readonly free: Step[] = [];
  /** 播放过的步骤 id（测试与调试） */
  readonly played: string[] = [];

  /** 入队；返回步骤结束的 Promise */
  push(id: string, durationMs: number, blocking = true, data?: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      const s: Step = { id, durationMs, blocking, t: 0, data, done: resolve };
      if (blocking) this.queue.push(s);
      else this.free.push(s);
      this.played.push(id);
    });
  }
  /** 插到阻塞队列最前（首领登场演出：开战时已排队的步骤等它播完） */
  pushFront(id: string, durationMs: number, data?: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      this.queue.unshift({ id, durationMs, blocking: true, t: 0, data, done: resolve });
      this.played.push(id);
    });
  }
  /** 当前正在播的阻塞步骤 */
  get current(): Step | null {
    return this.queue[0] ?? null;
  }
  /** 所有正在播的步骤（当前阻塞 + 非阻塞） */
  active(): Step[] {
    return this.current ? [this.current, ...this.free] : [...this.free];
  }
  progress(s: Step) {
    return s.durationMs <= 0 ? 1 : Math.min(1, s.t / s.durationMs);
  }
  get busy() {
    return this.queue.length > 0 || this.free.length > 0;
  }
  get blockingBusy() {
    return this.queue.length > 0;
  }

  update(dt: number) {
    const d = dt * this.speed;
    // 本帧开始前已在播的非阻塞步骤；阻塞步骤结束时新排的（如登场后的意图弹出）下一帧才计时
    const free0 = [...this.free];
    let left = d;
    while (this.queue.length && left >= 0) {
      const s = this.queue[0];
      const need = s.durationMs - s.t;
      if (left < need) {
        s.t += left;
        break;
      }
      left -= Math.max(0, need);
      s.t = s.durationMs;
      this.queue.shift();
      s.done?.();
      if (left <= 0) break;
    }
    for (const s of free0) {
      s.t += d;
      if (s.t >= s.durationMs) {
        this.free.splice(this.free.indexOf(s), 1);
        s.done?.();
      }
    }
  }
  /** 跳过：所有可跳过步骤对齐终态 */
  skip() {
    for (const s of this.queue.splice(0)) s.done?.();
  }
  clear() {
    for (const s of [...this.queue.splice(0), ...this.free.splice(0)]) s.done?.();
  }
}

/** core 快照（只读取字段，用于生成表现事件） */
export interface Snapshot {
  hp: number;
  armor: number;
  ling: number;
  hand: number[];
  en: Record<number, { hp: number; armor: number; marks: number; alive: boolean }>;
}

export type PresentEvent =
  | { t: 'player_hp'; delta: number }
  | { t: 'player_armor'; delta: number }
  | { t: 'enemy_hp'; uid: number; delta: number }
  | { t: 'enemy_armor'; uid: number; delta: number }
  | { t: 'enemy_die'; uid: number }
  | { t: 'draw'; uids: number[] }
  | { t: 'ling'; delta: number };

/** 快照差分 → 表现事件（core 目前不产出事件流，P1 迁移前用差分近似） */
export function diff(a: Snapshot, b: Snapshot): PresentEvent[] {
  const out: PresentEvent[] = [];
  if (b.hp !== a.hp) out.push({ t: 'player_hp', delta: b.hp - a.hp });
  if (b.armor !== a.armor) out.push({ t: 'player_armor', delta: b.armor - a.armor });
  if (b.ling !== a.ling) out.push({ t: 'ling', delta: b.ling - a.ling });
  const drawn = b.hand.filter((u) => !a.hand.includes(u));
  if (drawn.length) out.push({ t: 'draw', uids: drawn });
  for (const [k, e] of Object.entries(b.en)) {
    const uid = Number(k);
    const o = a.en[uid];
    if (!o) continue;
    if (e.hp !== o.hp) out.push({ t: 'enemy_hp', uid, delta: e.hp - o.hp });
    if (e.armor !== o.armor) out.push({ t: 'enemy_armor', uid, delta: e.armor - o.armor });
    if (o.alive && !e.alive) out.push({ t: 'enemy_die', uid });
  }
  return out;
}
