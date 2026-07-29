/**
 * FE-PG-_INDEX-FRESH-FIX — loader tests for dashboard._index.tsx.
 *
 * Task: quality-audit FE-PG-_INDEX-FRESH (WARN) — /dashboard (Market Overview)
 * renders only per-dish ClientTimestamp; no page-level freshness/staleness
 * indicator. Fix wires the existing FreshnessBadge (TASK-FFT-L3A) using a new
 * top-level `data_asof` field surfaced by GET /api/market-digest.
 *
 * Naive-UTC risk (see docs/agent-memory/notebooks/dev-frontend.md 2026-07-25):
 * mcp-server emits `data_asof` as a bare SQLite "YYYY-MM-DD HH:MM:SS" string
 * (no offset). This host's Node default TZ resolves Europe/Paris (+2h) — a
 * naive `new Date(raw)` parse would silently skew age by 2h. The fix reuses
 * the existing `parseDate` helper (app/lib/formatDate.ts) to normalize to a
 * real ISO8601 UTC string before handing it to <FreshnessBadge>.
 *
 * Covers fetchMarketDigestData (the named loader-body helper, extracted here
 * to bypass Remix loader-stripping in jsdom — same pattern as fetchMacroData
 * in dashboard.macro.tsx / fetchAlertsData in dashboard.alerts.tsx):
 *   1. naive-space data_asof  → normalized to ISO8601 UTC (no host-TZ skew)
 *   2. already-ISO data_asof  → passed through unchanged (same instant)
 *   3. data_asof absent       → null (never fabricated)
 *   4. data_asof: null        → null
 *   5. 502 upstream error     → data_asof null, error set, no throw
 *   6. network error (throw)  → data_asof null, error set, no throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMarketDigestData } from "~/routes/dashboard._index";

const ORIGIN = "http://localhost:3001";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockDigestResponse(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("fetchMarketDigestData — data_asof normalization", () => {
  it("normalizes a bare SQLite 'YYYY-MM-DD HH:MM:SS' data_asof to ISO8601 UTC", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
      data_asof: "2026-07-29 15:32:13",
    });

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBe("2026-07-29T15:32:13.000Z");
  });

  it("passes through an already-ISO data_asof unchanged (same instant)", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
      data_asof: "2026-07-29T15:32:13.000Z",
    });

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBe("2026-07-29T15:32:13.000Z");
  });

  it("returns null data_asof when the field is absent (never fabricated)", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
    });

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBeNull();
  });

  it("returns null data_asof when the field is explicitly null", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
      data_asof: null,
    });

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBeNull();
  });
});

describe("fetchMarketDigestData — degraded paths (no regression)", () => {
  it("502 upstream → error string set, data_asof null, no throw", async () => {
    mockDigestResponse({ error: "bad gateway" }, 502);

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toMatch(/502/);
    expect(data.data_asof).toBeNull();
    expect(data.items).toEqual([]);
  });

  it("network error (fetch throws) → error string set, data_asof null, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchMarketDigestData(ORIGIN);

    expect(data.error).toContain("ECONNREFUSED");
    expect(data.data_asof).toBeNull();
    expect(data.items).toEqual([]);
  });
});
