# Task Context — 1505_a: TDD RED — cascadeBacktestJob failing assertions

## TLDR (read this first)
change: src/__tests__/1505-cascade-backtest.test.ts — CREATE with failing assertions
test: src/__tests__/1505-cascade-backtest.test.ts — ~8 assertions, all RED
branch: task/1505a-cascade-backtest-red
depends: none
knowledge_needed: [bundle-developer]

---

sprint: 192
branch: task/1505a-cascade-backtest-red
status: todo
req_ref: REQ-192
tech_ref: TECH-192

---

## [PM] Planning Context

layer: test
depends_on: none

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_192.md   # full spec
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # updateOutcome signature
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/ohlcvStalenessCheckJob.ts   # deps-injection pattern to mirror

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1505-cascade-backtest.test.ts   # CREATE

files_to_modify: []

test_file: src/__tests__/1505-cascade-backtest.test.ts

acceptance_criteria:
- Given 1505-cascade-backtest.test.ts exists with import of runCascadeBacktest
- When `bun test src/__tests__/1505-cascade-backtest.test.ts` is run
- Then all assertions FAIL (RED) because cascadeBacktestJob.ts does not yet exist
- Test covers: pending-rows query calls updateOutcome with priceImpact3d/7d + outcomeCorrect
- Test covers: row with ALL tickers missing d3 data → noData++, updateOutcome NOT called
- Test covers: priceImpact3d rounded to 4 decimal places
- Test covers: outcomeCorrect=1 when avg>1.0, =0 when avg<-1.0, null when within ±1.0
- Test covers: per-row error → warn + noData++, processing continues
- bun tsc --noEmit shows 0 errors after task

---

## [Developer] Implementation Record

files_actually_modified: []

files_created:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1505-cascade-backtest.test.ts   # 7 RED assertions, all fail with "Cannot find module cascadeBacktestJob.js"

tests_written:
- src/__tests__/1505-cascade-backtest.test.ts   # 7 assertions, all RED

tests_skipped: []

tsc_clean: true   # test file only imports; no new .ts source created
full_suite_pass: N/A   # RED phase — all 7 intentionally fail
