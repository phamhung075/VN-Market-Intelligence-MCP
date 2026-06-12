/**
 * reaudit-fe-002-foreign-flow-stale-fields.test.ts
 *
 * REAUDIT-FE-002 — NFR-C-5 foreign-flow stale_fields column header badge.
 *
 * Contract probed from LIVE payload 2026-06-12:
 *   stale_fields: ["currentHoldingRatio", "maxHoldingRatio", "marketCapBn"]
 *
 * Tests:
 *   - stale_fields parsed from DTO and included in LoaderData
 *   - stale_fields defaults to [] when absent from DTO
 *   - stale_fields defaults to [] on upstream 5xx error
 *   - isFieldStale() returns true when field is in stale_fields, false otherwise
 *   - staleColumnLabel() returns correct Vietnamese badge text for stale fields
 *   - staleColumnLabel() returns empty string for non-stale fields
 *   - All three structurally-unavailable fields are correctly detected
 *
 * Strategy: import fetchForeignFlowData + isFieldStale + staleColumnLabel
 * directly (named exports). Remix strips loader in jsdom; named helpers bypass that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchForeignFlowData,
  isFieldStale,
  staleColumnLabel,
} from "~/routes/dashboard.foreign-flow";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const FETCHED_AT = "2026-06-12T09:27:26.493Z";
const TRADING_DATE = "2026-06-12";

const ITEM_NULL_FIELDS = {
  code: "HNG",
  foreignVolume: 50000,
  direction: "BUY" as const,
  foreignRoom: 53829910.7,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-12 08:59:55",
};

/** DTO WITH stale_fields — mirrors live 2026-06-12 payload */
const DTO_WITH_STALE_FIELDS = {
  tradingDate: TRADING_DATE,
  items: [ITEM_NULL_FIELDS],
  summary: {
    netBuyCount: 0,
    netSellCount: 0,
    topBuys: [],
    topSells: [],
  },
  count: 1,
  fetchedAt: FETCHED_AT,
  stale_fields: ["currentHoldingRatio", "maxHoldingRatio", "marketCapBn"],
};

/** DTO WITHOUT stale_fields — backward-compat (mcp-server not yet rebuilt) */
const DTO_WITHOUT_STALE_FIELDS = {
  tradingDate: TRADING_DATE,
  items: [ITEM_NULL_FIELDS],
  summary: {
    netBuyCount: 0,
    netSellCount: 0,
    topBuys: [],
    topSells: [],
  },
  count: 1,
  fetchedAt: FETCHED_AT,
};

/** DTO with stale_fields: [] (data is available) */
const DTO_STALE_FIELDS_EMPTY = {
  ...DTO_WITHOUT_STALE_FIELDS,
  stale_fields: [] as string[],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Suite 1 — stale_fields parsed from DTO
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — stale_fields parsing", () => {
  it("returns stale_fields from DTO when present", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_STALE_FIELDS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toEqual([
      "currentHoldingRatio",
      "maxHoldingRatio",
      "marketCapBn",
    ]);
    expect(data.error).toBeNull();
  });

  it("defaults stale_fields to [] when absent from DTO (backward compat)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITHOUT_STALE_FIELDS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toEqual([]);
    expect(data.error).toBeNull();
  });

  it("stale_fields is [] when DTO has stale_fields: []", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_STALE_FIELDS_EMPTY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toEqual([]);
  });

  it("stale_fields defaults to [] on 5xx upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "upstream error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toEqual([]);
    expect(data.error).toBeTruthy();
  });

  it("stale_fields defaults to [] on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network failure"));

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toEqual([]);
    expect(data.error).toBeTruthy();
  });

  it("all three structurally-unavailable fields present in live stale_fields", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_STALE_FIELDS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.stale_fields).toContain("currentHoldingRatio");
    expect(data.stale_fields).toContain("maxHoldingRatio");
    expect(data.stale_fields).toContain("marketCapBn");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — isFieldStale() helper
// ---------------------------------------------------------------------------

describe("isFieldStale()", () => {
  it("returns true when field is in stale_fields", () => {
    expect(
      isFieldStale("currentHoldingRatio", ["currentHoldingRatio", "marketCapBn"])
    ).toBe(true);
  });

  it("returns false when field is NOT in stale_fields", () => {
    expect(isFieldStale("foreignVolume", ["currentHoldingRatio", "marketCapBn"])).toBe(
      false
    );
  });

  it("returns false on empty stale_fields array", () => {
    expect(isFieldStale("currentHoldingRatio", [])).toBe(false);
  });

  it("returns false on stale_fields undefined (no-field-set guard)", () => {
    expect(isFieldStale("currentHoldingRatio", undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — staleColumnLabel() — Vietnamese badge text
// ---------------------------------------------------------------------------

describe("staleColumnLabel()", () => {
  const STALE = ["currentHoldingRatio", "maxHoldingRatio", "marketCapBn"];

  it("returns 'Không có dữ liệu' for currentHoldingRatio in stale_fields", () => {
    expect(staleColumnLabel("currentHoldingRatio", STALE)).toBe("Không có dữ liệu");
  });

  it("returns 'Không có dữ liệu' for maxHoldingRatio in stale_fields", () => {
    expect(staleColumnLabel("maxHoldingRatio", STALE)).toBe("Không có dữ liệu");
  });

  it("returns 'Không có dữ liệu' for marketCapBn in stale_fields", () => {
    expect(staleColumnLabel("marketCapBn", STALE)).toBe("Không có dữ liệu");
  });

  it("returns empty string when field NOT in stale_fields", () => {
    expect(staleColumnLabel("foreignVolume", STALE)).toBe("");
  });

  it("returns empty string when stale_fields is empty", () => {
    expect(staleColumnLabel("currentHoldingRatio", [])).toBe("");
  });
});
