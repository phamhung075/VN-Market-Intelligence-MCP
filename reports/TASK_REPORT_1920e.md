## Task Report 1920e
date: 2026-05-16
outcome: CHANGES_REQUESTED
round: 1

changed:
- apps/mcp-server/src/scheduler/macro/cascadeBacktestJob.ts (extended CascadeBacktestDeps, aggregate accumulators, saveRun call)
- apps/mcp-server/src/__tests__/1920e-cascade-backtest-saverun.test.ts (NEW — 5 tests)
- docs/TASKS.md (1920e status)

tests: 5 pass / 0 fail (targeted) | 9421 pass / 36 fail (full suite, 36 pre-existing) | tsc: 16 errors (blocking) | ddd: PASS | security: PASS
verdict: CHANGES_REQUESTED

### Issues

#### Blocking
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:91` — TS18048: `rec` possibly undefined (`noUncheckedIndexedAccess: true`; `savedRecords[0]` typed as `BacktestRunRecord | undefined`)
- Same error repeated at lines: 92, 95, 98, 101, 103, 104, 105, 106, 107, 136, 137, 138, 139, 140
- `src/__tests__/1920e-cascade-backtest-saverun.test.ts:227` — TS2532: Object possibly undefined

Fix (test file only, no production code changes): add `expect(savedRecords[0]).toBeDefined()` assertion before `const rec = savedRecords[0]!;` in TC-1, TC-2, and resultJson test blocks.
