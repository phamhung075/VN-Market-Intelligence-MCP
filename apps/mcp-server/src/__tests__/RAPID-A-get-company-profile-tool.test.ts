/**
 * FIX-A — get_company_profile MCP Tool tests
 *
 * Tests cover:
 *   1. Happy path: FPT with populated shareholders → top-10 returned, free_float computed
 *   2. Happy path: VNM with officers list → officers array populated
 *   3. Code not found → empty shareholders/officers, null foreign_holding_ratio, free_float = 0
 *   4. Sparse officers → empty officers array (honest)
 *   5. Zero own_percent shareholder edge case → handled in sum
 *   6. Empty foreign % (no trading_stats row) → null foreign_holding_ratio (honest)
 *   7. Replay: call tool twice on same data → same JSON result
 *   8. Code is uppercased by tool
 *
 * Sandbox: :memory: SQLite — zero live credentials, zero API keys.
 * Replay: test 7 explicitly calls tool twice and asserts same JSON.
 *
 * DoD: G1–G6 LEAN (fence/sandbox/replay/red-green/tsc/honest-artifact)
 *
 * Harness: _registeredTools direct-handler invocation for MCP tool tests (CI-safe; no InMemoryTransport).
 * REWRITE rationale: InMemoryTransport+Client.callTool() stalls on Bun 1.3.13/Ubuntu CI
 * (TRANSPORT-HANG fingerprint ~5000ms); direct handler invocation removes the message
 * loop entirely — CI-safe, order-independent.
 * Template: 1134-get-foreign-flow-tool.test.ts (proven CI-green 4×).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  queryCompanyProfile,
  registerCompanyProfileTools,
  type CompanyProfileResult,
} from "../interface/mcp/tools/market-data/companyProfileTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test server type — exposes _registeredTools for direct handler invocation
// NOTE: Cannot use intersection type (McpServer & { _registeredTools: ... })
// because _registeredTools is private in McpServer; tsc reduces intersection
// to never. Use (server as unknown as RegisteredToolsServer) at call site.
// ─────────────────────────────────────────────────────────────────────────────

type RegisteredToolsServer = {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<McpTextResult>;
  }>;
};

/**
 * Create an in-memory DB with the minimal tables needed for company profile queries.
 */
function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER,
      own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE TABLE IF NOT EXISTS vnstock_officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      own_percent REAL,
      quantity INTEGER,
      appointment_year INTEGER,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      current_holding_ratio REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );
  `);
  return db;
}

function seedShareholder(
  db: Database,
  code: string,
  name: string,
  quantity: number,
  ownPercent: number,
  fetchedAt = "2026-06-04T08:00:00Z",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(code, name, quantity, ownPercent, fetchedAt);
}

function seedOfficer(
  db: Database,
  code: string,
  name: string,
  position: string,
  ownPercent: number | null,
  quantity: number | null,
  fetchedAt = "2026-06-04T08:00:00Z",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_officers (code, name, position, own_percent, quantity, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(code, name, position, ownPercent, quantity, fetchedAt);
}

function seedTradingStats(
  db: Database,
  code: string,
  currentHoldingRatio: number | null,
  fetchedAt = "2026-06-04T08:00:00Z",
  date = "2026-06-04",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_trading_stats (code, date, current_holding_ratio, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(code, date, currentHoldingRatio, fetchedAt);
}

/** Call the get_company_profile tool directly via _registeredTools */
async function callToolDirect(
  server: McpServer,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const tool = (server as unknown as RegisteredToolsServer)._registeredTools["get_company_profile"];
  if (!tool) throw new Error("Tool not registered: get_company_profile");
  return await tool.handler(args);
}

// ─────────────────────────────────────────────────────────────────────────────
// queryCompanyProfile unit tests (pure logic, no MCP overhead)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-A — queryCompanyProfile (unit)", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // Test 1: Happy path — FPT with populated shareholders → free_float computed
  it("FPT: top-10 shareholders returned, free_float_approx = 100 - sum(own_percent)", () => {
    // Seed 3 shareholders (sum = 55%)
    seedShareholder(db, "FPT", "FPT Holdings", 200_000_000, 35.0);
    seedShareholder(db, "FPT", "SCIC", 100_000_000, 12.0);
    seedShareholder(db, "FPT", "Dragon Capital", 50_000_000, 8.0);
    seedTradingStats(db, "FPT", 18.5);

    const result = queryCompanyProfile(db, "FPT");

    expect(result.code).toBe("FPT");
    expect(result.shareholders).toHaveLength(3);
    // Sorted by own_percent DESC
    expect(result.shareholders[0]!.name).toBe("FPT Holdings");
    expect(result.shareholders[0]!.own_percent).toBe(35.0);
    // free_float_approx = 100 - (35 + 12 + 8) = 45
    expect(result.free_float_approx).toBeCloseTo(45.0, 5);
    expect(result.foreign_holding_ratio).toBe(18.5);
    expect(result.data_as_of).toBe("2026-06-04T08:00:00Z");
  });

  // Test 2: Happy path — VNM with officers list
  it("VNM: officers list populated with correct fields", () => {
    seedShareholder(db, "VNM", "Vinamilk State", 1_000_000_000, 36.0);
    seedOfficer(db, "VNM", "Nguyen Thi Ha", "CEO", 0.02, 1_000_000);
    seedOfficer(db, "VNM", "Le Van Thanh", "CFO", 0.01, 500_000);
    seedTradingStats(db, "VNM", 25.3);

    const result = queryCompanyProfile(db, "VNM");

    expect(result.officers).toHaveLength(2);
    expect(result.officers[0]!.name).toBeDefined();
    expect(result.officers[0]!.position).toBeDefined();
    // No start_date — honest-null (CEO start_date is FIX-I scope)
    expect((result.officers[0] as unknown as Record<string, unknown>)["start_date"]).toBeUndefined();
  });

  // Test 3: Code not found → empty arrays, null foreign, free_float = 0
  it("returns empty arrays and nulls when code not in DB", () => {
    const result = queryCompanyProfile(db, "UNKNOWN");

    expect(result.code).toBe("UNKNOWN");
    expect(result.shareholders).toHaveLength(0);
    expect(result.officers).toHaveLength(0);
    expect(result.foreign_holding_ratio).toBeNull();
    expect(result.free_float_approx).toBe(0);
    expect(result.data_as_of).toBeNull();
  });

  // Test 4: Sparse officers → empty officers array (honest)
  it("returns empty officers array when no officers for code", () => {
    seedShareholder(db, "GAS", "PetroVN", 800_000_000, 45.0);
    // No officers seeded for GAS

    const result = queryCompanyProfile(db, "GAS");

    expect(result.shareholders).toHaveLength(1);
    expect(result.officers).toHaveLength(0);
  });

  // Test 5: Zero own_percent edge case
  it("handles zero own_percent shareholder in free_float sum", () => {
    seedShareholder(db, "HPG", "Hoa Phat Group", 500_000_000, 30.0);
    seedShareholder(db, "HPG", "Unknown Holder", 1000, 0.0);

    const result = queryCompanyProfile(db, "HPG");

    // free_float_approx = 100 - (30.0 + 0.0) = 70.0
    expect(result.free_float_approx).toBeCloseTo(70.0, 5);
    expect(result.shareholders).toHaveLength(2);
  });

  // Test 6: Empty foreign % (no trading_stats row) → null (honest)
  it("returns null foreign_holding_ratio when no trading_stats row exists", () => {
    seedShareholder(db, "MWG", "MWG Founder", 200_000_000, 20.0);
    // No trading_stats seeded

    const result = queryCompanyProfile(db, "MWG");

    expect(result.foreign_holding_ratio).toBeNull();
    expect(result.shareholders).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_company_profile MCP tool tests (via _registeredTools direct invocation)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-A — get_company_profile MCP tool", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // Test 7: Replay — call tool twice → same JSON result
  it("replay: calling get_company_profile twice on same data returns identical JSON", async () => {
    seedShareholder(db, "VNM", "Vinamilk State", 1_000_000_000, 36.0);
    seedOfficer(db, "VNM", "Nguyen Thi Ha", "CEO", 0.02, 1_000_000);
    seedTradingStats(db, "VNM", 25.3);

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerCompanyProfileTools(server, () => db);

    const r1 = await callToolDirect(server, { code: "VNM" });
    const r2 = await callToolDirect(server, { code: "VNM" });

    expect(r1.content[0]!.text).toBe(r2.content[0]!.text);
  });

  // Test 8: Code is uppercased by tool
  it("tool uppercases lowercase code input", async () => {
    seedShareholder(db, "FPT", "FPT Holdings", 200_000_000, 35.0);

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerCompanyProfileTools(server, () => db);

    const result = await callToolDirect(server, { code: "fpt" });

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as CompanyProfileResult;
    expect(parsed.code).toBe("FPT");
  });
});
