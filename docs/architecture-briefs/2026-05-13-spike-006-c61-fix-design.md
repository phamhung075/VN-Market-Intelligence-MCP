---
id: ARCH_SPIKE_006_c61
title: Technical design — Alert scoring unification (SPIKE_006 fix)
date: 2026-05-13
cycle: c61
author: architect
status: ready
zone: apps/mcp-server/
source_req: docs/REQ_SPIKE_006_c61.md
source_rca: docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md
---

# Technical Design: SPIKE_006 Alert Scoring Unification

## 1. Brownfield Scan

**scoreAlert (Path 2) callers — exhaustive:**
- `alertAccuracy.ts` L313 — only call site (internal, not exported)
- No other file calls `scoreAlert`. Deletion is safe; zero external breakage.

**formatAccuracyReport callers:**
- `alertAccuracy.ts` registerAlertAccuracyTool — MCP tool handler (interface)
- `dailyDashboardJob.ts` L569 — scheduler, reads `AccuracyReport` shape (uses `total`, `hits`,
  `misses`, `unknowns`, `text`, `scored_pct`, `summary_by_type`)
- No other callers found.

**AccuracyReport type consumers:**
- `dailyDashboardJob.ts` L81 — `Pick<AccuracyReport, ...>` pinned to existing fields.
  Adding `insufficientSample: boolean` is additive. No breaking change.

**alert-verdicts.json consumers (read path):**
- `verdictResolutionJob` reads via `alertVerdictStore.readVerdicts()`
- `alertVerdictTools.ts` calls `appendVerdict` (write at fire time — MCP tool)
- `formatAccuracyReport` does NOT read `alert-verdicts.json` — confirmed. No consumer
  reads verdicts to feed the accuracy metric today.
- After AC-5 write-back: `verdictResolutionJob` writes to `alerts.outcome` (DB).
  `formatAccuracyReport` Path 1 reads `alerts.outcome`. No double-count risk: the write-back
  path sets `outcome` in DB, which Path 1 consumes directly. `alert-verdicts.json` remains
  the verdict store but is no longer the accuracy source of truth.

**writeAlertOutcome idempotency (E-5 / OOS-1):**
- `alertStore.ts` L274: `UPDATE alerts SET outcome=?, outcome_at=datetime('now'),
  outcome_detail=? WHERE id=?` — unconditional overwrite (no INSERT OR IGNORE pattern).
  `alreadyScored` flag is returned but write still executes. This IS idempotent for
  correctness (last-writer-wins), but if `alertOutcomeJob` and `verdictResolutionJob`
  race on the same row, the verdict job will overwrite a job-scored outcome.
  **Risk: ACCEPTABLE.** Verdict job runs hourly; alertOutcomeJob runs daily. Window is
  narrow. Outcome value converges (both write HIT/MISS based on same price move).
  No guard needed for this sprint.

**OOS-5 (resolveDirection flat-band bug):**
- `verdictResolutionJob.ts` L71: `abs(pct) < 1.0 → "confirmed"` regardless of direction.
  A bearish alert with price_move = +0.9% resolves as "confirmed" → maps to HIT after
  write-back. This inflates HIT count by up to ~10% of resolved rows.
  **Verdict: fix in same T-5 task.** One-liner: remove the flat-band early-return; only
  `confirmed` when direction and pct agree. Low risk, high correctness gain.

## 2. DDD Layer Review

BA spec layering is correct. One flag to add:

| Concern | BA spec | Architect verdict |
|---|---|---|
| AC-1 scorer wiring | interface delegates to domain | Correct |
| AC-2 intraday gate | interface (query decision) | Correct |
| AC-3 threshold | domain | Correct — `hitThresholdPct` is a domain rule |
| AC-4 sample guard | interface (display policy) | Correct |
| AC-5 write-back | infra (scheduler → alertStore) | Correct |
| **`calendarDaysElapsed` computation for Path 2** | **not addressed** | **FLAG** |

**AC-2 implementation gap:** Domain scorer `scoreAlertOutcome` accepts `calendarDaysElapsed`
as caller-supplied input (pure function). In Path 2 (interface), the caller must compute
this value before calling the domain scorer. Currently `scoreAlert` computes it implicitly
from `alertTime` vs `new Date()` at query time. The interface must compute
`calendarDaysElapsed = Math.floor((now - triggeredAt) / 86_400_000)` and pass it in.
This is interface layer computation — no domain change. Developer must add this to T-3.

**Composite threshold (OOS-2):** `composite` class `hitThresholdPct = 0.1` — leave at 0.1
for now. Composite alerts mix signal types; raising arbitrarily without calibration data
risks overcorrecting. Confirm in BA spec: OOS-2 deferred.

**`alertAccuracy.ts` already imports `writeAlertOutcome` and `AlertOutcome`** from
`alertStore.ts` (L36-37) for `mark_alert_outcome` tool. No new import needed for T-2/T-3.

## 3. Atomic Task Confirmation

BA's 6-S tasks confirmed with one revision:

| Task | Change from BA spec | Reason |
|---|---|---|
| T-1 | No change | Threshold raise is one constant edit + 2 test cases |
| T-2 | No change | Delete `scoreAlert`, wire Path 2 to domain scorer |
| T-3 | **Add:** compute `calendarDaysElapsed` before domain call | AC-2 requires caller to supply elapsed days to pure function |
| T-4 | No change | Add `insufficientSample` to `AccuracyReport`, gate display |
| T-5 | **Add:** fix OOS-5 flat-band bug in `resolveDirection` | One-liner; same file; low risk; fixes HIT inflation in write-back |
| T-6 | No change | Integration test confirming single code path |

**T-2 + T-3 merge decision:** BA spec notes these may be merged if coupling is tight.
**Verdict: keep separate.** T-2 deletes `scoreAlert` and wires the domain call (no date
math). T-3 adds the `calendarDaysElapsed` computation and gates the intraday fallback.
Separate commits allow bisect if intraday gate breaks something. Total remains 6 tasks.

## 4. Test Strategy

**Unit tests (zero DB, zero infra):**
- `1847d-alert-outcome-scorer.test.ts`: AC-3 threshold cases (0.5% → UNKNOWN, 1.1% → HIT).
  Pure function — no mock needed.
- `183-alert-accuracy.test.ts`:
  - AC-1: inject a NULL-outcome `AlertRow` with a mock domain scorer; verify `formatAccuracyReport`
    returns same result as direct `scoreAlertOutcome` call. Mock `getDb()` or pass priced rows
    directly — `formatAccuracyReport` is already exported and testable.
  - AC-2: set `triggered_at = 14:00 GMT+7 today`; verify `calendarDaysElapsed = 0` prevents
    domain scorer from returning a non-UNKNOWN when no multi-day price exists.
  - AC-4: inject 9 rows (2 HIT, 7 MISS); verify `insufficientSample = true` and no accuracy
    percentage in text output.
- `1863b-verdict-resolution-job.test.ts`:
  - AC-5 normal: inject `confirmed` verdict → verify `writeAlertOutcome` called with `'HIT'`.
  - AC-5 false_positive: inject `false_positive` → verify `writeAlertOutcome` called with `'MISS'`.
  - E-3: inject verdict with nonexistent alert ID → verify no throw, row remains resolved.
  - OOS-5: inject bearish alert with +0.9% move → verify `confirmed` is NOT returned after fix.

**Integration test (T-6 — `SPIKE006-scoring-unification.test.ts`):**
- End-to-end through `formatAccuracyReport` with mock domain scorer injected via dependency
  seam. Verifies `scoreAlert` is no longer an exported or internally reachable symbol.
- Note: `scoreAlert` is not exported today — the integration test should verify via
  module inspection (import the module object and assert `scoreAlert` key is absent).
- Use `:memory:` SQLite (auto-injected by test setup).

**n<20 guard and intraday gate are pure-function paths — unit tests are sufficient; no
integration test needed for these two behaviors.**

## 5. Ship Order (safe interleaving)

Recommended sequential order with partial-rollback gate at each step:

```
T-1 (threshold raise, domain-only)
  → gate: 1847d tests pass, no interface touched
T-3 (intraday gate + calendarDaysElapsed computation)
  → gate: 183 AC-2 test passes; Path 2 still works for calendarDaysElapsed >= 1
T-2 (delete scoreAlert, wire Path 2 to domain scorer)
  → gate: 183 AC-1 test passes; end-to-end Path 2 produces same result as direct scorer call
T-4 (sample guard)
  → gate: 183 AC-4 test passes; dailyDashboardJob formatAccuracyReport call unaffected
        (insufficientSample is additive — Pick type in dashboard still compiles)
T-5 (write-back + OOS-5 flat-band fix)
  → gate: 1863b AC-5 + OOS-5 tests pass; no existing 1863b tests broken
T-6 (integration test)
  → gate: all 6 test files green; baseline 8804 tests preserved
```

Rationale: T-1 first isolates the only domain change before any interface surgery. T-3
before T-2 ensures the date-math scaffolding is in place before Path 2 is wired to the
domain scorer (avoids a state where Path 2 calls domain scorer without elapsed days).
T-5 last because write-back is additive to the running system — does not affect accuracy
reporting until verdicts accumulate.

## 6. Flags for Developer

- **`scoreAlert` is NOT exported.** Verify by importing `alertAccuracy` in T-6 integration test
  and asserting the function is absent from module exports.
- **`writeAlertOutcome` already imported** in `alertAccuracy.ts` — `verdictResolutionJob.ts`
  will need a new import. Confirm `alertStore.ts` path: `../../infrastructure/db/alertStore.js`.
- **`verdictResolutionJob` DDD comment at L17** says "MUST NOT import from domain/ or
  application/" — `writeAlertOutcome` is infrastructure, so the import is layer-compliant.
- **`dailyDashboardJob` type compatibility:** adding `insufficientSample: boolean` to
  `AccuracyReport` is additive; the `Pick<AccuracyReport, ...>` in `dailyDashboardJob.ts` L81
  does not include `insufficientSample`, so no dashboard change needed.
- **OOS-1 confirmed:** no ALTER TABLE required. `outcome`, `outcome_at`, `outcome_detail`
  columns confirmed present from Task 1847d-A.
