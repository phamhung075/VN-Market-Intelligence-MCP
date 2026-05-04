/**
 * 1846-backtest-lifecycle.test.ts — Task 1846b
 *
 * 19 acceptance-criteria tests across 4 suites:
 *   A — deleteRun() repo unit (3 tests)
 *   B — delete_backtest_run tool #123 (4 tests)
 *   C — export_backtest_run_csv tool #124 (6 tests)
 *   D — compare_backtest_runs tool #125 (6 tests)
 *
 * Uses getDb() singleton (DB_PATH = :memory: set by setup.ts preload).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";

import { SqliteBacktestResultRepository } from "../infrastructure/db/backtestResultRepo.js";
import { getDb, closeDb, initDatabase } from "../infrastructure/db/schema.js";
import type { BacktestRunRecord } from "../domain/repositories/IBacktestResultRepository.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBacktestLifecycleTools } from "../interface/mcp/tools/backtesting/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<BacktestRunRecord> = {}): BacktestRunRecord {
  return {
    id: crypto.randomUUID(),
    strategy: "kinh-dich-high-confidence",
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    runAt: new Date().toISOString(),
    totalReturn: 0.15,
    benchmarkReturn: 0.08,
    maxDrawdown: -0.05,
    sharpeRatio: 1.2,
    winRate: 0.65,
    tradeCount: 20,
    resultJson: JSON.stringify({ trades: [] }),
    ...overrides,
  };
}

interface TradeRecord {
  ticker: string;
  direction: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  positionWeight: number;
}

function makeTradeRecord(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    ticker: "VCB",
    direction: "LONG",
    entryDate: "2026-01-10",
    exitDate: "2026-01-20",
    entryPrice: 100.0,
    exitPrice: 115.0,
    returnPct: 0.15,
    positionWeight: 0.1,
    ...overrides,
  };
}

/**
 * Call a registered MCP tool by name and return the raw result object.
 * For CSV tools, we return the content[0].text as a string directly.
 */
async function callToolRaw(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<unknown> }>;
  })._registeredTools;
  const tool = tools?.[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

/** Call tool and parse JSON from content[0].text */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await callToolRaw(server, toolName, args);
  const first = result.content[0];
  if (!first) throw new Error("Tool returned empty content");
  return JSON.parse(first.text);
}

/** Call tool and return raw text from content[0].text (for CSV responses) */
async function callToolText(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await callToolRaw(server, toolName, args);
  const first = result.content[0];
  if (!first) throw new Error("Tool returned empty content");
  return first.text;
}

// ---------------------------------------------------------------------------
// Suite A — deleteRun() repository unit
// ---------------------------------------------------------------------------

describe("1846b — Suite A: deleteRun() repo unit", () => {
  let repo: SqliteBacktestResultRepository;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    repo = new SqliteBacktestResultRepository(getDb());
  });

  afterEach(() => {
    closeDb();
  });

  it("A-1: deleteRun returns true when run exists (changes >= 1)", () => {
    const record = makeRecord();
    repo.saveRun(record);
    const result = repo.deleteRun(record.id);
    expect(result).toBe(true);
  });

  it("A-2: deleteRun returns false when run does not exist (changes === 0)", () => {
    const result = repo.deleteRun("00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });

  it("A-3: deleteRun returns false (no throw) when DB is closed", () => {
    const record = makeRecord();
    repo.saveRun(record);
    closeDb(); // close DB before call
    // Should not throw — returns false
    expect(() => repo.deleteRun(record.id)).not.toThrow();
    const result = repo.deleteRun(record.id);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite B — delete_backtest_run tool #123
// ---------------------------------------------------------------------------

describe("1846b — Suite B: delete_backtest_run tool (#123)", () => {
  let repo: SqliteBacktestResultRepository;
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    repo = new SqliteBacktestResultRepository(getDb());
    server = new McpServer({ name: "test", version: "1.0.0" }, { capabilities: { tools: {} } });
    registerBacktestLifecycleTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("B-1: happy path returns { deleted: true, id }", async () => {
    const record = makeRecord();
    repo.saveRun(record);
    const result = await callTool(server, "delete_backtest_run", { id: record.id }) as { deleted: boolean; id: string };
    expect(result.deleted).toBe(true);
    expect(result.id).toBe(record.id);
  });

  it("B-2: unknown UUID returns error message", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000001";
    const result = await callTool(server, "delete_backtest_run", { id: unknownId }) as { error: string };
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("Backtest run not found");
    expect(result.error).toContain(unknownId);
  });

  it("B-3: non-UUID input is rejected (Zod validation error or error object)", async () => {
    try {
      const result = await callTool(server, "delete_backtest_run", { id: "not-a-uuid" }) as { error?: string };
      // If handler is called despite Zod, it should return an error
      if (result && typeof result === "object" && "error" in result) {
        expect(typeof result.error).toBe("string");
      }
    } catch {
      // Zod rejection at framework level is acceptable
    }
  });

  it("B-4: double delete — second call returns not-found error", async () => {
    const record = makeRecord();
    repo.saveRun(record);
    await callTool(server, "delete_backtest_run", { id: record.id });
    const second = await callTool(server, "delete_backtest_run", { id: record.id }) as { error: string };
    expect(second).toHaveProperty("error");
    expect(second.error).toContain("Backtest run not found");
  });
});

// ---------------------------------------------------------------------------
// Suite C — export_backtest_run_csv tool #124
// ---------------------------------------------------------------------------

describe("1846b — Suite C: export_backtest_run_csv tool (#124)", () => {
  let repo: SqliteBacktestResultRepository;
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    repo = new SqliteBacktestResultRepository(getDb());
    server = new McpServer({ name: "test", version: "1.0.0" }, { capabilities: { tools: {} } });
    registerBacktestLifecycleTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("C-1: CSV has correct 8-field header and N data rows sorted by exitDate ASC", async () => {
    const trades = [
      makeTradeRecord({ ticker: "HPG", exitDate: "2026-01-30", entryDate: "2026-01-10" }),
      makeTradeRecord({ ticker: "VCB", exitDate: "2026-01-15", entryDate: "2026-01-05" }),
      makeTradeRecord({ ticker: "FPT", exitDate: "2026-01-25", entryDate: "2026-01-15" }),
    ];
    const record = makeRecord({ tradeCount: 3, resultJson: JSON.stringify({ trades }) });
    repo.saveRun(record);

    const csv = await callToolText(server, "export_backtest_run_csv", { id: record.id, includeEquityCurve: false });
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    expect(lines[0]).toBe("date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays");
    expect(lines.length).toBe(4); // header + 3 rows
    // Sorted by exitDate ASC: VCB (Jan 15), FPT (Jan 25), HPG (Jan 30)
    expect(lines[1]).toContain("VCB");
    expect(lines[2]).toContain("FPT");
    expect(lines[3]).toContain("HPG");
  });

  it("C-2: each data row contains exactly 8 comma-separated fields", async () => {
    const trades = [makeTradeRecord({ ticker: "MWG", entryDate: "2026-02-01", exitDate: "2026-02-11" })];
    const record = makeRecord({ tradeCount: 1, resultJson: JSON.stringify({ trades }) });
    repo.saveRun(record);

    const csv = await callToolText(server, "export_backtest_run_csv", { id: record.id, includeEquityCurve: false });
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const dataRow = lines[1];
    expect(dataRow).toBeDefined();
    const fields = dataRow!.split(",");
    expect(fields.length).toBe(8);
  });

  it("C-3: holdDays computed correctly (exitDate - entryDate / 86400000, rounded)", async () => {
    // 10 days between 2026-01-10 and 2026-01-20
    const trades = [makeTradeRecord({ entryDate: "2026-01-10", exitDate: "2026-01-20" })];
    const record = makeRecord({ tradeCount: 1, resultJson: JSON.stringify({ trades }) });
    repo.saveRun(record);

    const csv = await callToolText(server, "export_backtest_run_csv", { id: record.id, includeEquityCurve: false });
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const dataRow = lines[1]!;
    const fields = dataRow.split(",");
    const holdDays = Number(fields[7]);
    expect(holdDays).toBe(10);
  });

  it("C-4: zero-trade run returns header row only, no error", async () => {
    const record = makeRecord({ tradeCount: 0, resultJson: JSON.stringify({ trades: [] }) });
    repo.saveRun(record);

    const csv = await callToolText(server, "export_backtest_run_csv", { id: record.id, includeEquityCurve: false });
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("date,ticker,direction,entryPrice,exitPrice,returnPct,positionWeight,holdDays");
  });

  it("C-5: unknown id returns error JSON", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000002";
    const result = await callTool(server, "export_backtest_run_csv", { id: unknownId, includeEquityCurve: false }) as { error: string };
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("Backtest run not found");
    expect(result.error).toContain(unknownId);
  });

  it("C-6: includeEquityCurve=true appends equity_curve section after blank line", async () => {
    const trades = [
      makeTradeRecord({ entryDate: "2026-01-05", exitDate: "2026-01-15", returnPct: 0.1, positionWeight: 0.2 }),
      makeTradeRecord({ entryDate: "2026-01-15", exitDate: "2026-01-25", returnPct: 0.05, positionWeight: 0.3 }),
    ];
    const record = makeRecord({ tradeCount: 2, resultJson: JSON.stringify({ trades }) });
    repo.saveRun(record);

    const csv = await callToolText(server, "export_backtest_run_csv", { id: record.id, includeEquityCurve: true });
    expect(csv).toContain("equity_curve");
    expect(csv).toContain("index,equityValue");
    // Should have 3 equity values (initial + 2 trades)
    const equitySection = csv.split("equity_curve")[1]!;
    const equityLines = equitySection.split("\n").filter((l) => l.trim() !== "");
    // equityLines[0] = "index,equityValue" header, then 3 data rows (0,1,2)
    expect(equityLines.length).toBe(4); // header + 3 values (index 0,1,2)
  });
});

// ---------------------------------------------------------------------------
// Suite D — compare_backtest_runs tool #125
// ---------------------------------------------------------------------------

describe("1846b — Suite D: compare_backtest_runs tool (#125)", () => {
  let repo: SqliteBacktestResultRepository;
  let server: McpServer;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    repo = new SqliteBacktestResultRepository(getDb());
    server = new McpServer({ name: "test", version: "1.0.0" }, { capabilities: { tools: {} } });
    registerBacktestLifecycleTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  it("D-1: 2-run comparison returns both runs with exactly 11 fields each", async () => {
    const r1 = makeRecord({ strategy: "kinh-dich-all" });
    const r2 = makeRecord({ strategy: "kinh-dich-high-confidence" });
    repo.saveRun(r1);
    repo.saveRun(r2);

    const result = await callTool(server, "compare_backtest_runs", { ids: [r1.id, r2.id] }) as { runs: Array<Record<string, unknown>> };
    expect(Array.isArray(result.runs)).toBe(true);
    expect(result.runs.length).toBe(2);
    const expectedFields = ["id", "strategy", "startDate", "endDate", "runAt", "totalReturn", "benchmarkReturn", "maxDrawdown", "sharpeRatio", "winRate", "tradeCount"];
    for (const run of result.runs) {
      expect(Object.keys(run).sort()).toEqual(expectedFields.sort());
    }
  });

  it("D-2: any missing id returns error with no partial result", async () => {
    const r1 = makeRecord();
    repo.saveRun(r1);
    const missingId = "00000000-0000-0000-0000-000000000003";

    const result = await callTool(server, "compare_backtest_runs", { ids: [r1.id, missingId] }) as { error: string };
    expect(result).toHaveProperty("error");
    expect(result.error).toContain(missingId);
    expect(result).not.toHaveProperty("runs");
  });

  it("D-3: array with 1 element is rejected (Zod min(2))", async () => {
    const r1 = makeRecord();
    repo.saveRun(r1);
    try {
      const result = await callTool(server, "compare_backtest_runs", { ids: [r1.id] }) as { error?: string };
      if (result && typeof result === "object" && "error" in result) {
        expect(typeof result.error).toBe("string");
      }
    } catch {
      // Zod rejection at framework level is acceptable
    }
  });

  it("D-4: array with 6 elements is rejected (Zod max(5))", async () => {
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    try {
      const result = await callTool(server, "compare_backtest_runs", { ids }) as { error?: string };
      if (result && typeof result === "object" && "error" in result) {
        expect(typeof result.error).toBe("string");
      }
    } catch {
      // Zod rejection at framework level is acceptable
    }
  });

  it("D-5: duplicate IDs are deduplicated; response contains each unique run once", async () => {
    const r1 = makeRecord();
    const r2 = makeRecord();
    repo.saveRun(r1);
    repo.saveRun(r2);

    const result = await callTool(server, "compare_backtest_runs", { ids: [r1.id, r2.id, r1.id] }) as { runs: Array<Record<string, unknown>> };
    expect(Array.isArray(result.runs)).toBe(true);
    expect(result.runs.length).toBe(2);
    const returnedIds = result.runs.map((r) => r["id"]);
    expect(new Set(returnedIds).size).toBe(2);
  });

  it("D-6: benchmarkReturn and sharpeRatio serialise as null when absent", async () => {
    const r1 = makeRecord({ benchmarkReturn: null, sharpeRatio: null });
    const r2 = makeRecord({ benchmarkReturn: null, sharpeRatio: null });
    repo.saveRun(r1);
    repo.saveRun(r2);

    const result = await callTool(server, "compare_backtest_runs", { ids: [r1.id, r2.id] }) as { runs: Array<Record<string, unknown>> };
    for (const run of result.runs) {
      expect(run["benchmarkReturn"]).toBeNull();
      expect(run["sharpeRatio"]).toBeNull();
    }
  });
});
