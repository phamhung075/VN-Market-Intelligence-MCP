/**
 * FE-AHUB-W1-TechnicalZone.test.ts
 *
 * Unit tests for TechnicalZone pure-logic helpers.
 * Component uses useFetcher (Remix hook) and StockChart (client-only
 * lightweight-charts), so render tests are skipped — consistent with
 * the project's "named-export bypass" pattern for Remix-strip protection.
 *
 * Suites:
 *   1. isPriceHistoryDto — valid DTO shapes
 *   2. isPriceHistoryDto — invalid / error payloads
 *   3. derivePeriodStats — normal candle arrays
 *   4. derivePeriodStats — empty / poison-row filtering
 *   5. candlesToPricePoints — conversion correctness
 *   6. candlesToPricePoints — edge cases
 *
 * Sprint: FRONTEND-ANALYSIS-HUB-CONSOLIDATION
 * Task:   FE-AHUB-W1-TECHNICAL-ZONE
 */

import { describe, it, expect } from "vitest";
import {
  isPriceHistoryDto,
  derivePeriodStats,
  candlesToPricePoints,
} from "~/components/analysis/TechnicalZone";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CANDLE_A = {
  date: "2026-06-20",
  open: 80000,
  high: 82000,
  low: 79000,
  close: 81000,
  volume: 1_500_000,
};

const CANDLE_B = {
  date: "2026-06-21",
  open: 81000,
  high: 85000,
  low: 80500,
  close: 84000,
  volume: 2_000_000,
};

const CANDLE_C = {
  date: "2026-06-22",
  open: 84000,
  high: 84500,
  low: 78000,
  close: 78500,
  volume: 2_500_000,
};

// Non-trading-day poison row (close===0 && volume===0)
const CANDLE_POISON = {
  date: "2026-06-24",
  open: 0,
  high: 0,
  low: 0,
  close: 0,
  volume: 0,
};

const VALID_DTO = {
  ticker: "FPT",
  generated_at: "2026-06-28T05:00:00.000Z",
  data_source: "live",
  stale_served: false,
  count: 3,
  latest: {
    date: "2026-06-22",
    close: 78500,
    change_abs: -5500,
    change_pct: -6.54,
  },
  candles: [CANDLE_A, CANDLE_B, CANDLE_C],
};

// ---------------------------------------------------------------------------
// Suite 1: isPriceHistoryDto — valid DTO shapes
// ---------------------------------------------------------------------------

describe("isPriceHistoryDto — valid DTO shapes", () => {
  it("returns true for a complete DTO with candles and count", () => {
    expect(isPriceHistoryDto(VALID_DTO)).toBe(true);
  });

  it("returns true when candles is an empty array (count:0 empty-ticker state)", () => {
    const dto = { ...VALID_DTO, candles: [], count: 0 };
    expect(isPriceHistoryDto(dto)).toBe(true);
  });

  it("returns true when data_source is 'unavailable'", () => {
    const dto = { ...VALID_DTO, data_source: "unavailable", candles: [], count: 0 };
    expect(isPriceHistoryDto(dto)).toBe(true);
  });

  it("returns true when latest is null (no recent data)", () => {
    const dto = { ...VALID_DTO, latest: null };
    expect(isPriceHistoryDto(dto)).toBe(true);
  });

  it("returns true when optional data_asof is present", () => {
    const dto = { ...VALID_DTO, data_asof: "2026-06-28T04:50:00.000Z" };
    expect(isPriceHistoryDto(dto)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: isPriceHistoryDto — invalid / error payloads
// ---------------------------------------------------------------------------

describe("isPriceHistoryDto — invalid / error payloads", () => {
  it("returns false for null", () => {
    expect(isPriceHistoryDto(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPriceHistoryDto(undefined)).toBe(false);
  });

  it("returns false for a plain string", () => {
    expect(isPriceHistoryDto("error string")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isPriceHistoryDto(42)).toBe(false);
  });

  it("returns false for a proxy error payload { error: '...' }", () => {
    // api.price-history.$ticker returns { error: 'invalid_ticker' } on 400.
    expect(isPriceHistoryDto({ error: "invalid_ticker" })).toBe(false);
  });

  it("returns false for a gateway timeout payload { error: 'upstream timeout' }", () => {
    expect(isPriceHistoryDto({ error: "upstream timeout" })).toBe(false);
  });

  it("returns false when candles is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { candles: _, ...withoutCandles } = VALID_DTO;
    expect(isPriceHistoryDto(withoutCandles)).toBe(false);
  });

  it("returns false when count is missing (incomplete DTO)", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { count: _, ...withoutCount } = VALID_DTO;
    expect(isPriceHistoryDto(withoutCount)).toBe(false);
  });

  it("returns false when candles is not an array (malformed shape)", () => {
    const malformed = { ...VALID_DTO, candles: "not-an-array" };
    expect(isPriceHistoryDto(malformed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: derivePeriodStats — normal candle arrays
// ---------------------------------------------------------------------------

describe("derivePeriodStats — normal candle arrays", () => {
  it("computes correct periodHigh from 3 candles", () => {
    const result = derivePeriodStats([CANDLE_A, CANDLE_B, CANDLE_C]);
    // Highs: 82000, 85000, 84500 → max = 85000
    expect(result?.periodHigh).toBe(85000);
  });

  it("computes correct periodLow from 3 candles", () => {
    const result = derivePeriodStats([CANDLE_A, CANDLE_B, CANDLE_C]);
    // Lows: 79000, 80500, 78000 → min = 78000
    expect(result?.periodLow).toBe(78000);
  });

  it("latestVolume is the last candle's volume", () => {
    const result = derivePeriodStats([CANDLE_A, CANDLE_B, CANDLE_C]);
    // Last candle is CANDLE_C with volume 2_500_000
    expect(result?.latestVolume).toBe(2_500_000);
  });

  it("tradingCount matches the number of non-poison candles", () => {
    const result = derivePeriodStats([CANDLE_A, CANDLE_B, CANDLE_C]);
    expect(result?.tradingCount).toBe(3);
  });

  it("returns correct stats for a single candle", () => {
    const result = derivePeriodStats([CANDLE_B]);
    expect(result?.periodHigh).toBe(85000);
    expect(result?.periodLow).toBe(80500);
    expect(result?.latestVolume).toBe(2_000_000);
    expect(result?.tradingCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: derivePeriodStats — empty / poison-row filtering
// ---------------------------------------------------------------------------

describe("derivePeriodStats — empty and poison-row filtering", () => {
  it("returns null for empty candles array", () => {
    expect(derivePeriodStats([])).toBeNull();
  });

  it("excludes poison rows (close===0 && volume===0) from high/low computation", () => {
    const candles = [CANDLE_A, CANDLE_POISON, CANDLE_C];
    const result = derivePeriodStats(candles);
    // Only CANDLE_A and CANDLE_C should contribute to high/low
    // Highs: 82000, 84500 → max = 84500
    expect(result?.periodHigh).toBe(84500);
    // Lows: 79000, 78000 → min = 78000
    expect(result?.periodLow).toBe(78000);
  });

  it("tradingCount excludes poison rows", () => {
    const candles = [CANDLE_A, CANDLE_POISON, CANDLE_C];
    const result = derivePeriodStats(candles);
    // 2 real trading candles, 1 poison row
    expect(result?.tradingCount).toBe(2);
  });

  it("latestVolume is still the last candle in the original array (including poison)", () => {
    // latestVolume uses candles[last] not displayCandles[last] — matches page behaviour
    const candles = [CANDLE_A, CANDLE_B, CANDLE_POISON];
    const result = derivePeriodStats(candles);
    // The last candle is the poison row with volume 0
    expect(result?.latestVolume).toBe(0);
  });

  it("falls back to full candle set when ALL rows are poison (no crash)", () => {
    // When all candles are poison, displayCandles = candles (fallback)
    const allPoison = [
      { ...CANDLE_POISON, date: "2026-06-24" },
      { ...CANDLE_POISON, date: "2026-06-25" },
    ];
    const result = derivePeriodStats(allPoison);
    // Should not return null — uses full candle set as fallback
    expect(result).not.toBeNull();
    expect(result?.periodHigh).toBe(0);
    expect(result?.periodLow).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: candlesToPricePoints — conversion correctness
// ---------------------------------------------------------------------------

describe("candlesToPricePoints — conversion correctness", () => {
  it("maps candles to PricePoint[] with the correct ticker code", () => {
    const result = candlesToPricePoints([CANDLE_A], "FPT");
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("FPT");
  });

  it("preserves OHLCV fields from source candles", () => {
    const result = candlesToPricePoints([CANDLE_B], "VCB");
    const pt = result[0]!;
    expect(pt.open).toBe(CANDLE_B.open);
    expect(pt.high).toBe(CANDLE_B.high);
    expect(pt.low).toBe(CANDLE_B.low);
    expect(pt.close).toBe(CANDLE_B.close);
    expect(pt.volume).toBe(CANDLE_B.volume);
  });

  it("preserves date from source candle", () => {
    const result = candlesToPricePoints([CANDLE_A], "HPG");
    expect(result[0]!.date).toBe("2026-06-20");
  });

  it("converts multiple candles and preserves order", () => {
    const result = candlesToPricePoints([CANDLE_A, CANDLE_B, CANDLE_C], "SSI");
    expect(result).toHaveLength(3);
    expect(result[0]!.date).toBe("2026-06-20");
    expect(result[1]!.date).toBe("2026-06-21");
    expect(result[2]!.date).toBe("2026-06-22");
  });

  it("all output rows share the same ticker code", () => {
    const result = candlesToPricePoints([CANDLE_A, CANDLE_B, CANDLE_C], "NVL");
    for (const pt of result) {
      expect(pt.code).toBe("NVL");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: candlesToPricePoints — edge cases
// ---------------------------------------------------------------------------

describe("candlesToPricePoints — edge cases", () => {
  it("returns [] for empty candle array", () => {
    const result = candlesToPricePoints([], "VNM");
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("converts a poison-row candle (close===0) without throwing", () => {
    const result = candlesToPricePoints([CANDLE_POISON], "FPT");
    expect(result).toHaveLength(1);
    expect(result[0]!.close).toBe(0);
    expect(result[0]!.volume).toBe(0);
  });

  it("ticker code is forwarded verbatim (no uppercasing in conversion)", () => {
    // Ticker normalisation is the caller's responsibility (done in TechnicalZone).
    const result = candlesToPricePoints([CANDLE_A], "fpt");
    expect(result[0]!.code).toBe("fpt");
  });
});
