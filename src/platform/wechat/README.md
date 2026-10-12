# 微信小游戏适配层（预留）

核心战斗逻辑位于 `src/core/`，为纯 TypeScript、零 DOM 依赖。接入微信小游戏时：

1. 在此目录实现 `BattleIO`（见 `src/core/battle.ts`）：用 `wx.createCanvas()` 绘制战场、手牌与弹层，`respond()`/`epiphany()` 返回 Promise。
2. 入口 `game.js` 中 `new Game(seeded(seed), wechatIO, settings).startBattle()`。
3. 数据表（`src/data/`）与规则（`src/core/rules.ts`）直接复用。
