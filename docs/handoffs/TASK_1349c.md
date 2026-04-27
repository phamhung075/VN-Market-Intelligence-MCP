# Task 1349c: Fix Scheduler Module Documentation + Path Validation

**Sprint:** 1349
**Type:** Documentation
**Size:** S (0.5h)
**Priority:** MEDIUM

---

## Problem Statement

`docs/agent-memory/modules/scheduler.md` references `src/infrastructure/scheduler/` directory and 7 jobs.

After modular monolith refactor (Sprints 209–220), the scheduler architecture changed:
- Old: `src/infrastructure/scheduler/` (single flat directory)
- New: `src/scheduler/` with 8 subdirectories:
  - `market-data/` (price, volume, technical indicators)
  - `briefings/` (morning, evening, digests)
  - `audits/` (integrity, health, security)
  - `alerts/` (ta-alerts, bb-alerts, signals)
  - `analysis/` (macro, sentiment, macro-refresh)
  - `prediction/` (polymarket polling)
  - `maintenance/` (db cleanup, wal checkpoint)
  - `imports/` (rss feeds, news ingestion)

**Impact:** Agent knowledge broken. New developers following scheduler.md paths cannot find job files. Documentation drift.

---

## Solution

### Part 1: Update Scheduler.md File Paths (0.25h)

1. Read current `docs/agent-memory/modules/scheduler.md` (57 lines)
2. Replace all references to `src/infrastructure/scheduler/` with correct paths under `src/scheduler/`
3. List all 42 job files with correct paths
4. Add summary:
   ```
   ## Job Count: 42 Total Jobs

   | Subdirectory | Count | Jobs |
   |---|---|---|
   | market-data | 6 | priceRefresh, volumeRefresh, technicalIndicator, macroPriceCheck, ... |
   | briefings | 5 | morningBriefing, eveningSummary, weeklyDigest, ... |
   | audits | 4 | integrityCheck, healthCheck, securityAudit, ... |
   | alerts | 8 | taAlertScan, bbAlertScan, signalBroadcast, ... |
   | analysis | 6 | macroRefresh, sentimentAnalysis, ... |
   | prediction | 3 | polymarketFetch, ... |
   | maintenance | 2 | dbCleanup, walCheckpoint |
   | imports | 8 | rssFeed, newsPolling, ... |
   ```

### Part 2: Verify Job Count (0.25h)

1. Run: `find src/scheduler -name "*.ts" -not -path "*/test/*" | wc -l`
   - Expect: 42 (or verify actual count from codebase)
2. Cross-check against `docs/data/project-stats.json` field `schedulerFileCount: 42`
3. Add verification comment:
   ```
   Last verified: 2026-04-27
   Command: find src/scheduler -name "*.ts" | wc -l = 42
   ```

---

## Acceptance Criteria

- [ ] All references to `src/infrastructure/scheduler/` replaced with `src/scheduler/`
- [ ] All 42 job files listed with correct paths
- [ ] Job count matches `project-stats.json:schedulerFileCount` (42)
- [ ] Verification command documented
- [ ] No broken links (manual spot-check of 5 random files)

---

## Files Changed

- `docs/agent-memory/modules/scheduler.md` (updated paths + job count table)

---

## Notes

- Pure documentation update, zero code changes
- Reference file: code-janitor session (2026-04-24) confirmed 42 scheduler jobs
