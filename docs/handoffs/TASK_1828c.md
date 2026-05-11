# TASK 1828c — Reuters RSS + tradingEconomics Consecutive-Error Observability

**Status:** In Progress
**Branch:** `task/1828c-rss-error-observability`
**Owner:** developer
**Handoff to:** qa
**Priority:** High
**Type:** SPRINT-S

---

## Context

Two RSS fetchers (`reuters.ts` and `tradingEconomicsStream.ts`) silently return `[]` on
repeated failures with no alerting. An operator cannot distinguish a transient blip from a
sustained outage (e.g. Google News / MarketWatch blocking the IP). This task adds a
module-level consecutive-error counter + one-shot WORK channel alert at threshold 10, with
auto-reset on the first successful result.

The pattern is identical to the te-chromium crash-loop circuit breaker shipped in task 1823d.
`pollNews.ts` requires NO changes — the `deps` parameter is optional and defaults to
production Telegram injection.

---

## Files to Modify

### 1. `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` (+~48 lines)

Add after the existing constants block:

```typescript
// ---------------------------------------------------------------------------
// Consecutive-error observability
// ---------------------------------------------------------------------------

export const REUTERS_ERROR_THRESHOLD = 10;

/** Module-level counter — incremented on every full-failure cycle. */
let _reutersConsecutiveErrors = 0;
/** One-shot flag — prevents alert spam after threshold is reached. */
let _reutersAlertSent = false;

/** Reset counter + flag. Called by tests for isolation. */
export function resetReutersErrorCounter(): void {
  _reutersConsecutiveErrors = 0;
  _reutersAlertSent = false;
}

/** Dependency injection interface (onAlert defaults to real Telegram in production). */
export interface ReutersDeps {
  onAlert?: (msg: string) => void | Promise<void>;
}
```

Update `fetchReuters` signature:

```typescript
export async function fetchReuters(
  httpClient?: HttpClient,
  deps?: ReutersDeps,
): Promise<RssItem[]>
```

At each successful-result return path (primaryItems and secondaryItems), reset the counter:

```typescript
_reutersConsecutiveErrors = 0;
_reutersAlertSent = false;
return primaryItems; // or secondaryItems
```

At the "all sources failed" return path (Step 3), increment and fire one-shot alert:

```typescript
_reutersConsecutiveErrors++;
if (_reutersConsecutiveErrors >= REUTERS_ERROR_THRESHOLD && !_reutersAlertSent) {
  _reutersAlertSent = true;
  const msg = `[reuters] ALERTE: ${_reutersConsecutiveErrors} echecs consecutifs — toutes les sources RSS ont echoue`;
  logger.error(msg);
  if (deps?.onAlert) {
    await deps.onAlert(msg);
  } else {
    // production default: import sendTelegramMessage and send to WORK channel
    const { sendTelegramMessage } = await import("../telegram/telegramClient.js");
    await sendTelegramMessage("work", msg).catch(() => {});
  }
}
logger.warn("[reuters] all RSS sources failed — returning empty array");
return [];
```

---

### 2. `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsStream.ts` (+~54 lines)

Same pattern:

```typescript
export const TE_STREAM_ERROR_THRESHOLD = 10;

let _teStreamConsecutiveErrors = 0;
let _teStreamAlertSent = false;

export function resetTeStreamErrorCounter(): void {
  _teStreamConsecutiveErrors = 0;
  _teStreamAlertSent = false;
}

export interface TeStreamDeps {
  onAlert?: (msg: string) => void | Promise<void>;
}
```

Update `fetchTradingEconomicsStream` signature:

```typescript
export async function fetchTradingEconomicsStream(
  httpClient?: HttpClient,
  deps?: TeStreamDeps,
): Promise<RssItem[]>
```

At each successful-feed return path (feed1, feed2, feed3), reset:

```typescript
_teStreamConsecutiveErrors = 0;
_teStreamAlertSent = false;
return feed1; // or feed2 / feed3
```

At "all three failed" return path:

```typescript
_teStreamConsecutiveErrors++;
if (_teStreamConsecutiveErrors >= TE_STREAM_ERROR_THRESHOLD && !_teStreamAlertSent) {
  _teStreamAlertSent = true;
  const msg = `[te-rss] ALERTE: ${_teStreamConsecutiveErrors} echecs consecutifs — toutes les sources RSS ont echoue`;
  logger.error(msg);
  if (deps?.onAlert) {
    await deps.onAlert(msg);
  } else {
    const { sendTelegramMessage } = await import("../telegram/telegramClient.js");
    await sendTelegramMessage("work", msg).catch(() => {});
  }
}
logger.warn("[te-rss] all RSS sources failed — returning empty array");
return [];
```

---

### 3. `apps/mcp-server/src/__tests__/1828c-rss-consecutive-error.test.ts` (new, ~200 lines)

Template skeleton (developer fills in full assertions):

```typescript
// apps/mcp-server/src/__tests__/1828c-rss-consecutive-error.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  fetchReuters,
  resetReutersErrorCounter,
  REUTERS_ERROR_THRESHOLD,
} from "../infrastructure/fetchers/reuters.js";
import {
  fetchTradingEconomicsStream,
  resetTeStreamErrorCounter,
  TE_STREAM_ERROR_THRESHOLD,
} from "../infrastructure/fetchers/tradingEconomicsStream.js";

// Mock httpClient that always returns empty XML (simulates all-feeds-failed)
const emptyXml = `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`;
const failingClient = { get: async (_url: string) => emptyXml };

// Mock httpClient that returns 1 item (simulates success)
const successXml = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Test</title><link>http://example.com</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
</channel></rss>`;
const successClient = { get: async (_url: string) => successXml };

describe("1828c — Reuters RSS consecutive-error observability", () => {
  beforeEach(() => {
    resetReutersErrorCounter();
  });

  it("AC-R-1: counter increments on each all-failed cycle", async () => { /* ... */ });
  it("AC-R-2: alert fires exactly once at REUTERS_ERROR_THRESHOLD", async () => { /* ... */ });
  it("AC-R-3: alert does not re-fire after threshold already reached", async () => { /* ... */ });
  it("AC-R-4: counter resets on first successful result", async () => { /* ... */ });
  it("AC-R-5: alert message contains consecutive count and source name", async () => { /* ... */ });
  it("AC-R-6: resetReutersErrorCounter clears state for test isolation", async () => { /* ... */ });
});

describe("1828c — TradingEconomics RSS consecutive-error observability", () => {
  beforeEach(() => {
    resetTeStreamErrorCounter();
  });

  it("AC-TE-1: counter increments on each all-failed cycle", async () => { /* ... */ });
  it("AC-TE-2: alert fires exactly once at TE_STREAM_ERROR_THRESHOLD", async () => { /* ... */ });
  it("AC-TE-3: alert does not re-fire after threshold already reached", async () => { /* ... */ });
  it("AC-TE-4: counter resets on first successful result", async () => { /* ... */ });
  it("AC-TE-5: alert message contains consecutive count and source name", async () => { /* ... */ });
  it("AC-TE-6: resetTeStreamErrorCounter clears state for test isolation", async () => { /* ... */ });
});
```

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-R-1 | After N < 10 all-failed cycles, `_reutersConsecutiveErrors === N` |
| AC-R-2 | At cycle 10, `onAlert` spy is called exactly once |
| AC-R-3 | At cycles 11, 12, ..., `onAlert` spy is NOT called again |
| AC-R-4 | After a successful fetch following failures, counter resets to 0 |
| AC-R-5 | Alert message includes the consecutive error count and the word "reuters" |
| AC-R-6 | `resetReutersErrorCounter()` zeroes both counter and flag |
| AC-TE-1 | After N < 10 all-failed cycles, `_teStreamConsecutiveErrors === N` |
| AC-TE-2 | At cycle 10, `onAlert` spy is called exactly once |
| AC-TE-3 | At cycles 11, 12, ..., `onAlert` spy is NOT called again |
| AC-TE-4 | After a successful fetch following failures, counter resets to 0 |
| AC-TE-5 | Alert message includes the consecutive error count and "te-rss" |
| AC-TE-6 | `resetTeStreamErrorCounter()` zeroes both counter and flag |

---

## Constraints

- `pollNews.ts` — NO changes. `deps` is optional; production callers do not pass it.
- `tradingEconomicsChromium.ts` — DO NOT TOUCH. Separate crash-loop circuit breaker (1823d).
- `tsc --noEmit` must pass with 0 errors after changes.
- No real HTTP in tests — inject `httpClient` mock.
- No real Telegram in tests — inject `onAlert` spy.
- Baseline: 8582 passing tests. New suite must add 12 pass / 0 fail.

---

## Test Command

```bash
cd apps/mcp-server && bun test src/__tests__/1828c-rss-consecutive-error.test.ts
```

---

## Done Definition

- [ ] 12 tests pass / 0 fail in `1828c-rss-consecutive-error.test.ts`
- [ ] `tsc --noEmit` 0 errors
- [ ] `pollNews.ts` unchanged
- [ ] `tradingEconomicsChromium.ts` unchanged
- [ ] TASKS.md row moved to Review
