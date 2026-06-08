/**
 * TASK 1920g — Auto-populate prediction_claims from intelligenceCycleJob
 *
 * Tests the wiring of insertPredictionClaim after postSignal in runChainSynthesis.
 * Uses injectable insertClaimFn to isolate from real SQLite.
 *
 * Note: DB_PATH is set to :memory: by setup.ts preload (Bun.env).
 */
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { mapChainAction, isoDatePlusDays } from "../scheduler/news-analysis/intelligenceCycleJob.js";
import { runChainSynthesis } from "../scheduler/news-analysis/intelligenceCycleJob.js";
import type { PredictionClaimInput } from "../infrastructure/db/predictionClaimStore.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a minimal in-memory DB with prediction_claims table
// ─────────────────────────────────────────────────────────────────────────────
function makeMemDb(): Database {
  const db = new Database(":memory:");
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      claim_text TEXT NOT NULL,
      direction TEXT NOT NULL,
      target_price REAL,
      creation_price REAL,
      resolution_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      resolution_outcome INTEGER,
      actual_price REAL,
      brier_score REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-5: mapChainAction pure helper
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1920g — mapChainAction (FR-3)", () => {
  it("BUY → bullish", () => {
    expect(mapChainAction("BUY")).toBe("bullish");
  });

  it("SELL → bearish", () => {
    expect(mapChainAction("SELL")).toBe("bearish");
  });

  it("MONITOR → neutral", () => {
    expect(mapChainAction("MONITOR")).toBe("neutral");
  });

  it("HOLD → neutral", () => {
    expect(mapChainAction("HOLD")).toBe("neutral");
  });

  it("WATCH → neutral (fallthrough)", () => {
    expect(mapChainAction("WATCH")).toBe("neutral");
  });

  it("unknown string → neutral (fallthrough)", () => {
    expect(mapChainAction("UNKNOWN_VALUE")).toBe("neutral");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-6: isoDatePlusDays pure helper
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1920g — isoDatePlusDays (FR-4)", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = isoDatePlusDays(7);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns exactly 7 days from today (UTC)", () => {
    const today = new Date();
    const expected = new Date(today.getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(isoDatePlusDays(7)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-1..TC-4, TC-7: runChainSynthesis with injectable insertClaimFn
// These tests verify AC-1..AC-7 without real DB I/O.
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1920g — runChainSynthesis prediction claim wiring", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    // Full agent_signals schema — matches production columns for postSignal + getChainFindings
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent TEXT NOT NULL,
        to_agent TEXT,
        signal_type TEXT NOT NULL,
        stock_code TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
        cycle_id TEXT,
        finding_data TEXT NOT NULL DEFAULT '{}',
        causal_ref INTEGER,
        chain_depth INTEGER NOT NULL DEFAULT 0,
        causal_root_id TEXT,
        causal_root_label TEXT,
        signal_class TEXT,
        confidence_score INTEGER NOT NULL DEFAULT 50,
        validated_at TEXT,
        news_sentiment REAL,
        kinh_dich_confidence REAL,
        agent_signals_majority TEXT
      );
      CREATE TABLE IF NOT EXISTS prediction_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        claim_text TEXT NOT NULL,
        direction TEXT NOT NULL,
        target_price REAL,
        creation_price REAL,
        resolution_date TEXT NOT NULL,
        confidence REAL NOT NULL,
        resolution_outcome INTEGER,
        actual_price REAL,
        brier_score REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        UNIQUE(stock, claim_text, resolution_date)
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Compute the current 15-min cycle ID, matching computeCycleId() in agentSignalStore.
   * Format: "YYYYMMDD-HHMM" where MM is rounded to 0, 15, 30, or 45.
   */
  function currentCycleId(): string {
    const d = new Date();
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const rawMin = d.getUTCMinutes();
    const min = Math.floor(rawMin / 15) * 15;
    const minStr = String(min).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${minStr}`;
  }

  /**
   * Seed two agent_signals for the same stock in the current cycle window.
   * Returns the cycle_id that was used.
   */
  function seedChainFindings(
    stockCode: string,
    conviction: number,
    action: string,
    narrative: string,
  ): string {
    const cycleId = currentCycleId();

    // Insert two signals for the same stock and cycle — enough for synthesis (>=2 agents)
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      "market-watcher",
      "chain-synthesizer",
      "chain_catalyst",
      stockCode,
      JSON.stringify({ title: "catalyst", detail: narrative }),
      JSON.stringify({
        confidence: conviction,
        direction: action === "BUY" ? "bullish" : action === "SELL" ? "bearish" : "neutral",
        summary: narrative,
        confirms_direction: true,
      }),
      null,
      cycleId,
      0,
    );
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      "financial-analyst",
      "chain-synthesizer",
      "fundamental_validation",
      stockCode,
      JSON.stringify({ title: "fundamental", detail: "Q1 revenue beat" }),
      JSON.stringify({
        confidence: conviction,
        direction: action === "BUY" ? "bullish" : action === "SELL" ? "bearish" : "neutral",
        summary: "Q1 revenue beat expectations",
        validates: true,
      }),
      null,
      cycleId,
      1,
    );

    return cycleId;
  }

  it("TC-1: conviction=0.8 (BUY) → insertClaimFn called once with correct shape (AC-1, AC-2, AC-7)", async () => {
    seedChainFindings("VCB", 0.8, "BUY", "VCB tăng mạnh dựa trên Q1");

    const capturedCalls: PredictionClaimInput[] = [];
    const mockInsertFn = mock((params: PredictionClaimInput) => {
      capturedCalls.push(params);
      return 1;
    });

    await runChainSynthesis({ insertClaimFn: mockInsertFn, _db: db });

    expect(mockInsertFn).toHaveBeenCalledTimes(1);
    const call = capturedCalls[0]!;
    expect(call.stock).toBe("VCB");
    expect(call.agent_id).toBe("chain-synthesizer");
    expect(call.direction).toBe("bullish");
    expect(call.confidence).toBeGreaterThanOrEqual(0.7);
    expect(call.resolution_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.target_price).toBeNull();
    expect(call.creation_price).toBeNull();
    expect(call.claim_text.length).toBeLessThanOrEqual(255);
  });

  it("TC-2: low conviction (< 0.7) → insertClaimFn NOT called (AC-4)", async () => {
    // Use confidence=0.5 with no bonus/penalty flags → base=0.5 → conviction=0.5 < 0.7
    // seedChainFindings uses confirms_direction+validates → bonus 0.10, so use direct insert here
    const cycleId = currentCycleId();
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run("agent-X", null, "chain_catalyst", "HPG",
      JSON.stringify({ title: "x", detail: "y" }),
      JSON.stringify({ confidence: 0.5, direction: "bullish", summary: "low confidence" }),
      null, cycleId, 0);
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run("agent-Y", null, "fundamental_validation", "HPG",
      JSON.stringify({ title: "x", detail: "y" }),
      JSON.stringify({ confidence: 0.5, direction: "bullish", summary: "low confidence 2" }),
      null, cycleId, 1);

    const mockInsertFn = mock((_params: PredictionClaimInput) => 1);

    await runChainSynthesis({ insertClaimFn: mockInsertFn, _db: db });

    // conviction=0.6 is below 0.7 threshold — no claim should be inserted
    expect(mockInsertFn).not.toHaveBeenCalled();
  });

  it("TC-3: conviction=0.7 (boundary) → insertClaimFn called once (AC-1)", async () => {
    // Force conviction = 0.7 exactly by using confidence=0.7 and confirms_direction on both
    // (bonus = 0.05*2 = 0.10, but both agents same direction so distinctAgents from confirmedAgents=2)
    // We'll use confidence values that produce avg ~0.65 + bonus 0.10 = 0.75 or
    // simply seed with confidence=0.65 + 2 confirmers (0.65+0.10=0.75) > 0.7
    // Easier: seed confidence=0.7 with no bonus/penalty → base=0.7 → conviction=0.7
    const stockCode = "MBB";
    const cycleId = currentCycleId();

    // Insert 2 signals: no confirms_direction, no validates → no bonus/penalty
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run("agent-A", null, "chain_catalyst", stockCode,
      JSON.stringify({ title: "x", detail: "y" }),
      JSON.stringify({ confidence: 0.7, direction: "bullish", summary: "boundary test" }),
      null, cycleId, 0);
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, finding_data, causal_ref, cycle_id, chain_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run("agent-B", null, "fundamental_validation", stockCode,
      JSON.stringify({ title: "x", detail: "y" }),
      JSON.stringify({ confidence: 0.7, direction: "bullish", summary: "boundary test 2" }),
      null, cycleId, 1);

    const mockInsertFn = mock((_params: PredictionClaimInput) => 1);

    await runChainSynthesis({ insertClaimFn: mockInsertFn, _db: db });

    expect(mockInsertFn).toHaveBeenCalledTimes(1);
  });

  it("TC-4: INSERT OR IGNORE idempotency — duplicate seed → only 1 row in DB (AC-5)", async () => {
    const claimDb = makeMemDb();
    const { insertPredictionClaim } = await import("../infrastructure/db/predictionClaimStore.js");
    const { isoDatePlusDays: datePlusDays } = await import("../scheduler/news-analysis/intelligenceCycleJob.js");

    const params: PredictionClaimInput = {
      stock: "VNM",
      agent_id: "chain-synthesizer",
      claim_text: "VNM sẽ tăng",
      direction: "bullish",
      target_price: null,
      creation_price: null,
      resolution_date: datePlusDays(7),
      confidence: 0.8,
    };

    const id1 = insertPredictionClaim(claimDb, params);
    const id2 = insertPredictionClaim(claimDb, params); // duplicate

    expect(id1).toBeGreaterThan(0);
    expect(id2).toBe(0); // INSERT OR IGNORE no-op returns 0

    const count = (claimDb.prepare("SELECT COUNT(*) as n FROM prediction_claims").get() as { n: number }).n;
    expect(count).toBe(1);

    claimDb.close();
  });

  it("TC-5: insertClaimFn throws → no exception propagates from runChainSynthesis (AC-6)", async () => {
    seedChainFindings("TCB", 0.8, "BUY", "TCB strong buy signal");

    const errorFn = mock((_params: PredictionClaimInput) => {
      throw new Error("DB write failed");
    });

    // Should not throw
    await expect(runChainSynthesis({ insertClaimFn: errorFn, _db: db })).resolves.toBeUndefined();
  });

  it("TC-6: SELL chain → direction=bearish in claim params (AC-2)", async () => {
    seedChainFindings("VIC", 0.8, "SELL", "VIC giảm mạnh do tín dụng");

    const capturedCalls: PredictionClaimInput[] = [];
    const mockInsertFn = mock((params: PredictionClaimInput) => {
      capturedCalls.push(params);
      return 1;
    });

    await runChainSynthesis({ insertClaimFn: mockInsertFn, _db: db });

    expect(mockInsertFn).toHaveBeenCalledTimes(1);
    expect(capturedCalls[0]!.direction).toBe("bearish");
  });

  it("TC-7: resolution_date is exactly 7 days from today (AC-3)", async () => {
    seedChainFindings("FPT", 0.9, "BUY", "FPT Q1 beat + sector tailwind");

    const capturedCalls: PredictionClaimInput[] = [];
    const mockInsertFn = mock((params: PredictionClaimInput) => {
      capturedCalls.push(params);
      return 1;
    });

    await runChainSynthesis({ insertClaimFn: mockInsertFn, _db: db });

    expect(mockInsertFn).toHaveBeenCalledTimes(1);
    const expected = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    expect(capturedCalls[0]!.resolution_date).toBe(expected);
  });
});
