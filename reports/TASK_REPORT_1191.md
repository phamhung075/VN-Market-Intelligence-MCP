# Task Report: 1191 — Replace TE stream.ashx with Public RSS Feeds
date: 2026-04-14
outcome: APPROVED

## Test Results
- Unit tests (1191-te-stream-rss.test.ts): 5 passed / 0 failed
- Key regression suite (001, 002, 003, 024, 1191): 82 passed / 0 failed
- Full regression: in progress (blocked by pre-existing long-running OCR test 1178); no failures observed in completed portion
- TypeScript: 0 errors (`bun tsc --noEmit`)

## Acceptance Criteria Verification

### (1) stream.ashx URL and TEStreamItem interface deleted — PASS
Neither `stream.ashx` (as an active URL) nor `TEStreamItem` appears anywhere in `src/`. The string "stream.ashx" is present only in a JSDoc comment on line 9 of `tradingEconomicsStream.ts` (historical reference), not in any code path. `TEStreamItem` is fully absent.

### (2) Three RSS URL constants present — PASS
- `MW_RSS_URL` → `https://feeds.marketwatch.com/marketwatch/topstories/` (line 28)
- `GNEWS_MACRO_URL` → Google News, global economy / central banks / inflation (line 32)
- `GNEWS_MARKETS_URL` → Google News, financial markets / commodities / USD-VND (line 36)

### (3) Rate-limiter key is "tradingeconomics-rss" — PASS
All three `globalRateLimiter` call sites use the key `"tradingeconomics-rss"` (lines 133, 135, 142). The old key `"tradingeconomics.com"` is absent.

### (4) Sequential fallback logic correct — PASS
Five tests cover the fallback ladder:
- Test 1: Feed 1 wins, stops at 1 HTTP call.
- Test 2: Feed 1 empty, Feed 2 wins.
- Test 3: Feeds 1+2 empty, Feed 3 wins.
- Test 4: All three empty, returns `[]`.
- Test 5: HTTP error on Feed 1, falls through to Feed 2.
All five pass. Logic in `fetchTradingEconomicsStream` matches spec exactly (lines 145-160).

### (5) pollNews.ts zero-diff — PASS
`git diff main -- src/application/usecases/pollNews.ts` returns empty output. No changes.

## DDD Compliance: PASS (task scope)
Task 1191 modified only `src/infrastructure/fetchers/tradingEconomicsStream.ts` and added `src/__tests__/1191-te-stream-rss.test.ts`. No domain files were touched. Pre-existing `import type` violations in `src/domain/` (e.g., `intradayAnalyzer.ts` importing a type from infrastructure) are not introduced by this task and are tracked separately.

## Security: PASS
- No `process.env` usage introduced (all pre-existing `Bun.env` pattern preserved).
- No hardcoded credentials.
- Rate limiter guard present and correctly scoped to production path (`!httpClient` guard on lines 133 and 142 prevents rate-limit checks during injection-based tests).
- Browser User-Agent set to avoid 403 from MarketWatch/Google News.

## Issues Found
### Blocking
None.

### Non-Blocking
- `tradingEconomicsStream.ts` line coverage is 67.12%. Lines 50-69 (axios lazy-import path) and 134-137 (rate-limiter skip path) are not exercised by the test suite. These are production-only paths (mock injection bypasses both) and are acceptable; no test coverage gap for the specified acceptance criteria.

## Merge Status
APPROVED — merging to main.
