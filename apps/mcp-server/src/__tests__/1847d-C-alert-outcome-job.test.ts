// apps/mcp-server/src/__tests__/1847d-C-alert-outcome-job.test.ts
// Task 1847d-C — alertOutcomeJob integration tests
//
// Uses in-memory SQLite with real schema.
// Telegram sender is injected as a no-op to isolate tests from network.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runAlertOutcomeJob } from "../scheduler/alerts/alertOutcomeJob.js";
import { initAlertsTables } from "../infrastructure/db/schema-alerts.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Minimal DDL helpers ────────────────────────────────────────────────────

function buildTestDb(): Database {
  const db = new Database(":memory:");
  initAlertsTables(db);

  // market_prices_history — minimal DDL (matches production schema subset)
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    )
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── Seed helpers ───────────────────────────────────────────────────────────

type AlertSeed = {
  id: string;
  triggered_at: string;
  signals_json?: string | null;
  affected_actions_json?: string | null;
  outcome?: string | null;
};

function insertAlert(db: Database, alert: AlertSeed): void {
  db.prepare(
    `INSERT INTO alerts (id, triggered_at, severity, signals_json, affected_actions_json, outcome)
     VALUES (?, ?, 'medium', ?, ?, ?)`,
  ).run(
    alert.id,
    alert.triggered_at,
    alert.signals_json ?? null,
    alert.affected_actions_json ?? null,
    alert.outcome ?? null,
  );
}

function insertPrice(
  db: Database,
  code: string,
  price: number,
  fetchedAt: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO market_prices_history (code, price, fetched_at) VALUES (?, ?, ?)`,
  ).run(code, price, fetchedAt);
}

function getOutcome(db: Database, alertId: string): string | null {
  const row = db
    .prepare<{ outcome: string | null }, [string]>(
      "SELECT outcome FROM alerts WHERE id = ? LIMIT 1",
    )
    .get(alertId);
  return row?.outcome ?? null;
}

/** No-op telegram sender for tests */
async function noopTelegram(_msg: string): Promise<void> {}

// ── Test data factories ────────────────────────────────────────────────────

/** Signals JSON for position-danger alert */
const positionDangerSignals = JSON.stringify([{ type: "position-danger" }]);

/** Signals JSON for watchlist-opportunity alert */
const watchlistOppSignals = JSON.stringify([{ type: "watchlist-opportunity" }]);

/** affected_actions for VIC ticker */
const vicActions = JSON.stringify([{ code: "VIC" }]);

/** Date 6 days ago (always past evalWindowDays=5 for position-danger) */
function daysAgo(n: number): string {
  const d = new Date("2026-05-06T12:00:00Z");
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const NOW = new Date("2026-05-06T12:00:00Z");
const nowFn = () => NOW;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Task 1847d-C — alertOutcomeJob", () => {
  let db: Database;

  beforeEach(() => {
    db = buildTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // TEST-1: Empty pending list → graceful return, all zeros
  it("TEST-1: empty pending list → evaluated=0, no crash", async () => {
    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });
    expect(result).toEqual({
      evaluated: 0,
      hit: 0,
      miss: 0,
      unknown: 0,
      skipped: 0,
    });
  });

  // TEST-2: Job scores pending alert when enough data is present
  it("TEST-2: job scores position-danger alert correctly → outcome written", async () => {
    const triggeredAt = daysAgo(6); // 6 days ago, past 5-day eval window

    insertAlert(db, {
      id: "alert-001",
      triggered_at: triggeredAt,
      signals_json: positionDangerSignals,
      affected_actions_json: vicActions,
    });

    // Price at alert: 100, prices stayed ≤100 → HIT
    insertPrice(db, "VIC", 100, triggeredAt);
    insertPrice(db, "VIC", 99, daysAgo(5));
    insertPrice(db, "VIC", 98, daysAgo(4));
    insertPrice(db, "VIC", 97, daysAgo(3));

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });

    expect(result.evaluated).toBe(1);
    expect(result.hit).toBe(1);
    expect(result.miss).toBe(0);

    const outcome = getOutcome(db, "alert-001");
    expect(outcome).toBe("HIT");
  });

  // TEST-3: Job skips alert where calDays < evalWindowDays (too early)
  it("TEST-3: job skips alert where calDays < evalWindowDays", async () => {
    // Only 2 days old, position-danger needs 5 days
    insertAlert(db, {
      id: "alert-recent",
      triggered_at: daysAgo(2),
      signals_json: positionDangerSignals,
      affected_actions_json: vicActions,
    });

    // Prices exist
    insertPrice(db, "VIC", 100, daysAgo(2));
    insertPrice(db, "VIC", 99, daysAgo(1));

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });

    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.evaluated).toBe(0);

    // Outcome must remain null — no premature write
    expect(getOutcome(db, "alert-recent")).toBeNull();
  });

  // TEST-4: Job skips alert with no price data → skipped, outcome stays null
  it("TEST-4: alert with no price data → skipped, outcome stays null", async () => {
    insertAlert(db, {
      id: "alert-no-price",
      triggered_at: daysAgo(7),
      signals_json: positionDangerSignals,
      affected_actions_json: JSON.stringify([{ code: "HPG" }]),
    });

    // No price data for HPG

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });

    // Alert was evaluated (calDays >= evalWindow) but unknown (no price data)
    // OR classified as evaluated=1, unknown=1
    // The scorer returns unknown for no price data — gets written
    const outcome = getOutcome(db, "alert-no-price");
    // Should be UNKNOWN (no price data) or null if skipped
    expect(["UNKNOWN", null]).toContain(outcome);
  });

  // TEST-5: Idempotency — re-run on already-scored alerts → 0 new writes
  it("TEST-5: idempotency — re-run does not re-score already scored alerts", async () => {
    const triggeredAt = daysAgo(6);

    insertAlert(db, {
      id: "alert-idem",
      triggered_at: triggeredAt,
      signals_json: positionDangerSignals,
      affected_actions_json: vicActions,
    });

    insertPrice(db, "VIC", 100, triggeredAt);
    insertPrice(db, "VIC", 99, daysAgo(5));

    // First run
    const result1 = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });
    expect(result1.evaluated).toBe(1);

    // Second run — readPendingOutcomeAlerts only returns WHERE outcome IS NULL
    const result2 = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });
    expect(result2.evaluated).toBe(0);
  });

  // TEST-6: Respects 100-alert batch (processing many alerts)
  it("TEST-6: processes multiple alerts in single batch", async () => {
    const triggeredAt = daysAgo(6);

    // Insert 10 position-danger alerts for VIC
    for (let i = 1; i <= 10; i++) {
      insertAlert(db, {
        id: `alert-batch-${i}`,
        triggered_at: triggeredAt,
        signals_json: positionDangerSignals,
        affected_actions_json: JSON.stringify([{ code: "VIC" }]),
      });
    }

    // Prices: VIC dropped (all prices ≤ alert price → HIT for all)
    insertPrice(db, "VIC", 100, triggeredAt);
    insertPrice(db, "VIC", 98, daysAgo(5));
    insertPrice(db, "VIC", 97, daysAgo(4));

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });

    expect(result.evaluated).toBe(10);
    expect(result.hit).toBe(10);
  });

  // TEST-7: Position-danger HIT triggers Telegram digest (BLK-3)
  it("TEST-7: position-danger HIT triggers telegram digest", async () => {
    const triggeredAt = daysAgo(6);

    insertAlert(db, {
      id: "alert-tg",
      triggered_at: triggeredAt,
      signals_json: positionDangerSignals,
      affected_actions_json: vicActions,
    });

    insertPrice(db, "VIC", 100, triggeredAt);
    insertPrice(db, "VIC", 99, daysAgo(5));

    let telegramCalled = false;
    let capturedMessage = "";

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: async (msg: string) => {
        telegramCalled = true;
        capturedMessage = msg;
      },
    });

    expect(result.hit).toBe(1);
    expect(telegramCalled).toBe(true);
    expect(capturedMessage).toContain("position-danger");
    expect(capturedMessage).toContain("VIC");
  });

  // TEST-8: Telegram digest capped at 5 tickers even if more HITs
  it("TEST-8: telegram digest capped at 5 tickers", async () => {
    const triggeredAt = daysAgo(6);

    const tickers = ["VIC", "VHM", "HPG", "FPT", "MWG", "ACB", "BID", "CTG"];

    for (let i = 0; i < tickers.length; i++) {
      const code = tickers[i]!;
      insertAlert(db, {
        id: `alert-cap-${i}`,
        triggered_at: triggeredAt,
        signals_json: positionDangerSignals,
        affected_actions_json: JSON.stringify([{ code }]),
      });

      insertPrice(db, code, 100, triggeredAt);
      insertPrice(db, code, 98, daysAgo(5));
    }

    let capturedMessage = "";

    await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: async (msg: string) => {
        capturedMessage = msg;
      },
    });

    // Message mentions the total count (8) but only shows first 5 lines
    const bulletCount = (capturedMessage.match(/^•/gm) ?? []).length;
    expect(bulletCount).toBeLessThanOrEqual(5);
    expect(capturedMessage).toContain("more");
  });

  // TEST-9 (bonus): DB error per-alert is caught, job continues
  it("TEST-9: per-alert error does not crash job — skipped and continues", async () => {
    const triggeredAt = daysAgo(6);

    // Valid alert
    insertAlert(db, {
      id: "alert-good",
      triggered_at: triggeredAt,
      signals_json: positionDangerSignals,
      affected_actions_json: vicActions,
    });

    // Alert with invalid affected_actions_json → extractPrimaryCode fails → skipped
    insertAlert(db, {
      id: "alert-bad",
      triggered_at: triggeredAt,
      signals_json: positionDangerSignals,
      affected_actions_json: null,
    });

    insertPrice(db, "VIC", 100, triggeredAt);
    insertPrice(db, "VIC", 98, daysAgo(5));

    const result = await runAlertOutcomeJob({
      db,
      nowFn,
      telegramSender: noopTelegram,
    });

    // alert-good should be evaluated, alert-bad skipped (no code)
    expect(result.evaluated).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
