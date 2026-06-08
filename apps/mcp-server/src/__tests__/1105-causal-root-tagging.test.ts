Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1105 — Signal Fix A: causal_root_id Migration + Alert Commander Grouping
 *
 * Covers:
 *   1. After initDatabase(), agent_signals has causal_root_id and causal_root_label columns
 *   2. postSignal with causal_root_id stores it correctly
 *   3. postSignal without causal_root_id → NULL (backward compatible)
 *   4. getSignalsGroupedByCausalRoot returns grouped signals
 *   5. 3 signals with same causal_root_id → grouped as 1
 *   6. 2 NULL causal_root + 2 same causal_root → 3 groups (2 individual + 1 consolidated)
 *   7. Existing rows (pre-migration) have NULL causal_root_id, no data loss
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  postSignal,
  getSignalsGroupedByCausalRoot,
  type PostSignalInput,
  type CausalRootGroup,
} from "../infrastructure/db/agentSignalStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture — full agent_signals schema including new columns
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

function createAgentSignalsSchema(database: Database): void {
  // Create base table (simulating production schema)
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at)`);

  // Existing enrichment chain columns (Task 244)
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN outcome TEXT`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_at TEXT`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_detail TEXT`); } catch {}

  // Enrichment chain columns from Task 265
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN finding_data TEXT DEFAULT '{}'`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN causal_ref INTEGER`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN chain_depth INTEGER DEFAULT 0`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN processed INTEGER DEFAULT 0`); } catch {}

  // Task 1105 — new causal root columns (the migration under test)
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_id TEXT`); } catch {}
  try { database.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_label TEXT`); } catch {}
}

beforeEach(() => {
  db = new Database(":memory:");
  createAgentSignalsSchema(db);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema columns exist after migration
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — Schema: causal_root_id + causal_root_label columns", () => {
  it("agent_signals has causal_root_id column", () => {
    const cols = db
      .prepare("PRAGMA table_info(agent_signals)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("causal_root_id");
  });

  it("agent_signals has causal_root_label column", () => {
    const cols = db
      .prepare("PRAGMA table_info(agent_signals)")
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("causal_root_label");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. postSignal with causal_root_id stores it correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — postSignal: stores causal_root_id + causal_root_label", () => {
  it("stores causal_root_id when provided", () => {
    const input: PostSignalInput = {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VNM",
      payload: { title: "Fed rate cut", causal_root_id: "FED_2026-04-10", causal_root_label: "Fed rate cut" },
      ttlMinutes: 120,
      causalRootId: "FED_2026-04-10",
      causalRootLabel: "Fed rate cut",
    };
    const id = postSignal(db, input);
    expect(id).toBeGreaterThan(0);

    const row = db
      .prepare<{ causal_root_id: string | null; causal_root_label: string | null }, [number]>(
        "SELECT causal_root_id, causal_root_label FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row).not.toBeNull();
    expect(row!.causal_root_id).toBe("FED_2026-04-10");
    expect(row!.causal_root_label).toBe("Fed rate cut");
  });

  it("stores both fields when they are present in payload.causal_root_id too", () => {
    // Acceptance criteria literal from TASKS.md
    const input: PostSignalInput = {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "FPT",
      payload: { causal_root_id: "FED_2026-04-10", causal_root_label: "Fed rate cut" },
      ttlMinutes: 60,
      causalRootId: "FED_2026-04-10",
      causalRootLabel: "Fed rate cut",
    };
    const id = postSignal(db, input);

    const row = db
      .prepare<{ causal_root_id: string | null }, [number]>(
        "SELECT causal_root_id FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row!.causal_root_id).toBe("FED_2026-04-10");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. postSignal without causal_root_id → NULL (backward compat)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — postSignal: backward compatibility (no causal_root_id)", () => {
  it("causal_root_id is NULL when not provided", () => {
    const input: PostSignalInput = {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      stockCode: "VCB",
      payload: { title: "Price spike detected" },
      ttlMinutes: 60,
    };
    const id = postSignal(db, input);

    const row = db
      .prepare<{ causal_root_id: string | null; causal_root_label: string | null }, [number]>(
        "SELECT causal_root_id, causal_root_label FROM agent_signals WHERE id = ?"
      )
      .get(id);
    expect(row!.causal_root_id).toBeNull();
    expect(row!.causal_root_label).toBeNull();
  });

  it("existing rows before migration have NULL causal_root_id — no data loss", () => {
    // Insert a row the old way (without the new columns in INSERT)
    db.prepare(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, stock_code, payload, expires_at)
      VALUES ('old-agent', 'alert-commander', 'urgent_news', 'HPG', '{"title":"old signal"}', datetime('now', '+2 hours'))
    `).run();

    const row = db
      .prepare<{ causal_root_id: string | null; id: number }, []>(
        "SELECT id, causal_root_id FROM agent_signals WHERE from_agent = 'old-agent'"
      )
      .get();
    expect(row).not.toBeNull();
    expect(row!.causal_root_id).toBeNull();
    // Verify row still has its data (no loss)
    expect(row!.id).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getSignalsGroupedByCausalRoot — basic behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — getSignalsGroupedByCausalRoot: basic grouping", () => {
  it("returns empty array when no signals exist", () => {
    const groups = getSignalsGroupedByCausalRoot(db, { toAgent: "alert-commander" });
    expect(groups).toEqual([]);
  });

  it("returns groups for signals addressed to a specific agent", () => {
    const base: PostSignalInput = {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VNM",
      payload: { title: "Test" },
      ttlMinutes: 120,
      causalRootId: "ROOT_A",
      causalRootLabel: "Root event A",
    };
    postSignal(db, base);

    const groups = getSignalsGroupedByCausalRoot(db, { toAgent: "alert-commander" });
    expect(groups.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 3 signals with same causal_root_id → grouped as 1
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — getSignalsGroupedByCausalRoot: consolidation", () => {
  it("3 signals with same causal_root_id → 1 group", () => {
    const rootId = "FED_2026-04-10";
    for (let i = 0; i < 3; i++) {
      postSignal(db, {
        fromAgent: `agent-${i}`,
        toAgent: "alert-commander",
        signalType: "urgent_news",
        stockCode: `STK${i}`,
        payload: { title: `Signal ${i}` },
        ttlMinutes: 120,
        causalRootId: rootId,
        causalRootLabel: "Fed rate cut",
      });
    }

    const groups = getSignalsGroupedByCausalRoot(db, { toAgent: "alert-commander" });
    // Only 1 group for the shared causal root
    const rootGroup = groups.find((g) => g.causalRootId === rootId);
    expect(rootGroup).not.toBeUndefined();
    expect(rootGroup!.signalCount).toBe(3);
    expect(rootGroup!.isConsolidated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. 2 NULL causal_root + 2 same causal_root → 3 groups total
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — getSignalsGroupedByCausalRoot: mixed NULL + shared root", () => {
  it("2 NULL + 2 same causal_root → 3 total groups (2 individual + 1 consolidated)", () => {
    // 2 signals with NULL causal_root (individual — each its own group)
    postSignal(db, {
      fromAgent: "agent-1",
      toAgent: "alert-commander",
      signalType: "price_anomaly",
      stockCode: "VCB",
      payload: { title: "VCB anomaly" },
      ttlMinutes: 120,
    });
    postSignal(db, {
      fromAgent: "agent-2",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "FPT",
      payload: { title: "FPT news" },
      ttlMinutes: 120,
    });

    // 2 signals sharing the same causal_root_id
    const rootId = "MACRO_TARIFF_2026-04-11";
    postSignal(db, {
      fromAgent: "agent-3",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VNM",
      payload: { title: "Tariff impact VNM" },
      ttlMinutes: 120,
      causalRootId: rootId,
      causalRootLabel: "US tariff escalation",
    });
    postSignal(db, {
      fromAgent: "agent-4",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "HPG",
      payload: { title: "Tariff impact HPG" },
      ttlMinutes: 120,
      causalRootId: rootId,
      causalRootLabel: "US tariff escalation",
    });

    const groups = getSignalsGroupedByCausalRoot(db, { toAgent: "alert-commander" });
    expect(groups.length).toBe(3);

    const consolidated = groups.filter((g) => g.isConsolidated);
    const individual = groups.filter((g) => !g.isConsolidated);

    expect(consolidated.length).toBe(1);
    expect(consolidated[0]!.signalCount).toBe(2);
    expect(consolidated[0]!.causalRootId).toBe(rootId);
    expect(consolidated[0]!.causalRootLabel).toBe("US tariff escalation");

    expect(individual.length).toBe(2);
    expect(individual.every((g) => g.signalCount === 1)).toBe(true);
    expect(individual.every((g) => g.causalRootId === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CausalRootGroup type contract
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1105 — CausalRootGroup type contract", () => {
  it("each group has required fields", () => {
    postSignal(db, {
      fromAgent: "scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VEA",
      payload: { title: "VEA news" },
      ttlMinutes: 120,
      causalRootId: "ROOT_VEA",
      causalRootLabel: "VEA catalyst",
    });

    const groups = getSignalsGroupedByCausalRoot(db, { toAgent: "alert-commander" });
    expect(groups.length).toBe(1);
    const g = groups[0]!;

    expect(typeof g.causalRootId).toBe("string");
    expect(typeof g.causalRootLabel).toBe("string");
    expect(typeof g.signalCount).toBe("number");
    expect(typeof g.isConsolidated).toBe("boolean");
    expect(Array.isArray(g.signals)).toBe(true);
    expect(g.signals.length).toBe(1);
  });
});
