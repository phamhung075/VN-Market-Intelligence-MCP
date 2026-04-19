/**
 * Task 1195 — Cascade keyword "hạ nhiệt" disambiguation: interest-rate vs geopolitical
 *
 * "hạ nhiệt" (cool down) is context-dependent:
 *   - "lạm phát hạ nhiệt" → BULLISH (inflation cooling = dovish signal)
 *   - "lãi suất hạ nhiệt" → BULLISH (rate cooling = already handled Task 1212)
 *   - "thị trường hạ nhiệt" → NEUTRAL (market cooling, ambiguous)
 *   - "xung đột hạ nhiệt" → positive/neutral (conflict de-escalation)
 *   - "tăng trưởng hạ nhiệt" → BEARISH (growth slowing = negative signal)
 *
 * Layer: domain/services (sentimentClassifier.ts)
 */
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { classifySentiment } from "../domain/services/sentimentClassifier.js";

describe("Task 1195 — hạ nhiệt disambiguation", () => {

  it("AC-1: 'lạm phát hạ nhiệt' → BULLISH (inflation cooling = dovish)", () => {
    const result = classifySentiment("Lạm phát hạ nhiệt tại Mỹ, Fed có thể cắt giảm lãi suất sớm hơn.");
    expect(result.direction).toBe("bullish");
  });

  it("AC-2: 'lãi suất hạ nhiệt' → BULLISH (already Task 1212, preserved)", () => {
    const result = classifySentiment("Lãi suất hạ nhiệt sau thông điệp từ Fed, thị trường phản ứng tích cực.");
    expect(result.direction).toBe("bullish");
  });

  it("AC-3: 'hạ nhiệt lãi suất' → BULLISH (already Task 1212, preserved)", () => {
    const result = classifySentiment("Hạ nhiệt lãi suất cho vay giúp thị trường bất động sản hồi phục.");
    expect(result.direction).toBe("bullish");
  });

  it("AC-4: 'tăng trưởng hạ nhiệt' → BEARISH (growth slowing = negative)", () => {
    const result = classifySentiment("Tăng trưởng hạ nhiệt tại Trung Quốc, GDP quý 3 thấp hơn kỳ vọng.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-5: 'tốc độ tăng trưởng hạ nhiệt' → BEARISH", () => {
    const result = classifySentiment("Tốc độ tăng trưởng hạ nhiệt xuống 4.5%, thấp hơn mục tiêu 6%.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-6: 'kinh tế hạ nhiệt' → BEARISH (economy cooling = negative)", () => {
    const result = classifySentiment("Kinh tế hạ nhiệt toàn cầu, nhu cầu tiêu dùng suy yếu.");
    expect(result.direction).toBe("bearish");
  });

  it("AC-7: 'xung đột hạ nhiệt' → not BEARISH (de-escalation = neutral/positive)", () => {
    const result = classifySentiment("Xung đột hạ nhiệt sau vòng đàm phán mới, hai bên đồng ý ngừng bắn.");
    // Should not be bearish — de-escalation is positive or neutral
    expect(result.direction).not.toBe("bearish");
  });

  it("AC-8: 'GDP hạ nhiệt' → BEARISH", () => {
    const result = classifySentiment("GDP hạ nhiệt tại Trung Quốc, ảnh hưởng đến nhu cầu xuất khẩu VN.");
    expect(result.direction).toBe("bearish");
  });
});
