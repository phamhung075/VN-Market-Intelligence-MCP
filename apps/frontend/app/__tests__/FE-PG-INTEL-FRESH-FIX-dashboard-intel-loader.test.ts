/**
 * FE-PG-INTEL-FRESH-FIX — loader tests for dashboard.intel.tsx.
 *
 * Task: quality-audit FE-PG-INTEL-FRESH (WARN) — /dashboard/intel (AI Bulletin
 * Hub) renders only per-item ClientTimestamp; no page-level freshness/staleness
 * indicator. Fix wires the existing FreshnessBadge (TASK-FFT-L3A,
 * slaTierKey="daily") using the same top-level `data_asof` field already
 * surfaced by GET /api/market-digest — this route hits the identical endpoint
 * as the prior sibling task (FE-PG-_INDEX-FRESH-FIX, dashboard._index.tsx).
 *
 * Naive-UTC risk (same as FE-PG-_INDEX-FRESH-FIX): mcp-server emits
 * `data_asof` as a bare SQLite "YYYY-MM-DD HH:MM:SS" string (no offset). The
 * fix reuses the existing `parseDate` helper (app/lib/formatDate.ts) — never
 * forked — to normalize to a real ISO8601 UTC string before handing it to
 * <FreshnessBadge>.
 *
 * Covers fetchIntelData (the named loader-body helper, extracted pre-existing
 * in this route — Remix strips inline loader exports under jsdom, same
 * pattern as fetchMarketDigestData/fetchAnalysisBriefs/fetchMacroData):
 *   1. naive-space data_asof  → normalized to ISO8601 UTC (no host-TZ skew)
 *   2. already-ISO data_asof  → passed through unchanged (same instant)
 *   3. data_asof absent       → null (never fabricated)
 *   4. data_asof: null        → null
 *   5. 502 upstream error     → data_asof null, error set, no throw
 *   6. network error (throw)  → data_asof null, error set, no throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIntelData } from "~/routes/dashboard.intel";

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

describe("fetchIntelData — data_asof normalization", () => {
  it("normalizes a bare SQLite 'YYYY-MM-DD HH:MM:SS' data_asof to ISO8601 UTC", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
      data_asof: "2026-07-29 15:32:13",
    });

    const data = await fetchIntelData(ORIGIN);

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

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBe("2026-07-29T15:32:13.000Z");
  });

  it("returns null data_asof when the field is absent (never fabricated)", async () => {
    mockDigestResponse({
      items: [],
      count: 0,
      fetchedAt: "2026-07-29T17:00:00.000Z",
    });

    const data = await fetchIntelData(ORIGIN);

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

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.data_asof).toBeNull();
  });
});

describe("fetchIntelData — degraded paths (no regression)", () => {
  it("502 upstream → error string set, data_asof null, no throw", async () => {
    mockDigestResponse({ error: "bad gateway" }, 502);

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toMatch(/502/);
    expect(data.data_asof).toBeNull();
    expect(data.items).toEqual([]);
  });

  it("network error (fetch throws) → error string set, data_asof null, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toContain("ECONNREFUSED");
    expect(data.data_asof).toBeNull();
    expect(data.items).toEqual([]);
  });
});
