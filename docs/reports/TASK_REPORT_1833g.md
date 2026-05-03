# Task Report: 1833g — te-chromium CB Hour-Window + Disable Reuters/TE Legacy

**Branch:** `task/1833g-te-chromium-cb-hour-window`
**Commit:** `8b473077`
**Status:** DONE
**Date:** 2026-05-03

---

## Summary

Two sub-fixes delivered:

1. **CB hour-window + exponential backoff** — tightened the te-chromium circuit breaker to reset the error counter when a new 1-hour window begins, preventing stale failures from permanently locking the browser scraper. Added exponential backoff (5s → 10s → 20s → cap 60s) before the inner Chromium retry so crash-storm frequency is naturally damped.

2. **Disable Reuters RSS + TE legacy** — removed both sources from the default `resolvedFetchers` in `pollNews.ts`. They are now injected-only (tests and explicit overrides), preventing them from firing in scheduled production runs. Removed their dead seed entries from `sourceHealthTools.ts`.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts` | Added `lastFailureWindowStartMs` to `TeCbState`; hour-window reset logic in failure-counting block; exponential backoff before inner retry; `sleepMs` field added to `TeNewsDeps`; success and reset paths write `lastFailureWindowStartMs: 0` |
| `apps/mcp-server/src/application/usecases/pollNews.ts` | `reuters` and `tradingeconomics` removed from default `resolvedFetchers`; now injected-only via spread |
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts` | Removed `"Reuters RSS"` and `"Trading Economics"` from `seedKnownSources`; replaced with `"Trading Economics News"` (Chromium slot); same update in `_resetGlobalSourceTracker` |
| `apps/mcp-server/src/__tests__/1833g-cb-hour-window.test.ts` | New test file — 11 tests covering AC-1 through AC-4 + field validation |
| `apps/mcp-server/src/__tests__/1829b-te-chromium-cb-persist.test.ts` | Added `sleepMs: noopSleep` to all Target-closed calls; updated `TeCbState` literal to use `Omit<>` for backward-compat pre-existing state |
| `apps/mcp-server/src/__tests__/1823d-te-chromium-crash-fix.test.ts` | Added `noopSleep` helper; injected into all Target-closed `fetchTradingEconomicsNews` calls |

---

## Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | Failures within same 1-hour window accumulate toward threshold | PASS |
| AC-2 | Failure after window expiry resets counter to 1 (new window) | PASS |
| AC-3 | Exponential backoff `sleepMs` called with correct delay before inner retry | PASS |
| AC-4 | `sleepMs` is injectable — no real sleep in tests | PASS |
| Regression | 1829b CB persist tests still pass | PASS |
| Regression | 1823d crash loop tests still pass | PASS |
| Regression | 1832b active-source filter tests still pass | PASS |
| Regression | 1345a Reuters fallback tests still pass | PASS |

---

## Test Results

```
1833g-cb-hour-window.test.ts    11 pass  0 fail
1829b-te-chromium-cb-persist    4 pass   0 fail
1823d-te-chromium-crash-fix     5 pass   0 fail
1832b-pollnews-active-source    5 pass   0 fail
1345a-reuters-fallback          14 pass  0 fail

Full suite: 8619 pass, 38 skip, 1 fail (1331a pre-existing)
```

---

## Design Notes

### Backward compatibility for `lastFailureWindowStartMs`

Old state files (persisted before this sprint) lack the `lastFailureWindowStartMs` field. When `loadCbState` reads them, the field is `undefined`. The hour-window condition `Date.now() - undefined > 3_600_000` evaluates to `NaN > 3_600_000 = false`, so no spurious reset occurs. The field is written with the correct value on the next failure, completing the migration transparently.

### Why both Reuters RSS and TE legacy are injected-only

Both sources were already functionally replaced:
- **Reuters RSS** — replaced by VPS push pipeline (1345a)
- **Trading Economics (legacy stream)** — replaced by Chromium scraper slot `teChromiumNews` (1799)

Keeping them in the default resolved set caused false "all sources dark" counts and unnecessary circuit-breaker churn for sources that were never expected to return items in production.

---

## Handoff to QA

QA should verify:
1. `1833g-cb-hour-window.test.ts` — all 11 ACs green
2. `1829b-te-chromium-cb-persist.test.ts` — regression clean
3. `1823d-te-chromium-crash-fix.test.ts` — regression clean
4. `pollNews` call without `fetchers.reuters` or `fetchers.tradingeconomics` injected does not include them in `resolvedFetchers`
5. `sourceHealthTools.ts` seeds do not include `"Reuters RSS"` or `"Trading Economics"`
