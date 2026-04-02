/**
 * Task 185 — Data Freshness MCP Tool
 *
 * Tests for `get_data_freshness` which shows when each data source was last
 * updated, computing age in hours and applying a status label.
 *
 * Acceptance criteria:
 *   1. `getDataFreshness()` returns a non-empty string report
 *   2. Report contains header "Do tuoi du lieu"
 *   3. All 7 data sources appear in the output
 *   4. `classifyFreshness()` returns "Tot" for age < 1h
 *   5. `classifyFreshness()` returns "Binh thuong" for age 1h–6h
 *   6. `classifyFreshness()` returns "Cu" for age 6h–24h
 *   7. `classifyFreshness()` returns "Rat cu" for age >= 24h
 *   8. `classifyFreshness()` returns "Chua co du lieu" for null age
 *   9. `formatAge()` formats fractional hours correctly (e.g. 0.25h)
 *  10. The tool is registered and callable via McpServer
 *
 * NOTE: The barrel (tools/index.ts) is NOT imported here because marketTools.ts
 * transitively loads hnx.ts which runs module-level SQLite access. The barrel
 * export is verified via a direct import of dataFreshnessTools.ts only.
 * Barrel wiring is verified by server.ts registration in task 087/server tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// Direct import — avoids pulling in the full tool barrel (hnx.ts module-level issue)
import {
  classifyFreshness,
  formatAge,
  getDataFreshness,
  registerDataFreshnessTools,
} from "../interface/mcp/tools/dataFreshnessTools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — classifyFreshness()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 185 — classifyFreshness()", () => {
  it("returns 'Tot' for age 0 hours (just updated)", () => {
    expect(classifyFreshness(0)).toBe("Tot");
  });

  it("returns 'Tot' for age 0.99h (just under 1h)", () => {
    expect(classifyFreshness(0.99)).toBe("Tot");
  });

  it("returns 'Binh thuong' for age exactly 1h", () => {
    expect(classifyFreshness(1)).toBe("Binh thuong");
  });

  it("returns 'Binh thuong' for age 5.9h", () => {
    expect(classifyFreshness(5.9)).toBe("Binh thuong");
  });

  it("returns 'Cu' for age exactly 6h", () => {
    expect(classifyFreshness(6)).toBe("Cu");
  });

  it("returns 'Cu' for age 23.9h", () => {
    expect(classifyFreshness(23.9)).toBe("Cu");
  });

  it("returns 'Rat cu' for age exactly 24h", () => {
    expect(classifyFreshness(24)).toBe("Rat cu");
  });

  it("returns 'Rat cu' for age 48h", () => {
    expect(classifyFreshness(48)).toBe("Rat cu");
  });

  it("returns 'Chua co du lieu' for null (table missing or empty)", () => {
    expect(classifyFreshness(null)).toBe("Chua co du lieu");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — formatAge()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 185 — formatAge()", () => {
  it("formats 15 minutes as '15 phut truoc' when < 1h", () => {
    const result = formatAge(0.25);
    expect(result).toContain("phut");
  });

  it("formats 1 hour as '1.0h'", () => {
    const result = formatAge(1);
    expect(result).toContain("1.0h");
  });

  it("formats 2.5 hours as '2.5h'", () => {
    const result = formatAge(2.5);
    expect(result).toContain("2.5h");
  });

  it("formats 48 hours as '2 ngay truoc'", () => {
    const result = formatAge(48);
    expect(result).toContain("ngay");
  });

  it("returns 'N/A' for null age", () => {
    expect(formatAge(null)).toBe("N/A");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tests — getDataFreshness() with in-memory SQLite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 185 — getDataFreshness() output format", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");

    // Create only the tables that exist in the real schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS rag_analyses (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        source_url TEXT,
        source_title TEXT,
        level TEXT NOT NULL DEFAULT 'global',
        sentiment TEXT,
        impact_score REAL,
        impact_direction TEXT,
        confidence REAL,
        summary TEXT
      );
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_amt REAL,
        change_pct REAL,
        volume REAL,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS financial_reports (
        id TEXT PRIMARY KEY,
        stock_code TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        triggered_at TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT,
        read INTEGER DEFAULT 0
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("returns a non-empty string report", async () => {
    const result = await getDataFreshness(db);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the header 'Do tuoi du lieu'", async () => {
    const result = await getDataFreshness(db);
    expect(result).toContain("Do tuoi du lieu");
  });

  it("includes all 7 data source labels", async () => {
    const result = await getDataFreshness(db);
    expect(result).toContain("Tin tuc");
    expect(result).toContain("Gia co phieu");
    expect(result).toContain("Hang hoa");
    expect(result).toContain("Ty gia SBV");
    expect(result).toContain("Du doan");
    expect(result).toContain("BCTC");
    expect(result).toContain("System");
  });

  it("shows 'Chua co du lieu' for tables with no rows", async () => {
    // Tables exist but are empty — rag_analyses returns null MAX
    const result = await getDataFreshness(db);
    expect(result).toContain("Chua co du lieu");
  });

  it("shows 'Tot' for rag_analyses updated 10 minutes ago", async () => {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    db.exec(`INSERT INTO rag_analyses (id, created_at, level) VALUES ('r1', '${tenMinsAgo}', 'global')`);

    const result = await getDataFreshness(db);
    expect(result).toContain("Tot");
  });

  it("shows 'Cu' for market_prices updated 10 hours ago", async () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    db.exec(`INSERT INTO market_prices (code, price, updated_at) VALUES ('VCB', 100, '${tenHoursAgo}')`);

    const result = await getDataFreshness(db);
    expect(result).toContain("Cu");
  });

  it("shows 'Rat cu' for financial_reports updated 3 days ago", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    db.exec(`INSERT INTO financial_reports (id, stock_code, created_at) VALUES ('f1', 'VCB', '${threeDaysAgo}')`);

    const result = await getDataFreshness(db);
    expect(result).toContain("Rat cu");
  });

  it("includes 'Kiem tra luc' timestamp at the end", async () => {
    const result = await getDataFreshness(db);
    expect(result).toContain("Kiem tra luc");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registration tests — McpServer integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 185 — registerDataFreshnessTools()", () => {
  it("is exported as a function from the tools module", () => {
    expect(typeof registerDataFreshnessTools).toBe("function");
  });

  it("registers get_data_freshness on McpServer without throwing", () => {
    const server = new McpServer(
      { name: "test", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerDataFreshnessTools(server)).not.toThrow();
    const tools = (server as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(tools["get_data_freshness"]).toBeDefined();
  });

  it("barrel index exports registerDataFreshnessTools", async () => {
    // Verify by checking the exported name in index.ts source (avoids loading hnx.ts)
    const indexSrc = await Bun.file(
      new URL("../interface/mcp/tools/index.ts", import.meta.url).pathname,
    ).text();
    expect(indexSrc).toContain("registerDataFreshnessTools");
    expect(indexSrc).toContain("dataFreshnessTools.js");
  });
});
