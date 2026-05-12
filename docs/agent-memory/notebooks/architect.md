# Architect — Notebook

**Last updated:** 2026-05-13 ~00:45 UTC | **Sprint:** ARCH-BRIEF-UPDATE-H4-c58

## Last session summary (ARCH-BRIEF-UPDATE-H4-c58 — Tier 3)

H4 CONFIRMED brief update. Updated `docs/architecture-briefs/2026-05-12-headlock-and-worktree-root-cause.md`:
- Status bumped to RESOLVED-MECHANISM, OPEN-FIX-PICK
- Tally corrected: 5 cycles → 7 cycles (c52–c58)
- H1/H2/H3 marked REJECTED/ELIMINATED; H4 CONFIRMED with VirtioFS mechanism
- F1-F4 ranked: F2 PRIMARY (named volumes, phased F2a+F2b), F4 SECONDARY (retry wrapper)
- F3 REJECTED (too disruptive), F1 BLOCKED (user action)
- c59+ impl plan added (c59-T1: F2a, c59-T2: F4, c60-T1: F2b)
- Q1+Q2 closed (both resolved c57)
- c58 orphan `.claude/worktrees/agent-a0f89162/` noted in Section 5
- Cross-link to `2026-05-13-container-restart-rca-v2.md` added (both touch Docker Desktop VM)
- 118L → 139L (within 140L cap)

## Previous session summary (ARCH-1896-RE-RCA-c58 — Tier 2)

Re-RCA for TNB c43 CRITICAL escalation ("3rd restart in <24h, 1896c-impl insufficient").
Loaded docker-events log (1896c-impl start: 17:31:34 UTC 2026-05-12). Found 5 die events,
zero OOM events, zero health_status:unhealthy events. All post-1896c-impl die events are
exit=0 (clean stop) or exit=137-via-SIGKILL (Docker stop-timeout, NOT kernel OOM):
- api-gateway 17:31 UTC: SIGTERM hang → SIGKILL during 1862c-DE deploy (ops action)
- mcp-server 19:58+20:00 UTC: 1876a-A5 exec-only migration restart (ops action)
- mcp-server 20:29 UTC: 1876a-A6 docker-compose up --build (ops action)
TNB c43 saw 20:29 restart, computed uptime=2h18m at 22:47, misclassified as crash.
VERDICT: false-alarm-h4-batch. 1896c-impl logging is working correctly.
Brief: `docs/architecture-briefs/2026-05-13-container-restart-rca-v2.md` (117L)
c40 status: unchanged — inconclusive (pre-log, no ops evidence in window).
Recommendation: MONITOR c59+c60, then close 1896 fully.
c59 fix (if opened): TNB recalibration — add `# TNB-PLANNED-RESTART` tag convention to ops
flow. SPRINT-S, ≤20 LOC, zone: `.claude/flows/ops/`.

---

## Known patterns / preferences

- Phase-gate: SPRINT-L always split Phase 1 (design) + Phase 2+ (impl). Never single-phase.
- `domain/repositories/` = clean boundary. Repository interfaces in domain, SQLite impls in infra.
- Default-param injection: `constructor(private repo = new SqliteRepo())`. Tests inject mocks.
- `initDatabase()` is the migration runner. Container restart = migration execution.
- `server.ts` bootstrap: all new MCP tools registered there. Single wiring point.
- DDD layer audit before design: `grep -r "from.*infrastructure" src/domain/`.

## Carry-over for next session

- ARCH-1884 brief: Hybrid decision. Calculators in mcp-server domain; BTN detectors in
  forensic-analysis service (port 5007). Sprint 1887 (Virtual Capital) → forensic-analysis.
- 1878b `compute_accruals` spec: `docs/specs/1878b-compute-accruals.md`.
- c40 container restart: inconclusive (pre-log). Re-evaluate if TNB flags again post-c60.
- TNB recalibration (1896 close gate): SPRINT-S pending — `# TNB-PLANNED-RESTART` convention.
- Headlock F2a + F4: c59-T1 (ops/developer) + c59-T2 (dev-team). F2b after writer-audit c60.
- F1 (Docker Desktop .git/ exclusion): user-queue carry item.
