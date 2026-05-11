# Task Report: 1190 — Pipeline Watchdog
date: 2026-04-13
outcome: APPROVED

---

## 1. Branch / Merge Status

Branch task/1190-pipeline-watchdog was merged to main at commit c753ec5 before this review.
Verification confirmed all files are present on main.

---

## 2. Acceptance Criteria Checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | pipelineWatchdogJob.ts in src/scheduler/ (flat, not subdirectory) | PASS |
| 2 | STALE_THRESHOLD_MINS = 90 | PASS |
| 3 | COOLDOWN_MS = 3 * 60 * 60 * 1000 (10_800_000 ms) | PASS |
| 4 | lastAlertAt advances only when notify returns truthy | PASS |
| 5 | _resetWatchdogCooldown exported | PASS |
| 6 | CRONS.pipelineWatchdog in jobs.ts with UTC timezone and recordJobRun | PASS |
| 7 | cron-registry.json schedulerFileCount === 28 | PASS |

---

## 3. Test Results

### Task-specific suite

File: src/__tests__/1190-pipeline-watchdog.test.ts

Result: 16 pass / 0 fail / 30 expect() calls (165 ms)

Test groups and cases:

**Staleness gate (6 tests):**
- staleMins = 45 (healthy) → "ok", notify not called
- staleMins = 90 (boundary, inclusive) → "ok", notify not called
- staleMins = null (empty table) → "no-data", notify not called
- staleMins = 120, lastAlertAt = 0 → "alert-sent", notify called once
- Alert message contains staleMins, today count, lastInsertedAt, vpsPushLast24h
- lastInsertedAt null renders "never" in message
- vpsPushLast24h null renders "unknown" in message

**Cooldown logic (7 tests):**
- staleMins = 200, within 3h cooldown → "cooldown", notify not called second time
- staleMins = 200, cooldown expired (>3h) → "alert-sent", notify called again
- notify returns false → "notify-failed", lastAlertAt not advanced (retry fires next call)
- notify throws → "notify-failed", no crash
- getPipelineHealthFn throws → "notify-failed", no crash
- _resetWatchdogCooldown resets state between tests

**cron-registry.json integrity (2 tests):**
- schedulerFileCount === 28
- jobs array contains entry with name "pipelineWatchdog" and schedule "*/30 min"

**CRONS map — jobs.ts export (1 test):**
- CRONS.pipelineWatchdog === "*/30 * * * *"

### TypeScript

`bun tsc --noEmit` exits with zero output (0 errors).

### Regression note

`bun test` (all files) triggers a Bun 1.3.11 runtime crash (C++ exception in the runner
itself). This crash pre-dates task 1190 — it was present in the qa(1189) report and is
a known Bun upstream issue. Targeted suite runs (individual files and small batches)
complete cleanly: 65 pass across db/config tests, 16 pass for 1190 tests.

---

## 4. Implementation Verification

### Constants (src/scheduler/pipelineWatchdogJob.ts)

```
export const STALE_THRESHOLD_MINS = 90;
export const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 10_800_000 ms
```

Both correct per spec.

### lastAlertAt advancement

Lines 130-135: notify is awaited; lastAlertAt = now.getTime() is executed only inside
the `if (ok)` branch. The `!ok` path and the catch block both return "notify-failed"
without touching lastAlertAt. Spec requirement verified.

### _resetWatchdogCooldown export

Line 44: `export function _resetWatchdogCooldown(): void` — exported at module level.
All 16 tests use it via beforeEach. Verified.

### jobs.ts registration

- Import: `import { runPipelineWatchdog } from './pipelineWatchdogJob.js'` (line 53)
- CRONS entry: `pipelineWatchdog: Bun.env.CRON_PIPELINE_WATCHDOG ?? '*/30 * * * *'` (line 116)
- Schedule block at lines 396-403 wraps `runPipelineWatchdog()` inside `recordJobRun()`
  with `{ timezone: 'UTC' }` option. Both recordJobRun and UTC timezone confirmed.

### cron-registry.json

- schedulerFileCount: 28 (28 job files; jobs.ts orchestrator excluded from count — correct)
- pipelineWatchdog entry present: schedule "*/30 min", desc covers staleMins > 90 and 3h cooldown

---

## 5. DDD Compliance: PASS

pipelineWatchdogJob.ts lives in src/scheduler/ — not in src/domain/. It imports from
application/ and infrastructure/ (legal for scheduler layer).

Domain layer scan (grep "from.*infrastructure" src/domain/ and "from.*application" src/domain/):
- Results were comment lines only; no runtime import violations introduced by this task.
- Pre-existing intradayAnalyzer.ts import of infrastructure type is outside scope of task 1190.

---

## 6. Security: PASS

- No process.env usage in pipelineWatchdogJob.ts. All config via Bun.env (CRON_PIPELINE_WATCHDOG).
- No SQL queries (watchdog calls use case, no direct DB access). No injection surface.
- No hardcoded credentials.
- Telegram send is channeled through sendTelegramWork (WORK channel) — not MARKET. Correct.

---

## 7. Design Patterns

Mirrors vpsProxyWatchdogJob.ts design as documented in TECH_076.md:
- Module-level lastAlertAt (not class state) for cooldown.
- All external dependencies injectable (now, notify, getPipelineHealthFn).
- Production defaults wired at call time, not import time.
- Five WatchdogResult variants: ok / no-data / alert-sent / cooldown / notify-failed.
- getPipelineHealth() error → "notify-failed" (no re-throw, logged via logger.error).

---

## 8. Issues Found

### Blocking
None.

### Non-Blocking
None.

---

## Merge Status

Task 1190 was pre-merged to main by Developer (commit c753ec5). All verification checks
pass. TASKS.md should be updated: task 1190 Review → Done.
