# TASK 1833g — FIX: te-chromium CB hour-window + backoff + disable Reuters/TE legacy sources

**Sprint:** 1833
**Priority:** P1-CRITICAL
**Type:** BUG
**Owner:** developer
**Branch:** `task/1833g-te-cb-hour-window-disable-legacy-sources`
**Estimate:** ~2h
**Depends on:** 1829b (Done), 1832b (Done)

---

## Context

The `tradingEconomicsChromium.ts` circuit breaker counts consecutive errors but never resets
within a session — a single bad VPS hour permanently suppresses the CB for the Docker
container lifetime. Separately, Reuters RSS and Trading Economics legacy fetchers have 58+
consecutive failures (never succeeded) and are cluttering the active-source list.

---

## Files Changed

| # | File | Change |
|---|------|--------|
| 1 | `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts` | Extend `TeCbState` with `lastFailureWindowStartMs`; add 1-hour window reset; add `sleepMs` to `TeNewsDeps`; add exponential backoff `Math.min(5000 * 2^consecutiveErrors, 60_000)` ms before inner retry (~30 lines) |
| 2 | `apps/mcp-server/src/application/usecases/pollNews.ts` | Change `reuters` and `tradingeconomics` entries in `resolvedFetchers` to injected-only (not default) (~6 lines) |
| 3 | `apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts` | Remove `"Reuters RSS"` and `"Trading Economics"` from `seedKnownSources` array (~2 lines) |
| 4 | `apps/mcp-server/src/__tests__/1833g-cb-hour-window.test.ts` | New test file — ~80 lines (see ACs below) |

---

## Acceptance Criteria

### AC-1 — Hour-window reset
- Given `consecutiveErrors = 5` and `lastFailureWindowStartMs` is >3600s ago
- When a new failure arrives
- Then `consecutiveErrors` resets to 1 and `lastFailureWindowStartMs` is updated to now

### AC-2 — No reset within window
- Given `consecutiveErrors = 5` and `lastFailureWindowStartMs` is <3600s ago
- When a new failure arrives
- Then `consecutiveErrors` increments to 6 (no reset)

### AC-3 — Exponential backoff applied
- Given `consecutiveErrors = 2`
- When the CB allows a retry
- Then `sleepMs` called with value between 5000 and 60000 (inclusive)
- And value equals `Math.min(5000 * 2^2, 60_000)` = 20000

### AC-4 — Backoff capped at 60s
- Given `consecutiveErrors = 10`
- When the CB allows a retry
- Then `sleepMs` called with exactly 60000

### AC-5 — Reuters not in default resolvedFetchers
- When `pollNews` is called without injecting a `reuters` fetcher
- Then Reuters is not invoked (no call to the reuters fetch function)

### AC-6 — Trading Economics legacy not in default resolvedFetchers
- When `pollNews` is called without injecting a `tradingeconomics` fetcher
- Then the TE legacy fetcher is not invoked

### AC-7 — seedKnownSources does not contain Reuters RSS or Trading Economics
- When `sourceHealthTools.ts` `seedKnownSources` is read
- Then `"Reuters RSS"` is absent
- And `"Trading Economics"` is absent

### AC-8 — Backward compat: 1829b CB persist still works
- `bun test src/__tests__/1829b-te-chromium-cb-persist.test.ts` passes with 0 failures

---

## Pre-merge Verification (all must pass)

```bash
cd apps/mcp-server

# 1. Backward compat
bun test src/__tests__/1829b-te-chromium-cb-persist.test.ts

# 2. New ACs
bun test src/__tests__/1833g-cb-hour-window.test.ts

# 3. pollNews regression
bun test src/__tests__/1832b-pollnews-active-source-filter.test.ts

# 4. Reuters injected path unaffected
bun test src/__tests__/1345a-reuters-fallback.test.ts

# 5. Full suite — 0 new failures
bun test
```

---

## Dependency Map

```
1829b (Done) ──► 1833g   [extends TeCbState interface]
1832b (Done) ──► 1833g   [pollNews resolvedFetchers already tested]
1833g ──► (none)          [standalone, unblocks 1833k]
```

---

## Out of Scope

- Fixing the Playwright executable path / anti-bot detection on VPS (tracked as 1833k)
- Market-hours SLA monitor fix (tracked as 1833h)
- vnstock global rate limiter (tracked as 1833i)
