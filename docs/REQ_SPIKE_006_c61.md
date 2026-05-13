---
id: REQ_SPIKE_006_c61
title: Alert accuracy scoring unification — SPIKE_006 fix
date: 2026-05-13
cycle: c61
author: ba
status: draft
size: M
zone: apps/mcp-server/
baseline_tests: 8804
source_brief: docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md
next_hop: architect
---

# REQ_SPIKE_006_c61 — Alert Scoring Unification

## 1. Problem Statement

**Observed:** `get_alert_accuracy` reports 22% (2/9 scored) against a 60% target.
Trend is worsening: same metric was 35% at c39 (2/141 scored = coverage gap), now 22%
at c60 (n=9 scored = near-zero denominator). Source: brief §3-§5.

**Root causes (brief §4, verdict H-A CONFIRMED HIGH):**

1. **Dual scoring systems.** Three code paths independently score outcomes and never
   share results: (a) `alertAccuracy.ts` Path 2 on-the-fly `scoreAlert()`, (b)
   `alertOutcomeScorer.scoreAlertOutcome()` called by `alertOutcomeJob`, (c)
   `verdictResolutionJob` → `alert-verdicts.json`. `formatAccuracyReport` reads only
   paths (a)/(b); verdict job writes to a separate JSON file that is currently empty.
   `alert-verdicts.json` = `[]` confirmed — verdictResolutionJob contributes zero rows.

2. **Intraday fallback bias.** `alertAccuracy.ts` L206-217: when no 1-3 day price
   exists, falls back to a 1-12h window. VN market (09:00-15:00 GMT+7) closes daily;
   alerts fired during intraday dips can bounce within the same session and score MISS
   even when the drop was genuine. Same-session bias inflates MISS count.

3. **Noise-floor threshold.** `alertOutcomeScorer.ts` L113-116: `price-signal`
   `hitThresholdPct = 0.1` for price_drop/price_surge. A 0.2% move triggers HIT — below
   any meaningful signal. `alertAccuracy.ts` Path 2 also uses 0.1% (L226). No alignment
   between the two on what "meaningful" means.

4. **No sample-size guard.** `formatAccuracyReport` L340-341: `hitPct = hits / (hits +
   misses)`, UNKNOWN rows excluded from denominator. At n=9 the reported % is
   statistically meaningless, yet the 60% target is applied directly.

5. **verdictResolutionJob isolated.** Resolved rows written to `alertVerdictStore`
   (JSON) are never written back to `alerts.outcome` column. `get_alert_accuracy`
   queries the DB column only. The two stores are disconnected.

---

## 2. Acceptance Criteria

**AC-1 (scorer unification):** `alertAccuracy.ts` Path 2 `scoreAlert()` is removed.
When `alerts.outcome` IS NULL, `formatAccuracyReport` calls
`alertOutcomeScorer.classifyAlertType()` + `scoreAlertOutcome()` instead of the local
`scoreAlert()`. A test with a NULL-outcome alert row must produce the same result from
the MCP tool as calling `scoreAlertOutcome()` directly with the same inputs.

**AC-2 (intraday fallback gated):** The 1-12h intraday fallback in scoring is removed
or gated to only activate when `calendarDaysElapsed >= 1` (at least one full trading
day elapsed since `triggered_at`). A test fires an alert at 14:00 GMT+7 and verifies
the same-session 12h window is NOT used for scoring until the following calendar day.

**AC-3 (price-signal threshold raised):** `alertOutcomeScorer.ts` `hitThresholdPct`
for `price-signal` class (both `price_drop` and `price_surge`) is raised from `0.1`
to `1.0`. A test verifies a 0.5% actual move scores UNKNOWN (below new threshold)
and a 1.1% move scores HIT.

**AC-4 (sample-size guard):** `formatAccuracyReport` returns a structured
`insufficient_sample` flag (and corresponding Vietnamese text) when
`scoreable (hits + misses) < 20`. The existing accuracy percentage must NOT be
displayed when the guard fires. A test with n=9 must trigger the guard.

**AC-5 (verdict-to-outcome write-back):** `verdictResolutionJob` writes
`confirmed` → `HIT` and `false_positive` → `MISS` back to `alerts.outcome` (and
`outcome_at`, `outcome_detail`) via `writeAlertOutcome()` from `alertStore.ts`, for
each row it resolves. A test injects a resolved verdict and confirms the DB alert row
receives `outcome = 'HIT'` or `'MISS'` after the job runs.

---

## 3. DDD Layer Mapping

| Requirement | File | DDD Layer | Rationale |
|---|---|---|---|
| AC-1 scorer unification | `alertOutcomeScorer.ts` | **Domain** | Pure scoring logic — no I/O, no DB. Single source of truth for HIT/MISS rules. |
| AC-1 wiring removal | `alertAccuracy.ts` | **Interface** | MCP tool layer; delegates scoring to domain, never reimplements it. |
| AC-2 intraday gate | `alertAccuracy.ts` | **Interface** | Temporal guard is a query decision at the interface boundary. The domain scorer already accepts `calendarDaysElapsed` — no domain change needed. |
| AC-3 threshold raise | `alertOutcomeScorer.ts` | **Domain** | `hitThresholdPct` is a domain rule (what constitutes a meaningful signal). |
| AC-4 sample guard | `alertAccuracy.ts` | **Interface** | Report formatting and display rules belong in the interface/output layer; the guard is a reporting policy, not a scoring rule. |
| AC-5 write-back | `verdictResolutionJob.ts` | **Infrastructure** | Scheduler job reads from infra fileStore and writes to infra DB store (`writeAlertOutcome`). No domain logic introduced. |

---

## 4. Functional Requirements

**FR-1 (domain):** `alertOutcomeScorer.classifyAlertType` + `scoreAlertOutcome` become
the single canonical scoring path for all alert types. `alertAccuracy.ts` local
`scoreAlert()` function is deleted.

**FR-2 (domain):** `price-signal` `hitThresholdPct` changed: `0.1 → 1.0` (both
directions). `composite` threshold is a separate decision — flag for architect (see §7).

**FR-3 (interface):** `formatAccuracyReport` gains an `insufficientSample` boolean
field in `AccuracyReport`. When `scoreable < 20`, text output prepends
"Chua du du lieu danh gia (N=X, can ≥20)" and skips the accuracy percentage line.

**FR-4 (interface):** Intraday fallback in `alertAccuracy.ts` is removed. The domain
scorer's `calendarDaysElapsed` parameter drives window eligibility.

**FR-5 (infrastructure):** `verdictResolutionJob` imports `writeAlertOutcome` from
`alertStore` and calls it after `updateVerdict` for each resolved row, mapping
`confirmed → 'HIT'` and `false_positive → 'MISS'`.

---

## 5. Non-Functional Requirements

**NFR-1 (correctness):** After fix, `get_alert_accuracy` and `verdictResolutionJob`
must read/write the same `alerts.outcome` column — no parallel truth table.

**NFR-2 (backwards compatibility):** `AlertRow.outcome` path 1 (non-null pre-scored
rows) must continue to be used as-is; the fix targets path 2 only.

**NFR-3 (testability):** Domain scorer remains pure (zero infra imports). All new
behavior is unit-testable without DB.

**NFR-4 (performance):** No new DB queries introduced per alert row in the scoring
hot path. `verdictResolutionJob` write-back is one INSERT/UPDATE per resolved verdict
row — acceptable at hourly cadence.

---

## 6. Edge Cases

**E-1 (VN market close):** Alert fired at 14:45 GMT+7 — intraday window could return
a price 15 minutes later (same session). After fix: this alert must not be scored
until the next calendar day's price exists.

**E-2 (missing affected_actions_json):** Path 2 calls `scoreAlertOutcome` which
requires a stock code upstream. If `extractPrimaryCode` returns null, the row is
skipped (existing behavior preserved — brief H-B partial, not fixed here).

**E-3 (verdict with no matching alert ID):** `verdictResolutionJob` write-back must
handle the case where `alerts` row was deleted (TTL pruned). `writeAlertOutcome`
should be called inside a try/catch; failure is logged, row stays resolved in verdict
store, no Telegram BUG triggered (not a blocking error).

**E-4 (n=0 scoreable):** `formatAccuracyReport` with all UNKNOWN rows must return
`insufficient_sample = true` and not divide by zero. Existing zero-guard on `scoreable`
at L340 covers this — verify preserved after refactor.

**E-5 (concurrent scoring):** `alertOutcomeJob` and `verdictResolutionJob` may both
attempt to write `alerts.outcome` for the same alert. `writeAlertOutcome` must be
idempotent (UPDATE if exists). Architect to confirm DB write semantics.

---

## 7. Out of Scope — Flags for Architect

**OOS-1 (schema migration):** `alerts.outcome`, `outcome_at`, `outcome_detail` columns
already exist (Task 1847d-A). No schema migration needed for this fix. Architect must
confirm no ALTER TABLE is required.

**OOS-2 (composite threshold):** `composite` class `hitThresholdPct = 0.1` is a
separate calibration question (brief §5 does not specify it). Leaving at 0.1 for now.
Architect to decide whether composite follows price-signal raise.

**OOS-3 (alertOutcomeJob skip-rate logging):** Brief §6(a) — measuring skip rate from
missing `affected_actions_json` requires a logging pass on `alertOutcomeJob.ts`. Not
in this fix batch; defer to follow-up.

**OOS-4 (60% target denominator definition):** Brief §6(c) — whether the 60% target
is `hits/scoreable` or `hits/total` is unresolved. AC-4 sample guard defers the
metric entirely when n<20; the denominator question defers to a follow-up sprint once
sample is adequate.

**OOS-5 (resolveDirection flat-band bug):** `verdictResolutionJob.ts` L71:
`abs(pct) < 1.0 → "confirmed"` regardless of direction. This inflates confirmed count
but is orthogonal to the write-back gap (AC-5). Flag for architect review in the same
task — low-risk one-liner fix if architect agrees.

---

## 8. File-Level Test Plan

| Test file | Action | What it verifies |
|---|---|---|
| `183-alert-accuracy.test.ts` | UPDATE | Add case: NULL-outcome alert row uses domain scorer path (AC-1). Add case: n=9 triggers `insufficient_sample` guard (AC-4). Add case: intraday window not used when same-calendar-day (AC-2). |
| `1847d-alert-outcome-scorer.test.ts` | UPDATE | Add case: `price-signal` 0.5% move → UNKNOWN (AC-3). Add case: `price-signal` 1.1% move → HIT (AC-3). |
| `1863b-verdict-resolution-job.test.ts` | UPDATE | Add case: after resolution, injected `writeAlertOutcome` called with `HIT` for `confirmed` verdict (AC-5). Add case: `false_positive` verdict maps to `MISS` (AC-5). Add case: missing alert ID does not throw (E-3). |
| `SPIKE006-scoring-unification.test.ts` | NEW | Integration: end-to-end `formatAccuracyReport` with mock domain scorer injected confirms single code path. Verifies `scoreAlert` local function no longer exists in module exports. |

---

## 9. Blockers for PO

**BLK-1:** Brief §6(c) — 60% accuracy target: is the denominator `hits/scoreable`
(excluding UNKNOWN) or `hits/total`? This affects whether AC-4 sample guard is
sufficient or whether the metric definition itself must change. Low urgency for this
sprint (AC-4 defers display when n<20) but must be resolved before next accuracy KPI review.

No other PO-only blockers. All fix decisions in §7 are architect-scope.

---

## 10. Estimated Atomic Task Count (for PM)

| Task | Scope | Layer | Est. size |
|---|---|---|---|
| T-1: Raise `hitThresholdPct` 0.1→1.0 + update `1847d` tests | `alertOutcomeScorer.ts` | Domain | S |
| T-2: Delete `scoreAlert()` in `alertAccuracy.ts`, wire Path 2 to domain scorer | `alertAccuracy.ts` | Interface | S |
| T-3: Remove/gate intraday fallback + update `183` tests | `alertAccuracy.ts` | Interface | S |
| T-4: Add `insufficient_sample` guard to `formatAccuracyReport` + tests | `alertAccuracy.ts` | Interface | S |
| T-5: Add `writeAlertOutcome` call in `verdictResolutionJob` + update `1863b` tests | `verdictResolutionJob.ts` | Infra | S |
| T-6: New integration test `SPIKE006-scoring-unification.test.ts` | `__tests__/` | — | S |

**Total: 6 atomic S tasks** (architect may merge T-2+T-3 if implementation coupling is tight).
