/**
 * Task 1359a — vpsServiceHealthJob + walCheckpointAlert gap tests
 *
 * VHJ-1 through VHJ-8: runVpsServiceHealthJob (scheduler-layer DB-write coordinator)
 * WCA-1 through WCA-8: walCheckpointAlert two-tier boundary semantics
 *
 * DI strategy:
 *   runVpsServiceHealthJob  — (db, configs?) plain args; in-memory Database + custom FreshnessConfig[]
 *   runVpsHealthPolling     — dynamic import + Bun.env.DB_PATH=":memory:" smoke test
 *   walCheckpointAlert      — sendWorkFn? optional arg; inline async function
 *
 * No mock.module needed for any test in this file.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  runVpsServiceHealthJob,
  runVpsHealthPolling,
} from "../scheduler/system/vpsServiceHealthJob.js";
import type { FreshnessConfig } from "../domain/services/vpsHealthPoller.js";
import { walCheckpointAlert } from "../scheduler/walCheckpointAlert.js";

// ── Schema helper ────────────────────────────────────────────────────────────

function buildVpsDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE vps_service_health (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name        TEXT NOT NULL,
      polled_at           TEXT NOT NULL,
      health_status       TEXT NOT NULL,
      response_time_ms    INTEGER,
      last_successful_run TEXT,
      uptime_seconds      INTEGER,
      error_message       TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT, price REAL, change_amt REAL, change_pct REAL,
      volume INTEGER, updated_at TEXT, exchange TEXT
    );
    CREATE TABLE IF NOT EXISTS market_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT, message_type TEXT, ticker TEXT, content TEXT, sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code TEXT, date TEXT, close REAL, updated_at TEXT, foreign_buy_vol INTEGER
    );
    CREATE TABLE IF NOT EXISTS sbv_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT, fetched_at TEXT
    );
  `);
  return db;
}

// ── Passive configs (no external query needed) ───────────────────────────────

const passiveConfig1: FreshnessConfig = {
  serviceName: "vn-bctc-fetch",
  description: "test passive 1",
  passive: true,
};

const passiveConfig2: FreshnessConfig = {
  serviceName: "vn-news-fetch",
  description: "test passive 2",
  passive: true,
};

const passiveConfig3: FreshnessConfig = {
  serviceName: "vn-sbv-fetch",
  description: "test passive 3",
  passive: true,
};

const threePassiveConfigs: FreshnessConfig[] = [
  passiveConfig1,
  passiveConfig2,
  passiveConfig3,
];

const twoPassiveConfigs: FreshnessConfig[] = [passiveConfig1, passiveConfig2];

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359a — vpsServiceHealthJob gap tests (VHJ)", () => {
  // ── VHJ-1 ─────────────────────────────────────────────────────────────────
  it("VHJ-1: polled count equals config length", async () => {
    const db = buildVpsDb();
    const r = await runVpsServiceHealthJob(db, threePassiveConfigs);
    expect(r.polled).toBe(3);
  });

  // ── VHJ-2 ─────────────────────────────────────────────────────────────────
  it("VHJ-2: stored count equals polled count when all INSERTs succeed", async () => {
    const db = buildVpsDb();
    const r = await runVpsServiceHealthJob(db, threePassiveConfigs);

    expect(r.stored).toBe(3);

    const row = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) AS c FROM vps_service_health",
      )
      .get();
    expect(row!.c).toBe(3);
  });

  // ── VHJ-3 ─────────────────────────────────────────────────────────────────
  it("VHJ-3: empty config array returns polled=0, stored=0, writes nothing", async () => {
    const db = buildVpsDb();
    const r = await runVpsServiceHealthJob(db, []);

    expect(r.polled).toBe(0);
    expect(r.stored).toBe(0);

    const row = db
      .query<{ c: number }, []>(
        "SELECT COUNT(*) AS c FROM vps_service_health",
      )
      .get();
    expect(row!.c).toBe(0);
  });

  // ── VHJ-4 ─────────────────────────────────────────────────────────────────
  it("VHJ-4: DB INSERT failure for one row does not prevent others from storing", async () => {
    const db = buildVpsDb();

    // Stub: first stmt.run() throws, subsequent calls succeed
    const realPrepare = db.prepare.bind(db);
    let callCount = 0;
    // @ts-expect-error — intentional stub of prepare for test isolation
    db.prepare = (sql: string) => {
      const stmt = realPrepare(sql);
      if (sql.includes("INSERT INTO vps_service_health")) {
        const realRun = stmt.run.bind(stmt);
        stmt.run = (...args: Parameters<typeof stmt.run>) => {
          callCount++;
          if (callCount === 1) throw new Error("simulated INSERT failure");
          return realRun(...args);
        };
      }
      return stmt;
    };

    const r = await runVpsServiceHealthJob(db, twoPassiveConfigs);

    expect(r.polled).toBe(2);
    expect(r.stored).toBe(1);

    // The second service (passiveConfig2 = "vn-news-fetch") must be present
    const row = db
      .query<{ service_name: string }, []>(
        "SELECT service_name FROM vps_service_health LIMIT 1",
      )
      .get();
    expect(row!.service_name).toBe("vn-news-fetch");
  });

  // ── VHJ-5 ─────────────────────────────────────────────────────────────────
  it("VHJ-5: stored rows contain correct service_name and health_status", async () => {
    const db = buildVpsDb();
    const config: FreshnessConfig = {
      serviceName: "vn-bctc-fetch",
      description: "test bctc passive",
      passive: true,
    };

    await runVpsServiceHealthJob(db, [config]);

    const row = db
      .query<{ service_name: string; health_status: string }, []>(
        "SELECT service_name, health_status FROM vps_service_health LIMIT 1",
      )
      .get();

    expect(row!.service_name).toBe("vn-bctc-fetch");
    expect(row!.health_status).toBe("healthy");
  });

  // ── VHJ-6 ─────────────────────────────────────────────────────────────────
  it("VHJ-6: stored rows have a valid ISO polled_at timestamp", async () => {
    const db = buildVpsDb();
    const config: FreshnessConfig = {
      serviceName: "vn-bctc-fetch",
      description: "test bctc passive",
      passive: true,
    };

    await runVpsServiceHealthJob(db, [config]);

    const row = db
      .query<{ polled_at: string }, []>(
        "SELECT polled_at FROM vps_service_health LIMIT 1",
      )
      .get();

    expect(() => new Date(row!.polled_at).toISOString()).not.toThrow();
  });

  // ── VHJ-7 ─────────────────────────────────────────────────────────────────
  it("VHJ-7: unhealthy result is stored, not silently dropped", async () => {
    const db = buildVpsDb();

    const staleConfig: FreshnessConfig = {
      serviceName: "vn-news-fetch",
      description: "test stale",
      latestTimestampSql: `SELECT '2000-01-01T00:00:00.000Z' AS latest_at`,
      maxAgeMs: 1,
    };

    const r = await runVpsServiceHealthJob(db, [staleConfig]);

    expect(r.stored).toBe(1);

    const row = db
      .query<{ health_status: string }, []>(
        "SELECT health_status FROM vps_service_health LIMIT 1",
      )
      .get();
    expect(row!.health_status).toBe("unhealthy");
  });

  // ── VHJ-8 ─────────────────────────────────────────────────────────────────
  it("VHJ-8: runVpsHealthPolling smoke — resolves without throwing", async () => {
    Bun.env["DB_PATH"] = ":memory:";
    // runVpsHealthPolling dynamically imports schema.js then calls runVpsServiceHealthJob.
    // It catches all errors internally — must resolve (not reject).
    await expect(runVpsHealthPolling()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1359a — walCheckpointAlert gap tests (WCA)", () => {
  let calls: string[];
  let mockSend: (msg: string) => Promise<void>;

  beforeEach(() => {
    calls = [];
    mockSend = async (msg: string) => {
      calls.push(msg);
    };
  });

  // ── WCA-1 ─────────────────────────────────────────────────────────────────
  it("WCA-1: remaining below warn threshold (4 999) — silent", async () => {
    // walSize=9999, checkpointed=5000 → remaining=4999 (< WAL_WARN_THRESHOLD 5000)
    await walCheckpointAlert({ walSize: 9_999, checkpointed: 5_000 }, mockSend);
    expect(calls.length).toBe(0);
  });

  // ── WCA-2 ─────────────────────────────────────────────────────────────────
  it("WCA-2: remaining exactly at warn threshold (5 000) — silent", async () => {
    // walSize=10000, checkpointed=5000 → remaining=5000 (= WAL_WARN_THRESHOLD — guard is <=)
    await walCheckpointAlert(
      { walSize: 10_000, checkpointed: 5_000 },
      mockSend,
    );
    expect(calls.length).toBe(0);
  });

  // ── WCA-3 ─────────────────────────────────────────────────────────────────
  it("WCA-3: remaining = 5 001 — first warn fires, not critical", async () => {
    // walSize=15001, checkpointed=10000 → remaining=5001 (first frame above WAL_WARN_THRESHOLD)
    await walCheckpointAlert(
      { walSize: 15_001, checkpointed: 10_000 },
      mockSend,
    );
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL WARNING");
    expect(calls[0]).not.toContain("WAL CRITICAL");
  });

  // ── WCA-4 ─────────────────────────────────────────────────────────────────
  it("WCA-4: warn message content shape", async () => {
    // walSize=6000, checkpointed=0 → remaining=6000 (> 5000, <= 10000)
    await walCheckpointAlert({ walSize: 6_000, checkpointed: 0 }, mockSend);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL WARNING");
    expect(calls[0]).toContain("6000 frames un-flushed");
    expect(calls[0]).toContain("WAL=6000");
    expect(calls[0]).toContain("checkpointed=0");
    expect(calls[0]).toContain("monitoring");
    expect(calls[0]).not.toContain("manual restart");
  });

  // ── WCA-5 ─────────────────────────────────────────────────────────────────
  it("WCA-5: remaining exactly at critical threshold (10 000) — warn, not critical", async () => {
    // walSize=20000, checkpointed=10000 → remaining=10000 (= WAL_STUCK_THRESHOLD exactly)
    // isCritical = remaining > WAL_STUCK_THRESHOLD (strict >) → false
    await walCheckpointAlert(
      { walSize: 20_000, checkpointed: 10_000 },
      mockSend,
    );
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL WARNING");
    expect(calls[0]).not.toContain("WAL CRITICAL");
  });

  // ── WCA-6 ─────────────────────────────────────────────────────────────────
  it("WCA-6: remaining = 10 001 — first critical fires", async () => {
    // walSize=30001, checkpointed=20000 → remaining=10001 (first frame above WAL_STUCK_THRESHOLD)
    await walCheckpointAlert(
      { walSize: 30_001, checkpointed: 20_000 },
      mockSend,
    );
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL CRITICAL");
  });

  // ── WCA-7 ─────────────────────────────────────────────────────────────────
  it("WCA-7: critical message content shape", async () => {
    // walSize=15000, checkpointed=0 → remaining=15000 (critical)
    await walCheckpointAlert({ walSize: 15_000, checkpointed: 0 }, mockSend);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL CRITICAL");
    expect(calls[0]).toContain("15000 frames un-flushed");
    expect(calls[0]).toContain("manual restart may be needed");
    expect(calls[0]).not.toContain("monitoring");
  });

  // ── WCA-8 ─────────────────────────────────────────────────────────────────
  it("WCA-8: send error is swallowed — promise resolves to undefined, no re-throw", async () => {
    // remaining=20000 (critical). Inject a throwing sendWorkFn.
    const throwingFn = async (_msg: string) => {
      throw new Error("Telegram down");
    };
    await expect(
      walCheckpointAlert({ walSize: 30_000, checkpointed: 10_000 }, throwingFn),
    ).resolves.toBeUndefined();
  });
});
