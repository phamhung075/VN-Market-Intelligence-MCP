/**
 * FIX-BDI-SHIPPING-STALE-404-GUARD — get_supply_chain_exposure serves stale
 * BDI as current
 *
 * Problem (router RAW-verify 2026-06-21): get_supply_chain_exposure served
 * "BDI: 1,400 (+0.0%) — 2026-04-07" under a CURRENT header, concluding
 * "Chuỗi cung ứng ổn định". The value was ~2.5 months stale — ^BDI Yahoo has
 * been permanently HTTP 404 since 2026-04, so tracked_indicators' last
 * shipping_bdi row (written before the endpoint died) is served forever with
 * no staleness check. Same CLASS as DSI-MACRO-PHANTOM-STALE-GUARD (stale
 * value served as current) — new BDI/supply-chain instance.
 *
 * Fix (two seams, both reuse the DSI-MACRO-PHANTOM-STALE-GUARD shared
 * staleness helper — TRACKED_INDICATOR_STALE_MS / listTrackedIndicatorsFromDb,
 * epoch-ms compare, no per-service reinvented threshold):
 *   1. supplyChainTools.ts readShippingIndicesFromDb() — now filters out
 *      stale tracked_indicators rows instead of a raw "latest row" query.
 *   2. buildSupplyChainExposureOutput() — no longer defaults to "ổn định"
 *      when indices=[] (all shipping indices stale/absent).
 *   3. shippingIndex.ts fetchSymbolData() — the `?? Date.now() / 1000`
 *      fallback (root cause called out in the task) that FABRICATED
 *      freshness when the source omitted a timestamp is removed; a missing
 *      timestamp now surfaces as no-data (skips the symbol), which flows
 *      through fetchShippingIndices() into commodityTrackerRefreshJob's
 *      Block 2 without any job-level code change needed — the guard lives
 *      at the shared fetch seam both the serve path and the refresh job
 *      already call through.
 *
 * Tests:
 *   GUARD-1: readShippingIndicesFromDb — stale shipping_bdi row (>4h) EXCLUDED
 *   GUARD-2: readShippingIndicesFromDb — fresh shipping_bdi row (≤4h) INCLUDED
 *   GUARD-3: readShippingIndicesFromDb — partial staleness: stale BDI excluded,
 *            fresh FBX still served (guard is generic, not BDI-hardcoded)
 *   GUARD-4: buildSupplyChainExposureOutput — indices=[] (all stale/absent)
 *            does NOT conclude "ổn định" — surfaces an explicit no-data summary
 *   GUARD-5 (regression control): buildSupplyChainExposureOutput — a
 *            genuinely fresh index set with no signals still concludes
 *            "ổn định" as before (guard must not swallow the real case)
 *   GUARD-6: fetchSymbolData (via fetchShippingIndices) — missing
 *            regularMarketTime is treated as no-data, NOT fabricated as "now"
 *   GUARD-7 (regression control): fetchSymbolData — a symbol WITH a real
 *            regularMarketTime still serves normally (timestamp preserved,
 *            not overridden)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  readShippingIndicesFromDb,
  buildSupplyChainExposureOutput,
} from "../interface/mcp/tools/sector/supplyChainTools.js";
import { fetchShippingIndices } from "../infrastructure/fetchers/shippingIndex.js";

// ─────────────────────────────────────────────────────────────────────────────
// DB fixture helpers (mirrors DSI-MACRO-PHANTOM-STALE-GUARD.test.ts pattern)
// ─────────────────────────────────────────────────────────────────────────────

function buildMinimalDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tracked_indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'yahoo_shipping',
      extracted_at TEXT NOT NULL,
      data_env TEXT
    );
  `);
  return db;
}

/** Insert a tracked_indicators row with a given age in hours (synthetic epoch — no date literal). */
function insertTrackedRow(
  db: Database,
  indicator: string,
  value: number,
  ageHours: number,
): void {
  const extractedAt = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  db.prepare(
    `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
     VALUES (?, ?, 'points', 'yahoo_shipping', ?)`,
  ).run(indicator, value, extractedAt);
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-1..3: readShippingIndicesFromDb staleness gate
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BDI-SHIPPING-STALE-404-GUARD — readShippingIndicesFromDb staleness gate", () => {
  it("GUARD-1: stale shipping_bdi row (>4h old) is EXCLUDED from served indices", () => {
    const db = buildMinimalDb();
    // Mirrors the live scenario: last successful BDI write is months old —
    // any age beyond the shared 4h threshold must gate it out.
    insertTrackedRow(db, "shipping_bdi", 1400, 6);

    const indices = readShippingIndicesFromDb(db);

    expect(indices.find((i) => i.name === "BDI")).toBeUndefined();
  });

  it("GUARD-2: fresh shipping_bdi row (≤4h old) IS served normally", () => {
    const db = buildMinimalDb();
    insertTrackedRow(db, "shipping_bdi", 1550, 1);

    const indices = readShippingIndicesFromDb(db);
    const bdi = indices.find((i) => i.name === "BDI");

    expect(bdi).toBeDefined();
    expect(bdi!.value).toBe(1550);
  });

  it("GUARD-3: stale BDI excluded while a fresh FBX index is still served (generic guard, not BDI-only)", () => {
    const db = buildMinimalDb();
    insertTrackedRow(db, "shipping_bdi", 1400, 24); // very stale
    insertTrackedRow(db, "shipping_fbx_asia_us", 3200, 1); // fresh

    const indices = readShippingIndicesFromDb(db);

    expect(indices.find((i) => i.name === "BDI")).toBeUndefined();
    const fbx = indices.find((i) => i.name === "FBX_ASIA_US");
    expect(fbx).toBeDefined();
    expect(fbx!.value).toBe(3200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-4..5: buildSupplyChainExposureOutput conclusion honesty
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BDI-SHIPPING-STALE-404-GUARD — buildSupplyChainExposureOutput conclusion", () => {
  it("GUARD-4: indices=[] (all stale/absent) does NOT conclude 'ổn định' — surfaces explicit no-data", () => {
    const output = buildSupplyChainExposureOutput([], [], null);

    expect(output).not.toContain("ổn định");
    // Explicit honest no-data summary, not a fabricated "stable" verdict.
    expect(output).toMatch(/Không đủ dữ liệu/);
  });

  it("GUARD-5 (regression control): fresh indices with no signals still conclude 'ổn định' as before", () => {
    const output = buildSupplyChainExposureOutput(
      [{ name: "BDI", value: 1550, change: 0, changePct: 0, date: "2026-07-24" }],
      [],
      null,
    );

    expect(output).toContain("ổn định");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARD-6..7: shippingIndex.ts fetch-layer — no fabricated "now" timestamp
// ─────────────────────────────────────────────────────────────────────────────

function makeClient(meta: Record<string, unknown>) {
  return {
    async get(_url: string): Promise<string> {
      return JSON.stringify({ chart: { result: [{ meta }] } });
    },
  };
}

describe("FIX-BDI-SHIPPING-STALE-404-GUARD — fetchSymbolData no-fabricated-timestamp guard", () => {
  it("GUARD-6: missing regularMarketTime is treated as no-data — symbol is skipped, not fabricated as 'now'", async () => {
    const client = makeClient({
      regularMarketPrice: 1400,
      previousClose: 1400,
      // regularMarketTime intentionally omitted
      symbol: "^BDI",
    });

    const indices = await fetchShippingIndices(client as never);

    // The old code fabricated timestamp=Date.now()/1000 and returned a
    // "current" BDI entry. The fix must NOT surface BDI at all when the
    // source gave no verifiable timestamp.
    expect(indices.find((i) => i.name === "BDI")).toBeUndefined();
  });

  it("GUARD-7 (regression control): a symbol WITH a real regularMarketTime still serves normally", async () => {
    const client = makeClient({
      regularMarketPrice: 1650,
      previousClose: 1600,
      regularMarketTime: Math.floor(Date.now() / 1000) - 3600, // 1h ago, real value
      symbol: "^BDI",
    });

    const indices = await fetchShippingIndices(client as never);
    const bdi = indices.find((i) => i.name === "BDI");

    expect(bdi).toBeDefined();
    expect(bdi!.value).toBe(1650);
  });
});
