/**
 * Task 1272a — RED Phase: Insider Selling Sentiment Distinction Tests
 *
 * Tests for insider selling articles (CEO dumping shares — "xả hàng", "bán sạch", "thoái sạch")
 * correctly classified as BEARISH and cascade logic properly fires.
 *
 * RED Phase Strategy:
 *  - TC-1272-1 & TC-1272-2: Should PASS (sentiment classifier already correct)
 *  - TC-1272-3 & TC-1272-4: Should FAIL (contract tests for missing fix logic)
 *
 * Failure hypothesis:
 *  - Sentiment is inverted somewhere (bearish → bullish)
 *  - OR detectInsiderDumpPeers has wrong condition logic
 *  - OR cascade firing logic doesn't respect sentiment direction
 */

import { describe, it, expect } from "bun:test";
import { classifySentiment, type SentimentResult, type SentimentDirection } from "../domain/services/sentimentClassifier.js";
import { detectInsiderDumpPeers } from "../application/cascadeExecutor.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";

function dir(result: SentimentResult): SentimentDirection {
  return result.direction;
}

describe("Task 1272a — RED Phase: Insider Selling Sentiment Distinction", () => {
  describe("TC-1272-1: Sentiment classifier marks 'xả hàng' as BEARISH (should PASS)", () => {
    it("detects 'Tổng giám đốc xả hàng cổ phiếu' as bearish", () => {
      const result = classifySentiment("Tổng giám đốc xả hàng cổ phiếu");
      expect(result.direction).toBe("bearish");
      expect(result.keywords).toContain("xả hàng");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("includes 'xả hàng' in detected keywords for bearish sentiment", () => {
      const result = classifySentiment("CEO xả hàng khối lượng lớn");
      expect(result.direction).toBe("bearish");
      expect(result.keywords.includes("xả hàng")).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("TC-1272-2: Sentiment classifier marks 'bán sạch' as BEARISH (should PASS)", () => {
    it("detects 'CEO bán sạch cổ phiếu sau 15 năm' as bearish", () => {
      const result = classifySentiment("CEO bán sạch cổ phiếu sau 15 năm");
      expect(result.direction).toBe("bearish");
      expect(result.keywords).toContain("bán sạch");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("includes 'bán sạch' in detected keywords for bearish sentiment", () => {
      const result = classifySentiment("Lãnh đạo công ty bán sạch cổ phiếu");
      expect(result.direction).toBe("bearish");
      expect(result.keywords.includes("bán sạch")).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("TC-1272-3: detectInsiderDumpPeers respects sentiment direction (should FAIL — contract test)", () => {
    it("requires BEARISH sentiment and returns peers when conditions met", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
      ];

      // Article with sell keyword: "xả hàng" → must be bearish, must trigger cascade
      const peers = detectInsiderDumpPeers(
        "Tổng giám đốc VCB xả hàng cổ phiếu khối lượng lớn",
        ["VCB"],
        watchlist,
      );

      // Cascade should fire because sentiment is bearish + keyword matches
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("BID");
      expect(peers).toContain("CTG");
      expect(peers).not.toContain("VCB"); // No circular
      expect(peers).not.toContain("FPT"); // Non-banking excluded
    });
  });

  describe("TC-1272-4: Mixed sentiment text with sell keyword remains BEARISH (should FAIL — contract test)", () => {
    it("Mixed bullish/bearish text with xả hàng = net BEARISH", () => {
      const result = classifySentiment(
        "Công ty phát triển tốt nhưng CEO xả hàng cổ phiếu sau 10 năm lãnh đạo"
      );

      // Even with "phát triển tốt" (positive), xả hàng (weight=3) should dominate
      expect(result.direction).toBe("bearish");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.keywords).toContain("xả hàng");
    });

    it("Mixed text with bán sạch keyword triggers cascade correctly", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
      ];

      // Mixed positive context + insider sell action
      const peers = detectInsiderDumpPeers(
        "VCB báo cáo lợi nhuận tăng nhưng CEO bán sạch cổ phiếu",
        ["VCB"],
        watchlist,
      );

      // Should still cascade because xả hàng/bán sạch keyword dominates
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("BID");
      expect(peers).toContain("CTG");
    });
  });

  describe("Regression: Existing bearish keywords still work", () => {
    it("still detects 'thoái sạch' as bearish", () => {
      expect(dir(classifySentiment("Thoái sạch vốn khỏi công ty"))).toBe("bearish");
    });

    it("still detects 'rút vốn' as bearish", () => {
      expect(dir(classifySentiment("Nhà đầu tư rút vốn khỏi thị trường"))).toBe("bearish");
    });

    it("still detects bullish keywords like 'tăng mạnh'", () => {
      expect(dir(classifySentiment("Cổ phiếu tăng mạnh hôm nay"))).toBe("bullish");
    });

    it("still detects bullish keywords like 'bứt phá'", () => {
      expect(dir(classifySentiment("VCB bứt phá lên đỉnh lịch sử"))).toBe("bullish");
    });
  });
});
