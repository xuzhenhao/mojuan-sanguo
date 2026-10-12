# 墨卷三国 · 战斗原型

水墨风三国 Roguelike 卡牌（微信小游戏，竖屏）的可玩网页战斗原型。

- 🎮 在线试玩（DOM 可玩原型）：<https://xuzhenhao.github.io/mojuan-sanguo/>（加 `?demo=1` 把灵光一闪触发率提高到 50%，加 `?seed=123` 固定随机种子）
- 🧪 Canvas 新版（引擎 + B 金漆屏风页面流程，开发中）：<https://xuzhenhao.github.io/mojuan-sanguo/next/>（`?webgl=0` 关闭 WebGL 水墨叠加层，`?page=map` 直接进入某页）
- 两者由同一次 Pages 部署产出；CI 的 size-check 保证 Canvas 发布包不含 DOM/调试代码。P5（#46）时对调：Canvas 版到根目录，DOM 版移到 `/debug/`
- 📄 策划案：[docs/PRD.md](docs/PRD.md)
- 📝 更新日志 / 设计决策：[docs/CHANGELOG.md](docs/CHANGELOG.md)

## 快速开始

```bash
npm install
npm run dev      # Canvas 新版 http://localhost:5173/mojuan-sanguo/next/
npm run dev:debug   # DOM 可玩版 http://localhost:5173/mojuan-sanguo/debug.html（不进 Canvas 发布包）
npm run build:debug # DOM 版输出到 dist-debug/（Pages 部署到根目录）
npm run size-check  # Canvas 发布包体检查（≤4MB，且不含 DOM/调试代码）
npm test         # vitest 单元测试
npm run lint     # ESLint + Prettier 检查
npm run build    # Canvas 发布包输出到 dist/（Pages 部署到 /next/）
npm run preview  # 预览构建产物
```

需要 Node.js 20+。

## 玩法要点

- 主将关羽（体力 8）+ 副将赵云，珠联「龙虎会」：开场 3 护甲，本场首次杀摸 1。
- 每回合军令 3，摸 3 张（首回合 +2），手牌保留，上限 `max(2, 体力)`。
- **无攻击力数值**：所有伤害来自卡牌，敌我的【杀】都只造成 1 点，除非被「灵光一闪」进化。
- 敌人意图显示将要打出的牌（`杀×2` / `备闪` / `万箭齐发` / `杀[锋锐]`）；敌人出杀时你可在 8 秒内出【闪】。
- 判定：赵云「护主」、八卦阵、乐不思蜀。
- 灵光一闪：8% 触发、每场最多 2 次、连续 12 张未触发必出；词条三选一，每牌最多 2 条。
- 第一章三连战：黄巾前哨 → 流民之乱 → 精英·张宝。

## 目录结构

```
src/
  core/            纯逻辑，零 DOM 依赖（可直接移植到微信小游戏）
    types.ts       类型定义
    rng.ts         可复现随机数（种子）
    rules.ts       纯函数规则：伤害、闪标记、敌人意图、灵光一闪、手牌上限
    battle.ts      战斗状态机 Game + 平台适配接口 BattleIO
  data/            数据表
    cards.ts       卡牌与起始牌组
    heroes.ts      武将、珠联、基础规则数值
    enemies.ts     敌人、敌方出牌定义、战斗编组
    affixes.ts     灵光一闪词条与概率
  platform/
    web/           Web 渲染（DOM + CSS 水墨风）
    wechat/        微信小游戏适配层（预留，见其 README）
tests/             vitest 单元测试
docs/              PRD 与更新日志
```

接入新平台只需实现 `BattleIO`（日志、刷新、判定展示、响应窗口、灵光一闪选择、胜负回调），`core/` 与 `data/` 原样复用。

## 部署

推送到 `main` 后：`CI` 工作流执行 lint + test + build，`Deploy Pages` 工作流构建并发布到 GitHub Pages（Vite `base` 为 `/mojuan-sanguo/`）。
首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
