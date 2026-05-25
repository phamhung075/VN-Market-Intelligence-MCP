/**
 * Tests for formatSignalTypeLabel — P1-B3
 */
import { describe, it, expect } from "vitest";
import { formatSignalTypeLabel } from "./signal-type-label";

describe("formatSignalTypeLabel", () => {
  it("maps chain_catalyst to cascade", () => {
    expect(formatSignalTypeLabel("chain_catalyst")).toBe("cascade");
  });

  it("maps urgent_news to news", () => {
    expect(formatSignalTypeLabel("urgent_news")).toBe("news");
  });

  it("maps price_anomaly to price", () => {
    expect(formatSignalTypeLabel("price_anomaly")).toBe("price");
  });

  it("maps cross_validate to validate", () => {
    expect(formatSignalTypeLabel("cross_validate")).toBe("validate");
  });

  it("maps fundamental_validation to BCTC", () => {
    expect(formatSignalTypeLabel("fundamental_validation")).toBe("BCTC");
  });

  it("maps price_confirmation to confirm", () => {
    expect(formatSignalTypeLabel("price_confirmation")).toBe("confirm");
  });

  it("maps verified_chain to verified", () => {
    expect(formatSignalTypeLabel("verified_chain")).toBe("verified");
  });

  it("maps signal_feedback to feedback", () => {
    expect(formatSignalTypeLabel("signal_feedback")).toBe("feedback");
  });

  it("unknown key passes through unchanged", () => {
    expect(formatSignalTypeLabel("some_unknown_type")).toBe("some_unknown_type");
  });

  it("empty string passes through unchanged", () => {
    expect(formatSignalTypeLabel("")).toBe("");
  });
});
