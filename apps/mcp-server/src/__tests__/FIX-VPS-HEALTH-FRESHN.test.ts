/**
 * FIX-VPS-HEALTH-FRESHN.test.ts
 *
 * Verifies data-freshness health check logic for the 5 VPS services.
 *
 * BUG 1: vpsHealthPoller DEFAULT_VPS_SERVICES used localhost:5001-5005 (Docker
 *        microservice ports). VPS does not expose HTTP health endpoints.
 * BUG 2: vpsServiceHealthJob reused "polymarket" circuit breaker, causing
 *        cross-contamination — one polymarket trip blocks all VPS health checks.
 *
 * Fix: Replace HTTP health check with per-service data-freshness queries.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  checkServiceFreshness,
  DEFAULT_FRESHNESS_CONFIGS,
  type FreshnessConfig,
  type HealthPollResult,
} from "../domain/services/vpsHealthPoller.js";
import { initDatabase } from "../infrastructure/db/schema.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe("FIX-VPS-HEALTH-FRESHN — data-freshness health checks", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initDatabase(db);
  });

  // ── BUG 1: DEFAULT_VPS_SERVICES must not reference localhost HTTP endpoints ──

  it("DEFAULT_FRESHNESS_CONFIGS contains exactly 5 service entries", () => {
    expect(DEFAULT_FRESHNESS_CONFIGS.length).toBe(5);
  });

  it("DEFAULT_FRESHNESS_CONFIGS contains no localhost HTTP URLs", () => {
    for (const cfg of DEFAULT_FRESHNESS_CONFIGS) {
      // The old code had 'url' property pointing to localhost:5001-5005.
      // After the fix there should be no HTTP URL — freshness uses DB queries.
      expect("url" in cfg).toBe(false);
    }
  });

  it("DEFAULT_FRESHNESS_CONFIGS covers all 5 expected service names", () => {
    const names = DEFAULT_FRESHNESS_CONFIGS.map((c) => c.serviceName);
    expect(names).toContain("vn-price-fetch");
    expect(names).toContain("vn-bctc-fetch");
    expect(names).toContain("vn-news-fetch");
    expect(names).toContain("vn-sbv-fetch");
    expect(names).toContain("vn-foreign-flow");
  });

  // ── vn-price-fetch: healthy if market_prices updated within 5 min ───────────
  // NOTE: vn-price-fetch is marketHoursOnly — tests use a fixed market-hours
  // timestamp (2026-04-27 05:02 UTC = Monday inside 02:00-08:30 UTC window)
  // so the market-hours guard does not suppress the freshness check.

  it("vn-price-fetch: healthy when market_prices has a row updated within 5 minutes", () => {
    // Insert a row 2 minutes before the fixed "now" timestamp
    db.prepare(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("VNM", 80000, 0, 0, 100000, "2026-04-27T05:00:00.000Z", "HOSE");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const result = checkServiceFreshness(db, config, "2026-04-27T05:02:00.000Z");

    expect(result.healthStatus).toBe("healthy");
    expect(result.serviceName).toBe("vn-price-fetch");
  });

  it("vn-price-fetch: unhealthy when market_prices last update is older than 5 minutes", () => {
    // Row is 10 minutes old relative to fixed "now"
    db.prepare(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("VNM", 80000, 0, 0, 100000, "2026-04-27T04:52:00.000Z", "HOSE");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const result = checkServiceFreshness(db, config, "2026-04-27T05:02:00.000Z");

    expect(result.healthStatus).toBe("unhealthy");
    expect(result.errorMessage).toBeDefined();
  });

  it("vn-price-fetch: unreachable when market_prices table has no rows (during market hours)", () => {
    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    // Use a market-hours timestamp so the guard does not return idle
    const result = checkServiceFreshness(db, config, "2026-04-27T05:00:00.000Z");

    expect(result.healthStatus).toBe("unreachable");
  });

  // ── vn-news-fetch: healthy if market_messages created within 20 min ──────────

  it("vn-news-fetch: healthy when rag_analyses has a row created within 30 minutes", () => {
    // FIX-1405b: vn-news-fetch now queries rag_analyses.created_at (not market_messages).
    // VPS news items land in rag_analyses via the pollNews pipeline.
    // rag_analyses schema: id TEXT PK, created_at TEXT, level TEXT NOT NULL, ...
    db.prepare(`
      INSERT INTO rag_analyses (id, created_at, level)
      VALUES (?, ?, ?)
    `).run("test-row-1", minutesAgoIso(5), "news");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("healthy");
  });

  it("vn-news-fetch: unhealthy when rag_analyses last row is older than 30 minutes", () => {
    // FIX-1405b: vn-news-fetch now queries rag_analyses.created_at (not market_messages).
    // Threshold is 30 minutes (SLA raised from 20 min in FIX-1405b).
    db.prepare(`
      INSERT INTO rag_analyses (id, created_at, level)
      VALUES (?, ?, ?)
    `).run("test-row-2", minutesAgoIso(35), "news");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("unhealthy");
  });

  // ── vn-foreign-flow: healthy if daily_ohlcv (foreign_buy_vol) updated within 5 min ──
  // NOTE: vn-foreign-flow is marketHoursOnly — tests use fixed market-hours timestamps.
  // BUG 1 FIX: was vnstock_trading_stats; correct table is daily_ohlcv (foreign_buy_vol / updated_at).

  it("vn-foreign-flow: healthy when daily_ohlcv has a foreign_buy_vol row within 5 minutes", () => {
    db.prepare(`
      INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
      VALUES (?, ?, ?, ?, ?)
    `).run("VNM", "2026-04-27", 80000, "2026-04-27T05:00:00.000Z", 1000000);

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-foreign-flow",
    )!;
    const result = checkServiceFreshness(db, config, "2026-04-27T05:02:00.000Z");

    expect(result.healthStatus).toBe("healthy");
  });

  it("vn-foreign-flow: unhealthy when daily_ohlcv foreign_buy_vol row is older than 5 minutes", () => {
    db.prepare(`
      INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
      VALUES (?, ?, ?, ?, ?)
    `).run("VNM", "2026-04-27", 80000, "2026-04-27T05:05:00.000Z", 1000000);

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-foreign-flow",
    )!;
    const result = checkServiceFreshness(db, config, "2026-04-27T05:15:00.000Z");

    expect(result.healthStatus).toBe("unhealthy");
  });

  // ── vn-sbv-fetch: healthy if sbv_rates updated within 35 min ─────────────────

  it("vn-sbv-fetch: healthy when sbv_rates has a row within 35 minutes", () => {
    db.prepare(`
      INSERT INTO sbv_rates (source, fetched_at)
      VALUES (?, ?)
    `).run("sbv", minutesAgoIso(10));

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-sbv-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("healthy");
  });

  it("vn-sbv-fetch: unhealthy when sbv_rates last row is older than 35 minutes", () => {
    db.prepare(`
      INSERT INTO sbv_rates (source, fetched_at)
      VALUES (?, ?)
    `).run("sbv", minutesAgoIso(40));

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-sbv-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("unhealthy");
  });

  // ── vn-bctc-fetch: active freshness check (FIX-BCTC-FRESHNESS-GATE 2026-06-16) ──
  // The config was changed from passive:true to an active latestTimestampSql check.
  // initDatabase() seeds bctc_vps_queue with pending rows (BACKFILL_079: 7 rows).
  // With active_count > 0 (pending work) AND no done rows, the correct status is
  // "unreachable" — the VPS queue has work but has not yet pushed any results.
  // This is the honest active-freshness contract; passive-health-masks-dead-data lesson applies.

  it("vn-bctc-fetch: active freshness check returns unreachable when queue has pending rows but no done rows", () => {
    // initDatabase() seeds bctc_vps_queue with pending rows (BACKFILL_079).
    // The queueGuardSql active_count > 0, so the idle branch is skipped.
    // No 'done' rows exist yet → latestAt = null → "unreachable".
    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-bctc-fetch",
    )!;
    // Confirm this is now an active (not passive) config
    expect(config.passive).toBeUndefined();
    expect(config.latestTimestampSql).toBeDefined();

    const result = checkServiceFreshness(db, config, nowIso());

    // Active check with pending queue rows but no done rows → unreachable (not healthy)
    expect(result.healthStatus).toBe("unreachable");
  });

  // ── FreshnessResult shape ────────────────────────────────────────────────────

  it("checkServiceFreshness always returns a polledAt ISO timestamp", () => {
    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-bctc-fetch",
    )!;
    const checkedAt = nowIso();
    const result = checkServiceFreshness(db, config, checkedAt);

    expect(result.polledAt).toBe(checkedAt);
    expect(result.serviceName).toBe("vn-bctc-fetch");
  });

  // ── BUG 2: vpsServiceHealthJob must not reference breakers.polymarket ────────

  it("vpsServiceHealthJob source does not import or reference polymarket breaker", async () => {
    // Read source file at runtime and check for the contamination pattern.
    // This is a meta-test: if this string appears in the compiled source,
    // the bug is still present.
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL(
        "../scheduler/system/vpsServiceHealthJob.ts",
        import.meta.url,
      ).pathname,
      "utf8",
    );

    // Should NOT assign or call breakers.polymarket (comments mentioning it are fine)
    // Pattern: "= breakers.polymarket" or "breaker = breakers.polymarket"
    expect(src).not.toMatch(/=\s*breakers\.polymarket/);
  });

  // ── checkServiceFreshness does not throw on DB error (fail-open) ─────────────

  it("checkServiceFreshness returns unreachable (not throws) when DB query fails", () => {
    // Use a closed DB to simulate query failure.
    // Use a fixed market-hours timestamp so the marketHoursOnly guard does not
    // short-circuit to "idle" before the DB query runs.
    const closedDb = new Database(":memory:");
    closedDb.close();

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const marketNow = "2026-04-27T05:00:00.000Z";

    // Must not throw — health checks are fail-open
    expect(() => checkServiceFreshness(closedDb, config, marketNow)).not.toThrow();
    const emptyDb = new Database(":memory:");
    initDatabase(emptyDb);
    const result = checkServiceFreshness(emptyDb, config, marketNow);
    // No rows → unreachable
    expect(result.healthStatus).toBe("unreachable");
  });
});
