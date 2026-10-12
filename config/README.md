# 游戏配置（数据驱动）

武将、卡牌、敌人、词条、规则全部放在这里。**调数值只改 YAML，不改代码。**

| 目录 / 文件 | 内容 | Schema |
|---|---|---|
| `rules.yaml` | 全局规则：军令、摸牌、护甲保留、敌人意图牌、灵光一闪、词条权重、业务校验开关 | `schema/rules.schema.json` |
| `heroes/` | 每名武将一个文件：主将技、副将技、珠联璧合 | `hero.schema.json` |
| `cards/<类别>/` | 每张卡牌一个文件（basic / trick / delay / equip / faction / exclusive） | `card.schema.json` |
| `affixes/<类别>/` | 每个词条一个文件 | `affix.schema.json` |
| `enemies/<章>/` | 每个敌人一个文件：血量、意图循环、特技 | `enemy.schema.json` |
| `encounters/` | 每章的战斗组包 | `encounter.schema.json` |
| `decks/` | 开局牌组 | `deck.schema.json` |

技能和卡牌效果统一用效果 DSL（`effect.schema.json`）：**触发时机 when + 限次 limit + 条件 if + 效果原子 do**，说明见数值文档 design-v1-config.md 第 2 节。

## 改完怎么校验
```
npm run config:check   # JSON Schema 校验 + 业务校验（引用存在、意图 ≤3 张、珠联开场护甲上限……）
```
`npm test`、`npm run build`、`npm run dev` 会先自动跑校验，并生成 `src/data/generated/config.json`（运行时只读这个 JSON，包里不带 YAML 解析器）。CI 会跑同样的校验。

VS Code 安装 YAML 插件（Red Hat）后，靠每个文件第一行的 `# yaml-language-server: $schema=...` 就有自动补全和中文悬浮说明。

> 现状（数据驱动重构第 ① 步）：数值与原型完全一致。引擎目前只读取数值和文本，DSL 里的 `abilities` 要到第 ② 步才由引擎执行，参见 issue #12。
