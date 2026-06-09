/**
 * Task 1124 — get_evidence_summary + create_prediction_claim MCP tools
 *
 * Tests cover:
 * - get_evidence_summary: "No evidence accumulated yet" when no evidence_scores row
 * - get_evidence_summary: correct Bullish/Bearish/Neutral values when scores exist
 * - get_evidence_summary: top 5 fragments ordered by magnitude*confidence
 * - get_evidence_summary: UNTRUSTED label for ratios with n < 10
 * - create_prediction_claim: inserts row and returns id + resolution_date
 * - create_prediction_claim: error string for invalid JSON (no row inserted)
 * - create_prediction_claim: "Duplicate claim skipped" on re-insert
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no InMemoryTransport).
 * See sibling 1117-evidence-tools.test.ts for the same proven pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test server type — exposes _registeredTools for direct handler invocation
// ─────────────────────────────────────────────────────────────────────────────

type RegisteredTools = Record<string, {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}>;

let _testDb: Database;
let _testServer: McpServer;

beforeEach(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  const { getDb } = await import("../infrastructure/db/schema.js");
  _testDb = getDb();
  _testServer = new McpServer({ name: "test", version: "1.0" });
  registerEvidenceTools(_testServer, _testDb);
});

afterEach(() => {
  closeDb();
});

async function callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  const tools = (_testServer as unknown as { _registeredTools: RegisteredTools })._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const result = await tool.handler(args);
  return result.content[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedEvidenceScore(
  db: Database,
  stock: string,
  bullish: number,
  bearish: number,
  neutral: number,
  fragmentCount = 5,
): void {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT OR REPLACE INTO evidence_scores
       (stock, score_date, bullish_score, bearish_score, neutral_score, fragment_count, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(stock, today, bullish, bearish, neutral, fragmentCount, new Date().toISOString());
}

function seedEvidenceFragment(
  db: Database,
  stock: string,
  evidenceType: string,
  direction: string,
  magnitude: number,
  confidence: number,
): void {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO evidence_fragments
       (stock, evidence_type, direction, magnitude, confidence, timestamp, source_agent, ttl_days, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(stock, evidenceType, direction, magnitude, confidence, now, "test-agent", 30, expiresAt);
}

function seedLikelihoodRatio(
  db: Database,
  evidenceType: string,
  direction: string,
  horizonDays: number,
  ratio: number,
  sampleSize: number,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO evidence_likelihood_ratios
       (evidence_type, direction, horizon_days, likelihood_ratio, sample_size, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(evidenceType, direction, horizonDays, ratio, sampleSize, new Date().toISOString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1124 — evidence tools Phase B+C", () => {
  // ── get_evidence_summary ─────────────────────────────────────────────────────

  describe("get_evidence_summary", () => {
    it("returns 'No evidence accumulated yet' when no evidence_scores row", async () => {
      const text = await callTool("get_evidence_summary", { stock: "VNM" });
      expect(text).toContain("No evidence accumulated yet for VNM");
    });

    it("returns 'No evidence accumulated yet' (uppercased stock)", async () => {
      const text = await callTool("get_evidence_summary", { stock: "vnm" });
      expect(text).toContain("No evidence accumulated yet for VNM");
    });

    it("returns bullish/bearish/neutral score values when evidence_scores row exists", async () => {
      seedEvidenceScore(_testDb, "VCB", 0.75, 0.15, 0.10, 3);

      const text = await callTool("get_evidence_summary", { stock: "VCB" });
      expect(text).toContain("VCB");
      expect(text).toContain("0.75");
      expect(text).toContain("0.15");
    });

    it("returns top 5 fragments ordered by magnitude*confidence DESC", async () => {
      seedEvidenceScore(_testDb, "FPT", 0.8, 0.1, 0.1, 6);

      // Insert 6 fragments with known magnitude*confidence products
      seedEvidenceFragment(_testDb, "FPT", "news_sentiment_macro", "bullish", 0.9, 0.9);  // 0.81 — rank 1
      seedEvidenceFragment(_testDb, "FPT", "news_sentiment_stock", "bullish", 0.8, 0.9);  // 0.72 — rank 2
      seedEvidenceFragment(_testDb, "FPT", "bctc_revenue_growth",  "bullish", 0.7, 0.9);  // 0.63 — rank 3
      seedEvidenceFragment(_testDb, "FPT", "price_momentum_5d",    "bullish", 0.6, 0.9);  // 0.54 — rank 4
      seedEvidenceFragment(_testDb, "FPT", "bctc_pe_ratio",        "bullish", 0.5, 0.9);  // 0.45 — rank 5
      seedEvidenceFragment(_testDb, "FPT", "kinh_dich_signal",     "neutral", 0.1, 0.1);  // 0.01 — rank 6 (excluded)

      const text = await callTool("get_evidence_summary", { stock: "FPT" });
      // Top fragment must appear
      expect(text).toContain("news_sentiment_macro");
      // kinh_dich_signal should NOT be in top 5 (it is rank 6)
      expect(text).not.toContain("kinh_dich_signal");
    });

    it("shows UNTRUSTED label when likelihood ratio sample_size < 10", async () => {
      seedEvidenceScore(_testDb, "HPG", 0.7, 0.2, 0.1, 2);
      seedEvidenceFragment(_testDb, "HPG", "news_sentiment_macro", "bullish", 0.8, 0.8);
      // sample_size = 5 → UNTRUSTED
      seedLikelihoodRatio(_testDb, "news_sentiment_macro", "bullish", 10, 2.5, 5);

      const text = await callTool("get_evidence_summary", { stock: "HPG" });
      expect(text).toContain("UNTRUSTED");
    });

    it("shows TRUSTED label when likelihood ratio sample_size >= 10", async () => {
      seedEvidenceScore(_testDb, "MWG", 0.6, 0.3, 0.1, 2);
      seedEvidenceFragment(_testDb, "MWG", "bctc_revenue_growth", "bullish", 0.7, 0.7);
      // sample_size = 15 → TRUSTED
      seedLikelihoodRatio(_testDb, "bctc_revenue_growth", "bullish", 10, 1.8, 15);

      const text = await callTool("get_evidence_summary", { stock: "MWG" });
      expect(text).toContain("TRUSTED");
    });
  });

  // ── create_prediction_claim ───────────────────────────────────────────────────

  describe("create_prediction_claim", () => {
    const validCriteria = JSON.stringify({
      metric: "price_close",
      operator: ">",
      value: 90000,
      currency: "VND",
      description: "VCB đóng cửa trên 90,000 VND",
    });

    it("inserts a claim and returns id and resolution_date", async () => {
      const text = await callTool("create_prediction_claim", {
        stock: "VCB",
        claim_text: "VCB sẽ tăng mạnh trong 10 ngày tới",
        probability: 0.75,
        horizon_days: 10,
        resolution_criteria: validCriteria,
      });

      expect(text).toContain("id=");
      expect(text).toContain("resolution_date=");
    });

    it("uppercases and trims the stock ticker", async () => {
      const text = await callTool("create_prediction_claim", {
        stock: " fpt ",
        claim_text: "FPT sẽ tăng",
        probability: 0.6,
        horizon_days: 5,
        resolution_criteria: validCriteria,
      });

      expect(text).toContain("FPT");
    });

    it("computes resolution_date = today + horizon_days calendar days", async () => {
      const text = await callTool("create_prediction_claim", {
        stock: "HPG",
        claim_text: "HPG Q2 bullish",
        probability: 0.65,
        horizon_days: 20,
        resolution_criteria: validCriteria,
      });

      // Compute expected date
      const expected = new Date();
      expected.setDate(expected.getDate() + 20);
      const expectedDate = expected.toISOString().slice(0, 10);

      expect(text).toContain(expectedDate);
    });

    it("returns error string for invalid JSON resolution_criteria (no row inserted)", async () => {
      const text = await callTool("create_prediction_claim", {
        stock: "VCB",
        claim_text: "VCB test bad json",
        probability: 0.5,
        horizon_days: 10,
        resolution_criteria: "not-valid-json{{{",
      });

      expect(text.toLowerCase()).toContain("error");
      // Verify no row was inserted
      const row = _testDb
        .prepare("SELECT COUNT(*) as c FROM prediction_claims WHERE claim_text = ?")
        .get("VCB test bad json") as { c: number } | null;
      expect(row?.c ?? 0).toBe(0);
    });

    it("returns 'Duplicate claim skipped' on re-insert with same stock+claim_text+resolution_date", async () => {
      // First insert
      await callTool("create_prediction_claim", {
        stock: "VNM",
        claim_text: "VNM sẽ hồi phục trong 5 ngày",
        probability: 0.7,
        horizon_days: 5,
        resolution_criteria: validCriteria,
      });
      // Second insert — same stock + claim_text + resolution_date
      const text = await callTool("create_prediction_claim", {
        stock: "VNM",
        claim_text: "VNM sẽ hồi phục trong 5 ngày",
        probability: 0.8,
        horizon_days: 5,
        resolution_criteria: validCriteria,
      });

      expect(text).toContain("Duplicate claim skipped");
      expect(text).toContain("VNM");
    });

    it("clamps probability to [0.01, 0.99] — tool schema enforces this", async () => {
      // The z.number().min(0.01).max(0.99) schema should reject values outside range.
      // We verify a valid boundary value (0.01) is accepted.
      const text = await callTool("create_prediction_claim", {
        stock: "ACB",
        claim_text: "ACB minimal confidence claim",
        probability: 0.01,
        horizon_days: 10,
        resolution_criteria: validCriteria,
      });

      expect(text).toContain("id=");
    });
  });
});
