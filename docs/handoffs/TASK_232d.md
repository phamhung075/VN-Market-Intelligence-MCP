# TASK-232d: Agent Step 0c Integration + Config Loading + Integration Testing

**Status**: GREEN (agent .md modifications, config validation, integration test scaffolding)

**Files to modify**:
1. `.claude/agents/01-news-scout.md` (add Step 0c)
2. `.claude/agents/02-financial-analyst.md` (add Step 0c)
3. `.claude/agents/04-market-watcher.md` (add Step 0c)
4. `mcp.config.json` (fallbacks block already added in Task 232c; verify loading)

**Dependency**: TASK_232b + TASK_232c (resilientFetcher + routers + config block)

**Hours**: 4h

---

## Part 1: Agent .md Modification Pattern

### Location: `.claude/agents/01-news-scout.md`

**Current structure**:
```
### Step 0: Bootstrap
  0a. Read watchlist tickers from DB
  0b. Load circuit breaker states ... [existing error handling]

### Step 2: Fetch and Analyze
  ...
```

**New structure** (add 0c between 0b and Step 1):

```markdown
### Step 0: Bootstrap
  0a. Read watchlist tickers from DB
  0b. Handle Bootstrap Errors [existing block — unchanged]

### Step 0c: VPS Service Health Check & Fallback Decision Tree

**Purpose**: Detect when VPS services are unavailable or stale; set fallback mode flags for all fetch operations.

**Initialization**: Run once at cycle start.

```
FOR EACH service IN ["news", "prices", "bctc", "sbv_rates", "foreign_flow"]:
  circuitState = breakers.<service>.state
    // queried from circuitBreakerRegistry
    // states: "closed" | "open" | "half-open"

  lastSuccessMinutes = getServiceLastSuccess(service)
    // query from circuitBreaker last successful timestamp

  threshold = config.fallbacks.thresholds[service]
    // from mcp.config.json

  IF circuitState == "open":
    LOG("[INIT] {service} circuit breaker OPEN; fallback mode engaged")
    serviceHealth[service] = {
      useFallback: true,
      reason: "breaker_open",
      breakerState: circuitState
    }
  ELSE IF lastSuccessMinutes > threshold:
    LOG("[INIT] {service} stale ({lastSuccessMinutes}min > {threshold}min); fallback mode engaged")
    serviceHealth[service] = {
      useFallback: true,
      reason: "stale",
      staleMins: lastSuccessMinutes,
      breakerState: circuitState
    }
  ELSE:
    LOG("[INIT] {service} healthy; using primary")
    serviceHealth[service] = {
      useFallback: false,
      breakerState: circuitState
    }

STORE serviceHealth dict in Step context for use in Steps 1–N
```

**Expected log output**:
```
[INIT] Checking VPS service health...
[INIT] News service healthy; using primary
[INIT] Price service in fallback mode (circuit breaker OPEN)
[INIT] BCTC service stale (450min > 360min); fallback mode engaged
...
```

**Critical**: This block MUST run for ALL 7 Cowork agents (01, 02, 04 only per Task 232d scope).

### Step 1: Fetch and Analyze (modified)

**Pseudocode**: Add fallback decision logic before primary fetch.

```
### Step 1: Fetch News (modified for fallback integration)

IF serviceHealth["news"].useFallback:
  LOG("[FETCH] News in fallback mode; using router...")
  newsRoute = newsSourceRouter(
    {
      circuitState: serviceHealth["news"].breakerState,
      lastSuccessMinutesAgo: getMinutesSinceLastNewsSuccess()
    },
    config.fallbacks,
    getCacheArticleCount24h()
  )

  // Construct fetcher functions from route
  primaryFetcher = () => fetchVpsNews()
  fallbackFetchers = [
    ...(newsRoute.fallbacks.find(f => f.type == "cache") ? [() => fetchCachedNews()] : []),
    ...(newsRoute.fallbacks.find(f => f.type == "domestic_rss") ? [() => fetchDomesticRss()] : [])
  ]

  // Call resilientFetcher with fallback chain
  newsResult = await resilientFetcher({
    fetcher: primaryFetcher,
    fallbacks: fallbackFetchers,
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 8000,
    timeoutMs: 30000,
    context: { serviceName: "news", agentName: "01-news-scout" },
    onExhausted: async (ctx) => {
      // Escalation callback: notify dev team
      await notifyUser({
        channel: "work",
        severity: "alert",
        message: `[01-NEWS-SCOUT] VPS news pipeline exhausted. All retries + cache + fallback exhausted. Will resume when VPS recovers.`,
        context: {
          serviceName: ctx.serviceName,
          vpsBreakerState: ctx.breakerState,
          lastSuccessMinutesAgo: ctx.minutesSinceLastSuccess,
          fallbacksAttempted: ctx.fallbacksAttempted,
          errorLog: ctx.errorLog.slice(-3)
        }
      });
      // Update agent status
      db.run(
        "UPDATE agent_status SET last_failure_at = ?, failure_reason = ?, status = ? WHERE agent_name = ?",
        [new Date().toISOString(), "vps_exhausted_all_fallbacks", "degraded", "01-news-scout"]
      );
    }
  })

  news = newsResult.success ? newsResult.data : []
  newsSource = newsResult.source  // "primary" | "fallback_1" | "fallback_2" | "exhausted"
ELSE:
  LOG("[FETCH] News primary route; no fallback needed")
  // Single resilientFetcher call with no fallbacks (retries only)
  newsResult = await resilientFetcher({
    fetcher: () => fetchVpsNews(),
    fallbacks: [],
    ...
  })
  news = newsResult.success ? newsResult.data : []
  newsSource = newsResult.source

// Annotate signals with fallback metadata
FOR EACH item IN news:
  item.source_fallback = (newsSource != "primary")
  item.fetched_at = new Date().toISOString()
  IF newsSource.startsWith("fallback"):
    item.fallback_tier = newsSource.endsWith("_1") ? 1 : 2
    item.fallback_source = newsSource == "fallback_1" ? "cache" : "domestic_rss"
    // Apply confidence penalty
    item.confidence *= 0.85
  item.vps_breaker_state = serviceHealth["news"].breakerState
```

**Similarly for prices and BCTC**: Apply same pattern in subsequent fetch steps.

---

## Part 2: Config Loading & Validation

### File: Main server bootstrap (e.g., src/index.ts or src/bootstrap.ts)

**Ensure config is loaded at startup**:

```typescript
import config from "../mcp.config.json" assert { type: "json" };

// Validate fallbacks config block exists
if (!config.fallbacks) {
  throw new Error("config.fallbacks block missing from mcp.config.json");
}

// Validate required fields
const requiredFallbacksFields = [
  "enableDomesticNewsFallback",
  "enableCongbaoFallback",
  "congbaoMinVpsOpenMinutes",
  "thresholds"
];
for (const field of requiredFallbacksFields) {
  if (!(field in config.fallbacks)) {
    throw new Error(`config.fallbacks.${field} missing from mcp.config.json`);
  }
}

// Validate thresholds
const requiredThresholds = ["news", "prices", "bctc", "sbv_rates", "foreign_flow"];
for (const svc of requiredThresholds) {
  if (!config.fallbacks.thresholds[svc]) {
    throw new Error(`config.fallbacks.thresholds.${svc} missing`);
  }
  if (typeof config.fallbacks.thresholds[svc] !== "number") {
    throw new Error(`config.fallbacks.thresholds.${svc} must be a number`);
  }
}

logger.info("[STARTUP] Fallbacks config validated", {
  enableDomesticNewsFallback: config.fallbacks.enableDomesticNewsFallback,
  enableCongbaoFallback: config.fallbacks.enableCongbaoFallback,
  congbaoMinVpsOpenMinutes: config.fallbacks.congbaoMinVpsOpenMinutes,
});

// Export for use in routers + agents
export { config };
```

### Agent-level config access

In agent .md (Cowork agents), reference config:

```typescript
// At top of agent Step 0c or Step 1 function
const { config } = await import("./config.js");  // or via context injection

newsRoute = newsSourceRouter(
  { circuitState, lastSuccessMinutesAgo },
  config.fallbacks,  // pass entire fallbacks config block
  cacheCount
);
```

---

## Part 3: Integration Test Scaffolding

### File: Add integration test in TASK_232a test suite

**Purpose**: Verify end-to-end: Step 0c → router → resilientFetcher → escalation

**Test pattern** (add to src/__tests__/232-cowork-resilience.test.ts):

```typescript
/**
 * Integration test: Agent Step 0c → Router → resilientFetcher → Escalation
 *
 * Simulates full news fetch cycle with VPS failure + fallback + escalation.
 */
describe("Integration: Agent Step 0c → Resilient Fetch → Escalation", () => {
  it("step-0c-detects-breaker-open-news-routes-to-fallback-escalates-on-exhaustion", async () => {
    // 1. Setup: VPS breaker open
    const circuitState = "open";
    const lastSuccessMinutes = 5;
    const config = {
      fallbacks: {
        enableDomesticNewsFallback: false,
        enableCongbaoFallback: false,
        congbaoMinVpsOpenMinutes: 120,
        thresholds: { news: 15, prices: 10, bctc: 360, sbv_rates: 120, foreign_flow: 60 }
      }
    };

    // 2. Step 0c: service health check
    const serviceHealth: Record<string, any> = {};
    const threshold = config.fallbacks.thresholds["news"];

    if (circuitState === "open" || lastSuccessMinutes > threshold) {
      serviceHealth["news"] = { useFallback: true, breakerState: circuitState };
    }

    expect(serviceHealth["news"].useFallback).toBe(true);

    // 3. Router: construct route
    const route = newsSourceRouter(
      { circuitState, lastSuccessMinutesAgo: lastSuccessMinutes },
      config.fallbacks,
      5  // cache count
    );

    expect(route.shouldUseFallback).toBe(true);
    expect(route.fallbacks.length).toBeGreaterThan(0);

    // 4. resilientFetcher: all fail
    let escalationFired = false;
    const result = await resilientFetcher({
      fetcher: async () => { throw new Error("VPS down"); },
      fallbacks: [
        async () => { throw new Error("Cache empty"); },
        // no domestic RSS (disabled in config)
      ],
      maxRetries: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
      timeoutMs: 100,
      context: { serviceName: "news", agentName: "01-news-scout" },
      onExhausted: async (ctx) => {
        escalationFired = true;
        expect(ctx.agentName).toBe("01-news-scout");
        expect(ctx.fallbacksAttempted).toContain("fallback_1");
      }
    });

    // 5. Verify: exhaustion + escalation
    expect(result.success).toBe(false);
    expect(result.source).toBe("exhausted");
    expect(escalationFired).toBe(true);  // onExhausted was called
  });
});
```

---

## Part 4: Partial Failure Handling (AC-12)

### Design: Service Isolation

When ONE service (e.g., news) exhausts but another (e.g., prices) succeeds:

```typescript
// After all fetch operations in agent cycle:
const fetchResults = {
  news: { success: false, source: "exhausted", ... },
  prices: { success: true, source: "primary", ... },
};

// Determine agent status
const hasAnyExhausted = Object.values(fetchResults).some(r => r.source === "exhausted");
const hasAllExhausted = Object.values(fetchResults).every(r => r.source === "exhausted");

if (hasAllExhausted) {
  // All services failed: agent status = "degraded", HALT
  agentStatus = "degraded";
  LOG("[01-NEWS-SCOUT] All services exhausted; halting cycle");
} else if (hasAnyExhausted) {
  // Partial failure: agent status = "partial", CONTINUE with available data
  agentStatus = "partial";
  LOG("[01-NEWS-SCOUT] News exhausted; prices OK; continuing with partial signals");

  // Post single fail-loud alert for news only
  await notifyUser({
    channel: "work",
    severity: "alert",
    message: `[01-NEWS-SCOUT] News fetch exhausted; continuing with price signals only`,
  });
} else {
  // All services OK
  agentStatus = "ok";
}
```

---

## Part 5: Modified Agent .md Files (scope: 01, 02, 04 only)

### 01-news-scout.md

- **Add Step 0c** (service health check block) after Step 0b
- **Modify Step 1** (Fetch news) to call newsSourceRouter + resilientFetcher
- **Modify signal construction** (add source_fallback, fetched_at, staleness_minutes metadata)

### 02-financial-analyst.md

- **Add Step 0c** (service health check block) after Step 0b
- **Modify BCTC fetch step** to call bctcSourceRouter + resilientFetcher
- **Modify signal construction** (add source_fallback metadata + confidence penalty)

### 04-market-watcher.md

- **Add Step 0c** (service health check block) after Step 0b
- **Modify price fetch step** to call priceSourceRouter + resilientFetcher
- **Modify signal construction** (add source_fallback, fetched_at, staleness_minutes metadata)

---

## Part 6: Checklist for All Three Agent Files

For each agent (01, 02, 04):

- [ ] Step 0c block added after Step 0b
- [ ] Logs message: "[INIT] Checking VPS service health..."
- [ ] For each service: logs "healthy" or "fallback mode" decision
- [ ] serviceHealth dict populated
- [ ] Step 1/2/3 fetch operations check serviceHealth flags
- [ ] Router called with correct circuitState + config
- [ ] resilientFetcher called with primary + fallbacks
- [ ] onExhausted callback implemented (notifyUser + db.run)
- [ ] Signal metadata includes source_fallback, fetched_at, staleness_minutes
- [ ] Confidence penalty applied for fallback prices (0.95 * 0.85 = 0.8075)
- [ ] Partial failure handling: agent continues if SOME services available
- [ ] All imports added: { resilientFetcher, newsSourceRouter, etc. }

---

## Testing

### Test execution (after Tasks 232a–232c complete)

```bash
# Run full test suite
bun test src/__tests__/232-cowork-resilience.test.ts

# Expected: 22 assertions PASS
# - AC-1 (2): resilientFetcher retry logic
# - AC-2 (2): newsSourceRouter
# - AC-3 (2): priceSourceRouter
# - AC-4 (2): bctcSourceRouter
# - AC-5 (2): escalation callback
# - AC-6 (3): Step 0c decision tree
# - AC-7 (2): fallback metadata
# - AC-8 (2): domestic RSS opt-in
# - AC-9 (1): exponential backoff
# - AC-10 (1): 180s timeout
# - AC-11 (1): breaker state visibility
# - AC-12 (2): partial failure handling
```

### Manual testing (after agents modified)

1. **Local dev**: Start server, check logs for "[INIT] Checking VPS service health..."
2. **Simulate VPS failure**: Set circuit breaker to "open" (via test harness or mock)
3. **Trigger agent cycle**: Call agent and verify:
   - Step 0c logs fallback decision
   - Router returns cache + fallback chain
   - resilientFetcher attempts primary + fallbacks
   - onExhausted callback fires (WORK channel message + db update)
   - Agent status = "degraded"

---

## Notes for Developer

### Import Statements (add to each agent .md if applicable)

```typescript
// At top of agent execution file
import { resilientFetcher } from "../domain/services/resilientFetcher.js";
import { newsSourceRouter } from "../infrastructure/fetchers/newsSourceRouter.js";
import { priceSourceRouter } from "../infrastructure/fetchers/priceSourceRouter.js";
import { bctcSourceRouter } from "../infrastructure/fetchers/bctcSourceRouter.js";
import config from "../mcp.config.json" assert { type: "json" };
import { breakers } from "../infrastructure/circuitBreakerRegistry.js";
```

### Logging Pattern

Use existing logger (assumed available in agent context):

```typescript
logger.info("[INIT] Checking VPS service health...");
logger.debug("[INIT] News service in fallback mode", { reason: "breaker_open" });
logger.info("[FETCH] News in fallback mode; using router...");
```

### Confidence Penalty

Apply 0.85x multiplier when using fallback prices:

```typescript
// Before: confidence = 0.95 (high confidence in real-time VPS price)
// After fallback: confidence = 0.95 * 0.85 = 0.8075 (moderate confidence in cached price)

if (source_fallback) {
  signal.confidence *= 0.85;
}
```

---

## Next Task

→ **TASK_232e**: QA integration test + fail-loud escalation verification (2h)

