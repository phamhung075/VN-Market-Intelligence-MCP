# Task Report: 1297/1292/1301/1302 — Sentiment BEARISH keyword batch + macro direction label
date: 2026-04-25
outcome: APPROVED

## Summary

Four related bug fixes shipped as a single commit. The task referenced `fix/sentiment-label-batch` but the actual implementation commit `dcd777b3` was on `fix/ta-alert-market-channel` (the sentiment-label-batch branch was a mislabeled stub containing only the 1313 test delta). QA identified the correct branch, rebased, tested, and merged.

## Changed Files

- `apps/mcp-server/src/domain/services/sentimentClassifier.ts` lines 226-232 — 4 BEARISH keywords added
- `apps/mcp-server/src/__tests__/FIX-1297-sentiment-bearish-batch.test.ts` — new, 122 lines, 10 tests

## Keyword Additions (VN_BEARISH array)

| Keyword | Weight | Bug ID | Rationale |
|---------|--------|--------|-----------|
| bị ép bán | 3 | 1292 | Forced-sell signal (margin call / block trade) |
| ép bán | 2 | 1292 | Forced sell (shorter form) |
| khoản lỗ | 2 | 1302 | Loss-amount phrase |
| phòng thủ tiền mặt | 2 | 1297 | Standalone cash-defense (supplements existing tăng phòng thủ tiền mặt w3) |

## Test Results

- Unit tests (FIX-1297-sentiment-bearish-batch.test.ts): 10 pass / 0 fail
- Full suite post-merge: 7074 pass / 1 fail
- Baseline (main pre-merge): 7049 pass / 1 fail
- Delta: +25 pass, same 1 pre-existing fail (TASK-1313 diacritics — getEnergyGridStatus network timeout, unrelated)
- TypeScript: 0 errors (pre-push hook confirmed)

## DDD Compliance: PASS

sentimentClassifier.ts in domain/services/ — zero imports from infrastructure/ or application/. Keyword arrays are pure data constants with no side effects.

## Security: PASS

- No process.env (Bun.env only)
- No hardcoded credentials
- No SQL (pure in-memory classifier)
- No HTTP calls

## Branch Note

fix/sentiment-label-batch contained only the 1313 test fix (no sentiment keyword changes). The actual 1297/1292/1301/1302 implementation was on fix/ta-alert-market-channel. QA merged the correct branch. Both branches deleted locally and remotely.

## Merge Status

- Merged: fix/ta-alert-market-channel to main at af6e5317
- Branches deleted: fix/ta-alert-market-channel, fix/sentiment-label-batch (local + remote)
- Pre-push tsc hook: PASS
