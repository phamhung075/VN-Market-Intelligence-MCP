# Task Report 1503 — compact
date: 2026-04-20
outcome: APPROVED

changed:
- src/infrastructure/db/ohlcvForeignFlowStore.ts (NEW):1-61
- src/infrastructure/db/schema.ts:1520-1548
- src/interface/mcp/server.ts:37,658-736
- src/application/usecases/assembleEveningSummary.ts:62-128,140-163
- src/scheduler/eveningSummaryJob.ts:133-157
- src/__tests__/1503-ohlcv-foreign-flow.test.ts (NEW):1-319
- src/__tests__/1385-evening-summary-news-filler.test.ts: fixture compat

bun test (targeted): 27 pass / 0 fail
bun test (1503 unit): 5 pass / 0 fail
tsc: 0 errors
ddd: PASS — domain/ has 0 infra/application imports; ohlcvForeignFlowStore in infrastructure/, assembleEveningSummary in application/
security: PASS — parameterized UPDATE, no process.env, no hardcoded keys

verdict: APPROVED

merge_commit: 9f882cc

## Notes
- Full `bun test` OOM-crashed (Bun 1.3.11 memory bug, 2.33GB peak) — not a code regression; targeted regression on all changed modules passed 27/0.
- Schema change: migrateForeignFlowColumns idempotent; server restart required post-merge to run migration against live DB.
- "foreignFlowMovers step failed: no such table: daily_ohlcv" warnings in 105-job-evening-summary.test.ts are expected — those tests use a minimal DB without daily_ohlcv; fail-open guard works correctly (foreignFlowMovers returns undefined, no crash).
