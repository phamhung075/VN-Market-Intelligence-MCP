---
name: step-0-cowork
description: >
  Composite preamble for all cowork agents — reads agent notebook, loads cycle bootstrap
  (with L-6 tick-snapshot check), and extracts market regime. Replaces 3 separate skill
  reads (notebook-read, cycle-bootstrap, regime-extraction) with a single file load.
  Error boundaries from each constituent skill are fully preserved.
---
<!-- Brief: docs/architecture-briefs/2026-05-21-token-toolcall-economy.md §L-8 -->
<!-- Sprint: 1968c-P02 | Author: agent-father -->

## Pre-condition

Read `docs/protocols/fail-loud-protocol.md` before executing this skill (must be in always_load).
Any Read failure → `send_telegram(channel="bug")` + signal drop → STOP (per cowork-boundary/SKILL.md).

---

## Step 0a — Read agent notebook

Read `docs/agent-memory/notebooks/<agent-id>.md` (replace `<agent-id>` with your agent id).

- Store as `$AGENT_NOTEBOOK`.
- Note any `## Carry-over` items for use in this cycle.
- Do NOT act on carry-over yet — load as context only.
- **On fail (file missing, empty, permission denied):**
  `send_telegram(channel="bug", "[<agent-id>] notebook-read failed — <error>")` → drop signal → STOP.
  Non-recoverable: notebook absence means corrupted state. Do not continue with partial context.

---

## Step 0b — Load cycle bootstrap (with tick-snapshot check)

→ Full protocol: `.claude/skills/cycle-bootstrap/SKILL.md`

**Step -1 (tick snapshot check):**
```
TICK = current UTC time as HH:MM (e.g. "02:05")
SNAPSHOT_PATH = docs/data/cycle-snapshot-<HH:MM>.json
```
1. File absent → fall through to direct MCP call (Step 0 below).
2. File exists but timestamp >7 min old → treat as absent → fall through.
3. File exists AND fresh (≤7 min): read snapshot → extract `market_context` + `macro_snapshot`.
   - Set `$CYCLE_SNAPSHOT = <parsed file content>`.
   - Log: `[BOOTSTRAP] tick-snapshot hit: <TICK> — skipping get_cycle_bootstrap`.
   - Skip Step 0 MCP call. Proceed to Step 0c.

**Step 0 (direct call — fallback path):**
```
get_cycle_bootstrap(agent_name="<agent-id>")
```

**GATEWAY-BLIND guard (FIX-COWORK-SUBAGENT-GATEWAY-BLIND-BOOTSTRAP, 2026-07-07) — full detail in
`.claude/skills/cycle-bootstrap/SKILL.md` § Error handling; condensed here:**
A locally Agent-spawned subagent can land with `mcp__gateway__call_tool` categorically absent from
its own tool binding even though `.claude/agents/<agent-id>.md` grants it and `.mcp.json` correctly
registers `gateway` — a session-transport gap, not a config defect (confirmed 2026-07-07: every
cowork agent's frontmatter already carries the grant). Not fixable from inside the flow — see
`feedback_local_cowork_subagents_gateway_blind.md`.

| Error class | Detection | First occurrence | Confirmed |
|---|---|---|---|
| TRANSIENT | any error text other than "no such tool"/"tool not found"/"unknown tool" | Wait 5s → retry once | still fails → GATEWAY-BLIND fallback below |
| CONFIRMED-BLIND | error text = "no such tool"/"tool not found"/"unknown tool" (tool categorically absent) | Skip the 5s wait — go straight to fallback | — |
| `market_context` error (bootstrap reached, response malformed) | — | `send_telegram(channel="bug")` + signal drop → STOP | — |

**GATEWAY-BLIND fallback (Write-fallback signal + graceful DEFER — mirrors the already-DONE
FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH file-signal pattern). Do NOT call `send_telegram`** —
it is itself an `mcp__gateway__call_tool` call and fails identically when the gateway is blind
(this is exactly what forced bctc-analyst-slot-2 ×3 and unified-agent chef-evening ×1 into ad-hoc
raw-Write escalations on 2026-07-07):

```
Write(docs/signals/<agent-id>-<ISO-timestamp>-gateway-blind.json, {
  "from": "<agent-id>", "to": "po", "type": "bug-escalation",
  "payload": "[<agent-id>] Step 0b bootstrap failed: gateway-blind — get_cycle_bootstrap unavailable (mcp__gateway__call_tool absent from this subagent's binding; session-transport gap — see feedback_local_cowork_subagents_gateway_blind.md). No data fetched, no signals emitted, no fabrication this cycle. slot=<slot_id> tick=<TICK>.",
  "priority": "high", "createdAt": "<ISO timestamp>"
})
```
Use this canonical schema exactly — a prior ad-hoc unified-agent signal missing `from`/`to`/`type`/
`payload` silently broke `drain-signals.js`'s `{from} → {to}` routing log line.

Then append to `$AGENT_NOTEBOOK`: `"Cycle <TICK> — DEFERRED at Step 0b: gateway-blind (no MCP tool
access this session)."` and **EXIT cleanly — graceful DEFER, not a crash.** No lock was held
(blocked before any `task_claim`), so no STOP-RELEASE/orphan-lock risk. The next scheduled fire
spawns a fresh subagent that may land sighted — do not retry further within this cycle.

Never proceed with degraded bootstrap — stale context produces worse signals than silence.

---

## Step 0c — Extract market regime

→ Full protocol: `.claude/skills/regime-extraction/SKILL.md`

Source: `macro_snapshot` from `$CYCLE_SNAPSHOT` (tick-snapshot path) or from Step 0 bootstrap response.

If `macro_snapshot` not in bootstrap context → call `get_macro_snapshot` once now.

```
REGIME       = "Global Liquidity: X"   → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
US10Y_SIGNAL = "US 10Y Yield" line     → RISK-OFF | RISK-ON | NEUTRAL
DXY_SIGNAL   = "DXY" line             → USD STRENGTHENING | USD WEAKENING | USD STABLE
```

Each flow declares which variables it needs:
```
Variables: REGIME, CARRY_REGIME   ← example — use only what your flow needs
```

**Regime fallback (recoverable):** If extraction slow/fails → use NEUTRAL + log `[WARN] regime fallback: NEUTRAL`. Non-blocking — cycle continues with conservative thresholds.

---

## Outputs

After this skill completes, the agent has:
- `$AGENT_NOTEBOOK` — loaded memory (carry-over items noted)
- `$CYCLE_SNAPSHOT` OR `$MARKET_CONTEXT` + `$MACRO_SNAPSHOT` — bootstrap data
- `$REGIME`, `$CARRY_REGIME` (+ other declared variables) — market regime

---

## Usage in flow files

Replace separate skill calls at cycle start with a single reference:

```
**Step 0** → skill: `.claude/skills/step-0-cowork/SKILL.md` (replace `<agent-id>` with your id)
Variables: REGIME, CARRY_REGIME   ← declare only what this flow needs
```
