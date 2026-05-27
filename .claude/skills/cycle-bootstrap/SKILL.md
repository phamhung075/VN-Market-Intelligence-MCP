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

**NEVER invent tool names.** Only call tools listed in `docs/agents/tools/package/<your-agent-id>.md` or your flow docs. If unsure → Read your package file first. If tool not there → SKIP the step, log `[SKIP] No tool: <name>`.

**FORBIDDEN outputs when blocked:**
- Standalone blocker/incident/recovery files (`*-BLOCKED.md`, `*-eod-blocker-report.md`, `*-cycle-error.md`)
- Docker-compose commands, curl commands, or infrastructure recovery steps written anywhere
- "Next Steps for Dev Team" / "Resolution Required" / "Recommended Action" sections
- Files outside your allowed outputs: session log, notebook, channel messages

Blocked = one-line `send_telegram(channel="bug")` + drop signal `docs/signals/{agent-id}-{ISO}.json` (type: bug-escalation) + EXIT. Nothing else.

## Telegram Channel Routing — MANDATORY

Read `.claude/skills/telegram-channel-routing/SKILL.md` before any `send_telegram` call.
Every call MUST include `channel=` explicitly: `"market"` | `"work"` | `"bug"`.

## Step -1 — Tick Snapshot Check (L-6, 1968b2)

Before calling `get_cycle_bootstrap`, check for a shared tick snapshot file:

```
TICK = current UTC time formatted as HH:MM (round to nearest 5-min slot, e.g. 02:05 → "02:05")
SNAPSHOT_PATH = docs/data/cycle-snapshot-<HH:MM>.json
```

1. Does `SNAPSHOT_PATH` exist?
   - NO → fall through to Step 0 (direct MCP call — canonical path).
2. Is the file timestamp within the last 7 minutes of current UTC?
   - NO (stale, >7min old) → treat as absent → fall through to Step 0.
3. YES (file exists AND fresh) → READ the snapshot. Extract `market_context` and `macro_snapshot` fields. Skip `get_cycle_bootstrap` in Step 0 and skip `get_macro_snapshot` if your flow calls it in Step 0b.
   - Log: `[BOOTSTRAP] tick-snapshot hit: <TICK> — skipping get_cycle_bootstrap`.
   - Proceed directly to Step 0b (Regime Extraction).

**Fallback is the canonical path.** If the snapshot file is absent, stale, malformed, or unreadable → fall through to Step 0. Never block on a missing snapshot.

**Note:** The snapshot writer (cowork-team dispatcher) is a future task. Until it lands, Step -1 will always miss and fall through to Step 0 — zero behavior regression.

## Step 0 — Bootstrap

```
get_cycle_bootstrap(agent_name="<agent-id>")
```

### Error handling (fail-loud)

<!-- SSE-handshake race: fresh cron sessions may not complete MCP gateway registration before Step 0 executes; 1 retry + 5s gap converts the race into a tolerable startup delay. -->

| Error | First occurrence | Second occurrence (after 5s wait) |
|---|---|---|
| tool-not-found / MCP unavailable | Wait 5s → retry `get_cycle_bootstrap` once | `send_telegram(channel="bug")` + drop signal → STOP |
| `market_context` error | `send_telegram(channel="bug")` + drop signal → STOP immediately | — |
| Any other error | `send_telegram(channel="bug")` + drop signal → STOP | — |

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
