/**
 * task17-global-markets-loader.test.ts
 *
 * PURE-LOGIC unit tests for dashboard.global-markets.tsx helpers + data shaping.
 * No .tsx render, no jsdom required — pure TypeScript, importable by vitest.
 *
 * Fixtures mirror the PRODUCTION payload shape verified live on 2026-06-11:
 *   generatedAt, currentAt, source, window=7,
 *   12 indicators across commodities/equities/fx_rates,
 *   series { [key]: [{t, v}] }, summary { vix, vixBand, riskTone, topMovers }
 *
 * Suites:
 *   1. formatDelta — null → "—", positive → "+", negative → "-", zero → "0.00"
 *   2. formatPct   — null → "—", positive → "+X.XX%", negative → "-X.XX%"
 *   3. vixBandLabel — low/elevated/high/null
 *   4. vixBandClass — emerald/amber/red/slate
 *   5. riskToneLabel — risk-on/risk-off/neutral/null
 *   6. riskToneClass — emerald/red/slate
 *   7. directionArrow — up/down/flat
 *   8. directionClass — emerald/red/slate
 *   9. groupLabel — commodities/equities/fx_rates
 *  10. buildSparklinePath — empty → "", <2pts → "", normal → space-separated pairs
 *  11. Fixture A — 12 indicators (4 commodities, 3 equities, 5 fx_rates)
 *  12. Fixture A — null delta fields render as "—" (NEVER fabricate -100%)
 *  13. Fixture A — 3-group split by `group` field
 *  14. Fixture A — isEmpty = false (count=12)
 *  15. Fixture B — isEmpty = true (count=0)
 *  16. fetchGlobalMarketsData — happy path (Fixture A shape via mocked fetch)
 *  17. fetchGlobalMarketsData — network error → error string set, indicators=[]
 *  18. fetchGlobalMarketsData — bad shape → error set
 *  19. fetchGlobalMarketsData — upstream 502 → error set
 *  20. fetchGlobalMarketsData — Fixture B empty response → count=0, no crash
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatDelta,
  formatPct,
  vixBandLabel,
  vixBandClass,
  riskToneLabel,
  riskToneClass,
  directionArrow,
  directionClass,
  groupLabel,
  buildSparklinePath,
  fetchGlobalMarketsData,
} from "../routes/dashboard.global-markets";
import type {
  GlobalIndicator,
  GlobalSummary,
  SeriesPoint,
  GlobalMarketsDto,
} from "../routes/dashboard.global-markets";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_A_INDICATORS: GlobalIndicator[] = [
  // commodities (4)
  {
    key: "brent_crude_usd",
    label: "Dầu Brent",
    unit: "USD/thùng",
    group: "commodities",
    current: 78.45,
    prev24h: 77.8,
    delta24h: 0.65,
    deltaPct24h: 0.84,
    direction24h: "up",
    prev7d: 76.2,
    delta7d: 2.25,
    deltaPct7d: 2.95,
    direction7d: "up",
  },
  {
    key: "gold_usd_per_oz",
    label: "Vàng",
    unit: "USD/oz",
    group: "commodities",
    current: 2320.5,
    prev24h: 2335.0,
    delta24h: -14.5,
    deltaPct24h: -0.62,
    direction24h: "down",
    prev7d: 2300.0,
    delta7d: 20.5,
    deltaPct7d: 0.89,
    direction7d: "up",
  },
  {
    key: "copper_usd",
    label: "Đồng",
    unit: "USD/lb",
    group: "commodities",
    current: 4.52,
    prev24h: null,
    delta24h: null,
    deltaPct24h: null,
    direction24h: "flat",
    prev7d: 4.41,
    delta7d: 0.11,
    deltaPct7d: 2.49,
    direction7d: "up",
  },
  {
    key: "silver_usd_per_oz",
    label: "Bạc",
    unit: "USD/oz",
    group: "commodities",
    current: 29.8,
    prev24h: 30.1,
    delta24h: -0.3,
    deltaPct24h: -1.0,
    direction24h: "down",
    prev7d: 28.9,
    delta7d: 0.9,
    deltaPct7d: 3.11,
    direction7d: "up",
  },
  // equities (3)
  {
    key: "sp500",
    label: "S&P 500 (Mỹ)",
    unit: "điểm",
    group: "equities",
    current: 5234.5,
    prev24h: 5210.0,
    delta24h: 24.5,
    deltaPct24h: 0.47,
    direction24h: "up",
    prev7d: 5180.0,
    delta7d: 54.5,
    deltaPct7d: 1.05,
    direction7d: "up",
  },
  {
    key: "shanghai_comp",
    label: "Shanghai (TQ)",
    unit: "điểm",
    group: "equities",
    current: 3115.2,
    prev24h: 3098.4,
    delta24h: 16.8,
    deltaPct24h: 0.54,
    direction24h: "up",
    prev7d: 3050.0,
    delta7d: 65.2,
    deltaPct7d: 2.14,
    direction7d: "up",
  },
  {
    key: "hang_seng",
    label: "Hang Seng (HK)",
    unit: "điểm",
    group: "equities",
    current: 18520.3,
    prev24h: 18350.0,
    delta24h: 170.3,
    deltaPct24h: 0.93,
    direction24h: "up",
    prev7d: null,
    delta7d: null,
    deltaPct7d: null,
    direction7d: "flat",
  },
  // fx_rates (5)
  {
    key: "vix",
    label: "VIX (chỉ số sợ hãi)",
    unit: "",
    group: "fx_rates",
    current: 14.32,
    prev24h: 15.1,
    delta24h: -0.78,
    deltaPct24h: -5.16,
    direction24h: "down",
    prev7d: 18.5,
    delta7d: -4.18,
    deltaPct7d: -22.59,
    direction7d: "down",
  },
  {
    key: "dxy",
    label: "DXY (sức mạnh USD)",
    unit: "",
    group: "fx_rates",
    current: 104.2,
    prev24h: 103.9,
    delta24h: 0.3,
    deltaPct24h: 0.29,
    direction24h: "up",
    prev7d: 105.0,
    delta7d: -0.8,
    deltaPct7d: -0.76,
    direction7d: "down",
  },
  {
    key: "usd_vnd_rate",
    label: "USD/VND",
    unit: "đồng",
    group: "fx_rates",
    current: 25400,
    prev24h: 25380,
    delta24h: 20,
    deltaPct24h: 0.08,
    direction24h: "up",
    prev7d: 25350,
    delta7d: 50,
    deltaPct7d: 0.2,
    direction7d: "up",
  },
  {
    key: "jpy_vnd_rate",
    label: "JPY/VND",
    unit: "đồng",
    group: "fx_rates",
    current: 165.3,
    prev24h: null,
    delta24h: null,
    deltaPct24h: null,
    direction24h: "flat",
    prev7d: 163.5,
    delta7d: 1.8,
    deltaPct7d: 1.1,
    direction7d: "up",
  },
  {
    key: "us10y_yield",
    label: "Lợi suất TPCP Mỹ 10N",
    unit: "%",
    group: "fx_rates",
    current: 4.42,
    prev24h: 4.38,
    delta24h: 0.04,
    deltaPct24h: 0.91,
    direction24h: "up",
    prev7d: 4.55,
    delta7d: -0.13,
    deltaPct7d: -2.86,
    direction7d: "down",
  },
];

const FIXTURE_A_SUMMARY: GlobalSummary = {
  vix: 14.32,
  vixBand: "low",
  riskTone: "risk-on",
  topMovers: [
    {
      key: "hang_seng",
      label: "Hang Seng (HK)",
      deltaPct24h: 0.93,
      direction24h: "up",
    },
    {
      key: "shanghai_comp",
      label: "Shanghai (TQ)",
      deltaPct24h: 0.54,
      direction24h: "up",
    },
    {
      key: "sp500",
      label: "S&P 500 (Mỹ)",
      deltaPct24h: 0.47,
      direction24h: "up",
    },
    {
      key: "vix",
      label: "VIX (chỉ số sợ hãi)",
      deltaPct24h: -5.16,
      direction24h: "down",
    },
    {
      key: "brent_crude_usd",
      label: "Dầu Brent",
      deltaPct24h: 0.84,
      direction24h: "up",
    },
  ],
};

const FIXTURE_A_SERIES: Record<string, SeriesPoint[]> = {
  brent_crude_usd: [
    { t: "2026-06-04T14:00:00Z", v: 76.2 },
    { t: "2026-06-05T14:00:00Z", v: 76.8 },
    { t: "2026-06-06T14:00:00Z", v: 77.1 },
    { t: "2026-06-07T14:00:00Z", v: 77.5 },
    { t: "2026-06-08T14:00:00Z", v: 77.8 },
    { t: "2026-06-09T14:00:00Z", v: 78.1 },
    { t: "2026-06-10T14:00:00Z", v: 78.45 },
  ],
  vix: [
    { t: "2026-06-04T14:00:00Z", v: 18.5 },
    { t: "2026-06-05T14:00:00Z", v: 17.2 },
    { t: "2026-06-06T14:00:00Z", v: 16.4 },
    { t: "2026-06-07T14:00:00Z", v: 15.8 },
    { t: "2026-06-08T14:00:00Z", v: 15.3 },
    { t: "2026-06-09T14:00:00Z", v: 15.1 },
    { t: "2026-06-10T14:00:00Z", v: 14.32 },
  ],
};

const FIXTURE_A_DTO: GlobalMarketsDto = {
  generatedAt: "2026-06-11T14:00:03.345Z",
  currentAt: "2026-06-11T14:00:03.345Z",
  source: "global-markets-cron",
  window: 7,
  indicators: FIXTURE_A_INDICATORS,
  series: FIXTURE_A_SERIES,
  summary: FIXTURE_A_SUMMARY,
  count: 12,
};

// ---------------------------------------------------------------------------
// Suite 1: formatDelta
// ---------------------------------------------------------------------------

describe("formatDelta", () => {
  it("null → '—'", () => {
    expect(formatDelta(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatDelta(undefined)).toBe("—");
  });

  it("positive number → '+X.XX'", () => {
    expect(formatDelta(0.65)).toBe("+0.65");
  });

  it("negative number → '-X.XX'", () => {
    expect(formatDelta(-14.5)).toBe("-14.50");
  });

  it("zero → '0.00' (no sign)", () => {
    expect(formatDelta(0)).toBe("0.00");
  });

  it("large positive number formatted to 2dp", () => {
    expect(formatDelta(170.3)).toBe("+170.30");
  });
});

// ---------------------------------------------------------------------------
// Suite 2: formatPct
// ---------------------------------------------------------------------------

describe("formatPct", () => {
  it("null → '—'", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatPct(undefined)).toBe("—");
  });

  it("positive → '+X.XX%'", () => {
    expect(formatPct(0.84)).toBe("+0.84%");
  });

  it("negative → '-X.XX%'", () => {
    expect(formatPct(-0.62)).toBe("-0.62%");
  });

  it("zero → '0.00%'", () => {
    expect(formatPct(0)).toBe("0.00%");
  });

  it("large negative → '-22.59%'", () => {
    expect(formatPct(-22.59)).toBe("-22.59%");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: vixBandLabel
// ---------------------------------------------------------------------------

describe("vixBandLabel", () => {
  it("'low' → 'Bình ổn'", () => {
    expect(vixBandLabel("low")).toBe("Bình ổn");
  });

  it("'elevated' → 'Thận trọng'", () => {
    expect(vixBandLabel("elevated")).toBe("Thận trọng");
  });

  it("'high' → 'Sợ hãi'", () => {
    expect(vixBandLabel("high")).toBe("Sợ hãi");
  });

  it("null → '—'", () => {
    expect(vixBandLabel(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(vixBandLabel(undefined)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: vixBandClass
// ---------------------------------------------------------------------------

describe("vixBandClass", () => {
  it("'low' → contains emerald", () => {
    expect(vixBandClass("low")).toContain("emerald");
  });

  it("'elevated' → contains amber", () => {
    expect(vixBandClass("elevated")).toContain("amber");
  });

  it("'high' → contains red", () => {
    expect(vixBandClass("high")).toContain("red");
  });

  it("null → contains slate", () => {
    expect(vixBandClass(null)).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: riskToneLabel
// ---------------------------------------------------------------------------

describe("riskToneLabel", () => {
  it("'risk-on' → 'Ưa rủi ro'", () => {
    expect(riskToneLabel("risk-on")).toBe("Ưa rủi ro");
  });

  it("'risk-off' → 'Né rủi ro'", () => {
    expect(riskToneLabel("risk-off")).toBe("Né rủi ro");
  });

  it("'neutral' → 'Trung tính'", () => {
    expect(riskToneLabel("neutral")).toBe("Trung tính");
  });

  it("null → '—'", () => {
    expect(riskToneLabel(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(riskToneLabel(undefined)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: riskToneClass
// ---------------------------------------------------------------------------

describe("riskToneClass", () => {
  it("'risk-on' → contains emerald", () => {
    expect(riskToneClass("risk-on")).toContain("emerald");
  });

  it("'risk-off' → contains red", () => {
    expect(riskToneClass("risk-off")).toContain("red");
  });

  it("'neutral' → contains slate", () => {
    expect(riskToneClass("neutral")).toContain("slate");
  });

  it("null → contains slate", () => {
    expect(riskToneClass(null)).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 7: directionArrow
// ---------------------------------------------------------------------------

describe("directionArrow", () => {
  it("'up' → '▲'", () => {
    expect(directionArrow("up")).toBe("▲");
  });

  it("'down' → '▼'", () => {
    expect(directionArrow("down")).toBe("▼");
  });

  it("'flat' → '—'", () => {
    expect(directionArrow("flat")).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// Suite 8: directionClass
// ---------------------------------------------------------------------------

describe("directionClass", () => {
  it("'up' → contains emerald", () => {
    expect(directionClass("up")).toContain("emerald");
  });

  it("'down' → contains red", () => {
    expect(directionClass("down")).toContain("red");
  });

  it("'flat' → contains slate", () => {
    expect(directionClass("flat")).toContain("slate");
  });
});

// ---------------------------------------------------------------------------
// Suite 9: groupLabel
// ---------------------------------------------------------------------------

describe("groupLabel", () => {
  it("'commodities' → 'Hàng hoá'", () => {
    expect(groupLabel("commodities")).toBe("Hàng hoá");
  });

  it("'equities' → 'Chứng khoán thế giới'", () => {
    expect(groupLabel("equities")).toBe("Chứng khoán thế giới");
  });

  it("'fx_rates' → 'Tỷ giá & Rủi ro'", () => {
    expect(groupLabel("fx_rates")).toBe("Tỷ giá & Rủi ro");
  });
});

// ---------------------------------------------------------------------------
// Suite 10: buildSparklinePath
// ---------------------------------------------------------------------------

describe("buildSparklinePath", () => {
  it("empty array → ''", () => {
    expect(buildSparklinePath([])).toBe("");
  });

  it("single point → '' (fewer than 2 points)", () => {
    expect(buildSparklinePath([{ t: "2026-06-10", v: 100 }])).toBe("");
  });

  it("two points → returns a space-separated polyline string", () => {
    const result = buildSparklinePath([
      { t: "2026-06-10", v: 10 },
      { t: "2026-06-11", v: 20 },
    ]);
    expect(result).toBeTruthy();
    expect(result.includes(" ")).toBe(true);
    // Should have two coordinate pairs
    const pairs = result.split(" ");
    expect(pairs).toHaveLength(2);
  });

  it("seven points → returns 7 coordinate pairs", () => {
    const series: SeriesPoint[] = FIXTURE_A_SERIES["brent_crude_usd"]!;
    const result = buildSparklinePath(series, 80, 24);
    const pairs = result.split(" ");
    expect(pairs).toHaveLength(7);
  });

  it("flat series (all same value) → range uses 1 fallback, no NaN or Infinity", () => {
    const flat: SeriesPoint[] = [
      { t: "2026-06-10", v: 50 },
      { t: "2026-06-11", v: 50 },
      { t: "2026-06-12", v: 50 },
    ];
    const result = buildSparklinePath(flat);
    expect(result).not.toContain("NaN");
    expect(result).not.toContain("Infinity");
    expect(result.length).toBeGreaterThan(0);
  });

  it("first coordinate is at x=0", () => {
    const series: SeriesPoint[] = FIXTURE_A_SERIES["brent_crude_usd"]!;
    const result = buildSparklinePath(series, 80, 24);
    const firstPair = result.split(" ")[0]!;
    expect(firstPair.startsWith("0.0,")).toBe(true);
  });

  it("last coordinate is at x=width", () => {
    const series: SeriesPoint[] = FIXTURE_A_SERIES["brent_crude_usd"]!;
    const result = buildSparklinePath(series, 80, 24);
    const lastPair = result.split(" ").at(-1)!;
    expect(lastPair.startsWith("80.0,")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Fixture A — 12 indicators (group counts)
// ---------------------------------------------------------------------------

describe("Fixture A — 12 indicators, 3 groups", () => {
  it("total indicator count = 12", () => {
    expect(FIXTURE_A_INDICATORS).toHaveLength(12);
  });

  it("4 commodities indicators", () => {
    const comms = FIXTURE_A_INDICATORS.filter((i) => i.group === "commodities");
    expect(comms).toHaveLength(4);
  });

  it("3 equities indicators", () => {
    const eq = FIXTURE_A_INDICATORS.filter((i) => i.group === "equities");
    expect(eq).toHaveLength(3);
  });

  it("5 fx_rates indicators", () => {
    const fx = FIXTURE_A_INDICATORS.filter((i) => i.group === "fx_rates");
    expect(fx).toHaveLength(5);
  });

  it("first indicator is brent_crude_usd (commodities)", () => {
    expect(FIXTURE_A_INDICATORS[0]!.key).toBe("brent_crude_usd");
    expect(FIXTURE_A_INDICATORS[0]!.group).toBe("commodities");
    expect(FIXTURE_A_INDICATORS[0]!.label).toBe("Dầu Brent");
  });

  it("last indicator is us10y_yield (fx_rates)", () => {
    const last = FIXTURE_A_INDICATORS.at(-1)!;
    expect(last.key).toBe("us10y_yield");
    expect(last.group).toBe("fx_rates");
  });
});

// ---------------------------------------------------------------------------
// Suite 12: Fixture A — null delta renders as "—" (NEVER fabricate -100%)
// ---------------------------------------------------------------------------

describe("Fixture A — null delta fields render as '—'", () => {
  it("copper_usd: delta24h=null → formatDelta → '—'", () => {
    const copper = FIXTURE_A_INDICATORS.find((i) => i.key === "copper_usd")!;
    expect(copper.delta24h).toBeNull();
    expect(formatDelta(copper.delta24h)).toBe("—");
  });

  it("copper_usd: deltaPct24h=null → formatPct → '—'", () => {
    const copper = FIXTURE_A_INDICATORS.find((i) => i.key === "copper_usd")!;
    expect(copper.deltaPct24h).toBeNull();
    expect(formatPct(copper.deltaPct24h)).toBe("—");
  });

  it("hang_seng: delta7d=null → formatDelta → '—'", () => {
    const hs = FIXTURE_A_INDICATORS.find((i) => i.key === "hang_seng")!;
    expect(hs.delta7d).toBeNull();
    expect(formatDelta(hs.delta7d)).toBe("—");
  });

  it("jpy_vnd_rate: delta24h=null → formatDelta → '—'", () => {
    const jpy = FIXTURE_A_INDICATORS.find((i) => i.key === "jpy_vnd_rate")!;
    expect(jpy.delta24h).toBeNull();
    expect(formatDelta(jpy.delta24h)).toBe("—");
  });

  it("null deltaPct never produces '-100%' fabrication", () => {
    // If we naively compute (current - null) / null * 100 it could produce NaN/-Inf/-100
    // The guard must return "—" for any null input
    expect(formatPct(null)).toBe("—");
    expect(formatPct(null)).not.toBe("-100%");
    expect(formatPct(null)).not.toBe("-100.00%");
  });
});

// ---------------------------------------------------------------------------
// Suite 13: Fixture A — 3-group split
// ---------------------------------------------------------------------------

describe("Fixture A — 3-group split", () => {
  const groups = ["commodities", "equities", "fx_rates"] as const;
  const byGroup: Record<string, GlobalIndicator[]> = {
    commodities: [],
    equities: [],
    fx_rates: [],
  };
  for (const ind of FIXTURE_A_INDICATORS) {
    byGroup[ind.group]!.push(ind);
  }

  it("commodities group has brent_crude, gold, copper, silver in order", () => {
    const keys = byGroup["commodities"]!.map((i) => i.key);
    expect(keys).toEqual([
      "brent_crude_usd",
      "gold_usd_per_oz",
      "copper_usd",
      "silver_usd_per_oz",
    ]);
  });

  it("equities group has sp500, shanghai_comp, hang_seng in order", () => {
    const keys = byGroup["equities"]!.map((i) => i.key);
    expect(keys).toEqual(["sp500", "shanghai_comp", "hang_seng"]);
  });

  it("fx_rates group has vix, dxy, usd_vnd_rate, jpy_vnd_rate, us10y_yield in order", () => {
    const keys = byGroup["fx_rates"]!.map((i) => i.key);
    expect(keys).toEqual([
      "vix",
      "dxy",
      "usd_vnd_rate",
      "jpy_vnd_rate",
      "us10y_yield",
    ]);
  });

  it("groupLabel for all three groups returns non-empty Vietnamese strings", () => {
    for (const group of groups) {
      const label = groupLabel(group);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(group); // Must be translated, not the raw key
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 14: Fixture A — isEmpty = false (count=12)
// ---------------------------------------------------------------------------

describe("Fixture A — isEmpty logic (count=12)", () => {
  it("isEmpty = false when count=12 and error=null", () => {
    const error: string | null = null;
    const isEmpty = !error && FIXTURE_A_DTO.count === 0;
    expect(isEmpty).toBe(false);
  });

  it("count = 12 matches fixture length", () => {
    expect(FIXTURE_A_DTO.count).toBe(12);
    expect(FIXTURE_A_DTO.indicators).toHaveLength(12);
  });

  it("summary.vixBand='low' → label is 'Bình ổn'", () => {
    expect(vixBandLabel(FIXTURE_A_SUMMARY.vixBand)).toBe("Bình ổn");
  });

  it("summary.riskTone='risk-on' → label is 'Ưa rủi ro'", () => {
    expect(riskToneLabel(FIXTURE_A_SUMMARY.riskTone)).toBe("Ưa rủi ro");
  });

  it("summary has 5 topMovers", () => {
    expect(FIXTURE_A_SUMMARY.topMovers).toHaveLength(5);
  });

  it("topMovers[0] is hang_seng with up direction", () => {
    const mover = FIXTURE_A_SUMMARY.topMovers[0]!;
    expect(mover.key).toBe("hang_seng");
    expect(mover.direction24h).toBe("up");
    expect(directionArrow(mover.direction24h)).toBe("▲");
    expect(formatPct(mover.deltaPct24h)).toBe("+0.93%");
  });

  it("topMovers[3] is vix with down direction (negative deltaPct)", () => {
    const mover = FIXTURE_A_SUMMARY.topMovers[3]!;
    expect(mover.key).toBe("vix");
    expect(mover.direction24h).toBe("down");
    expect(directionArrow(mover.direction24h)).toBe("▼");
    expect(formatPct(mover.deltaPct24h)).toBe("-5.16%");
  });
});

// ---------------------------------------------------------------------------
// Suite 15: Fixture B — isEmpty = true (count=0)
// ---------------------------------------------------------------------------

describe("Fixture B — isEmpty logic (count=0)", () => {
  it("isEmpty = true when count=0 and error=null", () => {
    const error: string | null = null;
    const count = 0;
    const isEmpty = !error && count === 0;
    expect(isEmpty).toBe(true);
  });

  it("isEmpty = false when error is set (even with count=0)", () => {
    const error: string | null = "Some error";
    const count = 0;
    const isEmpty = !error && count === 0;
    expect(isEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 16: fetchGlobalMarketsData — happy path
// ---------------------------------------------------------------------------

describe("fetchGlobalMarketsData — happy path (Fixture A shape)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses indicators, series, summary, count correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001", 7);

    expect(result.error).toBeNull();
    expect(result.indicators).toHaveLength(12);
    expect(result.indicators[0]!.key).toBe("brent_crude_usd");
    expect(result.count).toBe(12);
    expect(result.window).toBe(7);
    expect(result.summary.vixBand).toBe("low");
    expect(result.summary.riskTone).toBe("risk-on");
    expect(result.summary.topMovers).toHaveLength(5);
    expect(result.currentAt).toBe("2026-06-11T14:00:03.345Z");
    expect(result.source).toBe("global-markets-cron");
  });

  it("series keys are preserved from payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => FIXTURE_A_DTO,
      }),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001", 7);

    expect(result.series).toBeDefined();
    expect(Array.isArray(result.series["brent_crude_usd"])).toBe(true);
    expect(result.series["brent_crude_usd"]).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Suite 17: fetchGlobalMarketsData — network error
// ---------------------------------------------------------------------------

describe("fetchGlobalMarketsData — network error", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetch throws → error is set, indicators is empty array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.indicators).toHaveLength(0);
    expect(result.count).toBe(0);
    expect(result.summary.vix).toBeNull();
    expect(result.summary.vixBand).toBeNull();
    expect(result.summary.riskTone).toBeNull();
    expect(result.summary.topMovers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 18: fetchGlobalMarketsData — bad response shape
// ---------------------------------------------------------------------------

describe("fetchGlobalMarketsData — bad shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unexpected shape → error is set, indicators=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: "shape" }),
      }),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001");

    expect(result.error).toContain("/api/global-markets");
    expect(result.indicators).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 19: fetchGlobalMarketsData — upstream 502
// ---------------------------------------------------------------------------

describe("fetchGlobalMarketsData — upstream 502", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 502 → error string set, indicators=[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({}),
      }),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001");

    expect(result.error).toContain("502");
    expect(result.indicators).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 20: fetchGlobalMarketsData — Fixture B empty (count=0, no crash)
// ---------------------------------------------------------------------------

describe("fetchGlobalMarketsData — Fixture B empty (count=0, no crash)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("empty indicators response → count=0, no error, no crash", async () => {
    const emptyPayload: GlobalMarketsDto = {
      generatedAt: "2026-06-11T00:00:00.000Z",
      currentAt: "2026-06-11T00:00:00.000Z",
      source: "global-markets-cron",
      window: 7,
      indicators: [],
      series: {},
      summary: {
        vix: null,
        vixBand: null,
        riskTone: null,
        topMovers: [],
      },
      count: 0,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => emptyPayload,
      }),
    );

    const result = await fetchGlobalMarketsData("http://localhost:3001");

    expect(result.error).toBeNull();
    expect(result.indicators).toHaveLength(0);
    expect(result.count).toBe(0);
    const isEmpty = !result.error && result.count === 0;
    expect(isEmpty).toBe(true);
    expect(result.summary.vixBand).toBeNull();
    expect(vixBandLabel(result.summary.vixBand)).toBe("—");
    expect(riskToneLabel(result.summary.riskTone)).toBe("—");
  });
});
