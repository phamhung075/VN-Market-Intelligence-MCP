import { describe, it, expect } from "bun:test";
import { detectSignals } from "../domain/services/signalDetector.js";

describe("1402 volume-spike-multiplier isolation", () => {
  const outsideAtc = new Date("2026-04-18T10:00:00Z"); // 10:00 UTC — safe, well outside ATC window

  it("ticker A (avgVol=1M) produces 10.0× multiplier", () => {
    const signals = detectSignals(
      { actionCode: "AAA", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 1_000_000 },
      { _now: outsideAtc }
    );
    const spike = signals.find(s => s.type === "volume_spike");
    expect(spike).toBeDefined();
    expect(spike!.message).toContain("10.0×");
  });

  it("ticker B (avgVol=5M) produces 2.0× multiplier", () => {
    const signals = detectSignals(
      { actionCode: "BBB", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 5_000_000 },
      { _now: outsideAtc }
    );
    const spike = signals.find(s => s.type === "volume_spike");
    expect(spike).toBeDefined();
    expect(spike!.message).toContain("2.0×");
  });

  it("multipliers are distinct between ticker A and ticker B", () => {
    const signalsA = detectSignals(
      { actionCode: "AAA", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 1_000_000 },
      { _now: outsideAtc }
    );
    const signalsB = detectSignals(
      { actionCode: "BBB", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 5_000_000 },
      { _now: outsideAtc }
    );
    const spikeA = signalsA.find(s => s.type === "volume_spike");
    const spikeB = signalsB.find(s => s.type === "volume_spike");
    expect(spikeA).toBeDefined();
    expect(spikeB).toBeDefined();
    expect(spikeA!.message).not.toBe(spikeB!.message);
  });

  it("ATC boundary 08:35 UTC suppresses spike", () => {
    const atcEdge = new Date("2026-04-18T08:35:00Z");
    const signals = detectSignals(
      { actionCode: "AAA", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 1_000_000 },
      { _now: atcEdge }
    );
    const spike = signals.find(s => s.type === "volume_spike");
    expect(spike).toBeUndefined(); // RED until fix in 1403 — current guard only covers utcM <= 5, not <= 35
  });

  it("08:30 UTC (post-close flush) suppresses spike", () => {
    const postClose = new Date("2026-04-18T08:30:00Z");
    const signals = detectSignals(
      { actionCode: "AAA", price: 10000, previousPrice: 10000, volume: 10_000_000, avgVolume: 1_000_000 },
      { _now: postClose }
    );
    const spike = signals.find(s => s.type === "volume_spike");
    expect(spike).toBeUndefined(); // RED until fix in 1403 — 08:30 UTC outside current guard (utcM <= 5)
  });
});
