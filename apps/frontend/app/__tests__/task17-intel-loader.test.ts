/**
 * task17-intel-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/intel (Bản Tin AI).
 *
 * The loader calls fetchIntelData(origin) which self-fetches
 * `${origin}/api/market-digest` and must:
 *   - Return items + count + fetchedAt when upstream is healthy.
 *   - Return empty items + error string on upstream 5xx (never throw).
 *   - Return empty items + error string on network failure (never throw).
 *   - Return empty items + error string on unexpected JSON shape (never throw).
 *   - Return items:[] + error:null when count is 0 (empty state, not an error).
 *   - Preserve item.text verbatim (whitespace-pre-wrap rendering contract).
 *
 * Strategy: import fetchIntelData directly (exported named helper).
 * Remix strips `loader` in jsdom — the named helper bypasses that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIntelData } from "~/routes/dashboard.intel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const REAL_TS = "2026-06-11T08:00:00.000Z";
const FETCHED_AT = "2026-06-11T08:05:00.000Z";

/** Realistic CHEF dish text with newlines + emoji (like real upstream data). */
const CHEF_DISH_TEXT =
  "Bản tin sáng Pháp — Thị trường VN (11/06/2026)\n\nVN-Index: 1.797 (-7 / -0.37%)\n\nTop tăng: HPG +2.1%, VHM +1.8%\nTop giảm: VCB -0.9%, BID -0.7%\n\nCảnh báo gần nhất: Áp lực bán ròng khối ngoại — 320 tỷ VND.";

const SAMPLE_ITEM = {
  id: 720,
  text: CHEF_DISH_TEXT,
  ts: REAL_TS,
  type: "market_digest",
  from_agent: "chef",
};

const HEALTHY_DTO = {
  items: [SAMPLE_ITEM],
  count: 1,
  fetchedAt: FETCHED_AT,
};

const MULTI_ITEM_DTO = {
  items: [
    SAMPLE_ITEM,
    { ...SAMPLE_ITEM, id: 719, ts: "2026-06-10T08:00:00.000Z" },
    { ...SAMPLE_ITEM, id: 718, ts: "2026-06-09T08:00:00.000Z" },
  ],
  count: 3,
  fetchedAt: FETCHED_AT,
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
// Suite 1 — Happy path: 200 → items returned, error null
// ---------------------------------------------------------------------------

describe("fetchIntelData — 200 valid DTO", () => {
  it("returns items on a valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe(720);
    expect(data.count).toBe(1);
  });

  it("preserves item.text verbatim (whitespace-pre-wrap rendering contract)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items[0].text).toBe(CHEF_DISH_TEXT);
    // Must contain newlines — pre-wrap relies on them
    expect(data.items[0].text).toContain("\n");
  });

  it("fetchedAt is propagated from DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.fetchedAt).toBe(FETCHED_AT);
  });

  it("returns multiple items from multi-item DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(3);
    expect(data.count).toBe(3);
  });

  it("count falls back to items.length when DTO count absent", async () => {
    const noCount = { ...HEALTHY_DTO, count: undefined };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noCount), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.count).toBe(1); // items.length fallback
    expect(data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Empty state: count:0 → error null, items empty (not an error)
// ---------------------------------------------------------------------------

describe("fetchIntelData — count:0 empty state", () => {
  it("empty items + count 0 → error null, no throw", async () => {
    const emptyDto = { items: [], count: 0, fetchedAt: FETCHED_AT };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Non-fatal: upstream HTTP errors (502 / 503)
// ---------------------------------------------------------------------------

describe("fetchIntelData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("503 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toMatch(/503/);
  });

  it("error string contains status code for diagnostics", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("timeout", {
        status: 504,
        statusText: "Gateway Timeout",
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.error).toContain("504");
    expect(typeof data.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: network failure (fetch throws)
// ---------------------------------------------------------------------------

describe("fetchIntelData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → error string not null, items empty", async () => {
    // After safeFetch migration: non-Error throws are stringified (String(err))
    // not mapped to a Vietnamese fallback message.
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).not.toBeNull();
  });

  it("count is 0 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const data = await fetchIntelData(ORIGIN);

    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Unexpected JSON shape guard — never throws
// ---------------------------------------------------------------------------

describe("fetchIntelData — unexpected JSON shape (non-fatal)", () => {
  it("null body 200 → empty items, error null (parse(null) returns empty-shape)", async () => {
    // After safeFetch migration: parse(null) returns empty-shape without error.
    // A 200 response with null body is treated as empty/degraded, not an error.
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBeNull();
  });

  it("object without items key → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no items here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });

  it("items field is not an array → treated as empty array, no throw", async () => {
    const malformed = { items: "not-an-array", count: 0, fetchedAt: FETCHED_AT };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(malformed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBeNull();
  });

  it("string body → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify("just a string"), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchIntelData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });
});
