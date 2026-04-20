Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT PRIMARY KEY, price REAL NOT NULL DEFAULT 0,
      change_pct REAL, volume REAL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, service TEXT NOT NULL,
      items_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'ok',
      error_msg TEXT, duration_ms INTEGER,
      pushed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vpl_service_ts ON vps_push_log(service, pushed_at);
  `);
  return db;
}

describe("Task 1208 — Stock price freshness uses VPS-push timestamp", () => {
  it("vps_push_log.pushed_at correctly tracks last VPS push time", () => {
    const db = buildTestDb();
    const recentPushTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)")
      .run("prices", 120, "ok", recentPushTime);
    const row = db.prepare<{ ts: string }, []>(
      "SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'prices' AND status = 'ok'"
    ).get();
    expect(row?.ts).toBe(recentPushTime);
    const ageHours = (Date.now() - new Date(row!.ts).getTime()) / (1000 * 3600);
    expect(ageHours).toBeLessThan(1);
    db.close();
  });

  it("vps_push_log query returns null when VPS has never pushed prices", () => {
    const db = buildTestDb();
    const row = db.prepare<{ ts: string | null }, []>(
      "SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'prices' AND status = 'ok'"
    ).get();
    expect(row?.ts).toBeNull();
    db.close();
  });

  it("vps_push_log query returns null when only failed pushes exist", () => {
    const db = buildTestDb();
    db.prepare("INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)")
      .run("prices", 0, "error", new Date(Date.now() - 60 * 1000).toISOString());
    const row = db.prepare<{ ts: string | null }, []>(
      "SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'prices' AND status = 'ok'"
    ).get();
    expect(row?.ts).toBeNull();
    db.close();
  });

  it("vps_push_log distinguishes fresh push from stale market_prices.updated_at", async () => {
    const db = buildTestDb();
    const lastPushAt = new Date(Date.now() - 12 * 3600_000).toISOString();
    const staleUpdatedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    db.prepare("INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)")
      .run("prices", 130, "ok", lastPushAt);
    db.prepare("INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("VHM", 45000, -0.5, 1000000, staleUpdatedAt);
    const vpsPushRow = db.prepare<{ ts: string }, []>(
      "SELECT MAX(pushed_at) AS ts FROM vps_push_log WHERE service = 'prices' AND status = 'ok'"
    ).get();
    const priceRow = db.prepare<{ ts: string }, []>(
      "SELECT MAX(updated_at) AS ts FROM market_prices"
    ).get();
    const pushAgeHours = (Date.now() - new Date(vpsPushRow!.ts).getTime()) / (1000 * 3600);
    const priceAgeHours = (Date.now() - new Date(priceRow!.ts).getTime()) / (1000 * 3600);
    expect(pushAgeHours).toBeGreaterThan(11);
    expect(priceAgeHours).toBeLessThan(3);
    const { classifyFreshness } = await import("../interface/mcp/tools/market-data/dataFreshnessTools.js");
    expect(classifyFreshness(pushAgeHours)).toBe("Cũ");
    expect(classifyFreshness(priceAgeHours)).toBe("Bình thường");
    db.close();
  });

  it("getDataFreshness: Gia co phieu row uses vps_push_log pushed_at (fresh push = Tốt)", async () => {
    const { getDataFreshness } = await import("../interface/mcp/tools/market-data/dataFreshnessTools.js");
    const db = buildTestDb();
    const staleUpdatedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    db.prepare("INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("VHM", 45000, -0.5, 1000000, staleUpdatedAt);
    const freshPushAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO vps_push_log (service, items_count, status, pushed_at) VALUES (?, ?, ?, ?)")
      .run("prices", 130, "ok", freshPushAt);
    const report = await getDataFreshness(db);
    expect(report).toContain("Tốt");
    db.close();
  });

  it("getDataFreshness: Gia co phieu shows no data when VPS never pushed", async () => {
    const { getDataFreshness } = await import("../interface/mcp/tools/market-data/dataFreshnessTools.js");
    const db = buildTestDb();
    db.prepare("INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("VHM", 45000, -0.5, 1000000, new Date(Date.now() - 2 * 3600_000).toISOString());
    const report = await getDataFreshness(db);
    expect(report).toContain("Chưa có dữ liệu");
    db.close();
  });
});
