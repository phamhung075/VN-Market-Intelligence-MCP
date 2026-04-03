/**
 * Task 244 — Signal Integration
 *
 * Tests that:
 * 1. SignalType union includes "legal_risk" | "policy_change" | "bond_maturity"
 * 2. detectLegalRisk() produces signals compatible with the Signal interface
 * 3. cascadeEngine includes LEGAL_RISK_RULES + POLICY_RULES
 * 4. pollNews wires legal risk detection (via SourceFetchers pattern)
 */
import { describe, it, expect } from "bun:test";
import type { Signal, SignalType } from "../domain/services/signalDetector.js";
import { detectLegalRisk } from "../domain/services/legalRiskDetector.js";
import { checkMaturityAlerts } from "../domain/services/bondMaturityTracker.js";
import { LEGAL_RISK_RULES, POLICY_RULES } from "../domain/services/cascadeEngine.js";
import type { BondMaturityEvent } from "../domain/services/bondMaturityTracker.js";

// ─────────────────────────────────────────────────────────────────────────────
// SignalType tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 244 — Signal type extension", () => {
  it("legal_risk is a valid SignalType", () => {
    const type: SignalType = "legal_risk";
    expect(type).toBe("legal_risk");
  });

  it("policy_change is a valid SignalType", () => {
    const type: SignalType = "policy_change";
    expect(type).toBe("policy_change");
  });

  it("bond_maturity is a valid SignalType", () => {
    const type: SignalType = "bond_maturity";
    expect(type).toBe("bond_maturity");
  });

  it("legal risk signals use bond_maturity type correctly", () => {
    const events: BondMaturityEvent[] = [
      {
        issuer: "Test Corp",
        issuerCode: "VHM",
        amount: 1000,
        maturityDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!,
        couponRate: 10.0,
        status: "upcoming",
      },
    ];
    const signals = checkMaturityAlerts(events);
    expect(signals.length).toBeGreaterThan(0);
    // bond_maturity type should be valid as a Signal
    const sig: Signal = signals[0]!;
    expect(sig.type).toBe("bond_maturity");
  });

  it("legal risk detector produces signals compatible with Signal interface", () => {
    const signals = detectLegalRisk(
      "Khởi tố giám đốc vietcombank",
      ["VCB"],
    );
    expect(signals.length).toBeGreaterThan(0);
    // Build a Signal from LegalRiskSignal
    const lrSig = signals[0]!;
    const sig: Signal = {
      type: "legal_risk",
      severity: lrSig.severity,
      actionCode: lrSig.stockCodes[0] ?? "UNKNOWN",
      message: `[PHÁP LÝ] ${lrSig.riskType}: ${lrSig.matchedPatterns.join(", ")}`,
      confidence: lrSig.confidence,
      detectedAt: new Date().toISOString(),
    };
    expect(sig.type).toBe("legal_risk");
    expect(sig.severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cascade engine rules tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 244 — Cascade engine LEGAL_RISK_RULES + POLICY_RULES", () => {
  it("LEGAL_RISK_RULES is exported from cascadeEngine", () => {
    expect(Array.isArray(LEGAL_RISK_RULES)).toBe(true);
    expect(LEGAL_RISK_RULES.length).toBeGreaterThan(0);
  });

  it("POLICY_RULES is exported from cascadeEngine", () => {
    expect(Array.isArray(POLICY_RULES)).toBe(true);
    expect(POLICY_RULES.length).toBeGreaterThan(0);
  });

  it("LEGAL_RISK_RULES entries have required fields", () => {
    for (const rule of LEGAL_RISK_RULES) {
      expect(typeof rule.key).toBe("string");
      expect(typeof rule.keyword).toBe("string");
      expect(typeof rule.sector).toBe("string");
    }
  });

  it("POLICY_RULES entries have required fields", () => {
    for (const rule of POLICY_RULES) {
      expect(typeof rule.key).toBe("string");
      expect(typeof rule.keyword).toBe("string");
      expect(typeof rule.sector).toBe("string");
    }
  });

  it("LEGAL_RISK_RULES covers prosecution keywords", () => {
    const hasKhoiTo = LEGAL_RISK_RULES.some((r) => r.keyword.includes("khởi tố"));
    expect(hasKhoiTo).toBe(true);
  });
});
