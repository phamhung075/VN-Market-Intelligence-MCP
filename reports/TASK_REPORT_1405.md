# Task Report: 1405 — formatAlertDigest Price-Drop Qualifier
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (188-alert-digest.test.ts): 23 passed / 0 failed
- Full suite: 7943 passed / 18 failed (baseline was 19 failed before cherry-pick — net improvement)
- TypeScript (task 1405 files): 0 errors (pre-existing TS errors in unrelated test files 1383, 1397c, 1403 are unchanged)

## DDD Compliance: PASS
- `assembleAlertDigest.ts` lives in `application/usecases/` — correct layer
- Imports only from `infrastructure/db/schema.js` and `infrastructure/logger.js` — permitted for application layer
- No domain-layer files modified; DDD golden rule (domain has ZERO infra imports) unaffected

## Security: PASS
- No `process.env` usage (uses `Bun.env` via existing imports)
- No hardcoded credentials or API keys
- No SQL added (no new DB queries)
- No `any` types introduced

## Changes Merged
### `apps/mcp-server/src/application/usecases/assembleAlertDigest.ts`
- Added `isPriceDrop(msg)` helper: detects "Giá giảm" substring
- Added `isCumulative(msg)` helper: detects "lũy kế" / "luy ke" (case-insensitive)
- Updated `formatAlertDigest()` loop: per-block `priceDropSeen` flag drives qualifier logic
  - Cumulative entries: prefixed "(lũy kế) " always, does not consume priceDropSeen slot
  - First incremental price_drop: no prefix, sets priceDropSeen=true
  - Subsequent incremental price_drops: prefixed "(+thêm) "
  - Non-price_drop alert types: no prefix

### `apps/mcp-server/src/__tests__/188-alert-digest.test.ts`
- TC-1: single price_drop — no qualifier
- TC-2: two incremental price_drops — second gets (+thêm)
- TC-3: cumulative price_drop — gets (lũy kế)
- TC-4: mixed types — (+thêm) appears exactly once, volume_spike unlabelled
- TC-5 (regression): price_surge-only block — no qualifiers added

## Merge Status
- Cherry-picked commit 176b8a8f onto main as 3d9af37a
- Branch feat/1405-digest-qualifier retained in remote (worktree)
- Worktree at .claude/worktrees/agent-a90b21e4 can be removed after confirmation
