---
name: cycle-bootstrap
description: >
  Step 0 for all cowork cycle agents. Calls get_cycle_bootstrap then handles
  errors with fail-loud protocol. Used in alert-commander, financial-analyst,
  unified-agent, report-analyzer, news-scout, market-watcher, digest-predict.
---

## Anti-Hallucination — MANDATORY before Step 0

**You have MCP gateway access (search your tools for `call_tool`). DO NOT claim it is unavailable. CALL IT.**

```
RULE: ALWAYS attempt the actual call. Never skip based on session log, memory, or prior cycle state.
Session logs record PAST state. They do NOT predict current state.
"MCP was down at 14:38" does NOT mean it is down now.
```

Violation = phantom incident: fake blocker reports, cascading false failures, corrupted pipeline state.

**NEVER invent tool names.** Only call tools listed in `.claude/tools/package/<your-agent-id>.md` or your flow docs. If unsure → Read your package file first. If tool not there → SKIP the step, log `[SKIP] No tool: <name>`.

**FORBIDDEN outputs when blocked:**
- Standalone blocker/incident/recovery files (`*-BLOCKED.md`, `*-eod-blocker-report.md`, `*-cycle-error.md`)
- Docker-compose commands, curl commands, or infrastructure recovery steps written anywhere
- "Next Steps for Dev Team" / "Resolution Required" / "Recommended Action" sections
- Files outside your allowed outputs: session log, notebook, channel messages

Blocked = one-line `send_telegram(channel="bug")` + drop signal `docs/signals/{agent-id}-{ISO}.json` (type: bug-escalation) + EXIT. Nothing else.

## Telegram Channel Routing — MANDATORY

Read `.claude/skills/telegram-channel-routing/SKILL.md` before any `send_telegram` call.
Every call MUST include `channel=` explicitly: `"market"` | `"work"` | `"bug"`.

## Step 0 — Bootstrap

```
get_cycle_bootstrap(agent_name="<agent-id>")
```

### Error handling (fail-loud)

| Error | Action |
|---|---|
| `market_context` error | `send_telegram(channel="bug")` + drop signal → STOP immediately |
| Any other error | `send_telegram(channel="bug")` + drop signal → STOP |

Never proceed with a degraded bootstrap — stale context produces worse signals than silence.

## Step 0b — Regime Extraction

→ skill: `.claude/skills/regime-extraction/SKILL.md`

Each flow declares which variables it needs (e.g. `Variables: REGIME, CARRY_REGIME`).

## Error Boundary — MANDATORY

→ skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Covers tool failure handling, signal drop, forbidden outputs, BUG telegram dedup.

## End of Cycle

→ skill: `.claude/skills/cowork-end-cycle/SKILL.md`

Session log + notebook write + doc self-heal.
