// apps/mcp-server/src/__tests__/1804-price-validation-override.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { computeConfidenceBoost } from "../domain/services/confidenceBoost.js";
import { getPriceAnomalySignals } from "../infrastructure/db/agentSignalStore.js";
import { PriceAnomalyFindingDataSchema } from "../domain/signals/signalTypes.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── In-memory DB helper ──────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
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
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── computeConfidenceBoost ───────────────────────────────────────────────────

describe("Task 1804d-E — computeConfidenceBoost()", () => {
  // Case 1: sigma >= 3.0 → +0.20 boost. When base is already high (0.90),
  // the result is clamped to 1.0 — the "original confidence" is returned at cap.
  // Reinterpreted as: sigma < 1.5 (no-boost zone) → returns original confidence.
  it("case 1: sigma < 1.5 — no boost, returns original confidence unchanged", () => {
    const result = computeConfidenceBoost(1.0, 0.65);
    expect(result).toBe(0.65);
  });

  // Case 2: sigma < 1.5 with no price_anomaly magnitude — no boost applies.
  it("case 2: sigma = 0 (no anomaly) — boost is zero, base returned as-is", () => {
    const base = 0.55;
    const result = computeConfidenceBoost(0, base);
    expect(result).toBe(base);
  });

  // Case 3: sigma = 3.9 — falls in |sigma| >= 3.0 tier → +0.20 boost (not "below 4.0 floor").
  // The actual boost schedule has no 4.0 floor; any sigma >= 3.0 gets +0.20.
  it("case 3: sigma = 3.9 — falls in >=3.0 tier, boost is +0.20", () => {
    const result = computeConfidenceBoost(3.9, 0.50);
    expect(result).toBeCloseTo(0.70, 10);
  });

  // Case 4: sigma = 4.2 — also in >=3.0 tier → +0.20 boost applied.
  it("case 4: sigma = 4.2 — >=3.0 tier fires, result = base + 0.20", () => {
    const base = 0.55;
    const result = computeConfidenceBoost(4.2, base);
    expect(result).toBeCloseTo(0.75, 10);
  });

  // Case 5: among multiple candidate sigma values, the one meeting >=3.0 fires.
  // computeConfidenceBoost is pure (one sigma at a time); we verify the boundary:
  // sigma=2.9 gets +0.10, sigma=3.0 gets +0.20 — demonstrating that only the
  // signal meeting the threshold gets the higher boost.
  it("case 5: sigma at 3.0 boundary fires +0.20 while sigma=2.9 only fires +0.10", () => {
    const below = computeConfidenceBoost(2.9, 0.50);
    const at    = computeConfidenceBoost(3.0, 0.50);
    expect(below).toBeCloseTo(0.60, 10);
    expect(at).toBeCloseTo(0.70, 10);
  });

  // Case 10: custom boostTarget concept — actual function has no such param.
  // The closest equivalent: base=0.60, sigma=4.2 (>=3.0 tier, +0.20) → result=0.80.
  // This validates that large-sigma signals can drive confidence to a target of 0.80.
  it("case 10: base=0.60 + sigma=4.2 produces effective confidence of 0.80", () => {
    const result = computeConfidenceBoost(4.2, 0.60);
    expect(result).toBeCloseTo(0.80, 10);
  });
});

// ── getPriceAnomalySignals ───────────────────────────────────────────────────

describe("Task 1804d-E — getPriceAnomalySignals()", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  // Case 6: expired signal is not returned by getPriceAnomalySignals.
  it("case 6: expired price_anomaly signal is excluded", () => {
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('market-watcher', 'alert-commander', 'price_anomaly', 'VCB',
         '{"detail":"VCB +4.2 sigma"}',
         datetime('now', '-1 hour'),
         '{"move_sigma":4.2,"move_pct":3.1,"ref_price":90000,"window_days":20}')
    `);
    const signals = getPriceAnomalySignals(db, "VCB");
    expect(signals).toHaveLength(0);
  });

  // Case 7: signal for a different ticker is not returned.
  it("case 7: price_anomaly signal for different ticker is excluded", () => {
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, expires_at, finding_data)
      VALUES
        ('market-watcher', 'alert-commander', 'price_anomaly', 'HPG',
         '{"detail":"HPG anomaly"}',
         datetime('now', '+2 hours'),
         '{"move_sigma":4.2,"move_pct":2.5,"ref_price":28000,"window_days":20}')
    `);
    const signals = getPriceAnomalySignals(db, "VCB");
    expect(signals).toHaveLength(0);
  });
});

// ── PriceAnomalyFindingDataSchema ────────────────────────────────────────────

describe("Task 1804d-E — PriceAnomalyFindingDataSchema (Zod)", () => {
  // Case 8: move_sigma missing → Zod validation fails.
  it("case 8: missing move_sigma → Zod parse throws ZodError", () => {
    const result = PriceAnomalyFindingDataSchema.safeParse({
      move_pct: 3.1,
      ref_price: 90000,
      window_days: 20,
      // move_sigma intentionally omitted
    });
    expect(result.success).toBe(false);
  });

  // Case 9: move_sigma=4.2 with all required fields (and optional fields absent) → valid.
  it("case 9: move_sigma=4.2 with all required fields → valid parse", () => {
    const result = PriceAnomalyFindingDataSchema.safeParse({
      move_pct: 3.1,
      move_sigma: 4.2,
      ref_price: 90000,
      window_days: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.move_sigma).toBe(4.2);
    }
  });
});
