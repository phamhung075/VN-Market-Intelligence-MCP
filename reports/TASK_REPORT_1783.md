# Task Report: 1783 — Foreign Flow Bulletin: Stale Guard + |net_flow| Sort Fix
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (targeted): 7 passed / 0 failed
- Full suite: 8305 passed / 25 failed
- Baseline (pre-branch): 8294 passed / 24 failed
- Net delta: +11 pass, +1 fail — all pre-existing failures (BCTC validation, macro DB column mismatch, cron-safe network timeouts); none introduced by task 1783
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS
- Changed file: `apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts`
- Layer: `interface/scheduler` — permitted to import from `application/` and `infrastructure/`
- `domain/` unchanged; zero new domain→infrastructure imports

## Security: PASS
- No `process.env` usage (uses `Bun.env` elsewhere in file)
- No hardcoded credentials, API keys, or secrets
- No SQL in changed diff (pure formatting function)

## Changes Verified
### BUG-1 — Stale guard
`movers.every(m => m.foreignNetVol === 0 && m.foreignBuyVol === 0 && m.foreignSellVol === 0)`
returns `["", "Khối ngoại: Dữ liệu không khả dụng (pipeline tạm dừng)"]`
instead of rendering zero-value lines. Guard fires only when ALL three fields are zero for ALL entries.

### BUG-2 — Sort
`[...movers].sort((a, b) => Math.abs(b.foreignNetVol) - Math.abs(a.foreignNetVol))`
applied before rendering loop. Original input array not mutated (spread copy).

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged to main via `--no-ff` merge commit. Branch `task/1783-foreign-flow-bulletin` deleted.
TASKS.md updated: 1783 → Done, 1784 → In Progress.
