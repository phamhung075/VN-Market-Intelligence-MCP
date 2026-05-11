// src/__tests__/247-leadership-signal.test.ts
import { describe, it, expect } from "bun:test";
import {
  classifyInsiderTransaction,
  detectMassInsiderBuy,
  type InsiderTransaction,
  type LeadershipSignal,
} from "../domain/services/leadershipSignal.js";

const OUTSTANDING = 1_000_000_000;

function makeTx(overrides: Partial<InsiderTransaction> = {}): InsiderTransaction {
  return {
    code: "VCB",
    insiderName: "Nguyen Van A",
    position: "CEO",
    type: "buy",
    volume: 5_000_000,
    registeredVolume: 5_000_000,
    price: 80_000,
    date: "2026-03-01",
    ...overrides,
  };
}

describe("Task 247 — Leadership Signal Detector", () => {
  it("returns a LeadershipSignal with required fields", () => {
    const signal = classifyInsiderTransaction(makeTx(), OUTSTANDING) as LeadershipSignal;
    expect(signal).toHaveProperty("type");
    expect(signal).toHaveProperty("severity");
    expect(signal).toHaveProperty("code");
    expect(signal).toHaveProperty("insiderName");
    expect(signal).toHaveProperty("position");
    expect(signal).toHaveProperty("volumePctOutstanding");
    expect(signal).toHaveProperty("direction");
    expect(signal).toHaveProperty("confidence");
    expect(signal).toHaveProperty("reasoning");
  });

  it("CEO buys >0.5% outstanding → insider_buy, HIGH, up", () => {
    const tx = makeTx({ position: "CEO", type: "buy", volume: 6_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.type).toBe("insider_buy");
    expect(signal.severity).toBe("high");
    expect(signal.direction).toBe("up");
  });

  it("CFO buys >0.5% outstanding → insider_buy, HIGH, up", () => {
    const tx = makeTx({ position: "CFO", type: "buy", volume: 6_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.type).toBe("insider_buy");
    expect(signal.severity).toBe("high");
    expect(signal.direction).toBe("up");
  });

  it("CEO sells 100% of holdings → insider_sell, CRITICAL, down", () => {
    const tx = makeTx({
      position: "CEO",
      type: "sell",
      volume: 10_000_000,
      registeredVolume: 10_000_000,
    });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.type).toBe("insider_sell");
    expect(signal.severity).toBe("critical");
    expect(signal.direction).toBe("down");
  });

  it("Board member sells >50% of holdings → insider_sell, HIGH, down", () => {
    const tx = makeTx({
      position: "Board",
      type: "sell",
      volume: 7_000_000,
      registeredVolume: 10_000_000,
    });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.type).toBe("insider_sell");
    expect(signal.severity).toBe("high");
    expect(signal.direction).toBe("down");
  });

  it("transaction <0.1% outstanding → returns null (filtered)", () => {
    const tx = makeTx({ volume: 500_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING);
    expect(signal).toBeNull();
  });

  it("Board buy between 0.1% and 0.5% → medium severity, up", () => {
    const tx = makeTx({ position: "Board", type: "buy", volume: 2_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("medium");
    expect(signal!.direction).toBe("up");
  });

  it("volumePctOutstanding is computed correctly", () => {
    const tx = makeTx({ volume: 10_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.volumePctOutstanding).toBeCloseTo(1.0, 2);
  });

  it("confidence is between 0 and 1", () => {
    const signal = classifyInsiderTransaction(makeTx({ volume: 6_000_000 }), OUTSTANDING)!;
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
  });

  it("preserves the stock code from input", () => {
    const tx = makeTx({ code: "HPG", volume: 6_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(signal.code).toBe("HPG");
  });

  it("detectMassInsiderBuy: 3 insiders buy within window → mass_insider_buy, HIGH", () => {
    const txs: InsiderTransaction[] = [
      makeTx({ insiderName: "A", position: "CEO", volume: 2_000_000, date: "2026-03-01" }),
      makeTx({ insiderName: "B", position: "CFO", volume: 2_000_000, date: "2026-03-10" }),
      makeTx({ insiderName: "C", position: "Board", volume: 2_000_000, date: "2026-03-20" }),
    ];
    const signal = detectMassInsiderBuy(txs, 30);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("mass_insider_buy");
    expect(signal!.severity).toBe("high");
    expect(signal!.direction).toBe("up");
  });

  it("detectMassInsiderBuy: only 1 insider → returns null", () => {
    const txs: InsiderTransaction[] = [
      makeTx({ insiderName: "A", position: "CEO", volume: 2_000_000 }),
    ];
    const result = detectMassInsiderBuy(txs, 30);
    expect(result).toBeNull();
  });

  it("detectMassInsiderBuy: insiders outside 30-day window → returns null", () => {
    const txs: InsiderTransaction[] = [
      makeTx({ insiderName: "A", date: "2026-01-01", volume: 2_000_000 }),
      makeTx({ insiderName: "B", date: "2026-02-15", volume: 2_000_000 }),
      makeTx({ insiderName: "C", date: "2026-03-20", volume: 2_000_000 }),
    ];
    const result = detectMassInsiderBuy(txs, 30);
    expect(result).toBeNull();
  });

  it("detectMassInsiderBuy: empty array → returns null", () => {
    expect(detectMassInsiderBuy([], 30)).toBeNull();
  });

  it("reasoning is a non-empty string", () => {
    const tx = makeTx({ volume: 6_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING)!;
    expect(typeof signal.reasoning).toBe("string");
    expect(signal.reasoning.length).toBeGreaterThan(0);
  });

  it("Chairman buys >0.5% outstanding → HIGH BULLISH", () => {
    const tx = makeTx({ position: "Chairman", type: "buy", volume: 6_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING);
    expect(signal).not.toBeNull();
    expect(signal!.severity).toBe("high");
    expect(signal!.direction).toBe("up");
  });

  it("Other position buy 0.5% → at most medium severity", () => {
    const tx = makeTx({ position: "Other", type: "buy", volume: 5_000_000 });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING);
    expect(signal).not.toBeNull();
    expect(["low", "medium"]).toContain(signal!.severity);
  });

  it("CEO sells <50% holdings → medium bearish", () => {
    const tx = makeTx({
      position: "CEO",
      type: "sell",
      volume: 3_000_000,
      registeredVolume: 10_000_000,
    });
    const signal = classifyInsiderTransaction(tx, OUTSTANDING);
    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe("down");
    expect(signal!.severity).not.toBe("critical");
  });

  it("does not mutate input transaction", () => {
    const tx = makeTx({ volume: 6_000_000 });
    const originalCode = tx.code;
    const originalVolume = tx.volume;
    classifyInsiderTransaction(tx, OUTSTANDING);
    expect(tx.code).toBe(originalCode);
    expect(tx.volume).toBe(originalVolume);
  });
});
