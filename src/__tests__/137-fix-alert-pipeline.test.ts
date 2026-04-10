/**
 * Task 137 — Fix Step E: Read alerts from DB and send to Telegram
 *
 * Tests for:
 *   - readUnnotifiedAlerts() — reads HIGH/CRITICAL unnotified alerts within window
 *   - markAlertNotified()    — sets notified_telegram = 1 for a given alert ID
 *   - Schema migration       — notified_telegram column exists after initDatabase()
 *   - Step E wiring          — runIntelligenceCycle passes real alerts to sendAlertsFn
 *   - Idempotency            — second cycle sees 0 alerts after first marks them notified
 *   - Failed send            — notified_telegram stays 0 when send returns 0
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — in-memory DB setup
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
    CREATE INDEX IF NOT EXISTS idx_alerts_triggered  ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_read       ON alerts(read);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity   ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_notified   ON alerts(notified_telegram, severity);
  `);
  return db;
}

function insertAlert(
  db: Database,
  id: string,
  severity: string,
  triggeredAt: string,
  notifiedTelegram = 0,
): void {
  db.prepare(`
    INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, message, read, notified_telegram)
    VALUES (?, ?, ?, '[]', '[{"code":"VCB"}]', 'test alert', 0, ?)
  `).run(id, triggeredAt, severity, notifiedTelegram);
}

/** ISO timestamp N minutes before now */
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema migration — notified_telegram column
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 137 — schema migration: notified_telegram column", () => {
  it("initDatabase() adds notified_telegram column to alerts table", async () => {
    // Use a fresh in-memory DB so the migration is actually exercised.
    // We override DB_PATH to ":memory:" so initDatabase() works without files.
    const originalDbPath = Bun.env["DB_PATH"];
    Bun.env["DB_PATH"] = ":memory:";

    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();

    const { initDatabase, getDb } = await import("../infrastructure/db/schema.js");
    await initDatabase();

    const db = getDb();
    // Verify the column exists by trying to query it
    const row = db
      .prepare("SELECT notified_telegram FROM alerts LIMIT 0")
      .all();
    expect(row).toBeDefined();

    // Restore
    closeDb();
    if (originalDbPath !== undefined) {
      Bun.env["DB_PATH"] = originalDbPath;
    } else {
      delete Bun.env["DB_PATH"];
    }
  });

  it("initDatabase() is idempotent — calling twice does not throw", async () => {
    const originalDbPath = Bun.env["DB_PATH"];
    Bun.env["DB_PATH"] = ":memory:";

    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();

    const { initDatabase, closeDb: closeDb2 } = await import("../infrastructure/db/schema.js");
    await initDatabase();
    await initDatabase(); // second call — must not throw

    closeDb2();
    if (originalDbPath !== undefined) {
      Bun.env["DB_PATH"] = originalDbPath;
    } else {
      delete Bun.env["DB_PATH"];
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readUnnotifiedAlerts() — DB helper
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 137 — readUnnotifiedAlerts()", () => {
  it("returns HIGH alerts within the time window", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "a1", "high", minutesAgo(5));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("a1");
  });

  it("returns CRITICAL alerts within the time window", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "c1", "critical", minutesAgo(3));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("c1");
  });

  it("excludes already-notified alerts (notified_telegram = 1)", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "n1", "high", minutesAgo(5), 1); // already notified

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(0);
  });

  it("excludes alerts outside the time window", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "old", "high", minutesAgo(20)); // 20 minutes ago, window is 16

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(0);
  });

  // Sprint 053 / report 1024: with the 24h window a HIGH alert whose first
  // send failed must still be picked up by the next cycle hours later.
  it("retries HIGH alerts still within the 24h retry window", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "retry-1h", "high", minutesAgo(60));      // 1h old
    insertAlert(db, "retry-12h", "critical", minutesAgo(720)); // 12h old
    insertAlert(db, "expired", "high", minutesAgo(60 * 25));   // 25h — too old

    const WINDOW_MINUTES = 24 * 60;
    const results = readUnnotifiedAlerts(WINDOW_MINUTES, db);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(["retry-12h", "retry-1h"]);
  });

  it("excludes INFO and WARNING severity alerts", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "i1", "info", minutesAgo(5));
    insertAlert(db, "w1", "warning", minutesAgo(5));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(0);
  });

  it("returns multiple alerts sorted oldest-first", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "b", "high", minutesAgo(10));
    insertAlert(db, "a", "critical", minutesAgo(2));

    const results = readUnnotifiedAlerts(16, db);
    expect(results.length).toBe(2);
    // oldest first: "b" (10 min ago) before "a" (2 min ago)
    expect(results[0]!.id).toBe("b");
    expect(results[1]!.id).toBe("a");
  });

  it("returns empty array when no unnotified alerts exist", async () => {
    const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    const results = readUnnotifiedAlerts(16, db);
    expect(results).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markAlertNotified() — DB helper
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 137 — markAlertNotified()", () => {
  it("sets notified_telegram = 1 for the given alert ID", async () => {
    const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "m1", "high", minutesAgo(5));

    markAlertNotified("m1", db);

    const row = db.prepare("SELECT notified_telegram FROM alerts WHERE id = ?").get("m1") as
      | { notified_telegram: number }
      | undefined;
    expect(row?.notified_telegram).toBe(1);
  });

  it("does not affect other rows when marking one alert", async () => {
    const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "x1", "high", minutesAgo(5));
    insertAlert(db, "x2", "high", minutesAgo(3));

    markAlertNotified("x1", db);

    const x2 = db.prepare("SELECT notified_telegram FROM alerts WHERE id = ?").get("x2") as
      | { notified_telegram: number }
      | undefined;
    expect(x2?.notified_telegram).toBe(0);
  });

  it("is idempotent — calling twice does not throw or corrupt data", async () => {
    const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
    const db = createTestDb();

    insertAlert(db, "idem", "critical", minutesAgo(5));

    markAlertNotified("idem", db);
    markAlertNotified("idem", db); // second call — must not throw

    const row = db.prepare("SELECT notified_telegram FROM alerts WHERE id = ?").get("idem") as
      | { notified_telegram: number }
      | undefined;
    expect(row?.notified_telegram).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runIntelligenceCycle() — Step E integration
// ─────────────────────────────────────────────────────────────────────────────

// Step E tests call runIntelligenceCycle which has multiple async steps
// with internal 2-min timeouts. Default 5s Bun test timeout is too short.
const CYCLE_TIMEOUT = 30_000;

describe("Task 137 — Step E: alerts flow through to sendAlertsFn", () => {
  it("passes DB alerts to sendAlertsFn and returns correct count (AC-1)", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );
    resetCycleGuard();

    const db = createTestDb();
    insertAlert(db, "e1", "high", minutesAgo(5));
    insertAlert(db, "e2", "high", minutesAgo(3));

    const receivedAlerts: string[] = [];

    const result = await runIntelligenceCycle({
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      sendAlertsFn: async (alerts) => {
        for (const a of alerts) receivedAlerts.push(a.id);
        return alerts.length;
      },
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (windowMs) => {
        const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
        const windowMinutes = windowMs / 60_000;
        return readUnnotifiedAlerts(windowMinutes, db);
      },
    });

    expect(result).not.toBeNull();
    expect(result!.telegramAlertsSent).toBe(2);
    expect(receivedAlerts).toContain("e1");
    expect(receivedAlerts).toContain("e2");
  }, CYCLE_TIMEOUT);

  it("marks alerts as notified_telegram = 1 after successful send (AC-1)", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );
    resetCycleGuard();

    const db = createTestDb();
    insertAlert(db, "mark1", "critical", minutesAgo(5));

    await runIntelligenceCycle({
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      sendAlertsFn: async (alerts) => alerts.length, // returns count = success
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (windowMs) => {
        const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
        return readUnnotifiedAlerts(windowMs / 60_000, db);
      },
      markAlertNotifiedFn: async (id) => {
        const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
        markAlertNotified(id, db);
      },
    });

    const row = db
      .prepare("SELECT notified_telegram FROM alerts WHERE id = 'mark1'")
      .get() as { notified_telegram: number } | undefined;
    expect(row?.notified_telegram).toBe(1);
  }, CYCLE_TIMEOUT);

  it("second cycle sends 0 alerts after first marks them notified (AC-1 idempotency)", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );

    const db = createTestDb();
    insertAlert(db, "idem1", "high", minutesAgo(5));

    const deps = {
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      sendAlertsFn: async (alerts: { id: string }[]) => alerts.length,
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (windowMs: number) => {
        const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
        return readUnnotifiedAlerts(windowMs / 60_000, db);
      },
      markAlertNotifiedFn: async (id: string) => {
        const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
        markAlertNotified(id, db);
      },
    };

    resetCycleGuard();
    const r1 = await runIntelligenceCycle(deps);
    expect(r1!.telegramAlertsSent).toBe(1);

    resetCycleGuard();
    const r2 = await runIntelligenceCycle(deps);
    expect(r2!.telegramAlertsSent).toBe(0);
  }, CYCLE_TIMEOUT);

  it("does not mark alert when sendAlertsFn returns 0 (AC-2)", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );
    resetCycleGuard();

    const db = createTestDb();
    insertAlert(db, "fail1", "high", minutesAgo(5));

    await runIntelligenceCycle({
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      // sendAlertsFn returns 0 = none sent (e.g. Telegram not configured)
      sendAlertsFn: async (_alerts) => 0,
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (windowMs) => {
        const { readUnnotifiedAlerts } = await import("../infrastructure/db/alertStore.js");
        return readUnnotifiedAlerts(windowMs / 60_000, db);
      },
      markAlertNotifiedFn: async (id) => {
        const { markAlertNotified } = await import("../infrastructure/db/alertStore.js");
        markAlertNotified(id, db);
      },
    });

    const row = db
      .prepare("SELECT notified_telegram FROM alerts WHERE id = 'fail1'")
      .get() as { notified_telegram: number } | undefined;
    // Flag must still be 0 — failed send should not mark as notified
    expect(row?.notified_telegram).toBe(0);
  }, CYCLE_TIMEOUT);

  it("telegramAlertsSent = 0 when no unnotified HIGH/CRITICAL alerts exist", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );
    resetCycleGuard();

    const result = await runIntelligenceCycle({
      isMarketHoursFn: () => true,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      sendAlertsFn: async (alerts) => alerts.length,
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (_windowMs) => [],
    });

    expect(result).not.toBeNull();
    expect(result!.telegramAlertsSent).toBe(0);
  }, CYCLE_TIMEOUT);

  it("Step E is skipped outside market hours", async () => {
    const { runIntelligenceCycle, resetCycleGuard } = await import(
      "../scheduler/intelligenceCycleJob.js"
    );
    resetCycleGuard();

    let readCalled = false;

    const result = await runIntelligenceCycle({
      isMarketHoursFn: () => false,
      pollNewsFn: async () => ({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 }),
      listSscDocsFn: async () => [],
      fetchPricesFn: async () => 0,
      runImpactChainFn: async () => 0,
      sendAlertsFn: async (alerts) => alerts.length,
      getWatchlistCodesFn: async () => [],
      readUnnotifiedAlertsFn: async (_windowMs) => {
        readCalled = true;
        return [];
      },
    });

    expect(result).not.toBeNull();
    expect(readCalled).toBe(false);
    expect(result!.telegramAlertsSent).toBe(0);
  }, CYCLE_TIMEOUT);
});
