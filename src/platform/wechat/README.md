# 微信小游戏适配层（#204）

实现 `Platform`：画布 / 触摸 / 生命周期 / systemInfo（安全区 + 胶囊）/ 存储 / launchQuery。
与 H5 共用 `game/boot.ts`；**不引入 weapp-adapter**；**不采集 openid 或用户信息**。

| 文件                     | 职责                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `entry.ts`               | 构建入口：`createWechatPlatform(wx)` → `bootGame`                       |
| `platform.ts`            | 画布、触摸→TouchPoint、onShow/onHide、raf、now、systemInfo、launchQuery |
| `storage.ts`             | `wx.*StorageSync`，>512KB 报警，写失败保留旧档                          |
| `fonts.ts`               | `wx.loadFont`（#205）                                                   |
| `telemetry.ts`           | 实时日志 transport（#208，`getRealtimeLogManager`，剥 PII）             |
| `audio.ts` / `loader.ts` | M2 空实现                                                               |
| `start.ts`               | W4 黑屏占位（构建冒烟仍可测）                                           |
| `wx-api.ts`              | 注入用的 wx 子集类型                                                    |

存档键与格式沿用 `core/run/save.ts`（`mojuan.run.v1` / `mojuan.runstate.v1`）与 `mojuan.prefs.v1`。
