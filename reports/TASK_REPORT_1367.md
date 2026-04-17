# Task Report: 1367 — feat(pipeline-health-tool): getOhlcvPipelineHealth + MCP tool registration
date: 2026-04-17
outcome: PASS

## Re-Review — 2026-04-17 (after fixer removed duplicate registration)

| Check | Result |
|---|---|
| 1366-pipeline-health-tool.test.ts (5 tests) | 5 pass / 0 fail |
| 1360-ohlcv-backfill-queue.test.ts (9 tests) | 9 pass / 0 fail |
| 1350-ohlcv-backfill-endpoint.test.ts (13 tests) | 13 pass / 0 fail |
| TypeScript strict (bun tsc --noEmit) | PASS |
| Duplicate tool registration | NONE — `systemTools.ts` has tombstone comment only |
| DDD compliance | PASS — no domain/ imports from infra/application |
| Security (process.env) | PASS — zero occurrences in new files |
| Full regression (4991 tests) | 4990 pass / 1 fail (pre-existing: 296-ocr-pipeline-e2e, network-dependent, also fails on main) |

### Additional Fix Applied During Re-Review
`src/__tests__/308-tool-registry.test.ts` had hardcoded count 60 which became stale when `registerPipelineHealthTools` was added to registry. Updated to 61 with audit trail comment. Confirmed 9/9 pass after update.

### Pre-Existing Failure (not task 1367)
Test 296 (OCR pipeline e2e smoke) times out at 30s due to geo-blocked SSC PDF endpoint from France. Confirmed identical failure on main branch — not a regression from this task.

## Initial Review (first pass — now resolved)

### Blocking (resolved by Fixer)
- Duplicate `get_pipeline_health` registration: `systemTools.ts` registered it (task 1189), `pipelineHealthTools.ts` also registered it (task 1367). Caused "Tool already registered" errors across 4 tests. Fixed by removing the block from `systemTools.ts`.

### Non-Blocking (resolved)
- Registry count test 308 expected 60, actual 61 after new tool. Fixed in this review pass.

## Merge Status
MERGED to main.
