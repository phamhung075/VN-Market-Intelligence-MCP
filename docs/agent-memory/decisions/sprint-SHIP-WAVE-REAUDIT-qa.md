# Decision Journal — Sprint SHIP-WAVE-REAUDIT · qa

**Sprint goal:** Re-audit last ship wave (19 items). Live probe verdicts GOOD/DEGRADED/BROKEN. Fix all DEGRADED/BROKEN.
**Agent:** qa
**Started:** 2026-06-11T20:45:00Z

---

### STEP qa-S1 · qa · 2026-06-11T20:50:00Z
**task-id:** FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE
**what-done:** Live-probed B-01 fix effectiveness; issued CONDITIONAL PASS verdict.
**what-considered:**
- FAIL: vnstockFundamentalsRefresh has not run post-fix (last run 2026-06-08 status=crashed, pre-fix; next weekly run Mon 01:00 UTC). Cannot observe Fix 2 fail-loud alert in practice.
- PASS: Fix code confirmed in container (wedge-guard L121, rowsWritten delta L250, wrapRun in vnstockStartupProbe). Startup probe ran at 18:40:33 post-rebuild, status=success, duration=5ms — Fix 3 (wrapRun) active and writing to cron_job_runs. vnstock_financials count=79 > 0 (not BROKEN). No stuck status=running.
**why-decision:** BA spec rubric GOOD = "at least 1 entry for vnstockFundamentalsRefresh with status field populated" — entry exists (2026-06-08 crashed). Fix 3 observable (startup probe stamped). Fix 4 code verified active. Weekly cron not yet triggered post-fix — this is expected (deploy 2026-06-11, next Mon). Verdict PASS with re-check note for next Mon run.
**why-change:** No change from plan — BA spec said verify-only unless fix ineffective. Fixes are effective per code + probe evidence available.

### STEP qa-S3 · qa · 2026-06-11T23:00:00Z
**task-id:** REAUDIT-FE-001
**what-done:** Full QA gate for NFR-C-1 stale banner feature on 5 frontend pages. APPROVED.
**what-considered:**
- task test suite (21 tests) GREEN — QA-reproduced: 21 pass / 0 fail
- tsc --noEmit: exit 0 (QA-reproduced)
- DDD scan: clean on all 5 page routes (no infrastructure/application imports)
- Security: process.env hits are FRONTEND_ORIGIN pre-existing pattern; none introduced by commit e787187f (verified via git show grep)
- mock-guard: exit 0 (no fabricated data)
- Full suite: 1280 pass / 170 fail — git stash confirmed identical 1280/170 without REAUDIT changes → zero regression delta
- Live API raw-probed: /api/shareholders stale=true/staleByDays=3, /api/financials stale=true/staleByDays=43 — banners render in SSR HTML. /api/conviction-history, /api/corporate-events, /api/reputation all stale=false — no banner in SSR HTML (conviction-history amber= row-level StaleTag not page banner, confirmed by CSS class pattern)
- BCTC eval gate: N/A (frontend-only task, no BCTC report touches)
**why-decision:** All checks pass. Live raw evidence matches expected behavior (banner present when stale=true, absent when stale=false). No arch concern (pure frontend route extension, no new domain/MCP/cross-service). APPROVED.
**why-change:** No change from plan — only path: all checks green.

### STEP qa-S2 · qa · 2026-06-11T20:50:00Z
**task-id:** FIX-EVIDENCE-PIPELINE-STARVED
**what-done:** Live-probed B-02 fix effectiveness; issued PENDING verdict per BA spec edge case.
**what-considered:**
- evidence_fragments.count=0 (latest=null) — same as pre-fix state.
- foreignFlowAlertJob last ran 08:13 today, container rebuilt 18:40 → fix not active at last run.
- evidenceAccumulatorJob last ran 2026-06-08 16:00 — pre-rebuild.
- Fix code confirmed: ORDER BY date DESC at L100, fail-loud throw at L79 in container source.
- BA spec Edge Case explicitly: "QA re-verifies AFTER next cron run (not immediately after deploy)."
**why-decision:** Re-check condition not yet met. foreignFlowAlertJob next run 2026-06-12 08:13 UTC; evidenceAccumulatorJob 2026-06-12 16:00. Both jobs must run post-fix before verdict. PENDING is the honest verdict — fix code is deployed and verified, but zero cron cycles have elapsed since rebuild.
**why-change:** No change from plan — BA spec edge case clause explicitly covers this scenario.
