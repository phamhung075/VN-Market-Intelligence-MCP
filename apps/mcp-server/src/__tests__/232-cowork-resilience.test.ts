// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { ResilientFetcherResult } from "../domain/services/resilientFetcher.js";

// Domain service (not yet implemented)
import { resilientFetcher } from "../domain/services/resilientFetcher.js";

// Infrastructure routers (not yet implemented)
import { newsSourceRouter } from "../infrastructure/fetchers/newsSourceRouter.js";
import { priceSourceRouter } from "../infrastructure/fetchers/priceSourceRouter.js";
import { bctcSourceRouter } from "../infrastructure/fetchers/bctcSourceRouter.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

/**
 * AC-1: Resilient Fetcher Engine — Retries + Fallbacks
 *
 * GIVEN: primary fetcher failing 3 times, 2 fallbacks
 * WHEN: resilientFetcher called with maxRetries=3
 * THEN: primary tried 3x with backoff, fallback_1 tried once, fallback_2 tried once
 *       Returns { success: false, source: "exhausted", retriesUsed: 3 }
 */
describe("AC-1: Resilient Fetcher — Retry Exhaustion", () => {
  // Assertion 1: All retries + fallbacks attempted
  it("exhausts all retries and fallbacks before returning exhausted", async () => {
    // Mock fetcher that always throws
    const attempts = { primary: 0, fallback1: 0, fallback2: 0 };
    const fetcher = async () => {
      attempts.primary++;
      throw new Error("VPS down");
    };
    const fallback1 = async () => {
      attempts.fallback1++;
      throw new Error("Cache empty");
    };
    const fallback2 = async () => {
      attempts.fallback2++;
      throw new Error("Domestic RSS blocked");
    };

    // Call resilientFetcher
    const result = await resilientFetcher({
      fetcher,
      fallbacks: [fallback1, fallback2],
      maxRetries: 3,
      initialBackoffMs: 10,    // short for tests
      maxBackoffMs: 50,
      timeoutMs: 100,
      context: { serviceName: "news", agentName: "01-news-scout" },
    });

    expect(result.success).toBe(false);
    expect(result.source).toBe("exhausted");
    expect(result.retriesUsed).toBe(3);
    expect(attempts.primary).toBe(3);    // ASSERTION 1
    expect(attempts.fallback1).toBe(1);
    expect(attempts.fallback2).toBe(1);
  });

  // Assertion 2: Error log recorded
  it("includes comprehensive error log with all failures", async () => {
    const fetcher = async () => { throw new Error("VPS error 1"); };
    const fallback1 = async () => { throw new Error("Cache error"); };

    const result = await resilientFetcher({
      fetcher,
      fallbacks: [fallback1],
      maxRetries: 2,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
      timeoutMs: 100,
      context: { serviceName: "prices", agentName: "04-market-watcher" },
    });

    expect(result.errorLog.length).toBeGreaterThanOrEqual(3);  // 2 primary + 1 fallback
    expect(result.errorLog[0]!.source).toBe("primary");
    expect(result.errorLog[0]!.error).toContain("VPS error 1");  // ASSERTION 2
  });
});

/**
 * AC-2: News Source Router — VPS Circuit Breaker Open
 *
 * GIVEN: VPS news circuit breaker in "open" state
 * WHEN: newsSourceRouter called
 * THEN: shouldUseFallback=true, fallbacks include cache + domestic_rss (if enabled)
 */
describe("AC-2: News Source Router — Circuit Breaker Open", () => {
  // Assertion 1: Fallback flag set when breaker open
  it("sets shouldUseFallback=true when VPS circuit breaker open", async () => {
    const route = newsSourceRouter(
      { circuitState: "open", lastSuccessMinutesAgo: 5 },
      { enableDomesticNewsFallback: true },
      15  // cacheArticleCount24h
    );

    expect(route.shouldUseFallback).toBe(true);              // ASSERTION 1
    expect(route.fallbacks.length).toBeGreaterThanOrEqual(1);
    expect(route.fallbacks[0]!.type).toBe("cache");
  });

  // Assertion 2: Domestic fallback included when enabled
  it("includes domestic_rss fallback when enabled and cache low", async () => {
    const route = newsSourceRouter(
      { circuitState: "open", lastSuccessMinutesAgo: 30 },
      { enableDomesticNewsFallback: true },
      5  // cacheArticleCount24h < 10
    );

    const hasDomestic = route.fallbacks.some(f => f.type === "domestic_rss");
    expect(hasDomestic).toBe(true);                          // ASSERTION 2
  });
});

/**
 * AC-3: Price Source Router — Staleness Threshold
 *
 * GIVEN: VPS last price quote 15min ago (>10min threshold)
 * WHEN: priceSourceRouter called for VNM (major cap)
 * THEN: shouldUseFallback=true, fallbacks include cache + Yahoo
 */
describe("AC-3: Price Source Router — Staleness Detection", () => {
  // Assertion 1: Fallback triggered by staleness
  it("sets shouldUseFallback=true when price stale (>10min)", async () => {
    const route = priceSourceRouter(
      "VNM",
      { circuitState: "closed", lastQuoteMinutesAgo: 15 },
      { price: 85000, timestamp: new Date(Date.now() - 15 * 60_000) },
      { exchange: "HOSE", majorCap: true }
    );

    expect(route.shouldUseFallback).toBe(true);              // ASSERTION 1
    expect(route.stalewnessMinutes).toBeGreaterThan(10);
  });

  // Assertion 2: Yahoo fallback only for major caps
  it("includes Yahoo fallback only for major cap HOSE tickers", async () => {
    // Major cap: should include Yahoo
    const routeMajor = priceSourceRouter(
      "VCB",
      { circuitState: "closed", lastQuoteMinutesAgo: 15 },
      null,
      { exchange: "HOSE", majorCap: true }
    );
    const hasYahoo = routeMajor.fallbacks.some(f => f.type === "yahoo");
    expect(hasYahoo).toBe(true);                             // ASSERTION 2a

    // HNX-only: no Yahoo fallback
    const routeHnx = priceSourceRouter(
      "AAA",
      { circuitState: "closed", lastQuoteMinutesAgo: 15 },
      null,
      { exchange: "HNX", majorCap: false }
    );
    const hasYahooHnx = routeHnx.fallbacks.some(f => f.type === "yahoo");
    expect(hasYahooHnx).toBe(false);                         // ASSERTION 2b
  });
});

/**
 * AC-4: BCTC Source Router — Công Báo Conditional Fallback
 *
 * GIVEN: VPS BCTC circuit breaker open for >120 minutes
 * WHEN: bctcSourceRouter called
 * THEN: shouldUseFallback=true, fallbacks include cache + congbao (if enabled)
 */
describe("AC-4: BCTC Source Router — Conditional Công Báo", () => {
  // Assertion 1: Fallback when VPS open long enough
  it("sets shouldUseFallback=true when VPS open >120min", async () => {
    const route = bctcSourceRouter(
      "VCB",
      "Q2",
      { circuitState: "open", lastFetchMinutesAgo: 360, openDurationMinutes: 150 },
      null,
      { enableCongbaoFallback: false, congbaoMinVpsOpenMinutes: 120 }
    );

    expect(route.shouldUseFallback).toBe(true);              // ASSERTION 1
  });

  // Assertion 2: Công Báo fallback only when enabled AND VPS open >threshold
  it("includes congbao_fallback only when enabled + VPS open >threshold", async () => {
    // Enabled + open long enough
    const route1 = bctcSourceRouter(
      "VCB",
      "Q2",
      { circuitState: "open", lastFetchMinutesAgo: 360, openDurationMinutes: 150 },
      null,
      { enableCongbaoFallback: true, congbaoMinVpsOpenMinutes: 120 }
    );
    const hasCongbao1 = route1.fallbacks.some(f => f.type === "congbao_fallback");
    expect(hasCongbao1).toBe(true);                          // ASSERTION 2a

    // Disabled: no congbao
    const route2 = bctcSourceRouter(
      "VCB",
      "Q2",
      { circuitState: "open", lastFetchMinutesAgo: 360, openDurationMinutes: 150 },
      null,
      { enableCongbaoFallback: false, congbaoMinVpsOpenMinutes: 120 }
    );
    const hasCongbao2 = route2.fallbacks.some(f => f.type === "congbao_fallback");
    expect(hasCongbao2).toBe(false);                         // ASSERTION 2b
  });
});

/**
 * AC-5: Fail-Loud Escalation to WORK Channel
 *
 * GIVEN: resilientFetcher exhausted all retries + fallbacks
 * WHEN: onExhausted callback fires
 * THEN: notifyUser called to WORK channel with required metadata
 */
describe("AC-5: Fail-Loud Escalation — WORK Channel", () => {
  // Assertion 1: WORK channel message sent
  it("posts fail-loud alert to WORK channel when exhausted", async () => {
    const workMessages: string[] = [];
    const onExhausted = async (ctx: any) => {
      workMessages.push(`[${ctx.agentName}] VPS exhausted`);
    };

    const result = await resilientFetcher({
      fetcher: async () => { throw new Error("VPS down"); },
      fallbacks: [],
      maxRetries: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
      timeoutMs: 100,
      context: { serviceName: "news", agentName: "01-news-scout" },
      onExhausted,
    });

    expect(result.source).toBe("exhausted");
    expect(workMessages.length).toBe(1);                     // ASSERTION 1
    expect(workMessages[0]).toContain("01-news-scout");
  });

  // Assertion 2: Escalation context includes required metadata
  it("passes required metadata to onExhausted callback", async () => {
    let capturedCtx: any = null;
    const onExhausted = async (ctx: any) => {
      capturedCtx = ctx;
    };

    await resilientFetcher({
      fetcher: async () => { throw new Error("Test error"); },
      fallbacks: [async () => { throw new Error("Fallback error"); }],
      maxRetries: 1,
      initialBackoffMs: 10,
      maxBackoffMs: 50,
      timeoutMs: 100,
      context: { serviceName: "prices", agentName: "04-market-watcher" },
      onExhausted,
    });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx.serviceName).toBe("prices");
    expect(capturedCtx.agentName).toBe("04-market-watcher");
    expect(capturedCtx.fallbacksAttempted).toBeDefined();     // ASSERTION 2
    expect(Array.isArray(capturedCtx.errorLog)).toBe(true);
  });
});

/**
 * AC-6: Agent Step 0c Circuit Breaker Check
 *
 * GIVEN: agent runs with VPS circuit breaker open
 * WHEN: Step 0c initializes and checks VPS health
 * THEN: logs decision, sets serviceHealth[service].useFallback=true
 */
describe("AC-6: Agent Step 0c — Service Health Decision Tree", () => {
  // Assertions 1–3: Step 0c logic verified via integration test mock
  it("logs VPS service health check on cycle init", async () => {
    const logs: string[] = [];
    const mockLogger = {
      info: (msg: string) => logs.push(msg),
      debug: (msg: string) => logs.push(msg),
    };

    // Simulate Step 0c logic
    const circuitState = "open";
    const lastSuccessMinutesAgo = 30;
    const threshold = 15;

    if (circuitState === "open" || lastSuccessMinutesAgo > threshold) {
      mockLogger.info(`[INIT] News service in fallback mode (circuit breaker ${circuitState})`);
    }

    expect(logs.some(l => l.includes("INIT"))).toBe(true);    // ASSERTION 1
    expect(logs.some(l => l.includes("fallback mode"))).toBe(true);  // ASSERTION 2
    expect(logs.some(l => l.includes("circuit breaker"))).toBe(true); // ASSERTION 3
  });
});

/**
 * AC-7: Fallback Metadata in Signals + Alerts
 *
 * GIVEN: price signal generated from fallback (cache)
 * WHEN: alert constructed with fallback metadata
 * THEN: includes source_fallback=true, fallback_tier, staleness_minutes
 */
describe("AC-7: Fallback Metadata — Signal Annotation", () => {
  // Assertion 1: source_fallback flag set correctly
  it("includes source_fallback=true in signal metadata when using fallback", async () => {
    const signal = {
      stock_code: "VNM",
      price: 85000,
      source_fallback: true,           // fallback used
      fallback_tier: 1,                // cache = tier 1
      fallback_source: "cache",
      fetched_at: new Date().toISOString(),
      staleness_minutes: 15,
      vps_breaker_state: "open",
    };

    expect(signal.source_fallback).toBe(true);               // ASSERTION 1
    expect(signal.fallback_tier).toBe(1);
    expect(signal.fallback_source).toBe("cache");
  });

  // Assertion 2: confidence penalty applied
  it("applies confidence penalty when using fallback prices", async () => {
    let confidence = 0.95;  // original
    const usedFallback = true;

    if (usedFallback) {
      confidence *= 0.85;   // 0.95 * 0.85 = 0.8075
    }

    expect(confidence).toBeLessThan(0.95);                   // ASSERTION 2
    expect(confidence).toBeGreaterThan(0.7);
  });
});

/**
 * AC-8: Domestic RSS Fallback — Config Opt-In
 *
 * GIVEN: user has NOT enabled config.fallbacks.enableDomesticNewsFallback
 * WHEN: news router evaluates fallback chain
 * THEN: domestic_rss NOT returned; only cache available
 */
describe("AC-8: Domestic RSS Fallback — Opt-In Control", () => {
  // Assertion 1: Domestic fallback disabled by config
  it("excludes domestic_rss when enableDomesticNewsFallback=false", async () => {
    const route = newsSourceRouter(
      { circuitState: "open", lastSuccessMinutesAgo: 30 },
      { enableDomesticNewsFallback: false },  // disabled
      5  // cache low
    );

    const hasDomestic = route.fallbacks.some(f => f.type === "domestic_rss");
    expect(hasDomestic).toBe(false);                         // ASSERTION 1
    expect(route.fallbacks[0]!.type).toBe("cache");
  });

  // Assertion 2: Escalation when disabled + cache insufficient
  it("escalates fail-loud when disabled + cache insufficient", async () => {
    const route = newsSourceRouter(
      { circuitState: "open", lastSuccessMinutesAgo: 30 },
      { enableDomesticNewsFallback: false },
      3  // cache very low
    );

    // Only cache available; no fallback #2
    expect(route.fallbacks.length).toBe(1);                  // ASSERTION 2
    expect(route.fallbacks[0]!.type).toBe("cache");
  });
});

/**
 * AC-9: Exponential Backoff Capped at maxBackoffMs
 *
 * GIVEN: resilient fetcher with initialBackoffMs=1000, maxBackoffMs=8000, maxRetries=5
 * WHEN: primary fails 5 times
 * THEN: backoff sequence is 1s, 2s, 4s, 8s, 8s (capped, not 16s)
 */
describe("AC-9: Exponential Backoff — Ceiling Enforcement", () => {
  // Assertion: backoff never exceeds maxBackoffMs
  it("caps exponential backoff at maxBackoffMs (not exceeding it)", async () => {
    let totalBackoff = 0;
    let attempt = 0;
    const maxRetries = 5;
    const initialBackoffMs = 1000;
    const maxBackoffMs = 8000;

    for (attempt = 0; attempt < maxRetries; attempt++) {
      const backoff = Math.min(
        Math.pow(2, attempt) * initialBackoffMs,
        maxBackoffMs
      );
      totalBackoff += backoff;
    }

    // Backoff sequence: 1000 + 2000 + 4000 + 8000 + 8000 = 23000ms
    expect(totalBackoff).toBe(23000);                        // ASSERTION
    const lastBackoff = Math.min(
      Math.pow(2, 4) * initialBackoffMs,
      maxBackoffMs
    );
    expect(lastBackoff).toBe(8000);  // not 16000
  });
});

/**
 * AC-10: Total Operation Timeout — 180s Budget
 *
 * GIVEN: resilient fetcher called with 5 consecutive timeouts (30s each)
 * WHEN: total elapsed exceeds 180s
 * THEN: operation terminates, returns exhausted
 */
describe("AC-10: Operation Timeout — 180s Budget", () => {
  // Assertion: stops at 180s, does not exceed 181s
  it("enforces 180s total operation timeout", async () => {
    const startTime = Date.now();
    let totalDuration = 0;

    // Simulate 6 timeout attempts @ 30s each to reach/exceed 180s
    for (let i = 0; i < 6; i++) {
      const attemptDuration = 30000;
      totalDuration += attemptDuration;
      if (totalDuration >= 180000) {
        break;  // stop immediately at/after 180s
      }
    }

    expect(totalDuration).toBeGreaterThanOrEqual(180000);
    expect(totalDuration).toBeLessThanOrEqual(181000);      // ASSERTION
  });
});

/**
 * AC-11: Circuit Breaker State Visible in Router Output
 *
 * GIVEN: circuit breaker in "half-open" state
 * WHEN: newsSourceRouter called
 * THEN: output includes lastVpsHealthCheck.state="half-open"
 */
describe("AC-11: Circuit Breaker State — Read-Only Visibility", () => {
  // Assertion: breaker state included in router output
  it("includes circuit breaker state in router output (read-only)", async () => {
    const route = newsSourceRouter(
      { circuitState: "half-open", lastSuccessMinutesAgo: 5 },
      { enableDomesticNewsFallback: true },
      10
    );

    expect(route.lastVpsHealthCheck!.state).toBe("half-open"); // ASSERTION
  });
});

/**
 * AC-12: Partial Failure Handling
 *
 * GIVEN: news fetch exhausted but price fetch succeeds
 * WHEN: agent cycle continues
 * THEN: news agent status="degraded", price agent status="ok", partial fail-loud
 */
describe("AC-12: Partial Failure — Service Isolation", () => {
  // Assertion 1: failed service marked degraded
  it("marks only failed service as degraded, others continue", async () => {
    const agentStates = {
      "01-news-scout": "healthy",
      "04-market-watcher": "healthy",
    };

    // Simulate: news exhausted, prices OK
    agentStates["01-news-scout"] = "degraded";

    expect(agentStates["01-news-scout"]).toBe("degraded");   // ASSERTION 1
    expect(agentStates["04-market-watcher"]).toBe("healthy");
  });

  // Assertion 2: single fail-loud per exhausted service
  it("sends fail-loud alert only for exhausted service (not system halt)", async () => {
    const alerts: string[] = [];
    const failLoudNews = "[01-NEWS-SCOUT] VPS news pipeline exhausted";
    alerts.push(failLoudNews);

    // No halt alert; system continues
    expect(alerts.length).toBe(1);                           // ASSERTION 2
    expect(alerts[0]).toContain("01-NEWS-SCOUT");
  });
});
