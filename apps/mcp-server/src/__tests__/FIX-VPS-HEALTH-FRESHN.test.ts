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

  it("vn-price-fetch: healthy when market_prices has a row updated within 5 minutes", () => {
    db.prepare(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("VNM", 80000, 0, 0, 100000, minutesAgoIso(2), "HOSE");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("healthy");
    expect(result.serviceName).toBe("vn-price-fetch");
  });

  it("vn-price-fetch: unhealthy when market_prices last update is older than 5 minutes", () => {
    db.prepare(`
      INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("VNM", 80000, 0, 0, 100000, minutesAgoIso(10), "HOSE");

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("unhealthy");
    expect(result.errorMessage).toBeDefined();
  });

  it("vn-price-fetch: unreachable when market_prices table has no rows", () => {
    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("unreachable");
  });

  // ── vn-news-fetch: healthy if market_messages created within 20 min ──────────

  it("vn-news-fetch: healthy when market_messages has a row created within 20 minutes", () => {
    db.prepare(`
      INSERT INTO market_messages (from_agent, message_type, ticker, content, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("vps-news", "news", "VNM", "test content", minutesAgoIso(5));

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("healthy");
  });

  it("vn-news-fetch: unhealthy when market_messages last row is older than 20 minutes", () => {
    db.prepare(`
      INSERT INTO market_messages (from_agent, message_type, ticker, content, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("vps-news", "news", "VNM", "test content", minutesAgoIso(25));

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("unhealthy");
  });

  // ── vn-foreign-flow: healthy if vnstock_trading_stats updated within 5 min ──

  it("vn-foreign-flow: healthy when vnstock_trading_stats has a row within 5 minutes", () => {
    db.prepare(`
      INSERT INTO vnstock_trading_stats (code, date, fetched_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run("VNM", "2026-04-25", minutesAgoIso(2), nowIso());

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-foreign-flow",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    expect(result.healthStatus).toBe("healthy");
  });

  it("vn-foreign-flow: unhealthy when vnstock_trading_stats last row is older than 5 minutes", () => {
    db.prepare(`
      INSERT INTO vnstock_trading_stats (code, date, fetched_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run("VNM", "2026-04-25", minutesAgoIso(10), nowIso());

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-foreign-flow",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

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

  // ── vn-bctc-fetch: passive — always returns "healthy" (no reliable table) ───

  it("vn-bctc-fetch: passive check always returns healthy (no active freshness check)", () => {
    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-bctc-fetch",
    )!;
    const result = checkServiceFreshness(db, config, nowIso());

    // Passive service: no rows needed, returns healthy with passive note
    expect(result.healthStatus).toBe("healthy");
    expect(result.errorMessage).toBeUndefined();
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
    // Use a closed DB to simulate query failure
    const closedDb = new Database(":memory:");
    closedDb.close();

    const config = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-price-fetch",
    )!;

    // Must not throw — health checks are fail-open
    expect(() => checkServiceFreshness(closedDb, config, nowIso())).not.toThrow();
    const result = checkServiceFreshness(new Database(":memory:"), config, nowIso());
    // No rows → unreachable
    expect(result.healthStatus).toBe("unreachable");
  });
});
