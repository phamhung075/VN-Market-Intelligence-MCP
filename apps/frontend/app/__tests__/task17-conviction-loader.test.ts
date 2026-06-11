/**
 * task17-conviction-loader.test.ts
 *
 * Regression guards for /dashboard/conviction-history — TASK17-CONVICTION.
 *
 * Guards:
 *   - formatScore(null) === "—"           — NEVER "0.00"
 *   - formatScore(0.5115) → "0.51"        — 2 decimal places
 *   - signalLabel for all 4 values incl. "unknown" → "Không rõ"
 *   - signalColorClass: bullish=emerald, bearish=red, neutral=slate, unknown=zinc/grey
 *   - isStale("2026-04-23", "2026-06-09") === true
 *   - isStale("2026-06-09", "2026-06-09") === false
 *   - partitionSnapshot splits fresh/stale correctly
 *   - empty snapshot → empty-state path (count 0)
 *   - summary avgPeakScore null → formatScore returns "—"
 *
 * Strategy: import named helpers directly (Remix strips loader in jsdom).
 * Same pattern as task17-prediction-claims-loader.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchConvictionData,
  formatScore,
  signalLabel,
  signalColorClass,
  isStale,
  partitionSnapshot,
} from "~/routes/dashboard.conviction-history";

// ---------------------------------------------------------------------------
// Fixtures — seeded from REAL served shape (mixed-date snapshot)
// ---------------------------------------------------------------------------

const ORIGIN = "http://localhost:3001";
const TRADING_DATE = "2026-06-09";

/** Fresh row — date === TRADING_DATE */
const ROW_FRESH_ACB = {
  symbol: "ACB",
  date: "2026-06-09",
  peakScore: 0.72,
  signal: "bullish" as const,
};

/** Fresh row — neutral */
const ROW_FRESH_VCB = {
  symbol: "VCB",
  date: "2026-06-09",
  peakScore: 0.45,
  signal: "neutral" as const,
};

/** Stale row — date !== TRADING_DATE (stopped scoring weeks ago) */
const ROW_STALE_BSR = {
  symbol: "BSR",
  date: "2026-04-23",
  peakScore: 0.58,
  signal: "bearish" as const,
};

/** Unknown-signal row — fresh date, signal=unknown */
const ROW_UNKNOWN_GEX = {
  symbol: "GEX",
  date: "2026-06-09",
  peakScore: 0.31,
  signal: "unknown" as const,
};

/** Full DTO mirroring the real served shape */
const DTO_FULL = {
  generatedAt: "2026-06-11T11:30:02.457Z",
  tradingDate: TRADING_DATE,
  snapshot: [
    ROW_FRESH_ACB,
    ROW_FRESH_VCB,
    ROW_STALE_BSR,
    ROW_UNKNOWN_GEX,
  ],
  series: {
    ACB: [
      { date: "2026-04-01", peakScore: 0.45, signal: "neutral" },
      { date: "2026-05-15", peakScore: 0.60, signal: "bullish" },
      { date: "2026-06-09", peakScore: 0.72, signal: "bullish" },
    ],
    VCB: [
      { date: "2026-06-09", peakScore: 0.45, signal: "neutral" },
    ],
    BSR: [
      { date: "2026-04-23", peakScore: 0.58, signal: "bearish" },
    ],
    GEX: [
      { date: "2026-06-09", peakScore: 0.31, signal: "unknown" },
    ],
  },
  summary: {
    symbols: 4,
    bullish: 1,
    bearish: 1,
    neutral: 1,
    unknown: 1,
    avgPeakScore: 0.515,
    topBullish: [ROW_FRESH_ACB],
    topBearish: [ROW_STALE_BSR],
  },
  count: 4,
};

/** DTO with null avgPeakScore */
const DTO_NULL_AVG = {
  ...DTO_FULL,
  summary: { ...DTO_FULL.summary, avgPeakScore: null },
};

/** Empty DTO */
const DTO_EMPTY = {
  generatedAt: "2026-06-11T11:30:02.457Z",
  tradingDate: "",
  snapshot: [],
  series: {},
  summary: {
    symbols: 0,
    bullish: 0,
    bearish: 0,
    neutral: 0,
    unknown: 0,
    avgPeakScore: null,
    topBullish: [],
    topBearish: [],
  },
  count: 0,
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
// Suite 1 — formatScore
// ---------------------------------------------------------------------------

describe("formatScore — null → '—', numbers to 2 decimals", () => {
  it("null → '—'", () => {
    expect(formatScore(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatScore(undefined)).toBe("—");
  });

  it("null → NOT '0.00'", () => {
    expect(formatScore(null)).not.toBe("0.00");
  });

  it("0.5115 → '0.51' (2 decimal places, truncates)", () => {
    expect(formatScore(0.5115)).toBe("0.51");
  });

  it("0.5115384615384614 → '0.51'", () => {
    expect(formatScore(0.5115384615384614)).toBe("0.51");
  });

  it("0.72 → '0.72'", () => {
    expect(formatScore(0.72)).toBe("0.72");
  });

  it("1.0 → '1.00'", () => {
    expect(formatScore(1.0)).toBe("1.00");
  });

  it("0 (explicit zero) → '0.00', NOT '—'", () => {
    expect(formatScore(0)).toBe("0.00");
    expect(formatScore(0)).not.toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — signalLabel (all 4 values including unknown)
// ---------------------------------------------------------------------------

describe("signalLabel — all 4 VN labels", () => {
  it("'bullish' → 'Tăng'", () => {
    expect(signalLabel("bullish")).toBe("Tăng");
  });

  it("'bearish' → 'Giảm'", () => {
    expect(signalLabel("bearish")).toBe("Giảm");
  });

  it("'neutral' → 'Trung lập'", () => {
    expect(signalLabel("neutral")).toBe("Trung lập");
  });

  it("'unknown' → 'Không rõ' (honest, NOT hidden)", () => {
    expect(signalLabel("unknown")).toBe("Không rõ");
  });

  it("unknown signal → NOT empty string", () => {
    expect(signalLabel("unknown")).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — signalColorClass
// ---------------------------------------------------------------------------

describe("signalColorClass — colour mapping", () => {
  it("'bullish' badge contains 'emerald' (green)", () => {
    expect(signalColorClass("bullish").badge).toContain("emerald");
  });

  it("'bearish' badge contains 'red'", () => {
    expect(signalColorClass("bearish").badge).toContain("red");
  });

  it("'neutral' badge contains 'slate'", () => {
    expect(signalColorClass("neutral").badge).toContain("slate");
  });

  it("'neutral' badge does NOT contain 'red'", () => {
    expect(signalColorClass("neutral").badge).not.toContain("red");
  });

  it("'unknown' badge does NOT contain 'red' (not an error state)", () => {
    expect(signalColorClass("unknown").badge).not.toContain("red");
  });

  it("'unknown' badge does NOT contain 'emerald'", () => {
    expect(signalColorClass("unknown").badge).not.toContain("emerald");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — isStale
// ---------------------------------------------------------------------------

describe("isStale — freshness check", () => {
  it("isStale('2026-04-23', '2026-06-09') === true (stale BSR)", () => {
    expect(isStale("2026-04-23", "2026-06-09")).toBe(true);
  });

  it("isStale('2026-06-09', '2026-06-09') === false (fresh row)", () => {
    expect(isStale("2026-06-09", "2026-06-09")).toBe(false);
  });

  it("empty tradingDate → stale (no global reference)", () => {
    expect(isStale("2026-06-09", "")).toBe(true);
  });

  it("empty rowDate → stale", () => {
    expect(isStale("", "2026-06-09")).toBe(true);
  });

  it("matching dates on any day → fresh", () => {
    expect(isStale("2026-04-23", "2026-04-23")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — partitionSnapshot
// ---------------------------------------------------------------------------

describe("partitionSnapshot — splits fresh vs stale correctly", () => {
  const snapshot = [
    ROW_FRESH_ACB,
    ROW_FRESH_VCB,
    ROW_STALE_BSR,
    ROW_UNKNOWN_GEX,
  ];

  it("fresh partition contains only rows with date === tradingDate", () => {
    const { fresh } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(fresh.every((r) => r.date === TRADING_DATE)).toBe(true);
  });

  it("stale partition contains only rows with date !== tradingDate", () => {
    const { stale } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(stale.every((r) => r.date !== TRADING_DATE)).toBe(true);
  });

  it("ACB (fresh) appears in fresh, not stale", () => {
    const { fresh, stale } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(fresh.some((r) => r.symbol === "ACB")).toBe(true);
    expect(stale.some((r) => r.symbol === "ACB")).toBe(false);
  });

  it("BSR (stale 2026-04-23) appears in stale, not fresh", () => {
    const { fresh, stale } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(stale.some((r) => r.symbol === "BSR")).toBe(true);
    expect(fresh.some((r) => r.symbol === "BSR")).toBe(false);
  });

  it("unknown-signal GEX (fresh date) appears in fresh, not stale", () => {
    const { fresh, stale } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(fresh.some((r) => r.symbol === "GEX")).toBe(true);
    expect(stale.some((r) => r.symbol === "GEX")).toBe(false);
  });

  it("total fresh + stale === snapshot.length (no rows lost)", () => {
    const { fresh, stale } = partitionSnapshot(snapshot, TRADING_DATE);
    expect(fresh.length + stale.length).toBe(snapshot.length);
  });

  it("empty snapshot → both partitions empty", () => {
    const { fresh, stale } = partitionSnapshot([], TRADING_DATE);
    expect(fresh).toHaveLength(0);
    expect(stale).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — fetchConvictionData: happy path
// ---------------------------------------------------------------------------

describe("fetchConvictionData — 200 valid DTO", () => {
  it("returns snapshot + summary, error null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_FULL), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.count).toBe(4);
    expect(data.snapshot).toHaveLength(4);
    expect(data.tradingDate).toBe(TRADING_DATE);
  });

  it("summary block parsed correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_FULL), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.summary.symbols).toBe(4);
    expect(data.summary.bullish).toBe(1);
    expect(data.summary.bearish).toBe(1);
    expect(data.summary.neutral).toBe(1);
    expect(data.summary.unknown).toBe(1);
    expect(data.summary.avgPeakScore).toBeCloseTo(0.515);
  });

  it("series block preserved", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_FULL), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(Array.isArray(data.series["ACB"])).toBe(true);
    expect(data.series["ACB"]).toHaveLength(3);
  });

  it("topBullish and topBearish preserved", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_FULL), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.summary.topBullish).toHaveLength(1);
    expect(data.summary.topBullish[0].symbol).toBe("ACB");
    expect(data.summary.topBearish[0].symbol).toBe("BSR");
  });

  it("forwards limit and symbol in query string", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(DTO_FULL), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await fetchConvictionData(ORIGIN, { limit: 100, symbol: "ACB" });

    expect(capturedUrl).toContain("limit=100");
    expect(capturedUrl).toContain("symbol=ACB");
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — CRITICAL: avgPeakScore null
// ---------------------------------------------------------------------------

describe("CRITICAL: avgPeakScore null → formatScore returns '—'", () => {
  it("avgPeakScore null preserved in loader (not coerced to 0)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_NULL_AVG), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.summary.avgPeakScore).toBeNull();
  });

  it("formatScore(null avgPeakScore from loader) → '—', NEVER '0.00'", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_NULL_AVG), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    const rendered = formatScore(data.summary.avgPeakScore);
    expect(rendered).toBe("—");
    expect(rendered).not.toBe("0.00");
    expect(rendered).not.toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — Empty state
// ---------------------------------------------------------------------------

describe("fetchConvictionData — empty state", () => {
  it("snapshot:[] + count 0 → error null, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_EMPTY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.error).toBeNull();
    expect(data.snapshot).toEqual([]);
    expect(data.count).toBe(0);
    expect(data.tradingDate).toBe("");
  });

  it("empty tradingDate → partitionSnapshot produces empty fresh+stale", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DTO_EMPTY), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);
    const { fresh, stale } = partitionSnapshot(
      data.snapshot,
      data.tradingDate
    );

    expect(fresh).toHaveLength(0);
    expect(stale).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — Non-fatal: upstream HTTP errors
// ---------------------------------------------------------------------------

describe("fetchConvictionData — upstream HTTP error (non-fatal)", () => {
  it("502 upstream → snapshot empty + error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.snapshot).toEqual([]);
    expect(data.error).not.toBeNull();
    expect(data.error).toMatch(/502/);
  });

  it("summary is zeroed on upstream error", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 500, statusText: "Internal Server Error" })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.summary.symbols).toBe(0);
    expect(data.summary.avgPeakScore).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — Non-fatal: network failure
// ---------------------------------------------------------------------------

describe("fetchConvictionData — network failure (non-fatal)", () => {
  it("Error instance → message preserved, snapshot empty, no throw", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const data = await fetchConvictionData(ORIGIN);

    expect(data.snapshot).toEqual([]);
    expect(data.error).toBe("ECONNREFUSED");
  });

  it("non-Error throw → fallback Vietnamese message", async () => {
    global.fetch = vi.fn().mockRejectedValue("unknown string error");

    const data = await fetchConvictionData(ORIGIN);

    expect(data.error).toBe(
      "Không thể kết nối tới máy chủ dữ liệu niềm tin AI"
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — Unexpected JSON shape guard
// ---------------------------------------------------------------------------

describe("fetchConvictionData — unexpected JSON shape (non-fatal)", () => {
  it("null body → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.snapshot).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });

  it("object without 'snapshot' key → error string, no throw", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "no snapshot here" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await fetchConvictionData(ORIGIN);

    expect(data.snapshot).toEqual([]);
    expect(data.error).toContain("Unexpected response shape");
  });
});

// ---------------------------------------------------------------------------
// Suite 12 — partitionSnapshot with realistic 52-symbol-like mixed-date data
// ---------------------------------------------------------------------------

describe("partitionSnapshot — realistic mixed-date snapshot", () => {
  // Simulate the real served payload: some fresh (2026-06-09), some stale (2026-04-23)
  const MIXED_SNAPSHOT = [
    { symbol: "ACB", date: "2026-06-09", peakScore: 0.72, signal: "bullish" as const },
    { symbol: "VCB", date: "2026-06-09", peakScore: 0.65, signal: "neutral" as const },
    { symbol: "FPT", date: "2026-06-09", peakScore: 0.80, signal: "bullish" as const },
    { symbol: "HPG", date: "2026-06-09", peakScore: 0.41, signal: "bearish" as const },
    { symbol: "MBB", date: "2026-06-09", peakScore: 0.55, signal: "neutral" as const },
    // Stale rows
    { symbol: "BSR", date: "2026-04-23", peakScore: 0.58, signal: "bearish" as const },
    { symbol: "GEX", date: "2026-04-23", peakScore: 0.33, signal: "unknown" as const },
    { symbol: "HUT", date: "2026-04-23", peakScore: 0.49, signal: "neutral" as const },
    { symbol: "SAB", date: "2026-04-23", peakScore: 0.61, signal: "bearish" as const },
  ];

  it("fresh partition has exactly 5 rows (date=2026-06-09)", () => {
    const { fresh } = partitionSnapshot(MIXED_SNAPSHOT, "2026-06-09");
    expect(fresh).toHaveLength(5);
  });

  it("stale partition has exactly 4 rows (date=2026-04-23)", () => {
    const { stale } = partitionSnapshot(MIXED_SNAPSHOT, "2026-06-09");
    expect(stale).toHaveLength(4);
  });

  it("stale symbols are BSR, GEX, HUT, SAB", () => {
    const { stale } = partitionSnapshot(MIXED_SNAPSHOT, "2026-06-09");
    const staleSymbols = stale.map((r) => r.symbol).sort();
    expect(staleSymbols).toEqual(["BSR", "GEX", "HUT", "SAB"]);
  });

  it("no row is lost — total = 9", () => {
    const { fresh, stale } = partitionSnapshot(MIXED_SNAPSHOT, "2026-06-09");
    expect(fresh.length + stale.length).toBe(9);
  });
});
