/**
 * FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID — RED → GREEN test suite
 *
 * Root cause (live RAW-verify + git-archaeology, 2026-07-10): storeAlerts() /
 * storeAlertsFromCommander() write the `agent_signals` correlation row
 * unconditionally whenever no existing agent_signals row carries the same
 * alert_id — WITHOUT confirming the paired `INSERT OR IGNORE INTO alerts`
 * actually persisted a row for that id.
 *
 * `INSERT OR IGNORE INTO alerts` silently no-ops not only on an `id` (PK)
 * collision but also on an `alerts.fingerprint` UNIQUE-index collision
 * (idx_alerts_fingerprint, FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS). When a
 * caller's `id` is NOT deterministically tied 1:1 to its `fingerprint` (e.g.
 * a random UUID id paired with a deterministic per-day fingerprint — exactly
 * what taAlertScanJob/bbAlertScanJob did before
 * FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH, 2026-06-25),
 * a second alert with the SAME fingerprint but a NEW id gets its `alerts`
 * insert silently ignored while the paired `agent_signals` row still gets
 * written with `alert_id = <the new, never-persisted id>` — a dangling FK.
 * This produced the 124 (2026-06-22/23) → 220 (2026-06-25) orphan rows.
 *
 * taAlertScanJob/bbAlertScanJob were fixed at the CALLER level (deterministic
 * id) on 2026-06-25 (57a781a14). This suite adds a WRITER-level guard inside
 * alertStore.ts itself — defense in depth — so ANY future caller (including
 * ones not yet written) cannot reproduce this defect class: the correlation
 * row is only written when the `alerts` row for that id is confirmed to
 * exist (freshly inserted OR pre-existing), never on faith.
 *
 * AC (acceptance criteria):
 *  AC-1: storeAlerts — two alerts sharing a fingerprint but different ids:
 *        the second alert's `alerts` INSERT is silently ignored (fingerprint
 *        UNIQUE collision) → NO agent_signals row must be written for its id.
 *  AC-2: storeAlertsFromCommander — same guarantee.
 *  AC-3: Live RAW-orphan query (agent_signals.alert_id NOT NULL AND no
 *        matching alerts.id) returns 0 after the AC-1/AC-2 scenarios.
 *  AC-4: Legitimate co-write (unique fingerprint / id) still writes the
 *        correlation row — the guard must not be overly strict.
 *  AC-5: Idempotent re-fire (same id, same fingerprint twice) still dedups
 *        to exactly 1 agent_signals row (no regression vs FIX-ALERT-ORPHAN-CORRELATION AC-5).
 *  AC-7/AC-8: checkOrphanAgentSignalsAlertId (D-NEW2 audit tripwire) reports
 *        the live orphan count accurately (0 on a clean DB, >0 + "flagged"
 *        on a DB carrying historical dangling-FK debt).
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

import { storeAlerts, storeAlertsFromCommander } from "../infrastructure/db/alertStore.js";
import type { Alert } from "../domain/services/alertGenerator.js";
import { checkOrphanAgentSignalsAlertId } from "../scheduler/news-analysis/audit-checks/checkOrphanAgentSignalsAlertId.js";

// ── Minimal in-memory DB setup (mirrors live schema-alerts.ts partial index) ──

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
    -- Live schema uses a PARTIAL unique index (WHERE fingerprint IS NOT NULL) —
    -- reproduce exactly, so NULL-fingerprint alerts never collide with each other.
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
      alert_id     TEXT,
      finding_data TEXT DEFAULT '{}'
    );
  `);

  // Required by checkOrphanAgentSignalsAlertId's insertFeedbackIfNew call
  // (dataAuditShared.ts) — mirrors the live agent_feedback schema.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent      TEXT NOT NULL,
      category   TEXT,
      title      TEXT NOT NULL,
      detail     TEXT,
      priority   TEXT,
      status     TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    severity: "high",
    signals: [{ type: "price_drop" as const, severity: "high" as const, actionCode: "VCB", message: "test", confidence: 0.8, detectedAt: new Date().toISOString() }],
    actionCode: "VCB",
    message: "Test alert",
    isRead: false,
    confidence_score: 0.8,
    validated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** The RAW orphan query from the task spec — used directly as the assertion. */
function countOrphanAgentSignals(db: Database): number {
  const row = db.query<{ cnt: number }, []>(`
    SELECT COUNT(*) as cnt
    FROM agent_signals s
    LEFT JOIN alerts a ON a.id = s.alert_id
    WHERE s.alert_id IS NOT NULL AND a.id IS NULL
  `).get();
  return row?.cnt ?? 0;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID", () => {

  // AC-1: fingerprint collision with a different id must not orphan agent_signals
  it("AC-1: storeAlerts — fingerprint-colliding second alert (different id) writes NO dangling agent_signals row", () => {
    const db = makeTestDb();
    const sharedFingerprint = "scan:HVN:ta_overbought:2026-06-22";

    // First alert wins the fingerprint slot.
    const alert1 = makeAlert({ id: "alert-uuid-AAAA", fingerprint: sharedFingerprint });
    storeAlerts([alert1], db);

    // Second alert: SAME fingerprint, DIFFERENT id (reproduces the pre-fix
    // taAlertScanJob/bbAlertScanJob crypto.randomUUID() defect class).
    const alert2 = makeAlert({ id: "alert-uuid-BBBB", fingerprint: sharedFingerprint });
    storeAlerts([alert2], db);

    // alerts table: only alert1's row exists — alert2's INSERT OR IGNORE was
    // silently rejected by the fingerprint UNIQUE index.
    const alertsRows = db.query("SELECT id FROM alerts").all() as { id: string }[];
    expect(alertsRows.map((r) => r.id)).toEqual(["alert-uuid-AAAA"]);

    // agent_signals: must NOT contain a row with alert_id = "alert-uuid-BBBB"
    // (that id was never persisted to alerts — writing it would be a dangling FK).
    const danglingRow = db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("alert-uuid-BBBB");
    expect(danglingRow).toBeNull();

    // Live RAW-orphan query must be 0.
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-2: same guarantee for the Alert Commander co-write path
  it("AC-2: storeAlertsFromCommander — fingerprint-colliding second alert writes NO dangling agent_signals row", () => {
    const db = makeTestDb();
    const sharedFingerprint = "scan:EIB:ta_bb_breakout_down:2026-06-23";

    const alert1 = makeAlert({ id: "cmd-uuid-1111", fingerprint: sharedFingerprint });
    storeAlertsFromCommander([alert1], db);

    const alert2 = makeAlert({ id: "cmd-uuid-2222", fingerprint: sharedFingerprint });
    storeAlertsFromCommander([alert2], db);

    const danglingRow = db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("cmd-uuid-2222");
    expect(danglingRow).toBeNull();
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-3: mixed batch (legit + colliding) in ONE storeAlerts call — still 0 orphans
  it("AC-3: mixed single-call batch (one legit, one fingerprint-colliding) yields 0 orphans", () => {
    const db = makeTestDb();
    const sharedFingerprint = "scan:MBB:ta_oversold:2026-06-23";

    const winner = makeAlert({ id: "batch-winner", fingerprint: sharedFingerprint });
    const loser = makeAlert({ id: "batch-loser", fingerprint: sharedFingerprint });
    const unrelated = makeAlert({ id: "batch-unrelated", fingerprint: "scan:MBB:ta_overbought:2026-06-23" });

    storeAlerts([winner, loser, unrelated], db);

    expect(db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("batch-loser")).toBeNull();
    expect(db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("batch-winner")).not.toBeNull();
    expect(db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("batch-unrelated")).not.toBeNull();
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-4: legitimate co-write (no collision) is unaffected by the guard
  it("AC-4: legitimate co-write (unique id + fingerprint) still writes the correlation row", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "legit-alert-1", fingerprint: "scan:VCB:ta_overbought:2026-07-10" });

    storeAlerts([alert], db);

    const sigRow = db.query("SELECT alert_id FROM agent_signals WHERE alert_id = ?").get("legit-alert-1") as { alert_id: string } | null;
    expect(sigRow).not.toBeNull();
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-5: idempotent re-fire (same id, same fingerprint) still dedups — no regression
  it("AC-5: idempotent re-fire (same id + fingerprint twice) still dedups to 1 agent_signals row", () => {
    const db = makeTestDb();
    const alert = makeAlert({ id: "idempotent-1", fingerprint: "scan:VNM:ta_overbought:2026-07-10" });

    storeAlerts([alert], db);
    storeAlerts([alert], db);

    const sigCount = db.query<{ cnt: number }, [string]>(
      "SELECT count(*) as cnt FROM agent_signals WHERE alert_id = ?",
    ).get("idempotent-1") as { cnt: number };
    expect(sigCount.cnt).toBe(1);
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-6: no-fingerprint callers (news/macro/foreign-flow alerts) are unaffected
  it("AC-6: alerts with no fingerprint (null) still co-write correctly, no orphans", () => {
    const db = makeTestDb();
    const alert1 = makeAlert({ id: "news-alert-1" }); // fingerprint omitted -> null
    const alert2 = makeAlert({ id: "news-alert-2" }); // also null — must NOT collide (partial index)

    storeAlerts([alert1, alert2], db);

    expect(db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("news-alert-1")).not.toBeNull();
    expect(db.query("SELECT 1 FROM agent_signals WHERE alert_id = ?").get("news-alert-2")).not.toBeNull();
    expect(countOrphanAgentSignals(db)).toBe(0);
  });

  // AC-7: D-NEW2 audit tripwire reports 0 on a clean DB
  it("AC-7: checkOrphanAgentSignalsAlertId reports 0 rowsAffected + action 'none' on a clean DB", () => {
    const db = makeTestDb();
    storeAlerts([makeAlert({ id: "clean-1", fingerprint: "scan:FPT:ta_overbought:2026-07-10" })], db);

    const findings = checkOrphanAgentSignalsAlertId(db);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rowsAffected).toBe(0);
    expect(findings[0]!.action).toBe("none");
  });

  // AC-8: D-NEW2 audit tripwire flags historical dangling-FK debt (simulating
  // the pre-57a781a14 UUID-id defect class, before the writer-level guard existed)
  it("AC-8: checkOrphanAgentSignalsAlertId flags rowsAffected>0 + action 'flagged' when dangling rows exist", () => {
    const db = makeTestDb();
    // Simulate historical debt directly (bypassing storeAlerts, which the
    // fix now prevents from ever producing this state going forward).
    db.exec(`
      INSERT INTO agent_signals (from_agent, to_agent, signal_type, alert_id, expires_at)
      VALUES ('alert-engine', 'all', 'verified_decision', 'alert-uuid-never-persisted', datetime('now','+2 hours'))
    `);

    const findings = checkOrphanAgentSignalsAlertId(db);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rowsAffected).toBe(1);
    expect(findings[0]!.action).toBe("flagged");
    expect(findings[0]!.table).toBe("agent_signals");
    expect(findings[0]!.check).toBe("orphan_agent_signals_alert_id");
  });
});
