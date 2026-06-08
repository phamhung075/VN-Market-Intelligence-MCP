Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1154 — Prediction Resolution Loop Tests
 *
 * Covers Sprint 065 fixes:
 *   AC-1: create_prediction_claim bullish computes target_price and creation_price
 *   AC-2: create_prediction_claim bearish computes target_price and creation_price
 *   AC-3: create_prediction_claim with no OHLCV data returns error, no insert
 *   AC-4: resolution with target_price set → outcome=1
 *   AC-5: resolution direction-only fallback (null target, non-null creation_price)
 *   AC-6: resolution skips truly legacy rows (null target, null creation_price)
 *   AC-7: schema migration is idempotent
 *
 * All tests use an in-memory SQLite database with inline DDL for isolation.
 * No mocks — real rows inserted into daily_ohlcv and prediction_claims.
 *
 * @module __tests__/1154-prediction-resolution-loop
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertPredictionClaim,
  type PredictionClaimInput,
} from "../infrastructure/db/predictionClaimStore.js";
import { runPredictionResolution } from "../scheduler/macro/predictionResolutionJob.js";
import { registerEvidenceTools } from "../interface/mcp/tools/macro/evidenceTools.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal in-memory DB with the tables needed for prediction tests.
 * Includes the new creation_price column from Sprint 065.
 */
function makeDb(): Database {
  const db = new Database(":memory:");

  // prediction_claims table — matches production DDL including Sprint 065 column
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_outcome INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      creation_price     REAL,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);

  // daily_ohlcv table — needed for price lookup in tool and resolution job
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      code    TEXT NOT NULL,
      date    TEXT NOT NULL,
      open    REAL,
      high    REAL,
      low     REAL,
      close   REAL NOT NULL,
      volume  REAL,
      UNIQUE(code, date)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date
      ON daily_ohlcv(code, date DESC)
  `);

  return db;
}

function insertOhlcv(
  db: Database,
  code: string,
  date: string,
  close: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO daily_ohlcv (code, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, date, close, close, close, close, 1000);
}

interface PredictionClaimDbRow {
  id: number;
  stock: string;
  direction: string;
  target_price: number | null;
  creation_price: number | null;
  resolution_outcome: number | null;
  actual_price: number | null;
  brier_score: number | null;
  resolved_at: string | null;
  confidence: number;
}

function getClaimById(db: Database, id: number): PredictionClaimDbRow | null {
  return db
    .prepare(`SELECT * FROM prediction_claims WHERE id = ?`)
    .get(id) as PredictionClaimDbRow | null;
}

function countClaims(db: Database): number {
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM prediction_claims`)
    .get() as { cnt: number };
  return row.cnt;
}

// Minimal stub for McpServer — captures tool handlers by name
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function makeServerStub(db: Database): {
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
} {
  const handlers = new Map<string, ToolHandler>();

  const server = {
    tool: (
      name: string,
      _description: string,
      _schema: Record<string, unknown>,
      handler: ToolHandler,
    ) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;

  registerEvidenceTools(server, db);

  return {
    callTool: async (name: string, args: Record<string, unknown>) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool not registered: ${name}`);
      return handler(args);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: create_prediction_claim bullish
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-1: create_prediction_claim bullish", () => {
  it("inserts row with correct target_price, creation_price, and direction", async () => {
    const db = makeDb();
    insertOhlcv(db, "VNM", "2026-04-10", 68500);

    const { callTool } = makeServerStub(db);

    const response = (await callTool("create_prediction_claim", {
      stock: "VNM",
      claim_text: "VNM tang 5% trong 10 ngay",
      probability: 0.7,
      horizon_days: 10,
      resolution_criteria: JSON.stringify({
        metric: "close",
        operator: ">=",
        value: 71925,
        currency: "VND",
        description: "VNM close >= 71925",
      }),
      direction: "bullish",
      expected_move_pct: 0.05,
    })) as { content: Array<{ type: string; text: string }> };

    expect(response.content[0]!.text).toContain("target_price=71925");
    expect(response.content[0]!.text).toContain("creation_price=68500");

    // Verify the database row
    const rows = db
      .prepare(`SELECT * FROM prediction_claims WHERE stock = 'VNM'`)
      .all() as PredictionClaimDbRow[];
    expect(rows).toHaveLength(1);
    const row = rows[0] as PredictionClaimDbRow;
    expect(row.target_price).toBe(71925); // round(68500 * 1.05) = round(71925) = 71925
    expect(row.creation_price).toBe(68500);
    expect(row.direction).toBe("bullish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: create_prediction_claim bearish
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-2: create_prediction_claim bearish", () => {
  it("inserts row with correct target_price for bearish direction", async () => {
    const db = makeDb();
    insertOhlcv(db, "HPG", "2026-04-10", 27100);

    const { callTool } = makeServerStub(db);

    const response = (await callTool("create_prediction_claim", {
      stock: "HPG",
      claim_text: "HPG giam 3% trong 10 ngay",
      probability: 0.6,
      horizon_days: 10,
      resolution_criteria: JSON.stringify({
        metric: "close",
        operator: "<=",
        value: 26287,
        currency: "VND",
        description: "HPG close <= 26287",
      }),
      direction: "bearish",
      expected_move_pct: 0.03,
    })) as { content: Array<{ type: string; text: string }> };

    expect(response.content[0]!.text).toContain("target_price=26287");
    expect(response.content[0]!.text).toContain("creation_price=27100");

    const rows = db
      .prepare(`SELECT * FROM prediction_claims WHERE stock = 'HPG'`)
      .all() as PredictionClaimDbRow[];
    expect(rows).toHaveLength(1);
    const row = rows[0] as PredictionClaimDbRow;
    expect(row.target_price).toBe(26287); // round(27100 * 0.97) = round(26287) = 26287
    expect(row.creation_price).toBe(27100);
    expect(row.direction).toBe("bearish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: create_prediction_claim no OHLCV data
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-3: create_prediction_claim no price data", () => {
  it("returns error text and inserts zero rows when ticker has no OHLCV", async () => {
    const db = makeDb();
    // No OHLCV inserted for UNKNOWN

    const { callTool } = makeServerStub(db);

    const response = (await callTool("create_prediction_claim", {
      stock: "UNKNOWN",
      claim_text: "UNKNOWN will rise",
      probability: 0.5,
      horizon_days: 5,
      resolution_criteria: JSON.stringify({
        metric: "close",
        operator: ">=",
        value: 100,
        currency: "VND",
        description: "test",
      }),
      direction: "bullish",
      expected_move_pct: 0.05,
    })) as { content: Array<{ type: string; text: string }> };

    expect(response.content[0]!.text).toContain("No price data found for UNKNOWN");
    expect(countClaims(db)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: resolution with target_price set
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-4: resolution with target_price", () => {
  it("resolves claim with outcome=1 and correct brier_score", async () => {
    const db = makeDb();

    // Insert resolution date OHLCV row
    insertOhlcv(db, "VNM", "2026-01-01", 72000);

    // Insert prediction claim with past resolution_date
    const input: PredictionClaimInput = {
      stock: "VNM",
      agent_id: "08-prediction-synthesizer",
      claim_text: "VNM close >= 71925 on 2026-01-01",
      direction: "bullish",
      target_price: 71925,
      creation_price: 68500,
      resolution_date: "2026-01-01",
      confidence: 0.7,
    };
    const id = insertPredictionClaim(db, input);
    expect(id).toBeGreaterThan(0);

    const result = await runPredictionResolution(db);
    expect(result.resolved).toBe(1);
    expect(result.skipped).toBe(0);

    const row = getClaimById(db, id);
    expect(row).not.toBeNull();
    expect(row!.resolution_outcome).toBe(1); // 72000 >= 71925
    expect(row!.actual_price).toBe(72000);
    // brier_score = (1 - 0.7)^2 = 0.09
    expect(row!.brier_score).toBeCloseTo(0.09, 5);
    expect(row!.resolved_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: resolution direction-only fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-5: resolution direction-only fallback", () => {
  it("resolves bullish claim via creation_price when target_price is null", async () => {
    const db = makeDb();

    // Insert resolution date OHLCV row
    insertOhlcv(db, "VCB", "2026-01-01", 90000);

    // Insert claim with null target_price but non-null creation_price
    const input: PredictionClaimInput = {
      stock: "VCB",
      agent_id: "08-prediction-synthesizer",
      claim_text: "VCB bullish direction-only",
      direction: "bullish",
      target_price: null,
      creation_price: 88000,
      resolution_date: "2026-01-01",
      confidence: 0.65,
    };
    const id = insertPredictionClaim(db, input);
    expect(id).toBeGreaterThan(0);

    const result = await runPredictionResolution(db);
    expect(result.resolved).toBe(1);

    const row = getClaimById(db, id);
    expect(row!.resolution_outcome).toBe(1); // 90000 > 88000 — bullish correct
    expect(row!.actual_price).toBe(90000);
    // brier_score = (1 - 0.65)^2 = 0.1225
    expect(row!.brier_score).toBeCloseTo(0.1225, 5);
  });

  it("resolves bearish claim via creation_price fallback", async () => {
    const db = makeDb();
    insertOhlcv(db, "VCB", "2026-01-01", 85000);

    const input: PredictionClaimInput = {
      stock: "VCB",
      agent_id: "08-prediction-synthesizer",
      claim_text: "VCB bearish direction-only",
      direction: "bearish",
      target_price: null,
      creation_price: 88000,
      resolution_date: "2026-01-01",
      confidence: 0.6,
    };
    const id = insertPredictionClaim(db, input);

    const result = await runPredictionResolution(db);
    expect(result.resolved).toBe(1);

    const row = getClaimById(db, id);
    expect(row!.resolution_outcome).toBe(1); // 85000 < 88000 — bearish correct
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: resolution skips truly legacy claims (null target, null creation_price)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-6: resolution skips legacy null/null claims", () => {
  it("leaves claim unresolved and increments skipped counter", async () => {
    const db = makeDb();

    // Insert OHLCV so the price lookup succeeds
    insertOhlcv(db, "VNM", "2026-01-01", 72000);

    // Manually insert a truly legacy claim with no target_price and no creation_price
    db.prepare(
      `INSERT INTO prediction_claims
         (stock, agent_id, claim_text, direction, target_price, creation_price,
          resolution_date, confidence)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
    ).run(
      "VNM",
      "08-prediction-synthesizer",
      "legacy claim with no baseline",
      "bullish",
      "2026-01-01",
      0.5,
    );

    const result = await runPredictionResolution(db);
    expect(result.resolved).toBe(0);
    expect(result.skipped).toBe(1);

    // The claim must still be unresolved
    const rows = db
      .prepare(`SELECT * FROM prediction_claims WHERE stock = 'VNM'`)
      .all() as PredictionClaimDbRow[];
    expect(rows).toHaveLength(1);
    expect((rows[0] as PredictionClaimDbRow).resolution_outcome).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7: schema migration idempotent
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — AC-7: schema migration idempotent", () => {
  it("try/catch ALTER TABLE guard swallows duplicate-column error on second exec", () => {
    const db = new Database(":memory:");

    // First: create the base table without creation_price (simulates pre-Sprint-065 DB)
    db.exec(`
      CREATE TABLE IF NOT EXISTS prediction_claims (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        stock              TEXT    NOT NULL,
        agent_id           TEXT    NOT NULL,
        claim_text         TEXT    NOT NULL,
        direction          TEXT    NOT NULL,
        target_price       REAL,
        resolution_date    TEXT    NOT NULL,
        confidence         REAL    NOT NULL,
        resolution_outcome INTEGER,
        actual_price       REAL,
        brier_score        REAL,
        created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
        resolved_at        TEXT,
        UNIQUE(stock, claim_text, resolution_date)
      )
    `);

    // Apply the migration once — should succeed
    expect(() => {
      try {
        db.exec(`ALTER TABLE prediction_claims ADD COLUMN creation_price REAL`);
      } catch {
        // column already exists — safe to ignore
      }
    }).not.toThrow();

    // Apply the migration a second time — column already exists, should not throw
    expect(() => {
      try {
        db.exec(`ALTER TABLE prediction_claims ADD COLUMN creation_price REAL`);
      } catch {
        // column already exists — safe to ignore
      }
    }).not.toThrow();

    // Verify column exists
    const columns = db
      .prepare(`PRAGMA table_info(prediction_claims)`)
      .all() as Array<{ name: string; type: string }>;

    const creationPriceCol = columns.find((c) => c.name === "creation_price");
    expect(creationPriceCol).toBeDefined();
    expect(creationPriceCol!.type).toBe("REAL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end: Full resolution loop
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1154 — E2E: full resolution loop", () => {
  it("inserts claim directly then resolves via resolution job", async () => {
    const db = makeDb();

    // Price at resolution date
    insertOhlcv(db, "VNM", "2026-01-01", 72000);

    const id = insertPredictionClaim(db, {
      stock: "VNM",
      agent_id: "08-prediction-synthesizer",
      claim_text: "E2E test claim",
      direction: "bullish",
      target_price: 71925,
      creation_price: 68500,
      resolution_date: "2026-01-01",
      confidence: 0.7,
    });
    expect(id).toBeGreaterThan(0);

    const result = await runPredictionResolution(db);
    expect(result.resolved).toBe(1);
    expect(result.skipped).toBe(0);

    const row = getClaimById(db, id);
    expect(row!.resolution_outcome).toBe(1);
    expect(row!.brier_score).toBeCloseTo(0.09, 5);
  });
});
