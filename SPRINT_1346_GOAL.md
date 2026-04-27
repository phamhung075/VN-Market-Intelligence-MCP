# Sprint 1346 Goal — Alert Quality & Reliability Hardening

**Status:** PENDING (ready for BA spec)
**Sprint Number:** 1346
**Date:** 2026-04-27

---

## Vision

Fix 12 critical and high-priority quality issues surfaced by telegram reports, focusing on alert accuracy, data integrity, and infrastructure resilience. Restore full confidence in signal pipeline before expanding analysis features.

---

## Background

Sprint 1345 (News + Analysis Pipeline Hardening) is in-flight. System monitoring identified 12 new actionable issues from telegram reports:

**Critical (1):** Test stub running in production (1323)
**High (7):** Recurring UNIQUE constraint bug (1310, 1312), alert quality bugs (1311, 1320, 1321, 1322), infrastructure reliability (1316, 1317, 1313)
**Medium (2):** Cascade architecture gaps (1314, 1315)

---

## Scope

### IN (Fix in Sprint 1346)

| Task | Title | Type | Reports | Size |
|------|-------|------|---------|------|
| **1346a** | Remove test stub from production scheduler | FIX | 1323 | S |
| **1346b** | Fix push-foreign-flow UNIQUE constraint | FIX | 1310, 1312 | M |
| **1346c** | Alert quality: volume spike + NER/sentiment | FIX | 1320, 1311, 1321, 1322 | M |
| **1346d** | PDF circuit breaker + BUG channel retry + unknown stock code | FIX | 1316, 1317, 1313 | M |

**Total:** 4 tasks, 1 CRITICAL + 3 HIGH priority

### OUT (Backlog)

| Task | Title | Type | Reports | Reason |
|------|-------|------|---------|--------|
| **1346e** | Cascade architecture gaps (DSC + VPBankS/OKX) | FEATURE | 1314, 1315 | Medium priority, requires BA spec + architectural review → Sprint 1347 |

---

## Success Metrics

- **Data Integrity:** Zero test stubs in production (no simulated failures)
- **Alert Quality:** Volume spikes at natural ratios (not 5.909090), sentiment matches logic, NER resolves all aliases
- **Reliability:** Foreign-flow job runs without UNIQUE constraint errors, PDF downloads respect circuit breaker, feedback submission resilient to transient errors
- **Coverage:** All 7371 baseline tests pass, zero regressions
- **Observability:** Circuit breaker state transitions logged, retry attempts visible in logs

---

## Implementation Order

**Phase 1 (Parallel):**
1. 1346a — Remove test stub (S, 1-2h) — **CRITICAL, ship first**
2. 1346b — Fix UNIQUE constraint (M, 2-3h) — HIGH, recurring bug
3. 1346c — Alert quality bugs (M, 3-4h) — HIGH, multi-part fix
4. 1346d — Infrastructure resilience (M, 2-3h) — HIGH, 3-part fix

**All can run in parallel** (different code areas, no shared dependencies)

**Phase 2:**
- QA integration test + sign-off
- Smoke test live feed (1h)

---

## Blockers / Dependencies

None. Ready to spawn BA for spec immediately.

---

## Risk Assessment

**Low risk:**
- 1346a: Straightforward code removal
- 1346b: Proven pattern (ON CONFLICT syntax exists in codebase)
- 1346c.2 + 1346c.4: Configuration changes to NER/alias registry

**Medium risk:**
- 1346c.1: Volume spike math change (could affect false negatives if window logic wrong)
- 1346c.3: Sentiment negation rules (could break existing positive sentiment detection)
- 1346d.1: Circuit breaker changes (could block legitimate retries if threshold too low)

**Mitigation:**
- Each fix has isolated tests
- Baseline: 7371 tests must pass (no regressions)
- Smoke test: live alert feed for 1h post-deploy

---

## Size Estimate

- **Total:** M (10–15h)
- Breakdown: 1346a (1-2h) + 1346b (2-3h) + 1346c (3-4h) + 1346d (2-3h) + QA (1-2h) + deployment (0.5h)
- **Critical path:** 1346a ships first (1-2h), then 1346b–1346d parallel (3-4h in flight)

---

## Next Agent

**BA** — Write requirement spec for Sprint 1346 vision.

Handoff: SPRINT_1346_GOAL.md (this file)
Input: Four handoff documents (TASK_1346a–1346d.md)
Output: `docs/REQ_1346.md`

---

## Decision Log

**Why not defer cascade gaps (1346e)?**
- Medium priority (not HIGH/CRITICAL)
- Requires architectural review (not quick fix)
- Can be Sprint 1347 task after critical issues resolved
- Deferral unblocks 1346a–1346d to ship faster

**Why parallel execution (1346a–1346d)?**
- Different code modules: scheduler, DB, NER/sentiment, PDF/circuit-breaker
- No shared file conflicts
- Developer team can parallelize without race conditions
- Reduces critical path time: 1-2h → 3-4h (vs. sequential 8-12h)

**Why QA smoke test (live feed)?**
- Unit + integration tests verify logic
- Live smoke test verifies: real news → correct alerts, no false positives
- 1h test is acceptable risk (not production blocking)

---

## Sprint History Context

- **Sprint 1344:** Fixed 9 test failures (6536→7371 pass, 213→0 fail) ✓ DONE 2026-04-27
- **Sprint 1345:** News + Analysis Pipeline Hardening (in-flight)
- **Sprint 1346:** Alert Quality & Reliability (THIS SPRINT — TBD)

Cumulative: 358 tasks completed, infrastructure baseline solid at 7371 tests.

---

End of Sprint 1346 Goal
