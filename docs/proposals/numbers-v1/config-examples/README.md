# 配置示例（V1）
- `schema/`：effect（效果 DSL）、card、hero、enemy 四份 JSON Schema
- `heroes/zhaoyun.yaml`：武将示例（主将技、副将技、起始牌组、珠联璧合）
- `cards/basic/sha.yaml`、`cards/equip/bagua.yaml`：卡牌示例
- `enemies/ch1/zhangbao.yaml`：精英示例（意图循环、墨影、黄天庇佑）
- 校验：`python3 -m venv .v && .v/bin/pip install pyyaml jsonschema && .v/bin/python validate.py`
