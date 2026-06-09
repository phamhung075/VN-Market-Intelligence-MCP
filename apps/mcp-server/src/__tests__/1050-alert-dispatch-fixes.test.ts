/**
 * Task 1050 — Alert dispatch fixes
 *
 * Issue 1: bctcOverdueCheckJob stores signals_json as ["bctc_overdue"] (string
 * array). When formatSignalVi(s) is called with s = "bctc_overdue", s.message
 * is undefined → msg.match() crashes → notifyTelegramAlert catches the error
 * and returns false → sent = 0 → markAlertNotified is never called → 7 HIGH
 * alerts stuck unnotified forever.
 *
 * Fix: store a proper Signal-shaped object so formatSignalVi gets .type and
 * .message properties.
 *
 * Issue 2: generateAlerts uses a random ID every call. SSI price_surge fires
 * every ~1-min cycle with the same base price — each gets a unique ID →
 * INSERT OR IGNORE never deduplicates → 80+ duplicate medium alerts in DB.
 *
 * Fix: for price_drop / price_surge / volume_spike signals, use a deterministic
 * bucket ID: alert-{ticker}-{signalType}-{UTC-hour-slot} so the same ticker +
 * same signal type within the same hour is silently ignored by INSERT OR IGNORE.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Issue 1: bctcOverdueCheck signals_json must be Signal objects not strings
// ─────────────────────────────────────────────────────────────────────────────

function buildBctcDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code     TEXT PRIMARY KEY,
      exchange TEXT NOT NULL DEFAULT 'HOSE',
      domain   TEXT NOT NULL DEFAULT 'general'
    );
    CREATE TABLE IF NOT EXISTS financial_reports (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code    TEXT NOT NULL,
      period_year    INTEGER NOT NULL,
      period_quarter INTEGER,
      published_at   TEXT
    );
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
      validated_at          TEXT
    );
  `);
  return db;
}

describe("Issue 1 — bctcOverdueCheck signals_json format (Task 1050)", () => {
  it("signals_json must be a Signal object array with .type and .message (not string array)", async () => {
    const { runBctcOverdueCheck } = await import(
      "../scheduler/financial-reports/bctcOverdueCheckJob.js"
    );
    const db = buildBctcDb();
    db.run("INSERT INTO watchlist (code, domain) VALUES ('FPT', 'general')");

    await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-05T03:00:00Z"),
    });

    const row = db
      .prepare("SELECT signals_json FROM alerts LIMIT 1")
      .get() as { signals_json: string } | undefined;

    expect(row).toBeDefined();
    const signals = JSON.parse(row!.signals_json) as unknown[];
    expect(Array.isArray(signals)).toBe(true);
    expect(signals.length).toBeGreaterThan(0);

    // Each signal must be an object with string .type and .message
    const sig = signals[0] as Record<string, unknown>;
    expect(typeof sig.type).toBe("string");
    expect(typeof sig.message).toBe("string");
    expect(sig.type).toBe("bctc_overdue");
    expect((sig.message as string).length).toBeGreaterThan(0);
  });

  it("formatSignalVi-compatible: signals[0].type and signals[0].message are non-undefined strings", async () => {
    const { runBctcOverdueCheck } = await import(
      "../scheduler/financial-reports/bctcOverdueCheckJob.js"
    );
    const { readUnnotifiedAlerts } = await import(
      "../infrastructure/db/alertStore.js"
    );
    const db = buildBctcDb();
    db.run("INSERT INTO watchlist (code, domain) VALUES ('VNM', 'general')");

    await runBctcOverdueCheck({
      db,
      now: new Date("2026-04-05T03:00:00Z"),
    });

    // readUnnotifiedAlerts deserializes signals_json → Alert.signals[]
    const alerts = readUnnotifiedAlerts(60 * 24 * 365, db);
    expect(alerts.length).toBe(1);

    const signal = alerts[0]!.signals[0]!;
    // These must NOT be undefined — formatSignalVi calls sig.message.match()
    // which crashes if message is undefined
    expect(signal.type).toBeDefined();
    expect(signal.message).toBeDefined();
    expect(typeof signal.message).toBe("string");
    // msg.match() must not throw
    expect(() => signal.message.match(/test/)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue 2: price_surge dedup via deterministic ID
// ─────────────────────────────────────────────────────────────────────────────

describe("Issue 2 — price_surge deterministic dedup ID (Task 1050)", () => {
  it("same ticker + signal type + hour slot produces identical alert ID", async () => {
    const { generateAlerts } = await import(
      "../domain/services/alertGenerator.js"
    );
    const signalA = {
      type: "price_surge" as const,
      severity: "medium" as const,
      actionCode: "SSI",
      message: "SSI surged +5.09%",
      confidence: 0.65,
      detectedAt: "2026-04-08T04:00:00.000Z",
    };
    const signalB = {
      ...signalA,
      detectedAt: "2026-04-08T04:55:00.000Z", // same UTC hour → same bucket
    };

    const alerts1 = generateAlerts([signalA], [{ actionCode: "SSI" }]);
    const alerts2 = generateAlerts([signalB], [{ actionCode: "SSI" }]);

    expect(alerts1.length).toBe(1);
    expect(alerts2.length).toBe(1);
    // Same hour bucket → same deterministic ID
    expect(alerts1[0]!.id).toBe(alerts2[0]!.id);
  });

  it("different hour slot produces different ID for same ticker + signal type", async () => {
    const { generateAlerts } = await import(
      "../domain/services/alertGenerator.js"
    );
    const signalA = {
      type: "price_surge" as const,
      severity: "medium" as const,
      actionCode: "SSI",
      message: "SSI surged +5.09%",
      confidence: 0.65,
      detectedAt: "2026-04-08T04:00:00.000Z",
    };
    const signalB = {
      ...signalA,
      detectedAt: "2026-04-08T08:00:00.000Z", // 4h bucket 08 vs bucket 04
    };

    const alerts1 = generateAlerts([signalA], [{ actionCode: "SSI" }]);
    const alerts2 = generateAlerts([signalB], [{ actionCode: "SSI" }]);

    expect(alerts1[0]!.id).not.toBe(alerts2[0]!.id);
  });

  it("INSERT OR IGNORE with deterministic ID prevents duplicate price_surge rows", async () => {
    const { generateAlerts } = await import(
      "../domain/services/alertGenerator.js"
    );
    const { storeAlerts } = await import(
      "../infrastructure/db/alertStore.js"
    );

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
        validated_at          TEXT
      );
    `);

    const signal = {
      type: "price_surge" as const,
      severity: "medium" as const,
      actionCode: "SSI",
      message: "SSI surged +5.09% (27,500 → 28,900 VND)",
      confidence: 0.65,
      detectedAt: "2026-04-08T04:13:00.000Z",
    };

    // Simulate 3 back-to-back cycles with same price (same hour)
    const alerts1 = generateAlerts([signal], [{ actionCode: "SSI" }]);
    const alerts2 = generateAlerts([{ ...signal, detectedAt: "2026-04-08T04:14:00.000Z" }], [{ actionCode: "SSI" }]);
    const alerts3 = generateAlerts([{ ...signal, detectedAt: "2026-04-08T04:22:00.000Z" }], [{ actionCode: "SSI" }]);

    storeAlerts(alerts1, db);
    storeAlerts(alerts2, db); // same ID → ignored
    storeAlerts(alerts3, db); // same ID → ignored

    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM alerts").get() as { c: number }
    ).c;
    // All three resolve to same ID → only 1 row inserted
    expect(count).toBe(1);
  });

  it("news_mention type uses deterministic day-bucket ID — same article same day = same ID", async () => {
    // Task 1291 contract update: news_mention was made deterministic (day+title fingerprint)
    // to prevent duplicate alerts after server restart when the same article is re-processed.
    // Two signals with the same message on the same day produce the same dedup ID.
    const { generateAlerts } = await import(
      "../domain/services/alertGenerator.js"
    );
    const signalA = {
      type: "news_mention" as const,
      severity: "low" as const,
      actionCode: "FPT",
      message: "FPT mentioned in 3 articles",
      confidence: 0.7,
      detectedAt: "2026-04-08T04:00:00.000Z",
    };
    // Same message, same day, different time → same day-bucket ID
    const signalB = { ...signalA, detectedAt: "2026-04-08T04:55:00.000Z" };

    const alerts1 = generateAlerts([signalA], [{ actionCode: "FPT" }]);
    const alerts2 = generateAlerts([signalB], [{ actionCode: "FPT" }]);

    // news_mention is now deterministic per (ticker, day, title fingerprint)
    expect(alerts1[0]!.id).toBe(alerts2[0]!.id);
    expect(alerts1[0]!.id).toMatch(/^alert-news-FPT-2026-04-08/);
  });
});
