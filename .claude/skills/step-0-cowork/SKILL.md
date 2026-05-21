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

| Error | First occurrence | Second occurrence (after 5s wait) |
|---|---|---|
| tool-not-found / MCP unavailable | Wait 5s → retry once | `send_telegram(channel="bug")` + signal drop → STOP |
| `market_context` error | `send_telegram(channel="bug")` + signal drop → STOP | — |

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
