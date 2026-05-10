---
name: cowork-error-boundary
description: >
  SSOT error boundary for all cowork flow files. Covers tool failure handling,
  signal drop, forbidden outputs on error, BUG telegram dedup, and MCP call pattern.
---

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
