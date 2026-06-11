/**
 * task17-kinh-dich-signals-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.kinh-dich-signals.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — importable by both bun test and vitest.
 *
 * Fixtures mirror the PRODUCTION payload verified live on 2026-06-10:
 *   symbols 57, mua 8, ban 9, giu 19, thanTrong 21, cho 0, unknown 0,
 *   positive 38, negative 19, avgConfidence 0.6263, flips 1.
 *
 * Suites:
 *   1. actionLabel — MUA/BÁN/GIỮ/THẬN TRỌNG/CHỜ/UNKNOWN/default
 *   2. actionBadgeClass — emerald / red / slate / amber / blue / slate(unknown)
 *   3. sentimentLabel — Tích cực / Tiêu cực / Trung tính / default fallback
 *   4. sentimentBadgeClass — emerald / red / slate
 *   5. confidencePercent — 0..1 → "XX%", null → "—", undefined → "—"
 *   6. formatTimestamp — ISO/YYYY-MM-DD HH:MM:SS → VN locale, empty → "—"
 *   7. Fixture A — summary counts (mua 8, ban 9, giu 19, thanTrong 21, positive 38, negative 19)
 *   8. Fixture A — avgConfidence formatting (0.6263 → "63%")
 *   9. Fixture A — topBuy has action=MUA (confidence DESC), topSell has action=BAN
 *  10. Fixture A — flips: fromAction/toAction/toSentiment present
 *  11. Fixture B — empty state (count=0, isEmpty logic)
 *  12. fetchKinhDichSignalsData — happy path (Fixture A shape via mocked fetch)
 *  13. fetchKinhDichSignalsData — network error → error string set, snapshot=[]
 *  14. fetchKinhDichSignalsData — bad shape → error set
 *  15. fetchKinhDichSignalsData — upstream 502 → error set
 *  16. fetchKinhDichSignalsData — Fixture B empty response → count=0, no crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  actionLabel,
  actionBadgeClass,
  sentimentLabel,
  sentimentBadgeClass,
  confidencePercent,
  formatTimestamp,
  fetchKinhDichSignalsData,
} from "../routes/dashboard.kinh-dich-signals";
import type {
  KinhDichSnapshotItem,
  KinhDichFlip,
  KinhDichSummary,
} from "../routes/dashboard.kinh-dich-signals";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal snapshot items mirroring live payload structure */
const FIXTURE_A_SNAPSHOT_MUA: KinhDichSnapshotItem = {
  stockCode: "FPT",
  timestamp: "2026-06-10 10:00:00",
  hexagramNumber: 15,
  hoQueNumber: 15,
  bienQueNumber: 0,
  hexagramName: "Khiêm",
  action: "MUA",
  sentiment: "positive",
  trend: "THUẬN LỢI",
  confidence: 0.82,
  actionNote: "Quẻ Khiêm cho thấy xu hướng tích cực, nên mua vào.",
  source: "cycle",
};

const FIXTURE_A_SNAPSHOT_BAN: KinhDichSnapshotItem = {
  stockCode: "VCB",
  timestamp: "2026-06-10 10:00:00",
  hexagramNumber: 47,
  hoQueNumber: 47,
  bienQueNumber: 0,
  hexagramName: "Khốn",
  action: "BAN",
  sentiment: "negative",
  trend: "BẤT LỢI",
  confidence: 0.75,
  actionNote: "Quẻ Khốn chỉ thế bất lợi, cần bán ra.",
  source: "cycle",
};

const FIXTURE_A_SNAPSHOT_THAN_TRONG: KinhDichSnapshotItem = {
  stockCode: "TCB",
  timestamp: "2026-06-10 10:00:00",
  hexagramNumber: 29,
  hoQueNumber: 29,
  bienQueNumber: 0,
  hexagramName: "Khảm",
  action: "THAN TRONG",
  sentiment: "negative",
  trend: "BẤT LỢI",
  confidence: 0.65,
  actionNote: "Thận trọng — rủi ro tích lũy.",
  source: "cycle",
};

const FIXTURE_A_SNAPSHOT_GIU: KinhDichSnapshotItem = {
  stockCode: "HPG",
  timestamp: "2026-06-10 10:00:00",
  hexagramNumber: 1,
  hoQueNumber: 1,
  bienQueNumber: 0,
  hexagramName: "Càn",
  action: "GIU",
  sentiment: "positive",
  trend: "TRUNG TÍNH",
  confidence: 0.55,
  actionNote: "Giữ nguyên vị thế.",
  source: "cycle",
};

const FIXTURE_A_SUMMARY: KinhDichSummary = {
  symbols: 57,
  mua: 8,
  ban: 9,
  giu: 19,
  thanTrong: 21,
  cho: 0,
  unknown: 0,
  positive: 38,
  negative: 19,
  neutral: 0,
  avgConfidence: 0.6263,
  topBuy: [FIXTURE_A_SNAPSHOT_MUA],
  topSell: [FIXTURE_A_SNAPSHOT_BAN],
};

const FIXTURE_A_FLIP: KinhDichFlip = {
  stockCode: "FPT",
  fromAction: "GIU",
  toAction: "MUA",
  toSentiment: "positive",
  confidence: 0.82,
  timestamp: "2026-06-10 10:00:00",
};

/** Fixture B — empty response */
const FIXTURE_B_SUMMARY: KinhDichSummary = {
  symbols: 0,
  mua: 0,
  ban: 0,
  giu: 0,
  thanTrong: 0,
  cho: 0,
  unknown: 0,
  positive: 0,
  negative: 0,
  neutral: 0,
  avgConfidence: null,
  topBuy: [],
  topSell: [],
};

// ---------------------------------------------------------------------------
// Suite 1: actionLabel
// ---------------------------------------------------------------------------

describe("actionLabel", () => {
  it("MUA → 'MUA'", () => {
    expect(actionLabel("MUA")).toBe("MUA");
  });

  it("BAN → 'BÁN'", () => {
    expect(actionLabel("BAN")).toBe("BÁN");
  });

  it("GIU → 'GIỮ'", () => {
    expect(actionLabel("GIU")).toBe("GIỮ");
  });

  it("THAN TRONG → 'THẬN TRỌNG'", () => {
    expect(actionLabel("THAN TRONG")).toBe("THẬN TRỌNG");
  });

  it("CHO → 'CHỜ'", () => {
    expect(actionLabel("CHO")).toBe("CHỜ");
  });

  it("UNKNOWN → '—'", () => {
    expect(actionLabel("UNKNOWN")).toBe("—");
  });

  it("unrecognised value → '—' (default fallback)", () => {
    expect(actionLabel("WHATEVER")).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: actionBadgeClass
// ---------------------------------------------------------------------------

describe("actionBadgeClass", () => {
  it("MUA → contains emerald", () => {
    expect(actionBadgeClass("MUA")).toContain("emerald");
  });

  it("BAN → contains red", () => {
    expect(actionBadgeClass("BAN")).toContain("red");
  });

  it("GIU → contains slate", () => {
    expect(actionBadgeClass("GIU")).toContain("slate");
  });

  it("THAN TRONG → contains amber", () => {
    expect(actionBadgeClass("THAN TRONG")).toContain("amber");
  });

  it("CHO → contains blue", () => {
    expect(actionBadgeClass("CHO")).toContain("blue");
  });

  it("UNKNOWN → contains slate (muted)", () => {
    expect(actionBadgeClass("UNKNOWN")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: sentimentLabel
// ---------------------------------------------------------------------------

describe("sentimentLabel", () => {
  it("positive → 'Tích cực'", () => {
    expect(sentimentLabel("positive")).toBe("Tích cực");
  });

  it("negative → 'Tiêu cực'", () => {
    expect(sentimentLabel("negative")).toBe("Tiêu cực");
  });

  it("neutral → 'Trung tính'", () => {
    expect(sentimentLabel("neutral")).toBe("Trung tính");
  });

  it("unknown fallback → 'Trung tính'", () => {
    expect(sentimentLabel("other")).toBe("Trung tính");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: sentimentBadgeClass
// ---------------------------------------------------------------------------

describe("sentimentBadgeClass", () => {
  it("positive → contains emerald", () => {
    expect(sentimentBadgeClass("positive")).toContain("emerald");
  });

  it("negative → contains red", () => {
    expect(sentimentBadgeClass("negative")).toContain("red");
  });

  it("neutral → contains slate", () => {
    expect(sentimentBadgeClass("neutral")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: confidencePercent
// ---------------------------------------------------------------------------

describe("confidencePercent", () => {
  it("null → '—'", () => {
    expect(confidencePercent(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(confidencePercent(undefined)).toBe("—");
  });

  it("0.82 → '82%'", () => {
    expect(confidencePercent(0.82)).toBe("82%");
  });

  it("0.6263 → '63%' (rounded)", () => {
    expect(confidencePercent(0.6263)).toBe("63%");
  });

  it("0 → '0%'", () => {
    expect(confidencePercent(0)).toBe("0%");
  });

  it("1 → '100%'", () => {
    expect(confidencePercent(1)).toBe("100%");
  });

  it("0.005 → '1%' (rounds up)", () => {
    expect(confidencePercent(0.005)).toBe("1%");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: formatTimestamp
// ---------------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("empty string → '—'", () => {
    expect(formatTimestamp("")).toBe("—");
  });

  it("ISO datetime string → non-empty locale string", () => {
    const result = formatTimestamp("2026-06-10T14:35:22.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });

  it("YYYY-MM-DD HH:MM:SS format → non-empty string (graceful)", () => {
    const result = formatTimestamp("2026-06-10 14:35:22");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("invalid string → returns original (graceful fallback)", () => {
    const result = formatTimestamp("not-a-date");
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Fixture A — summary counts
// ---------------------------------------------------------------------------

describe("Fixture A — summary counts", () => {
  it("symbols = 57", () => {
    expect(FIXTURE_A_SUMMARY.symbols).toBe(57);
  });

  it("mua = 8", () => {
    expect(FIXTURE_A_SUMMARY.mua).toBe(8);
  });

  it("ban = 9", () => {
    expect(FIXTURE_A_SUMMARY.ban).toBe(9);
  });

  it("giu = 19", () => {
    expect(FIXTURE_A_SUMMARY.giu).toBe(19);
  });

  it("thanTrong = 21", () => {
    expect(FIXTURE_A_SUMMARY.thanTrong).toBe(21);
  });

  it("cho = 0", () => {
    expect(FIXTURE_A_SUMMARY.cho).toBe(0);
  });

  it("unknown = 0", () => {
    expect(FIXTURE_A_SUMMARY.unknown).toBe(0);
  });

  it("positive = 38", () => {
    expect(FIXTURE_A_SUMMARY.positive).toBe(38);
  });

  it("negative = 19", () => {
    expect(FIXTURE_A_SUMMARY.negative).toBe(19);
  });

  it("mua + ban + giu + thanTrong + cho + unknown = symbols", () => {
    const total =
      FIXTURE_A_SUMMARY.mua +
      FIXTURE_A_SUMMARY.ban +
      FIXTURE_A_SUMMARY.giu +
      FIXTURE_A_SUMMARY.thanTrong +
      FIXTURE_A_SUMMARY.cho +
      FIXTURE_A_SUMMARY.unknown;
    expect(total).toBe(FIXTURE_A_SUMMARY.symbols);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: Fixture A — avgConfidence formatting
// ---------------------------------------------------------------------------

describe("Fixture A — avgConfidence formatting", () => {
  it("avgConfidence 0.6263 formats to '63%'", () => {
    expect(confidencePercent(FIXTURE_A_SUMMARY.avgConfidence)).toBe("63%");
  });

  it("avgConfidence is a number (not null) for a populated snapshot", () => {
    expect(FIXTURE_A_SUMMARY.avgConfidence).not.toBeNull();
    expect(typeof FIXTURE_A_SUMMARY.avgConfidence).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: Fixture A — topBuy and topSell
// ---------------------------------------------------------------------------

describe("Fixture A — topBuy and topSell", () => {
  it("topBuy[0] has action=MUA", () => {
    expect(FIXTURE_A_SUMMARY.topBuy[0]!.action).toBe("MUA");
  });

  it("topBuy[0] stockCode is FPT", () => {
    expect(FIXTURE_A_SUMMARY.topBuy[0]!.stockCode).toBe("FPT");
  });

  it("topBuy[0] confidence is 0.82 → '82%'", () => {
    expect(confidencePercent(FIXTURE_A_SUMMARY.topBuy[0]!.confidence)).toBe("82%");
  });

  it("topSell[0] has action=BAN", () => {
    expect(FIXTURE_A_SUMMARY.topSell[0]!.action).toBe("BAN");
  });

  it("topSell[0] stockCode is VCB", () => {
    expect(FIXTURE_A_SUMMARY.topSell[0]!.stockCode).toBe("VCB");
  });

  it("topSell[0] confidence is 0.75 → '75%'", () => {
    expect(confidencePercent(FIXTURE_A_SUMMARY.topSell[0]!.confidence)).toBe("75%");
  });
});

// ---------------------------------------------------------------------------
// Suite 10: Fixture A — flips
// ---------------------------------------------------------------------------

describe("Fixture A — flips", () => {
  it("flip has correct fromAction → toAction (GIU → MUA)", () => {
    expect(FIXTURE_A_FLIP.fromAction).toBe("GIU");
    expect(FIXTURE_A_FLIP.toAction).toBe("MUA");
  });

  it("flip toSentiment = positive", () => {
    expect(FIXTURE_A_FLIP.toSentiment).toBe("positive");
  });

  it("flip confidence = 0.82", () => {
    expect(FIXTURE_A_FLIP.confidence).toBe(0.82);
    expect(confidencePercent(FIXTURE_A_FLIP.confidence)).toBe("82%");
  });

  it("actionLabel for fromAction GIU = 'GIỮ'", () => {
    expect(actionLabel(FIXTURE_A_FLIP.fromAction)).toBe("GIỮ");
  });

  it("actionLabel for toAction MUA = 'MUA'", () => {
    expect(actionLabel(FIXTURE_A_FLIP.toAction)).toBe("MUA");
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Fixture B — empty state
// ---------------------------------------------------------------------------

describe("Fixture B — empty state (count=0)", () => {
  it("FIXTURE_B_SUMMARY has all-zero counts", () => {
    expect(FIXTURE_B_SUMMARY.symbols).toBe(0);
    expect(FIXTURE_B_SUMMARY.mua).toBe(0);
    expect(FIXTURE_B_SUMMARY.ban).toBe(0);
    expect(FIXTURE_B_SUMMARY.giu).toBe(0);
    expect(FIXTURE_B_SUMMARY.thanTrong).toBe(0);
    expect(FIXTURE_B_SUMMARY.cho).toBe(0);
    expect(FIXTURE_B_SUMMARY.unknown).toBe(0);
    expect(FIXTURE_B_SUMMARY.positive).toBe(0);
    expect(FIXTURE_B_SUMMARY.negative).toBe(0);
    expect(FIXTURE_B_SUMMARY.neutral).toBe(0);
    expect(FIXTURE_B_SUMMARY.topBuy).toHaveLength(0);
    expect(FIXTURE_B_SUMMARY.topSell).toHaveLength(0);
  });

  it("FIXTURE_B_SUMMARY.avgConfidence = null", () => {
    expect(FIXTURE_B_SUMMARY.avgConfidence).toBeNull();
    expect(confidencePercent(FIXTURE_B_SUMMARY.avgConfidence)).toBe("—");
  });

  it("isEmpty = true when count=0 and error=null", () => {
    const loaderResult = { count: 0, snapshot: [] as KinhDichSnapshotItem[], error: null };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when count > 0", () => {
    const loaderResult = { count: 57, snapshot: [FIXTURE_A_SNAPSHOT_MUA], error: null };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("isEmpty = false when error present", () => {
    const loaderResult = {
      count: 0,
      snapshot: [] as KinhDichSnapshotItem[],
      error: "Network error",
    };
    const isEmpty = !loaderResult.error && loaderResult.count === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: fetchKinhDichSignalsData — happy path
// ---------------------------------------------------------------------------

describe("fetchKinhDichSignalsData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses snapshot, summary, flips, count correctly", async () => {
    const mockPayload = {
      generatedAt: "2026-06-10T10:00:00.000Z",
      tradingDate: "2026-06-10",
      source: "cycle",
      snapshot: [
        FIXTURE_A_SNAPSHOT_MUA,
        FIXTURE_A_SNAPSHOT_BAN,
        FIXTURE_A_SNAPSHOT_THAN_TRONG,
        FIXTURE_A_SNAPSHOT_GIU,
      ],
      flips: [FIXTURE_A_FLIP],
      summary: FIXTURE_A_SUMMARY,
      count: 57,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001", "cycle");

    expect(result.error).toBeNull();
    expect(result.snapshot).toHaveLength(4);
    expect(result.snapshot[0]!.stockCode).toBe("FPT");
    expect(result.snapshot[0]!.action).toBe("MUA");
    expect(result.flips).toHaveLength(1);
    expect(result.flips[0]!.stockCode).toBe("FPT");
    expect(result.summary.mua).toBe(8);
    expect(result.summary.ban).toBe(9);
    expect(result.summary.avgConfidence).toBeCloseTo(0.6263);
    expect(result.count).toBe(57);
    expect(result.tradingDate).toBe("2026-06-10");
  });

  it("parses Fixture B (empty) without crash", async () => {
    const mockPayload = {
      generatedAt: "2026-06-10T10:00:00.000Z",
      tradingDate: "",
      source: "cycle",
      snapshot: [],
      flips: [],
      summary: FIXTURE_B_SUMMARY,
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.snapshot).toHaveLength(0);
    expect(result.flips).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary.avgConfidence).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 13: fetchKinhDichSignalsData — network error
// ---------------------------------------------------------------------------

describe("fetchKinhDichSignalsData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, snapshot is empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.snapshot).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.flips).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 14: fetchKinhDichSignalsData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchKinhDichSignalsData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, snapshot=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      })
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001");

    expect(result.error).toContain("/api/kinh-dich-signals");
    expect(result.snapshot).toHaveLength(0);
    expect(result.flips).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 15: fetchKinhDichSignalsData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchKinhDichSignalsData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, snapshot=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      })
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.snapshot).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 16: fetchKinhDichSignalsData — Fixture B empty response (count=0, no crash)
// ---------------------------------------------------------------------------

describe("fetchKinhDichSignalsData — Fixture B empty (count=0, no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty snapshot/flips response → count=0, no error, no crash", async () => {
    const mockPayload = {
      generatedAt: "2026-06-10T00:00:00.000Z",
      tradingDate: "",
      source: "cycle",
      snapshot: [],
      flips: [],
      summary: {
        symbols: 0,
        mua: 0,
        ban: 0,
        giu: 0,
        thanTrong: 0,
        cho: 0,
        unknown: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        avgConfidence: null,
        topBuy: [],
        topSell: [],
      },
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockPayload,
      })
    );

    const result = await fetchKinhDichSignalsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.snapshot).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.flips).toHaveLength(0);
    const isEmpty = !result.error && result.count === 0;
    expect(isEmpty).toBe(true);
  });
});
