---
name: gateway-availability-gate
description: >
  Step-0 gateway-availability FAIL-LOUD gate for cowork agents. First action of every
  cycle: probe the MCP gateway with a DMS-2 escalation ladder (classify → 30s backoff →
  2nd probe → sibling corroboration → suppress-or-escalate). On confirmed-down (no
  sibling corroboration), write a bug-escalation signal file, write a BLOCKED notebook
  entry, and EXIT. Canonical pattern; reference this skill from flow files — do NOT
  copy the text inline.
version: "2026-08-14"
incident: "FANOUT-2026-06-08 — market-watcher false-green + news-scout half-fail when CLI gateway dropped"
provenance: "UC-CCA-P2 (2026-08-14) — absorbed market-watcher's inline DMS-2 ladder as the canonical Step 0-GW"
---
<!-- Sprint: FIX-COWORK-GATEWAY-GATE | Author: agent-father | DMS-2 ladder absorption: UC-CCA-P2, architect cross-service/ -->

# Gateway Availability Gate — Step 0-GW

**Run this as the FIRST action of every cycle, before bootstrap, before regime, before any data fetch.**

---

## Step 0-GW — Gateway probe

```
PROBE_1 = call_tool(server="vn-market", tool="get_system_status", arguments={})
```

### On success (tool returns any non-error response)

Log: `[GATEWAY] probe OK — proceed`.
Continue to next step (bootstrap / Step 0).

### On PROBE_1 failure — classify the error (DMS-2 escalation ladder)

- **CONFIRMED-BLIND** — error text contains "no such tool" / "tool not found" / "unknown tool"
  (IDENTICAL trigger-text signature to `cycle-bootstrap/SKILL.md` § Error handling's own
  CONFIRMED-BLIND classification — SSOT for the signature lives there; do not fork a second,
  independently-drifting definition here) → skip the 30s backoff entirely, go straight to
  **Confirmed-down actions** below. Action (a)'s payload is UNCHANGED from today (FR-2).
- **TRANSIENT** — any other error/timeout → WAIT 30s (CPU-spike backoff) → `PROBE_2 = call_tool(server="vn-market", tool="get_system_status", arguments={})`.
  - PROBE_2 succeeds → gateway UP → log `[GATEWAY] probe OK on retry — proceed`, continue to next step.
  - PROBE_2 fails → do NOT re-classify PROBE_2's own error (even if it happens to match the
    CONFIRMED-BLIND trigger text) — always fall through to SIBLING_RECENT below. This matches
    market-watcher's live inline behavior byte-for-byte; no new judgment call introduced here.

### SIBLING_RECENT corroboration (PROBE_2 exhausted)

```
SIBLING_RECENT = call_tool(server="vn-market", tool="get_agent_signals", arguments={from_agent: null, status: "all", hours_back: 0.25})
```
`hours_back=0.25` (exactly the 15-min window) — do not widen or narrow.

- **Non-empty** (any sibling agent used the gateway successfully in the last 15 min) → SUPPRESS:
  log `[GATEWAY] probe failed 2x — sibling success in 15-min window, suppressing`, write a **DEFER**
  notebook entry (below — a distinct template, do NOT reuse the BLOCKED one), EXIT cleanly.
  NO signal file. NO bug escalation.
- **Empty** (no sibling success) → **Confirmed-down actions** below, with action (a)'s payload
  getting ONE additive suffix: `" — 2x probe failure + no sibling success in 15-min window"`
  (appended to today's existing sentence, not a rewrite — keeps the CONFIRMED-BLIND path's
  payload literally unchanged per FR-2).

---

## Confirmed-down actions (a/b/c)

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
  "payload": "Step 0-GW gateway probe failed: MCP call_tool unavailable — CLI session gateway transport dead[SUFFIX]",
  "priority": "high",
  "createdAt": "<current UTC ISO-8601>"
}
```
`[SUFFIX]` = `""` on the CONFIRMED-BLIND path (unchanged, FR-2) | `" — 2x probe failure + no
sibling success in 15-min window"` on the ladder-exhausted TRANSIENT path (FR-1).

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

For APPEND-class notebooks (news-scout + all other consumers): append one entry:
```
## Cycle <YYYY-MM-DD HH:MM UTC>
BLOCKED — Step 0-GW gateway unavailable: MCP call_tool probe failed. No data fetched. No signals emitted.
exit_status: blocked
```

**c) EXIT immediately.**

Do NOT proceed to bootstrap. Do NOT fetch any data. Do NOT write any cycle entry that looks shipped.

---

## DEFER notebook entry (SIBLING_RECENT-suppressed path — distinct from BLOCKED, not a new write-mechanism)

For OVERWRITE-class notebooks (market-watcher): overwrite the notebook with:
```
# <Agent Name> — Notebook
**Last updated:** <current UTC>

## Cycle (<HH:MM>–<HH:MM>)
DEFERRED — Step 0-GW: 2x probe failure, sibling activity confirmed in 15-min window (gateway reachable via peer — this session's failure treated as local transient, not a real outage). No data fetched. No signals emitted. No coverage stamps written.

## Metrics
| Field | Value |
|---|---|
| exit_status | deferred |
| gateway_probe | TRANSIENT_SUPPRESSED |
| signals_emitted | 0 |
| coverage_state_updated | no |
```

For APPEND-class notebooks (news-scout + all other consumers): append one entry:
```
## Cycle <YYYY-MM-DD HH:MM UTC>
DEFERRED — Step 0-GW: 2x probe failure, sibling activity confirmed (15-min window) — suppressing false gateway-down, no real outage. No data fetched. No signals emitted.
exit_status: deferred
```

---

## EXPLICIT PROHIBITIONS (enforced by this gate — violations are false-greens)

- NEVER refresh `docs/data/coverage-state.json` when gateway is unavailable
- NEVER stamp `last_covered_market_watcher` or any `last_covered_*` field
- NEVER write a cycle notebook entry that contains "complete", "shipped", or recycled prior-cycle numbers
- NEVER recycle macro numbers, price data, or signals from a prior cycle as if freshly fetched
- NEVER send a WORK channel message claiming a cycle ran successfully
- NEVER attempt any Telegram/notification tool call anywhere in the ladder or the Confirmed-down
  actions (a/b/c) — a notification call is itself an `mcp__gateway__call_tool` call and fails
  identically when the gateway is dead; same rationale `cycle-bootstrap/SKILL.md`'s GATEWAY-BLIND
  fallback already documents for its own Step 0 (FR-2 domain invariant)

---

## Usage in flow files

```
**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with your agent id.
```

Place this line as the FIRST step of the cycle flow (before any bootstrap or data-fetch step).
