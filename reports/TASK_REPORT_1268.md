# Task Report: FIX-1268 — Government Stock Market Support Cascade → Banking BULLISH
date: 2026-04-25
outcome: APPROVED

## Summary

Bug: Article "VIETNAM GOVERNMENT PLANS STOCK MARKET SUPPORT MEASURES" cascaded to
real_estate (HUT) but NOT to banking (BID/VCB/TCB). Root cause: banking SECTOR_RULE
was missing the stock-market-specific phrases that appear in both English article
titles and Vietnamese summaries.

Fix: 3 keywords added to banking SECTOR_RULE in `cascadeEngine.ts`:
- `"stock market support measures"` (English exact phrase)
- `"government stock market support"` (English variant)
- `"hỗ trợ thị trường chứng khoán"` (Vietnamese stock-market specific)

## Changed Files

- `apps/mcp-server/src/domain/services/cascadeEngine.ts` lines 573-584 (banking rule)
- `apps/mcp-server/src/__tests__/FIX-1268-govt-support-cascade.test.ts` (new, 163 lines)

## Test Results

- Unit tests (FIX-1268): 6 pass / 0 fail (AC-1 through AC-6 all green)
- Full regression (591 non-RAG files, batched): 6968 pass / 2 fail
- Pre-existing failures confirmed (not caused by this fix):
  - `CRONS.walCheckpoint` — ordering-dependent flaky test (module cache pollution), pre-existing
  - `1264-hormuz-cascade-fix.test.ts` BSR/logistics — pre-existing on base branch before FIX-1268 applied
- RAG files (011–014): crash in Bun 1.3.11 teardown phase after tests pass — identical crash fingerprint
  on clean main, pre-existing Bun runtime bug not caused by this fix
- TypeScript: 0 errors (`bun tsc --noEmit` clean; pre-push hook confirmed)

## DDD Compliance: PASS

`cascadeEngine.ts` is in `domain/services/` — zero imports from `infrastructure/` or `application/`.
All matches for "infrastructure" in the file are comments only.

## Security: PASS

- No `process.env` usage
- No hardcoded credentials, secrets, or API keys
- Change is pure keyword array addition (data, not logic)

## Code Quality Notes

- Keywords placed in correct position within banking rule (consistent ordering: English then Vietnamese)
- FIX-1268 comments on each added line for traceability
- Test covers all 6 acceptance criteria including both languages and action-level cascade verification
- WatchlistEntry type used correctly (actionCode, domain, exchange)

## Merge Status

Merged: `fix/govt-support-cascade` → `main`
Merge commit: `4841e0fe`
Branch deleted: local + remote
Pre-push hook: tsc PASS (both push and branch delete)
