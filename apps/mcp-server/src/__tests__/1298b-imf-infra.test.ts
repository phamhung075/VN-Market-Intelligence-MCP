/**
 * Task 1298b — GREEN Phase: IMF Infra Tests
 *
 * AC-4: Application Fetcher Production-Safe
 *   - DB roundtrip (store + retrieve)
 *   - Circuit-open fallback does not throw
 *   - SQL injection: no string-interpolated SQL in imfDataFetcher.ts
 *
 * AC-5: Scheduler Job Registers and Runs
 *   - jobs.ts CRONS map contains imfIndicatorPoller on "0 * /6 * * *" schedule
 *   - cron-registry.json has imf_indicator_poller entry with id, schedule, timeoutMs, enabled
 *   - runImfIndicatorPollerJob() direct call returns success shape
 *   - runImfIndicatorPollerJob() failure scenario returns { success: false } without throwing
 *
 * NOTE: No live HTTP calls. fetchLatestImfIndicators tested via DB fallback path only.
 */

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

import type { ImfIndicator } from "../domain/models/imfIndicators.js";
import {
  storeImfIndicators,
  getLatestImfIndicators,
  fetchLatestImfIndicators,
  imfBreaker,
} from "../application/services/imfDataFetcher.js";
import { runImfIndicatorPollerJob } from "../scheduler/market-data/imfIndicatorPollerJob.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ── Mock fetch so tests do not make live HTTP calls (Task 1922h fix) ──────────
// The IMF API now returns 200 without Chrome UA, causing live-call tests to
// exceed the 5s Bun test timeout. Mock fetch to simulate circuit-breaker open
// so AC-4 / AC-5 tests exercise the DB fallback path, as was the original intent.
const originalFetch = globalThis.fetch;
// C5-CURE: capture stub reference before registering; used in afterAll restore.
const _realNodeFetch1298 = {}; // no-op — Bun uses globalThis.fetch, not node:fetch
mock.module("node:fetch", () => _realNodeFetch1298);
function mockFetchReject(): void {
  const stub = async (): Promise<never> => { throw new Error("fetch mocked — offline for test"); };
  globalThis.fetch = Object.assign(stub, { preconnect: () => {} }) as unknown as typeof fetch;
}
function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH_1298",
    name: "Test GDP 1298",
    value: 3.5,
    publishedAt: "2026-04-24T00:00:00Z",
    ageInDays: 1,
    previousValue: 3.2,
    yoyChange: 0.09,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
  // C5-CURE: restore node:fetch stub so downstream files don't inherit a stale entry.
  mock.module("node:fetch", () => _realNodeFetch1298);
});

// ── AC-4: Application Fetcher ─────────────────────────────────────────────────

describe("AC-4: imfDataFetcher production safety", () => {
  it("storeImfIndicators + getLatestImfIndicators roundtrip", async () => {
    const testIndicator = makeIndicator({ code: "TEST_NGDP_1298B" });
    await storeImfIndicators([testIndicator]);

    const retrieved = await getLatestImfIndicators();
    const found = retrieved.find((i) => i.code === "TEST_NGDP_1298B");

    expect(found).toBeDefined();
    expect(found!.value).toBe(3.5);
    expect(found!.confidence).toBe(0.95);
    expect(found!.source).toBe("imf_api");
  });

  it("upsert: second store of same code overwrites value", async () => {
    await storeImfIndicators([makeIndicator({ code: "TEST_UPSERT_1298B", value: 1.0, confidence: 0.8 })]);
    await storeImfIndicators([makeIndicator({ code: "TEST_UPSERT_1298B", value: 2.0, confidence: 0.9 })]);

    const retrieved = await getLatestImfIndicators();
    const found = retrieved.find((i) => i.code === "TEST_UPSERT_1298B");

    expect(found).toBeDefined();
    expect(found!.value).toBe(2.0);
    expect(found!.confidence).toBe(0.9);
  });

  it("getLatestImfIndicators returns valid ImfIndicator shape", async () => {
    await storeImfIndicators([makeIndicator({ code: "TEST_SHAPE_1298B" })]);
    const retrieved = await getLatestImfIndicators();

    for (const ind of retrieved) {
      expect(typeof ind.code).toBe("string");
      expect(typeof ind.name).toBe("string");
      expect(typeof ind.value).toBe("number");
      expect(typeof ind.confidence).toBe("number");
      expect(ind.confidence).toBeGreaterThanOrEqual(0);
      expect(ind.confidence).toBeLessThanOrEqual(1);
      expect(["imf_api", "imf_scrape"]).toContain(ind.source);
    }
  });

  it("confidence penalty factor 0.8 applies correctly on cached data", async () => {
    const base = makeIndicator({ code: "TEST_CB_1298B", confidence: 0.90 });
    await storeImfIndicators([base]);

    const penalized = await getLatestImfIndicators(0.8);
    const found = penalized.find((i) => i.code === "TEST_CB_1298B");

    expect(found).toBeDefined();
    expect(found!.confidence).toBeCloseTo(0.72, 2);
    expect(found!.confidence).toBeLessThan(0.90);
  });

  it("fetchLatestImfIndicators returns array and does not throw (circuit breaker fallback)", async () => {
    // Pre-populate DB so fallback has data if HTTP fails
    await storeImfIndicators([makeIndicator({ code: "TEST_FETCH_FALLBACK_1298B" })]);

    // Mock fetch to avoid live HTTP calls — test exercises the DB fallback path
    imfBreaker.reset();
    mockFetchReject();
    let threw = false;
    let result: ImfIndicator[] = [];
    try {
      result = await fetchLatestImfIndicators();
    } catch {
      threw = true;
    } finally {
      restoreFetch();
    }

    expect(threw).toBe(false);
    expect(Array.isArray(result)).toBe(true);
    // Shape check — from API or DB cache
    for (const ind of result) {
      expect(typeof ind.code).toBe("string");
      expect(typeof ind.value).toBe("number");
      expect(ind.confidence).toBeGreaterThanOrEqual(0);
      expect(ind.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("SQL injection check: no string-interpolated SQL in imfDataFetcher.ts", () => {
    const filePath = path.resolve(
      import.meta.dir, "../application/services/imfDataFetcher.ts"
    );
    const source = readFileSync(filePath, "utf-8");

    // Detect: .query(` ... ${variable}`) or .run(` ... ${variable}`) or .prepare(` ...`)
    const templateLiteralSql = /\.(?:query|run|prepare)\s*\(`[^`]*\$\{/;
    // Detect: .query("..." + variable)
    const concatSql = /\.(?:query|run|prepare)\s*\(\s*["'][^"']*["']\s*\+/;

    expect(templateLiteralSql.test(source)).toBe(false);
    expect(concatSql.test(source)).toBe(false);
  });
});

// ── AC-5: Cron Registration ───────────────────────────────────────────────────

describe("AC-5: imfIndicatorPoller cron registration", () => {
  it("cronConfig.ts CRONS map contains imfIndicatorPoller with 6h schedule", () => {
    const configPath = path.resolve(import.meta.dir, "../scheduler/cronConfig.ts");
    const configSource = readFileSync(configPath, "utf-8");
    const schedulerPath = path.resolve(import.meta.dir, "../scheduler/startScheduler.ts");
    const schedulerSource = readFileSync(schedulerPath, "utf-8");

    expect(configSource).toContain("imfIndicatorPoller");
    expect(configSource).toContain("0 */6 * * *");
    // Confirm the job is wired to runImfIndicatorPollerJob in startScheduler
    expect(schedulerSource).toContain("runImfIndicatorPollerJob");
  });

  it("cron-registry.json contains imf_indicator_poller entry with required fields", () => {
    const registryPath = path.resolve(import.meta.dir, "../../../../docs/data/cron-registry.json");
    const source = readFileSync(registryPath, "utf-8");
    const registry = JSON.parse(source) as { jobs: Array<Record<string, unknown>> };

    const entry = registry.jobs.find(
      (j) => j["id"] === "imf_indicator_poller" || j["name"] === "imfIndicatorPoller"
    );

    expect(entry).toBeDefined();
    // Required fields per handoff AC-7
    expect(entry!["id"] ?? entry!["name"]).toBeTruthy();
    expect(entry!["schedule"]).toContain("*/6");
    expect(entry!["timeoutMs"]).toBe(30000);
    expect(entry!["enabled"]).toBe(true);
  });

  it("runImfIndicatorPollerJob() returns success shape without throwing (DI mock)", async () => {
    // Use DI overrides to avoid live HTTP calls — tests the job wrapper contract
    let threw = false;
    let result: Awaited<ReturnType<typeof runImfIndicatorPollerJob>> | undefined;

    try {
      result = await runImfIndicatorPollerJob({
        fetchFn: async () => [makeIndicator()],
        storeFn: async () => {},
        classifyFn: () => ({
          sentiment: 0.1, confidence: 0.80,
          classification: "imf_bullish" as const,
          reasoning: "stub", sectorImpacts: [],
        }),
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeDefined();
    expect(typeof result!.success).toBe("boolean");
    expect(typeof result!.indicator_count).toBe("number");
  });

  it("runImfIndicatorPollerJob() success path: indicator_count >= 0 when success=true (DI mock)", async () => {
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => [makeIndicator({ value: 3.2 })],
      storeFn: async () => {},
      classifyFn: () => ({
        sentiment: 0.2, confidence: 0.85,
        classification: "imf_bullish" as const,
        reasoning: "stub", sectorImpacts: [],
      }),
    });
    expect(result.success).toBe(true);
    expect(result.indicator_count).toBeGreaterThanOrEqual(0);
    // sentiment field present on success
    expect(result.sentiment).toBeDefined();
  });

  it("runImfIndicatorPollerJob() failure path: returns { success: false, error: string, indicator_count: 0 } (DI mock)", async () => {
    // fetchFn returns [] → early-exit → success:false
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => [],
      storeFn: async () => {},
      classifyFn: () => ({
        sentiment: 0, confidence: 0.5,
        classification: "imf_neutral" as const,
        reasoning: "stub", sectorImpacts: [],
      }),
    });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error!.length).toBeGreaterThan(0);
    expect(result.indicator_count).toBe(0);
    // Must not have thrown
    expect(typeof result.success).toBe("boolean");
  });
});
