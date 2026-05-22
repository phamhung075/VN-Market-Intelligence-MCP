Bun.env["DB_PATH"] = ":memory:"; // isolation — must be first line

import { describe, it, expect } from "bun:test";
import { formatKinhDichTradingContext } from "../interface/mcp/tools/kinhdich/kinhDichTools.js";
import { formatTaIndicatorReport } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import { buildSupplyChainExposureOutput } from "../interface/mcp/tools/sector/supplyChainTools.js";
import type { ToolCandle as DailyCandle } from "../interface/mcp/tools/market-data/technicalIndicatorTools.js";
import type { SupplyChainSignal } from "../domain/services/supplyChainAnalyzer.js";

// RSI N/A branch (technicalIndicatorTools.ts:164 "cần tối thiểu 15 nến") is architecturally
// unreachable from tests: guard at line 130 requires >= 35 candles, which always satisfies
// RSI's 15-period requirement. String fix ships in task 1409 without a dedicated test case.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flatCandles(n: number, price = 100): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: price,
  }));
}

function risingCandles(n: number, start = 100, step = 1): DailyCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, "0")}`,
    close: start + i * step,
  }));
}

// Minimal valid SupplyChainSignal stub with severity: "high"
const highSignalStub: SupplyChainSignal = {
  index: "BDI",
  deviation: {
    name: "BDI",
    current: 2500,
    mean: 1500,
    stdDev: 400,
    zScore: 2.5,
    level: "high",
    direction: "above",
    summary: "BDI ở mức cao (+2.5σ)",
  },
  affectedStocks: [
    {
      code: "GMD",
      direction: "bullish",
      reasoning: "Cước vận tải tăng → doanh thu GMD tăng",
    },
  ],
  severity: "high",
  confidence: 0.85,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("1408 — MCP tool Vietnamese diacritics", () => {
  // 1. kinhDich — THUAN LOI
  it("formatKinhDichTradingContext(THUAN LOI) returns accented Thuận lợi + tích cực", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatKinhDichTradingContext as any)("THUAN LOI");
    expect(result).toContain("Thuận lợi");
    expect(result).toContain("tích cực");
    expect(result).not.toContain("THUAN LOI");
    expect(result).not.toContain("tich cuc");
  });

  // 2. kinhDich — BAT LOI
  it("formatKinhDichTradingContext(BAT LOI) returns accented Bất lợi + cẩn thận", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatKinhDichTradingContext as any)("BAT LOI");
    expect(result).toContain("Bất lợi");
    expect(result).toContain("cẩn thận");
    expect(result).not.toContain("BAT LOI");
    expect(result).not.toContain("can than");
  });

  // 3. kinhDich — NEUTRAL
  it("formatKinhDichTradingContext(NEUTRAL) returns accented Trung tính + xem thêm", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatKinhDichTradingContext as any)("NEUTRAL");
    expect(result).toContain("Trung tính");
    expect(result).toContain("xem thêm");
    expect(result).not.toContain("TRUNG TINH");
    expect(result).not.toContain("xem them");
  });

  // 4a. TA indicator — MA mixed (flat candles, MA50 N/A)
  it("formatTaIndicatorReport VCB flatCandles(60) contains sắp xếp hỗn hợp + Xu hướng", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatTaIndicatorReport as any)("VCB", flatCandles(60), 60);
    expect(result).toContain("sắp xếp hỗn hợp");
    expect(result).toContain("Xu hướng");
    expect(result).not.toContain("sap xep hon hop");
    expect(result).not.toContain("Xu huong");
  });

  // 4b. TA indicator — insufficient candles for MA50
  it("formatTaIndicatorReport VCB flatCandles(49) contains cần 50 nến", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: string = (formatTaIndicatorReport as any)("VCB", flatCandles(49), 60);
    expect(result).toContain("cần 50 nến");
    expect(result).not.toContain("can 50 nen");
  });

  // 5a. supplyChain — no signals → ổn định summary
  it("buildSupplyChainExposureOutput([], [], null) contains TỔNG KẾT + ổn định", () => {
    const result = buildSupplyChainExposureOutput([], [], null);
    expect(result).toContain("TỔNG KẾT");
    expect(result).toContain("ổn định");
    expect(result).not.toContain("TONG KET");
    expect(result).not.toContain("on dinh");
  });

  // 5b. supplyChain — high signal → QUAN TRỌNG + theo dõi chặt chẽ
  it("buildSupplyChainExposureOutput with high signal contains QUAN TRỌNG + theo dõi chặt chẽ", () => {
    const result = buildSupplyChainExposureOutput([], [highSignalStub], null);
    expect(result).toContain("QUAN TRỌNG");
    expect(result).toContain("theo dõi chặt chẽ");
    expect(result).not.toContain("TONG KET");
    expect(result).not.toContain("theo doi chat chat");
  });

  // 5c. supplyChain — line 106 accented phrase
  it("buildSupplyChainExposureOutput([], [], null) contains Tín hiệu cổ phiếu: Không có tín hiệu đáng kể", () => {
    const result = buildSupplyChainExposureOutput([], [], null);
    expect(result).toContain("Tín hiệu cổ phiếu: Không có tín hiệu đáng kể");
    expect(result).not.toContain("Tin hieu co phieu: Khong");
  });
});
