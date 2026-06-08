/**
 * FIX-1297/1292/1301/1302 — Sentiment BEARISH keyword batch + macro alert direction label
 *
 * Bug reports:
 *   id:1297 — "Quỹ ngoại báo lỗ tháng 3, tăng phòng thủ tiền mặt" → BULLISH (regression from fix-1284)
 *   id:1292 — NVL "bị ép bán" classified BULLISH (missing keyword)
 *   id:1302 — "khoản lỗ hàng trăm tỷ đầu tiên ngành chứng khoán" → BULLISH (missing keyword)
 *   id:1301 — Macro alert body says "cao bất thường" even when -2.13σ below mean
 *
 * Fix:
 *   - "khoản lỗ" (amount of loss) → BEARISH weight 2
 *   - "bị ép bán" (forced to sell) → BEARISH weight 3
 *   - "ép bán" (forced sell) → BEARISH weight 2
 *   - "phòng thủ tiền mặt" (cash defense) → BEARISH weight 2
 *   - classifyDeviation: below-mean "high" level → "thấp bất thường" (not "cao bất thường")
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier";
import { classifyDeviation } from "../domain/services/macroThresholds";

// ─────────────────────────────────────────────────────────────────────────────
// id:1297 — regression guard: báo lỗ + phòng thủ tiền mặt must stay BEARISH
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX-1297: báo lỗ + phòng thủ tiền mặt → BEARISH", () => {
  it("'báo lỗ tháng 3' → BEARISH", () => {
    const result = classifySentiment("Quỹ ngoại báo lỗ tháng 3");
    expect(result.direction).toBe("bearish");
  });

  it("full id:1297 headline → BEARISH", () => {
    const result = classifySentiment(
      "Quỹ ngoại báo lỗ tháng 3, tăng phòng thủ tiền mặt",
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("báo lỗ");
  });

  it("'phòng thủ tiền mặt' standalone → BEARISH", () => {
    const result = classifySentiment("tập đoàn tăng phòng thủ tiền mặt trước rủi ro");
    expect(result.direction).toBe("bearish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// id:1292 — "bị ép bán" / "ép bán" must classify BEARISH
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX-1292: bị ép bán / ép bán → BEARISH", () => {
  it("'bị ép bán cổ phần' → BEARISH", () => {
    const result = classifySentiment("NVL bị ép bán cổ phần");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("bị ép bán");
  });

  it("'bị ép bán' standalone → BEARISH", () => {
    const result = classifySentiment("cổ đông lớn bị ép bán toàn bộ vị thế");
    expect(result.direction).toBe("bearish");
  });

  it("'ép bán' → BEARISH", () => {
    const result = classifySentiment("lệnh ép bán từ margin call");
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("ép bán");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// id:1302 — "khoản lỗ" must classify BEARISH
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX-1302: khoản lỗ → BEARISH", () => {
  it("'khoản lỗ hàng trăm tỷ đầu tiên ngành chứng khoán' → BEARISH", () => {
    const result = classifySentiment(
      "khoản lỗ hàng trăm tỷ đầu tiên ngành chứng khoán",
    );
    expect(result.direction).toBe("bearish");
    expect(result.keywords).toContain("khoản lỗ");
  });

  it("'ghi nhận khoản lỗ lớn' → BEARISH", () => {
    const result = classifySentiment("công ty ghi nhận khoản lỗ lớn trong quý");
    expect(result.direction).toBe("bearish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// id:1301 — Macro alert direction: below-mean high deviation → "thấp bất thường"
// value=4805.6, mean=4832.27 → zScore ≈ -2.13 → level=high, direction=below
// stdDev = 26.67 / 2.13 ≈ 12.52
// ─────────────────────────────────────────────────────────────────────────────
describe("FIX-1301: macro deviation below mean → label 'thấp bất thường'", () => {
  it("value=4805.6, mean=4832.27 (below), zScore≈-2.13 → summary contains 'thấp bất thường'", () => {
    const result = classifyDeviation({
      name: "goldUSDPerOz",
      current: 4805.6,
      mean: 4832.27,
      stdDev: 12.52,
      sampleCount: 30,
    });
    // zScore = (4805.6 - 4832.27) / 12.52 ≈ -2.13 → level=high, direction=below
    expect(result.level).toBe("high");
    expect(result.direction).toBe("below");
    expect(result.summary).toContain("thấp bất thường");
    expect(result.summary).not.toContain("cao bất thường");
  });

  it("above-mean high deviation → summary still contains 'cao bất thường'", () => {
    const result = classifyDeviation({
      name: "goldUSDPerOz",
      current: 4858.94,
      mean: 4832.27,
      stdDev: 12.52,
      sampleCount: 30,
    });
    // zScore ≈ +2.13 → level=high, direction=above
    expect(result.level).toBe("high");
    expect(result.direction).toBe("above");
    expect(result.summary).toContain("cao bất thường");
    expect(result.summary).not.toContain("thấp bất thường");
  });
});
