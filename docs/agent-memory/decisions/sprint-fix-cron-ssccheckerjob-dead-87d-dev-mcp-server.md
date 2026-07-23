# Decision Journal — Sprint fix-cron-ssccheckerjob-dead-87d · dev-mcp-server

**Sprint goal:** FIX-CRON-SSCCHECKERJOB-DEAD-87D (BOUNDED-1 direct-execute) — root-cause + restore sscCheckerJob (dead ~87d), verify dataAuditJob:weekly, class-fix the job_name/CRONS-key name-binding gap.
**Agent:** dev-mcp-server
**Started:** 2026-07-23

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23
**task-id:** FIX-CRON-SSCCHECKERJOB-DEAD-87D
**what-done:** RAW-verified live container env (`ENABLE_LOCAL_BCTC_FETCH` unset) + live `cron_job_runs` (3 rows total, last 2026-04-26) + `git log` pinned root cause: task 1281-fix (2026-04-25) added a VPS-only-architecture guard that returned BEFORE `recordJobRun()` was ever called, so the daily cron fired but wrote zero telemetry — indistinguishable from crashed.
**what-considered:**
- Flip `ENABLE_LOCAL_BCTC_FETCH=true` to "restore" the job to actually fetching — rejected: reintroduces the exact "x5 Network timeout" regression 1281-fix fixed (France server, geo-blocked SSC portal); also read `checkSscReports()`'s discovery+alert role and traced it as FULLY superseded by later architecture (`GET /api/bctc-fetch-queue` calendar gap-fill, `bctcQueueEnricherJob` multi-source discovery, VPS `POST /api/push-bctc-pdf`, `signalDetector.ts`'s generic `report_new` signal) — re-enabling the network path would be unsafe AND redundant.
- Move the guard check inside the `recordJobRun()` callback so the cron always records an honest `success`/`rowsWritten:0` row when it correctly no-ops (chosen).
**why-decision:** Restores true observability (closes the "silently indistinguishable from dead" gap that IS the actual defect) with zero change to the guard's network-safety property — verified via a call-count spy that `checkSscReports()` is still never invoked when the flag is false.
**why-change:** none from the RAW root-cause finding.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23
**task-id:** FIX-CRON-SSCCHECKERJOB-DEAD-87D
**what-done:** `docker exec` queried live `dataAuditJob:weekly` rows directly (not just the audit's summary) — 8 rows, all Saturday 18:00 UTC (correct: `dataAuditWeekly` cron registered with `{timezone:'Asia/Ho_Chi_Minh'}` = Sunday 01:00 ICT), last successful run 2026-06-27 — 26+ days stale, confirming a SECOND genuinely-dead job, not merely a label mismatch (which the task's own `known_unknown` flagged as needing verification before assuming).
**what-considered:**
- Assume it's just the label-mismatch already patched into WATCHDOG_MANIFEST (07-22) and close it as "visible now" — rejected: visibility ≠ liveness (explicit `do_not_absorb` warning on the parent row), and the live row gap proves it's NOT firing regardless of visibility.
- Add it as a 5th entry to the existing 4-job Sunday-catchup array in startScheduler.ts (jobTable lookup) — rejected: dataAuditJob:weekly is bespoke (not in `buildJobTable`), and its window (Saturday 18:00 UTC) differs from the other 4's Sunday-UTC-morning windows, so it needs its own `requiredUtcDay=6` gate, not a shared loop tuned for `requiredUtcDay=0`.
- Add a dedicated startup-catchup block calling `runWeeklyAuditWithDb(db)` directly (chosen) — mirrors the existing bctcReparseJob catch-up pattern already in the same file.
**why-decision:** Same root mechanism as the already-fixed "4 dead Sunday jobs" (`shouldRunCatchup`'s `requiredUtcDay` param is already generic — zero new logic needed there), applied correctly to this job's actual bespoke registration + distinct window.
**why-change:** discovered via direct live-DB query, not assumption — task explicitly required "determine which before assuming."

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-23
**task-id:** FIX-CRON-SSCCHECKERJOB-DEAD-87D
**what-done:** Implemented the class fix: a new registry-invariant test reads `STATIC_JOB_NAME_MAP`'s REAL keys (via a new minimal test-only accessor, `_staticJobNameMapKeysForTests`) and cross-checks them against (a) a source-derived call-site scan (same regex mechanism as the existing WD-11 guard) and (b) `CANONICAL_WATCHDOG_JOB_NAMES`, both directions.
**what-considered:**
- Blanket "every CRONS key must resolve to a job_name in cron_job_runs" invariant — rejected: ~24 jobs are LEGITIMATELY untelemetered (tracked separately under FIX-CRON-WATCHDOG-COVERAGE-BESPOKE-TELEMETRY); a blind version would be a false-positive generator, not a fix.
- Refactor WD-11's scanning logic into a shared test-helper module imported by both files — rejected: no shared-test-helper precedent exists anywhere in this codebase (every test file is self-contained by convention); touching the existing, already-audited WD-10/WD-11 file in a highest-risk RUN-SOLO zone for a pure refactor adds regression risk for no functional gain.
- Duplicate the proven WD-11 regex-scan mechanism into a new, self-contained test file targeting `STATIC_JOB_NAME_MAP` specifically (chosen).
**why-decision:** Directly closes the exact drift class that hid sscCheckerJob (a 4th hand-copied list — the test file's own `STATIC_25_PAIRS` — could silently diverge from the real map with the old test still green); proven fail-loud via a live injected-typo experiment (temporarily corrupted `STATIC_JOB_NAME_MAP.sscCheck`, confirmed the new test fails with the exact offending key/value named, then reverted).
**why-change:** none — matches the task's item-3 spec verbatim (test-driven invariant, not a startup assertion, since `bun test` is already a mandatory G12 gate every cycle).
