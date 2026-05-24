// @ts-nocheck — deprecated test file; relative imports no longer resolve from _deprecated/ location.
// Retained for rollback reference only. See _deprecated/fetchers/README.md.
import { describe, test, expect, beforeEach } from "bun:test";
import {
  fetchReuters,
  resetReutersErrorCounter,
  type ReutersDeps,
} from "../infrastructure/fetchers/reuters.js";
import {
  fetchTradingEconomicsStream,
  resetTeStreamErrorCounter,
  type TeStreamDeps,
} from "../infrastructure/fetchers/tradingEconomicsStream.js";

// Mock HTTP client that always returns empty RSS XML
const emptyRssClient = {
  get: async (_url: string) => `<?xml version="1.0"?><rss><channel></channel></rss>`,
};

// Mock HTTP client that returns one valid RSS item
const successRssClient = {
  get: async (_url: string) =>
    `<?xml version="1.0"?><rss><channel><item><title>Test</title><link>https://example.com</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`,
};

describe("1828c Reuters RSS consecutive-error observability", () => {
  beforeEach(() => resetReutersErrorCounter());

  test("AC-R-1: counter increments on each empty result, no alert before threshold", async () => {
    let alertCount = 0;
    const deps: ReutersDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 9; i++) {
      await fetchReuters(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(0);
  });

  test("AC-R-2: alert fires exactly once at 10 consecutive failures", async () => {
    let alertCount = 0;
    const deps: ReutersDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 10; i++) {
      await fetchReuters(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(1);
  });

  test("AC-R-3: alert does not fire again after threshold (calls 11-12)", async () => {
    let alertCount = 0;
    const deps: ReutersDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 12; i++) {
      await fetchReuters(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(1);
  });

  test("AC-R-4: counter resets on successful fetch; next 10 failures re-trigger alert", async () => {
    let alertCount = 0;
    const deps: ReutersDeps = { onAlert: async () => { alertCount++; } };
    // Trigger first alert
    for (let i = 0; i < 10; i++) await fetchReuters(emptyRssClient as any, deps);
    expect(alertCount).toBe(1);
    // Reset via success
    await fetchReuters(successRssClient as any, deps);
    // 10 more failures should trigger again
    for (let i = 0; i < 10; i++) await fetchReuters(emptyRssClient as any, deps);
    expect(alertCount).toBe(2);
  });

  test("AC-R-5: alert message contains 'reuters RSS' and '10 consecutive errors'", async () => {
    let lastMsg = "";
    const deps: ReutersDeps = { onAlert: async (msg) => { lastMsg = msg; } };
    for (let i = 0; i < 10; i++) await fetchReuters(emptyRssClient as any, deps);
    expect(lastMsg).toContain("reuters RSS");
    expect(lastMsg).toContain("10 consecutive errors");
  });

  test("AC-R-6: resetReutersErrorCounter restores clean state", async () => {
    let alertCount = 0;
    const deps: ReutersDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 10; i++) await fetchReuters(emptyRssClient as any, deps);
    resetReutersErrorCounter();
    for (let i = 0; i < 9; i++) await fetchReuters(emptyRssClient as any, deps);
    expect(alertCount).toBe(1); // only the first run triggered
  });
});

describe("1828c tradingEconomics RSS consecutive-error observability", () => {
  beforeEach(() => resetTeStreamErrorCounter());

  test("AC-TE-1: counter increments on each empty result, no alert before threshold", async () => {
    let alertCount = 0;
    const deps: TeStreamDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 9; i++) {
      await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(0);
  });

  test("AC-TE-2: alert fires exactly once at 10 consecutive failures", async () => {
    let alertCount = 0;
    const deps: TeStreamDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 10; i++) {
      await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(1);
  });

  test("AC-TE-3: alert does not fire again after threshold (calls 11-12)", async () => {
    let alertCount = 0;
    const deps: TeStreamDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 12; i++) {
      await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    }
    expect(alertCount).toBe(1);
  });

  test("AC-TE-4: counter resets on successful fetch; next 10 failures re-trigger alert", async () => {
    let alertCount = 0;
    const deps: TeStreamDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 10; i++) await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    expect(alertCount).toBe(1);
    await fetchTradingEconomicsStream(successRssClient as any, deps);
    for (let i = 0; i < 10; i++) await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    expect(alertCount).toBe(2);
  });

  test("AC-TE-5: alert message contains 'tradingEconomics' and 'CB not yet tripped'", async () => {
    let lastMsg = "";
    const deps: TeStreamDeps = { onAlert: async (msg) => { lastMsg = msg; } };
    for (let i = 0; i < 10; i++) await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    expect(lastMsg).toContain("tradingEconomics");
    expect(lastMsg).toContain("CB not yet tripped");
  });

  test("AC-TE-6: resetTeStreamErrorCounter restores clean state", async () => {
    let alertCount = 0;
    const deps: TeStreamDeps = { onAlert: async () => { alertCount++; } };
    for (let i = 0; i < 10; i++) await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    resetTeStreamErrorCounter();
    for (let i = 0; i < 9; i++) await fetchTradingEconomicsStream(emptyRssClient as any, deps);
    expect(alertCount).toBe(1); // only the first run triggered
  });
});
