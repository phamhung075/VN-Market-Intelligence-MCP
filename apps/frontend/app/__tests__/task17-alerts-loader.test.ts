/**
 * task17-alerts-loader.test.ts
 *
 * Tests the non-fatal loader behaviour for /dashboard/alerts (Cảnh Báo).
 *
 * The loader calls fetchAlertsData(origin, params?) which self-fetches
 * `${origin}/api/alerts` and must:
 *   - Return items + count + fetchedAt when upstream is healthy.
 *   - Return empty items + error string on upstream 5xx (never throw).
 *   - Return empty items + error string on network failure (never throw).
 *   - Return empty items + error string on unexpected JSON shape (never throw).
 *   - Return items:[] + error:null when count is 0 (empty state, not an error).
 *   - Compute per-severity counts correctly from returned items.
 *   - Not throw on items with missing optional fields (message, outcome, confidenceScore).
 *
 * signals[] shape is now Signal objects (v2 contract) — NOT string[].
 * Fixtures below use realistic object-shaped signals to prevent the string[]
 * fixture class of bug that let the old contract ship broken.
 *
 * Strategy: import fetchAlertsData + signalTypeLabel directly (exported named helpers).
 * Remix strips `loader` in jsdom — the named helpers bypass that.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAlertsData, signalTypeLabel } from "~/routes/dashboard.alerts";

// ---------------------------------------------------------------------------
// Fixtures — object-shaped signals (v2 contract)
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const FETCHED_AT = "2026-06-11T08:05:00.000Z";
const TS_1 = "2026-06-11T08:00:00.000Z";
const TS_2 = "2026-06-11T07:00:00.000Z";

/** 2-signal alert: price_surge + volume_spike (tests multi-chip row) */
const SAMPLE_ALERT_HIGH = {
  id: "alert-001",
  triggeredAt: TS_1,
  severity: "high" as const,
  signals: [
    {
      type: "price_surge",
      severity: "high",
      message: "Giá VCB tăng 7% trong 1 phiên, vượt ngưỡng kháng cự 92k",
      confidence: 0.87,
    },
    {
      type: "volume_spike",
      severity: "medium",
      message: "Khối lượng giao dịch VCB gấp 3.2 lần trung bình 20 phiên",
      confidence: 0.91,
    },
  ],
  affectedActions: [
    { code: "VCB", expectedImpact: "sell", confidence: 0.82 },
    { code: "BID", expectedImpact: "monitor", confidence: 0.65 },
  ],
  message: "Khối ngoại bán ròng mạnh — VCB và BID áp lực",
  read: 0 as const,
  sentBy: "signal-engine",
  confidenceScore: 0.78,
  outcome: null,
};

/** 1-signal news_mention alert */
const SAMPLE_ALERT_CRITICAL = {
  id: "alert-002",
  triggeredAt: TS_2,
  severity: "critical" as const,
  signals: [
    {
      type: "news_mention",
      severity: "high",
      message: "HPG đề cập trong bản tin khẩn của HOSE — tạm ngừng giao dịch",
      confidence: 0.95,
    },
  ],
  affectedActions: [{ code: "HPG", expectedImpact: "halt", confidence: 0.95 }],
  message: null,
  read: 1 as const,
  sentBy: "market-monitor",
  confidenceScore: 0.95,
  outcome: "Cổ phiếu bị tạm dừng giao dịch",
};

/** Empty signals[] row — must not crash render */
const SAMPLE_ALERT_LOW = {
  id: "alert-003",
  triggeredAt: TS_2,
  severity: "low" as const,
  signals: [],
  affectedActions: [],
  message: null,
  read: 0 as const,
  sentBy: "news-scout",
  confidenceScore: null,
  outcome: null,
};

const HEALTHY_DTO = {
  items: [SAMPLE_ALERT_HIGH],
  count: 1,
  fetchedAt: FETCHED_AT,
};

const MULTI_ITEM_DTO = {
  items: [SAMPLE_ALERT_HIGH, SAMPLE_ALERT_CRITICAL, SAMPLE_ALERT_LOW],
  count: 3,
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
// Suite 1 — Happy path: 200 → items returned, error null
// ---------------------------------------------------------------------------

describe("fetchAlertsData — 200 valid DTO", () => {
  it("returns items on a valid 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("alert-001");
    expect(data.count).toBe(1);
  });

  it("fetchedAt is propagated from DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    expect(data.fetchedAt).toBe(FETCHED_AT);
  });

  it("returns multiple items from multi-item DTO", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

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

    const data = await fetchAlertsData(ORIGIN);

    expect(data.count).toBe(1);
    expect(data.error).toBeNull();
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

    await fetchAlertsData(ORIGIN, { limit: 50 });

    expect(capturedUrl).toContain("limit=50");
  });

  it("passes severity param in query string", async () => {
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

    await fetchAlertsData(ORIGIN, { severity: "high" });

    expect(capturedUrl).toContain("severity=high");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Severity counts computed correctly
// ---------------------------------------------------------------------------

describe("fetchAlertsData — severity counts", () => {
  it("items span multiple severities — all returned", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const severities = data.items.map((i) => i.severity);
    expect(severities).toContain("high");
    expect(severities).toContain("critical");
    expect(severities).toContain("low");
  });

  it("per-severity count can be derived from returned items", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const counts: Record<string, number> = {};
    for (const item of data.items) {
      counts[item.severity] = (counts[item.severity] ?? 0) + 1;
    }
    expect(counts["high"]).toBe(1);
    expect(counts["critical"]).toBe(1);
    expect(counts["low"]).toBe(1);
    expect(counts["medium"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Empty state: count:0 → error null
// ---------------------------------------------------------------------------

describe("fetchAlertsData — count:0 empty state", () => {
  it("empty items + count 0 → error null, no throw", async () => {
    const emptyDto = { items: [], count: 0, fetchedAt: FETCHED_AT };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Non-fatal: upstream HTTP errors (502 / 503)
// ---------------------------------------------------------------------------

describe("fetchAlertsData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → items empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

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

    const data = await fetchAlertsData(ORIGIN);

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

    const data = await fetchAlertsData(ORIGIN);

    expect(data.error).toContain("504");
    expect(typeof data.error).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Non-fatal: network failure (fetch throws)
// ---------------------------------------------------------------------------

describe("fetchAlertsData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, items empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchAlertsData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → error string set, items empty", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchAlertsData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).not.toBeNull();
  });

  it("count is 0 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));

    const data = await fetchAlertsData(ORIGIN);

    expect(data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Unexpected JSON shape guard — never throws
// ---------------------------------------------------------------------------

describe("fetchAlertsData — unexpected JSON shape (non-fatal)", () => {
  it("null body 200 → empty items, error null (parse(null) returns empty-shape)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

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

    const data = await fetchAlertsData(ORIGIN);

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

    const data = await fetchAlertsData(ORIGIN);

    expect(data.items).toEqual([]);
    expect(data.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Malformed / missing fields in items do not throw
// ---------------------------------------------------------------------------

describe("fetchAlertsData — malformed item fields (non-fatal)", () => {
  it("item with null message, null outcome, null confidenceScore does not throw", async () => {
    const dto = {
      items: [SAMPLE_ALERT_LOW],
      count: 1,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].message).toBeNull();
    expect(data.items[0].outcome).toBeNull();
    expect(data.items[0].confidenceScore).toBeNull();
  });

  it("item with empty signals and empty affectedActions does not throw", async () => {
    const dto = {
      items: [{ ...SAMPLE_ALERT_LOW, signals: [], affectedActions: [] }],
      count: 1,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.items[0].signals).toEqual([]);
    expect(data.items[0].affectedActions).toEqual([]);
  });

  it("item with all optional fields present — fields preserved verbatim", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const item = data.items[0];
    // signals is now Signal[] — verify object shape preserved
    expect(Array.isArray(item.signals)).toBe(true);
    expect(item.signals).toHaveLength(2);
    expect(item.signals[0]).toMatchObject({ type: "price_surge", severity: "high", confidence: 0.87 });
    expect(item.signals[1]).toMatchObject({ type: "volume_spike", severity: "medium", confidence: 0.91 });
    expect(item.affectedActions).toHaveLength(2);
    expect(item.affectedActions[0].code).toBe("VCB");
    expect(item.confidenceScore).toBe(0.78);
    expect(item.message).toBe("Khối ngoại bán ròng mạnh — VCB và BID áp lực");
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — Signal object shape correctness (v2 contract)
// ---------------------------------------------------------------------------

describe("fetchAlertsData — signal object shape (v2)", () => {
  it("2-signal row: signals array has 2 objects with type+severity+message+confidence", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(HEALTHY_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const item = data.items[0]; // SAMPLE_ALERT_HIGH — 2 signals
    expect(item.signals).toHaveLength(2);
    const sig0 = item.signals[0];
    const sig1 = item.signals[1];

    // Both signals are objects not strings
    expect(typeof sig0).toBe("object");
    expect(typeof sig1).toBe("object");

    // First signal: price_surge
    expect(sig0.type).toBe("price_surge");
    expect(sig0.severity).toBe("high");
    expect(sig0.confidence).toBe(0.87);
    expect(sig0.message).toContain("VCB");

    // Second signal: volume_spike
    expect(sig1.type).toBe("volume_spike");
    expect(sig1.severity).toBe("medium");
    expect(sig1.confidence).toBe(0.91);
  });

  it("1-signal news_mention row: single signal object", async () => {
    const newsDto = {
      items: [SAMPLE_ALERT_CRITICAL],
      count: 1,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(newsDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const item = data.items[0];
    expect(item.signals).toHaveLength(1);
    expect(item.signals[0].type).toBe("news_mention");
    expect(item.signals[0].severity).toBe("high");
    expect(item.signals[0].confidence).toBe(0.95);
    expect(item.signals[0].message).toContain("HPG");
  });

  it("empty signals[] row: signals array is empty, no crash", async () => {
    const emptySignalsDto = {
      items: [SAMPLE_ALERT_LOW],
      count: 1,
      fetchedAt: FETCHED_AT,
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptySignalsDto), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const item = data.items[0];
    expect(item.signals).toEqual([]);
    expect(data.error).toBeNull();
  });

  it("multi-item DTO: 2-signal row yields 2 distinct signal objects", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MULTI_ITEM_DTO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchAlertsData(ORIGIN);

    const highAlert = data.items.find((i) => i.id === "alert-001");
    expect(highAlert).toBeDefined();
    expect(highAlert!.signals).toHaveLength(2);
    // Distinct types
    const types = highAlert!.signals.map((s) => s.type);
    expect(types).toContain("price_surge");
    expect(types).toContain("volume_spike");
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — signalTypeLabel helper mapping
// ---------------------------------------------------------------------------

describe("signalTypeLabel — Vietnamese label mapping", () => {
  it("maps price_surge to Vietnamese label", () => {
    expect(signalTypeLabel("price_surge")).toBe("Giá tăng mạnh");
  });

  it("maps volume_spike to Vietnamese label", () => {
    expect(signalTypeLabel("volume_spike")).toBe("Khối lượng đột biến");
  });

  it("maps news_mention to Vietnamese label", () => {
    expect(signalTypeLabel("news_mention")).toBe("Tin tức");
  });

  it("falls back to raw type string for unknown type", () => {
    expect(signalTypeLabel("exotic_unknown_type")).toBe("exotic_unknown_type");
  });

  it("returns em-dash for empty string (guard)", () => {
    expect(signalTypeLabel("")).toBe("—");
  });
});
