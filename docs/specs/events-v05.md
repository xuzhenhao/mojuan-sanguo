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
