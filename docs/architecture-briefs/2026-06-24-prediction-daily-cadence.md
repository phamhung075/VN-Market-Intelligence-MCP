# Architecture Brief: ARCH-PREDICTION-DAILY-CADENCE

**Sprint:** S2 / prediction-claims sprint
**Task:** ARCH-PREDICTION-DAILY-CADENCE
**Blocks:** FEAT-PREDICTION-CLAIMS-DAILY-CADENCE
**Date:** 2026-06-24
**Author:** agents-architect
**Implementor:** agent-father

---

## 1. Problem Statement

`/dashboard/prediction-claims` has been stale since 2026-06-14. The page, API endpoint (`/api/prediction-claims`), and `predictionClaimsHandler` are confirmed healthy — the production chain is intact. The root cause is a starved producer.

Sprint 1949-T5 disabled the Monday prediction synthesis path (steps P-3..P-5 in `monday.md` call `create_prediction_claim`), on the rationale that the Sunday weekly flow covers the full scope. However, `weekly.md` only READS `get_prediction_accuracy` — it never calls `create_prediction_claim`. This creates a dead-end: no flow in the system has produced a new claim since the Monday path was cut.

The fix is to add a new daily prediction synthesis sub-flow (`daily-predict.md`) reusing the proven P-3..P-5 pipeline from `monday.md`, add a daily cron slot in `cowork-schedule.json`, and update `main.md` to route to this sub-flow at the daily time slot. The Sunday `weekly.md` path must remain completely untouched.

---

## 2. Affected Files

| File | Change type | Owner |
|---|---|---|
| `docs/agents/digest-predict/flow/daily-predict.md` | CREATE (new sub-flow) | agent-father |
| `docs/agents/digest-predict/flow/main.md` | EDIT (dispatcher routing + dedup gate) | agent-father |
| `docs/agents/digest-predict/init.md` | EDIT (schedule block + constraint update) | agent-father |
| `docs/data/cowork-schedule.json` | EDIT (add daily slot) | agent-father |

**DO NOT TOUCH:**
- `docs/agents/digest-predict/flow/weekly.md` — must remain completely intact
- `docs/agents/digest-predict/flow/monday.md` — retained as audit trail, not routed

---

## 3. New Sub-flow: `daily-predict.md`

### 3.1 File: `docs/agents/digest-predict/flow/daily-predict.md`

This is a direct derivative of the proven `monday.md` P-0..P-8 pipeline. Agent-father must create this file with the following specification:

**Header:**
```
# Digest & Predict — Daily Prediction Synthesis (17:30 UTC / 00:30 VN)
```

**Steps (mirror monday.md with the changes listed below):**

- **Step 0 (Bootstrap):** same as monday.md — `cycle-bootstrap` skill + `regime-extraction` skill
- **Step 0b (Regime):** same as monday.md — REGIME, DAMPENING_ACTIVE logic
- **Step P-0 (Self-assessment):** same as monday.md — `get_calibration_report()`
- **Step P-1:** `get_watchlist()`
- **Step P-2 (Prerequisite):** `get_evidence_summary(stock)` for ≥1 ticker. All "No evidence" → send_telegram(channel="work", message="[digest-predict] Daily prediction skipped: zero evidence.") → EXIT
- **Step P-3 (Evidence):** per ticker `get_evidence_summary(stock)` — same logic as monday.md
- **Step P-4 (High-conviction filter):** same threshold as monday.md — `bullish_score > 0.6` OR `bearish_score > 0.6` → `get_bctc_full(stock)` | `get_market_snapshot()`
- **Step P-5 (Claims):** **DAILY CAP = 3** (see §4.1 below). If >3 qualify → rank by `|bullish - bearish|` descending → top 3. Same probability formula, dampening, and horizon table as monday.md. Same `create_prediction_claim(stock, claim_text, probability, horizon_days, resolution_criteria)` call.
- **Step P-6 (Notebook commit):** same settled-write invariant as monday.md. Section heading changed to `### Daily Predictions (HH:MM UTC) YYYY-MM-DD`.
- **Step P-7:** `log_agent_work(summary="Created {N} daily claims for {TICKERS}. Horizons: {5d:X,10d:Y,20d:Z}. Avg: {avg}. Dampening: {yes/no}.")`
- **Step P-8 (WORK):** `send_telegram(channel="work", message="[digest-predict] Daily claims {DATE}: {N}\n- {TICKER}: {claim_text} (p={prob}, {horizon}d)\n...")`
- **End of cycle:** `cowork-end-cycle` skill

**Key differences from monday.md:**
1. Cap is 3 claims per day (not 5)
2. WORK message prefix is `[digest-predict] Daily claims {DATE}:` (not "Monday claims:")
3. Notebook section heading uses date stamp

---

## 4. Guardrails (Critical — No-Fake-Data Standing Directive)

### 4.1 Per-Day Claim Cap + Weekly Ceiling

The existing `max_prediction_claims_per_week: 5` constraint in `init.md` was calibrated for a once-per-week (Monday) production cadence. A daily slot at the same cap would 7x the weekly volume to 35 claims.

**New constraints (agent-father to update `init.md`):**
```yaml
constraints:
  max_prediction_claims_per_day: 3      # replaces per-week cap for the daily slot
  max_prediction_claims_per_week: 15    # absolute weekly ceiling across all slots
  # Sunday weekly still uses get_prediction_accuracy (read-only) — contributes 0 to weekly count
```

The `daily-predict.md` P-5 step enforces the per-day cap at flow execution time (hard cap at top-3 rank). The weekly ceiling is a soft guard that agent-father documents in `init.md`; the flow itself does not need to enforce it (the daily-cap * 5 weekdays = 15 is already within ceiling).

### 4.2 Same-Day Dedup (anti-double-produce)

This is the most critical guardrail. A cron re-fire (stale last_fired, dispatcher double-fire, or session restart) must not produce duplicate claims for the same calendar day.

**Pattern:** mirror the `digest-sunday` Published Marker Gate in `main.md`, but keyed on the calendar day (UTC date) rather than the week period. Agent-father must add this gate to `main.md` BEFORE routing to `daily-predict.md`.

**Gate spec (for agent-father to implement in main.md):**

```
# DAILY-PREDICT DEDUP GATE
# Key: "published:digest-daily:" + UTC_DATE  (e.g. "published:digest-daily:2026-06-24")
# TTL: 86400 seconds (24h)

UTC_DATE = call_tool(server="vn-market", tool="get_current_date", arguments={})
# or extract from get_week_period.periodStart if get_current_date is not available

DAILY_TASK_ID = "published:digest-daily:" + UTC_DATE

DAILY_CLAIM = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     DAILY_TASK_ID,
  task_kind:   "cowork-slot",
  owner_agent: "digest-predict",
  ttl_seconds: 86400    # 24-hour window
})

if DAILY_CLAIM.claimed != true:
  log "[digest-predict] daily-predict dedup blocked — already ran for date=" + UTC_DATE
  EXIT with: "DONE: duplicate-daily-predict blocked | PIPELINE: complete"
```

If `claimed == true`: proceed to `daily-predict.md`.

**Important:** if `get_current_date` tool does not exist in the vn-market tool surface, use `WEEK_PERIOD.periodStart` from `get_week_period` to compute the ISO date portion of the current week, and derive today's date via the UTC hour probe from cycle-bootstrap. Agent-father should verify tool availability before implementing.

### 4.3 Clean NO-OP on Flat Days (honest empty is correct)

The conviction bar from `monday.md` must NOT be lowered to force daily production. The existing threshold (`bullish_score > 0.6` OR `bearish_score > 0.6`) is evidence-calibrated.

**Rule in `daily-predict.md` P-5:**
```
if qualify_count == 0:
  send_telegram(channel="work", message="[digest-predict] Daily prediction NO-OP {DATE}: zero tickers above conviction threshold. No claims created.")
  EXIT cleanly — this is correct behavior, not an error.
```

The dedup marker is still written on NO-OP days (to prevent re-tries from forcing claims where none qualify). The daily_claim `task_claim` marker is already staked at the gate (§4.2) before `daily-predict.md` runs, so the gate protects against re-fires regardless of whether any claims were created.

Open claims from prior days continue accruing toward their multi-day horizon (5d/10d/20d) without any intervention — that is handled by the existing resolution/accuracy tracking layer.

---

## 5. Dispatcher Routing — `main.md` Changes

Agent-father must update `docs/agents/digest-predict/flow/main.md` to:

### 5.1 Add the daily-predict dedup gate (§4.2) BEFORE the dispatch table

The gate only executes on the daily path — it should be conditioned on "not Sunday" to avoid any interference with the weekly path's existing Published Marker Gate (which uses its own `digest-sunday` task_id with a different key structure and 8d TTL).

**Recommended structure:**

```
# Step pre-D: if NOT Sunday → run DAILY-PREDICT DEDUP GATE (see §4.2)
#             if Sunday     → skip to existing Published Marker Gate (unchanged)
```

### 5.2 Update the Dispatch table

Current table (Sprint 1949-T5):
```
| Sunday 13:47 UTC | weekly.md |
| Any other time   | EXIT      |
```

New table:
```
| Sunday 13:47 UTC (cron 47 13 * * 0)    | docs/agents/digest-predict/flow/weekly.md       |
| Daily 17:30 UTC (cron 30 17 * * *)     | docs/agents/digest-predict/flow/daily-predict.md |
| Any other time                          | EXIT (outside scheduled windows)                 |
```

**Routing logic (for agent-father to implement in main.md steps):**

```
1. Read current UTC time, weekday.
2. If Sunday AND hour=13 AND minute ∈ [47,52]:
     → run daily-predict DEDUP GATE is SKIPPED (Sunday path has its own gate)
     → run Published Marker Gate (existing, unchanged)
     → execute weekly.md
3. Else if hour=17 AND minute ∈ [30,35]:
     → run DAILY-PREDICT DEDUP GATE (§4.2)
     → if gate passes: execute daily-predict.md
4. Else:
     → EXIT "DONE: outside-window | PIPELINE: complete"
```

**Note:** The ±5 minute tolerance band (minute ∈ [30,35]) matches the existing Sunday pattern's ±5 min tolerance, accounting for cron fire jitter.

### 5.3 Update the Note in main.md

Replace the Sprint 1949-T5 note:
```
Note: Daily, Monday, and monthly windows removed per Sprint 1949-T5 weekly-only scope.
Sub-flow files daily.md, monday.md, monthly.md retained on disk as audit trail (not routed).
```

With:
```
Note: Daily prediction synthesis restored via daily-predict.md (Sprint S2/ARCH-PREDICTION-DAILY-CADENCE).
monday.md retained on disk as audit trail (not routed). Monthly removed.
daily-predict.md reuses monday.md P-3..P-5 pipeline; weekly.md unchanged.
```

---

## 6. `init.md` Changes

Agent-father must edit `docs/agents/digest-predict/init.md`:

### 6.1 Update `description`

Change:
```
Sunday weekly calibration + portfolio thesis only.
```
To:
```
Daily prediction synthesis (00:30 VN / 17:30 UTC, Mon-Sun) + Sunday weekly calibration + portfolio thesis.
```

### 6.2 Update `responsibilities`

Add after the Sunday weekly line:
```
- Daily prediction synthesis at 17:30 UTC (slot digest-daily) — create_prediction_claim for high-conviction tickers only; NO-OP on flat days
```

### 6.3 Update `constraints`

Replace:
```yaml
max_prediction_claims_per_week: 5
```
With:
```yaml
max_prediction_claims_per_day: 3
max_prediction_claims_per_week: 15
```

### 6.4 Update `schedule` block

Add after `weekly_digest`:
```yaml
daily_predict:
  cron: "30 17 * * *"
  description: Daily 17:30 UTC — prediction synthesis off-market (00:30 VN / 19:30 France)
  flow: docs/agents/digest-predict/flow/daily-predict.md
```

### 6.5 Update `inter_agent.receives_from`

Add:
```yaml
- agent: cron
  mechanism: scheduled_invocation
  trigger: daily_predict  # Daily 17:30 UTC — prediction synthesis
```

### 6.6 Update `market.rule`

Change:
```yaml
rule: weekly_sunday_only
```
To:
```yaml
rule: weekly_sunday_only  # MARKET writes only on Sunday weekly — daily-predict writes to WORK only
```

---

## 7. cowork-schedule.json — New Slot

Agent-father must add the following slot to the `slots` array in `docs/data/cowork-schedule.json`:

```json
{
  "slot_id": "digest-daily",
  "cron": "30 17 * * *",
  "utc_description": "17:30 UTC daily",
  "vn_description": "00:30 VN next day (GMT+7) — off-market",
  "agent": "digest-predict",
  "agent_id": "digest-predict",
  "parallel_group": "digest",
  "flow_path": "docs/agents/digest-predict/flow/daily-predict.md",
  "trigger_prompt": "run docs/agents/digest-predict/flow/main.md  slot=digest-daily",
  "dish_type": "daily_predict",
  "guaranteed": true,
  "depends_on": null,
  "enabled": true,
  "policy_id": null,
  "last_fired": null,
  "trigger_id": null,
  "_note": "Daily off-market prediction synthesis. Reuses monday.md P-3..P-5 pipeline. Cap=3 claims/day. Same-day dedup via task_claim key published:digest-daily:YYYY-MM-DD (TTL=86400s). NO-OP on flat days is correct behavior."
}
```

**Slot placement:** insert AFTER the `digest-sunday` slot (preserve parallel_group="digest" adjacency).

**`trigger_prompt` note:** the trigger uses `main.md` (not `daily-predict.md` directly) so the dispatcher's dedup gate and time-window routing apply at the top level, consistent with all other slots.

---

## 8. Conflict + Slot Spacing Analysis

The `30 17 * * *` slot (17:30 UTC) fires:
- 30 min after `refine-bctc-slot-2` ends (14:00 UTC), 210-min gap — no conflict
- 105 min before `chef-evening` (19:45 UTC) — no conflict
- 30 min before `tnb-audit` (20:13 UTC) — no conflict
- Only digest-predict agent in `parallel_group=digest`, no intra-group contention

The slot fires at 00:30 VN time (off-market, post-close) — consistent with the no-fake-data standing directive requiring real fetched data (market is closed, evidence accumulated during the trading day is available and stable).

---

## 9. Acceptance Criteria for FEAT-PREDICTION-CLAIMS-DAILY-CADENCE

| # | Check | Method |
|---|---|---|
| AC-1 | New prediction_claims rows appear in DB on days where ≥1 ticker passes `bullish_score > 0.6` or `bearish_score > 0.6` | RAW: `select * from prediction_claims order by created_at desc limit 10` via named-volume sidecar |
| AC-2 | `/dashboard/prediction-claims` reflects new rows within one page load after AC-1 | Browser reload; compare before/after |
| AC-3 | Sunday 13:47 UTC still fires `weekly.md` (calibration report) — no claims created, no disruption | Check MARKET channel Sunday post; verify `get_prediction_accuracy` call in weekly.md output |
| AC-4 | Same-day dedup: a second fire of `digest-daily` on the same UTC date does NOT create duplicate claims | Manually fire slot twice; check DB row count — must be unchanged on second fire |
| AC-5 | NO-OP on flat day: when no ticker passes conviction threshold, WORK channel receives the skip message and DB claim count is unchanged | Observe WORK channel; verify via named-volume query |
| AC-6 | Daily claim count ≤ 3 per day | DB query: `select date(created_at), count(*) from prediction_claims where agent_id='digest-predict' group by 1 order by 1 desc` |
| AC-7 | `main.md` Sunday path unchanged: `published:digest-sunday` task_id structure intact, TTL=691200 | Read main.md after edit; verify Published Marker Gate section unmodified |

---

## 10. Implementation Sequencing (for agent-father)

All four file changes are independent and can be executed in any order. Suggested sequence:

1. CREATE `daily-predict.md` (longest file — derive from monday.md)
2. EDIT `main.md` — add dedup gate + update dispatch table + update note
3. EDIT `init.md` — update description, responsibilities, constraints, schedule
4. EDIT `cowork-schedule.json` — add digest-daily slot

Commit all four in a single atomic commit:
```
feat(digest-predict): add daily prediction synthesis slot (FEAT-PREDICTION-CLAIMS-DAILY-CADENCE)
```

No Docker rebuild required — all changes are agent flow docs and schedule config (no server-side code touched).

---

## 11. Dependencies

- `create_prediction_claim` tool: confirmed available via gateway (used in monday.md P-5, proven live)
- `task_claim` tool: confirmed available (used in main.md Published Marker Gate, proven live)
- `get_week_period` tool: confirmed available (used in main.md existing gate)
- `get_current_date` tool: availability UNKNOWN — agent-father must verify via `list_server_tools("vn-market")` before implementing §4.2 dedup gate; fallback = derive UTC date from `get_week_period` + cycle-bootstrap UTC probe

No new MCP tools are required. No new skills required (all referenced skills already exist).

---

## Signal

Signal file: `docs/signals/prediction-daily-cadence-20260624T150457Z.json`
Target: agent-father
