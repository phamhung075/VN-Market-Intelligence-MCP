# Task Report: 1504 — feat(cascade-outcome): backtesting schema + outcome tracking
date: 2026-04-19
outcome: APPROVED

## Test Results
- Unit tests (1504): 11 pass / 0 fail
- Regression (1163): 36 pass / 0 fail
- Full suite: 5698 pass / 5 fail (all 5 pre-existing, unrelated to 1504)
- TypeScript: 0 errors

## DDD Compliance: PASS
- `cascadeOutcomeTools.ts` in `interface/mcp/tools/` — correct layer
- No `domain/` importing `infrastructure/`
- No `infrastructure/` importing `application/`

## Security: PASS
- No `process.env` (uses `Bun.env` via `getDb()`)
- All SQL parameterized (`db.prepare(...).run(...)`)
- MCP tool handler wrapped in try/catch
- Zod input validation on `days` (min 1, max 90) and optional `ticker`

## Changes Verified

| File | Change |
|------|--------|
| `src/infrastructure/db/schema.ts` | `initDatabase(dbArg?)` optional param; +5 cols ALTER `cascade_rule_hits`; +3 cols ALTER `market_messages` (idempotent) |
| `src/infrastructure/db/cascadeHitStore.ts` | `recordHit()` extended (+sourceRagId, +confidence); new `updateOutcome()` |
| `src/infrastructure/db/marketMessageStore.ts` | New `updateImpact()` |
| `src/interface/mcp/tools/cascadeOutcomeTools.ts` | NEW — `get_cascade_outcomes` tool + `queryCascadeOutcomes()` + `formatCascadeOutcomes()` |
| `src/interface/mcp/tools/registry.ts` | Import + register `registerCascadeOutcomeTools` (registry.ts, NOT server.ts) |
| `src/__tests__/1504-cascade-outcome.test.ts` | NEW — 11 assertions (AC-1..AC-11) |
| `src/__tests__/1163-market-message-review.test.ts:242-258` | Column count 9 → 12 updated |

## Tool Count
- tool-registry.json baseline: 99
- +1 new tool: `get_cascade_outcomes`
- Post-merge expected: 100
- Note: registry.ts comment says `→ 101` (off-by-one in comment only, non-blocking)

## Issues Found
### Blocking
None

### Non-Blocking
- `registry.ts:146` comment says `+1 tool → 101` — should be `→ 100`. Comment drift from pipeline count. tool-registry.json SSOT not yet updated to 100 (requires server restart to confirm live count).

## Schema Notes
- Schema changes via idempotent `ALTER TABLE ... ADD COLUMN` wrapped in try/catch
- Server restart required post-merge to apply ALTERs to production DB: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`
- Outcome columns (`price_impact_3d/7d`, `outcome_correct`) populated asynchronously by Sprint 192 backtest cron (NULL = pending)

## Merge Status
- Merged: `4d6c131` merge(1504): feat(cascade-outcome): backtesting schema + outcome tracking
- Branch `task/1504b-cascade-outcome-green` deleted local + remote
- Post-merge: `bun test src/__tests__/1504-cascade-outcome.test.ts` → 11 pass / 0 fail
