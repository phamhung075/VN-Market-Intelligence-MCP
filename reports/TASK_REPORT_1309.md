# TASK_REPORT_1309 — bbAlertScanJob: BB20 Breakout Alert Scanner

**Date:** 2026-04-15
**Tasks:** 1309 (feat) + 1310 (test)
**Branch:** `task/1309-1310-bb-alert-scan-job` (merged to main)
**Verdict:** PASS

---

## Checklist Results

| Check | Result |
|-------|--------|
| `bun test src/__tests__/1309-bb-alert-scan-job.test.ts` | 10 pass / 0 fail |
| `bun test src/__tests__/1190-pipeline-watchdog.test.ts` | 16 pass / 0 fail (after fix) |
| `bun tsc --noEmit` | 0 errors |
| No `sendTelegram` in `bbAlertScanJob.ts` | CONFIRMED (line 28 comment + grep) |
| Alert types `ta_bb_breakout_up` / `ta_bb_breakout_down` | CONFIRMED (lines 181, 184) |
| Confidence = 0.65 | CONFIRMED (line 204) |
| Insert schema: `triggered_at`, `severity`, `signals_json`, `affected_actions_json`, `message`, `read` | CONFIRMED (lines 96-99) |
| `docs/data/project-stats.json` schedulerFileCount = 31 | CONFIRMED |
| `docs/data/cron-registry.json` count = 31 with bbAlertScanJob entry | CONFIRMED |
| Per-ticker try/catch | CONFIRMED (lines 143-221, scanned++ before try) |
| DDD compliance (domain/ no infra imports) | PASS (no new violations) |
| Security scan (`process.env` in src/) | PASS (test files only, pre-existing) |

---

## Fix Applied During Review

**Issue:** `src/__tests__/1190-pipeline-watchdog.test.ts` line 281-283 had hardcoded `30` for `schedulerFileCount`, but `cron-registry.json` now correctly reports `31` (new `bbAlertScanJob` added).

**Action:** Updated test assertion from `toBe(30)` to `toBe(31)`.

**File:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1190-pipeline-watchdog.test.ts` line 281

---

## Implementation Summary

**`src/scheduler/bbAlertScanJob.ts`** — 225 lines

- Scans full watchlist for BB20 upper/lower breakouts every 15 min (2-8 UTC, M-F)
- No Telegram import — pure alert row writer; Alert Commander handles dispatch
- Cooldown: skips insert if same `(ticker, alertType)` fired within 4h (SQLite datetime query)
- Per-ticker try/catch: errors logged as warn, scan continues; scanned counter incremented before try
- Insert uses correct columns: `id`, `triggered_at`, `severity`, `signals_json`, `affected_actions_json`, `analysis_ids_json`, `message`, `read`, `user_note`
- Dependency-injectable (`db`, `computeFn`, `nowFn`) for full unit test isolation

**`src/__tests__/1309-bb-alert-scan-job.test.ts`** — 384 lines, 10 tests

Coverage: all business rules (breakout up/down, inside band, null BB20, empty candles, cooldown dedup, per-ticker error isolation, watchlist empty, fired count, insert payload)

---

## Post-Merge

- Branch deleted (local + remote)
- `launchctl kickstart -k` completed — server healthy (`toolCount: 98`, `status: ok`)
- TASKS.md: 1309 + 1310 moved to Done
