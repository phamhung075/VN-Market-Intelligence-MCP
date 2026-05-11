---
name: cowork-error-boundary
description: >
  SSOT error boundary for all cowork flow files. Covers tool failure handling,
  signal drop, forbidden outputs on error, BUG telegram dedup, and MCP call pattern.
---

## Memory-as-Truth Prohibition

**NEVER assert infrastructure state from memory, notebook, or session-log content.**

Cached entries such as notebook lines or prior session-log blocks record PAST state at the moment they were written. They do NOT reflect current live state.

### Forbidden assertions (without a live probe)

- "MCP infrastructure unavailable" — from a notebook or session-log entry
- "Source blocked / offline since <date>" — from a prior cycle's BLOCKED log line
- "Tool unreachable" — because a previous agent in the same pipeline reported it
- Any "BLOCKED" / "OFFLINE" / "DOWN" verdict written to session-log WITHOUT first attempting a live call

### Required verification before any BLOCKED verdict

Before writing any BLOCKED / OFFLINE / DOWN verdict to session log or sending a BUG telegram, you MUST attempt one live MCP probe:

```
call_tool(server="vn-market", tool="health_check", arguments={})
```

If `health_check` is not in your package, use any cheap tool from your package (e.g. `get_cycle_bootstrap`, `get_market_context`). The call result — success or real error — is the verdict source.

| Probe result | Allowed action |
|---|---|
| Success | Continue cycle — do NOT write BLOCKED |
| Real error (tool returns error payload) | Write BLOCKED with actual error text, send BUG telegram, EXIT |
| Tool-not-found after 1 retry | Write BLOCKED: "gateway unreachable after probe", send BUG telegram, EXIT |

### Self-fulfilling loop prohibition

If your notebook or a prior session-log contains a BLOCKED entry for the same infrastructure:
1. **Ignore it as evidence of current state.**
2. Run the live probe above.
3. Only if the probe itself fails may you write a new BLOCKED entry.

Propagating a stale BLOCKED claim = phantom incident. One agent's stale claim must never become another agent's skip decision.

→ See also: `.claude/skills/anti-hallucination/SKILL.md` (session-scope hallucination — do not claim MCP unavailable without calling it)

## MCP Call Pattern

Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway.

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[{agent-id}] Step N failed: {one-line error}")`
2. Drop signal: `docs/signals/{agent-id}-{ISO-timestamp}.json` → `{ "from": "{agent-id}", "to": "po", "type": "bug-escalation", "payload": "Step N failed: {one-line error}", "priority": "high", "createdAt": "{ISO}" }`
3. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
4. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

**NEVER use channel="market" for errors. MARKET channel is reserved for alert-commander alerts ONLY. Errors → BUG always.**

## FORBIDDEN on error (these create phantom incidents)

- Writing standalone blocker/incident/recovery files (e.g. `*-BLOCKED.md`, `*-eod-blocker-report.md`)
- Adding docker-compose commands, curl commands, or infrastructure recovery steps to any file
- Writing "Next Steps for Dev Team" sections — send one-line BUG telegram and EXIT
- Creating files outside: session log, notebook, channel messages

Your job = [your flow steps] → log. Blocked = report + EXIT.

## BUG Telegram Dedup

Before sending any BUG telegram: `get_recent_fixes(limit=20)` — if same module/issue appears in recent fixes → **skip, do not re-report**.

```
[{agent-id}] ⚠️ SEVERITY
  Issue: ... | Impact: ... | Status: Retrying/Blocked
```
