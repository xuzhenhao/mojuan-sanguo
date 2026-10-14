# 对局埋点字段（#181）

字段白名单以 `src/game/telemetry.ts` 的 `MATCH_EVENTS` 为准，不在表内的字段上报前丢弃；微信端经 `createWechatTelemetry`（#208）再剥一次 PII（openid / userId 等）。**不采集任何用户标识。**

| 事件 | 触发 | 字段 |
|---|---|---|
| run_start | 点将出征 | hero_main, hero_sub, tianming(天命等级), chapter |
| node_enter | 进任何地图节点 | node_id, node_type, layer, chapter |
| card_pick | 离开奖励页 | card_id(略过为 null), skipped, offered, battle_tag, chapter |
| battle_end | 每场战斗结算 | battle_tag, win, node_id, layer, chapter, turns(回合数), plays_per_turn(每回合主动出牌数数组), loop_plays(带 `loop` tag 的牌出牌次数), dmg_taken, dmg_dealt, enemies(敌人 id) |
| damage_taken | 战斗结算且受伤>0 | source(胜：敌人 id 列表；败：致命敌人 id), amount, battle_tag, layer |
| death | 战斗失败 | node_id, node_type, layer, chapter, source, tianming |
| run_end | 结算页离开 / 放弃 | result(victory/defeat), abandoned, chapter, layer, tianming, boss_node, death_node, duration_ms, soul, runSeed |
| run_abandon | 放弃本局 | entry, layer, chapter |

- `battle_tag`（minion / elite / boss）取参战敌人 **config yaml `tier`**（小怪 / 精英 / Boss，schema 必填）的最高档，不按敌人 id 或代码判断。
- 循环牌判定取卡牌 config `tags` 含 `loop`。
