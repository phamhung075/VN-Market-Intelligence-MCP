# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

### Task 1959a — exactOptionalPropertyTypes tsc fix (2026-05-20, DONE — commit b144f560)

**Root Cause:** Commit 79ac45e9 (task-lock Phase 1) introduced 3 `exactOptionalPropertyTypes` violations + 2 `noUncheckedIndexedAccess`/cast errors in test files. Pre-push hook was blocking ALL remote pushes (18 local commits stuck).

**Fix (4 files, type-only):**
- `coordinationStore.ts:272` — `{ claimed: false, current_holder: holderRow ?? undefined }` → ternary omitting key when null (Option A)
- `coordinationTools.ts:108` — `ttl_seconds` spread conditionally via `...(ttl_seconds !== undefined ? { ttl_seconds } : {})`
- `coordinationTools.ts:204` — `kind`, `owner_agent`, `expired` spread conditionally in listHeldTasks call
- Test files: `locks[0]!` non-null assertions + `as unknown as` intermediate cast

**Results:** tsc 0 errors, 9330 pass / 283 fail (AC: ≥9287 / ≤284), `git push origin main` succeeded (bef8e9cf → b144f560). All 1958a artifacts now on remote.

**NEXT: qa** — verify commit b144f560 against ACs.

---

### Task 1958a — alertDigestJob + summaryJob:daily startup catchup + recoverMissedExecutions (2026-05-20, IMPL DONE — commit 84c2b375)

**Root Cause:** Event-loop starvation (5h OHLCV backfill at startup / bctcReparseJob zombies) caused node-cron to miss cron windows at 14:00 UTC (alertDigestJob) and 15:30 UTC (summaryJob:daily). `recoverMissedExecutions=false` (node-cron default) means missed windows are permanently skipped. These 2 jobs had NO startup catchup, unlike morningBriefingJob/eveningSummaryJob/franceSummaryJob.

**Fix (3 files):**
- `startScheduler.ts`: Import `runSummaryJob` from `summaryJobs.js`. Add startup catchup probes for `alertDigestJob` (14:00 UTC, weekdayOnly=true) and `summaryJob:daily` (15:30 UTC, weekdayOnly=false) to existing setTimeout(30s) block. Add `recoverMissedExecutions: true` to alertDigestJob cron registration.
- `summaryJobs.ts`: Export `runSummaryJob` (was private). Add `recoverMissedExecutions: true` to `summaryJob:daily` cron registration.
- `1958a-alert-digest-summary-catchup.test.ts` (NEW, 16 tests): AC-1a–h (alertDigestJob catchup params), AC-2a–g (summaryJob:daily catchup params), AC-3 (DB error fail-safe).

**Results:** 16/16 tests GREEN, tsc 0 errors (excluding pre-existing coordinationStore errors), full suite 9330 pass / 283 fail (zero regression from 9284 baseline).

**Secondary signal for Architect:** OHLCV backfill ran for 5h at container startup (1599 rows). Event-loop starvation from startup operations is the root cause pattern.

**NEXT: qa** — verify commit against ACs; then ops container redeploy + confirm all 5 jobs fire within 24h.

Zone health: alertDigestJob and summaryJob:daily now have both startup catchups and recoverMissedExecutions guards; scheduler resilience improved | HEALTHY

---

### Task 1955b — zombie cron_job_runs reap on startup (2026-05-20, DONE — commit cfe10b0a)

**Problem:** Scheduler crash (SIGKILL / watchdog) left `status='running'` + `finished_at IS NULL` rows in `cron_job_runs`. Reaper function did not exist; CHECK constraint excluded 'crashed'.

**Fix (4 files):**
- `cronJobRunStore.ts`: `CronJobRunStatus` type union extended to include `'crashed'`. `reapZombieJobRuns(db)` added — UPDATE WHERE status='running' AND finished_at IS NULL → sets status='crashed', finished_at=NOW, duration_ms computed.
- `schema-system.ts`: CREATE TABLE check updated to `('running','success','error','crashed')`. Idempotent migration guard: detect old DDL via sqlite_master string-match (`'running','success','error'` present, `'crashed'` absent) → CREATE new table, INSERT OR IGNORE, DROP old, RENAME.
- `startScheduler.ts`: Import `reapZombieJobRuns` from cronJobRunStore. Call `reapZombieJobRuns(db)` immediately after `getDb()` / `new SqliteJobRunRepository(db)`, before any cron registration. Logs reaped count when > 0.
- `1955b-reap-zombie-runs.test.ts` (NEW, 178L): AC-1 happy path (2 zombies → crashed), AC-2 idempotence×2 (success/error untouched), AC-3 migration (old DDL + initSystemTables → baseline row preserved + 'crashed' accepted).

**Results:** 4/4 tests GREEN, tsc 0 errors, full suite 9284 pass / 284 fail (284 pre-existing BCTC PDF parsing failures, zero regression).

**NEXT: qa** — verify commit cfe10b0a against ACs; then ops container redeploy + verify `SELECT COUNT(*) FROM cron_job_runs WHERE status='running' AND finished_at IS NULL` = 0 post-restart.

Zone health: zombie rows will be reaped on every container restart; CHECK accepts 'crashed'; migration is idempotent | HEALTHY

---

### Task 1955a — dailyDashboardJob projectRoot() path fix (2026-05-20, DONE — commit acc8d52b)

`projectRoot()` at `dailyDashboardJob.ts:455` used 6 `..` segments → resolved to `/` in container. Fixed to 3 segments (`../../..`). 5/5 tests GREEN, tsc 0 errors. DONE + QA-APPROVED.

---

### Task 1954a — backfillBctcQ12026 column-name hotfix (2026-05-19, DONE — commit 2a5cc2a7)

INSERT column list renamed to match `bctc_vps_queue` DDL (`action_code`, `period_year`, `period_quarter`). 0 regressions. DONE + QA-APPROVED.

---

### Sprint 1953c+f Recovery (2026-05-19, DONE — commit 6c442373)

pdfOcrWorker.ts 3-layer EPIPE guard (stdin error swallow, writable guard, tessExited flag). backfillBctcQ12026.ts new (INSERT OR IGNORE for Q1-2026). DONE.

---

### Task 1949 T6/T7 — Cron Rewiring (2026-05-18, DONE)

foreignFlowAlert → `13 8 * * 1-5` (was `30 9`). macroIndicatorRefresh → `13 19 * * *` (was `0 6`). Both 24min before chef cook slots. 9/9 tests GREEN.

---

### Task 1948e-A/B — legal_risk signal type (2026-05-18, DONE)

`"legal_risk"` added to SignalTypeSchema. stage-signals.md dispatch block added for news-scout. 8/8 tests GREEN.

---

### Task 1946a — PLX watchlist (2026-05-18, DONE)

PLX added to all 3 SSoT sources + frontend domain. 49/49 tests GREEN (includes 1343a stale-count fix).

---

### Task 1945a — verdictResolutionJob envelope fix (2026-05-18, DONE)

`getPriceHistory()` now returns `PriceHistoryEnvelope`. `defaultFetchHistory()` reads `envelope.history[0].close`. ~520 unscored alerts will score on next tick.

---

### Task 1944b — BCTC dead strategies removed (2026-05-18, DONE)

SSC iboard (NXDOMAIN) + vietstock (HTTP 404) removed from bctcDiscovery.ts. Chain: hsx(0) → VPS Playwright(1) → null. 142 BCTC tests GREEN.

---

### Task 1942c — HPG cashflow fix (2026-05-18, DONE)

CASH_FLOW_SCRIPT 3-key fallback + cashFlowExtractor steel-sector OCR label. 6/6 tests GREEN.

---

### Task 1942a — vnstock startup backfill probe (2026-05-18, DONE)

`vnstockStartupProbe.ts` injectable deps pattern. Cold DB or stale >7d fires job after 90s. 6/6 tests GREEN.

---

### Task 1941c — Daily accuracy digest job (2026-05-18, DONE)

`accuracyDigestJob.ts` at `0 7 * * *`. Top-3/bottom-3 signal types to WORK. DB dedup guard. 7/7 tests GREEN.

---

### TNB Critic Gate Sprint A+B (2026-05-17, DONE)

tnbCriticScorer.ts — 5 checks × 0.2, threshold 0.6. 49/49 GREEN. QA c143 APPROVED.
