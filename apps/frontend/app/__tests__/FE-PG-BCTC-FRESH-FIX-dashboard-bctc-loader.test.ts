/**
 * FE-PG-BCTC-FRESH-FIX — loader tests for dashboard.bctc.tsx.
 *
 * Task: quality-audit FE-PG-BCTC-FRESH (WARN) — /dashboard/bctc (Financial
 * Reports hub) renders `generated_at` (page-level) and per-item `updated_at`
 * (recency visible as raw values) but has no staleness *flag*. Fix wires the
 * existing FreshnessBadge (TASK-FFT-L3A, slaTierKey="event") using the DTO's
 * top-level `generated_at` field, which is now threaded straight through the
 * loader-body helper instead of being discarded and replaced by a second,
 * independently-computed frontend-local `new Date().toISOString()`.
 *
 * No naive-UTC risk here (unlike the market-digest `data_asof` field fixed
 * in the prior sibling task, FE-PG-_INDEX-FRESH-FIX): mcp-server's
 * analysisBriefIndexHandler emits `generated_at` as a real ISO8601 UTC
 * string (`new Date().toISOString()` server-side, confirmed in
 * apps/mcp-server/src/infrastructure/fileStore/analysisBriefReader.ts) — no
 * `parseDate` normalization is required.
 *
 * Covers fetchAnalysisBriefs (the named loader-body helper, extracted
 * pre-existing in this route — Remix strips inline loader exports under
 * jsdom, same pattern as fetchMacroData/fetchAlertsData/fetchMarketDigestData):
 *   1. valid ISO generated_at    → passed through unchanged
 *   2. generated_at absent       → honest fallback timestamp (never undefined/throw)
 *   3. generated_at explicit null → honest fallback timestamp (never undefined/throw)
 *   4. 502 upstream error        → generated_at still a valid fallback, error set, no throw
 *   5. network error (throw)     → generated_at still a valid fallback, error set, no throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAnalysisBriefs } from "~/routes/dashboard.bctc";

const ORIGIN = "http://localhost:3001";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockBriefsResponse(body: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

/** True when `iso` parses to a real Date within a few seconds of "now". */
function isFreshFallbackTimestamp(iso: string): boolean {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  return Math.abs(Date.now() - ms) < 10_000;
}

describe("fetchAnalysisBriefs — generated_at freshness passthrough", () => {
  it("passes through a valid ISO generated_at unchanged", async () => {
    mockBriefsResponse({
      generated_at: "2026-07-29T15:32:13.000Z",
      count: 0,
      items: [],
    });

    const data = await fetchAnalysisBriefs(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.generated_at).toBe("2026-07-29T15:32:13.000Z");
  });

  it("falls back to a fresh timestamp when generated_at is absent (never undefined)", async () => {
    mockBriefsResponse({
      count: 0,
      items: [],
    });

    const data = await fetchAnalysisBriefs(ORIGIN);

    expect(data.error).toBeNull();
    expect(typeof data.generated_at).toBe("string");
    expect(isFreshFallbackTimestamp(data.generated_at)).toBe(true);
  });

  it("falls back to a fresh timestamp when generated_at is explicitly null", async () => {
    mockBriefsResponse({
      generated_at: null,
      count: 0,
      items: [],
    });

    const data = await fetchAnalysisBriefs(ORIGIN);

    expect(data.error).toBeNull();
    expect(typeof data.generated_at).toBe("string");
    expect(isFreshFallbackTimestamp(data.generated_at)).toBe(true);
  });
});

describe("fetchAnalysisBriefs — degraded paths (no regression)", () => {
  it("502 upstream → error string set, generated_at still a valid fallback, no throw", async () => {
    mockBriefsResponse({ error: "bad gateway" }, 502);

    const data = await fetchAnalysisBriefs(ORIGIN);

    expect(data.error).toMatch(/502/);
    expect(typeof data.generated_at).toBe("string");
    expect(isFreshFallbackTimestamp(data.generated_at)).toBe(true);
    expect(data.items).toEqual([]);
  });

  it("network error (fetch throws) → error string set, generated_at still a valid fallback, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchAnalysisBriefs(ORIGIN);

    expect(data.error).toContain("ECONNREFUSED");
    expect(typeof data.generated_at).toBe("string");
    expect(isFreshFallbackTimestamp(data.generated_at)).toBe(true);
    expect(data.items).toEqual([]);
  });
});
