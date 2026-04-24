# TECH-232: Cowork Resilience — Self-Healing Agent Recovery from VPS Pipeline Failures

status: APPROVED_BY_ARCHITECT
req_ref: REQ-232

---

## Brownfield Impact

| File | Status | Reason |
|------|--------|--------|
| `src/domain/services/resilientFetcher.ts` | NEW | Core retry + fallback orchestration engine |
| `src/infrastructure/fetchers/newsSourceRouter.ts` | NEW | Intelligent news source selection (VPS→cache→domestic RSS) |
| `src/infrastructure/fetchers/priceSourceRouter.ts` | NEW | Price fallback chain (VPS→cache→Yahoo) |
| `src/infrastructure/fetchers/bctcSourceRouter.ts` | NEW | BCTC fallback (VPS→cache→Công Báo) |
| `src/__tests__/232-cowork-resilience.test.ts` | NEW | TDD RED test suite (12+ assertions) |
| `.claude/agents/01-news-scout.md` | MODIFY | Step 0c: service health check + fallback decision tree |
| `.claude/agents/02-financial-analyst.md` | MODIFY | Step 0c: service health check + fallback decision tree |
| `.claude/agents/04-market-watcher.md` | MODIFY | Step 0c: service health check + fallback decision tree |
| `mcp.config.json` | MODIFY | Add `fallbacks` config block: thresholds, opt-in flags |
| `src/infrastructure/circuitBreakerRegistry.ts` | VERIFY | Existing breakers: cafef, vnexpress, ssc, hose, hnx, yahooFinance, sbv — no changes needed |
| `src/domain/services/rateLimiter.ts` | VERIFY | Existing rate limiter — resilientFetcher will call before each retry |

**Breaking changes**: None. All new code; config additions backward-compatible (defaults = fallback disabled).

---

## Architecture Decision

**Principle**: Single point of failure (VPS Singapore) → distributed resilience without architectural redesign.

REQ-232 adds a **resilient orchestration layer** (domain + infrastructure) that wraps VPS fetchers with exponential backoff + multi-tier fallback chains. Key insight: *circuit breaker state is read-only information passed to fallback routers; we do NOT skip primary retries based on breaker state alone*. This prevents infinite loops and respects the principle that Vinahost VPS can recover unpredictably.

**Design coordinates with existing patterns**:
1. **Circuit breaker** (`src/infrastructure/circuitBreakerRegistry.ts`) remains single responsibility: tracks failures + enforces state transitions. Resilient fetcher queries it, never overrides it.
2. **Rate limiter** (`src/domain/services/rateLimiter.ts`) enforces per-host min intervals — resilient fetcher calls it before each retry attempt.
3. **Agent .md files** (Cowork) add Step 0c initialization that runs fallback decision trees, passes context to fetch calls.
4. **DDD compliance**: domain/services (resilientFetcher) → zero imports from infrastructure. Infrastructure routers (newsSourceRouter, priceSourceRouter, bctcSourceRouter) may import domain (circuits, constants, rateLimiter) but zero back-imports.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify | Reason |
|-----------|-------|-----------|-----------|--------|
| `ResilientFetcher` | domain/services | `src/domain/services/resilientFetcher.ts` | NEW | Pure domain logic: retry orchestration, backoff math, fallback sequencing. Zero infra imports. Accepts array of async fetchers + context. |
| `newsSourceRouter` | infrastructure/fetchers | `src/infrastructure/fetchers/newsSourceRouter.ts` | NEW | Adapter: queries circuit breaker + config to select primary vs fallback chain. May import domain (rateLimiter, constants) only. |
| `priceSourceRouter` | infrastructure/fetchers | `src/infrastructure/fetchers/priceSourceRouter.ts` | NEW | Adapter: queries breaker + config, selects VPS vs cache vs Yahoo based on staleness + ticker coverage. |
| `bctcSourceRouter` | infrastructure/fetchers | `src/infrastructure/fetchers/bctcSourceRouter.ts` | NEW | Adapter: queries breaker + config, selects VPS vs cache vs Công Báo fallback. |
| Agent init (Step 0c) | interface/scheduler | `.claude/agents/01,02,04-*.md` | MODIFY | Agent-level decision tree: checks VPS health per service, logs decision, passes `serviceHealth` context to fetch calls. |
| TDD test suite | tests | `src/__tests__/232-cowork-resilience.test.ts` | NEW | RED phase: 12+ assertions covering AC-1 to AC-12 (resilient orchestration, routers, escalation, metadata). |
| Configuration | root | `mcp.config.json` | MODIFY | Add `fallbacks: { enableDomesticNewsFallback, enableCongbaoFallback, thresholds: { ... } }` block. |

---

## Interface Contracts

### ResilientFetcher — Domain Service

**Location**: `src/domain/services/resilientFetcher.ts`

```typescript
/**
 * Resilient fetcher orchestration: retry + fallback routing.
 * Pure domain logic (no infra imports).
 *
 * Input: primary fetcher + fallback chain + config
 * Output: data | exhausted with error log
 */

export interface ResilientFetcherConfig {
  fetcher: () => Promise<T>;              // primary fetcher (e.g., VPS news)
  fallbacks: Array<() => Promise<T>>;     // [fallback_1, fallback_2, ...]
  maxRetries: number;                      // default: 3
  initialBackoffMs: number;                // default: 1000 (1s)
  maxBackoffMs: number;                    // default: 8000 (8s)
  timeoutMs: number;                       // default: 30000 (30s)
  context: {
    serviceName: string;                   // "news" | "prices" | "bctc" | "sbv_rates" | "foreign_flow"
    agentName: string;                     // "01-news-scout" | "02-financial-analyst" | "04-market-watcher"
  };
  onExhausted?: (ctx: ExhaustedContext) => Promise<void>;  // callback when all retries exhausted
}

export interface ResilientFetcherResult<T> {
  success: boolean;
  data: T | null;
  source: "primary" | "fallback_1" | "fallback_2" | "exhausted";
  retriesUsed: number;
  totalDurationMs: number;
  errorLog: Array<{
    attempt: number;
    source: string;
    error: string;
    durationMs: number;
  }>;
}

export interface ExhaustedContext {
  serviceName: string;
  agentName: string;
  breakerState: "open" | "half-open" | "closed" | "unknown";
  minutesSinceLastSuccess: number;
  fallbacksAttempted: string[];
  errorLog: any[];
}

export async function resilientFetcher<T>(config: ResilientFetcherConfig): Promise<ResilientFetcherResult<T>>
```

**Algorithm**:
1. Initialize total start time, attempt counter = 0
2. **Retry loop** (up to `maxRetries`):
   - Start retry timer
   - Try `fetcher()` with timeout
   - If success → return `{ success: true, data, source: "primary", ... }`
   - If timeout OR error → wait exponential backoff (min(2^attempt * initialBackoffMs, maxBackoffMs))
   - Record error in log
   - If total elapsed > 180s → break and move to fallbacks
3. **Fallback loop** (fallback_1, fallback_2):
   - Try fallback_N with timeout (no backoff, single attempt per fallback)
   - If success → return `{ success: true, data, source: "fallback_N", ... }`
   - If timeout OR error → record, try next fallback
4. **Exhaustion**:
   - If all fallbacks fail → return `{ success: false, data: null, source: "exhausted", ... }`
   - Call `onExhausted(ctx)` callback if provided

---

### newsSourceRouter — Infrastructure Adapter

**Location**: `src/infrastructure/fetchers/newsSourceRouter.ts`

```typescript
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
    state: "open" | "half-open" | "closed" | "unknown";
    failureCount?: number;
  };
}

export function newsSourceRouter(
  vpsHealth: { circuitState: string; lastSuccessMinutesAgo: number },
  config: { enableDomesticNewsFallback: boolean },
  cacheArticleCount24h: number
): NewsSourceRoute {
  // Decision tree:
  // 1. If circuit breaker "open" OR last success >15min ago → shouldUseFallback = true
  // 2. If shouldUseFallback:
  //    a. Add cache fallback always
  //    b. Add domestic_rss fallback ONLY if enableDomesticNewsFallback=true AND cacheArticleCount24h < 10
  // 3. Log decision with timestamp + reason code
  // 4. Return route object
}
```

---

### priceSourceRouter — Infrastructure Adapter

**Location**: `src/infrastructure/fetchers/priceSourceRouter.ts`

```typescript
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

export function priceSourceRouter(
  ticker: string,
  vpsHealth: { circuitState: string; lastQuoteMinutesAgo: number },
  cachedPrice: { price: number; timestamp: Date } | null,
  stockClassification: { exchange: "HOSE" | "HNX" | "UPCOM"; majorCap: boolean }
): PriceSourceRoute {
  // Decision tree:
  // 1. If last VPS quote >10min ago → shouldUseFallback = true
  // 2. If shouldUseFallback:
  //    a. Add cache fallback always
  //    b. Add Yahoo fallback ONLY if majorCap=true AND ticker in [VNM, FPT, VCB, HPG, ...] (HOSE major caps)
  //    c. Mark coverageGap if ticker is HNX/UPCOM-only → Yahoo unavailable
  // 3. Return route with stalewnessMinutes = age of cached price
}
```

---

### bctcSourceRouter — Infrastructure Adapter

**Location**: `src/infrastructure/fetchers/bctcSourceRouter.ts`

```typescript
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

export function bctcSourceRouter(
  ticker: string,
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  vpsHealth: { circuitState: string; lastFetchMinutesAgo: number; openDurationMinutes: number },
  cachedReport: { quarter: string; timestamp: Date } | null,
  config: { enableCongbaoFallback: boolean; congbaoMinVpsOpenMinutes: number }
): BctcSourceRoute {
  // Decision tree:
  // 1. If last VPS fetch >6h ago OR circuit breaker open → shouldUseFallback = true
  // 2. If shouldUseFallback:
  //    a. Add cache fallback always (BCTC stable within quarter)
  //    b. Add congbao_fallback ONLY if:
  //       - enableCongbaoFallback=true AND
  //       - VPS circuit breaker open >congbaoMinVpsOpenMinutes (default 120min)
  // 3. Return route with stalewnessHours + quartersAvailable list
}
```

---

### Agent Step 0c — Service Health Check

**Location**: `.claude/agents/01-news-scout.md`, `02-financial-analyst.md`, `04-market-watcher.md` (modified Step 0)

**New pseudocode block** (inserted after Step 0b error handling):

```
### Step 0c: VPS Service Health Check & Fallback Decision Tree

FOR EACH service IN ["news", "prices", "bctc", "sbv_rates", "foreign_flow"]:
  circuitState = getCircuitBreakerState(service)
  lastSuccessMinutesAgo = getServiceLastSuccessAge(service)
  thresholds = CONFIG.fallbacks.thresholds

  IF circuitState == "open":
    LOG("[INIT] {service} circuit breaker OPEN; will use fallbacks")
    serviceHealth[service] = { useFallback: true, reason: "breaker_open" }
  ELSE IF lastSuccessMinutesAgo > thresholds[service]:
    LOG("[INIT] {service} stale ({lastSuccessMinutesAgo}min > {threshold}min); will try VPS once, then fallback")
    serviceHealth[service] = { useFallback: true, reason: "stale", staleMins: lastSuccessMinutesAgo }
  ELSE:
    LOG("[INIT] {service} healthy; using primary")
    serviceHealth[service] = { useFallback: false }

STORE serviceHealth context for Step 1+ fetch operations
```

**Integration point**: Before Step 1 (Fetch news), agent consults `serviceHealth["news"].useFallback` flag to decide route:

```
IF serviceHealth["news"].useFallback:
  routes = newsSourceRouter(vpsHealth, config, cacheCount)
  news = await resilientFetcher({
    fetcher: () => fetchVpsNews(...),
    fallbacks: [
      () => fetchCachedNews(...),
      () => config.fallbacks.enableDomesticNewsFallback ? fetchDomesticRss(...) : Promise.reject(...)
    ],
    context: { serviceName: "news", agentName: "01-news-scout" },
    onExhausted: async (ctx) => {
      await notifyUser({
        channel: "work",
        severity: "alert",
        message: `[01-NEWS-SCOUT] VPS news pipeline exhausted. All retries + cache + fallback exhausted. Will resume when VPS recovers.`,
        context: { ...ctx, breakerState: ctx.breakerState }
      });
      db.run("UPDATE agent_status SET status = ? WHERE agent_name = ?", ["degraded", "01-news-scout"]);
    }
  })
ELSE:
  news = await resilientFetcher({
    fetcher: () => fetchVpsNews(...),
    fallbacks: [],  // no fallback; just retry with backoff
    ...
  })
```

---

### Config Extension — mcp.config.json

**Location**: `mcp.config.json` (new top-level block)

```json
{
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
}
```

**Semantics**:
- `enableDomesticNewsFallback`: If true, domestic RSS fallback allowed ONLY if cache has <10 articles in 6h window. If false, no domestic RSS (fail-loud instead).
- `enableCongbaoFallback`: If true, Công Báo fallback allowed ONLY if VPS open >120min. If false, no Công Báo (fail-loud instead).
- `congbaoMinVpsOpenMinutes`: VPS must be open this long before Công Báo fallback engages (default 120min = 2h).
- `thresholds.<service>`: Minutes before service marked "stale" (triggers fallback flag in Step 0c).

---

## Task Breakdown (for PM)

Atomic tasks in dependency order:

| Task | Owner | Est. Hours | Dependencies |
|------|-------|-----------|---|
| **232a** [Dev] TDD RED test suite | Developer | 2h | None |
| **232b** [Dev] resilientFetcher + circuit breaker integration | Developer | 6h | 232a (tests exist) |
| **232c** [Dev] Three routers (news/price/bctc) | Developer | 5h | 232b (resilientFetcher contract known) |
| **232d** [Dev] Agent .md Step 0c integration + config | Developer | 4h | 232c (routers contract known) |
| **232e** [QA] Integration test + fail-loud escalation verification | QA | 2h | 232d (all shipped) |

**Total**: 19 hours (fits M sprint, ship in 1–2 days).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| **Domestic RSS fallback triggers bot-blocking** | Medium | High | Opt-in feature (disabled by default); rate-limit to 1 call/min; monitor user feedback channel |
| **Fallback metadata bloat** (alerts 2x larger) | Low | Low | Fields are optional in signal schema; pruned in archived alerts after 7 days |
| **Stale fallback data misleads user** ("Why alert on 2h old price?") | Medium | Medium | Include `fetched_at` + `staleness_minutes` in all alert metadata; briefing educates user |
| **Cache corrupted** (invalid BCTC in DB, fallback perpetuates) | Low | High | Add bctcValidator.isValid() check before using cache; re-validate quarterly |
| **Exponential backoff + timeout = slow agent cycles** | Low | Low | Total 180s budget acceptable for daily/2h cycles; no impact on 15min cycles (news) |
| **Infinite loop** (fallback tries VPS again, breaker state toggles) | Very Low | Critical | Fallback routers never call primary; fallback decision is one-way state transition |
| **Stale fallback price reaches MARKET alert channel** | Medium | High | AC-7 metadata requirement + signalValidator checks source_fallback flag; QA AC-12 partial failure test |

---

## Security Review

- **SQL parameterized**: N/A (no new SQL, only service + config logic)
- **File paths validated**: N/A (no new file I/O)
- **External HTTP rate-limited**: Yes. resilientFetcher calls `rateLimiter.canCall()` before each retry attempt.
- **Secrets via Bun.env**: Yes. Config secrets (VPS IP, circuit breaker thresholds) remain in env.
- **Circular imports**: Domain resilientFetcher has zero infra imports. Verified via `bun tsc --noEmit`.
- **No hardcoded stats**: Config thresholds live in mcp.config.json (SSOT); routers read at runtime.

---

## Acceptance Criteria Map

| AC # | Test File | Assertions | Status |
|------|-----------|-----------|--------|
| AC-1 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-2 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-3 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-4 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-5 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-6 | 232-cowork-resilience.test.ts | 3 | RED (failing) |
| AC-7 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-8 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| AC-9 | 232-cowork-resilience.test.ts | 1 | RED (failing) |
| AC-10 | 232-cowork-resilience.test.ts | 1 | RED (failing) |
| AC-11 | 232-cowork-resilience.test.ts | 1 | RED (failing) |
| AC-12 | 232-cowork-resilience.test.ts | 2 | RED (failing) |
| **TOTAL** | | **22 assertions** | |

---

## Notes for Developer

### resilientFetcher Logic

1. **Exponential backoff**: 1s, 2s, 4s, 8s, 8s (capped at maxBackoffMs)
   - Formula: `min(2^attemptN * initialBackoffMs, maxBackoffMs)`
   - Each backoff is *after* the failed attempt, before next retry

2. **Timeout per attempt**: 30s default. If attempt takes >30s, treat as timeout, move to next backoff.

3. **Total operation timeout**: 180s (15 min). If elapsed > 180s after any backoff, skip to fallbacks immediately.

4. **Rate limiter integration**: Before each retry, call `rateLimiter.canCall(host)`. If rate-limited, add wait time to backoff.

5. **Circuit breaker**: Read-only check (for logging). Does NOT skip retries if breaker="open". Decision to use fallback comes from staleness + breaker state passed to routers.

6. **Error log**: Accumulate all errors (attempt #, source name, error message, duration). Return in result.

### Router Logic

Each router (newsSourceRouter, priceSourceRouter, bctcSourceRouter) produces a route object that enumerates:
- `primary`: VPS endpoint + timeout
- `fallbacks[]`: cache, domestic RSS / Yahoo / Công Báo (conditional on config + health)
- `shouldUseFallback`: boolean (triggers agent Step 0c decision tree)
- `lastVpsHealthCheck`: read-only circuit breaker state for logging

Routers DO NOT call fetchers; they only decide which sources to try. The agent (or resilientFetcher caller) executes the actual fetch.

### Agent Step 0c Integration

Insert Step 0c block after existing Step 0b error handling. Step 0c runs ONCE per cycle, populates `serviceHealth` context that all fetch steps reference.

Example in 01-news-scout.md:

```
### Step 0: Bootstrap
…(existing 0a, 0b)…

### Step 0c: VPS Service Health Check
[pseudo-code block above]

### Step 1: Fetch and Analyze
(unchanged, but now consults serviceHealth["news"].useFallback)
```

### Config Defaults

All new config keys are opt-in, defaults conservative (fallbacks disabled):

```json
"fallbacks": {
  "enableDomesticNewsFallback": false,    // disabled by default (bot-risk)
  "enableCongbaoFallback": false,         // disabled by default (parsing complexity)
  "congbaoMinVpsOpenMinutes": 120,        // only if VPS open >2h
  "thresholds": { … }                     // default staleness windows
}
```

Users can enable by updating mcp.config.json or environment override.

---

## Reference

- Blockers resolved by PO: B1–B5 in REQ-232 Executive Summary
- Circuit breaker: `src/infrastructure/circuitBreakerRegistry.ts` (no changes needed)
- Rate limiter: `src/domain/services/rateLimiter.ts` (already checks per-host intervals)
- Fail-loud protocol: `.claude/knowledge/fail-loud-protocol.md`
- Agent roster: `.claude/knowledge/agent-roster.md`
- DDD layers: `CLAUDE.md#Architecture`

