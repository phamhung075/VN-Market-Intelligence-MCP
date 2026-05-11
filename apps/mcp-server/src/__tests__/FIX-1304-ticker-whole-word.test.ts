// apps/mcp-server/src/__tests__/FIX-1304-ticker-whole-word.test.ts
// TDD: whole-word ticker matching — BID must NOT match "Bidiphar"
import { describe, it, expect } from "bun:test";
import { tickerWholeWordMatch } from "../domain/services/stockAliases.js";

describe("FIX-1304 — tickerWholeWordMatch: whole-word boundary enforcement", () => {
  // ── Negative cases (false positives the bug caused) ─────────────────────
  it("BID does NOT match 'Bidiphar muốn chào bán 23 triệu cổ phiếu'", () => {
    const text = "Bidiphar muốn chào bán 23 triệu cổ phiếu".toLowerCase();
    expect(tickerWholeWordMatch(text, "BID")).toBe(false);
  });

  it("BID does NOT match when ticker is a leading substring of a word", () => {
    expect(tickerWholeWordMatch("bidiphar reports earnings", "BID")).toBe(false);
  });

  it("VCB does NOT match when embedded mid-word", () => {
    // hypothetical: "AVCBA" should not match VCB
    expect(tickerWholeWordMatch("avcba grows 10%", "VCB")).toBe(false);
  });

  it("FPT does NOT match 'kfptx is a dummy ticker'", () => {
    expect(tickerWholeWordMatch("kfptx is a dummy ticker", "FPT")).toBe(false);
  });

  // ── Positive cases (must still fire) ────────────────────────────────────
  it("BID matches 'BIDV thông báo tăng lãi suất' (space boundary)", () => {
    // After lowercase: "bidv thông báo tăng lãi suất"
    // "bid" appears at index 0, but next char is 'v' (alphanumeric) → false
    // So "BID" should NOT match "BIDV" — this is the desired behaviour
    // (BIDV is a different ticker from BID)
    expect(tickerWholeWordMatch("bidv thông báo tăng lãi suất", "BID")).toBe(false);
  });

  it("BID matches when surrounded by spaces", () => {
    expect(tickerWholeWordMatch("cổ phiếu bid tăng mạnh", "BID")).toBe(true);
  });

  it("BID matches at end of string", () => {
    expect(tickerWholeWordMatch("mua cổ phiếu bid", "BID")).toBe(true);
  });

  it("BID matches at start of string", () => {
    expect(tickerWholeWordMatch("bid tăng 3%", "BID")).toBe(true);
  });

  it("FPT matches in 'FPT Corporation công bố kết quả'", () => {
    expect(tickerWholeWordMatch("fpt corporation công bố kết quả", "FPT")).toBe(true);
  });

  it("VCB matches when ticker stands alone", () => {
    expect(tickerWholeWordMatch("vcb tăng lãi suất tiết kiệm", "VCB")).toBe(true);
  });

  it("VN30 index ticker matches (alphanumeric boundary, number suffix)", () => {
    // "vn30" followed by space is a whole word
    expect(tickerWholeWordMatch("vn30 futures settled higher", "VN30")).toBe(true);
  });

  it("HNX30 ticker matches when standalone", () => {
    expect(tickerWholeWordMatch("hnx30 index gained 0.5%", "HNX30")).toBe(true);
  });

  it("case-insensitive: uppercase ticker matches lowercase text", () => {
    expect(tickerWholeWordMatch("fpt tăng mạnh", "FPT")).toBe(true);
  });

  it("ticker at end separated by punctuation", () => {
    expect(tickerWholeWordMatch("mua ngay fpt.", "FPT")).toBe(true);
  });

  it("ticker surrounded by punctuation only", () => {
    expect(tickerWholeWordMatch("(bid)", "BID")).toBe(true);
  });
});
