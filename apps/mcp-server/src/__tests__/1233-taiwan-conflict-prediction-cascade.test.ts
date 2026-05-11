/**
 * Task 1233 — Taiwan conflict prediction market has no sector/stock mapping
 *
 * Polymarket markets about Taiwan conflict don't map to VN stocks despite
 * clear exposure via supply chain:
 *   - FPT: tech supply chain (semiconductors from Taiwan)
 *   - VEA (Vinamotor): auto parts supply chain from Taiwan
 *   - GEX (Gelex): electronics manufacturing with Taiwan components
 *
 * These should trigger BEARISH signals for supply chain disruption.
 */

import { describe, test, expect } from "bun:test";
import { mapPredictionToVn } from "../../src/domain/services/predictionCascadeMapper.js";

describe("Task 1233 — Taiwan conflict → FPT/VEA/GEX supply chain cascade", () => {
  test("AC-1: 'Taiwan strait' maps to FPT as affected stock (BEARISH)", () => {
    const result = mapPredictionToVn(
      "Will Taiwan strait tensions escalate in 2026?",
      ["taiwan", "geopolitical", "supply chain"]
    );
    const hasMapping = result.some((m) => m.stocks.includes("FPT"));
    expect(hasMapping).toBe(true);
    const mapping = result.find((m) => m.stocks.includes("FPT"));
    expect(mapping!.direction).toBe("bearish");
  });

  test("AC-2: 'Taiwan strait' maps to VEA and GEX as affected stocks (BEARISH)", () => {
    const result = mapPredictionToVn(
      "Taiwan strait tensions impact on supply chains",
      ["taiwan", "strait", "supply chain"]
    );
    const mapping = result.find(
      (m) => m.stocks.includes("VEA") || m.stocks.includes("GEX")
    );
    expect(mapping).toBeDefined();
    expect(mapping!.direction).toBe("bearish");
  });

  test("AC-3: 'đài loan xung đột' (Vietnamese) maps to tech/supply chain stocks", () => {
    const result = mapPredictionToVn(
      "Xung đột Đài Loan ảnh hưởng chuỗi cung ứng bán dẫn",
      ["đài loan", "xung đột", "bán dẫn"]
    );
    const hasTechMapping = result.some(
      (m) => m.stocks.includes("FPT") || m.stocks.some((s) => ["FPT", "VEA", "GEX"].includes(s))
    );
    expect(hasTechMapping).toBe(true);
  });

  test("AC-4: Taiwan invasion rule fires with direction bearish and stocks", () => {
    const result = mapPredictionToVn(
      "Will China invade Taiwan? Supply chain shock for semiconductor industry",
      ["taiwan", "china", "semiconductor", "supply chain"]
    );
    // Should match Taiwan conflict rule
    const taiwanRule = result.find(
      (m) => m.ruleId.toLowerCase().includes("r15") ||
             m.matchedKeywords.some((kw) => kw.toLowerCase().includes("taiwan"))
    );
    expect(taiwanRule).toBeDefined();
    expect(taiwanRule!.direction).toBe("bearish");
    expect(taiwanRule!.stocks.length).toBeGreaterThan(0);
  });

  test("AC-5: R15 Taiwan rule fires with FPT as affected stock (BEARISH)", () => {
    const result = mapPredictionToVn(
      "Taiwan strait escalation: supply chain disruption for Vietnam tech industry",
      ["taiwan", "supply chain"]
    );
    const taiwanRule = result.find((m) => m.ruleId === "R15");
    expect(taiwanRule).toBeDefined();
    expect(taiwanRule!.stocks.includes("FPT")).toBe(true);
    expect(taiwanRule!.direction).toBe("bearish");
  });
});
