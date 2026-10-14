# 资源与性能预算（#183）

阈值唯一来源：`config/budget.yaml`。`scripts/size-check.ts` 读取，CI 现有的 `npm run size-check` / `size-check:wechat` 自动生效（未改 ci.yml）。

- **主包**：`package.<target>`（硬限 / 目标；`overTarget` 决定超目标是告警还是失败，微信为失败，#206）。
- **分类**：`categories.<target>`（script / style / font / image），合计 `maxBytes`、单文件 `maxFileBytes`。
- **首屏**：`firstScreen.<target>.files`（glob，`*` 不跨目录）合计 ≤ `maxBytes`；缺文件仅提示（ℹ，不影响结果）。
- **立绘**（OSS，不进包）：`npx tsx scripts/size-check.ts --portraits art/out`，按 `portraits` 规则（首条命中）校验像素与字节。默认大图 ≤512×712 / 120KB，小图 `@s` ≤256×356 / 40KB。
- **帧率**：`perf.targetFps`（60）/ `perf.lowEndFps`（30，按 1% low 判定）。统计函数 `scripts/fps-meter.ts`（`fpsReport`）。低端机基准机型由 QA 真机阶段补（#206/#207 真机部分不在本 PR）。

当前实测（main @ 本分支）：H5 518KB（首屏 414KB），微信 800KB（首屏 800KB）。
