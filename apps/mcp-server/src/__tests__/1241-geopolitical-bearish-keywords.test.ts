/**
 * Task 1241 — Geopolitical escalation keywords missing — "phong tỏa", "đàm phán đổ vỡ" default to BULLISH
 *
 * Problem: "phong tỏa" (blockade/lockdown) and "đàm phán đổ vỡ" (talks broke down)
 * are classified as BULLISH because no explicit bearish rule existed for them.
 * These are geopolitical risk escalation signals — must be BEARISH.
 *
 * Acceptance criteria:
 *   AC-1: "phong tỏa" in article → sentiment BEARISH (not bullish)
 *   AC-2: "đàm phán đổ vỡ" → sentiment BEARISH
 *   AC-3: "leo thang căng thẳng" → sentiment BEARISH
 *   AC-4: "phong tỏa" alone (without oil context) → bearish in geopolitical context
 *   AC-5: "đàm phán đổ vỡ" does not override existing bullish news when paired
 *
 * Layer: domain/services (sentimentClassifier.ts)
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("Task 1241 — Geopolitical escalation keywords: bearish classification", () => {

  it("AC-1: 'phong tỏa thương mại' → BEARISH", () => {
    const result = classifySentiment("Mỹ thực hiện phong tỏa thương mại với Trung Quốc.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-1b: 'phong tỏa' standalone context → BEARISH", () => {
    const result = classifySentiment("Lệnh phong tỏa khiến nền kinh tế đình trệ hoàn toàn.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-2: 'đàm phán đổ vỡ' → BEARISH", () => {
    const result = classifySentiment("Đàm phán đổ vỡ sau khi các bên không đạt được thỏa thuận.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-3: 'leo thang căng thẳng' → BEARISH", () => {
    const result = classifySentiment("Tình hình leo thang căng thẳng tại Trung Đông gây lo ngại cho thị trường.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-3b: 'căng thẳng leo thang' (reversed word order) → BEARISH", () => {
    const result = classifySentiment("Căng thẳng leo thang giữa các cường quốc khiến dòng vốn rút khỏi EM.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-4: 'phá vỡ đàm phán' (negotiation breakdown) → BEARISH", () => {
    const result = classifySentiment("Các bên đã phá vỡ đàm phán, không có thỏa thuận nào được ký kết.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-4b: 'talks collapsed' (English equivalent) → BEARISH", () => {
    const result = classifySentiment("Talks collapsed between major powers over trade dispute.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-4c: 'negotiations failed' → BEARISH", () => {
    const result = classifySentiment("Negotiations failed to resolve the military standoff.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-5: keywords are recognized (confidence > 0)", () => {
    const result = classifySentiment("Phong tỏa và đàm phán đổ vỡ gây áp lực lên thị trường.");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.direction).toBe("bearish");
  });
});
