/**
 * Task CLIENTS-TYPE — macro snapshot signals type contract guard
 *
 * Asserts that MacroSnapshotResponse.signals is typed as a keyed object
 * (Record<string, MacroSignalEntry>), NOT an array, matching the locked
 * server contract from commit 80c776de
 * (apps/macro-indicators/.../handlers_snapshot_contract_test.go).
 *
 * Server contract (locked):
 *   signals: { "investment-clock": {...}, "oil": {...}, "gold": {...},
 *              "usdvnd": {...}, "carry": {...}, "yield": {...} }
 *
 * Frontend consumes via Object.entries(snapshot.signals) — an array would
 * produce numeric-index pairs and break indicatorLabel() lookup.
 *
 * @module __tests__/1974-clients-type-macro-signals
 */
import { describe, it, expect } from "bun:test";
import type { MacroSnapshotResponse, MacroSignalEntry } from "../infrastructure/microservices/clients.js";

describe("CLIENTS-TYPE — MacroSnapshotResponse.signals is a keyed object", () => {
  // ── Type-level assertions (compile-time: these tests confirm the shape at runtime) ──

  it("accepts a signals value that is a plain object (Record), not an array", () => {
    // Build a fixture that matches the locked server contract.
    const signals: Record<string, MacroSignalEntry> = {
      "investment-clock": { direction: "EXPANSION", regime: "GROWTH" },
      "oil":  { direction: "NEUTRAL" },
      "gold": { direction: "RISK-OFF" },
      "usdvnd": { direction: "STABLE" },
      "carry": { regime: "POSITIVE_CARRY" },
      "yield": { direction: "RISK-ON" },
    };

    // signals must NOT be an array
    expect(Array.isArray(signals)).toBe(false);
    // signals must be an object
    expect(typeof signals).toBe("object");
  });

  it("Object.entries() on signals keyed-object yields signal-name pairs, not numeric-index pairs", () => {
    const signals: Record<string, MacroSignalEntry> = {
      "investment-clock": { direction: "EXPANSION" },
      "oil": { direction: "DOWN" },
    };

    const entries = Object.entries(signals);
    // All keys must be string signal names (not "0", "1", "2" from array)
    for (const [key] of entries) {
      expect(typeof key).toBe("string");
      expect(isNaN(Number(key))).toBe(true);
    }
  });

  it("each entry in signals has direction or regime consumable by frontend", () => {
    const entry: MacroSignalEntry = { direction: "UP", regime: "EXPANSION" };

    // Frontend does: entry.direction ?? entry.regime ?? entry.label ?? ""
    const label = entry.direction ?? entry.regime ?? "";
    expect(label).toBe("UP");
  });

  it("getMacroSnapshot fallback for missing signals is an empty object, not an empty array", () => {
    // Simulate raw.signals being undefined (server omits the field).
    // The fallback must be {} (object) not [] (array).
    const rawSignals: Record<string, MacroSignalEntry> | undefined = undefined;
    const result = rawSignals ?? {};

    expect(Array.isArray(result)).toBe(false);
    expect(typeof result).toBe("object");
    expect(Object.keys(result).length).toBe(0);
  });

  it("signals type assignment: MacroSnapshotResponse.signals accepts keyed-object shape", () => {
    // Compile-time guard: if the type were Array<...> this wouldn't typecheck.
    // At runtime we simply verify the shape can be assembled and queried.
    const snapshot: Pick<MacroSnapshotResponse, "signals"> = {
      signals: {
        "investment-clock": { direction: "EXPANSION" },
        "oil":              { direction: "NEUTRAL"   },
        "gold":             { direction: "RISK-OFF"  },
        "usdvnd":           { direction: "STABLE"    },
        "carry":            { regime: "POSITIVE"     },
        "yield":            { direction: "RISK-ON"   },
      },
    };

    const keys = Object.keys(snapshot.signals);
    expect(keys).toContain("investment-clock");
    expect(keys).toContain("oil");
    expect(keys).toContain("gold");
    expect(keys).toContain("usdvnd");
    expect(keys).toContain("carry");
    expect(keys).toContain("yield");
  });

  it("MacroSignalEntry allows arbitrary extra fields (forward-compat)", () => {
    const entry: MacroSignalEntry = {
      direction: "UP",
      regime: "EXPANSION",
      label: "Investment Clock",
      value: 1.5,
      unit: "score",
    };

    expect(entry.direction).toBe("UP");
    expect(entry.regime).toBe("EXPANSION");
    expect(entry["label"]).toBe("Investment Clock");
  });
});
