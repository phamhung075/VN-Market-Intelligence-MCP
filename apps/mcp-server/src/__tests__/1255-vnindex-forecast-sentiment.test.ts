// src/__tests__/1255-vnindex-forecast-sentiment.test.ts
//
// Task 1255 — VN-Index upside forecast articles should classify as BULLISH
//
// Bug report 1258: Article "VN-Index hướng tới mốc 1800 điểm" was classified
// NEUTRAL because the sentiment classifier had no keyword for directional
// forecast phrases ("hướng tới mốc", "dự báo tăng", "kỳ vọng đạt").
//
// Acceptance criteria:
//   AC-1: "VN-Index hướng tới mốc 1800 điểm" → BULLISH
//   AC-2: "dự báo VN-Index đạt 1800 điểm" → BULLISH
//   AC-3: "kỳ vọng thị trường tăng lên 1700 điểm" → BULLISH
//   AC-4: "target price" headline → BULLISH (regression guard existing word)
//   AC-5: Generic bearish article not misclassified (regression guard)

import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("Task 1255 — VN-Index forecast sentiment", () => {
  it("AC-1: 'VN-Index hướng tới mốc 1800 điểm' → BULLISH", () => {
    const result = classifySentiment("VN-Index hướng tới mốc 1800 điểm theo dự báo các công ty chứng khoán");
    expect(result.direction).toBe("bullish");
  });

  it("AC-2: 'dự báo VN-Index đạt 1800 điểm' → BULLISH", () => {
    const result = classifySentiment("dự báo VN-Index đạt 1800 điểm cuối năm 2026");
    expect(result.direction).toBe("bullish");
  });

  it("AC-3: 'kỳ vọng thị trường tăng lên 1700' → BULLISH", () => {
    const result = classifySentiment("kỳ vọng thị trường tăng lên 1700 điểm trong quý 3");
    expect(result.direction).toBe("bullish");
  });

  it("AC-4: Existing 'surge' keyword still triggers BULLISH (regression)", () => {
    const result = classifySentiment("VN stocks surge on positive earnings");
    expect(result.direction).toBe("bullish");
  });

  it("AC-5: 'thị trường giảm mạnh rủi ro cao' stays BEARISH (regression)", () => {
    const result = classifySentiment("thị trường giảm mạnh rủi ro cao trong bối cảnh bất ổn");
    expect(result.direction).toBe("bearish");
  });
});
