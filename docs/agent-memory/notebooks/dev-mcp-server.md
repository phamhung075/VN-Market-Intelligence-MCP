# dev-mcp-server -- Notebook

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db (write)

## Working Memory

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
