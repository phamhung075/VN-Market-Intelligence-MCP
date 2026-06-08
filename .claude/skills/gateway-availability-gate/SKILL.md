---
name: gateway-availability-gate
description: >
  Step-0 gateway-availability FAIL-LOUD gate for cowork agents. First action of every
  cycle: probe the MCP gateway with one cheap call. If the gateway transport is dead,
  write a bug-escalation signal file, write a BLOCKED notebook entry, and EXIT.
  Canonical pattern; reference this skill from flow files — do NOT copy the text inline.
version: "2026-06-08"
incident: "FANOUT-2026-06-08 — market-watcher false-green + news-scout half-fail when CLI gateway dropped"
---
<!-- Sprint: FIX-COWORK-GATEWAY-GATE | Author: agent-father -->

# Gateway Availability Gate — Step 0-GW

**Run this as the FIRST action of every cycle, before bootstrap, before regime, before any data fetch.**

---

## Step 0-GW — Gateway probe

```
PROBE_RESULT = call_tool(server="vn-market", tool="get_system_status", arguments={})
```

### On success (tool returns any non-error response)

Log: `[GATEWAY] probe OK — proceed`.
Continue to next step (bootstrap / Step 0).

### On any transport-dead error ("No such tool available", connection refused, MCP session missing, tool-not-found)

Execute ALL of the following in order, then EXIT:

**a) Write bug-escalation signal file**

File: `docs/signals/<agent-id>-<ISO-timestamp>.json`
Replace `<agent-id>` with your agent id (e.g. `market-watcher`).
Replace `<ISO-timestamp>` with current UTC in format `YYYYMMDDTHHMMSSz` (e.g. `20260608T000000Z`).

Content (exact schema):
```json
{
  "from": "<agent-id>",
  "to": "po",
  "type": "bug-escalation",
  "payload": "Step 0-GW gateway probe failed: MCP call_tool unavailable — CLI session gateway transport dead",
  "priority": "high",
  "createdAt": "<current UTC ISO-8601>"
}
```

**b) Write BLOCKED notebook entry**

For OVERWRITE-class notebooks (market-watcher): overwrite the notebook with:
```
# <Agent Name> — Notebook
**Last updated:** <current UTC>

## Cycle (<HH:MM>–<HH:MM>)
BLOCKED — Step 0-GW gateway unavailable: MCP call_tool probe failed. No data fetched. No signals emitted. No coverage stamps written.

## Metrics
| Field | Value |
|---|---|
| exit_status | blocked |
| gateway_probe | FAILED |
| signals_emitted | 0 |
| coverage_state_updated | no |
```

For APPEND-class notebooks (news-scout): append one entry:
```
## Cycle <YYYY-MM-DD HH:MM UTC>
BLOCKED — Step 0-GW gateway unavailable: MCP call_tool probe failed. No data fetched. No signals emitted.
exit_status: blocked
```

**c) EXIT immediately.**

Do NOT proceed to bootstrap. Do NOT fetch any data. Do NOT write any cycle entry that looks shipped.

---

## EXPLICIT PROHIBITIONS (enforced by this gate — violations are false-greens)

- NEVER refresh `docs/data/coverage-state.json` when gateway is unavailable
- NEVER stamp `last_covered_market_watcher` or any `last_covered_*` field
- NEVER write a cycle notebook entry that contains "complete", "shipped", or recycled prior-cycle numbers
- NEVER recycle macro numbers, price data, or signals from a prior cycle as if freshly fetched
- NEVER send a WORK channel message claiming a cycle ran successfully

---

## Usage in flow files

```
**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with your agent id.
```

Place this line as the FIRST step of the cycle flow (before any bootstrap or data-fetch step).
