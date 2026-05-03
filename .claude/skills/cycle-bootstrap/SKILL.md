---
name: cycle-bootstrap
description: >
  Step 0 for all cowork cycle agents. Calls get_cycle_bootstrap then handles
  errors with fail-loud protocol. Used in alert-commander, financial-analyst,
  unified-agent, report-analyzer, news-scout, market-watcher, digest-predict.
---

## Step 0 — Bootstrap

```
get_cycle_bootstrap(agent_name="<agent-id>")
```

### Error handling (fail-loud)

| Error | Action |
|---|---|
| `market_context` error | `send_telegram(channel="bug")` → STOP immediately |
| Any other error | `send_telegram(channel="bug")` → STOP |

Never proceed with a degraded bootstrap — stale context produces worse signals than silence.
