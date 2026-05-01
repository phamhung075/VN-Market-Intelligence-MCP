# Task Report: 1793 — pollNews Cooldown Across Restarts
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests: 4 passed / 0 failed (`1793-pollnews-cooldown-persist.test.ts`)
- Regression tests: 2 passed / 0 failed (`1398-pollnews-all-dark-cooldown.test.ts`)
- Total targeted: 6 passed / 0 failed
- Full suite: 8342 passed / 30 failed (all failures pre-existing; no regressions)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS
- Fix is entirely in `application/usecases/pollNews.ts` — clock source change only
- No new files, no layer violations

## Security: PASS
- DB INSERT now uses parameterized `?` placeholder for timestamp value
- `nowIso = new Date(now).toISOString()` bound as parameter — no SQL injection risk
- No `process.env` usage; no hardcoded credentials

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Root Cause Verified
Root cause: `INSERT` stored `strftime('now')` (SQLite real wall clock) while the cooldown comparison used the injected `nowMs()` clock. With a fake-future `nowMs`, the stored real-clock timestamp was ancient relative to the fake 'now', making `now - dbLastMs >> 4h` → cooldown bypassed after restart.

Fix: `new Date(now).toISOString()` where `now = nowMs?.() ?? Date.now()` — both the stored value and the comparison use the same clock source.

## Key Behaviour Verified
- After restart simulation (module-level var reset), second call within 4h → suppressed by DB row
- After restart simulation, second call after 4h → fires again (cooldown expired)
- INSERT failure (missing table) → does not crash pollNews (best-effort guard)
- Far-future fake nowMs → DB row aligns with fake clock → cooldown correctly enforced

## Merge Status
Merged to main via `merge(1790+1793)` commit `c18fd46f`. Branch deleted.
