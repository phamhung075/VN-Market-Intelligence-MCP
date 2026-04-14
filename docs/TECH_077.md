# TECH-077: Replace TE stream.ashx with Public RSS Feeds

status: APPROVED_BY_ARCHITECT
req_ref: REQ-077

---

## Brownfield Impact

- Files modified:
  - `src/infrastructure/fetchers/tradingEconomicsStream.ts` (full rewrite)
  - `docs/data/cron-registry.json` (lastUpdated field only)
- Files created:
  - `src/__tests__/1191-te-stream-rss.test.ts`
- Files deleted: none (content deleted within the modified file above)
- Breaking changes: no — exported function signature `fetchTradingEconomicsStream(httpClient?)` is
  backward compatible; `limit` parameter removed (RSS feeds do not support pagination).

---

## Architecture Decision

`tradingEconomicsStream.ts` is a pure infrastructure fetcher with a single public export consumed by
`pollNews.ts` via a zero-argument wrapper. The pattern established by `reuters.ts` (injectable
`HttpClient`, lazy axios, sequential `tryFetchFeed()` fallback) already solves every constraint in
REQ-077 — geo-blocking, test isolation, rate-limit separation, and backward-compatible source tags.
The implementation is a mechanical application of that pattern with three feeds instead of two, a
distinct rate-limiter host key, and a distinct log prefix. No new abstractions are needed.

---

## DDD Layer Plan

| Component                  | Layer          | File Path                                                       | New/Modify |
| -------------------------- | -------------- | --------------------------------------------------------------- | ---------- |
| tradingEconomicsStream.ts  | infrastructure | `src/infrastructure/fetchers/tradingEconomicsStream.ts`         | MODIFY     |
| Test suite 1191            | test           | `src/__tests__/1191-te-stream-rss.test.ts`                      | NEW        |
| cron-registry.json         | data           | `docs/data/cron-registry.json`                                  | MODIFY     |

---

## Exact Diff on tradingEconomicsStream.ts

### What to delete (entire blocks, in file order)

1. File-header JSDoc comment block (lines 1-14) — replace with new header describing RSS strategy.

2. The `import axios` / native-fetch path — the file currently uses the global `fetch` built-in
   directly. Delete the `AbortController` + `setTimeout` block entirely; axios via
   `makeDefaultHttpClient()` handles timeout in its config.

3. Constants block — delete:
   ```
   const TE_STREAM_URL = "https://tradingeconomics.com/ws/stream.ashx";
   const DEFAULT_LIMIT = 30;
   const TIMEOUT_MS = 15_000;
   ```

4. `TEStreamItem` interface — delete the entire interface (lines 41-52).

5. Current function signature `fetchTradingEconomicsStream(limit = DEFAULT_LIMIT)` — replace
   signature with `fetchTradingEconomicsStream(httpClient?: HttpClient)`.

6. Inside the function body — delete everything:
   - The `stream.ashx`-specific rate-limiter call on `"tradingeconomics.com"`.
   - The `AbortController` + `setTimeout` setup.
   - The `fetch(url, { headers: { Accept: "application/json" ... }})` call.
   - The `response.json()` parse path.
   - The `for (const item of data)` enrichment loop (country/category/importance metadata).
   - The `logger.info` log with `.map(d => d.country)`.
   - The outer `catch` block referencing `[te-stream]`.
   - The `finally { clearTimeout(timeoutId) }` block.

### What to add

1. New imports (replacing the current import block):
   ```typescript
   import { parseRssFeed, type RssItem } from "./rss.js";
   import type { HttpClient } from "./ssc.js";
   import { logger } from "../logger.js";
   import { globalRateLimiter } from "../../domain/services/rateLimiter.js";
   ```
   Note: `type { HttpClient }` is a type-only import — same pattern as `reuters.ts`.

2. Three named URL constants (replacing `TE_STREAM_URL` + `DEFAULT_LIMIT`):
   ```typescript
   const MW_RSS_URL =
     "https://feeds.marketwatch.com/marketwatch/topstories/";

   const GNEWS_MACRO_URL =
     "https://news.google.com/rss/search?q=global+economy+OR+central+bank+OR+interest+rate+OR+inflation&hl=en";

   const GNEWS_MARKETS_URL =
     "https://news.google.com/rss/search?q=financial+markets+OR+commodities+OR+USD+VND+exchange+rate&hl=en";
   ```

3. Keep unchanged:
   ```typescript
   const TE_SOURCE = "tradingeconomics";
   ```
   (`TIMEOUT_MS` moves inside `makeDefaultHttpClient()` as `timeout: 15_000`.)

4. New `makeDefaultHttpClient()` — identical copy from `reuters.ts`:
   - Lazy `await import("axios")`.
   - Browser `User-Agent`, `Accept: text/html,...`, `timeout: 15_000`, `responseType: "text"`,
     `maxRedirects: 5`.
   - Both MarketWatch RSS and Google News RSS return 403 for bot User-Agents.

5. New `tryFetchFeed(url, sourceTag, client)` — same signature and semantics as `reuters.ts` but
   with log prefix `[te-rss]`:
   ```typescript
   async function tryFetchFeed(
     url: string,
     sourceTag: string,
     client: HttpClient,
   ): Promise<RssItem[]>
   ```
   Internal steps: `client.get(url)` → `parseRssFeed(xml)` → tag items → return. Catch any error,
   log WARN `[te-rss] failed to fetch RSS feed`, return `[]`.

6. New `fetchTradingEconomicsStream(httpClient?)` body — sequential fallback:
   ```
   Guard:  if (!httpClient && !globalRateLimiter.canCall("tradingeconomics-rss")) → return []
   Build:  client = httpClient ?? (await makeDefaultHttpClient())
   Record: if (!httpClient) globalRateLimiter.recordCall("tradingeconomics-rss")
   Step 1: tryFetchFeed(MW_RSS_URL, TE_SOURCE, client)   → return if length > 0
   Step 2: tryFetchFeed(GNEWS_MACRO_URL, TE_SOURCE, client) → return if length > 0
   Step 3: tryFetchFeed(GNEWS_MARKETS_URL, TE_SOURCE, client) → return if length > 0
   Final:  logger.warn("[te-rss] all RSS sources failed") → return []
   ```

---

## Interface Contracts

### No new domain interfaces

`HttpClient` is imported from `./ssc.js` (existing interface, one-method `get(url): Promise<string>`).
`RssItem` is imported from `./rss.js` (existing interface, unchanged).

### Signature of the exported function (must be identical to what pollNews.ts expects)

```typescript
export async function fetchTradingEconomicsStream(
  httpClient?: HttpClient,
): Promise<RssItem[]>
```

`pollNews.ts` line pattern `fetchTradingEconomicsStream()` (zero args) remains valid because
`httpClient` is optional. The `limit` parameter is removed — it had no callers outside the function
itself, and RSS feeds do not accept a size parameter.

### `tryFetchFeed` helper (private, not exported)

```typescript
async function tryFetchFeed(
  url: string,
  sourceTag: string,
  client: HttpClient,
): Promise<RssItem[]>
```

---

## Rate Limiter Host Key Change

| Old key               | New key                  | Reason                                                     |
| --------------------- | ------------------------ | ---------------------------------------------------------- |
| `"tradingeconomics.com"` | `"tradingeconomics-rss"` | Isolates RSS budget from `fetchMacroIndicators()` HTML scraper |

The old key `"tradingeconomics.com"` is only referenced inside `tradingEconomicsStream.ts` (verified
by grep). `fetchMacroIndicators()` in `tradingEconomics.ts` uses its own host key. No cascading
changes needed.

Guard pattern (identical to `fetchReuters`):
- Injected `httpClient` present → skip both `canCall` and `recordCall` (test mode).
- Production: `canCall("tradingeconomics-rss")` false → log DEBUG, return `[]`.
- Production: first HTTP call → `recordCall("tradingeconomics-rss")` once.

---

## Test Fixture Design: src/__tests__/1191-te-stream-rss.test.ts

### Setup

```typescript
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock } from "bun:test";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";
import { fetchTradingEconomicsStream } from "../infrastructure/fetchers/tradingEconomicsStream.js";
```

No real network calls — all tests inject a mock `HttpClient` conforming to `{ get(url): Promise<string> }`.

### Minimal valid RSS 2.0 fixture string (shared across tests)

```typescript
const VALID_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Fed holds rates steady</title>
      <link>https://example.com/fed</link>
      <pubDate>Mon, 14 Apr 2026 10:00:00 GMT</pubDate>
      <description>Federal Reserve keeps benchmark rate unchanged.</description>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel></channel></rss>`;
```

### Test 1 — AC-2: Feed 1 succeeds, feeds 2 and 3 not called

Mock: `get(url)` returns `VALID_RSS` for `MW_RSS_URL`, throws for any other URL.
Assert: result length > 0, all items `source === 'tradingeconomics'`, no call count to Google URLs.

Implementation note — use a call-tracking mock:
```typescript
let callCount = 0;
const mockClient: HttpClient = {
  async get(url: string): Promise<string> {
    callCount++;
    if (url.includes("marketwatch")) return VALID_RSS;
    throw new Error("should not be called");
  },
};
```
Assert `callCount === 1` after call.

### Test 2 — AC-3: Feed 1 empty, Feed 2 succeeds

Mock: MarketWatch → `EMPTY_RSS`; GNEWS_MACRO_URL → `VALID_RSS`; GNEWS_MARKETS_URL → throws.
Assert: result length > 0, all `source === 'tradingeconomics'`.

### Test 3 — AC-4: Feeds 1 and 2 empty, Feed 3 succeeds

Mock: MarketWatch → `EMPTY_RSS`; GNEWS_MACRO_URL → `EMPTY_RSS`; GNEWS_MARKETS_URL → `VALID_RSS`.
Assert: result length > 0, all `source === 'tradingeconomics'`.

### Test 4 — AC-5: All three feeds empty → returns []

Mock: all three URLs → `EMPTY_RSS`.
Assert: result is `[]`, no throw.

### Test 5 — AC-6: HTTP error on Feed 1 triggers fallback to Feed 2

Mock: MarketWatch → throws `new Error("network timeout")`; GNEWS_MACRO_URL → `VALID_RSS`.
Assert: result length > 0, all `source === 'tradingeconomics'`. (Error is swallowed.)

### What NOT to test in the unit suite

- Rate-limit guard (AC-7): requires production mode — no injected `httpClient`. This is covered by
  manual verification or a separate integration test. Mocking `globalRateLimiter` in Bun is possible
  but adds complexity not required by the sprint goal (5 tests specified).
- `bun tsc --noEmit` (AC-8): CI check, not a unit test.

---

## Risk Assessment

| Risk                                              | Probability | Impact | Mitigation                                                                       |
| ------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------------------------- |
| MarketWatch RSS CDN outage                        | Low         | Medium | Sequential fallback to two Google News feeds handles this transparently          |
| Google News returns Atom 1.0 for some queries     | Medium      | Low    | `parseRssFeed()` already handles Atom via sprint 074 fix (`$("item, entry")`)    |
| MarketWatch returns 403 for bot User-Agent        | Medium      | Medium | Browser UA in `makeDefaultHttpClient()` matches what Google News requires        |
| All three feeds simultaneously unavailable        | Very Low    | Medium | Return `[]`; circuit breaker at `pollNews.ts` call site provides outer guard     |
| `limit` parameter removal breaks a hidden caller  | Very Low    | High   | Grep confirms the only call is `fetchTradingEconomicsStream()` with no args      |

---

## Security Review

- SQL parameterized? N/A (no SQL in this file)
- File paths validated (no `../`)? N/A (no file I/O)
- External HTTP rate-limited? Yes — `globalRateLimiter.canCall("tradingeconomics-rss")` guard preserved
- Secrets via Bun.env only? Yes — no API keys involved; all three feeds are public no-auth

---

## Task Breakdown (for PM)

Single atomic task — no sub-dependencies:

1. **Task 1191** (already in TASKS.md): Rewrite `tradingEconomicsStream.ts` following this design.
   Deliverables:
   - Updated `tradingEconomicsStream.ts` (zero references to `stream.ashx`, `TEStreamItem`, `DEFAULT_LIMIT`)
   - New `src/__tests__/1191-te-stream-rss.test.ts` (5 tests, all green)
   - Updated `docs/data/cron-registry.json` (`lastUpdated: "2026-04-14"`)
   - `bun tsc --noEmit` clean
   - `pollNews.ts` zero-diff confirmed

---

## Zero-Diff Files (must not change)

- `src/application/usecases/pollNews.ts`
- `src/infrastructure/circuitBreakerRegistry.ts`
- `src/infrastructure/fetchers/index.ts`
- `src/infrastructure/fetchers/reuters.ts`
- `src/infrastructure/fetchers/rss.ts`
