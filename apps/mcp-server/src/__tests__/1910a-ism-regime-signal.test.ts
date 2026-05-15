/**
 * Task 1910a — ISM Regime Signal Domain Tests
 *
 * Pure domain tests for computeIsmRegimeSignal().
 * Zero infra imports — DDD compliance.
 *
 * 6 tests covering 4+ fixture cases:
 *   T1 — EXPANDING fixture: new_orders > 50 AND new_orders > prices_paid
 *   T2 — CONTRACTING fixture: new_orders < 50 AND employment < 50
 *   T3 — MIXED fixture: new_orders > 50 BUT new_orders <= prices_paid (cost-push)
 *   T4 — MIXED fixture: new_orders at boundary (== 50)
 *   T5 — null-input: any null sub-component → MIXED
 *   T6 — DDD audit: source file has zero infra/interface imports
 */

import { describe, it, expect } from "bun:test";
import {
  computeIsmRegimeSignal,
  type IsmSubcomponentInput,
  type IsmRegimeResult,
} from "../domain/services/macro/ismRegimeSignal.js";

// ===========================================================================
// T1 — EXPANDING fixture
// ===========================================================================

describe("T1 — EXPANDING: new_orders > 50 AND new_orders > prices_paid", () => {
  it("classifies EXPANDING when new_orders=58, employment=52, prices_paid=52", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 58.4,
      employment: 52.1,
      prices_paid: 52.3,
      backlog: 51.0,
    };
    const result: IsmRegimeResult = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("EXPANDING");
    expect(result.new_orders).toBe(58.4);
    expect(result.employment).toBe(52.1);
    expect(result.prices_paid).toBe(52.3);
    expect(result.backlog).toBe(51.0);
  });

  it("classifies EXPANDING when new_orders=62, prices_paid=55 (demand > cost-push)", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 62.0,
      employment: 48.0,
      prices_paid: 55.0,
      backlog: null,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("EXPANDING");
  });
});

// ===========================================================================
// T2 — CONTRACTING fixture
// ===========================================================================

describe("T2 — CONTRACTING: new_orders < 50 AND employment < 50", () => {
  it("classifies CONTRACTING when new_orders=43.5, employment=46.2, prices_paid=58.0", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 43.5,
      employment: 46.2,
      prices_paid: 58.0,
      backlog: 42.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("CONTRACTING");
    expect(result.new_orders).toBe(43.5);
    expect(result.employment).toBe(46.2);
  });

  it("classifies CONTRACTING when new_orders=45, employment=44 (both below 50)", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 45.0,
      employment: 44.0,
      prices_paid: 60.0,
      backlog: null,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("CONTRACTING");
  });
});

// ===========================================================================
// T3 — MIXED fixture: cost-push (new_orders > 50 but <= prices_paid)
// ===========================================================================

describe("T3 — MIXED: new_orders > 50 but prices_paid >= new_orders (cost-push)", () => {
  it("classifies MIXED when new_orders=53, prices_paid=58 (stagflation signal)", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 53.0,
      employment: 51.0,
      prices_paid: 58.0,
      backlog: 47.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
  });

  it("classifies MIXED when new_orders equals prices_paid exactly", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 55.0,
      employment: 53.0,
      prices_paid: 55.0,
      backlog: 50.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
  });
});

// ===========================================================================
// T4 — MIXED fixture: new_orders at boundary (== 50)
// ===========================================================================

describe("T4 — MIXED: boundary condition new_orders == 50", () => {
  it("classifies MIXED when new_orders=50 (boundary, not > 50 nor < 50)", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 50.0,
      employment: 48.0,
      prices_paid: 45.0,
      backlog: 50.0,
    };
    const result = computeIsmRegimeSignal(input);
    // new_orders == 50: fails "< 50" for CONTRACTING; fails "> 50" for EXPANDING
    expect(result.regime_signal).toBe("MIXED");
  });

  it("classifies MIXED when new_orders < 50 but employment >= 50 (conflicting)", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 48.0,
      employment: 51.0, // employment NOT below 50 → not CONTRACTING
      prices_paid: 44.0,
      backlog: 47.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
  });
});

// ===========================================================================
// T5 — null-input: any null sub-component → MIXED
// ===========================================================================

describe("T5 — null inputs → MIXED", () => {
  it("returns MIXED when new_orders is null", () => {
    const input: IsmSubcomponentInput = {
      new_orders: null,
      employment: 52.0,
      prices_paid: 48.0,
      backlog: 50.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
    expect(result.new_orders).toBeNull();
  });

  it("returns MIXED when employment is null", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 55.0,
      employment: null,
      prices_paid: 48.0,
      backlog: null,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
    expect(result.employment).toBeNull();
  });

  it("returns MIXED when prices_paid is null", () => {
    const input: IsmSubcomponentInput = {
      new_orders: 57.0,
      employment: 52.0,
      prices_paid: null,
      backlog: 49.0,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
    expect(result.prices_paid).toBeNull();
  });

  it("returns MIXED when all inputs are null", () => {
    const input: IsmSubcomponentInput = {
      new_orders: null,
      employment: null,
      prices_paid: null,
      backlog: null,
    };
    const result = computeIsmRegimeSignal(input);
    expect(result.regime_signal).toBe("MIXED");
  });
});

// ===========================================================================
// T6 — DDD audit: no infra/interface imports in domain file
// ===========================================================================

describe("T6 — DDD audit: computeIsmRegimeSignal has zero infra imports", () => {
  it("domain file has no infrastructure or interface imports", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL(
        "../domain/services/macro/ismRegimeSignal.ts",
        import.meta.url,
      ),
      "utf-8",
    );
    // Strip comment lines before checking
    const codeLines = src
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toMatch(/from ['"].*infrastructure/);
    expect(codeLines).not.toMatch(/from ['"].*interface/);
    expect(codeLines).not.toMatch(/Date\.now\(\)/);
    expect(codeLines).not.toMatch(/bun:sqlite/);
  });
});
