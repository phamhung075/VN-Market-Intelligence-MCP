# Decision Journal — Sprint FIX-BASE-RATE-COMPUTATION-CRON-DEAD · dev-mcp-server

**Sprint goal:** Fix (or honestly surface staleness of) baseRateComputationJob — reported ~20 days stale.
**Agent:** dev-mcp-server
**Started:** 2026-07-23T22:31:25Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T22:31:25Z
**task-id:** FIX-BASE-RATE-COMPUTATION-CRON-DEAD
**what-done:** RAW-verified live (docker exec, production market.db) that baseRateComputationJob IS registered/daily/100%-success, but `evidence_likelihood_ratios` (its output) hasn't gotten a real content update since 2026-06-28 — writes have been honestly 0 every day since, because its sole input `evidence_fragments` was empty from 06-28..07-19 (a documented ~19-day restart-storm window, same class already fixed for 5 sibling jobs) and only has 4 fresh days since, not yet old enough to clear the 5d resolvability horizon.
**what-considered:**
- Chase the evidence_fragments upstream gap itself — rejected: already tracked (FIX-EVIDENCE-PIPELINE-STARVED), self-recovered as of 07-19, out of this S-size task's scope.
- Leave the job untouched (NO_CHANGE_NEEDED) since 0-output is honest — rejected: found a REAL reachable bug (double-recordJobRun noisy telemetry, same class already fixed for evidenceAccumulatorJob) plus a missing startup-catchup probe (same restart-timing class as 5 already-fixed siblings) that directly explains the historical dead window.
- Fix both reachable defects + flag the dependency chain — CHOSEN: matches task's PARTIAL/FLAG guidance exactly.
**why-decision:** Both fixes are precedent-matched (identical shape already shipped for sibling jobs this session/last), low-risk, in-zone, and directly address the reported symptom class (silent staleness surviving restarts) without touching the honest upstream-data gap.
**why-change:** No change from plan — task explicitly allowed PARTIAL + dependency flag as an honest outcome.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T22:31:25Z
**task-id:** FIX-BASE-RATE-COMPUTATION-CRON-DEAD
**what-done:** While writing the new regression test, discovered `FACTORY-SCHEDULER-job-table-registry.test.ts`'s `installScheduleCronSpy()` leaves a process-global `mock.module("../scheduler/startupHelpers.js", ...)` stub active for the rest of the `bun test` process (no restore) — silently made `shouldRunCatchup`/`runBaseRateComputationWithDb` resolve to no-op stubs in my new file when both run in the same suite.
**what-considered:**
- Edit FACTORY-SCHEDULER-job-table-registry.test.ts to add a real restore — rejected: out-of-zone-task scope, touches another task's shipped test file.
- Weaken my new tests to avoid exercising the real default path — rejected: would hide the exact wiring I need to prove (T6/T7/T10 are the load-bearing assertions).
- Apply the established in-repo workaround (034/1298b/084-tool-market precedent: `?isolate=` query-busted dynamic `import()` of the real module) — CHOSEN.
**why-decision:** This is a documented, already-used idiom in this exact codebase for this exact class of pollution; zero risk, zero out-of-zone edits, fully deterministic regardless of file execution order (verified both orders + full 25-file batch + full suite).
**why-change:** Unplanned discovery mid-task; resolved without expanding scope.
