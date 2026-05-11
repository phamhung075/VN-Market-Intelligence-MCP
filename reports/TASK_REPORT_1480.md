# Task Report 1480 — compact
date: 2026-04-19
outcome: APPROVED

changed:
- src/__tests__/1480-db-isolation-batch5.test.ts (NEW — dynamic Bun.Glob discovery test)
- 208 src/__tests__/*.test.ts (bulk line-1 replacement: process.env["DB_PATH"] → Bun.env["DB_PATH"])

commits:
- 28c94ad — test(1480): RED — dynamic process.env DB_PATH isolation discovery
- c41e545 — fix(1480): GREEN — bulk replace process.env -> Bun.env in test files

## Test Results

| Check | Result |
|---|---|
| 1480 targeted test | 1 pass / 0 fail |
| Line-1 offenders (python scan) | 0 |
| Full suite | 5589 pass / 37 fail (37 pre-existing, not regressions) |
| TypeScript | 0 errors |

Pass delta: baseline 5587 → actual 5589 (+2, acceptable — suite variance ±2 non-deterministic across runs; 1 net new assertion from 1480 test confirmed)

## Spot-check (5 files sampled at indices 50/100/150/200/250)

| File | Line 1 |
|---|---|
| 102-job-news-poll.test.ts | `Bun.env["DB_PATH"] = ":memory:"` |
| 1115-news-alert-dedup.test.ts | `Bun.env["DB_PATH"] = ":memory:"` |
| 1202-fpt-hpg-backfill.test.ts | comment (no DB_PATH needed) |
| 1281-cooldown-config.test.ts | comment (no DB_PATH needed) |
| 1370-france-watchlist-movers.test.ts | `Bun.env["DB_PATH"] = ":memory:"` |

All correct — 0 `process.env["DB_PATH"]` at line 1 across sampled files.

## DDD Compliance: SKIP (test-only change — no domain/infra files modified)
## Security: PASS (Bun.env enforced, 0 process.env at line 1)

## Issues Found
### Blocking
none

### Non-Blocking
- grep finds `process.env["DB_PATH"]` at non-line-1 locations in ~50 files (beforeEach/afterEach hooks). Out of scope for 1480 — task targeted line-1 pattern only. Separate cleanup task warranted.

## Merge Status
Committed directly to main (no branch to merge). Both commits on main confirmed.
