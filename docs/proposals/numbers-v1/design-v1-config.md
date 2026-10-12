# V1 重构建议：配置化数据表 + 效果 DSL

> 硬性要求：武将、技能、卡牌、敌人、词条、宝物、丹药、天命**全部做成独立配置文件**，调数值只改配置、不改代码；配置要有 schema 校验，并带中文说明，非程序员也能看懂、能改。
> 完整示例和 schema 见 [config-examples/](config-examples/)：赵云、杀、八卦阵、张宝，以及 4 份 JSON Schema 和一个校验脚本（`validate.py` 已跑通，4 个示例全部通过；故意写错的文件能被拦下，例如 `hp: 18` 会报「18 is greater than the maximum of 10」）。

## 1. 目录结构（建议放在仓库 `config/`）
```
config/
  schema/                 # JSON Schema（研发维护）
    effect.schema.json    # 效果 DSL（所有能力共用）
    card.schema.json  hero.schema.json  enemy.schema.json
    affix.schema.json relic.schema.json potion.schema.json ascension.schema.json status.schema.json rules.schema.json
  rules.yaml              # 全局规则：军令 3、摸 3/+2、护甲保留 2、被动配额 2、签筒构成、0 费限 1…
  heroes/  lvbu.yaml diaochan.yaml zhaoyun.yaml liubei.yaml guojia.yaml caocao.yaml zhouyu.yaml luxun.yaml
  cards/
    basic/   sha.yaml huosha.yaml leisha.yaml shan.yaml tao.yaml jiu.yaml
    trick/   wuzhong.yaml shunshou.yaml …（每张锦囊一个文件）
    delay/   lebu.yaml bingliang.yaml shandian.yaml
    equip/   zhuge.yaml … bagua.yaml renwang.yaml …
    faction/ shu/*.yaml wei/*.yaml wu/*.yaml qun/*.yaml
    exclusive/ lvbu/*.yaml …
  enemies/ ch1/*.yaml ch2/*.yaml ch3/*.yaml
  encounters/ ch1.yaml    # 战斗组包：[E101, E101, E102] 及权重
  affixes/ sha.yaml shan.yaml tao.yaml trick.yaml equip.yaml armor.yaml   # 每类词条一个文件
  relics/ *.yaml          # 每件宝物一个文件（或按稀有度分文件）
  potions/ *.yaml
  statuses/ *.yaml        # 状态定义：连环、乐不思蜀、下一张杀 +1、墨影…
  ascension.yaml          # 天命 0–10，每级是对 rules/敌人的 patch
```
- **格式**：策划编辑用 YAML，可以写 `#` 注释；构建时 `scripts/build-config.ts` 把它们合并成一个 `dist/config.json`，供小游戏运行时加载。微信小游戏包体里不放 YAML 解析器。
- **校验**：`npm run config:check` = JSON Schema 校验 + 业务校验（引用的 id 是否存在、起始牌组红色是否 50%、单回合意图 ≤3 张、珠联开场护甲 ≤3、0 费摸牌牌必须有 `limit`）。CI 必跑。
- **编辑体验**：每个文件第一行写 `# yaml-language-server: $schema=...`，VS Code 装 YAML 插件后有自动补全，中文 `description` 会作为悬浮提示显示。
- **坑**：YAML 1.1 会把 `on`、`yes`、`no` 解析成布尔值，所以触发时机的键名用 `when`。示例里已经踩过一次，schema 也已改好。

## 2. 效果 DSL
**一个能力 = 触发时机（when）+ 限次（limit）+ 条件（if，需全部满足）+ 效果原子（do，按顺序执行）**，外加 `desc`（玩家可见文本）、`note`（策划备注）、`value`（价值估算）。

### 2.1 触发时机 `trigger.when`
| 值 | 含义 | 使用例 |
|---|---|---|
| static | 锁定改规则（常驻） | 龙胆、遗计（手牌上限 +2）、无俦 |
| play / equip | 打出 / 装备时 | 所有卡牌；坚固、化境 |
| battle_start | 战斗开始 | 珠联开场护甲、金鳞甲片、铁索环 |
| turn_start / turn_end | 玩家回合开始 / 结束 | 月隐、仁义、挟势、羽扇纶巾 |
| enemy_turn_start / enemy_turn_end | 敌方回合开始 / 结束 | 墨影、黄天庇佑、闪电判定 |
| targeted_by_sha | 成为杀的目标 | 八卦阵、护主、仁王盾、藤甲、的卢 |
| sha_resolved | 杀结算完（含被闪） | 青龙偃月刀、贯石斧 |
| deal_damage / damaged | 造成伤害后 / 受到伤害后 | 骁悍、招贤；天策、奸雄、绝影 |
| kill / heal / hand_empty / dying | 击杀 / 回复 / 手牌打空 / 濒死 | 戟势、追击；结义；连营；七星灯、平安符 |
| judge_shown | 判定签亮出后（可以改判） | 改签类、鬼才式技能 |
| card_converted | 通过转化技使用了牌 | 冲阵、白马 |
| active | 主动技（玩家点按钮发动） | 离间、挟令 |

`trigger.who: main_hero` 用于副将技（监听主将的事件）；`any_enemy` 用于宝物监听敌人事件。

### 2.2 限次 `limit`
`per: turn | enemy_turn | battle | run`，`times: N`，`everyNTurns: N`（如「每 2 回合」），**`passiveQuota: true` 表示计入被动免伤配额**（机制 M2，引擎统一计数，上限在 `rules.yaml` 的 `passiveQuotaPerEnemyTurn: 2`，天命 8 改为 1）。

### 2.3 条件原子 `if[]`
`hp_full`、`hp_at_least`、`hp_lost`、`hand_less_than_hp`、`hand_count_at_least`、`sha_index_in_turn_at_least`（虓烈：本回合第 2 张起）、`target_has_status`（连环、乐不思蜀）、`target_armor_zero`（破军）、`partner_is` / `partner_faction_is`（珠联、护驾令）、`has_back_row_ally`、`ling_left_at_least`（挟势、羽扇）、`chapter_is`（黄巾符）。每个条件都可以加 `not: true` 取反。

### 2.4 效果原子 `do[]`
| 原子 | 主要参数 | 覆盖的设计（举例） |
|---|---|---|
| damage | target, amount, element, asSha, undodgeable | 杀、火攻、南蛮、万箭、破军、远交近攻、离间（转打友军）、反震 |
| lose_hp | target, amount | 烈志、焚城、崩坏险（体力上限用 modify） |
| heal / armor / remove_armor | target, amount | 桃、桃园、仁德令；以逸待劳、固守、骁悍；过河拆桥、寒冰剑、破甲 |
| draw / discard / gain_ling | amount, filter | 无中、冲阵、天策；恃勇、制衡式技能；虎符、天启、提神剂 |
| negate_sha | target: current_sha | 闪、八卦阵、护主、仁王盾、的卢、草船借箭符 |
| judge | success{color/suit/rankRange/not}, then[], else[] | 八卦阵、护主、乐不思蜀（not ♥）、兵粮（not ♣）、闪电（♠ 2–9）、乱世符（黑/红分支） |
| apply_status | target, status, duration | 连环、乐不思蜀、下一张杀 +1（酒/义勇/傲骨）、离魂、挑衅 |
| modify | stat, amount, scope | 锋锐（sha_damage +1）、轻招（sha_cost −1）、遗计（hand_limit +2）、英发（draw_per_turn +1）、无俦（flash_marks_to_dodge = 2） |
| convert | from{filter}, as | 龙胆、倾国（黑色当闪）、丈八蛇矛、朱雀羽扇、奇袭 |
| redirect_sha | target | 离间、挟天子、借刀杀人 |
| remove_flash_mark / add_enemy_acts / summon / chain / reveal_intent | — | 顺手牵羊、雷杀；墨影、挑衅；波才召唤；铁索连舟；知己知彼、诸葛灯 |

**覆盖检查**：design-v1-content.md 中全部卡牌、技能、珠联、词条、宝物、丹药都能用以上 15 种时机、13 种条件、19 种原子表达。需要一点组合的有三个：决斗写成 `redirect_sha` + `judge` 的循环，交给专用原子 `duel`（建议作为第 20 种原子单独实现）；五谷丰登用 `draw` + 选择 UI，交给专用原子 `pick_from_reveal`；闪电「移给下一名」在单挑里可以省略。**这 2 个专用原子以外，不需要写任何技能专属代码。**

## 3. 引擎重写建议（src/core）
1. **事件总线**：`emit(event, ctx)` → 遍历「装备区 + 主将技 + 副将技 + 珠联 + 宝物 + 状态 + 敌人能力」中 `trigger.when` 匹配的能力 → 检查 limit 和 if → 依次执行 do。执行顺序：先锁定技，再被动，再玩家选择。
2. **原子解释器**：`atoms/damage.ts`、`atoms/judge.ts`……每个原子一个纯函数 `(state, params, ctx) => state`，单元测试逐个覆盖。
3. **判定签筒**（M1）：`state.judgeDeck`，52 张标准牌，构成由 `rules.yaml: judgeDeck` 配置；宝物「改签符」通过 `modify judgeDeck` 往里加牌。
4. **配额计数器**（M2）：`state.passiveQuotaUsed`，在 `enemy_turn_start` 时清零；判定前先检查 `passiveQuota` 是否还有剩余。
5. **0 费限 1**（M4）：校验脚本强制 0 费摸牌牌带 `limit`，引擎再兜底一层。
6. **自动对局工具**直接读同一份 `dist/config.json`。平衡流程变成「改 yaml → `npm run autoplay -- --hero 吕布 --sub 貂蝉 --n 400`」，策划可以自助跑模拟。
7. **迁移顺序**：① 写 schema 和 build 脚本，把现有 `src/data/*.ts` 原样导出成 yaml（数值不变，回归测试对齐 compare-pr7 的基线）；② 引擎改成事件总线 + 原子；③ 套用 V1 数值；④ 补齐 8 名武将，跑 56 个组合的平衡表。

## 4. 其余 schema（字段要点，正式实现时照 card/hero/enemy 的格式补写）
- **affix**：id、name、rarity、appliesTo（tag 筛选）、mutex、desc、value、abilities[]
- **relic**：id、name、rarity（N/R/E/L/Boss/商店/事件）、desc、value、abilities[]、unique
- **potion**：id、name、price、desc、abilities[]（when 固定为 active）
- **status**：id、name、icon、stack（叠加或刷新）、duration、abilities[]
- **ascension**：level、desc、patches[]：`{ path: "rules.passiveQuotaPerEnemyTurn", set: 1 }` 或 `{ path: "enemies[tier=小怪].hp", add: 1 }`
- **rules**：lingPerTurn、drawPerTurn、firstTurnBonus、armorKeep、passiveQuotaPerEnemyTurn、judgeDeck、zeroCostLimit、handLimitFormula
