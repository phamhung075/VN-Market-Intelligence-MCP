// apps/mcp-server/src/infrastructure/db/__tests__/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-verified-decision.test.ts
//
// Unit tests T-1..T-4 for TASK-CONF-1 (S2-DATA-HONESTY).
//
// These tests verify that:
//   T-1: storeAlerts() with alert.confidence_score=82 persists 82 (not 50) into agent_signals.
//   T-2: storeAlerts() with severity="critical" and no confidence_score persists 90.
//   T-3: storeAlerts() with severity="warning" and no confidence_score persists 60.
//   T-4: querySignalsForStock() returns confidence_score: null when DB row has NULL.
//
// SCHEMA REQUIREMENT: makeDb() creates the table WITHOUT DEFAULT 50 — mirrors the
// real schema after FR-2 fix. Tests that use DEFAULT 50 are self-confirming traps.

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { storeAlerts } from "../alertStore.js";
import { querySignalsForStock } from "../../../interface/mcp/routes/stockSignalsHandler.js";
import type { Alert } from "../../../domain/services/alertGenerator.js";

// ── makeDb ─────────────────────────────────────────────────────────────────────
// Fresh in-memory schema that mirrors the live schema after FR-2:
//   - confidence_score INTEGER (no DEFAULT 50)
//   - alert_id TEXT (for storeAlerts co-write)
//   - is_correlation_stub INTEGER DEFAULT 0
//
// Intentionally minimal: only columns exercised by the test scope.

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id              TEXT PRIMARY KEY,
      triggered_at    TEXT NOT NULL,
      severity        TEXT NOT NULL,
      signals_json    TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message         TEXT,
      read            INTEGER NOT NULL DEFAULT 0,
      user_note       TEXT,
      sent_by         TEXT NOT NULL DEFAULT 'server',
      confidence_score REAL,
      validated_at    TEXT,
      fingerprint     TEXT,
      notified_telegram INTEGER NOT NULL DEFAULT 0,
      outcome         TEXT,
      outcome_at      TEXT,
      outcome_detail  TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_signals (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent          TEXT NOT NULL,
      to_agent            TEXT NOT NULL,
      signal_type         TEXT NOT NULL,
      stock_code          TEXT,
      payload             TEXT NOT NULL DEFAULT '{}',
      status              TEXT NOT NULL DEFAULT 'unread',
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at          TEXT NOT NULL,
      cycle_id            TEXT,
      finding_data        TEXT DEFAULT '{}',
      causal_ref          INTEGER,
      chain_depth         INTEGER DEFAULT 0,
      causal_root_id      TEXT,
      causal_root_label   TEXT,
      signal_class        TEXT,
      confidence_score    INTEGER,
      validated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
      news_sentiment      REAL,
      kinh_dich_confidence REAL,
      agent_signals_majority TEXT,
      critic_score        REAL DEFAULT NULL,
      critic_notes        TEXT DEFAULT NULL,
      retry_count         INTEGER DEFAULT 0,
      alert_id            TEXT,
      is_correlation_stub INTEGER DEFAULT 0
    );
  `);
  return db;
}

// ── alert factory ─────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> & { id?: string } = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    severity: "high",
    signals: [],
    actionCode: "VCB",
    message: "Test alert",
    isRead: false,
    ...overrides,
  };
}

// ── helper: read confidence_score from agent_signals by alert_id ──────────────

function getSignalConfidenceByAlertId(db: Database, alertId: string): number | null | undefined {
  const row = db
    .query<{ confidence_score: number | null }, [string]>(
      "SELECT confidence_score FROM agent_signals WHERE alert_id = ? LIMIT 1",
    )
    .get(alertId);
  if (row === null || row === undefined) return undefined; // no row found
  return row.confidence_score;
}

// ── T-1: real value pass-through ─────────────────────────────────────────────

describe("T-1: storeAlerts — real confidence_score value pass-through", () => {
  it("alert with confidence_score=82 → agent_signals row has confidence_score=82", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t1", confidence_score: 82, severity: "high" });

    storeAlerts([alert], db);

    const score = getSignalConfidenceByAlertId(db, alert.id);
    expect(score).not.toBeUndefined(); // row was written
    expect(score).toBe(82);
    expect(score).not.toBe(50); // not the old constant mask
    expect(score).not.toBeNull(); // real value, not absent
  });

  it("alert with confidence_score=0 → stored as 0 (RISK-3: zero is a legitimate real value)", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t1-zero", confidence_score: 0, severity: "low" });

    storeAlerts([alert], db);

    const score = getSignalConfidenceByAlertId(db, alert.id);
    expect(score).toBe(0);
  });

  it("alert with confidence_score=100 → stored as 100 (RISK-4: no clamping beyond range)", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t1-max", confidence_score: 100, severity: "critical" });

    storeAlerts([alert], db);

    const score = getSignalConfidenceByAlertId(db, alert.id);
    expect(score).toBe(100);
  });
});

// ── T-2: severity fallback — critical ────────────────────────────────────────

describe("T-2: storeAlerts — severity fallback, critical → 90", () => {
  it("alert with severity=critical and no confidence_score → agent_signals has confidence_score=90", () => {
    const db = makeDb();
    // Explicitly omit confidence_score to trigger the severityToConfidence() path
    const alert = makeAlert({ id: "alert-t2-critical", severity: "critical" });
    // Ensure no confidence_score on the object
    delete (alert as Partial<Alert>).confidence_score;

    storeAlerts([alert], db);

    const score = getSignalConfidenceByAlertId(db, alert.id);
    expect(score).not.toBeUndefined();
    expect(score).toBe(90);
    expect(score).not.toBe(50);
  });

  it("alert with severity=high and no confidence_score → confidence_score=75 (AC-4 severity mapping)", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t2-high", severity: "high" });
    delete (alert as Partial<Alert>).confidence_score;

    storeAlerts([alert], db);

    expect(getSignalConfidenceByAlertId(db, alert.id)).toBe(75);
  });
});

// ── T-3: severity fallback — warning → 60 ────────────────────────────────────

describe("T-3: storeAlerts — severity fallback, warning → 60", () => {
  it("alert with severity=warning and no confidence_score → agent_signals has confidence_score=60 (AC-4)", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t3-warning", severity: "warning" });
    delete (alert as Partial<Alert>).confidence_score;

    storeAlerts([alert], db);

    const score = getSignalConfidenceByAlertId(db, alert.id);
    expect(score).not.toBeUndefined();
    expect(score).toBe(60);
    expect(score).not.toBe(50);
  });

  it("alert with severity=medium and no confidence_score → confidence_score=60 (same as warning)", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t3-medium", severity: "medium" });
    delete (alert as Partial<Alert>).confidence_score;

    storeAlerts([alert], db);

    expect(getSignalConfidenceByAlertId(db, alert.id)).toBe(60);
  });

  it("alert with severity=low and no confidence_score → confidence_score=40", () => {
    const db = makeDb();
    const alert = makeAlert({ id: "alert-t3-low", severity: "low" });
    delete (alert as Partial<Alert>).confidence_score;

    storeAlerts([alert], db);

    expect(getSignalConfidenceByAlertId(db, alert.id)).toBe(40);
  });
});

// ── T-4: null read-path — querySignalsForStock returns null for NULL rows ─────

describe("T-4: stockSignalsHandler — DB row with NULL confidence_score → response confidence_score: null", () => {
  it("agent_signals row with confidence_score=NULL → querySignalsForStock returns confidence_score: null (not 0, not 50)", () => {
    const db = makeDb();

    // Write a row directly with NULL confidence_score (bypassing storeAlerts)
    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at,
         finding_data, confidence_score, is_correlation_stub)
      VALUES
        ('alert-engine', 'all', 'verified_decision', 'VCB', '{"title":"test"}', 'unread',
         datetime('now'), datetime('now','+2 hours'),
         '{"direction":"bullish","detail":"test signal"}', NULL, 0)
    `);

    const results = querySignalsForStock(db, "VCB", 10);
    expect(results.length).toBe(1);

    // AC-3: confidence_score must be null, not 0, not 50, not omitted
    expect(results[0]?.confidence_score).toBeNull();
    expect(results[0]?.confidence_score).not.toBe(50);
    expect(results[0]?.confidence_score).not.toBe(0);
  });

  it("agent_signals row with confidence_score=90 → querySignalsForStock returns confidence_score: 90", () => {
    const db = makeDb();

    db.exec(`
      INSERT INTO agent_signals
        (from_agent, to_agent, signal_type, stock_code, payload, status, created_at, expires_at,
         finding_data, confidence_score, is_correlation_stub)
      VALUES
        ('alert-engine', 'all', 'verified_decision', 'HPG', '{"title":"critical signal"}', 'unread',
         datetime('now'), datetime('now','+2 hours'),
         '{"direction":"bearish","detail":"critical alert"}', 90, 0)
    `);

    const results = querySignalsForStock(db, "HPG", 10);
    expect(results.length).toBe(1);
    expect(results[0]?.confidence_score).toBe(90);
  });
});
