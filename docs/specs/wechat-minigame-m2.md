# 《墨卷三国》M2「微信小游戏适配」架构方案（v1 · 已批准）

> 作者：研发组长 ｜ 基线：origin/main@6bde277（2026-10-13）｜ 约束：一套代码、最少工作量；H5 只做开发/调试，最终目标是微信小游戏。
> 状态：2026-10-13 用户批准；§5 为已记录的决定。Issue：W1–W9 = #200–#208（里程碑 M2）。
> 结论先行：**架构早已按双端设计（engine-design §4.1/§4.10），业务/引擎层几乎不碰浏览器 API**。M2 主要工作是：实现 `src/platform/wechat/`、加 `--mode wechat` 构建、字体与包体按小游戏规则落地、补齐 3 处小泄漏和 CI 守卫。拆为 9 个小 issue（W1–W9），约 2–3 周（单人）。

## 1. 现状审计：浏览器 / DOM 依赖

统计范围 `src/**/*.ts`（不含 tests）。`src/platform/types.ts` 已定义完整 `Platform` 接口（systemInfo/画布/离屏/触摸/前后台/resize/raf/now/launchQuery/audio/storage/ads/share/loader/reportError），`wechat/index.ts` 目前只抛错。

| 依赖类别                                     | 命中（文件/次）    | 位置                                                                                                                                                          | 判定                                                                 |
| -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `document.`                                  | 5 / 17             | platform/web/{platform,entry,brush-font,debug/main}.ts；**game/scenes/battle/hpview.ts:76-77**（`refitAfterBrush(fonts: FontFaceSet)`，仅类型，调用在 entry） | 基本已隔离，hpview 改为接收 `{load():Promise}` 抽象                  |
| `window.` / `addEventListener`               | 2 / 8；2 / 11      | 仅 platform/web/platform.ts、debug/main.ts                                                                                                                    | ✅ 已隔离                                                            |
| `createElement`（canvas 创建）               | 1 / 4              | platform/web/platform.ts                                                                                                                                      | ✅ 走 `mainCanvas/createOffscreen`                                   |
| `getContext`                                 | 6 / 9              | engine/{compositor,surfaces,types}.ts、game/scenes/p4-kit.ts、game/map/scene.ts                                                                               | ✅ 用 `Canvas2DLike` 抽象，wx canvas 兼容                            |
| `requestAnimationFrame` / `devicePixelRatio` | 1 / 2；1 / 1       | platform/web/platform.ts                                                                                                                                      | ✅                                                                   |
| 输入事件 pointer/touch/mouse                 | 1 / 3              | platform/web/platform.ts（映射为 `TouchHandlers`）                                                                                                            | ✅ 引擎只认 TouchPoint                                               |
| `localStorage`                               | 3 / 8              | platform/web/platform.ts；**core/run/save.ts:86**（默认 fallback 到 globalThis.localStorage，已有注入口）；game/result/store.ts（已走 Platform.storage）      | 需在 wx 入口注入，删除默认 fallback                                  |
| 存档键                                       | —                  | `mojuan.prefs.v1`（game/prefs/store.ts，经 StorageAdapter）、run save（core/run/save.ts）                                                                     | 键名两端一致，可直接沿用                                             |
| `fetch(` / `new Image`                       | 0；1 / 2           | game/map/scene.ts 实为离屏烘焙，不加载图片                                                                                                                    | ✅ 当前无网络/图片加载                                               |
| FontFace / document.fonts                    | 8 / 16             | 真正调用只在 platform/web/brush-font.ts；其余为注释或 `"Brush"` 字族字符串                                                                                    | 字体加载已集中，需 wx 版                                             |
| Audio                                        | 仅接口（types.ts） | 暂无实现，游戏当前无声                                                                                                                                        | wx 用 InnerAudioContext 池                                           |
| `performance.now`                            | 2 / 4              | **game/scenes/battle/scene.ts:788/1015/1258**（`deps.now ?? performance.now()` fallback）                                                                     | 小游戏有 `performance`（wx.getPerformance），改为必走 `platform.now` |
| URL 参数 / location                          | 3 / 8              | platform/web/{platform,entry}.ts、debug/main.ts                                                                                                               | ✅ wx 用 `wx.getLaunchOptionsSync().query`                           |
| `import.meta`                                | 6 / 15             | entry.ts(7)、engine/hit.ts(3)、p4-register.ts(2)、battle/scene.ts、hpview.ts、debug                                                                           | 全是 `import.meta.env.DEV`，Vite 构建期替换，wx 构建同样可用         |
| 资源 import                                  | 2                  | entry.ts:37-38 `wenkai-*.woff2?url`；data/config.ts 引 generated JSON                                                                                         | `?url` 需 wx 版改为包内路径；JSON 内联进 bundle 无问题               |
| CSS                                          | 2 文件 514 行      | platform/web/style.css(24)、debug/style.css(490)                                                                                                              | 仅 H5/调试，不进 wx                                                  |
| `resize` / innerWidth                        | 3 / 10             | engine/engine.ts(onResize 回调)、platform/web                                                                                                                 | ✅ wx 端竖屏锁定，onResize 可空实现                                  |

**当前包体**：`npm run build` → JS 332KB（gzip 116KB）+ wenkai-core 66.6KB + wenkai-ext 107.2KB ≈ **0.5MB**，远低于 4MB 主包。`public/assets/atlases/ui_sharp.png`（286KB）目前未被运行时引用。

**结论**：真正需要改的业务/引擎代码只有 3 处（save.ts 默认存储、battle/scene.ts 的 performance.now、hpview.ts 的 FontFaceSet 类型）。其余工作都在 `src/platform/wechat/` 和构建脚本里。

## 2. 微信小游戏约束调研（2026-10）

| 项              | 约束 / 做法                                                                                                                                                                                                         | 来源                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 包体            | 主包 ≤4MB，总包（主+分包）≤30MB，普通分包不限，独立分包 ≤4MB；`wx.loadSubpackage` / `wx.preDownloadSubpackage`                                                                                                      | [分包加载](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage)、[代码包](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.html)                     |
| 画布            | 首个 `wx.createCanvas()` 为上屏画布，之后为离屏；无 DOM                                                                                                                                                             | [wx.createCanvas](https://developers.weixin.qq.com/minigame/dev/api/render/canvas/wx.createCanvas.html)                                                                                                                 |
| weapp-adapter   | 官方适配器模拟 window/document，供引擎用；**我们已有 Platform 层，不引入**，减小包体、避免隐式依赖                                                                                                                  | engine-design §4.1                                                                                                                                                                                                      |
| 存储            | `wx.setStorageSync` 单 key ≤1MB、总量 ≤10MB；同步 API 与现有 `StorageAdapter`（同步）完全匹配                                                                                                                       | [wx.setStorageSync](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorageSync.html)                                                                                                                   |
| 字体            | `wx.loadFont(path)` 支持本地/代码包路径，返回 family 或 null；不支持 URL，远程需先 `wx.downloadFile`；**格式支持以 ttf 为稳妥，woff2 需真机验证**；iOS 18 不支持微信系统字体                                        | [wx.loadFont](https://developers.weixin.qq.com/minigame/dev/api/render/font/wx.loadFont.html)、[微信系统字体](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/unity-webgl-transform/Design/WXFont.html) |
| 远程资源        | `wx.downloadFile` 缓存到 `wx.env.USER_DATA_PATH`（用户目录 200MB）；CDN 域名需在 MP 后台配 downloadFile 合法域名                                                                                                    | [文件系统](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.html)                                                                                                                           |
| 触摸            | `wx.onTouchStart/Move/End/Cancel`，返回 touches/changedTouches（逻辑像素）→ 直接映射 TouchPoint                                                                                                                     | [wx.onTouchStart](https://developers.weixin.qq.com/minigame/dev/api/device/touch/wx.onTouchStart.html)                                                                                                                  |
| 性能分档        | `wx.getDeviceBenchmarkInfo` 的 benchmarkLevel；`ctx.filter` 不保证可用（已决定预烘焙）                                                                                                                              | [getDeviceBenchmarkInfo](https://developers.weixin.qq.com/minigame/dev/api/base/system/wx.getDeviceBenchmarkInfo.html)                                                                                                  |
| 发布流程        | 小游戏必须完成**版本审核 + 小程序备案**；企业主体需微信认证；IAA（无虚拟支付）预计 13–37 个工作日                                                                                                                   | [接入指南](https://developers.weixin.qq.com/minigame/introduction/guide)                                                                                                                                                |
| 版号 / 游戏备案 | 有版号走“情况一”；**无版号且不开虚拟支付走“情况二”（小游戏备案）**；备案后不可改名称/主体                                                                                                                           | [小游戏备案](https://developers.weixin.qq.com/minigame/introduction/guide/nrjs.html)、[前置审批](https://developers.weixin.qq.com/minigame/product/record/record_pre_approval.html)                                     |
| 隐私            | 处理个人信息需在 MP 配《用户隐私保护指引》并弹窗授权；不处理任何信息也要“声明未处理”，否则相关 API 报 1025/1026                                                                                                     | [隐私合规指南](https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html)                                                                                                                               |
| 构建工具        | 无官方 Vite 插件；社区方案（如 weapp-vite 面向小程序、Cocos/Laya 自带导出）不适合纯 Canvas 自研。**采用 Vite library 模式输出单文件 IIFE/CJS + 脚本生成 game.json/project.config.json**（engine-design §4.10 已定） | engine-design §4.10                                                                                                                                                                                                     |

## 3. 设计

### 3.1 平台层（已有接口，补 wx 实现）

```
src/platform/
  types.ts            Platform 接口（已存在，补 fonts / telemetry transport 两项）
  web/                已实现（H5 + 调试）
  wechat/
    entry.ts          wx 入口：createWechatPlatform() → 与 web/entry 共用 bootGame(platform)
    platform.ts       canvas/离屏、触摸、onShow/onHide、raf、now、launchQuery、systemInfo(safeArea+胶囊)
    storage.ts        wx.get/set/removeStorageSync，try/catch + 超限上报
    fonts.ts          wx.loadFont(包内路径) → 'Brush'；失败回退并上报
    audio.ts          InnerAudioContext 池（暂无音频资源，先空实现）
    telemetry.ts      transport：先 wx 实时日志 wx.getRealtimeLogManager，后接 We 分析
    loader.ts         wx.loadSubpackage
```

- **新增接口**：`fonts.load(kind: 'core'|'ext'): Promise<void>`（把 brush-font.ts 的 FontFace 逻辑收进 web 实现）；`telemetry.send(batch)`（#181 的 `telemetry.ts` 只负责缓冲与字段，传输交给平台）。
- **入口复用**：把 web/entry.ts 中与 DOM 无关的启动（engine/router/scene 注册）抽到 `src/game/boot.ts`，两端 entry 只做平台创建 + 字体 + 调 boot。这是唯一稍大的重构（M）。
- **守卫**：ESLint `no-restricted-globals`（window/document/localStorage/performance/wx）作用于 `src/{core,engine,game,data}`；wx 产物 grep 不得含 `document.`/`window.`。

### 3.2 构建目标

- `vite build --mode wechat`：`build.lib` 入口 `src/platform/wechat/entry.ts`，format `cjs`（或 iife），`target: es2017`，关 modulePreload/CSS，`define.__PLATFORM__='wechat'`；产物 `dist-wechat/game.js`。
- `scripts/build-wechat.ts`：生成 `game.json`（`deviceOrientation: portrait`、subpackages）、`project.config.json`（appid 走环境变量，默认 touristappid）、拷贝字体到包内。
- CI 增加 `build:wechat` + `size-check --target wechat`（主包 ≤2.5MB 工程目标/4MB 硬限）。上传/预览用官方 `miniprogram-ci`（需用户提供上传密钥，放 CI secret）。
- debug 面板（#184）只进 H5 debug 构建，wx 构建按 `import.meta.env.DEV` 摇树。

### 3.3 资源与字体

- 当前全部资源 ≈0.5MB，**M2 不做分包和 CDN**，全部进主包；分包/CDN 机制留到立绘等美术资源上量后（#183 预算触发线：主包 >2.5MB）。
- 字体：wenkai core/ext 子集照用（#182 的收字流程不变），wx 构建时额外输出 **ttf 子集**（fonttools 一行），`wx.loadFont` 加载 ttf；core 同步加载后才放帧（沿用 `holdFramesUntil`），ext 后台加载。若真机验证 woff2 可用则只发 woff2。
- 胶囊禁区：systemInfo.capsule 用 `wx.getMenuButtonBoundingClientRect()`，布局已有 `capsule-left` 锚点。

### 3.4 存档兼容

- 键名、JSON 格式、`version`/configVersion 校验与迁移完全复用（core/run/save.ts）。H5 与 wx 存档不互通（不同存储），无需跨端迁移。
- 加 `estimateBytes` 守卫：单 key >512KB 报警（1MB 硬限），超限写失败时提示且不丢旧档。

### 3.5 #180–#185 与 M2 的关系

| issue                 | 判定                          | 理由                                                         |
| --------------------- | ----------------------------- | ------------------------------------------------------------ |
| #180 种子重放         | **待定**                      | 与平台无关；wx 无 URL，launchQuery 已覆盖，后做不返工        |
| #181 埋点             | **M2（只做 transport 部分）** | 上线需要数据；字段扩展可后续                                 |
| #182 文本表 + 字表 CI | **M2（字表 CI 部分）**        | 字体子集直接决定 wx 包体与缺字；文本表全量迁移可待定         |
| #183 性能/资源预算    | **M2**                        | 低端真机帧率 + 包体门槛是上线前提                            |
| #184 调试面板         | **待定**                      | 已有 H5 debug 构建可用；需确认不进 wx 包即可（并入 W8 验收） |
| #185 功能开关         | **待定**                      | 现有 rules.yaml `hidden` 已满足 M1 需要                      |

## 4. Issue 拆分（按顺序）

| #         | 标题                                                            | 规模 | 验收标准                                                                                                                                                                                  |
| --------- | --------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 (#200) | 平台泄漏清理 + ESLint 守卫                                      | S    | save.ts 无默认 localStorage；battle/scene.ts 无 performance.now；hpview 不依赖 FontFaceSet；core/engine/game/data 引用 window/document/localStorage/performance/wx 时 lint 失败；测试全绿 |
| W2 (#201) | 抽出 `game/boot.ts`，web/entry 只剩平台相关                     | M    | H5 行为无变化（冒烟 + viewport-check 通过）；boot 不 import 任何 web 模块                                                                                                                 |
| W3 (#202) | Platform 补 `fonts`、`telemetry` 接口，web 实现迁移             | S    | brush-font 逻辑在 web/fonts；telemetry.ts 经 transport 发送；单测覆盖                                                                                                                     |
| W4 (#203) | `--mode wechat` 构建 + build-wechat 脚本                        | M    | 产出 dist-wechat（game.js/game.json/project.config.json），开发者工具可打开到黑屏不报错；产物 grep 无 document/window；CI 跑 build:wechat                                                 |
| W5 (#204) | wechat 平台实现：画布/触摸/生命周期/systemInfo/存储/launchQuery | M    | 开发者工具中从点将打到第 1 章结算；切后台再回来不丢状态；杀进程后可继续游戏；安全区与胶囊不遮挡按钮                                                                                       |
| W6 (#205) | wechat 字体：ttf 子集产出 + wx.loadFont                         | S    | 真机 iOS/Android 书法字正确、无系统楷体回退；core 加载失败时有降级与上报                                                                                                                  |
| W7 (#206) | 包体/性能门槛（对应 #183）                                      | M    | size-check 覆盖 wechat，主包 >2.5MB CI 失败；低端安卓真机（骁龙 680 档）战斗 ≥30fps、目标 60；首屏可交互 ≤3s                                                                              |
| W8 (#207) | 真机冒烟与发布准备：miniprogram-ci 预览、隐私指引声明、体验版   | S    | CI 可出体验版二维码；MP 后台隐私指引已配置（声明处理/未处理）；真机回归清单通过                                                                                                           |
| W9 (#208) | 遥测 wx transport（#181 子集）                                  | S    | run_start/run_end/run_abandon 在 wx 实时日志中可查                                                                                                                                        |
| (后)      | 分包/CDN 资源加载、音频、广告/分享                              | —    | 待定，资源上量或产品需要时再开                                                                                                                                                            |

预计：S×5 + M×4 ≈ 2–3 周单人；W1/W3 可与 W2 并行，W5 依赖 W2+W4。

## 5. 风险与待决事项

**风险**

1. `wx.loadFont` 对 woff2 的支持未确认 → 已备 ttf 方案（体积约为 woff2 的 2 倍，仍 <0.5MB）。
2. 低端安卓 Canvas 2D 性能：3 块离屏合成 + 发光描边在 wx 上可能掉帧 → W7 真机测，必要时按 benchmarkLevel 降分辨率倍率。
3. WebGL 叠加层在 wx 上需第二块 canvas（非上屏）→ M2 默认关闭，仅 2D。
4. 审核与备案周期 13–37 个工作日，且名称/主体提交后不可改 → 需提前启动。
5. 小游戏运行时 JS 特性差异（如 iOS 旧基础库）→ target es2017，设最低基础库版本。

**待验证（未确认）**

- `wx.loadFont` 是否支持 woff2：W6 真机验证；未确认前按 ttf 方案准备。
- 存储限额（单 key 1MB / 总量 10MB）以官方文档为准，W5 真机确认；代码按 512KB 单 key 报警设计。

**已决定（2026-10-13 用户批准）**

1. **AppID 与主体**：个人主体，AppID `wx3dd635e3cc359d30`。上传私钥存为仓库 Actions secret `WX_UPLOAD_PRIVATE_KEY`，CI 上传必须使用该名称；IP 白名单校验已关闭。（个人主体不能开广告/虚拟支付，与第 6 条一致。）
2. **发布路线**：小游戏备案（情况二），不开虚拟支付，不申请版号。正式名称待定（备案提交后不可改，提交前须确认）。
3. **隐私**：暂不采集 openid 或任何用户信息，隐私指引声明「未处理」。
4. **遥测**：用微信内置工具（实时日志 / We 分析），不自建服务器。
5. **真机设备**：待定，W7/W8 开工前确定。
6. **范围**：M2 不做分包/CDN、音频、广告、分享；#180/#184/#185 移到里程碑待定，#181/#182/#183 留在 M2。
7. **H5**：继续公开发布。
