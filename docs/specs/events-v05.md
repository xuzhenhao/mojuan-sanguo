# 奇遇事件 yaml 规格（H5 首版 · 第 1 章 · 对应 #91）

来源：PRD 第 13 章（V0.5.6：H5 8 事件 + 四点结案）、10.2、12.2。数值已与 PRD 对齐并由数值策划核对；schema 由研发组长评审。

## 1. 文件组织
- 一个事件一个文件：`config/events/ch1/V01-taoyuan.yaml`，和 enemies 一样。
- 新增 `config/schema/event.schema.json`；选项的条件（requires）和结果（outcomes）尽量复用 `effect.schema.json` 里已有的指令，不够再加。

## 2. 字段
```yaml
id: V01                 # 唯一
title: 路边桃园
art: event/v01          # 美术资源 key
desc: 一句到两句情景文案
chapters: [1]           # 出现在哪几章
enabled: true           # H5 首版只启用 8 个
options:
  - text: 选项文案
    requires:           # 可选；条件不满足时选项置灰，并显示原因
      - { type: gold_at_least, value: 30 }
    outcomes:           # 按顺序执行；有随机时用 roll
      - { type: heal, value: 2 }
```

### requires 类型
| type | 含义 |
|---|---|
| gold_at_least | 铜钱 ≥ value |
| hero_is | 主将或副将是指定武将（例如 H02 貂蝉） |
| deck_removable | 牌组可删（删后 ≥8 张，并且至少保留 1 张杀类，同营地焚稿规则） |
| hp_below_max | 体力没满（建议用在纯回血选项上，避免玩家白选） |

### outcome 类型
| type | 参数 | 说明 |
|---|---|---|
| gold | value（可为负） | 铜钱增减 |
| heal | value 或 `full` | 回血，不超过上限 |
| damage | value | 掉血，不会致死（最低剩 1） |
| max_hp | value | 改体力上限，本局有效 |
| add_card | card 或 pool（rarity: R/E，或 hero: H02） | 加牌进牌组 |
| remove_card | count | 打开删牌选择页 |
| roll | chance, success[], fail[] | 概率结果，用局内 rng，保证可复现 |
| judge | red[], black[] | 天机签筒判定（PRD 5.10） |
| next_battle_buff | armor: 3 | 下一场战斗开场护甲，受开场护甲上限 4 约束 |
| battle | difficulty: easy, reward_mult: { gold: 2 } | 立刻打一场战斗，打完回到地图 |
| leave | 无 | 离开 |

## 3. 流程规则
- 同一局内事件不重复，从启用池里无放回抽取；池子抽空时，节点降级为 1 场 easy 战斗（组长已定）。
- 获得丹药时，丹药栏满了走奖励页的替换或放弃流程（PRD 12.2）；首版 8 个事件不给丹药，只把接口留出来。
- 战斗结果：胜利后进奖励页，再回到地图；失败走正常的复活或结算流程。
- 结果页：执行完 outcomes 后，展示一句结果文案和数值变化，再点「继续」回到地图。
- 埋点：上报 event_enter 和 event_choose（id、选项序号）。

## 4. 首版 8 个事件
```yaml
- id: V01  # 路边桃园
  options:
    - { text: 歇脚休整, outcomes: [{ type: heal, value: 2 }] }
    - { text: 摘桃带走, outcomes: [{ type: add_card, card: 桃 }] }
    - { text: 离开, outcomes: [{ type: leave }] }
- id: V04  # 赌坊
  options:
    - text: 押 30 铜钱
      requires: [{ type: gold_at_least, value: 30 }]
      outcomes: [{ type: gold, value: -30 }, { type: roll, chance: 0.5, success: [{ type: gold, value: 70 }], fail: [] }]
    - { text: 不赌, outcomes: [{ type: leave }] }
- id: V05  # 黑市
  options:
    - { text: 卖一张牌, requires: [{ type: deck_removable }], outcomes: [{ type: remove_card, count: 1 }, { type: gold, value: 30 }] }
    - { text: 买一张珍品, requires: [{ type: gold_at_least, value: 75 }], outcomes: [{ type: gold, value: -75 }, { type: add_card, pool: { rarity: E } }] }
    - { text: 离开, outcomes: [{ type: leave }] }
- id: V06  # 古井
  options:
    - text: 投签问井
      outcomes: [{ type: judge, red: [{ type: heal, value: 2 }], black: [{ type: damage, value: 1 }, { type: add_card, pool: { rarity: R } }] }]
    - { text: 离开, outcomes: [{ type: leave }] }
- id: V09  # 华佗诊所
  options:
    - { text: 刮骨疗毒, outcomes: [{ type: max_hp, value: -1 }, { type: heal, value: full }] }
    - { text: 抓药, requires: [{ type: gold_at_least, value: 40 }], outcomes: [{ type: gold, value: -40 }, { type: heal, value: 3 }] }
    - { text: 离开, outcomes: [{ type: leave }] }
- id: V13  # 叛军劝降
  options:
    - { text: 收编, outcomes: [{ type: next_battle_buff, armor: 3 }] }
    - { text: 剿灭, outcomes: [{ type: battle, difficulty: easy, reward_mult: { gold: 2 } }] }
- id: V14  # 铜雀演出
  options:
    - text: 观赏
      outcomes:
        - { type: branch, if: { type: hero_is, hero: H02 }, then: [{ type: add_card, pool: { hero: H02 } }], else: [{ type: gold, value: 40 }] }
- id: V19  # 驿站
  options:
    - { text: 歇一晚, outcomes: [{ type: heal, value: 2 }] }
    - { text: 包上房, requires: [{ type: gold_at_least, value: 60 }], outcomes: [{ type: gold, value: -60 }, { type: heal, value: full }] }
```
（V14 需要 `branch` 类型，加进 outcome 类型表。）

## 5. 已结案（群内 2026-10-13）
1. V09：固定「先扣体力上限，再回满」，写进测试。（组长）
2. V06：扣血不致死，最低剩 1。（数值）
3. V13：从 easy 池**独立抽取**，不占前 2 场 easy 名额，不参与普通池防重复。（数值）
4. 事件池抽空：该节点降级为 1 场 easy 战斗，不允许空节点。（组长）
5. 结果类型优先复用效果系统已有指令；新增须组长评审。（组长）
6. 数值 8 事件已与 PRD §13 全部对完，无偏差。（数值）

## 6. 实现前补齐（总策划 · 2026-10-13，对应 #91）

核对后，第 4 节的选项和数值可以直接实现；下面补上缺的文案、置灰条件和边界规则。文案字数已按奇遇页稿（`docs/ui/mockups-v3/event.html`）控制：情景 ≤ 40 字，选项 ≤ 6 字，结果 ≤ 24 字。

### 6.1 新增与调整的 requires
| type | 含义 | 置灰提示 |
|---|---|---|
| gold_at_least | 已有，铜钱 ≥ value | 「铜钱不足」 |
| deck_removable | 已有，同营地焚稿规则 | 「牌组不能再少」 |
| hp_below_max | 已有，本次启用：只回血的选项在满血时置灰 | 「体力已满」 |
| max_hp_at_least | **新增**，体力上限 ≥ value | 「体力上限过低」 |

置灰的选项仍显示，不能点，提示写在选项下方。每个事件至少保留一个可点选项（离开或必选项），所以不会卡住。

### 6.2 八个事件的文案与条件
| ID | 情景文案 desc | 选项（文案 · 新增条件） | 结果文案 |
|---|---|---|---|
| V01 路边桃园 | 道旁桃花正盛，树下石桌尚温，似有人刚在此结义。 | 歇脚休整 · `hp_below_max` / 摘桃带走 / 离开 | 回复 2 点体力。/ 获得一张「桃」。/ 你没有停留。 |
| V04 赌坊 | 骰盅声里人声鼎沸，庄家笑着招手：「押一把？」 | 押 30 铜钱 · `gold_at_least 30` / 不赌 | 赢：「赢了！得 70 铜钱。」输：「血本无归。」/ 你转身离开。 |
| V05 黑市 | 巷尾灯影昏暗，摊主低声道：「收旧货，也卖好货。」 | 卖一张牌 · `deck_removable` / 买一张珍品 · `gold_at_least 75` / 离开 | 卖出「{牌名}」，得 30 铜钱。/ 获得「{牌名}」。/ 你没有停留。 |
| V06 古井 | 枯井边挂着一只签筒，传说投签问井，可知吉凶。 | 投签问井 / 离开 | 红：「吉签，回复 2 点体力。」黑：「凶签，失 1 点体力，井底捞得「{牌名}」。」/ 你没有停留。 |
| V09 华佗诊所 | 草堂药香扑鼻，一位老者正在磨刀：「刮骨，敢否？」 | 刮骨疗毒 · `max_hp_at_least 2` / 抓药 · `gold_at_least 40` + `hp_below_max` / 离开 | 体力上限 −1，体力回满。/ 回复 3 点体力。/ 你没有停留。 |
| V13 叛军劝降 | 一队黄巾残兵拦住去路，头目犹豫：「降，还是打？」 | 收编 / 剿灭（两项都可选，无离开） | 下一场战斗开场获得 3 点护甲。/ 进入战斗（打完结果页写「铜钱奖励翻倍」）。 |
| V14 铜雀演出 | 台上舞袖翻飞，一曲终了，满座无声。 | 观赏（唯一选项） | 貂蝉在队：「貂蝉若有所思，获得「{牌名}」。」否则：「打赏如雨，你也分得 40 铜钱。」 |
| V19 驿站 | 驿卒迎上前来：「将军赶路辛苦，歇一晚吧。」 | 歇一晚 · `hp_below_max` / 包上房 · `gold_at_least 60` + `hp_below_max` / 离开 | 回复 2 点体力。/ 体力回满。/ 你没有停留。 |

V19 原来只有两个选项，补一个「离开」，满血时也能走。

### 6.3 边界规则
1. **V05 卖牌**：先打开删牌页，删牌页可以取消；取消就回到事件选项，不扣牌、不给钱。确认删除后才给 30 铜钱。
2. **加牌的花色点数**：按 PRD 14 章已有规则，从该牌配置的 `suits[]` 随机，没配置就从 52 张标准牌里随机；用局内 rng，可复现。
3. **V05、V06 的随机牌**：E 池、R 池的张数以 config 为准（不含专属牌），都只从已启用、非专属、非初始专用的牌里抽。
4. **V14**：H02 专属池目前只有 X201 离魂，等于固定给 X201；牌组里已有也照给。主将或副将任一是貂蝉都算。
5. **V09 刮骨**：先扣上限，再回满（已结案）；体力上限只剩 1 时置灰，避免扣到 0。
6. **V13 收编**：「下一场战斗开场 3 护甲」要写进 RunState（如 `nextBattleArmor`），刷新、续玩不丢；下一场是 Boss 也生效，进战斗后清零。和其他开场护甲叠加后受上限 4 约束。
7. **V13 剿灭**：战斗失败按正常的复活和结算走；胜利后奖励页的铜钱 ×2，卡牌奖励不变。
8. **V06 签筒**：判定走 PRD 5.10 的天机签筒，受天命和宝物对判定的影响；失血不致死，最低剩 1。
9. **结果页**：显示结果文案，加上数值变化（例如「体力 5→7」「铜钱 120→190」「+ 桃」），点「继续」回地图。存档点在进事件前，结果页之后写入新存档。
10. **美术**：`art: event/v01` 等资源目前还没有，首版先用 `ui_node_event.svg` 加纸色底占位，不挡 #91。
