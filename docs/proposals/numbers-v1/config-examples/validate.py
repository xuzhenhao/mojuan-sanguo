"""校验 config-examples 下所有 yaml：python validate.py（需 pyyaml、jsonschema）"""
import json, sys, pathlib, yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
root = pathlib.Path(__file__).parent
schemas = {p.name: json.loads(p.read_text()) for p in (root / 'schema').glob('*.json')}
reg = Registry().with_resources([(k, Resource.from_contents(v)) for k, v in schemas.items()])
pick = {'heroes': 'hero.schema.json', 'cards': 'card.schema.json', 'enemies': 'enemy.schema.json'}
bad = 0
for f in sorted(root.rglob('*.yaml')):
    sch = schemas[pick[f.relative_to(root).parts[0]]]
    data = yaml.safe_load(f.read_text())
    errs = list(Draft202012Validator(sch, registry=reg).iter_errors(data))
    # 额外业务校验：起始牌组红色比例 50%
    if 'starterDeck' in data:
        red = sum(c['suit'] in 'HD' for c in data['starterDeck']) / len(data['starterDeck'])
        if abs(red - 0.5) > 1e-9: errs.append(f'起始牌组红色比例 {red:.0%} ≠ 50%')
    print(('✔' if not errs else '✘'), f.relative_to(root), *[f'\n   - {getattr(e, "message", e)} @ {"/".join(map(str, getattr(e, "path", [])))}' for e in errs])
    bad += bool(errs)
sys.exit(bad)
