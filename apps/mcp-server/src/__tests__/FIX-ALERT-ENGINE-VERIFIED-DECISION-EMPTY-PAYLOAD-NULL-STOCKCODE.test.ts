/**
 * FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE
 *
 * Root cause (RAW-verified live, named-volume market_data, 2026-07-29):
 * storeAlerts()/storeAlertsFromCommander() in alertStore.ts hardcoded
 * `payload='{}'` as a bare SQL LITERAL (never a bound parameter) in the
 * agent_signals correlation-stub co-write — every verified_decision row with
 * from_agent='alert-engine' carried ZERO decision content BY CONSTRUCTION,
 * not by data drift. Historical dbsweep: 559/559 rows over 12+ days. Current
 * live re-check: 52/52 rows. `stock_code` was ALREADY correctly populated
 * from `alert.actionCode` in both functions (only genuinely null for MACRO
 * alerts, by design) — the historical "null stock_code" component of the
 * finding did not reproduce live; this suite documents that verification
 * rather than changing already-correct stock_code logic (VERIFY-DON'T-CLAIM).
 *
 * Fix: build the payload from the Alert's own required fields (message,
 * severity, signals[0].type/detectedAt) instead of the '{}' literal, with
 * alert_id embedded so the JSON is byte-unique per alert — this keeps the
 * newly-non-'{}' payload out of collision range of
 * idx_agent_signals_dedup_identical's `WHERE payload != '{}'` partial unique
 * index (FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION, shipped the same day) when
 * two DIFFERENT alert types fire for the SAME ticker in the SAME UTC-minute.
 * Also adds an emit-time guard: refuse (fail-loud log, not silent-swallow) to
 * write a verified_decision row with empty payload — the base `alerts` row is
 * never blocked by this guard, only the decorative correlation stub.
 *
 * AC (acceptance criteria):
 *  AC-1: storeAlerts — payload is non-'{}', valid JSON, carries real content.
 *  AC-2: stock_code is populated for a non-MACRO alert (regression-confirm).
 *  AC-3: MACRO alert — stock_code stays NULL (unchanged) but payload is
 *        populated (content fix is universal, not stock-scoped only).
 *  AC-4: storeAlertsFromCommander — same payload-population behaviour.
 *  AC-5: two different alerts (different id/type) on the SAME stock in the
 *        SAME minute both get a correlation row written — not silently
 *        dropped by idx_agent_signals_dedup_identical now that payload != '{}'.
 *  AC-6: emit-time guard — an Alert with an empty message never gets a
 *        verified_decision row written, but its base `alerts` row IS still
 *        persisted (fail-loud must not block the real alert).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import { storeAlerts, storeAlertsFromCommander } from "../infrastructure/db/alertStore.js";
import type { Alert } from "../domain/services/alertGenerator.js";

// ── Minimal in-memory DB (mirrors live schema, including the partial unique
//    dedup index from FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION) ──────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,
      sent_by               TEXT NOT NULL DEFAULT 'server',
      confidence_score      REAL,
      validated_at          TEXT,
      fingerprint           TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_fingerprint
      ON alerts(fingerprint) WHERE fingerprint IS NOT NULL;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      alert_id     TEXT
    );
    -- Live index (schema-news.ts) — reproduce exactly so AC-5 exercises the
    -- REAL collision surface, not a hand-waved approximation.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_signals_dedup_identical
      ON agent_signals(from_agent, signal_type, COALESCE(stock_code, ''), payload, substr(created_at, 1, 16))
      WHERE payload != '{}';
  `);

  return db;
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-VCB-ta_overbought-2026-07-29`,
    createdAt: "2026-07-29T04:00:00.000Z",
    severity: "warning",
    signals: [
      {
        type: "ta_overbought" as const,
        severity: "warning" as const,
        actionCode: "VCB",
        message: "VCB: RSI(14) = 78.3 — quá mua",
        confidence: 72,
        detectedAt: "2026-07-29T04:00:00.000Z",
      },
    ],
    actionCode: "VCB",
    message: "VCB: RSI(14) = 78.3 — quá mua",
    isRead: false,
    confidence_score: 72,
    ...overrides,
  };
}

describe("FIX-ALERT-ENGINE-VERIFIED-DECISION-EMPTY-PAYLOAD-NULL-STOCKCODE", () => {
  it("AC-1: storeAlerts — payload is non-'{}', valid JSON, carries real decision content", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "alert-VCB-ta_overbought-2026-07-29", fingerprint: "scan:VCB:ta_overbought:2026-07-29" });

    storeAlerts([alert], db);

    const row = db
      .prepare<{ payload: string }, []>("SELECT payload FROM agent_signals WHERE signal_type='verified_decision' LIMIT 1")
      .get();
    expect(row).not.toBeNull();
    expect(row!.payload).not.toBe("{}");

    const parsed = JSON.parse(row!.payload) as Record<string, unknown>;
    expect(parsed["title"]).toBe(alert.message);
    expect(parsed["alert_id"]).toBe(alert.id);
    expect(parsed["severity"]).toBe(alert.severity);
    expect(parsed["alert_type"]).toBe("ta_overbought");
    expect(typeof parsed["confidence"]).toBe("number");
  });

  it("AC-2: stock_code is populated for a non-MACRO alert (regression-confirm — already-correct, unchanged)", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "alert-HPG-ta_oversold-2026-07-29", actionCode: "HPG", fingerprint: "scan:HPG:ta_oversold:2026-07-29" });

    storeAlerts([alert], db);

    const row = db
      .prepare<{ stock_code: string | null }, [string]>("SELECT stock_code FROM agent_signals WHERE alert_id = ?")
      .get(alert.id);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBe("HPG");
  });

  it("AC-3: MACRO alert — stock_code stays NULL (unchanged) but payload IS populated (content fix is universal)", () => {
    const db = makeTestDb();
    const alert = makeAlert({
      id: "alert-MACRO-fx_alert-2026-07-29",
      actionCode: "MACRO",
      message: "USD/VND crossed 25,500",
      fingerprint: "scan:MACRO:fx_alert:2026-07-29",
      signals: [
        {
          type: "policy_change" as const,
          severity: "warning" as const,
          actionCode: "MACRO",
          message: "USD/VND crossed 25,500",
          confidence: 60,
          detectedAt: "2026-07-29T04:00:00.000Z",
        },
      ],
    });

    storeAlerts([alert], db);

    const row = db
      .prepare<{ stock_code: string | null; payload: string }, [string]>(
        "SELECT stock_code, payload FROM agent_signals WHERE alert_id = ?",
      )
      .get(alert.id);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBeNull();
    expect(row!.payload).not.toBe("{}");
    const parsed = JSON.parse(row!.payload) as Record<string, unknown>;
    expect(parsed["title"]).toBe("USD/VND crossed 25,500");
  });

  it("AC-4: storeAlertsFromCommander — same payload-population behaviour as storeAlerts", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "alert-FPT-ta_overbought-2026-07-29", actionCode: "FPT", fingerprint: "scan:FPT:ta_overbought:2026-07-29" });

    storeAlertsFromCommander([alert], db);

    const row = db
      .prepare<{ payload: string; stock_code: string | null }, [string]>(
        "SELECT payload, stock_code FROM agent_signals WHERE alert_id = ?",
      )
      .get(alert.id);
    expect(row).not.toBeNull();
    expect(row!.payload).not.toBe("{}");
    expect(row!.stock_code).toBe("FPT");
  });

  it("AC-5: two different alerts (different id/type) on the SAME stock in the SAME minute BOTH get a correlation row written (idx_agent_signals_dedup_identical no longer silently drops one)", () => {
    const db = makeTestDb();

    const taAlert = makeAlert({
      id: "alert-DPM-ta_overbought-2026-07-29",
      actionCode: "DPM",
      createdAt: "2026-07-29T04:15:00.000Z",
      message: "DPM: RSI(14) = 75.0 — quá mua",
      fingerprint: "scan:DPM:ta_overbought:2026-07-29",
      signals: [
        {
          type: "ta_overbought" as const,
          severity: "warning" as const,
          actionCode: "DPM",
          message: "DPM: RSI(14) = 75.0 — quá mua",
          confidence: 65,
          detectedAt: "2026-07-29T04:15:00.000Z",
        },
      ],
    });
    const bbAlert = makeAlert({
      id: "alert-DPM-ta_bb_breakout_up-2026-07-29",
      actionCode: "DPM",
      createdAt: "2026-07-29T04:15:30.000Z", // same UTC-minute as taAlert
      message: "DPM: giá 45000 vượt BB trên 44000 — bứt phá tăng",
      fingerprint: "scan:DPM:ta_bb_breakout_up:2026-07-29",
      signals: [
        {
          type: "ta_bb_breakout_up" as const,
          severity: "warning" as const,
          actionCode: "DPM",
          message: "DPM: giá 45000 vượt BB trên 44000 — bứt phá tăng",
          confidence: 70,
          detectedAt: "2026-07-29T04:15:30.000Z",
        },
      ],
    });

    storeAlerts([taAlert, bbAlert], db);

    const rows = db
      .prepare<{ alert_id: string }, []>(
        "SELECT alert_id FROM agent_signals WHERE signal_type='verified_decision' AND stock_code='DPM' ORDER BY alert_id",
      )
      .all();
    expect(rows.map((r) => r.alert_id)).toEqual([
      "alert-DPM-ta_bb_breakout_up-2026-07-29",
      "alert-DPM-ta_overbought-2026-07-29",
    ]);
  });

  it("AC-6: emit-time guard — an Alert with empty message never gets a verified_decision row, but its base alerts row IS still persisted", () => {
    const db = makeTestDb();
    const alert = makeAlert({
      id: "alert-VIC-empty-message-2026-07-29",
      actionCode: "VIC",
      message: "", // runtime violation of the Alert.message contract (defensive test)
      fingerprint: "scan:VIC:empty:2026-07-29",
      signals: [],
    });

    storeAlerts([alert], db);

    // Base alert IS written — the content-guard must never block the real alert.
    const alertRow = db.prepare("SELECT id FROM alerts WHERE id = ?").get(alert.id);
    expect(alertRow).not.toBeNull();

    // No verified_decision correlation row for this alert_id — refused, not stubbed with '{}'.
    const sigRow = db.prepare("SELECT 1 FROM agent_signals WHERE alert_id = ?").get(alert.id);
    expect(sigRow).toBeNull();
  });
});
