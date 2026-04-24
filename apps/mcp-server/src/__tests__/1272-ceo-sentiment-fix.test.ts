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

/**
 * Task 1272b — GREEN Phase: Insider Selling Sentiment Cascade Validation
 *
 * Validates that the insider selling sentiment fix works end-to-end:
 * sentiment classifier → cascade executor → peer notification chain
 *
 * All 4 tests should PASS (implementation already correct from sprint 1278b)
 */
describe("Task 1272b — GREEN Phase: Insider Selling Sentiment Cascade Validation", () => {
  describe("GC-1272-1: Full cascade flow for insider dump (keyword → sentiment → peers)", () => {
    it("returns correct banking peers (BID/VCB/CTG/ACB) when CEO dumps shares", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "ACB", domain: "banking", exchange: "HOSE" },
        { actionCode: "VNM", domain: "agriculture", exchange: "HOSE" },
        { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
      ];

      // Article about VCB CEO dumping shares (insider sell signal)
      const peers = detectInsiderDumpPeers(
        "Tổng giám đốc ngân hàng Việt Nam VCB xả hàng khối lượng lớn cổ phiếu sau 12 năm lãnh đạo",
        ["VCB"],
        watchlist,
      );

      // Assertion 1: Must return peers list (not empty)
      expect(peers.length).toBeGreaterThan(0);

      // Assertion 2: Must include all banking peers except VCB
      expect(peers).toContain("BID");
      expect(peers).toContain("CTG");
      expect(peers).toContain("ACB");

      // Assertion 3: Must NOT include original stock (circular cascade protection)
      expect(peers).not.toContain("VCB");

      // Assertion 4: Must NOT include non-banking stocks
      expect(peers).not.toContain("VNM");
      expect(peers).not.toContain("HPG");

      // Assertion 5: Verify sentiment is bearish (cascade trigger)
      const sentiment = classifySentiment(
        "Tổng giám đốc ngân hàng Việt Nam VCB xả hàng khối lượng lớn cổ phiếu sau 12 năm lãnh đạo"
      );
      expect(sentiment.direction).toBe("bearish");
      expect(sentiment.confidence).toBeGreaterThan(0.6);
      expect(sentiment.keywords).toContain("xả hàng");
    });

    it("handles multi-keyword insider dump articles correctly", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "ACB", domain: "banking", exchange: "HOSE" },
      ];

      // Article with multiple insider dump keywords
      const article = "Lãnh đạo BID bán sạch và thoái sạch vốn khỏi công ty";

      const peers = detectInsiderDumpPeers(article, ["BID"], watchlist);

      // Must fire cascade because both bán sạch and thoái sạch are matched
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("CTG");
      expect(peers).toContain("ACB");
      expect(peers).not.toContain("BID");

      // Verify sentiment
      const sentiment = classifySentiment(article);
      expect(sentiment.direction).toBe("bearish");
      expect(sentiment.keywords.length).toBeGreaterThanOrEqual(2); // At least 2 dump keywords
    });
  });

  describe("GC-1272-2: Mixed text (bullish context + bearish keyword) cascades with bearish sentiment", () => {
    it("keyword dominance: xả hàng overrides positive context in sentiment scoring", () => {
      // Mixed article with bullish context + bearish keyword
      // bullishScore = tăng trưởng (2) + tăng mạnh (2) = 4
      // bearishScore = xả hàng (3) + rút vốn (2) = 5
      // confidence = 5 / (4+5) = 0.556, which is still <= 0.6
      // Add more bearish to exceed 0.6: need bearishScore > 4*bullishScore
      const article = "CTG báo cáo tăng mạnh nhưng CEO xả hàng cổ phiếu khối lượng lớn, rút vốn";

      const sentiment = classifySentiment(article);

      // Assertion 1: Despite positive context, xả hàng + rút vốn = bearish dominance
      expect(sentiment.direction).toBe("bearish");
      // For cascade to fire, confidence must exceed 0.6
      // bearishScore = xả hàng(3) + rút vốn(2) = 5
      // bullishScore = tăng mạnh(2) = 2
      // confidence = 5/7 = 0.714 > 0.6 ✓
      expect(sentiment.confidence).toBeGreaterThan(0.6);

      // Assertion 2: Keyword extraction shows both bullish and bearish keywords detected
      expect(sentiment.keywords).toContain("xả hàng");
      expect(sentiment.keywords).toContain("tăng mạnh"); // Bullish also detected

      // Assertion 3: Cascade must still fire because sentiment is bearish
      const watchlist: WatchlistEntry[] = [
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(article, ["CTG"], watchlist);
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("BID");
      expect(peers).toContain("VCB");
    });

    it("mixed sentiment with bán sạch still triggers bearish cascade", () => {
      // bullishScore = tăng (1) = 1
      // bearishScore = bán sạch(3) + thoái vốn(2) = 5
      // confidence = 5/6 = 0.833 > 0.6 ✓
      const article = "ACB tăng nhưng CEO bán sạch toàn bộ cổ phiếu, thoái vốn khỏi công ty";

      const sentiment = classifySentiment(article);

      // Bearish keywords (bán sạch + thoái vốn) dominate
      expect(sentiment.direction).toBe("bearish");
      expect(sentiment.confidence).toBeGreaterThan(0.6);

      // Cascade fires
      const watchlist: WatchlistEntry[] = [
        { actionCode: "ACB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(article, ["ACB"], watchlist);
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("BID");
    });
  });

  describe("GC-1272-3: Non-banking stocks excluded from peers (e.g., VNM/FPT filtered out)", () => {
    it("filters out tech and agriculture non-banking stocks from cascade", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
        { actionCode: "VNM", domain: "agriculture", exchange: "HOSE" },
        { actionCode: "VNG", domain: "tech", exchange: "HOSE" },
        { actionCode: "MWG", domain: "retail", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(
        "Tổng giám đốc VCB xả hàng cổ phiếu",
        ["VCB"],
        watchlist,
      );

      // Assertion 1: Only banking stocks (BID, CTG) in result
      expect(peers.length).toBe(2);
      expect(peers).toContain("BID");
      expect(peers).toContain("CTG");

      // Assertion 2: Tech stocks excluded
      expect(peers).not.toContain("FPT");
      expect(peers).not.toContain("VNG");

      // Assertion 3: Agriculture and retail stocks excluded
      expect(peers).not.toContain("VNM");
      expect(peers).not.toContain("MWG");

      // Assertion 4: Original banking stock excluded
      expect(peers).not.toContain("VCB");
    });

    it("handles mixed watchlist with only banking domain peers returned", () => {
      const watchlist: WatchlistEntry[] = [
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
        { actionCode: "ACB", domain: "banking", exchange: "HOSE" },
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        // Majority non-banking
        { actionCode: "HPG", domain: "steel", exchange: "HOSE" },
        { actionCode: "FPT", domain: "tech", exchange: "HOSE" },
        { actionCode: "VNM", domain: "agriculture", exchange: "HOSE" },
        { actionCode: "GAS", domain: "oil_gas", exchange: "HOSE" },
        { actionCode: "KDH", domain: "real_estate", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(
        "Lãnh đạo BID bán sạch cổ phiếu",
        ["BID"],
        watchlist,
      );

      // Only banking peers
      expect(peers.length).toBe(3); // BID excluded, so CTG + ACB + VCB
      expect(peers).toContain("CTG");
      expect(peers).toContain("ACB");
      expect(peers).toContain("VCB");

      // Non-banking excluded
      expect(peers).not.toContain("HPG");
      expect(peers).not.toContain("FPT");
      expect(peers).not.toContain("VNM");
      expect(peers).not.toContain("GAS");
      expect(peers).not.toContain("KDH");
    });
  });

  describe("GC-1272-4: Confidence scoring applied correctly (>0.6 threshold)", () => {
    it("high-confidence xả hàng articles trigger cascade", () => {
      const article = "Tổng giám đốc xả hàng cổ phiếu";

      const sentiment = classifySentiment(article);

      // xả hàng is high-weight (3), so confidence should exceed 0.6
      expect(sentiment.direction).toBe("bearish");
      expect(sentiment.confidence).toBeGreaterThan(0.6);

      // Cascade fires
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(article, ["VCB"], watchlist);
      expect(peers.length).toBeGreaterThan(0);
      expect(peers).toContain("BID");
    });

    it("multi-keyword articles accumulate confidence above threshold", () => {
      // Article with multiple insider dump keywords (bán sạch + thoái sạch)
      const article = "Lãnh đạo VCB bán sạch và thoái sạch vốn khỏi công ty sau 15 năm";

      const sentiment = classifySentiment(article);

      // Multiple bearish keywords: bán sạch (3) + thoái sạch (3) = cumulative weight
      // Should produce confidence > 0.6
      expect(sentiment.direction).toBe("bearish");
      expect(sentiment.confidence).toBeGreaterThan(0.6);
      expect(sentiment.keywords.length).toBeGreaterThanOrEqual(2);

      // Cascade fires with high confidence
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
        { actionCode: "CTG", domain: "banking", exchange: "HOSE" },
      ];

      const peers = detectInsiderDumpPeers(article, ["VCB"], watchlist);
      expect(peers.length).toBe(2); // BID and CTG
      expect(peers).toContain("BID");
      expect(peers).toContain("CTG");
    });

    it("confidence threshold blocks cascade on weak sentiment", () => {
      // Ambiguous article: has dump keyword but weak context
      // (This tests the confidence > 0.6 guard on line 65)
      const watchlist: WatchlistEntry[] = [
        { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
        { actionCode: "BID", domain: "banking", exchange: "HOSE" },
      ];

      // Test with a generic article that has the keyword but may be borderline
      // In practice, single-word articles have lower confidence
      const article = "xả hàng";

      const sentiment = classifySentiment(article);
      const peers = detectInsiderDumpPeers(article, ["VCB"], watchlist);

      // If confidence is below 0.6, cascade does not fire (empty array)
      if (sentiment.confidence <= 0.6) {
        expect(peers.length).toBe(0);
      } else {
        // If confidence > 0.6, cascade fires
        expect(peers.length).toBeGreaterThan(0);
      }
    });
  });
});
