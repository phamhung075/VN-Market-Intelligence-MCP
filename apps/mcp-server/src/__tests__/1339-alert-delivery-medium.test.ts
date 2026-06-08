Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1339 — Fix: medium severity alerts never delivered
 *
 * Root cause: readUnnotifiedAlerts filtered WHERE severity IN ('high','critical')
 * which silently dropped all medium-severity alerts before Telegram delivery.
 *
 * Task 1340 adds 'medium' to the IN list.
 *
 * Test cases:
 *   TC-1: medium price_surge alert → returned by readUnnotifiedAlerts  (FAILS before fix)
 *   TC-2: medium news_mention alert → returned by readUnnotifiedAlerts (FAILS before fix)
 *   TC-3: low severity alert → NOT returned                            (passes before and after fix)
 *   TC-4: medium already notified (notified_telegram=1) → NOT returned (passes before and after fix)
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
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
      notified_telegram     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity  ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_notified  ON alerts(notified_telegram, severity);
  `);
  return db;
}

function insertAlert(
  db: Database,
  id: string,
  severity: string,
  alertType: string,
  triggeredAt: string,
  notifiedTelegram = 0,
): void {
  db.prepare(`
    INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read, notified_telegram)
    VALUES (?, ?, ?, ?, '[{"code":"VCB"}]', ?, 0, ?)
  `).run(
    id,
    triggeredAt,
    severity,
    JSON.stringify([{ type: alertType }]),
    `test ${alertType} alert`,
    notifiedTelegram,
  );
}

/** ISO timestamp N minutes before now */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1339 — readUnnotifiedAlerts includes medium severity", () => {
  it("TC-1: medium price_surge alert is returned by readUnnotifiedAlerts", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "med-price-1", "medium", "price_surge", minutesAgo(5));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("med-price-1");
    expect(results[0]!.severity).toBe("medium");
  });

  it("TC-2: medium news_mention alert is returned by readUnnotifiedAlerts", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "med-news-1", "medium", "news_mention", minutesAgo(3));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("med-news-1");
    expect(results[0]!.severity).toBe("medium");
  });

  it("TC-3: low severity alert is NOT returned by readUnnotifiedAlerts", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "low-1", "low", "price_surge", minutesAgo(5));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(0);
  });

  it("TC-4: medium alert already notified (notified_telegram=1) is NOT returned", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "med-notified-1", "medium", "news_mention", minutesAgo(5), 1);

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(0);
  });
});
