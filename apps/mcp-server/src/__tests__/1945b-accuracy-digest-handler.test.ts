/**
 * Task 1945b-backend — GET /api/accuracy/digest HTTP handler tests
 *
 * AC-6: Handler clamps `days` param to [1, 90]
 * AC-1: 200 response with correct shape
 * AC-3: DB error returns 500
 * AC-4: Zero-struct (no signal_outcome rows) returns 200 with totalResolved=0
 *
 * Test cases:
 *   TC-1: days=30 (explicit default) → 200 + correct shape + generatedAt
 *   TC-2: days=999 (clamp-hi) → calls function with days=90, returns 200
 *   TC-3: days=0 (clamp-lo) → calls function with days=1, returns 200
 *   TC-4: days absent → defaults to days=30, returns 200
 *   TC-5: function throws → returns 500 { error: "internal error" }
 *   TC-6: zero-struct response (no signal_outcome rows) → 200 + totalResolved=0 + empty bySignalType
 *
 * Mock strategy:
 *   mock.module() is registered ONCE at the top level with a mutable delegate.
 *   createBunServer is loaded via dynamic await import() AFTER mock.module() to
 *   ensure Bun's module cache returns the mocked signalOutcomeStore to server.ts.
 *   Per-test control is achieved by reassigning _digestImpl in beforeEach.
 *   For TC-1 to TC-4 and TC-6: delegate returns controlled structs.
 *   For TC-5: delegate throws.
 *   TC-2 and TC-3 verify the `days` argument received by the delegate.
 */

// ── DB isolation: must precede all imports ─────────────────────────────────
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { SystemAccuracyDigestStats } from "../infrastructure/db/signalOutcomeStore.js";
import type { Database } from "bun:sqlite";

// ── Mutable delegate state ──────────────────────────────────────────────────
// mock.module() is called ONCE; per-test behaviour is controlled by swapping
// _digestImpl before each test case.

type DigestFn = (db: Database, days?: number) => SystemAccuracyDigestStats;

const ZERO_STRUCT: SystemAccuracyDigestStats = {
  totalResolved: 0,
  totalCorrect: 0,
  overallRate: null,
  bySignalType: [],
  newStocksCount: 0,
  neutralOnlyRows: 0,
};

const NORMAL_STRUCT: SystemAccuracyDigestStats = {
  totalResolved: 42,
  totalCorrect: 30,
  overallRate: 0.714,
  bySignalType: [
    { signal_type: "rsi_oversold", correct: 10, total: 12, rate: 0.833 },
  ],
  newStocksCount: 5,
  neutralOnlyRows: 3,
};

// Captures the last `days` value passed to the delegate for assertion.
let _lastDaysCalled: number | undefined = undefined;

// Default delegate: returns zero struct (safe, no DB access).
let _digestImpl: DigestFn = (_db, days = 30) => {
  _lastDaysCalled = days;
  return ZERO_STRUCT;
};

// ── mock.module MUST precede dynamic import of server ──────────────────────
mock.module("../infrastructure/db/signalOutcomeStore.js", () => ({
  // Pass-through stubs for functions not under test
  seedSignalOutcome: () => {},
  resolveSignalOutcomes: async () => ({ resolved: 0, errors: 0 }),
  getAccuracyStats: () => null,
  // SUT: mutable delegate controls per-test behaviour
  getSystemAccuracyDigestStats: (db: Database, days = 30) => _digestImpl(db, days),
}));

// ── Dynamic import AFTER mock.module ──────────────────────────────────────
// Using await import() ensures Bun's module cache returns the mocked version
// of signalOutcomeStore to server.ts (static imports are hoisted before mock).
const { createBunServer } = await import("../interface/mcp/server.js");
const { initDatabase, closeDb } = await import("../infrastructure/db/schema.js");

// ── Server lifecycle ────────────────────────────────────────────────────────

type BunServerInstance = Awaited<ReturnType<typeof createBunServer>>;
let server: BunServerInstance;
let base: string;

beforeAll(async () => {
  closeDb();
  await initDatabase();
  server = await createBunServer({ port: 0 });
  base = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
  closeDb();
});

beforeEach(() => {
  _lastDaysCalled = undefined;
  // Reset to default: returns ZERO_STRUCT, safe no-throw.
  _digestImpl = (_db, days = 30) => {
    _lastDaysCalled = days;
    return ZERO_STRUCT;
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function isoRegex(): RegExp {
  // Matches ISO-8601 format: 2026-05-18T12:34:56.000Z
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/;
}

// ── TC-1: days=30 (explicit default) ────────────────────────────────────────

describe("TC-1 — days=30 explicit default", () => {
  it("returns 200 with correct shape and generatedAt field", async () => {
    _digestImpl = (_db, days = 30) => {
      _lastDaysCalled = days;
      return NORMAL_STRUCT;
    };

    const res = await fetch(`${base}/api/accuracy/digest?days=30`);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    // Shape check
    expect(typeof body["totalResolved"]).toBe("number");
    expect(typeof body["totalCorrect"]).toBe("number");
    expect(Array.isArray(body["bySignalType"])).toBe(true);
    expect(typeof body["generatedAt"]).toBe("string");
    expect((body["generatedAt"] as string)).toMatch(isoRegex());

    // Correct days passed through
    expect(_lastDaysCalled).toBe(30);
  });
});

// ── TC-2: days=999 → clamp to 90 ────────────────────────────────────────────

describe("TC-2 — days=999 clamped to 90 (R-4 upper bound)", () => {
  it("clamps days=999 to 90 before calling function, returns 200", async () => {
    const res = await fetch(`${base}/api/accuracy/digest?days=999`);

    expect(res.status).toBe(200);
    // days must be clamped to 90 before function call (R-4 mitigation)
    expect(_lastDaysCalled).toBe(90);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body["generatedAt"]).toBe("string");
  });
});

// ── TC-3: days=0 → clamp to 1 ───────────────────────────────────────────────

describe("TC-3 — days=0 clamped to 1 (R-4 lower bound)", () => {
  it("clamps days=0 to 1 before calling function, returns 200", async () => {
    const res = await fetch(`${base}/api/accuracy/digest?days=0`);

    expect(res.status).toBe(200);
    // days must be clamped to 1 before function call (R-4 mitigation)
    expect(_lastDaysCalled).toBe(1);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body["generatedAt"]).toBe("string");
  });
});

// ── TC-4: days absent → default 30 ──────────────────────────────────────────

describe("TC-4 — days param absent → defaults to 30", () => {
  it("defaults to days=30 when param is missing and returns 200", async () => {
    const res = await fetch(`${base}/api/accuracy/digest`);

    expect(res.status).toBe(200);
    expect(_lastDaysCalled).toBe(30);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body["generatedAt"]).toBe("string");
  });
});

// ── TC-5: DB error → 500 ────────────────────────────────────────────────────

describe("TC-5 — function throws → 500 error response", () => {
  it("returns 500 { error: 'internal error' } when getSystemAccuracyDigestStats throws", async () => {
    _digestImpl = () => {
      throw new Error("simulated DB failure");
    };

    const res = await fetch(`${base}/api/accuracy/digest?days=30`);

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body["error"]).toBe("internal error");
  });
});

// ── TC-6: zero-struct response → 200 + totalResolved=0 ──────────────────────

describe("TC-6 — zero-struct (no signal_outcomes rows) → 200 with empty digest", () => {
  it("returns 200 with totalResolved=0 and empty bySignalType when table is empty", async () => {
    // Default _digestImpl already returns ZERO_STRUCT
    const res = await fetch(`${base}/api/accuracy/digest?days=30`);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body["totalResolved"]).toBe(0);
    expect(body["totalCorrect"]).toBe(0);
    expect(body["overallRate"]).toBeNull();
    expect(Array.isArray(body["bySignalType"])).toBe(true);
    expect((body["bySignalType"] as unknown[]).length).toBe(0);
    expect(typeof body["generatedAt"]).toBe("string");
    expect((body["generatedAt"] as string)).toMatch(isoRegex());
  });
});
