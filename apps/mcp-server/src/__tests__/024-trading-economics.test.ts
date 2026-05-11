Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 024 — Trading Economics Macro Indicator Scraper
 *
 * Tests for:
 *   - fetchMacroIndicators: HTML scraping with injected HttpClient mock
 *   - storeMacroIndicators: SQLite upsert with in-memory DB
 *   - Barrel export from fetchers/index.ts
 *
 * No real network calls are made — all HTTP is mocked via HttpClient injection.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb, getDb } from "../infrastructure/db/schema.js";
import {
  fetchMacroIndicators,
  storeMacroIndicators,
  type MacroIndicators,
} from "../infrastructure/fetchers/tradingEconomics.js";

// ---------------------------------------------------------------------------
// Mock HTML fixtures
// ---------------------------------------------------------------------------

/**
 * Realistic mock HTML table matching the Trading Economics indicators page
 * structure. Uses a simple table with indicator name in first <td> and value
 * in the second <td>.
 */
const MOCK_HTML_FULL = `
<!DOCTYPE html>
<html>
<head><title>Vietnam Economic Indicators</title></head>
<body>
  <table id="ctl00_ContentPlaceHolder1_ctl02_GridView1" class="gview">
    <tbody>
      <tr>
        <td><a href="/vietnam/gdp-growth-rate">GDP Growth Rate</a></td>
        <td class="dataNormal">7.40 %</td>
        <td>Q4 2024</td>
      </tr>
      <tr>
        <td><a href="/vietnam/inflation-cpi">Inflation Rate</a></td>
        <td class="dataNormal">2.84 %</td>
        <td>Feb 2025</td>
      </tr>
      <tr>
        <td><a href="/vietnam/interest-rate">Interest Rate</a></td>
        <td class="dataNormal">4.50 %</td>
        <td>Mar 2025</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

/**
 * HTML where GDP Growth Rate is missing — only CPI and Interest Rate present.
 */
const MOCK_HTML_MISSING_GDP = `
<!DOCTYPE html>
<html>
<body>
  <table>
    <tbody>
      <tr>
        <td><a href="/vietnam/inflation-cpi">Inflation Rate</a></td>
        <td>3.10 %</td>
      </tr>
      <tr>
        <td><a href="/vietnam/interest-rate">Interest Rate</a></td>
        <td>4.50 %</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

/**
 * HTML with malformed / non-numeric values.
 */
const MOCK_HTML_MALFORMED_VALUES = `
<!DOCTYPE html>
<html>
<body>
  <table>
    <tbody>
      <tr>
        <td>GDP Growth Rate</td>
        <td>N/A</td>
      </tr>
      <tr>
        <td>Inflation Rate</td>
        <td>---</td>
      </tr>
      <tr>
        <td>Interest Rate</td>
        <td>pending</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

/**
 * Completely empty HTML — no table at all.
 */
const MOCK_HTML_EMPTY = `<!DOCTYPE html><html><body></body></html>`;

// ---------------------------------------------------------------------------
// Helper: create a mock HttpClient
// ---------------------------------------------------------------------------

function makeHttpClient(html: string) {
  return {
    get: async (_url: string): Promise<string> => html,
  };
}

function makeErrorHttpClient() {
  return {
    get: async (_url: string): Promise<string> => {
      throw new Error("Network error: connection refused");
    },
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function freshDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 024 — Trading Economics Macro Scraper", () => {
  // ── TE-01: Full HTML response parses all three fields ──────────────────────
  describe("TE-01: Full HTML — all three indicators parsed", () => {
    it("returns MacroIndicators with cpi, gdpGrowth, interestRate > 0", async () => {
      const client = makeHttpClient(MOCK_HTML_FULL);
      const result = await fetchMacroIndicators(client);

      expect(result).not.toBeNull();
      expect(result.country).toBe("vietnam");
      expect(typeof result.cpi).toBe("number");
      expect(typeof result.gdpGrowth).toBe("number");
      expect(typeof result.interestRate).toBe("number");
      expect(result.cpi).toBeGreaterThan(0);
      expect(result.gdpGrowth).toBeGreaterThan(0);
      expect(result.interestRate).toBeGreaterThan(0);
      expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    });

    it("parses CPI as approximately 2.84", async () => {
      const client = makeHttpClient(MOCK_HTML_FULL);
      const result = await fetchMacroIndicators(client);
      expect(result.cpi).toBeCloseTo(2.84, 1);
    });

    it("parses GDP Growth Rate as approximately 7.40", async () => {
      const client = makeHttpClient(MOCK_HTML_FULL);
      const result = await fetchMacroIndicators(client);
      expect(result.gdpGrowth).toBeCloseTo(7.4, 1);
    });

    it("parses Interest Rate as approximately 4.50", async () => {
      const client = makeHttpClient(MOCK_HTML_FULL);
      const result = await fetchMacroIndicators(client);
      expect(result.interestRate).toBeCloseTo(4.5, 1);
    });
  });

  // ── TE-02: Missing field → null (not 0) ───────────────────────────────────
  describe("TE-02: Missing GDP Growth Rate → gdpGrowth is null", () => {
    it("returns null for gdpGrowth when the row is absent", async () => {
      const client = makeHttpClient(MOCK_HTML_MISSING_GDP);
      const result = await fetchMacroIndicators(client);

      expect(result.gdpGrowth).toBeNull();
      expect(result.cpi).not.toBeNull();
      expect(result.interestRate).not.toBeNull();
    });
  });

  // ── TE-03: Malformed / non-numeric values → null ──────────────────────────
  describe("TE-03: Malformed values → all indicator fields are null", () => {
    it("returns null for all fields when values are non-numeric", async () => {
      const client = makeHttpClient(MOCK_HTML_MALFORMED_VALUES);
      const result = await fetchMacroIndicators(client);

      expect(result.cpi).toBeNull();
      expect(result.gdpGrowth).toBeNull();
      expect(result.interestRate).toBeNull();
    });
  });

  // ── TE-04: Network error → returns null-field object (never throws) ────────
  describe("TE-04: Network error → returns object with null fields", () => {
    it("does not throw on network error; returns MacroIndicators with null fields", async () => {
      const client = makeErrorHttpClient();
      let result: MacroIndicators | undefined;
      let threw = false;

      try {
        result = await fetchMacroIndicators(client);
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result).toBeDefined();
      expect(result!.cpi).toBeNull();
      expect(result!.gdpGrowth).toBeNull();
      expect(result!.interestRate).toBeNull();
      expect(result!.country).toBe("vietnam");
    });
  });

  // ── TE-05: Empty HTML → all null fields ──────────────────────────────────
  describe("TE-05: Empty HTML → all indicator fields are null", () => {
    it("returns MacroIndicators with null fields on empty HTML", async () => {
      const client = makeHttpClient(MOCK_HTML_EMPTY);
      const result = await fetchMacroIndicators(client);

      expect(result.cpi).toBeNull();
      expect(result.gdpGrowth).toBeNull();
      expect(result.interestRate).toBeNull();
    });
  });

  // ── TE-06: Store + retrieve from SQLite ───────────────────────────────────
  describe("TE-06: storeMacroIndicators persists to SQLite", () => {
    let db: Database;

    beforeEach(async () => {
      db = await freshDb();
    });

    afterEach(() => {
      closeDb();
    });

    it("inserts a row and retrieves the same values", () => {
      const indicators: MacroIndicators = {
        country: "vietnam",
        cpi: 2.84,
        gdpGrowth: 7.4,
        interestRate: 4.5,
        fetchedAt: new Date().toISOString(),
      };

      storeMacroIndicators(indicators, db);

      const row = db
        .query(
          "SELECT country, cpi, gdp_growth, interest_rate, fetched_at FROM macro_indicators WHERE country = ?",
        )
        .get("vietnam") as {
        country: string;
        cpi: number;
        gdp_growth: number;
        interest_rate: number;
        fetched_at: string;
      } | null;

      expect(row).not.toBeNull();
      expect(row!.country).toBe("vietnam");
      expect(row!.cpi).toBeCloseTo(2.84, 2);
      expect(row!.gdp_growth).toBeCloseTo(7.4, 2);
      expect(row!.interest_rate).toBeCloseTo(4.5, 2);
    });
  });

  // ── TE-07: UNIQUE constraint — upsert replaces existing row ───────────────
  describe("TE-07: UNIQUE(country) — upsert replaces, not duplicates", () => {
    let db: Database;

    beforeEach(async () => {
      db = await freshDb();
    });

    afterEach(() => {
      closeDb();
    });

    it("second store for same country replaces the first row", () => {
      const first: MacroIndicators = {
        country: "vietnam",
        cpi: 3.0,
        gdpGrowth: 6.0,
        interestRate: 4.0,
        fetchedAt: "2025-01-01T00:00:00.000Z",
      };
      const second: MacroIndicators = {
        country: "vietnam",
        cpi: 2.84,
        gdpGrowth: 7.4,
        interestRate: 4.5,
        fetchedAt: "2025-03-01T00:00:00.000Z",
      };

      storeMacroIndicators(first, db);
      storeMacroIndicators(second, db);

      const rows = db
        .query("SELECT COUNT(*) as cnt FROM macro_indicators WHERE country = ?")
        .get("vietnam") as { cnt: number };
      expect(rows.cnt).toBe(1);

      const row = db
        .query("SELECT cpi FROM macro_indicators WHERE country = ?")
        .get("vietnam") as { cpi: number };
      expect(row.cpi).toBeCloseTo(2.84, 2);
    });
  });

  // ── TE-08: Barrel export ───────────────────────────────────────────────────
  // Dynamic imports are used here to avoid triggering hnx.ts module-level
  // schema migration code (ensureExchangeColumn) before the DB is initialised.
  describe("TE-08: Barrel export from fetchers/index.ts", () => {
    beforeEach(async () => {
      // Ensure the DB is initialised before the barrel is imported, since
      // hnx.ts runs ensureExchangeColumn() at module load time.
      await freshDb();
    });

    afterEach(() => {
      closeDb();
    });

    it("fetchMacroIndicators is exported from the fetchers barrel", async () => {
      const barrel = await import("../infrastructure/fetchers/index.js");
      expect(typeof barrel.fetchMacroIndicators).toBe("function");
    });

    it("storeMacroIndicators is exported from the fetchers barrel", async () => {
      const barrel = await import("../infrastructure/fetchers/index.js");
      expect(typeof barrel.storeMacroIndicators).toBe("function");
    });
  });
});
