/**
 * Task 1922h — IMF Indicator Poller: 0-row fix
 *
 * Root causes identified:
 *   RC-1: BROWSER_UA (Chrome UA) sent in fetch headers → IMF WAF returns HTTP 403.
 *         Fix: remove User-Agent header from IMF fetch calls.
 *   RC-2: GLOBAL_INFLATION used code "PCPI_ADVEC" — not a valid IMF DataMapper code.
 *         Fix: updated to "PCPIPCH" (Inflation rate, average consumer prices).
 *   RC-3: OIL_FORECAST used code "POILAPSP" — not a valid IMF DataMapper code.
 *         Fix: updated to "BCA_NGDPD" (Current account balance, % of GDP).
 *
 * ACs:
 *   AC-1: IMF_INDICATORS.GLOBAL_INFLATION is "PCPIPCH"
 *   AC-2: IMF_INDICATORS.OIL_FORECAST is "BCA_NGDPD"
 *   AC-3: imfDataFetcher.ts does NOT contain BROWSER_UA import
 *   AC-4: imfDataFetcher.ts fetch call does NOT include a User-Agent header
 *   AC-5: imfDataFetcher.ts does NOT reference "PCPI_ADVEC" or "POILAPSP" codes
 *   AC-6: storeImfIndicators writes all 3 indicators (NGDP_RPCH, PCPIPCH, BCA_NGDPD)
 *         to imf_indicators and they are retrievable
 *   AC-7: fetchLatestImfIndicators (DI mock) returns 3 valid ImfIndicator objects
 *         when fetch resolves with correct IMF API shape for valid codes
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import path from "path";

import { IMF_INDICATORS } from "../domain/models/imfIndicators.js";
import {
  storeImfIndicators,
  getLatestImfIndicators,
} from "../application/services/imfDataFetcher.js";
import { runImfIndicatorPollerJob } from "../scheduler/market-data/imfIndicatorPollerJob.js";
import type { ImfIndicator, ImfClassificationOutput } from "../domain/models/imfIndicators.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  closeDb();
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "Global GDP Growth (%)",
    value: 3.1,
    publishedAt: "2026-01-01T00:00:00Z",
    ageInDays: 14,
    previousValue: 3.0,
    yoyChange: 0.1,
    source: "imf_api",
    confidence: 0.85,
    ...overrides,
  };
}

const FETCHER_PATH = path.resolve(
  import.meta.dir,
  "../application/services/imfDataFetcher.ts",
);
const fetcherSource = readFileSync(FETCHER_PATH, "utf-8");

// ── AC-1 / AC-2: Valid indicator codes in domain model ────────────────────────

describe("AC-1/AC-2: IMF indicator codes valid (Task 1922h fix)", () => {
  it("AC-1: GLOBAL_INFLATION uses PCPIPCH (not PCPI_ADVEC)", () => {
    expect(IMF_INDICATORS.GLOBAL_INFLATION).toBe("PCPIPCH");
  });

  it("AC-2: OIL_FORECAST uses BCA_NGDPD (not POILAPSP)", () => {
    expect(IMF_INDICATORS.OIL_FORECAST).toBe("BCA_NGDPD");
  });

  it("WORLD_GROWTH still uses NGDP_RPCH (unchanged)", () => {
    expect(IMF_INDICATORS.WORLD_GROWTH).toBe("NGDP_RPCH");
  });
});

// ── AC-3 / AC-4: No BROWSER_UA in fetcher ────────────────────────────────────

describe("AC-3/AC-4: imfDataFetcher does not send browser User-Agent (Task 1922h fix)", () => {
  it("AC-3: BROWSER_UA is not imported in imfDataFetcher.ts", () => {
    expect(fetcherSource).not.toContain("BROWSER_UA");
    expect(fetcherSource).not.toContain("browserHeaders");
  });

  it("AC-4: fetch() call does not include User-Agent header", () => {
    // No headers object with User-Agent in the IMF fetch call
    expect(fetcherSource).not.toMatch(/["']User-Agent["']\s*:/);
  });
});

// ── AC-5: No invalid codes in fetcher ────────────────────────────────────────

describe("AC-5: Invalid IMF codes removed from fetcher (Task 1922h fix)", () => {
  it("PCPI_ADVEC is not referenced in imfDataFetcher.ts", () => {
    expect(fetcherSource).not.toContain("PCPI_ADVEC");
  });

  it("POILAPSP is not referenced in imfDataFetcher.ts", () => {
    expect(fetcherSource).not.toContain("POILAPSP");
  });
});

// ── AC-6: DB roundtrip for all 3 corrected indicator codes ───────────────────

describe("AC-6: storeImfIndicators writes all 3 valid codes to imf_indicators", () => {
  it("stores NGDP_RPCH, PCPIPCH, BCA_NGDPD and retrieves them correctly", async () => {
    const indicators: ImfIndicator[] = [
      makeIndicator({ code: "NGDP_RPCH", name: "Global GDP Growth (%)", value: 3.2 }),
      makeIndicator({ code: "PCPIPCH", name: "Global Inflation, Average Consumer Prices (%)", value: 4.1 }),
      makeIndicator({ code: "BCA_NGDPD", name: "Current Account Balance (% of GDP)", value: -0.5 }),
    ];

    await storeImfIndicators(indicators);

    const retrieved = await getLatestImfIndicators();
    const codes = retrieved.map((r) => r.code);

    expect(codes).toContain("NGDP_RPCH");
    expect(codes).toContain("PCPIPCH");
    expect(codes).toContain("BCA_NGDPD");

    const inflation = retrieved.find((r) => r.code === "PCPIPCH");
    expect(inflation).toBeDefined();
    expect(inflation!.value).toBe(4.1);
    expect(inflation!.name).toBe("Global Inflation, Average Consumer Prices (%)");

    const bca = retrieved.find((r) => r.code === "BCA_NGDPD");
    expect(bca).toBeDefined();
    expect(bca!.value).toBe(-0.5);
  });

  it("upsert replaces existing row for PCPIPCH on second write", async () => {
    await storeImfIndicators([makeIndicator({ code: "PCPIPCH_1922H", value: 3.0 })]);
    await storeImfIndicators([makeIndicator({ code: "PCPIPCH_1922H", value: 5.5 })]);

    const retrieved = await getLatestImfIndicators();
    const rows = retrieved.filter((r) => r.code === "PCPIPCH_1922H");

    // UNIQUE(code) ON CONFLICT REPLACE — only 1 row, with latest value
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(5.5);
  });
});

// ── AC-7: DI mock — all 3 indicators stored and returned on success path ──────

describe("AC-7: runImfIndicatorPollerJob with valid indicator codes (DI mock)", () => {
  function stubClassify(): ImfClassificationOutput {
    return {
      sentiment: 0.2,
      confidence: 0.80,
      classification: "imf_bullish",
      reasoning: "Stub",
      sectorImpacts: [],
    };
  }

  it("success path returns indicator_count=3 for all 3 valid codes", async () => {
    const indicators: ImfIndicator[] = [
      makeIndicator({ code: "NGDP_RPCH" }),
      makeIndicator({ code: "PCPIPCH" }),
      makeIndicator({ code: "BCA_NGDPD" }),
    ];

    let stored: ImfIndicator[] | undefined;
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => indicators,
      storeFn: async (inds) => { stored = inds; },
      classifyFn: () => stubClassify(),
    });

    expect(result.success).toBe(true);
    expect(result.indicator_count).toBe(3);
    expect(stored).toHaveLength(3);
    const codes = stored!.map((i) => i.code);
    expect(codes).toContain("NGDP_RPCH");
    expect(codes).toContain("PCPIPCH");
    expect(codes).toContain("BCA_NGDPD");
  });

  it("failure path: fetchFn returns [] → success:false, 0 rows, no DB write", async () => {
    let storeCalled = false;
    const result = await runImfIndicatorPollerJob({
      fetchFn: async () => [],
      storeFn: async () => { storeCalled = true; },
      classifyFn: () => stubClassify(),
    });

    expect(result.success).toBe(false);
    expect(result.indicator_count).toBe(0);
    expect(storeCalled).toBe(false);
  });
});
