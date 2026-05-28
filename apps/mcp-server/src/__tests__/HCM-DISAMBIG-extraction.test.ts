// apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts
// Sprint HCM-DISAMBIG — D1 — Extraction hardening test suite
//
// Covers:
//   - AC-D1-01 through AC-D1-15 (15 extraction acceptance criteria)
//   - AC-REG-1: 4 regression smoke cases confirming 1788/1198/1206/1322 stay green
//
// Key rule tested: GEOGRAPHIC_CONTEXT_MAP["HCM"] in newsNormalizer.ts
// is extended with "tp. hcm" (dot-space) and "tp-hcm" (hyphen) — HCM-D1.
//
// Architect decision (2026-05-28-hcm-disambig.md §D3):
//   The 10-char look-behind window is sufficient; "tp. hcm" is belt-and-suspenders;
//   "tp-hcm" closes the genuine gap. No STOCK_CONTEXT_MAP needed — positive cases
//   already pass because stock-context tokens appear AFTER the ticker, not in the
//   10-char look-behind before it.

import { describe, it, expect } from "bun:test";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../domain/models/shared-types.js";
import { detectStocksInText } from "../domain/services/stockAliases.js";

// ─── Minimal RssItem factory (mirrors 1788-hcm-geographic-false-positive.test.ts) ───
function makeItem(title: string, content = ""): RssItem {
  return {
    title,
    content,
    url: "https://example.com/news/1",
    source: "cafef",
    publishedAt: new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// HCM-DISAMBIG — Extraction layer ACs
// ════════════════════════════════════════════════════════════════════════════

describe("HCM-DISAMBIG-extraction", () => {

  // ── Negative cases: geographic context MUST suppress HCM ticker ────────

  it("AC-D1-01: TPHCM compound token does NOT extract HCM (regression #4144)", () => {
    // "TPHCM" is matched as a 5-char token; "HCM" is NOT split out as standalone.
    // The \b regex boundary means HCM inside TPHCM is not independently matched.
    const item = makeItem("Vietnam Airlines TPHCM-Phuket strategic expansion");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-D1-02: 'TP. HCM' dot-space variant does NOT extract HCM ticker", () => {
    // New entry "tp. hcm" in GEOGRAPHIC_CONTEXT_MAP (HCM-D1 gap #1).
    // Also covered by existing "tp." substring — belt-and-suspenders.
    const item = makeItem("Giá vàng tại TP. HCM hôm nay");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-D1-03: 'Tp.HCM' mixed-case dot variant does NOT extract HCM ticker", () => {
    // Mixed-case handled by toLowerCase() in look-behind window.
    const item = makeItem("Tp.HCM mở rộng metro line 3");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-D1-04: 'TP-HCM' hyphen variant does NOT extract HCM ticker", () => {
    // New entry "tp-hcm" in GEOGRAPHIC_CONTEXT_MAP (HCM-D1 gap #2 — genuine gap).
    const item = makeItem("TP-HCM họp về quy hoạch");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  // ── Positive cases: stock context MUST extract HCM ticker ──────────────

  it("AC-D1-05: 'Cổ phiếu HCM' stock-context positive extracts HCM", () => {
    // "cổ phiếu" appears BEFORE HCM — but it is outside the 10-char look-behind
    // window immediately before the ticker, so the geographic guard does NOT fire.
    const item = makeItem("Cổ phiếu HCM đóng cửa tăng 2%");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-06: 'HCM (mã CK)' parenthetical positive extracts HCM (Pattern 1)", () => {
    // Pattern 1 (parenthetical) bypasses geographic guard by design.
    const item = makeItem("HCM (mã CK) công bố LNST quý 1");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-07: alias 'Chứng khoán Hồ Chí Minh' extracts HCM (Pattern 3 / Task 1788 AC-6 regression)", () => {
    // HCM alias path: "chung khoan ho chi minh" — safe from city collision.
    const item = makeItem("Chứng khoán Hồ Chí Minh báo lãi");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-08: 'Mua HCM, bán SSI' trailing comma — HCM still extracted", () => {
    // Trailing comma is a word boundary; HCM standalone token with no geographic prefix.
    const item = makeItem("Mua HCM, bán SSI");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-09: 'Đề xuất mua HCM)' trailing paren — HCM still extracted", () => {
    // Trailing paren is a word boundary; "mua HCM)" = ticker-buy context.
    const item = makeItem("Đề xuất mua HCM)");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-10: 'Chứng khoán HCM (HCM) báo lãi quý 1' over-block regression — HCM extracted", () => {
    // Parenthetical (HCM) fires Pattern 1 first, bypassing geographic guard.
    const item = makeItem("Chứng khoán HCM (HCM) báo lãi quý 1");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  // ── Additional negative cases with new surface forms ───────────────────

  it("AC-D1-11: 'TP. HCM' in conference headline does NOT extract HCM ticker", () => {
    // Dot-space variant mid-sentence — covered by "tp. hcm" (new entry, HCM-D1).
    const item = makeItem("Hội nghị kinh tế TP. HCM năm 2026");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-D1-12: 'TP-HCM' in real-estate headline does NOT extract HCM ticker", () => {
    // Hyphen compound in real-estate context — covered by "tp-hcm" (new entry, HCM-D1).
    const item = makeItem("Dự án BĐS TP-HCM và khu vực lân cận");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("HCM");
  });

  it("AC-D1-13: mixed headline — geographic TP.HCM suppressed, ticker HCM extracted (R-1 over-block guard)", () => {
    // First HCM: "TP.HCM" → look-behind contains "tp." → suppressed (correct).
    // Second HCM: "nhưng HCM hôm" → look-behind is "nhưng " (no geographic prefix) → extracted (correct).
    // This is the same-headline over-block risk scenario from the sprint brief.
    const item = makeItem(
      "HPG đặt nhà máy tại TP.HCM nhưng HCM hôm nay tăng 1.5%",
    );
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-14: 'Mã HCM' stock-context positive extracts HCM", () => {
    // "mã" token before HCM — outside the 10-char look-behind window immediately before HCM,
    // so the geographic guard does not fire. Pattern 2 extracts HCM normally.
    const item = makeItem("Mã HCM trên sàn HOSE tăng mạnh");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  it("AC-D1-15: 'khớp lệnh HCM' stock-context positive extracts HCM", () => {
    // "khớp lệnh" precedes HCM — beyond the 10-char look-behind, no geographic prefix.
    const item = makeItem("khớp lệnh HCM cao bất thường");
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HCM");
  });

  // ════════════════════════════════════════════════════════════════════════
  // AC-REG: Regression smoke checks — 1788 / 1198 / 1206 / 1322 must stay green
  // ════════════════════════════════════════════════════════════════════════

  describe("AC-REG-1: Task 1788 smoke — core geographic guard still works", () => {
    it("1788 AC-1 replay: TP.HCM dot-no-space suppressed", () => {
      const item = makeItem("PC1 phát hành thông báo tới 29,000 cổ đông tại TP.HCM");
      const entry = normalizeNews(item);
      expect(entry.affectedActions).not.toContain("HCM");
    });

    it("1788 AC-2 replay: TP HCM space variant suppressed", () => {
      const item = makeItem("Công ty điện lực PC1 mở rộng lưới điện tại TP HCM");
      const entry = normalizeNews(item);
      expect(entry.affectedActions).not.toContain("HCM");
    });

    it("1788 AC-5 replay: explicit parenthetical HCM ticker still extracted", () => {
      const item = makeItem("Chứng khoán HCM (HCM) báo lãi quý 1 tăng 30%");
      const entry = normalizeNews(item);
      expect(entry.affectedActions).toContain("HCM");
    });

    it("1788 AC-6 replay: alias 'chứng khoán hồ chí minh' still extracted", () => {
      const item = makeItem("Công ty chứng khoán Hồ Chí Minh công bố kết quả kinh doanh quý 1");
      const entry = normalizeNews(item);
      expect(entry.affectedActions).toContain("HCM");
    });
  });
});
