# Sprint Goal

## Sprint 1349 — Code Health + Observability Infrastructure (2026-04-27)

**Status:** READY - Autonomous PO initiation. All prior sprints merged, baseline stable.

**Background:**
Sprints 1345–1348 complete (News pipeline hardening, Alert quality fixes, Cascade architecture enhancements). System infrastructure solid: 7371 baseline tests passing, zero regressions. Code health audit (2026-04-24) identified 1 low-priority technical debt item + opportunity for monitoring improvements.

**Confirmed Open Items (from audit 2026-04-24):**

1. **Code Quality: Unused Scheduler Configuration (LOW)** — mcp.config.json lines 111–119 contain dead "scheduler" section. Config loader in src/infrastructure/config.ts never reads it. Canonical source is src/scheduler/jobs.ts:CRONS. Fix: remove dead section (5 min, zero risk).

2. **Observability: Missing Circuit Breaker Metrics (MEDIUM)** — PDF download + Reuters fallback + foreign-flow jobs have circuit breakers but no observable state transitions. Logs silent on state changes. Need: structured logging of CB open/half-open/closed transitions for ops visibility.

3. **Observability: Job Health Timings (MEDIUM)** — No cycle-time metrics for ta-alerts, bb-alerts, macro-refresh. Ops cannot detect slowdowns before they cascade. Need: duration + error-rate histograms per job.

4. **Test Coverage: Financial Validation Edge Cases (LOW)** — 1345b added BCTC confidence scoring but untested: what if all fields are zero? What if reportDate is invalid? Edge cases exposed by crash in production logs.

5. **Documentation: Scheduler Module Path Stale (MEDIUM)** — docs/agent-memory/modules/scheduler.md references src/infrastructure/scheduler/ but post-refactor paths are src/scheduler/ with 8 subdirectories. 42 job files present, paths broken. Fix: update 57 lines to reflect current structure.

**Vision:**
Ship technical debt cleanup + monitoring improvements in parallel. Establish observability foundation for 24/7 ops reliability. Zero new features; 100% internal quality focus.

**Scope:**

| Task ID | Title | Layer | Size | Owner |
|---------|-------|-------|------|-------|
| 1349a | Remove dead scheduler config + verify coverage | Code | S | Developer |
| 1349b | Add circuit breaker state logging + metrics | Infra | M | Developer |
| 1349c | Fix scheduler.md paths + job count validation | Documentation | S | Code Janitor |
| 1349d | BCTC validation edge cases + test expansion | Test | S | Developer |
| 1349e | Job cycle timings + ops dashboard metrics | Infra | M | Developer |
| 1349f | Integration test + observability verification | Test | S | QA |

**Success Metrics:**
- Dead code removed: mcp.config.json lines 111–119 deleted (commit verified)
- CB state logging: Every CB transition logged with timestamp + state + reason (INFO level)
- Job metrics: ta-alerts, bb-alerts, macro-refresh all have cycle_duration_ms + error_count metrics
- Financial validation: ≥4 edge-case tests added (all-zero fields, invalid dates, boundary values)
- Scheduler.md: 100% of 42 jobs have correct file paths (verified by grep)
- Test baseline: ≥7371 pass, zero regressions
- Ops readiness: Logs + metrics sufficient for ops team to detect issues within 1 cycle

**Blockers:** None. Infrastructure stable, no dependencies.

**Next Agent:** BA (write requirement spec for optional 1349b–1349e detail refinement) OR Developer (execute 1349a immediately as known low-risk task).

---

## Retrospective: Sprint 1345–1348

**1345:** News + Analysis Pipeline Hardening — Reuters fallback (Google News + VPS TE), BCTC validation (VNM/VEA corruption detection), Polymarket 24h guard, VN-Index market-wide cascade. All merged 2026-04-27 (7355 pass).

**1346:** Alert Quality & Reliability — Remove test stub from prod (1346a), fix foreign-flow UNIQUE (1346b), alert quality fixes (1346c-a/c-b volume/sentiment/NER), PDF circuit breaker race fix (1346d). All merged 2026-04-27 (7371 pass).

**1347:** Infrastructure Isolation + Data Expansion — Test DB isolation (clean 2537 leaked rows), stock-classification expansion (5→30 tickers, all tradeExposure). All merged 2026-04-27 (7423 pass).

**1348:** Cascade Architecture Enhancement — Brokerage/banking competitive signals (BK-1 sentiment routing + FR-3 competitive threat mapping with affected_actions). Merged 2026-04-27 (7371 pass baseline restored).

Cumulative: 362 tasks completed, infrastructure comprehensive, code quality baseline established.

---

**Decision Log:**
- Why code health now vs. features? → Infrastructure stable; investment in quality pays dividends in ops reliability + future feature velocity.
- Why observability before features? → Current job cycle times unknowable; cannot detect degradation until cascade (2–3 minutes lag). Metrics prevent outages.
- Why not schedule 1349 as small sprint? → Scope is tight (6 small–medium tasks), natural parallel shape (1349a + 1349c parallel, 1349b + 1349e parallel, 1349d independent).
- Why developer owns infrastructure tasks? → All require code changes (logging + metrics middleware); ops cannot execute autonomously.

---

**Size Estimate:** S (5–7h: 1349a 0.5h + 1349c 0.5h + 1349b 1.5h + 1349e 1.5h + 1349d 1h + 1349f 0.5h + QA 0.5h)

**Priority:** MEDIUM (technical debt + operational readiness, no user-facing urgency)

**Dependencies:** None. Ready to proceed independently.

---

## Next Steps

1. **Immediate (now):** PO confirms Sprint 1349 goal, spawns BA for optional spec or Developer for 1349a
2. **1349a–1349c (parallel):** Code janitor + developer (dead code cleanup, documentation fix)
3. **1349b + 1349e (parallel):** Developer (circuit breaker logging + job metrics)
4. **1349d (independent):** Developer (edge case tests)
5. **1349f (final):** QA (integration verification)
6. **Sign-off:** PO approves deliverables, marks sprint complete

---

**Status:** Sprint 1349 fully specified. Ready for BA approval (optional) or Developer execution (1349a immediate).
