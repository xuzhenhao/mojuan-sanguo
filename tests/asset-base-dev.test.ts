import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/data/config';
import { assetBase, pickAssetBase } from '../src/game/portrait';

const a = CONFIG.rules.assets;

describe('资源根目录按构建模式选用（dev 根地址）', () => {
  it('正式构建用 baseUrl；VITE_ASSET_LOCAL 在正式构建不生效', () => {
    expect(pickAssetBase(a, { dev: false, local: false })).toBe(a.baseUrl);
    expect(pickAssetBase(a, { dev: false, local: true })).toBe(a.baseUrl);
  });
  it('开发构建默认 devBaseUrl（测试 OSS，https）', () => {
    expect(pickAssetBase(a, { dev: true, local: false })).toBe(a.devBaseUrl);
    expect(a.devBaseUrl).toMatch(/^https:\/\/.+\/$/);
    expect(assetBase()).toBe(a.devBaseUrl); // vitest 跑在 DEV、未设 VITE_ASSET_LOCAL
  });
  it('开发构建 + VITE_ASSET_LOCAL=1 用 localBaseUrl（站内路径）', () => {
    expect(pickAssetBase(a, { dev: true, local: true })).toBe(a.localBaseUrl);
    expect(a.localBaseUrl).toMatch(/^\/.*\/$/);
  });
  it('未配置时为空串（调用方回退占位）', () => {
    expect(pickAssetBase(undefined, { dev: true, local: false })).toBe('');
  });
});
