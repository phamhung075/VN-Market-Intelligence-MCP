/**
 * Task 184 — Stock Search / Discovery MCP Tool
 *
 * Tests for:
 *   1. searchStocks() domain service — pure search logic
 *   2. registerSearchStocksTool() MCP tool registration
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { searchStocks, type StockSearchResult } from "../domain/services/stockSearch.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchStocksTools } from "../interface/mcp/tools/searchTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Domain service — searchStocks()
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 184 — searchStocks domain service", () => {
  it("finds stock by exact code (uppercase)", () => {
    const results = searchStocks("VCB", []);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.code).toBe("VCB");
  });

  it("finds stock by exact code (lowercase)", () => {
    const results = searchStocks("vcb", []);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.code).toBe("VCB");
  });

  it("exact code match ranks first", () => {
    const results = searchStocks("FPT", []);
    expect(results[0]?.code).toBe("FPT");
  });

  it("finds stocks by partial company name", () => {
    const results = searchStocks("vietcombank", []);
    expect(results.some((r) => r.code === "VCB")).toBe(true);
  });

  it("finds stocks by Vietnamese name without diacritics", () => {
    const results = searchStocks("ngan hang", []);
    // Banking stocks should appear
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.sector === "banking")).toBe(true);
  });

  it("finds stocks by sector keyword 'banking'", () => {
    const results = searchStocks("banking", []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.sector === "banking")).toBe(true);
  });

  it("finds stocks by Vietnamese sector keyword 'ngan hang'", () => {
    const results = searchStocks("ngan hang", []);
    expect(results.length).toBeGreaterThan(0);
  });

  it("respects limit parameter", () => {
    const results = searchStocks("a", [], 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("marks watchlist stocks correctly", () => {
    const results = searchStocks("VCB", ["VCB", "FPT"]);
    const vcbResult = results.find((r) => r.code === "VCB");
    expect(vcbResult).toBeDefined();
    expect(vcbResult!.inWatchlist).toBe(true);
  });

  it("marks non-watchlist stocks as not watched", () => {
    const results = searchStocks("BID", ["VCB"]);
    const bidResult = results.find((r) => r.code === "BID");
    if (bidResult) {
      expect(bidResult.inWatchlist).toBe(false);
    }
  });

  it("returns empty array for unmatched query", () => {
    const results = searchStocks("xyzzzz123nosuchthing", []);
    expect(results).toEqual([]);
  });

  it("returns correct exchange for known stocks", () => {
    const results = searchStocks("VEA", []);
    const vea = results.find((r) => r.code === "VEA");
    expect(vea).toBeDefined();
    expect(vea!.exchange).toBe("UPCOM");
  });

  it("each result has required shape fields", () => {
    const results = searchStocks("VNM", []);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0]!;
    expect(typeof r.code).toBe("string");
    expect(typeof r.companyName).toBe("string");
    expect(typeof r.exchange).toBe("string");
    expect(typeof r.sector).toBe("string");
    expect(typeof r.inWatchlist).toBe("boolean");
    expect(["code", "name", "sector"]).toContain(r.matchType);
  });

  it("sector search returns all peers in that sector", () => {
    const results = searchStocks("steel", [], 20);
    // HPG, HSG, NKG, TIS, POM should appear
    expect(results.some((r) => r.code === "HPG")).toBe(true);
    expect(results.some((r) => r.code === "HSG")).toBe(true);
  });

  it("case-insensitive sector search works in Vietnamese", () => {
    const resultsLower = searchStocks("ngan hang", []);
    const resultsUpper = searchStocks("NGAN HANG", []);
    expect(resultsLower.length).toBe(resultsUpper.length);
  });

  it("default limit is 10", () => {
    const results = searchStocks("ngan hang", []);
    expect(results.length).toBeLessThanOrEqual(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MCP tool registration
// ─────────────────────────────────────────────────────────────────────────────

// search_stocks removed from MCP in sprint-036 task 230
describe("Task 184 — registerSearchStocksTools MCP registration (tool removed in task 230)", () => {
  let server: McpServer;

  beforeAll(() => {
    server = new McpServer(
      { name: "test-server", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerSearchStocksTools(server);
  });

  it("search_stocks is no longer registered as an MCP tool (removed in task 230)", () => {
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    expect(tools).toBeDefined();
    expect(Object.keys(tools)).not.toContain("search_stocks");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Output formatter
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 184 — formatSearchResults output", () => {
  it("output contains the query term", () => {
    const { formatSearchResults } = require("../domain/services/stockSearch.js");
    const results: StockSearchResult[] = [
      { code: "VCB", companyName: "Vietcombank", exchange: "HOSE", sector: "banking", inWatchlist: true, matchType: "code" },
    ];
    const output = formatSearchResults("vcb", results);
    expect(output).toContain("vcb");
    expect(output).toContain("VCB");
    expect(output).toContain("Vietcombank");
  });

  it("shows checkmark for watchlist stocks", () => {
    const { formatSearchResults } = require("../domain/services/stockSearch.js");
    const results: StockSearchResult[] = [
      { code: "VCB", companyName: "Vietcombank", exchange: "HOSE", sector: "banking", inWatchlist: true, matchType: "code" },
      { code: "BID", companyName: "BIDV", exchange: "HOSE", sector: "banking", inWatchlist: false, matchType: "name" },
    ];
    const output = formatSearchResults("ngan hang", results);
    expect(output).toContain("v"); // watchlist indicator present
    expect(output).toContain("BID");
  });

  it("shows 'Khong tim thay' for empty results", () => {
    const { formatSearchResults } = require("../domain/services/stockSearch.js");
    const output = formatSearchResults("xyzzzz", []);
    expect(output).toMatch(/khong tim thay|Khong tim thay|không tìm thấy/i);
  });
});
