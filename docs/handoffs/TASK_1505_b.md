# Task Context — 1505_b: GREEN — cascadeBacktestJob + jobs.ts + cron-registry

## TLDR (read this first)
change: src/scheduler/cascadeBacktestJob.ts — CREATE; src/scheduler/jobs.ts:144+649 — MODIFY; docs/data/cron-registry.json — MODIFY
test: src/__tests__/1505-cascade-backtest.test.ts — all assertions GREEN
branch: task/1505b-cascade-backtest-green
depends: 1505_a (RED) merged to main
knowledge_needed: [bundle-developer]

---

sprint: 192
branch: task/1505b-cascade-backtest-green
status: todo
req_ref: REQ-192
tech_ref: TECH-192

---

## [PM] Planning Context

layer: scheduler
depends_on: [1505_a merged to main]

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_192.md   # full spec + interface contracts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1505-cascade-backtest.test.ts   # RED tests to satisfy
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/ohlcvStalenessCheckJob.ts   # deps-injection pattern to mirror exactly
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts   # insertion points at lines 144 and 649
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # updateOutcome import
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/cron-registry.json   # add cascade-backtest entry

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/cascadeBacktestJob.ts   # CREATE

files_to_modify:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts   # MODIFY: add CRONS.cascadeBacktest at line 144, add cron.schedule block at line 649
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data/cron-registry.json   # MODIFY: add cascade-backtest entry (schedule: 30 20 * * *)

test_file: src/__tests__/1505-cascade-backtest.test.ts

acceptance_criteria:
- Given cascadeBacktestJob.ts is created with runCascadeBacktest(deps?) export
- When `bun test src/__tests__/1505-cascade-backtest.test.ts` is run
- Then all assertions PASS (GREEN)
- runCascadeBacktest queries cascade_rule_hits WHERE outcome_correct IS NULL AND price_impact_3d IS NULL AND hit_at <= datetime('now','-3 days')
- Per-row: parses affected_stocks, queries daily_ohlcv for D+0/D+3/D+7, computes avg impact, rounds to 4dp
- outcomeCorrect: 1 if avg>1.0, 0 if avg<-1.0, null if within ±1.0
- priceImpact7d: null (passed as undefined) when no d7 data available
- ALL codes missing d3 → noData++, updateOutcome NOT called, row left untouched
- Per-row catch: console.warn + noData++, loop continues
- WORK summary sent: "[cascade-backtest] processed=N skipped=0 noData=K"
- jobs.ts CRONS.cascadeBacktest key inserted after ohlcvStalenessCheck
- jobs.ts cron.schedule block inserted (30 20 * * *, UTC) calling runCascadeBacktest via recordJobRun
- cron-registry.json entry added for cascade-backtest
- bun test passes 0 failures, bun tsc --noEmit 0 errors
