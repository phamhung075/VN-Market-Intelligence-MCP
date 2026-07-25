/**
 * FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT
 *
 * Problem: 100% of prediction claims minted since 2026-06-14 were born
 * unscoreable — create_prediction_claim only captured creation_price when the
 * OPTIONAL direction+expected_move_pct pair was supplied, and
 * insertPredictionClaim() had no gate at all (wrote `creation_price ?? null`
 * unconditionally).
 *
 * Fix (per docs/architecture-briefs/2026-07-25-input-validation-coverage-blueprint.md
 * §1.4, Class-A / Point-2 — server write-door at the domain/infrastructure STORE
 * boundary, never only the interface/mcp/tools/ handler):
 *   1. predictionClaimStore.ts::insertPredictionClaim() now runs a Zod
 *      `.strict()` contract requiring creation_price to be a finite number —
 *      throws a §2-aligned descriptive error (field/problem/expected/got) on
 *      violation, for ANY caller (present or future).
 *   2. create_prediction_claim's price lookup (evidenceTools.ts) is UNGATED —
 *      it now runs unconditionally instead of only when direction+expected_move_pct
 *      were both supplied, so the honest/common path (no direction) still
 *      succeeds instead of always hitting the new store-level rejection.
 *
 * AC-1: insertPredictionClaim throws when creation_price is null
 * AC-2: insertPredictionClaim throws when creation_price is omitted (undefined)
 * AC-3: insertPredictionClaim succeeds when creation_price is a finite number
 * AC-4: rejection message is descriptive — names the field + problem (§2 shape)
 * AC-5: create_prediction_claim tool — omitting direction+expected_move_pct
 *       still captures creation_price (the actual bug this task closes) when
 *       OHLCV data exists for the ticker
 * AC-6: create_prediction_claim tool — ticker with no OHLCV data at all is
 *       REJECTED (no silent scoreless insert), regardless of direction
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  insertPredictionClaim,
  type PredictionClaimInput,
} from "../infrastructure/db/predictionClaimStore.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Store-boundary contract (AC-1..AC-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT — store write-door", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  afterEach(() => {
    closeDb();
  });

  const basePayload = {
    stock: "VCB",
    agent_id: "08-prediction-synthesizer",
    claim_text: "VCB sẽ tăng",
    direction: "bullish" as const,
    target_price: null,
    resolution_date: "2026-12-31",
    confidence: 0.7,
  };

  it("AC-1: throws when creation_price is null", () => {
    const params: PredictionClaimInput = { ...basePayload, creation_price: null };
    expect(() => insertPredictionClaim(db, params)).toThrow();
  });

  it("AC-2: throws when creation_price is omitted (undefined)", () => {
    // Deliberately omit creation_price entirely (not even set to null) to prove
    // the gate rejects the "field absent" shape too, not just explicit null.
    const withoutPrice = { ...basePayload } as unknown as PredictionClaimInput;
    expect(() => insertPredictionClaim(db, withoutPrice)).toThrow();
  });

  it("AC-3: succeeds when creation_price is a finite number", () => {
    const params: PredictionClaimInput = { ...basePayload, creation_price: 91000 };
    const id = insertPredictionClaim(db, params);
    expect(id).toBeGreaterThan(0);
  });

  it("AC-4: rejection message names the field and the reason (§2 descriptive-error shape)", () => {
    const params: PredictionClaimInput = { ...basePayload, creation_price: null };
    let caught: unknown;
    try {
      insertPredictionClaim(db, params);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toContain("creation_price");
    expect(msg).toContain("predictionClaimStore.insertPredictionClaim rejected");
    expect(msg.toLowerCase()).toContain("scored");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool-level ungate behavior (AC-5, AC-6)
// ─────────────────────────────────────────────────────────────────────────────

type ToolResponse = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }>;
    }
  )._registeredTools;
  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.handler(args) as Promise<ToolResponse>;
}

describe("FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT — create_prediction_claim ungate", () => {
  let server: McpServer;
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
    server = new McpServer({ name: "test-ungate", version: "1.0.0" }, { capabilities: { tools: {} } });
    registerEvidenceTools(server);
  });

  afterEach(() => {
    closeDb();
  });

  const criteria = JSON.stringify({
    metric: "price_close",
    operator: ">",
    value: 90000,
    currency: "VND",
    description: "test",
  });

  it("AC-5: omitting direction+expected_move_pct still captures creation_price when OHLCV data exists (the bug this task closes)", async () => {
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, open, high, low, close, volume, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("PREDUNGATE1", "2026-07-24", 90000, 92000, 89000, 91000, 100000, new Date().toISOString());

    const result = await callTool(server, "create_prediction_claim", {
      stock: "PREDUNGATE1",
      claim_text: "PREDUNGATE1 no direction supplied",
      probability: 0.6,
      horizon_days: 10,
      resolution_criteria: criteria,
      // direction / expected_move_pct deliberately omitted — this is the exact
      // shape that previously silently persisted a scoreless (creation_price=NULL) claim.
    });

    const text = result.content[0]!.text;
    expect(text.toLowerCase()).not.toMatch(/^error/i);
    expect(text).toContain("id=");
    expect(text).toContain("creation_price=91000");

    const row = db
      .prepare("SELECT creation_price FROM prediction_claims WHERE stock = ?")
      .get("PREDUNGATE1") as { creation_price: number | null } | null;
    expect(row).not.toBeNull();
    expect(row!.creation_price).toBe(91000);
  });

  it("AC-6: ticker with no OHLCV data is REJECTED even without direction/expected_move_pct (no scoreless insert)", async () => {
    const result = await callTool(server, "create_prediction_claim", {
      stock: "PREDUNGATENOPRICE",
      claim_text: "no price data anywhere",
      probability: 0.55,
      horizon_days: 5,
      resolution_criteria: criteria,
    });

    const text = result.content[0]!.text;
    expect(text.toLowerCase()).toMatch(/no price data/i);

    const row = db
      .prepare("SELECT COUNT(*) as c FROM prediction_claims WHERE stock = ?")
      .get("PREDUNGATENOPRICE") as { c: number };
    expect(row.c).toBe(0);
  });
});
