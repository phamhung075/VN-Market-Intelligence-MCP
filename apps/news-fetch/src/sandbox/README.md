# news-fetch Sandbox Runner

Runs scenario JSON fixtures against primitive and module functions (zero infrastructure imports).

## How to run

```bash
bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all
bun run src/sandbox/runner.ts --tier=module   --module=news-fetch --scenario=all
bun run src/sandbox/runner.ts --tier=all      --module=news-fetch --scenario=all
```

## What files it loads

Scenario JSONs from `docs/scenarios/news-fetch/primitives/<name>/*.json` (primitive tier) and `docs/scenarios/news-fetch/module/*.json` (module tier).
