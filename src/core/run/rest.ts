/**
 * 营地（PRD 10.6）最小版：疗伤 = 回复 max(healMin, floor(最大体力 × healRatio))，不超过体力上限。
 * 淬炼 / 焚稿三选一待营地页（P4b）实现。
 */
export interface RestConfig {
  healMin: number;
  healRatio: number;
}
export function restHealAmount(maxHp: number, cfg: RestConfig) {
  return Math.max(cfg.healMin, Math.floor(maxHp * cfg.healRatio));
}
/** 返回回复后体力与实际回复量 */
export function applyRestHeal(hp: number, maxHp: number, cfg: RestConfig) {
  const next = Math.min(maxHp, hp + restHealAmount(maxHp, cfg));
  return { hp: next, healed: next - hp };
}
