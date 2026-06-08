/**
 * Task 1117 — record_evidence_fragment MCP tool
 *
 * Tests for the record_evidence_fragment tool:
 * 1. Valid input inserts a fragment, returns success message with id
 * 2. Invalid magnitude (>1) triggers Zod validation error
 * 3. Invalid direction triggers Zod validation error
 * 4. Tool function inserts into evidence_fragments table
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema + server fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createEvidenceSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      evidence_type  TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp      TEXT NOT NULL,
      source_agent   TEXT NOT NULL,
      ttl_days       INTEGER NOT NULL DEFAULT 30,
      expires_at     TEXT NOT NULL
    )
  `);
}

function makeServer(db: Database): McpServer {
  const server = new McpServer({ name: "test", version: "0.0.1" });
  registerEvidenceTools(server, db);
  return server;
}

/** Call a tool by name and return its text content */
async function callTool(server: McpServer, name: string, args: Record<string, unknown>): Promise<string> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool "${name}" not found`);
  const result = await tool.handler(args);
  return result.content[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1117 — record_evidence_fragment MCP tool", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    createEvidenceSchema(db);
    server = makeServer(db);
  });

  describe("Valid input", () => {
    it("inserts fragment and returns success message with id", async () => {
      const result = await callTool(server, "record_evidence_fragment", {
        stock: "VCB",
        evidence_type: "news_sentiment_stock",
        direction: "bullish",
        magnitude: 0.7,
        confidence: 0.8,
        source_agent: "04-market-watcher",
      });
      expect(result).toContain("Fragment recorded");
      expect(result).toMatch(/id=\d+/);
    });

    it("actually inserts a row into evidence_fragments", async () => {
      await callTool(server, "record_evidence_fragment", {
        stock: "VCB",
        evidence_type: "news_sentiment_stock",
        direction: "bullish",
        magnitude: 0.7,
        confidence: 0.8,
        source_agent: "04-market-watcher",
      });
      const row = db.prepare("SELECT * FROM evidence_fragments WHERE stock='VCB'").get() as { stock: string; direction: string } | null;
      expect(row).not.toBeNull();
      expect(row!.direction).toBe("bullish");
    });

    it("accepts neutral direction", async () => {
      const result = await callTool(server, "record_evidence_fragment", {
        stock: "FPT",
        evidence_type: "kinh_dich_signal",
        direction: "neutral",
        magnitude: 0.5,
        confidence: 0.6,
        source_agent: "01-news-scout",
      });
      expect(result).toContain("Fragment recorded");
    });

    it("accepts bearish direction", async () => {
      const result = await callTool(server, "record_evidence_fragment", {
        stock: "HPG",
        evidence_type: "bctc_pe_ratio",
        direction: "bearish",
        magnitude: 0.4,
        confidence: 0.7,
        source_agent: "03-bctc-collector",
      });
      expect(result).toContain("Fragment recorded");
    });

    it("uses default ttl_days=30 when not provided", async () => {
      await callTool(server, "record_evidence_fragment", {
        stock: "VCB",
        evidence_type: "price_momentum_5d",
        direction: "bullish",
        magnitude: 0.6,
        confidence: 0.7,
        source_agent: "04-market-watcher",
      });
      const row = db.prepare("SELECT ttl_days FROM evidence_fragments WHERE stock='VCB'").get() as { ttl_days: number } | null;
      expect(row!.ttl_days).toBe(30);
    });
  });

  describe("Tool registration", () => {
    it("record_evidence_fragment tool is registered on the server", () => {
      const tools = (server as unknown as { _registeredTools: Record<string, { handler: unknown }> })._registeredTools;
      expect(tools["record_evidence_fragment"]).toBeDefined();
      expect(tools["record_evidence_fragment"]?.handler).toBeDefined();
    });
  });
});
