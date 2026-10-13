# 微信小游戏适配层（#204 / #206）

实现 `Platform`：画布 / 触摸 / 生命周期 / systemInfo（安全区 + 胶囊 + 可选 benchmarkLevel）/ 存储 / launchQuery。
与 H5 共用 `game/boot.ts`；**不引入 weapp-adapter**；**不采集 openid 或用户信息**。

| 文件                     | 职责                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `entry.ts`               | 构建入口：读 benchmark → `createWechatPlatform` → `bootGame`            |
| `platform.ts`            | 画布、触摸→TouchPoint、onShow/onHide、raf、now、systemInfo、launchQuery |
| `storage.ts`             | `wx.*StorageSync`，>512KB 报警，写失败保留旧档                          |
| `fonts.ts`               | `wx.loadFont`（#205）                                                   |
| `telemetry.ts`           | 实时日志 transport 占位（#208）                                         |
| `audio.ts` / `loader.ts` | M2 空实现                                                               |
| `start.ts`               | W4 黑屏占位（构建冒烟仍可测）                                           |
| `wx-api.ts`              | 注入用的 wx 子集类型                                                    |

存档键与格式沿用 `core/run/save.ts`（`mojuan.run.v1` / `mojuan.runstate.v1`）与 `mojuan.prefs.v1`。

## #206 包体 / 性能门槛

- **CI 可验**：`npm run build:wechat` 后 `npm run size-check:wechat`——主包（含 #205 书法 ttf）>2.5MB 失败。
- **真机待验（本仓无法代替）**：
  - 低端安卓（骁龙 680 档）战斗 ≥30fps（目标 60）
  - 首屏可交互 ≤3s
- **已接钩子**：`wx.getDeviceBenchmarkInfo` → `renderScaleFromBenchmark`（低档降 maxDpr / 开 lowEnd）；帧率与首屏时延仍须 W7/W8 真机清单确认。
