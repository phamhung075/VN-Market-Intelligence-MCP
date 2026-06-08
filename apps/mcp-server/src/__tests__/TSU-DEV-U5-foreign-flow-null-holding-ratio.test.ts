/**
 * TSU-DEV-U5 — Foreign Flow Null Holding Ratio
 *
 * DSI invariant: never serve fabricated values. VPS API does NOT return
 * holding_ratio field. All holding_ratio values in DB are ?? 0 (fabricated).
 * Serve-null applies permanently this sprint.
 *
 * Acceptance criteria:
 *   AC-U5-1: formatForeignFlowOutput omits Holding Ratio column when hasRealHoldingData = false
 *   AC-U5-2: formatForeignFlowOutput omits holdingRatioChange5d line when hasRealHoldingData = false
 *   AC-U5-3: Tool description does not mention "holding ratio change"
 *   AC-U5-4: ForeignFlowSignal.is_holding_ratio_fabricated = true when all holdingRatio = 0
 *   AC-U5-5: get_company_profile returns foreign_holding_ratio = null when current_holding_ratio = 0
 *   AC-U5-6: formatForeignFlowOutput with holdingRatio > 0 INCLUDES Holding Ratio column
 *   AC-U5-7: All existing columns (Net Vol, Foreign Room) remain present after fix
 *
 * T-U5-1: formatForeignFlowOutput with all holdingRatio=0 → Holding Ratio column ABSENT
 * T-U5-2: formatForeignFlowOutput with all holdingRatio=0 → Holding ratio change (5d) line ABSENT
 * T-U5-3: formatForeignFlowOutput with some holdingRatio>0 → Holding Ratio column PRESENT
 * T-U5-4: foreignFlowAnalyzer: is_holding_ratio_fabricated=true when all holdingRatio=0
 * T-U5-5: foreignFlowAnalyzer: is_holding_ratio_fabricated=false when some holdingRatio>0
 * T-U5-6: get_company_profile returns foreign_holding_ratio=null when row value is 0
 * T-U5-7: get_company_profile returns foreign_holding_ratio=value when row value > 0
 * T-U5-8: formatForeignFlowOutput preserves Net Vol and Foreign Room columns (no regression)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  formatForeignFlowOutput,
  registerForeignFlowTools,
} from "../interface/mcp/tools/market-data/foreignFlowTools.js";
import {
  analyzeForeignFlow,
  type DailyForeignFlow,
} from "../domain/services/foreignFlowAnalyzer.js";
import {
  queryCompanyProfile,
  registerCompanyProfileTools,
} from "../interface/mcp/tools/market-data/companyProfileTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

/**
 * Build minimal history for formatForeignFlowOutput tests.
 * fabricated = holdingRatio: 0 (fabricated per DSI)
 * real = holdingRatio: 0.30 (real data)
 */
function makeFabricatedHistory(code: string, days = 5): DailyForeignFlow[] {
  const history: DailyForeignFlow[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    history.push({
      code,
      date: d.toISOString().slice(0, 10),
      foreignVolume: (days - i) * 100_000, // non-zero volume so analysis runs
      foreignRoom: 5_000_000,
      holdingRatio: 0, // fabricated — API does not return this
    });
  }
  return history;
}

function makeRealHoldingHistory(code: string, days = 5): DailyForeignFlow[] {
  const history: DailyForeignFlow[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    history.push({
      code,
      date: d.toISOString().slice(0, 10),
      foreignVolume: (days - i) * 100_000,
      foreignRoom: 5_000_000,
      holdingRatio: 0.30 - i * 0.001, // real data
    });
  }
  return history;
}

function createCompanyProfileDb(): Database {
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

function buildDailyOhlcvDb(code: string, days: number, netVolPerDay: number): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL,
      high             REAL,
      low              REAL,
      close            REAL,
      volume           REAL,
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
  `);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO daily_ohlcv (code, date, foreign_net_vol) VALUES (?, ?, ?)`,
    ).run(code, dateStr, netVolPerDay);
  }
  return db;
}

async function buildForeignFlowClient(db: Database): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerForeignFlowTools(server, db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

async function buildCompanyProfileClient(db: Database): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerCompanyProfileTools(server, () => db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// formatForeignFlowOutput unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TSU-DEV-U5 — formatForeignFlowOutput holding ratio gate", () => {
  // T-U5-1: fabricated (all holdingRatio=0) → Holding Ratio column ABSENT
  it("T-U5-1: omits Holding Ratio column when all holdingRatio are 0 (fabricated)", () => {
    const history = makeFabricatedHistory("HPG", 6);
    const signal = analyzeForeignFlow(history)!;
    const output = formatForeignFlowOutput("HPG", signal, history);

    expect(output).not.toContain("Holding Ratio");
  });

  // T-U5-2: fabricated → Holding ratio change (5d) signal line ABSENT
  it("T-U5-2: omits Holding ratio change (5d) line when all holdingRatio are 0", () => {
    const history = makeFabricatedHistory("HPG", 6);
    const signal = analyzeForeignFlow(history)!;
    const output = formatForeignFlowOutput("HPG", signal, history);

    expect(output).not.toContain("Holding ratio change (5d)");
  });

  // T-U5-3: real holding data → Holding Ratio column PRESENT
  it("T-U5-3: includes Holding Ratio column when holdingRatio > 0 in history", () => {
    const history = makeRealHoldingHistory("VNM", 6);
    const signal = analyzeForeignFlow(history)!;
    const output = formatForeignFlowOutput("VNM", signal, history);

    expect(output).toContain("Holding Ratio");
  });

  // T-U5-7 (AC-U5-7): Net Vol and Foreign Room columns still present after fix
  it("T-U5-7: preserves Net Vol daily and Foreign Room columns when holdingRatio=0", () => {
    const history = makeFabricatedHistory("MWG", 6);
    const signal = analyzeForeignFlow(history)!;
    const output = formatForeignFlowOutput("MWG", signal, history);

    // Key columns must still be present
    expect(output).toContain("Net Vol");
    expect(output).toContain("Foreign Room");
    // And the core signal lines
    expect(output).toContain("Direction:");
    expect(output).toContain("Severity:");
    expect(output).toContain("Daily history");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// foreignFlowAnalyzer: is_holding_ratio_fabricated flag
// ─────────────────────────────────────────────────────────────────────────────

describe("TSU-DEV-U5 — analyzeForeignFlow is_holding_ratio_fabricated flag", () => {
  // T-U5-4: all holdingRatio=0 → is_holding_ratio_fabricated = true
  it("T-U5-4: sets is_holding_ratio_fabricated=true when all holdingRatio are 0", () => {
    const history = makeFabricatedHistory("HPG", 6);
    const signal = analyzeForeignFlow(history)!;

    expect(signal).not.toBeNull();
    expect(signal.is_holding_ratio_fabricated).toBe(true);
  });

  // T-U5-5: some holdingRatio>0 → is_holding_ratio_fabricated = false
  it("T-U5-5: sets is_holding_ratio_fabricated=false when some holdingRatio > 0", () => {
    const history = makeRealHoldingHistory("VNM", 6);
    const signal = analyzeForeignFlow(history)!;

    expect(signal).not.toBeNull();
    expect(signal.is_holding_ratio_fabricated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_company_profile: foreign_holding_ratio null when 0
// ─────────────────────────────────────────────────────────────────────────────

describe("TSU-DEV-U5 — queryCompanyProfile foreign_holding_ratio null gate", () => {
  let db: Database;

  beforeEach(() => {
    db = createCompanyProfileDb();
  });

  // T-U5-6: current_holding_ratio = 0 in DB → foreign_holding_ratio = null
  it("T-U5-6: returns foreign_holding_ratio=null when current_holding_ratio is 0", () => {
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("HPG", "Hoa Phat Group", 500_000_000, 30.0, "2026-06-07T08:00:00Z");
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, date, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).run("HPG", "2026-06-07", 0, "2026-06-07T08:00:00Z");

    const result = queryCompanyProfile(db, "HPG");

    expect(result.foreign_holding_ratio).toBeNull();
  });

  // T-U5-7: current_holding_ratio > 0 in DB → foreign_holding_ratio = value
  it("T-U5-7: returns foreign_holding_ratio=value when current_holding_ratio > 0", () => {
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("FPT", "FPT Holdings", 200_000_000, 35.0, "2026-06-07T08:00:00Z");
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, date, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).run("FPT", "2026-06-07", 18.5, "2026-06-07T08:00:00Z");

    const result = queryCompanyProfile(db, "FPT");

    expect(result.foreign_holding_ratio).toBe(18.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_company_profile MCP tool integration: foreign_holding_ratio null gate
// ─────────────────────────────────────────────────────────────────────────────

describe("TSU-DEV-U5 — get_company_profile MCP tool foreign_holding_ratio null gate", () => {
  let db: Database;

  beforeEach(() => {
    db = createCompanyProfileDb();
  });

  it("T-U5-6 (MCP): tool returns foreign_holding_ratio=null when current_holding_ratio is 0", async () => {
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("HPG", "Hoa Phat Group", 500_000_000, 30.0, "2026-06-07T08:00:00Z");
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, date, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).run("HPG", "2026-06-07", 0, "2026-06-07T08:00:00Z");

    const client = await buildCompanyProfileClient(db);
    const result = await client.callTool({
      name: "get_company_profile",
      arguments: { code: "HPG" },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text) as { foreign_holding_ratio: unknown };
    expect(parsed.foreign_holding_ratio).toBeNull();
  });

  it("T-U5-7 (MCP): tool returns foreign_holding_ratio=value when current_holding_ratio > 0", async () => {
    db.prepare(
      `INSERT INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("FPT", "FPT Holdings", 200_000_000, 35.0, "2026-06-07T08:00:00Z");
    db.prepare(
      `INSERT INTO vnstock_trading_stats (code, date, current_holding_ratio, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).run("FPT", "2026-06-07", 18.5, "2026-06-07T08:00:00Z");

    const client = await buildCompanyProfileClient(db);
    const result = await client.callTool({
      name: "get_company_profile",
      arguments: { code: "FPT" },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text) as { foreign_holding_ratio: unknown };
    expect(parsed.foreign_holding_ratio).toBe(18.5);
  });
});
