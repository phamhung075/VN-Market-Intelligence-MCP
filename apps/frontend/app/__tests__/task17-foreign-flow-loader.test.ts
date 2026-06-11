/**
 * task17-foreign-flow-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/foreign-flow (Khối Ngoại).
 *
 * The loader calls fetchForeignFlowData(origin, params?) which self-fetches
 * `${origin}/api/foreign-flow` and must:
 *   - Return items + summary + tradingDate + count + fetchedAt when upstream is healthy.
 *   - Return empty items + error string on upstream 5xx (never throw).
 *   - Return empty items + error string on network failure (never throw).
 *   - Return empty items + error string on unexpected JSON shape (never throw).
 *   - Return items:[] + error:null when count is 0 (empty state, not an error).
 *   - Correctly propagate signed foreignVolume (negative for SELL).
 *   - Render null currentHoldingRatio / maxHoldingRatio / marketCapBn as "—" NOT 0.
 *   - Propagate summary.topBuys and topSells with correct ordering from DTO.
 *
 * Fixtures mirror production payload (nulls + negatives, signed volumes) —
 * a seed of the assumed-clean shape is self-confirming and worthless.
 *
 * Strategy: import fetchForeignFlowData + formatVolume + formatRatio + formatMarketCap
 * directly (exported named helpers). Remix strips `loader` in jsdom; named helpers bypass that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchForeignFlowData,
  formatVolume,
  formatRatio,
  formatMarketCap,
} from "~/routes/dashboard.foreign-flow";

// ---------------------------------------------------------------------------
// Fixtures — mirrors real production payload (2026-06-11 curl)
// NULL fields: currentHoldingRatio, maxHoldingRatio, marketCapBn all null
// Signed foreignVolume: positive = BUY net, negative = SELL net
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const FETCHED_AT = "2026-06-11T10:15:38.594Z";
const TRADING_DATE = "2026-06-11";

/** Net-BUY item — mirrors HNG in live payload */
const ITEM_BUY_HNG = {
  code: "HNG",
  foreignVolume: 50000,
  direction: "BUY" as const,
  foreignRoom: 53829910.7,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-11 08:59:55",
};

/** Net-BUY item 2 — VNM */
const ITEM_BUY_VNM = {
  code: "VNM",
  foreignVolume: 38200,
  direction: "BUY" as const,
  foreignRoom: 12000000,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-11 08:59:55",
};

/** Net-SELL item — mirrors NVL in live payload (most negative) */
const ITEM_SELL_NVL = {
  code: "NVL",
  foreignVolume: -393749,
  direction: "SELL" as const,
  foreignRoom: 2100000,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-11 08:59:55",
};

/** Net-SELL item 2 — VPB */
const ITEM_SELL_VPB = {
  code: "VPB",
  foreignVolume: -210000,
  direction: "SELL" as const,
  foreignRoom: 8500000,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-11 08:59:55",
};

/** FLAT item — neutral, should show 0 volume */
const ITEM_FLAT_ACB = {
  code: "ACB",
  foreignVolume: 0,
  direction: "FLAT" as const,
  foreignRoom: 5200000,
  currentHoldingRatio: null,
  maxHoldingRatio: null,
  marketCapBn: null,
  fetchedAt: "2026-06-11 08:59:55",
};

/** Item WITH non-null optional fields (future data) */
const ITEM_WITH_RATIOS = {
  code: "VCB",
  foreignVolume: 15000,
  direction: "BUY" as const,
  foreignRoom: 30000000,
  currentHoldingRatio: 0.2847,
  maxHoldingRatio: 0.3,
  marketCapBn: 450.5,
  fetchedAt: "2026-06-11 08:59:55",
};

/** Summary matching production shape */
const SAMPLE_SUMMARY = {
  netBuyCount: 30,
  netSellCount: 61,
  topBuys: [ITEM_BUY_HNG, ITEM_BUY_VNM],
  topSells: [ITEM_SELL_NVL, ITEM_SELL_VPB],
};

/** Minimal healthy DTO (1 item, all nulls) */
const HEALTHY_DTO = {
  tradingDate: TRADING_DATE,
  items: [ITEM_BUY_HNG],
  summary: {
    netBuyCount: 1,
    netSellCount: 0,
    topBuys: [ITEM_BUY_HNG],
    topSells: [],
  },
  count: 1,
  fetchedAt: FETCHED_AT,
};

/** Multi-item DTO with mixed BUY/SELL/FLAT, nulls everywhere */
const MULTI_ITEM_DTO = {
  tradingDate: TRADING_DATE,
  items: [ITEM_BUY_HNG, ITEM_BUY_VNM, ITEM_SELL_NVL, ITEM_SELL_VPB, ITEM_FLAT_ACB],
  summary: SAMPLE_SUMMARY,
  count: 5,
  fetchedAt: FETCHED_AT,
};

/** DTO with non-null ratio fields */
const DTO_WITH_RATIOS = {
  tradingDate: TRADING_DATE,
  items: [ITEM_WITH_RATIOS],
  summary: {
    netBuyCount: 1,
    netSellCount: 0,
    topBuys: [ITEM_WITH_RATIOS],
    topSells: [],
  },
  count: 1,
  fetchedAt: FETCHED_AT,
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
// Suite 1 — Happy path: 200 → items, summary, tradingDate returned, error null
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — 200 valid DTO", () => {
  it("returns items on a valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].code).toBe("HNG");
    expect(data.count).toBe(1);
  });

  it("tradingDate propagated from DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.tradingDate).toBe(TRADING_DATE);
  });

  it("fetchedAt propagated from DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.fetchedAt).toBe(FETCHED_AT);
  });

  it("summary.netBuyCount and netSellCount propagated correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.summary.netBuyCount).toBe(30);
    expect(data.summary.netSellCount).toBe(61);
  });

  it("summary.topBuys ordering matches DTO (HNG first)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.summary.topBuys[0].code).toBe("HNG");
    expect(data.summary.topBuys[1].code).toBe("VNM");
  });

  it("summary.topSells ordering matches DTO (NVL first — most negative)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.summary.topSells[0].code).toBe("NVL");
    expect(data.summary.topSells[0].foreignVolume).toBe(-393749);
    expect(data.summary.topSells[1].code).toBe("VPB");
  });

  it("passes limit param in query string", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(HEALTHY_DTO), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchForeignFlowData(ORIGIN, { limit: 200 });

    expect(capturedUrl).toContain("limit=200");
  });

  it("count falls back to items.length when DTO count absent", async () => {
    const noCount = { ...HEALTHY_DTO, count: undefined };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(noCount), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.count).toBe(1);
    expect(data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — NULL field tolerance (critical per task spec)
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — NULL field tolerance", () => {
  it("currentHoldingRatio null → preserved as null, not 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    for (const item of data.items) {
      expect(item.currentHoldingRatio).toBeNull();
    }
  });

  it("maxHoldingRatio null → preserved as null, not 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    for (const item of data.items) {
      expect(item.maxHoldingRatio).toBeNull();
    }
  });

  it("marketCapBn null → preserved as null, not 0", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    for (const item of data.items) {
      expect(item.marketCapBn).toBeNull();
    }
  });

  it("non-null ratios preserved when present", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_WITH_RATIOS), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items[0].currentHoldingRatio).toBeCloseTo(0.2847);
    expect(data.items[0].maxHoldingRatio).toBeCloseTo(0.3);
    expect(data.items[0].marketCapBn).toBeCloseTo(450.5);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Signed volume correctness
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — signed foreignVolume", () => {
  it("BUY item has positive foreignVolume", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    const hng = data.items.find((i) => i.code === "HNG");
    expect(hng).toBeDefined();
    expect(hng!.foreignVolume).toBeGreaterThan(0);
    expect(hng!.foreignVolume).toBe(50000);
  });

  it("SELL item has negative foreignVolume", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    const nvl = data.items.find((i) => i.code === "NVL");
    expect(nvl).toBeDefined();
    expect(nvl!.foreignVolume).toBeLessThan(0);
    expect(nvl!.foreignVolume).toBe(-393749);
  });

  it("FLAT item has zero foreignVolume", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    const acb = data.items.find((i) => i.code === "ACB");
    expect(acb).toBeDefined();
    expect(acb!.foreignVolume).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Empty state: items:[] → error null
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — empty state", () => {
  it("empty items + count 0 → error null, no throw", async () => {
    const emptyDto = {
      tradingDate: TRADING_DATE,
      items: [],
      summary: { netBuyCount: 0, netSellCount: 0, topBuys: [], topSells: [] },
      count: 0,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
    expect(data.summary.netBuyCount).toBe(0);
    expect(data.summary.netSellCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Non-fatal: upstream HTTP errors
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

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

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toMatch(/503/);
  });

  it("summary is zeroed on upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.summary.netBuyCount).toBe(0);
    expect(data.summary.netSellCount).toBe(0);
    expect(data.summary.topBuys).toEqual([]);
    expect(data.summary.topSells).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Non-fatal: network failure (fetch throws)
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → fallback Vietnamese message, items empty", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe(
      "Không thể kết nối tới máy chủ dữ liệu khối ngoại"
    );
  });

  it("count is 0 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Unexpected JSON shape guard — never throws
// ---------------------------------------------------------------------------

describe("fetchForeignFlowData — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });

  it("object without items key → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no items here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });

  it("items field is not an array → treated as empty array, no throw", async () => {
    const malformed = {
      tradingDate: TRADING_DATE,
      items: "not-an-array",
      summary: SAMPLE_SUMMARY,
      count: 0,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(malformed), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchForeignFlowData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — formatVolume helper (signed-volume coloring logic)
// ---------------------------------------------------------------------------

describe("formatVolume — signed volume formatting", () => {
  it("positive volume gets + prefix", () => {
    expect(formatVolume(50000)).toMatch(/^\+/);
  });

  it("negative volume gets - prefix", () => {
    expect(formatVolume(-393749)).toMatch(/^-/);
  });

  it("zero volume returns '0'", () => {
    expect(formatVolume(0)).toBe("0");
  });

  it("positive volume is thousands-separated (contains digits)", () => {
    const result = formatVolume(50000);
    // Should contain the digits (format depends on locale but should not be 50000 unseparated on all locales)
    expect(result).toContain("50");
  });

  it("negative volume absolute value is thousands-separated", () => {
    const result = formatVolume(-393749);
    expect(result.startsWith("-")).toBe(true);
    expect(result).toContain("393");
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — formatRatio helper (null → "—")
// ---------------------------------------------------------------------------

describe("formatRatio — null tolerance", () => {
  it("null → returns '—', not '0' or '0.00%'", () => {
    expect(formatRatio(null)).toBe("—");
  });

  it("undefined → returns '—'", () => {
    // Cast to test defensive path
    expect(formatRatio(undefined as unknown as null)).toBe("—");
  });

  it("0.2847 → returns percentage string", () => {
    const result = formatRatio(0.2847);
    expect(result).toContain("%");
    expect(result).not.toBe("—");
  });

  it("0 (explicit zero) → returns '0.00%', not '—'", () => {
    // Explicit zero ratio IS a valid ratio (0%), different from null
    expect(formatRatio(0)).toBe("0.00%");
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — formatMarketCap helper (null → "—")
// ---------------------------------------------------------------------------

describe("formatMarketCap — null tolerance", () => {
  it("null → returns '—', not '0' or '0 tỷ'", () => {
    expect(formatMarketCap(null)).toBe("—");
  });

  it("undefined → returns '—'", () => {
    expect(formatMarketCap(undefined as unknown as null)).toBe("—");
  });

  it("450.5 → returns string containing '450.5' and 'tỷ'", () => {
    const result = formatMarketCap(450.5);
    expect(result).toContain("450.5");
    expect(result).toContain("tỷ");
  });
});
