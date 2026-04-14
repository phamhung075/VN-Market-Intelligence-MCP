import { describe, test, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("Task 1212 — interest rate cooling keywords", () => {
  test("AC-3: 'lãi suất hạ nhiệt, NHNN giữ nguyên lãi suất điều hành' → bullish", () => {
    const r = classifySentiment(
      "lãi suất hạ nhiệt, NHNN giữ nguyên lãi suất điều hành"
    );
    expect(r.direction).toBe("bullish");
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
    expect(r.keywords).toContain("lãi suất hạ nhiệt");
  });

  test("'hạ nhiệt lãi suất' variant also detected", () => {
    const r = classifySentiment("hạ nhiệt lãi suất tác động tích cực thị trường");
    expect(r.direction).toBe("bullish");
    expect(r.keywords).toContain("hạ nhiệt lãi suất");
  });

  test("co-occurring bearish: 'lãi suất hạ nhiệt nhưng lo ngại lạm phát' → neutral/slight bullish", () => {
    const r = classifySentiment(
      "lãi suất hạ nhiệt nhưng lo ngại lạm phát cao"
    );
    // bullishScore: "lãi suất hạ nhiệt" w=2
    // bearishScore: "lo ngại" w=1 — result bullish (2 > 1)
    expect(r.direction).not.toBe("bearish");
  });

  test("English: 'interest rate cooling signals dovish Fed' → bullish", () => {
    const r = classifySentiment("interest rate cooling signals dovish Fed");
    expect(r.direction).toBe("bullish");
    expect(r.keywords).toContain("interest rate cooling");
  });
});
