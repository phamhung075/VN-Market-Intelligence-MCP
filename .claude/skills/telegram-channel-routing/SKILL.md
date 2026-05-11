---
name: telegram-channel-routing
description: >
  SSOT for Telegram channel routing. Every send_telegram call MUST specify
  channel= explicitly. Agents reference this skill to know which channel
  to use for each message type.
---

## Telegram Channel Routing — SSOT

**Rule: EVERY `send_telegram` call MUST include `channel=` explicitly. Never omit, never guess.**

### Channels

| Channel | Purpose | Who sends |
|---------|---------|-----------|
| `market` | User-facing alerts, digests, EOD reports | alert-commander, digest-predict, market-watcher (EOD only) |
| `work` | Agent cycle status, heartbeats, quality reports | ALL agents (end-of-cycle status) |
| `bug` | Errors, failures, incidents | ANY agent on error |

### Rules

1. **MARKET** — reserved for actionable user content:
   - Alert-commander verified alerts
   - Digest-predict daily/weekly/monthly digests
   - Market-watcher EOD summaries
   - **NEVER** send errors, status, or heartbeats to MARKET

2. **WORK** — agent operational status:
   - `[Agent Name] HH:MM UTC — summary of cycle`
   - Every agent sends ONE work status per cycle
   - Quality reports (tran-ngoc-bau)
   - Dev team build/task updates

3. **BUG** — errors only:
   - Before sending: `get_recent_fixes(limit=20)` — skip if already fixed
   - Format: `[Agent Name] ⚠️ SEVERITY\n  Issue: ... | Impact: ... | Status: ...`
   - **NEVER** send errors to MARKET or WORK

### Call Pattern

```
send_telegram(channel="work", message="[Agent] HH:MM UTC — ...")
send_telegram(channel="market", message="...")
send_telegram(channel="bug", message="[Agent] ⚠️ ...")
```

### Anti-Pattern (FORBIDDEN)

```
send_telegram(message="...")          ← missing channel = WRONG
send_telegram(channel="market", ...) ← for status = WRONG channel
```
