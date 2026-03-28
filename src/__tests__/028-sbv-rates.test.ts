/**
 * Task 028 — SBV (State Bank of Vietnam) Macro Fetcher Tests
 *
 * Tests cover:
 *   SBV-01: successful parse of both pages (all 3 fields populated)
 *   SBV-02: overnight rate parse from interest rate table
 *   SBV-03: refinancing rate parse from interest rate table
 *   SBV-04: USD/VND official rate parse with Vietnamese number format (dot-stripping)
 *   SBV-05: interest rate page fails → rate fields=0, FX still works
 *   SBV-06: FX page fails → FX field=0, rates still work
 *   SBV-07: both pages fail → returns null
 *   SBV-08: HTTP error → returns null, no throw
 *   SBV-09: missing table rows → fields=0
 *   SBV-10: storeSbvSnapshot upsert semantics
 *   SBV-11: storeSbvSnapshot history append
 *   SBV-12: barrel export check
 *   SBV-13: fetchedAt is ISO 8601
 *   SBV-14: bilingual label matching (Vietnamese labels work too)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  fetchSbvRates,
  storeSbvSnapshot,
  type SbvMacroSnapshot,
} from "../infrastructure/fetchers/sbv.js";

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

/** Interest rate page fixture — English labels */
const RATES_HTML_EN = `
<html>
<body>
<table>
  <thead><tr><th>Name of interest rate</th><th>Rate (%/year)</th></tr></thead>
  <tbody>
    <tr><td>Overnight</td><td>4.50</td></tr>
    <tr><td>Refinancing rate</td><td>6.00</td></tr>
    <tr><td>Discount rate</td><td>4.00</td></tr>
  </tbody>
</table>
</body>
</html>
`;

/** Interest rate page fixture — Vietnamese labels */
const RATES_HTML_VI = `
<html>
<body>
<table>
  <thead><tr><th>Tên lãi suất</th><th>Lãi suất (%/năm)</th></tr></thead>
  <tbody>
    <tr><td>Qua đêm</td><td>4.50</td></tr>
    <tr><td>Tái cấp vốn</td><td>6.00</td></tr>
    <tr><td>Chiết khấu</td><td>4.00</td></tr>
  </tbody>
</table>
</body>
</html>
`;

/** FX page fixture — USD/VND with Vietnamese number format (dots as thousand separators) */
const FX_HTML = `
<html>
<body>
<table>
  <thead><tr><th>Currency</th><th>Buy</th><th>Sell</th><th>Transfer</th></tr></thead>
  <tbody>
    <tr><td>USD</td><td>24.000</td><td>24.250</td><td>24.150</td></tr>
    <tr><td>EUR</td><td>26.000</td><td>26.500</td><td>26.200</td></tr>
  </tbody>
</table>
</body>
</html>
`;

/** FX page fixture with comma as decimal separator for VND large numbers */
const FX_HTML_COMMA = `
<html>
<body>
<table>
  <thead><tr><th>Currency</th><th>Buy</th><th>Sell</th><th>Transfer</th></tr></thead>
  <tbody>
    <tr><td>USD</td><td>24.150,00</td><td>24.250,00</td><td>24.200,00</td></tr>
  </tbody>
</table>
</body>
</html>
`;

/** Empty table HTML — no matching rows */
const EMPTY_TABLE_HTML = `
<html>
<body>
<table>
  <thead><tr><th>Name</th><th>Value</th></tr></thead>
  <tbody></tbody>
</table>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Mock HTTP client factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock HttpClient that returns different HTML based on URL path.
 * - URLs containing "/rm/ir" → interest rate page
 * - URLs containing "/rm/ex" → FX page
 */
function makeMockClient(options: {
  ratesHtml?: string | Error;
  fxHtml?: string | Error;
} = {}): { get(url: string): Promise<string> } {
  const { ratesHtml = RATES_HTML_EN, fxHtml = FX_HTML } = options;

  return {
    async get(url: string): Promise<string> {
      if (url.includes("/rm/ir")) {
        if (ratesHtml instanceof Error) throw ratesHtml;
        return ratesHtml;
      }
      if (url.includes("/rm/ex")) {
        if (fxHtml instanceof Error) throw fxHtml;
        return fxHtml;
      }
      throw new Error(`Unexpected URL in mock: ${url}`);
    },
  };
}

// ---------------------------------------------------------------------------
// DB setup helpers
// ---------------------------------------------------------------------------

let testDb: Database;

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source TEXT PRIMARY KEY,
      overnight_rate_pct REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      overnight_rate_pct REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official REAL NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sbv_history_source_time
      ON sbv_rates_history(source, fetched_at DESC);
  `);
  return db;
}

beforeEach(() => {
  testDb = setupTestDb();
});

afterEach(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 028 — SBV Macro Fetcher", () => {

  // ── SBV-01: Both pages succeed → all 3 fields populated ─────────────────
  it("SBV-01: successful parse of both pages returns all 3 fields", async () => {
    const client = makeMockClient();
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.overnightRatePct).toBeGreaterThan(0);
    expect(snapshot!.refinancingRatePct).toBeGreaterThan(0);
    expect(snapshot!.usdVndOfficial).toBeGreaterThan(0);
  });

  // ── SBV-02: Overnight rate parsed correctly ───────────────────────────────
  it("SBV-02: parses overnight rate from interest rate table", async () => {
    const client = makeMockClient();
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.overnightRatePct).toBe(4.5);
  });

  // ── SBV-03: Refinancing rate parsed correctly ─────────────────────────────
  it("SBV-03: parses refinancing rate from interest rate table", async () => {
    const client = makeMockClient();
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.refinancingRatePct).toBe(6.0);
  });

  // ── SBV-04: USD/VND parsed with Vietnamese number format (dot-stripping) ──
  it("SBV-04: parses USD/VND official rate with Vietnamese dot-thousand format", async () => {
    const client = makeMockClient({ fxHtml: FX_HTML });
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    // FX_HTML has USD row: Buy=24.000, Sell=24.250, Transfer=24.150
    // Implementation picks Transfer rate (official mid-rate used in accounting).
    // "24.150" in Vietnamese format → strip dots → 24150
    expect(snapshot!.usdVndOfficial).toBe(24150);
  });

  // ── SBV-05: Interest rate page fails → rates=0, FX still works ───────────
  it("SBV-05: interest rate page failure sets rate fields to 0, FX still populated", async () => {
    const client = makeMockClient({
      ratesHtml: new Error("Interest rate page unavailable"),
    });
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.overnightRatePct).toBe(0);
    expect(snapshot!.refinancingRatePct).toBe(0);
    expect(snapshot!.usdVndOfficial).toBeGreaterThan(0);
  });

  // ── SBV-06: FX page fails → FX=0, rates still work ──────────────────────
  it("SBV-06: FX page failure sets usdVndOfficial to 0, rates still populated", async () => {
    const client = makeMockClient({
      fxHtml: new Error("FX page unavailable"),
    });
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.usdVndOfficial).toBe(0);
    expect(snapshot!.overnightRatePct).toBeGreaterThan(0);
    expect(snapshot!.refinancingRatePct).toBeGreaterThan(0);
  });

  // ── SBV-07: Both pages fail → returns null ──────────────────────────────
  it("SBV-07: both pages fail returns null", async () => {
    const client = makeMockClient({
      ratesHtml: new Error("Interest rate page down"),
      fxHtml: new Error("FX page down"),
    });
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).toBeNull();
  });

  // ── SBV-08: HTTP error → returns null, never throws ──────────────────────
  it("SBV-08: HTTP error returns null without throwing", async () => {
    const client = {
      async get(_url: string): Promise<string> {
        throw new Error("Network error");
      },
    };

    let threw = false;
    let result: SbvMacroSnapshot | null = null;

    try {
      result = await fetchSbvRates(client);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  // ── SBV-09: Missing table rows → fields=0 ────────────────────────────────
  it("SBV-09: empty tables result in zero-filled fields", async () => {
    const client = makeMockClient({
      ratesHtml: EMPTY_TABLE_HTML,
      fxHtml: EMPTY_TABLE_HTML,
    });
    const snapshot = await fetchSbvRates(client);

    // Both pages succeeded (no error) but no rows matched
    // → overnight=0, refinancing=0, usdVnd=0
    // Both pages returned HTML with no matching rows → snapshot could be null
    // (since both gave data but zero values; the spec says null only if BOTH pages FAIL)
    // Here pages didn't fail (no error thrown), just no rows matched → snapshot with 0s
    expect(snapshot).not.toBeNull();
    expect(snapshot!.overnightRatePct).toBe(0);
    expect(snapshot!.refinancingRatePct).toBe(0);
    expect(snapshot!.usdVndOfficial).toBe(0);
  });

  // ── SBV-10: storeSbvSnapshot upsert semantics ────────────────────────────
  it("SBV-10: storeSbvSnapshot upserts latest row (INSERT OR REPLACE)", () => {
    const snapshot1: SbvMacroSnapshot = {
      overnightRatePct: 4.5,
      refinancingRatePct: 6.0,
      usdVndOfficial: 24000,
      fetchedAt: new Date().toISOString(),
    };
    const snapshot2: SbvMacroSnapshot = {
      overnightRatePct: 5.0,
      refinancingRatePct: 6.5,
      usdVndOfficial: 24100,
      fetchedAt: new Date().toISOString(),
    };

    storeSbvSnapshot(snapshot1, testDb);
    storeSbvSnapshot(snapshot2, testDb);

    const rows = testDb
      .query<{ overnight_rate_pct: number; refinancing_rate_pct: number; usd_vnd_official: number }, []>(
        "SELECT overnight_rate_pct, refinancing_rate_pct, usd_vnd_official FROM sbv_rates WHERE source = 'sbv'"
      )
      .all();

    // Upsert → only 1 row in sbv_rates
    expect(rows.length).toBe(1);
    const latestRow = rows[0]!;
    expect(latestRow.overnight_rate_pct).toBe(5.0);
    expect(latestRow.refinancing_rate_pct).toBe(6.5);
    expect(latestRow.usd_vnd_official).toBe(24100);
  });

  // ── SBV-11: storeSbvSnapshot history append ──────────────────────────────
  it("SBV-11: storeSbvSnapshot appends to history table on each call", () => {
    const snapshot1: SbvMacroSnapshot = {
      overnightRatePct: 4.5,
      refinancingRatePct: 6.0,
      usdVndOfficial: 24000,
      fetchedAt: new Date(Date.now() - 3600_000).toISOString(),
    };
    const snapshot2: SbvMacroSnapshot = {
      overnightRatePct: 5.0,
      refinancingRatePct: 6.5,
      usdVndOfficial: 24100,
      fetchedAt: new Date().toISOString(),
    };

    storeSbvSnapshot(snapshot1, testDb);
    storeSbvSnapshot(snapshot2, testDb);

    const histRows = testDb
      .query<{ id: number }, []>("SELECT id FROM sbv_rates_history")
      .all();

    // Two calls → two history rows
    expect(histRows.length).toBe(2);
  });

  // ── SBV-12: Barrel export check ──────────────────────────────────────────
  it("SBV-12: fetchSbvRates and storeSbvSnapshot are re-exported from the barrel index", async () => {
    // Read the barrel file and verify the sbv.js exports are listed.
    // We use a file-content check rather than a live import to avoid the
    // module-level side effect in hnx.ts (ensureExchangeColumn) which requires
    // an already-initialized DB.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const indexPath = join(
      import.meta.dir,
      "../infrastructure/fetchers/index.ts",
    );
    const content = readFileSync(indexPath, "utf-8");

    expect(content).toContain("fetchSbvRates");
    expect(content).toContain("storeSbvSnapshot");
    expect(content).toContain("sbv.js");
  });

  // ── SBV-13: fetchedAt is ISO 8601 ────────────────────────────────────────
  it("SBV-13: returned snapshot fetchedAt is a valid ISO 8601 timestamp", async () => {
    const client = makeMockClient();
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    // ISO 8601 format: must be parseable as a Date
    const parsed = new Date(snapshot!.fetchedAt);
    expect(isNaN(parsed.getTime())).toBe(false);
    // Should contain "T" separator typical of ISO 8601
    expect(snapshot!.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ── SBV-14: Bilingual label matching ────────────────────────────────────
  it("SBV-14: Vietnamese labels in HTML are also matched correctly", async () => {
    const client = makeMockClient({ ratesHtml: RATES_HTML_VI });
    const snapshot = await fetchSbvRates(client);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.overnightRatePct).toBe(4.5);
    expect(snapshot!.refinancingRatePct).toBe(6.0);
  });
});
