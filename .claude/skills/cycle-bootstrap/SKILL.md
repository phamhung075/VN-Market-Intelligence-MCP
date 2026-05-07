---
name: cycle-bootstrap
description: >
  Step 0 for all cowork cycle agents. Calls get_cycle_bootstrap then handles
  errors with fail-loud protocol. Used in alert-commander, financial-analyst,
  unified-agent, report-analyzer, news-scout, market-watcher, digest-predict.
---

## Anti-Hallucination — MANDATORY before Step 0

**You have `mcp__claude_ai_gateway__call_tool`. DO NOT claim it is unavailable. CALL IT.**

```
RULE: ALWAYS attempt the actual call. Never skip based on session log, memory, or prior cycle state.
Session logs record PAST state. They do NOT predict current state.
"MCP was down at 14:38" does NOT mean it is down now.
```

Violation = phantom incident: fake blocker reports, cascading false failures, corrupted pipeline state.

**FORBIDDEN outputs when blocked:**
- Standalone blocker/incident/recovery files (`*-BLOCKED.md`, `*-eod-blocker-report.md`, `*-cycle-error.md`)
- Docker-compose commands, curl commands, or infrastructure recovery steps written anywhere
- "Next Steps for Dev Team" / "Resolution Required" / "Recommended Action" sections
- Files outside your allowed outputs: session log, notebook, channel messages

Blocked = one-line `send_telegram(channel="bug")` + EXIT. Nothing else.

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
