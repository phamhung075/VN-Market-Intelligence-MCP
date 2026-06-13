// src/__tests__/160-stock-aliases.test.ts
import { describe, it, expect } from "bun:test";
import {
  getAliasesForCode,
  detectStocksInText,
} from "../domain/services/stockAliases.js";

// ─────────────────────────────────────────────────────────────────────────────
// Task 160 — Stock Alias Dictionary
// Acceptance criteria: AC-1 through AC-6 (REQ-019)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 160 — getAliasesForCode", () => {
  // ── Known tickers return >= 3 aliases each ──────────────────────────────

  it("VNM returns at least 3 aliases", () => {
    const aliases = getAliasesForCode("VNM");
    expect(aliases.length).toBeGreaterThanOrEqual(3);
  });

  it("FPT returns at least 3 aliases", () => {
    const aliases = getAliasesForCode("FPT");
    expect(aliases.length).toBeGreaterThanOrEqual(3);
  });

  it("VCB returns at least 3 aliases", () => {
    const aliases = getAliasesForCode("VCB");
    expect(aliases.length).toBeGreaterThanOrEqual(3);
  });

  it("HPG returns at least 3 aliases", () => {
    const aliases = getAliasesForCode("HPG");
    expect(aliases.length).toBeGreaterThanOrEqual(3);
  });

  // ── Unknown code returns [] ──────────────────────────────────────────────

  it("unknown code ZZZZ returns empty array without throwing", () => {
    expect(() => getAliasesForCode("ZZZZ")).not.toThrow();
    expect(getAliasesForCode("ZZZZ")).toEqual([]);
  });

  // ── All aliases are lowercase ────────────────────────────────────────────

  it("all VNM aliases are lowercase", () => {
    const aliases = getAliasesForCode("VNM");
    for (const a of aliases) {
      expect(a).toBe(a.toLowerCase());
    }
  });

  it("all aliases are non-empty strings", () => {
    for (const code of ["VNM", "FPT", "VCB", "HPG", "VIC", "VHM", "MWG", "STB", "GAS", "SAB"]) {
      const aliases = getAliasesForCode(code);
      for (const a of aliases) {
        expect(typeof a).toBe("string");
        expect(a.length).toBeGreaterThan(0);
      }
    }
  });

  // ── Lowercase input is handled gracefully (returns aliases or []) ────────

  it("lowercase input 'vnm' is normalised to uppercase and returns aliases", () => {
    // The function should handle case-insensitive code lookup
    const upper = getAliasesForCode("VNM");
    const lower = getAliasesForCode("vnm");
    // Both should produce the same result (either both [] or both the alias list)
    expect(lower).toEqual(upper);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Task 160 — detectStocksInText", () => {
  // ── AC-1: Vinamilk resolves to VNM ──────────────────────────────────────

  it("AC-1: 'Vinamilk' in headline detects VNM", () => {
    const result = detectStocksInText(
      "Vinamilk lên kế hoạch doanh thu 2026 cao kỷ lục",
      ["VNM"],
    );
    expect(result).toContain("VNM");
  });

  // ── AC-2: Hòa Phát resolves to HPG ──────────────────────────────────────

  it("AC-2: 'Hòa Phát' in Vietnamese sentence detects HPG", () => {
    const result = detectStocksInText(
      "Tập đoàn Hòa Phát ghi nhận lợi nhuận kỷ lục",
      ["HPG"],
    );
    expect(result).toContain("HPG");
  });

  // ── AC-3: Diacritic-free match ───────────────────────────────────────────

  it("AC-3: 'Hoa Phat' without diacritics detects HPG", () => {
    const result = detectStocksInText("Hoa Phat tang manh", ["HPG"]);
    expect(result).toContain("HPG");
  });

  // ── AC-4: No false positive on generic commodity news ────────────────────

  it("AC-4: oil price news with no company trade names returns []", () => {
    const result = detectStocksInText(
      "Giá dầu thô Brent hôm nay tăng mạnh",
      ["VNM", "FPT", "VCB"],
    );
    expect(result).toEqual([]);
  });

  // ── AC-5: Multi-stock detection ──────────────────────────────────────────

  it("AC-5: 'Vietcombank và FPT ký kết hợp tác' detects both VCB and FPT", () => {
    const result = detectStocksInText(
      "Vietcombank và FPT ký kết hợp tác chuyển đổi số",
      ["VCB", "FPT", "VNM"],
    );
    expect(result).toContain("VCB");
    expect(result).toContain("FPT");
    expect(result).not.toContain("VNM");
  });

  // ── Sentence context tests ───────────────────────────────────────────────

  it("'sữa Vinamilk' in context sentence detects VNM", () => {
    const result = detectStocksInText(
      "Thị trường sữa Vinamilk tiếp tục dẫn đầu trong quý 3",
      ["VNM", "FPT"],
    );
    expect(result).toContain("VNM");
    expect(result).not.toContain("FPT");
  });

  it("'Vietcombank' in context detects VCB", () => {
    const result = detectStocksInText(
      "Ngân hàng Vietcombank công bố kết quả kinh doanh",
      ["VCB"],
    );
    expect(result).toContain("VCB");
  });

  it("'Techcombank' in context detects TCB", () => {
    const result = detectStocksInText(
      "Techcombank tăng lãi suất tiết kiệm kỳ hạn 6 tháng",
      ["TCB"],
    );
    expect(result).toContain("TCB");
  });

  it("'Petrolimex' in context detects PLX", () => {
    const result = detectStocksInText(
      "Petrolimex giảm giá xăng lần thứ ba liên tiếp",
      ["PLX"],
    );
    expect(result).toContain("PLX");
  });

  // ── Accent-normalised tests ──────────────────────────────────────────────

  it("'vinamilk' fully lowercase detects VNM", () => {
    const result = detectStocksInText("vinamilk dat loi nhuan ky luc", ["VNM"]);
    expect(result).toContain("VNM");
  });

  it("'hoa phat group' unaccented detects HPG", () => {
    const result = detectStocksInText("hoa phat group bao cao ket qua", ["HPG"]);
    expect(result).toContain("HPG");
  });

  // ── No false positive — additional cases ────────────────────────────────

  it("generic market commentary returns [] for unrelated watchlist", () => {
    const result = detectStocksInText(
      "Thị trường chứng khoán Việt Nam giảm điểm trong phiên chiều",
      ["HPG", "VCB"],
    );
    expect(result).toEqual([]);
  });

  it("foreign exchange news returns [] for unrelated watchlist", () => {
    const result = detectStocksInText(
      "USD/VND tăng lên 25.400 sau phát biểu của Fed",
      ["VNM", "FPT", "MWG"],
    );
    expect(result).toEqual([]);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("empty text returns []", () => {
    const result = detectStocksInText("", ["VNM", "FPT"]);
    expect(result).toEqual([]);
  });

  it("empty watchlist returns []", () => {
    const result = detectStocksInText("Vinamilk công bố kết quả kinh doanh", []);
    expect(result).toEqual([]);
  });

  // ── Watchlist filter — alias present but stock not in watchlist ──────────

  it("VNM alias detected but watchlist only has FPT returns []", () => {
    const result = detectStocksInText(
      "Vinamilk công bố doanh thu kỷ lục",
      ["FPT"],
    );
    expect(result).not.toContain("VNM");
    expect(result).toEqual([]);
  });

  it("HPG alias detected but watchlist only has VCB returns []", () => {
    const result = detectStocksInText(
      "Hòa Phát tăng sản lượng thép trong quý 1",
      ["VCB"],
    );
    expect(result).toEqual([]);
  });

  // ── Deduplication — alias appears twice still returns single code ────────

  it("alias appears twice in text returns VNM exactly once", () => {
    const result = detectStocksInText(
      "Vinamilk tăng trưởng mạnh. Cổ phiếu Vinamilk được chú ý.",
      ["VNM"],
    );
    expect(result.filter((c) => c === "VNM").length).toBe(1);
  });

  // ── Case insensitivity ────────────────────────────────────────────────────

  it("'VINAMILK' all-caps detects VNM", () => {
    const result = detectStocksInText(
      "VINAMILK CÔNG BỐ KẾT QUẢ KINH DOANH QUÝ 2",
      ["VNM"],
    );
    expect(result).toContain("VNM");
  });

  it("'Vinamilk' mixed case detects VNM", () => {
    const result = detectStocksInText(
      "Công ty Vinamilk đặt mục tiêu doanh thu 2026",
      ["VNM"],
    );
    expect(result).toContain("VNM");
  });

  // ── Additional coverage: other required stocks ────────────────────────────

  it("'Sabeco' detects SAB", () => {
    const result = detectStocksInText(
      "Sabeco dự kiến tăng trưởng doanh thu 15% trong năm nay",
      ["SAB"],
    );
    expect(result).toContain("SAB");
  });

  it("'Vinhomes' detects VHM", () => {
    const result = detectStocksInText(
      "Vinhomes ghi nhận doanh thu bất động sản cao nhất từ trước đến nay",
      ["VHM"],
    );
    expect(result).toContain("VHM");
  });

  it("'Thế Giới Di Động' detects MWG", () => {
    const result = detectStocksInText(
      "Thế Giới Di Động mở thêm 50 cửa hàng điện thoại trong quý 4",
      ["MWG"],
    );
    expect(result).toContain("MWG");
  });

  it("'PV Gas' detects GAS", () => {
    const result = detectStocksInText(
      "PV Gas đạt sản lượng khí cao kỷ lục trong tháng 3",
      ["GAS"],
    );
    expect(result).toContain("GAS");
  });

  it("'Vietnam Airlines' detects HVN", () => {
    const result = detectStocksInText(
      "Vietnam Airlines dự kiến tăng tần suất bay quốc tế",
      ["HVN"],
    );
    expect(result).toContain("HVN");
  });

  // ── Performance smoke test ────────────────────────────────────────────────

  it("500-char text, 20-stock watchlist completes in under 500ms", () => {
    // Threshold: 500ms — guards against O(n²) regressions or accidental I/O.
    // Actual cost is ~0.03ms; the 500ms ceiling accommodates cold-JIT first-call
    // latency on a loaded CI runner under P=16 per-file-isolation parallelism.
    // The previous 5ms ceiling caused nondeterministic flakiness on CI
    // (same commit could PASS and FAIL depending on CPU scheduling).
    const text =
      "Thị trường chứng khoán Việt Nam hôm nay giao dịch với khối lượng lớn. " +
      "Các cổ phiếu bluechip dẫn dắt thị trường. Nhà đầu tư nước ngoài mua ròng. " +
      "Lãi suất ổn định hỗ trợ tâm lý. Cổ phiếu ngân hàng và bất động sản tăng mạnh. " +
      "Tổng khối lượng khớp lệnh đạt 800 triệu cổ phiếu trong phiên chiều hôm nay.";

    const watchlist = [
      "VNM", "FPT", "VCB", "HPG", "VEA",
      "VIC", "VHM", "MSN", "MWG", "TCB",
      "BID", "CTG", "ACB", "VPB", "HDB",
      "STB", "GAS", "PLX", "SAB", "REE",
    ];

    const start = performance.now();
    const result = detectStocksInText(text, watchlist);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(Array.isArray(result)).toBe(true);
  });
});
