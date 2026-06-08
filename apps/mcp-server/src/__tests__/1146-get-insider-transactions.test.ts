Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1146 — get_insider_transactions MCP tool tests
 *
 * Tests cover:
 *   - getInsiderTransactionsFiltered (insiderStore)
 *   - registerInsiderTools / get_insider_transactions MCP tool
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { insertInsiderTransaction, getInsiderTransactionsFiltered } from "../infrastructure/db/insiderStore.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerInsiderTools } from "../interface/mcp/tools/market-data/insiderTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE insider_transactions (
      id                  TEXT PRIMARY KEY,
      code                TEXT NOT NULL,
      insider_name        TEXT NOT NULL,
      position            TEXT NOT NULL,
      type                TEXT NOT NULL,
      registered_volume   INTEGER NOT NULL DEFAULT 0,
      executed_volume     INTEGER NOT NULL DEFAULT 0,
      price               REAL NOT NULL DEFAULT 0,
      from_date           TEXT NOT NULL,
      to_date             TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_it_code_from_date
      ON insider_transactions(code, from_date DESC);
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT NOT NULL
    );
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

function seedRow(
  db: Database,
  overrides: Partial<{
    id: string;
    code: string;
    insiderName: string;
    position: string;
    type: "buy" | "sell" | "other";
    registeredVolume: number;
    executedVolume: number;
    price: number;
    fromDate: string;
    toDate: string;
    fetchedAt: string;
  }> = {},
) {
  insertInsiderTransaction(db, {
    id: overrides.id ?? `tx-${Math.random()}`,
    code: overrides.code ?? "VNM",
    insiderName: overrides.insiderName ?? "Nguyen Van A",
    position: overrides.position ?? "Chairman",
    type: overrides.type ?? "buy",
    registeredVolume: overrides.registeredVolume ?? 10000,
    executedVolume: overrides.executedVolume ?? 8000,
    price: overrides.price ?? 80000,
    fromDate: overrides.fromDate ?? "2026-03-01",
    toDate: overrides.toDate ?? "2026-03-31",
    fetchedAt: overrides.fetchedAt ?? "2026-03-01T08:00:00Z",
  });
}

async function buildConnectedPair(db: Database): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerInsiderTools(server, () => db);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(clientTransport);
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// getInsiderTransactionsFiltered
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1146 — getInsiderTransactionsFiltered", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns transactions for a specific code within lookback window", () => {
    seedRow(db, { id: "tx-1", code: "VNM", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-2", code: "VCB", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM"],
      sinceDate: "2026-03-01",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.code).toBe("VNM");
  });

  it("returns transactions for multiple codes", () => {
    seedRow(db, { id: "tx-1", code: "VNM", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-2", code: "VCB", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-3", code: "HPG", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM", "VCB"],
      sinceDate: "2026-03-01",
    });
    expect(results.length).toBe(2);
  });

  it("filters by sinceDate — excludes rows before the cutoff", () => {
    seedRow(db, { id: "tx-old", code: "VNM", fromDate: "2026-01-01" });
    seedRow(db, { id: "tx-new", code: "VNM", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM"],
      sinceDate: "2026-03-01",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("tx-new");
  });

  it("type='buy' filter excludes sell rows", () => {
    seedRow(db, { id: "tx-buy", code: "VNM", type: "buy", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-sell", code: "VNM", type: "sell", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM"],
      sinceDate: "2026-03-01",
      type: "buy",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.type).toBe("buy");
  });

  it("type='sell' filter excludes buy rows", () => {
    seedRow(db, { id: "tx-buy", code: "VNM", type: "buy", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-sell", code: "VNM", type: "sell", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM"],
      sinceDate: "2026-03-01",
      type: "sell",
    });
    expect(results.length).toBe(1);
    expect(results[0]!.type).toBe("sell");
  });

  it("returns all when no type filter and no codes filter", () => {
    seedRow(db, { id: "tx-1", code: "VNM", type: "buy", fromDate: "2026-03-15" });
    seedRow(db, { id: "tx-2", code: "VCB", type: "sell", fromDate: "2026-03-15" });

    const results = getInsiderTransactionsFiltered(db, {
      sinceDate: "2026-03-01",
    });
    expect(results.length).toBe(2);
  });

  it("results ordered by from_date DESC", () => {
    seedRow(db, { id: "tx-early", code: "VNM", fromDate: "2026-03-01" });
    seedRow(db, { id: "tx-late", code: "VNM", fromDate: "2026-03-20" });

    const results = getInsiderTransactionsFiltered(db, {
      codes: ["VNM"],
      sinceDate: "2026-02-01",
    });
    expect(results[0]!.fromDate).toBe("2026-03-20");
    expect(results[1]!.fromDate).toBe("2026-03-01");
  });

  it("returns empty array when no matching rows", () => {
    const results = getInsiderTransactionsFiltered(db, {
      codes: ["MISSING"],
      sinceDate: "2026-03-01",
    });
    expect(results.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// get_insider_transactions MCP tool
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1146 — get_insider_transactions tool", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns transactions for a specific code within lookback window", async () => {
    const today = new Date().toISOString().slice(0, 10);
    seedRow(db, { id: "tx-vnm", code: "VNM", fromDate: today });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 30 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.transactions[0].code).toBe("VNM");
  });

  it("omitting code returns transactions for all watchlist codes", async () => {
    db.exec(`INSERT INTO watchlist (code) VALUES ('VNM'), ('VCB')`);
    const today = new Date().toISOString().slice(0, 10);
    seedRow(db, { id: "tx-vnm", code: "VNM", fromDate: today });
    seedRow(db, { id: "tx-vcb", code: "VCB", fromDate: today });
    seedRow(db, { id: "tx-hpg", code: "HPG", fromDate: today });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { days: 30 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    // HPG is not in the watchlist, so only VNM + VCB should be returned
    expect(parsed.totalCount).toBe(2);
  });

  it("type='buy' filter excludes sell rows", async () => {
    const today = new Date().toISOString().slice(0, 10);
    seedRow(db, { id: "tx-buy", code: "VNM", type: "buy", fromDate: today });
    seedRow(db, { id: "tx-sell", code: "VNM", type: "sell", fromDate: today });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 30, type: "buy" },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.transactions[0].type).toBe("buy");
  });

  it("streaks computed: >= 2 distinct from_date buy entries creates streak entry", async () => {
    // Use relative dates to avoid time-drift failures (FIX-MCP-CI-NETWORK-GUARD)
    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    seedRow(db, {
      id: "tx-1",
      code: "VNM",
      type: "buy",
      fromDate: daysAgo(60),
      executedVolume: 5000,
      position: "Chairman",
    });
    seedRow(db, {
      id: "tx-2",
      code: "VNM",
      type: "buy",
      fromDate: daysAgo(55),
      executedVolume: 6000,
      position: "Chairman",
    });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 90 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.streaks.length).toBeGreaterThan(0);
    expect(parsed.streaks[0].buyDays).toBe(2);
    expect(parsed.streaks[0].totalExecutedVolume).toBe(11000);
  });

  it("streaks: executedVolume=0 rows excluded from streak count", async () => {
    seedRow(db, {
      id: "tx-zero-1",
      code: "VNM",
      type: "buy",
      fromDate: "2026-03-01",
      executedVolume: 0,
      position: "CEO",
    });
    seedRow(db, {
      id: "tx-zero-2",
      code: "VNM",
      type: "buy",
      fromDate: "2026-03-05",
      executedVolume: 0,
      position: "CEO",
    });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 90 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    // Rows with executedVolume=0 are excluded from streak computation
    expect(parsed.streaks.length).toBe(0);
  });

  it("totalCount equals transactions.length", async () => {
    const today = new Date().toISOString().slice(0, 10);
    seedRow(db, { id: "tx-a", code: "VNM", fromDate: today });
    seedRow(db, { id: "tx-b", code: "VNM", fromDate: today });
    seedRow(db, { id: "tx-c", code: "VNM", fromDate: today });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 30 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalCount).toBe(parsed.transactions.length);
    expect(parsed.totalCount).toBe(3);
  });

  it("results ordered by from_date DESC", async () => {
    // Use relative dates to avoid time-drift failures (FIX-MCP-CI-NETWORK-GUARD)
    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    const earlyDate = daysAgo(45);
    const lateDate = daysAgo(20);
    seedRow(db, { id: "tx-early", code: "VNM", fromDate: earlyDate });
    seedRow(db, { id: "tx-late", code: "VNM", fromDate: lateDate });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 90 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.transactions[0].fromDate).toBe(lateDate);
    expect(parsed.transactions[1].fromDate).toBe(earlyDate);
  });

  it("days clamped to max 90", async () => {
    const today = new Date().toISOString().slice(0, 10);
    seedRow(db, { id: "tx-today", code: "VNM", fromDate: today });

    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "VNM", days: 90 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.lookbackDays).toBeLessThanOrEqual(90);
    expect(parsed.lookbackDays).toBeGreaterThanOrEqual(1);
  });

  it("returns empty transactions list with totalCount 0 when no data", async () => {
    const client = await buildConnectedPair(db);
    const result = await client.callTool({
      name: "get_insider_transactions",
      arguments: { code: "NOMATCH", days: 30 },
    }) as McpTextResult;

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.transactions.length).toBe(0);
    expect(parsed.streaks.length).toBe(0);
  });
});
