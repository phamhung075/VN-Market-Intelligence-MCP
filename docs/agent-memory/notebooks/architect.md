# Architect — Notebook

**Last updated:** 2026-05-13 00:00 UTC | **Sprint:** ARCH-1896-RE-RCA-c58

## Last session summary (ARCH-1896-RE-RCA-c58)

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

## Previous session summary (1876a-A6)

Task: Brownfield scan for seeding 7 high-vol watchlist tickers (NVL/DPM/REE/VNH/KBC/MWG/TCH)
at alert_drop_pct=-9.0. Root cause: SEED GAP — 7 tickers absent from `WATCHLIST_SEED` array
entirely. Decision (a): add 7 entries to `WATCHLIST_SEED` in `seedWatchlist.ts`. Idempotent.
Handoff: `docs/handoffs/TASK_1876a-A6.md`.

---

## Previous session summary (1896c)

Persistent Docker events logging design brief. launchd plist + newsyslog rotation. Log at
`/usr/local/var/log/docker-events.log`. Brief: `docs/architecture-briefs/2026-05-12-persistent-docker-events-logging.md`.

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
