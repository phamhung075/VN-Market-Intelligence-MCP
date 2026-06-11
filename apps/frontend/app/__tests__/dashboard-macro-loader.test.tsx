/**
 * dashboard-macro-loader — Non-fatal loader path tests for dashboard.macro.tsx.
 *
 * Tests the core fetch-and-parse logic (fetchMacroData) which is the body
 * of the Remix loader. Imported directly so the test bypasses the Remix
 * Vite plugin stripping server-only exports in jsdom mode.
 *
 * Honest-degrade branches covered:
 *
 *  1. 200 OK with valid DTO  → signals + indicators populated, error null
 *  2. stale_served:true      → stale_served flag propagated, error null
 *  3. 502 upstream error     → error string set, signals+indicators null (no throw)
 *  4. 503 upstream error     → error string set, signals+indicators null (no throw)
 *  5. Network error (throw)  → error string set, signals+indicators null (no throw)
 *  6. Unexpected JSON shape  → error string set, signals+indicators null (no throw)
 *  7. null JSON body         → error string set, signals+indicators null (no throw)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMacroData } from "~/routes/dashboard.macro";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";

/** Minimal valid MacroRegimeDto fixture. */
const VALID_DTO = {
  generated_at: "2026-06-11T10:00:00.000Z",
  data_source: "live",
  stale_served: false,
  indicators: {
    vnIndex: 1797.4,
    oilUsd: 93.74,
    goldUsd: 4105,
    usdVnd: 26130,
  },
  signals: {
    investment_clock: { phase: "CORE_VN", score: 8, tier: "VN_DIRECT" },
    oil: {
      direction: "NEUTRAL",
      price_usd: 93.74,
      reasoning: "Giá dầu dao động quanh vùng trung bình, chưa có xu hướng rõ.",
    },
    gold: {
      direction: "BULLISH",
      price_usd: 4105,
      reasoning: "Vàng tăng mạnh do nhu cầu trú ẩn an toàn.",
    },
    usdvnd: {
      direction: "BEARISH",
      rate_vnd: 26130,
      reasoning: "VND mất giá so với USD.",
    },
  },
  calendar: {
    available: false,
    events: [],
    note: "Lịch sự kiện chưa được cập nhật.",
  },
};

// ---------------------------------------------------------------------------
// Setup — mock global fetch before each test
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Branch 1: 200 OK with valid DTO → signals + indicators populated, no error
// ---------------------------------------------------------------------------

describe("fetchMacroData — 200 valid DTO", () => {
  it("returns signals and indicators on a valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(VALID_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.signals).not.toBeNull();
    expect(data.signals!.investment_clock.phase).toBe("CORE_VN");
    expect(data.signals!.investment_clock.score).toBe(8);
    expect(data.indicators).not.toBeNull();
    expect(data.indicators!.vnIndex).toBe(1797.4);
    expect(data.stale_served).toBe(false);
    expect(data.data_source).toBe("live");
  });

  it("returns stale_served:true when DTO has stale_served:true", async () => {
    const staleDto = { ...VALID_DTO, stale_served: true, data_source: "stale" };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(staleDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.stale_served).toBe(true);
    expect(data.data_source).toBe("stale");
    expect(data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch 2: 502 upstream → degraded state, no throw
// ---------------------------------------------------------------------------

describe("fetchMacroData — 502 upstream error", () => {
  it("returns error string, null signals + null indicators on 502 without throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).not.toBeNull();
    expect(typeof data.error).toBe("string");
    expect(data.error).toMatch(/502/);
    expect(data.signals).toBeNull();
    expect(data.indicators).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch 3: 503 upstream → degraded state, no throw
// ---------------------------------------------------------------------------

describe("fetchMacroData — 503 upstream error", () => {
  it("returns error string on 503 without throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).toMatch(/503/);
    expect(data.signals).toBeNull();
    expect(data.indicators).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch 4: Network error (fetch throws) → degraded state, no throw from fetchMacroData
// ---------------------------------------------------------------------------

describe("fetchMacroData — network error", () => {
  it("returns error string when fetch throws (network unreachable)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).toContain("ECONNREFUSED");
    expect(data.signals).toBeNull();
    expect(data.indicators).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch 5: Unexpected JSON shape → degraded state, no throw
// ---------------------------------------------------------------------------

describe("fetchMacroData — unexpected JSON shape", () => {
  it("returns error string for JSON missing 'signals' key", async () => {
    const badShape = { foo: "bar", unexpected: true };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(badShape), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/Unexpected response shape/);
    expect(data.signals).toBeNull();
    expect(data.indicators).toBeNull();
  });

  it("returns error string for null JSON body", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchMacroData(ORIGIN);

    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/Unexpected response shape/);
    expect(data.signals).toBeNull();
    expect(data.indicators).toBeNull();
  });
});
