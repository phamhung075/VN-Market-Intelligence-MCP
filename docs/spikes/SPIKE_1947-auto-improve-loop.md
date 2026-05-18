# SPIKE-1947 — Closed-Loop Auto-Improvement System Design

**Author:** Architect
**Sprint:** 1947
**Opened:** 2026-05-18
**Timebox:** 3h (read-only diagnostic + design)
**Status:** DONE
**Output files:** `docs/spikes/SPIKE_1947-auto-improve-loop.md` + `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md`

---

## 1. Problem Statement

Sprints 1926a, 1941b, and 1945a-b shipped the measurement primitives:

- `signal_outcomes` table — every directional signal gets a T+24h and T+48h verdict (correct / incorrect / neutral / pending)
- `verdictResolutionJob.ts` — hourly cron resolves pending rows via price comparison
- `signalOutcomeResolutionJob.ts` — resolves T+24h and T+48h in one pass
- `getAccuracyStats()` / `getSystemAccuracyDigestStats()` in `signalOutcomeStore.ts` — per-`(signal_type, stock_code)` aggregation and system-wide digest
- `GET /api/accuracy/digest` — HTTP endpoint serving `SystemAccuracyDigestStats`
- `accuracyDigestJob.ts` — daily WORK-channel Telegram digest at 07:00 UTC
- `signal_quality_audit` table + `insertSignalQualityAudit()` — per-signal-fire quality metadata (confidence, source tier, staleness, coverage gap)
- `monthlySignalQualityJob.ts` — monthly rejection-rate audit (2% threshold alert)

What is still missing is the **active control loop**: something that reads the measurement surface, detects degradation, generates a hypothesis, dispatches a fix task, and rechecks.

Today the six OBSERVE gates carried from Sprint 1946 are passive — a human reads them and may file a follow-up. This spike asks whether that human step can be replaced by a `selfImproveOrchestratorJob`.

---

## 2. Brownfield Primitive Map

Every loop step mapped to an existing component or a new one:

| Loop Step | Existing Primitive | Gap / New Component Needed |
|---|---|---|
| Detect | `getAccuracyStats(db, {days:7})` + `getAccuracyStats(db, {days:30})` — delta computable | New: `detectDegradedSignalTypes()` domain service |
| Detect | `signal_quality_audit` table — coverage_gap + staleness_warning columns | New: `queryCoverageGaps()` infra query |
| Hypothesize | Existing `signal_quality_audit.coverage_gap` and `signal_type` vocabulary | New: rule lookup table `DEGRADATION_CAUSES` mapping signal_type → hypothesis |
| Dispatch | `docs/signals/DASHBOARD.md` signal-bus JSON write path | New: JSON file writer `writeImprovementSignal()` |
| Dispatch | `cron_job_runs` dedup guard pattern (already in `accuracyDigestJob.ts`) | Reuse: same dedup pattern prevents runaway |
| Recheck | `getAccuracyStats(db, {days:7})` before/after fix — identical query | New: `improveCheckStore.ts` — stores baseline snapshot at dispatch time |
| Loop | `CRONS.accuracyDigestJob` — daily cadence already in `cronConfig.ts` | Extend: add `CRONS.selfImproveOrchestrator` daily cadence (different time slot) |
| Safety | `cron_job_runs.wrapRun()` pattern in `startScheduler.ts` | Reuse + extend: add `max_dispatches_per_cycle` guard |
| Observe gates | Six OBSERVE gates in `docs/TASKS.md` Todo | Phase 1: shadow mode replaces the "gate fires → human acts" with "gate fires → orchestrator logs" |

---

## 3. Architecture Decision: Host

### Options evaluated

**Option A — New microservice `apps/self-improve/`**
- Pros: DDD isolation, independent deploy, can run Python/LLM libraries
- Cons: Docker service addition (Docker rebuild required), cross-service DB access violates `market.db` single-writer rule (mcp-server WRITE-only), token cost of maintaining a new service scaffold
- Verdict: REJECTED. The measurement data is in `market.db`. Reading it from a new service would require an HTTP API wrapper around `getAccuracyStats()` that does not yet exist. Over-engineered for Phase 1.

**Option B — Cowork agent `agent: self-improver`**
- Pros: LLM hypothesis generation, natural language output, easy Telegram integration
- Cons: Token cost per daily run (~3-5k tokens), requires Cowork to be running, adds agent metadata overhead, hypothesis quality untested — starts with false confidence
- Verdict: REJECTED for Phase 1. Useful as Phase 3 upgrade path (replace rule-table with LLM reflection). Rule-table is cheaper and auditable.

**Option C — Scheduler job inside `apps/mcp-server/`** (SELECTED)
- Path: `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts`
- Pros: direct SQLite access (market.db already open, single-writer constraint satisfied since job is inside mcp-server), follows the `monthlySignalQualityJob.ts` + `accuracyDigestJob.ts` precedent, injectable deps, cron-job-runs dedup, zero new Docker services
- Cons: LLM hypothesis generation not available — mitigated by rule-lookup table in Phase 1-2; Phase 3 can delegate hypothesis step to cowork agent via signal-bus
- DDD layer: `interface/scheduler` — reads from `infrastructure/db`, writes signal-bus JSON to `docs/signals/`

**Decision: Option C for Phases 1 and 2. Phase 3 optionally wraps the hypothesis step with a cowork agent call via signal-bus.**

---

## 4. Detection Policy

### Metric: `signal_outcomes.outcome_24h` aggregated by `signal_type`

The detection query is a **two-window comparison**:

```
current_rate  = getAccuracyStats(db, {days: 7}).accuracy_rate  per signal_type
baseline_rate = getAccuracyStats(db, {days: 30}).accuracy_rate per signal_type
```

A signal type is **DEGRADED** if ALL three conditions hold:
1. `current_rate` is not null (i.e., ≥3 samples in the 7-day window)
2. `baseline_rate` is not null (i.e., ≥3 samples in the 30-day window)
3. `baseline_rate - current_rate >= 0.10` (10 percentage-point regression, i.e., 45% → 35%)

A signal type is **PERSISTENTLY LOW** if:
1. `baseline_rate` is not null and `baseline_rate < 0.40`
2. `sample_count >= 10` (enough evidence to conclude "not just noise")

A stock is **COVERAGE GAP** if:
1. It appears in `watchlist` table
2. It has zero rows in `signal_outcomes` with `outcome_24h IN ('correct','incorrect')` in the last 30 days
3. There are ≥1 rows in `agent_signals` for that stock in the last 30 days (i.e., signals fired but none resolved)

### Why 10pp and not 5pp?

The 7-day window has high variance with small samples. A 5pp threshold would generate false positives weekly. 10pp over ≥3 samples is the minimum meaningful regression. This can be tuned downward in Phase 3 once sample volumes are larger.

### Why not `scored_pct` as the trigger?

`scored_pct` is an aggregate across all signal types and was used as the Sprint 1945 OBSERVE gate because the entire resolution pipeline was broken. Once the pipeline is healthy, `scored_pct` is a lagging indicator; per-signal-type `accuracy_rate` delta is the leading indicator that allows targeted fix hypothesis.

---

## 5. Hypothesis Generation

### Phase 1-2: Rule-lookup table

Implemented as a constant in the domain layer:

```typescript
// apps/mcp-server/src/domain/services/degradationRules.ts
export const DEGRADATION_CAUSE_MAP: Record<string, DegradationHypothesis> = {
  "price_confirmation": {
    likely_cause: "PMI/regime threshold too aggressive → false positives in overheat regime",
    suggested_fix: "Audit alert-engine PMI threshold for price_confirmation signal type; compare against overheat regime hit_rate",
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  },
  "chain_catalyst": {
    likely_cause: "TTL window too short → signal expires before 24h verdict window closes",
    suggested_fix: "Extend chain_catalyst TTL from 120min; check news-scout confidence threshold against false positive rate",
    fix_area: "apps/mcp-server/src/scheduler/news/",
  },
  "volume_spike": {
    likely_cause: "Volume baseline uses 5-day MA; VN market holiday gaps distort baseline → false spikes",
    suggested_fix: "Audit volume spike MA window; add holiday-aware baseline computation",
    fix_area: "apps/technical-analysis/",
  },
  "_default": {
    likely_cause: "Unknown degradation — needs manual investigation",
    suggested_fix: "Run get_alert_accuracy for signal type over last 30 days and compare vs 7-day window",
    fix_area: "manual",
  },
};
```

DDD layer: `domain/services/degradationRules.ts` — pure data, zero imports, no side effects.

### Phase 3: LLM hypothesis via cowork agent

Write a `dev-team-signal` JSON to `docs/signals/` with type `accuracy_degradation_hypothesis_needed`. The self-improver cowork agent (future) reads this signal, calls `get_alert_accuracy` and `get_system_accuracy_digest_stats` MCP tools, and posts a natural-language hypothesis back as a `fix_hypothesis_ready` signal. The orchestrator job then reads the hypothesis on the next cycle and dispatches the fix task.

---

## 6. Recommended Architecture (Phased)

### Phase 1 — Shadow mode (Sprint 1948 target)

The orchestrator job runs daily, detects degraded signal types, generates hypotheses, and **logs to `signal_quality_audit`** and **sends a WORK Telegram** — but does NOT dispatch any fix tasks. No `docs/signals/*.json` written. Human reads the WORK message and decides.

This proves the detection + hypothesis pipeline end-to-end before trusting it to auto-dispatch.

**New files (Phase 1):**
- `apps/mcp-server/src/domain/services/degradationRules.ts` — rule-table (domain layer, pure)
- `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` — snapshot write/read for recheck baseline (infra layer)
- `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — cron entry (scheduler layer)

**Modified files (Phase 1):**
- `apps/mcp-server/src/scheduler/cronConfig.ts` — add `CRONS.selfImproveOrchestrator`
- `apps/mcp-server/src/scheduler/startScheduler.ts` — wire the new cron
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — add `improve_check_log` table

**Cron schedule:** `0 8 * * *` (08:00 UTC daily, after `signalOutcomeJob` at 08:30 UTC — wait, use 08:00 to run 30 min before resolution completes so prior day's data is fully resolved by 07:30 UTC). Actually: run at `0 9 * * *` (09:00 UTC) so both the signalOutcomeJob (08:30) and accuracyDigestJob (07:00) have already completed.

### Phase 2 — Manual-gate dispatch (Sprint 1949+ target)

The orchestrator job writes a `dev-team-signal` JSON to `docs/signals/` with type `accuracy_degradation` when degradation is detected. A human (PO or TNB) reviews the WORK Telegram and manually triggers the dev-team signal drain. The dev-team flow picks it up, routes to PM, who creates a fix task.

**New capability:** `writeImprovementSignal()` in `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts`. Follows the same JSON schema as existing `docs/signals/*.json` files.

**Safety gate at Phase 2:** maximum 1 signal per `signal_type` per rolling 7-day window. Enforced by querying `improve_check_log` before writing.

### Phase 3 — Auto-dispatch (Sprint 1950+ target, gated on Phase 2 evidence)

The orchestrator job writes the `dev-team-signal` directly to `docs/signals/` without human gate. WIP≤2 enforcement: before writing, count open tasks in `docs/TASKS.md` "In Progress" section — if ≥2, defer dispatch (log to `improve_check_log` as `deferred_wip_cap`).

**Kill-switch:** `SELF_IMPROVE_AUTO_DISPATCH=false` in `.env` / Docker environment. Defaults to `false` until explicitly enabled. Phase 3 requires explicit opt-in.

---

## 7. Data Flow Diagram

```
  signal fires
       │
       ▼
 agent_signals INSERT
       │
       ▼
 seedSignalOutcome()          ← signalOutcomeStore.ts
       │
       ▼
 signal_outcomes row (pending)
       │
       ▼ (hourly)
 signalOutcomeResolutionJob   ← resolves T+24h + T+48h
       │
       ▼
 signal_outcomes.outcome_24h = correct|incorrect|neutral
       │
       ▼ (daily 07:00 UTC)
 accuracyDigestJob             ← getSystemAccuracyDigestStats()
       │
       ▼
 WORK Telegram digest          ← human reads top-3/bottom-3

       │
       ▼ (daily 09:00 UTC) ← NEW: selfImproveOrchestratorJob
       │
       ├── detectDegradedSignalTypes()
       │       └── getAccuracyStats(7d) vs getAccuracyStats(30d)
       │           delta ≥ 10pp OR rate < 40% with ≥10 samples
       │
       ├── queryCoverageGaps()
       │       └── watchlist stocks with 0 resolved outcomes in 30d
       │           but ≥1 agent_signals fired
       │
       ├── [for each degraded type] DEGRADATION_CAUSE_MAP lookup
       │       └── degradationRules.ts → {likely_cause, suggested_fix, fix_area}
       │
       ├── save snapshot to improve_check_log
       │       └── improveCheckStore.ts INSERT (signal_type, window_7d_rate,
       │                               window_30d_rate, checked_at, dispatch_status)
       │
       ├── Phase 1: send WORK Telegram (shadow — no dispatch)
       │
       ├── Phase 2: write docs/signals/{id}-accuracy-degradation.json
       │           (dev-team drains → PO gates → PM creates fix task)
       │
       └── Phase 3 (auto, kill-switch): write signal only if WIP < 2
               dispatch_status = 'dispatched' | 'deferred_wip_cap'

       │
       ▼ (after fix deploys — next orchestrator daily run)
 recheckAccuracyImprovement()
       └── compare improve_check_log.window_7d_rate (at dispatch_time)
           vs current getAccuracyStats(7d)
           if improved ≥ 5pp → log 'improvement_confirmed'
           if unchanged after 7d → log 'no_improvement' → re-hypothesize
           if degraded further → log 'worsened' → WORK alert + freeze signal_type
```

---

## 8. `improve_check_log` Schema

```sql
CREATE TABLE IF NOT EXISTS improve_check_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type      TEXT    NOT NULL,
  window_7d_rate   REAL,
  window_30d_rate  REAL,
  sample_count_7d  INTEGER,
  sample_count_30d INTEGER,
  hypothesis       TEXT,
  dispatch_status  TEXT    NOT NULL DEFAULT 'shadow',
  -- 'shadow' | 'dispatched' | 'deferred_wip_cap' | 'improvement_confirmed' | 'no_improvement' | 'worsened'
  fix_signal_id    TEXT,   -- docs/signals/{id}.json filename when dispatched
  checked_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  rechecked_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_improve_check_log_signal_type
  ON improve_check_log(signal_type, checked_at DESC);
```

DDD layer: `infrastructure/db/schema-system.ts` (add to existing `initSystemTables()`).

---

## 9. Safety Gates (Anti-Runaway)

| Gate | Mechanism | Phase |
|---|---|---|
| Shadow mode default | `dispatch_status = 'shadow'` until `SELF_IMPROVE_AUTO_DISPATCH=true` | All phases |
| WIP cap | Count `In Progress` rows in `docs/TASKS.md` via file read; defer if ≥2 | Phase 3 |
| Max dispatches per cycle | At most 2 `dev-team-signal` files written per orchestrator run | Phase 2-3 |
| Per-signal-type cooldown | Check `improve_check_log` — skip if existing row for same `signal_type` with `dispatch_status IN ('dispatched','deferred_wip_cap')` within 7 days | Phase 2-3 |
| Kill-switch env var | `SELF_IMPROVE_AUTO_DISPATCH=false` (default) in `.env` and `docker-compose.yml` | Phase 3 |
| Freeze on worsening | If `rechecked_at` shows `worsened`, mark signal_type as `frozen` (new status) and escalate via WORK — no further auto-dispatch | Phase 2-3 |
| Min sample threshold | Only dispatch if `sample_count_30d >= 10` — avoids acting on statistical noise | All phases |
| Recurring-bug-escalation rule | If same `signal_type` has `no_improvement` on ≥2 successive checks → route to architect (WORK alert) instead of re-dispatching | Phase 2-3 |

The recurring-bug-escalation rule (project policy: ≥2 fix commits on same module → Architect rethink) is mirrored here at the signal-type level: if the auto-improver has dispatched 2 fixes for the same signal_type and neither improved accuracy, the third check escalates to WORK (architect manual review) rather than dispatching a third fix.

---

## 10. Recheck Design

**Baseline captured at:** dispatch time — `window_7d_rate` stored in `improve_check_log` row.

**Recheck window:** 7 days after dispatch (minimum time for new signals to accumulate ≥3 samples at T+24h). The orchestrator's daily run checks every `dispatch_status = 'dispatched'` row older than 7 days that does not yet have a `rechecked_at`.

**Attribution challenge:** There is no A/B test. The before/after comparison is the only attribution method. To reduce confounding, the hypothesis logged in `improve_check_log.hypothesis` records the specific fix expected (e.g., "extended chain_catalyst TTL from 120 to 240 min"). If the fix was scoped narrowly to one signal_type, the before/after delta for that specific signal_type is the best available causal evidence.

**Loop-exit / convergence criterion:**
- `improvement_confirmed` → close the `improve_check_log` row; no further action.
- `no_improvement` after 7 days with 1 prior dispatch → re-hypothesize (consult rule-table again with updated stats).
- `no_improvement` after 7 days with 2 prior dispatches → WORK alert "signal_type X persistently below threshold — escalate to architect".
- `worsened` → freeze signal_type, WORK alert, human must unfreeze.
- `hit_rate >= 0.60 sustained over 2 consecutive weekly windows` → declare "signal_type healthy" — remove from watchlist.

---

## 11. OBSERVE Gates: Retire vs Keep

| Gate | Retire once loop is live? | Rationale |
|---|---|---|
| `post-1945-verdict-resolution-scored-pct` | YES — retire | The selfImproveOrchestrator monitors `scored_pct` drift daily; no human gate needed after loop is proven |
| `post-1945-bug-storm-silence` | YES — retire | The orchestrator reads `cron_job_runs` for `verdictResolutionJob` failure rate; a recurring failure auto-escalates |
| `1941b-signal-outcomes-seed-window` | YES — absorb | `queryCoverageGaps()` in the orchestrator covers the same question (stocks with 0 resolved outcomes) on a daily rolling basis |
| `1922g-pharma-events-source-verify` | KEEP | This is a data-source liveness check (`davPharmacyJob` tick), not a signal accuracy issue — outside the auto-improver's scope |
| `post-1944-financial-reports-q1-2026` | KEEP | BCTC pipeline check — outside accuracy loop scope |
| `post-1942-fa-verify` | KEEP | FA coverage check — outside accuracy loop scope |

In summary: 3 of 6 OBSERVE gates can be retired once Phase 1 shadow mode proves stable over 2 weeks. The other 3 are data-source liveness checks unrelated to signal accuracy.

---

## 12. Phase 1 Acceptance Criteria (Sprint 1948 scope)

**Goal:** prove the detect → hypothesis → log loop works end-to-end in shadow mode. No dispatch. No schema migration risk. Human-readable output only.

| AC | Criterion |
|---|---|
| AC-1 | `selfImproveOrchestratorJob.ts` runs daily at 09:00 UTC without error (cron_job_runs shows `success`) |
| AC-2 | For each signal_type with ≥10 samples in `signal_outcomes.outcome_24h`, the job computes 7d vs 30d accuracy_rate delta and logs to `improve_check_log` |
| AC-3 | If no degraded signal_type detected (delta < 10pp and no persistently-low type), the job logs `no_degradation` and exits cleanly — no WORK message sent |
| AC-4 | If ≥1 degraded signal_type detected, the job sends exactly 1 WORK Telegram message listing: signal_type, 30d_rate, 7d_rate, delta, hypothesis text |
| AC-5 | `improve_check_log` is created in schema-system.ts (schema migration); 1 row per job run per degraded signal_type |
| AC-6 | `SELF_IMPROVE_AUTO_DISPATCH` env var exists and defaults to `false`; job respects it (no dispatch even if set to something else in Phase 1 — Phase 1 is always shadow) |
| AC-7 | Coverage gap detection: WORK message includes list of watchlist stocks with ≥1 `agent_signals` row but 0 `signal_outcomes` resolved rows in 30d |
| AC-8 | All new code: 6+ unit tests covering detection (degraded / not degraded / insufficient sample), hypothesis lookup (known type / default), schema guard (table-absent fallback) |

**What explicitly does NOT ship in Sprint 1948:**
- Signal-bus write (`docs/signals/*.json`)
- WIP-cap check
- Auto-dispatch
- Recheck loop (Phase 1 focuses on detect + log; recheck is Phase 2)

---

## 13. Risks and Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | `signal_outcomes` sample count too low in early weeks for reliable detection (< 10 per signal_type) | HIGH for first 2 weeks | Low — job exits cleanly, no false alarms | `sample_count_30d >= 10` minimum enforced; orchestrator logs `insufficient_sample` status |
| R-2 | Two-window delta conflates seasonal market behavior with signal degradation | MEDIUM | Medium — false dispatch | Keep Phase 1 shadow-only until 2 months of data; re-evaluate threshold with empirical data |
| R-3 | `improve_check_log` table grows unbounded | LOW | Low | Add monthly prune: delete rows older than 90 days in `monthlySignalQualityJob.ts` |
| R-4 | Fix dispatched for wrong root cause (rule table too coarse) | MEDIUM | Medium — wasted dev cycle | Rule table is explicit and reviewed by architect before Phase 2; Phase 2 still has human gate |
| R-5 | WIP-cap file read is fragile (TASKS.md format change) | LOW | Low in Phase 3 | Phase 3 is opt-in; WIP cap parse failure = conservative defer (treat as WIP ≥ 2) |
| R-6 | `post-1945-verdict-resolution-scored-pct` gate fires miss before loop is live | HIGH (gate is 2026-05-20) | Medium | Loop is Phase 1 for Sprint 1948 — gate runs normally per Sprint 1947 plan; loop does not replace gate in Sprint 1948 |
| R-7 | Hypothesis rule table for novel signal types returns `_default` → vague dispatch | MEDIUM | Low — human gate in Phase 2 catches it | `_default` entries are never auto-dispatched in Phase 2 (require rule-table entry first) |
| R-8 | DB single-writer constraint: orchestrator job writes to `market.db` via `improve_check_log` | LOW | High if violated | Constraint satisfied: orchestrator runs inside mcp-server process (same writer); no cross-service write |

---

## 14. Decision: Proceed to Phase 1 in Sprint 1948?

**YES.**

Rationale:
1. The measurement substrate is proven: `signal_outcomes` + `getAccuracyStats()` + `getSystemAccuracyDigestStats()` are all deployed and tested (1945a, 1941c). The Phase 1 orchestrator only reads from these.
2. Phase 1 is purely shadow mode — no dispatch, no risk of runaway loops. The worst outcome is a false-positive WORK Telegram.
3. The `improve_check_log` schema is a simple append table. Migration risk is minimal (add-only, no alter of existing tables).
4. Sprint 1948 MVP is scoped to 3 new files + 2 modified files — achievable as a SPRINT-M task.
5. The `post-1945-verdict-resolution-scored-pct` gate (2026-05-20T07:22Z) will provide the first empirical baseline. If `scored_pct >= 60%` by then, Phase 1 will have live data to run against from day one of Sprint 1948.

**Pre-condition:** Sprint 1948 MUST NOT start until the `post-1945-verdict-resolution-scored-pct` gate clears (2026-05-20T07:22Z). If `scored_pct < 60%` at gate time, Sprint 1948 first task is fixing the resolution pipeline before wiring the orchestrator.

---

## 15. Sprint 1948 Task Breakdown (Recommended to PM)

| Task ID | Title | Zone | Size | Owner | Dependency |
|---|---|---|---|---|---|
| 1948a | `improve_check_log` schema + `improveCheckStore.ts` | apps/mcp-server/ | S | dev-mcp-server | none |
| 1948b | `degradationRules.ts` domain service + `detectDegradedSignalTypes()` | apps/mcp-server/ | S | dev-mcp-server | 1948a |
| 1948c | `selfImproveOrchestratorJob.ts` cron entry + wiring + 6 tests | apps/mcp-server/ | M | dev-mcp-server | 1948a + 1948b |
| OBSERVE-1948d | Shadow-mode 7-day observation gate (2026-05-27): confirm ≥1 WORK digest sent without error; confirm improve_check_log has rows | apps/mcp-server/ | OBSERVE | ops | 1948c deployed |
