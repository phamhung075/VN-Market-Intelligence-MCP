Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1005 — Pre-fix phantom alert marker
 *
 * Why: when a fix ships that invalidates older alerts (e.g. fix 89823e5 for a
 * 5.3× volume_spike false positive), those historical alerts should no longer
 * surface as live CRITICAL in reports. Instead, we mark them as "superseded by
 * fix" — resolution_notes + resolved_at are set via log_fix's new
 * `supersedes_alert_ids` parameter, and formatAlertRow surfaces the SUPERSEDED
 * tag so Analysis Team can visually discount them.
 *
 * Scope (this test file):
 *   1. markAlertsSuperseded DB helper updates alerts.resolution_notes +
 *      alerts.resolved_at for the given ids, skipping unknown ids without
 *      throwing.
 *   2. Idempotent: re-running with the same fix title/commit does not corrupt
 *      the existing resolution_notes (overwrites with identical content).
 *   3. formatAlertRow prepends "[SUPERSEDED]" when resolution_notes starts
 *      with "Superseded by fix".
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  markAlertsSuperseded,
  type SupersedeInput,
} from "../infrastructure/db/alertsSupersedeStore.js";

// Minimal alerts-table DDL that mirrors the production schema.ts columns we need.
function makeAlertsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE alerts (
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
      resolved_at           TEXT,
      resolution_notes      TEXT
    )
  `);
  return db;
}

function seedAlert(db: Database, id: string, severity = "critical"): void {
  db.prepare(
    `INSERT INTO alerts (id, triggered_at, severity, message)
     VALUES (?, datetime('now'), ?, ?)`,
  ).run(id, severity, `seed alert ${id}`);
}

describe("Task 1005 — markAlertsSuperseded", () => {
  it("sets resolution_notes + resolved_at on listed alert ids", () => {
    const db = makeAlertsDb();
    seedAlert(db, "alert-1");
    seedAlert(db, "alert-2");
    seedAlert(db, "alert-3");

    const input: SupersedeInput = {
      alertIds: ["alert-1", "alert-3"],
      fixTitle: "volume_spike threshold tightened",
      commitHash: "89823e5",
    };
    const n = markAlertsSuperseded(db, input);
    expect(n).toBe(2);

    const row1 = db
      .query<{ resolved_at: string | null; resolution_notes: string | null }, [string]>(
        "SELECT resolved_at, resolution_notes FROM alerts WHERE id = ?",
      )
      .get("alert-1");
    expect(row1?.resolved_at).not.toBeNull();
    expect(row1?.resolution_notes).toContain("Superseded by fix");
    expect(row1?.resolution_notes).toContain("89823e5");
    expect(row1?.resolution_notes).toContain("volume_spike threshold tightened");

    const row2 = db
      .query<{ resolved_at: string | null; resolution_notes: string | null }, [string]>(
        "SELECT resolved_at, resolution_notes FROM alerts WHERE id = ?",
      )
      .get("alert-2");
    expect(row2?.resolved_at).toBeNull();
    expect(row2?.resolution_notes).toBeNull();
  });

  it("skips unknown alert ids without throwing", () => {
    const db = makeAlertsDb();
    seedAlert(db, "alert-1");

    const n = markAlertsSuperseded(db, {
      alertIds: ["alert-1", "does-not-exist"],
      fixTitle: "t",
    });
    expect(n).toBe(1);
  });

  it("is idempotent — second call with same input is a no-op write", () => {
    const db = makeAlertsDb();
    seedAlert(db, "alert-1");

    const input: SupersedeInput = {
      alertIds: ["alert-1"],
      fixTitle: "threshold tweak",
      commitHash: "abc1234",
    };
    markAlertsSuperseded(db, input);
    const first = db
      .query<{ resolution_notes: string | null }, [string]>(
        "SELECT resolution_notes FROM alerts WHERE id = ?",
      )
      .get("alert-1");

    markAlertsSuperseded(db, input);
    const second = db
      .query<{ resolution_notes: string | null }, [string]>(
        "SELECT resolution_notes FROM alerts WHERE id = ?",
      )
      .get("alert-1");

    expect(second?.resolution_notes).toBe(first?.resolution_notes!);
  });

  it("accepts empty id list as a no-op", () => {
    const db = makeAlertsDb();
    seedAlert(db, "alert-1");
    const n = markAlertsSuperseded(db, { alertIds: [], fixTitle: "x" });
    expect(n).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatAlertRow integration — SUPERSEDED tag visibility
// ─────────────────────────────────────────────────────────────────────────────

import { formatAlertRow } from "../interface/mcp/tools/alerts/alerts.js";

describe("Task 1005 — formatAlertRow SUPERSEDED marker", () => {
  const baseRow = {
    id: "a1",
    triggered_at: "2026-04-07T09:00:00.000Z",
    severity: "critical",
    signals_json: null,
    affected_actions_json: null,
    analysis_ids_json: null,
    message: "volume_spike 5.3x",
    read: 0,
    user_note: null,
  };

  it("omits the SUPERSEDED tag when resolution_notes is null", () => {
    const out = formatAlertRow(baseRow);
    expect(out).not.toContain("[SUPERSEDED]");
    expect(out).not.toContain("Resolved:");
  });

  it("shows [SUPERSEDED] and Resolved line when superseded by fix", () => {
    const out = formatAlertRow({
      ...baseRow,
      resolved_at: "2026-04-08T10:00:00.000Z",
      resolution_notes: "Superseded by fix: volume_spike threshold tightened (89823e5)",
    });
    expect(out).toContain("[SUPERSEDED]");
    expect(out).toContain("Resolved:");
    expect(out).toContain("89823e5");
  });

  it("does not apply the marker for unrelated resolution_notes", () => {
    const out = formatAlertRow({
      ...baseRow,
      resolved_at: "2026-04-08T10:00:00.000Z",
      resolution_notes: "Acknowledged by user",
    });
    expect(out).not.toContain("[SUPERSEDED]");
  });
});
