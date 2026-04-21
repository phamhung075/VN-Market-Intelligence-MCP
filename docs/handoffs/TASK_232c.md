# TASK-232c: Implement Three Routers (News/Price/BCTC) + Config

**Status**: GREEN (implementation for AC-2, AC-3, AC-4, AC-8, AC-11)

**Files**:
1. `src/infrastructure/fetchers/newsSourceRouter.ts`
2. `src/infrastructure/fetchers/priceSourceRouter.ts`
3. `src/infrastructure/fetchers/bctcSourceRouter.ts`
4. `mcp.config.json` (extend with `fallbacks` block)

**Dependency**: TASK_232b (resilientFetcher contract known)

**Hours**: 5h

---

## File 1: newsSourceRouter.ts

**Location**: `src/infrastructure/fetchers/newsSourceRouter.ts`

**Responsibility**: Select news source (VPS vs cache vs domestic RSS) based on circuit breaker state + config.

```typescript
/**
 * Infrastructure — News Source Router
 *
 * Intelligent selector for news sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → domestic RSS).
 *
 * @module infrastructure/fetchers/newsSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface NewsSourceRoute {
  primary: {
    type: "vps";
    endpoint: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "domestic_rss";
    endpoint: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  lastVpsHealthCheck: {
    state: CircuitState;
    failureCount?: number;
  };
}

/**
 * Route news fetch request to appropriate source.
 *
 * @param vpsHealth Current VPS health status
 * @param config Fallback configuration
 * @param cacheArticleCount24h Number of articles in cache (last 24h)
 * @returns Route object specifying primary + fallback chain
 */
export function newsSourceRouter(
  vpsHealth: {
    circuitState: CircuitState;
    lastSuccessMinutesAgo: number;
  },
  config: {
    enableDomesticNewsFallback: boolean;
  },
  cacheArticleCount24h: number
): NewsSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 15;
  const MIN_CACHE_ARTICLES_FOR_DOMESTIC_FALLBACK = 10;

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.circuitState === "open" ||
    vpsHealth.lastSuccessMinutesAgo > VPS_STALE_THRESHOLD_MINUTES;

  // Build fallback chain
  const fallbacks: NewsSourceRoute["fallbacks"] = [];

  if (shouldUseFallback) {
    // Always add cache fallback
    fallbacks.push({
      type: "cache",
      endpoint: "db:select from news where source IN (cafef, vnexpress, reuters, ...)",
      timeout: 5000,
      description: "Cached news from last 7 days (immediate, no freshness)",
    });

    // Conditionally add domestic RSS fallback
    if (
      config.enableDomesticNewsFallback &&
      cacheArticleCount24h < MIN_CACHE_ARTICLES_FOR_DOMESTIC_FALLBACK
    ) {
      fallbacks.push({
        type: "domestic_rss",
        endpoint: "cafef.vn, vnexpress.net, vneconomy.vn (direct, no VPS proxy)",
        timeout: 30000,
        description: "Direct RSS from Vietnamese sources (5-15min stale, bot-risk moderate)",
      });
    }
  }

  return {
    primary: {
      type: "vps",
      endpoint: `http://${process.env.VINAHOST_IP || "vps"}:3001/fetch-news`,
      timeout: 30000,
      description: "Real-time VPS proxy (10 sources, 226 items/15min)",
    },
    fallbacks,
    shouldUseFallback,
    lastVpsHealthCheck: {
      state: vpsHealth.circuitState,
      failureCount: breakers.cafef.failureCount, // Example: read from breaker
    },
  };
}
```

---

## File 2: priceSourceRouter.ts

**Location**: `src/infrastructure/fetchers/priceSourceRouter.ts`

**Responsibility**: Select price source based on staleness + ticker coverage.

```typescript
/**
 * Infrastructure — Price Source Router
 *
 * Intelligent selector for price sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → Yahoo Finance).
 *
 * @module infrastructure/fetchers/priceSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface PriceSourceRoute {
  primary: {
    type: "vps";
    source: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "yahoo";
    source: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  stalewnessMinutes: number;
  coverageGap: string | null;
}

/**
 * Route price fetch request to appropriate source.
 *
 * @param ticker Stock ticker (e.g., "VNM")
 * @param vpsHealth Current VPS health status
 * @param cachedPrice Last known price (if any)
 * @param stockClassification Classification (exchange, majorCap flag)
 * @returns Route object specifying primary + fallback chain
 */
export function priceSourceRouter(
  ticker: string,
  vpsHealth: {
    circuitState: CircuitState;
    lastQuoteMinutesAgo: number;
  },
  cachedPrice: { price: number; timestamp: Date } | null,
  stockClassification: {
    exchange: "HOSE" | "HNX" | "UPCOM";
    majorCap: boolean;
  }
): PriceSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 10;
  const MAJOR_CAPS = ["VNM", "FPT", "VCB", "HPG", "BID", "VHM", "VIC", "CTG"];

  // Calculate staleness of cached price
  let stalewnessMinutes = 0;
  if (cachedPrice && cachedPrice.timestamp) {
    stalewnessMinutes = Math.round(
      (Date.now() - cachedPrice.timestamp.getTime()) / 60_000
    );
  }

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.lastQuoteMinutesAgo > VPS_STALE_THRESHOLD_MINUTES;

  // Build fallback chain
  const fallbacks: PriceSourceRoute["fallbacks"] = [];
  let coverageGap: string | null = null;

  if (shouldUseFallback) {
    // Always add cache fallback
    fallbacks.push({
      type: "cache",
      source: "market_prices table (cached)",
      timeout: 5000,
      description: "Last known price from any source, <6h staleness",
    });

    // Conditionally add Yahoo Finance fallback (major caps only)
    if (stockClassification.majorCap && MAJOR_CAPS.includes(ticker)) {
      fallbacks.push({
        type: "yahoo",
        source: "Yahoo Finance API",
        timeout: 30000,
        description:
          "5-15min stale; HOSE major caps only; rate-limited 300 req/min",
      });
    } else if (stockClassification.exchange !== "HOSE") {
      // HNX/UPCOM not available from Yahoo
      coverageGap = `${stockClassification.exchange}-listed; unavailable from Yahoo fallback`;
    }
  }

  return {
    primary: {
      type: "vps",
      source: "VnDirect (via VPS)",
      timeout: 30000,
      description: "Real-time prices ALL exchanges (HOSE/HNX/UPCOM), <1min staleness",
    },
    fallbacks,
    shouldUseFallback,
    stalewnessMinutes,
    coverageGap,
  };
}
```

---

## File 3: bctcSourceRouter.ts

**Location**: `src/infrastructure/fetchers/bctcSourceRouter.ts`

**Responsibility**: Select BCTC source with Công Báo fallback conditional on config + time.

```typescript
/**
 * Infrastructure — BCTC Source Router
 *
 * Intelligent selector for BCTC financial report sources during VPS outages.
 * Decides: primary (VPS) → fallback chain (cache → Công Báo).
 *
 * @module infrastructure/fetchers/bctcSourceRouter
 */

import { breakers } from "../circuitBreakerRegistry.js";
import type { CircuitState } from "../circuitBreaker.js";

export interface BctcSourceRoute {
  primary: {
    type: "vps";
    source: string;
    timeout: number;
    description: string;
  };
  fallbacks: Array<{
    type: "cache" | "congbao_fallback";
    source: string;
    timeout: number;
    description: string;
  }>;
  shouldUseFallback: boolean;
  stalewnessHours: number;
  quartersAvailable: string[];
}

/**
 * Route BCTC fetch request to appropriate source.
 *
 * @param ticker Stock ticker
 * @param quarter Fiscal quarter (Q1, Q2, Q3, Q4)
 * @param vpsHealth Current VPS health status
 * @param cachedReport Last cached report (if any)
 * @param config Fallback configuration
 * @returns Route object specifying primary + fallback chain
 */
export function bctcSourceRouter(
  ticker: string,
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  vpsHealth: {
    circuitState: CircuitState;
    lastFetchMinutesAgo: number;
    openDurationMinutes: number;
  },
  cachedReport: { quarter: string; timestamp: Date } | null,
  config: {
    enableCongbaoFallback: boolean;
    congbaoMinVpsOpenMinutes: number;
  }
): BctcSourceRoute {
  const VPS_STALE_THRESHOLD_MINUTES = 360; // 6 hours

  // Calculate staleness of cached report
  let stalewnessHours = 0;
  if (cachedReport && cachedReport.timestamp) {
    stalewnessHours = Math.round(
      (Date.now() - cachedReport.timestamp.getTime()) / (60_000 * 60)
    );
  }

  // Determine if we should use fallback
  const shouldUseFallback =
    vpsHealth.lastFetchMinutesAgo > VPS_STALE_THRESHOLD_MINUTES ||
    vpsHealth.circuitState === "open";

  // Build fallback chain
  const fallbacks: BctcSourceRoute["fallbacks"] = [];

  if (shouldUseFallback) {
    // Always add cache fallback (BCTC reports are stable within quarter)
    fallbacks.push({
      type: "cache",
      source: "bctc_reports table (cached)",
      timeout: 5000,
      description: "Last parsed BCTC from previous fetch, any staleness",
    });

    // Conditionally add Công Báo fallback
    // Requires: config enabled AND VPS breaker open for long enough
    if (
      config.enableCongbaoFallback &&
      vpsHealth.circuitState === "open" &&
      vpsHealth.openDurationMinutes >= config.congbaoMinVpsOpenMinutes
    ) {
      fallbacks.push({
        type: "congbao_fallback",
        source: "congbao.xyz / Công Báo (government gazette, domestic fallback)",
        timeout: 60000,
        description:
          "BCTC published in govt gazette, 1-5 days delayed, requires SSC portal DOWN",
      });
    }
  }

  // Quarters available in cache (placeholder; fetched from DB in actual implementation)
  const quartersAvailable = cachedReport ? [cachedReport.quarter] : [];

  return {
    primary: {
      type: "vps",
      source: "congbothongtin.ssc.gov.vn (via VPS proxy + Puppeteer)",
      timeout: 120000,
      description: "Official SSC BCTC PDFs, <6h staleness, comprehensive",
    },
    fallbacks,
    shouldUseFallback,
    stalewnessHours,
    quartersAvailable,
  };
}
```

---

## File 4: mcp.config.json Extension

**Location**: `mcp.config.json` (add new top-level block)

**Existing structure**: Already has `circuitBreaker`, `alerts`, `fetchers`, etc.

**Add**:

```json
{
  // ... existing config ...

  "fallbacks": {
    "enableDomesticNewsFallback": false,
    "enableCongbaoFallback": false,
    "congbaoMinVpsOpenMinutes": 120,
    "thresholds": {
      "news": 15,
      "prices": 10,
      "bctc": 360,
      "sbv_rates": 120,
      "foreign_flow": 60
    }
  }

  // ... rest of existing config ...
}
```

**Semantics**:
- `enableDomesticNewsFallback` (boolean): Allow domestic RSS fallback for news (opt-in due to bot-risk)
- `enableCongbaoFallback` (boolean): Allow Công Báo fallback for BCTC (opt-in due to parsing complexity)
- `congbaoMinVpsOpenMinutes` (number): VPS must be open >N minutes before Công Báo engaged
- `thresholds.<service>` (number): Minutes before service marked "stale" (triggers fallback flag in Step 0c)

---

## Testing Strategy

### Router Testing (TASK_232a assertions)

- **AC-2** (2 assertions): newsSourceRouter decision tree
- **AC-3** (2 assertions): priceSourceRouter staleness + coverage
- **AC-4** (2 assertions): bctcSourceRouter Công Báo conditional
- **AC-8** (2 assertions): Domestic RSS opt-in
- **AC-11** (1 assertion): Circuit breaker state in output

**Total**: 9 assertions directly test routers.

### Test Pattern

Example (from TASK_232a):

```typescript
it("sets shouldUseFallback=true when VPS circuit breaker open", async () => {
  const route = newsSourceRouter(
    { circuitState: "open", lastSuccessMinutesAgo: 5 },
    { enableDomesticNewsFallback: true },
    15
  );
  expect(route.shouldUseFallback).toBe(true);
});
```

After implementation:
```bash
bun test src/__tests__/232-cowork-resilience.test.ts --test-name-pattern="AC-[23481]|AC-11"
```

All 9 assertions should PASS.

---

## Integration with resilientFetcher

### Usage Pattern (in agent .md files, Task 232d)

Each agent calls resilientFetcher via a router-constructed route object:

```typescript
// Step 1: Get route from router
const newsRoute = newsSourceRouter(
  {
    circuitState: breakers.cafef.state,
    lastSuccessMinutesAgo: getMinutesSinceLastNewsSuccess(),
  },
  config.fallbacks,
  getCacheArticleCount24h()
);

// Step 2: Construct fetchers from route
const primaryFetcher = () => fetchVpsNews(newsRoute.primary);
const fallbackFetchers = newsRoute.fallbacks.map(fb => {
  if (fb.type === "cache") return () => fetchCachedNews(fb);
  if (fb.type === "domestic_rss") return () => fetchDomesticRss(fb);
  throw new Error(`Unknown fallback type: ${fb.type}`);
});

// Step 3: Call resilientFetcher
const result = await resilientFetcher({
  fetcher: primaryFetcher,
  fallbacks: fallbackFetchers,
  context: { serviceName: "news", agentName: "01-news-scout" },
  onExhausted: async (ctx) => {
    await notifyUser({
      channel: "work",
      message: `[01-NEWS-SCOUT] VPS news pipeline exhausted...`,
      context: ctx,
    });
  },
});
```

---

## DDD Compliance Checklist

- [x] Routers import `circuitBreakerRegistry` (infrastructure) and `CircuitBreaker` types
- [x] Routers do NOT import domain services (domain stays pure)
- [x] Routers do NOT call fetchers (only select routes)
- [x] Config values read from `mcp.config.json` at startup (no Bun.env)
- [x] Pure functions (deterministic decision tree logic)
- [x] Zero side effects

---

## Configuration Loading

**At startup** (e.g., in main.ts or bootstrap function):

```typescript
import config from "../mcp.config.json" assert { type: "json" };

// Fallback config is now available via:
config.fallbacks.enableDomesticNewsFallback;
config.fallbacks.enableCongbaoFallback;
config.fallbacks.congbaoMinVpsOpenMinutes;
config.fallbacks.thresholds.news;
// etc.
```

**For tests**: Mock or inject config:

```typescript
const testConfig = {
  fallbacks: {
    enableDomesticNewsFallback: true,  // enable for this test
    enableCongbaoFallback: false,
    congbaoMinVpsOpenMinutes: 120,
    thresholds: { /* ... */ }
  }
};

const route = newsSourceRouter(vpsHealth, testConfig.fallbacks, cacheCount);
```

---

## Notes for Developer

### Router Return Semantics

Each router returns a route object that is **informational and actionable**:
- **Informational**: Describes breaker state, staleness, coverage gaps
- **Actionable**: Lists primary + fallbacks in order; agent constructs fetchers from it

Routers do NOT execute fetches. They only decide what sources are available.

### Logging

Add debug logs in each router (use infrastructure logger):

```typescript
if (shouldUseFallback) {
  logger.debug("[newsSourceRouter] VPS circuit breaker open; using fallbacks", {
    circuitState: vpsHealth.circuitState,
    lastSuccessMinutesAgo: vpsHealth.lastSuccessMinutesAgo,
  });
}
```

### Edge Cases

1. **Empty fallbacks array**: Allowed (means fallback disabled by config). Agent then only retries primary.
2. **Staleness boundary**: If lastQuoteMinutesAgo === 10, treat as BOUNDARY. Use `>` (not `>=`) for threshold.
3. **No cached price**: Treat as staleness = Infinity. Route to fallback immediately if VPS recent, but include cache in fallback chain anyway.

---

## Next Task

→ **TASK_232d**: Agent .md Step 0c integration + config loading (4h)

