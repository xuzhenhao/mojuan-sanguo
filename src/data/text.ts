/**
 * UI 文本表取值（#182）：文案集中在 config/text/<ns>.yaml，代码按 'ns.key' 取。
 * 书法收字（scripts/font-glyphs.ts）扫描 config 全部字符串，迁到文本表的文案自动入字表；
 * CI 的 font:check 校验字表同步与缺字。缺 key 时返回 key 本身（测试 text-182 会静态检查所有 t() 调用）。
 */
import { CONFIG } from './config';

export type TextVars = Record<string, string | number>;

export function t(key: string, vars?: TextVars): string {
  const i = key.indexOf('.');
  const s = i > 0 ? CONFIG.text?.[key.slice(0, i)]?.[key.slice(i + 1)] : undefined;
  if (s === undefined) return key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export const hasText = (key: string): boolean => t(key) !== key;
