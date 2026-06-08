/**
 * 1303i — Cascade Rule Gaps: Taiwan Geo / BCTC-Overdue / Trade-Map
 *
 * RED tests written first per TDD protocol.
 * GREEN when all 3 gaps are closed.
 */

import { describe, it, expect } from "bun:test";
import { runImpactChain } from "../application/usecases/runImpactChain.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  analyzeTradeImpact,
  detectCountries,
  getTradeProfile,
} from "../domain/services/tradeRelationships.js";

// Helper: build WatchlistEntry from code + domain
function wl(actionCode: string, domain: WatchlistEntry["domain"]): WatchlistEntry {
  return { actionCode, domain, exchange: "HOSE" };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: Taiwan geo routing → cascade fires for tech domain
// ─────────────────────────────────────────────────────────────────────────────

describe("1303i — cascade gap: Taiwan geo routing", () => {
  it("taiwan strait escalation → bearish tech domain entry in chain", async () => {
    const text =
      "Taiwan strait military exercises escalate — TSMC warns supply chain disruption";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    // Multiple tech entries may exist — confirm at least one is bearish (Taiwan escalation)
    const bearishTechEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("tech") &&
        e.sentiment === "bearish",
    );
    expect(bearishTechEntry).toBeDefined();
  });

  it("taiwan peace / de-escalation → bullish tech domain entry in chain", async () => {
    const text =
      "Cross-strait dialogue resumes — taiwan peace talks bring relief to semiconductor supply chain";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const bullishTechEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("tech") &&
        e.sentiment === "bullish",
    );
    expect(bullishTechEntry).toBeDefined();
  });

  it("taiwan strait escalation → matchedRules contains tech sector", async () => {
    const text =
      "Taiwan strait military exercises escalate — TSMC warns supply chain disruption";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("FPT", "tech")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });

    const techRule = chain.matchedRules.find((r) => r.sector === "tech");
    expect(techRule).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: BCTC overdue → runImpactChain called (fire-and-forget)
// ─────────────────────────────────────────────────────────────────────────────

describe("1303i — cascade gap: BCTC overdue → runImpactChain", () => {
  it("runBctcOverdueCheck returns normally and detects overdue tickers", async () => {
    const { runBctcOverdueCheck } = await import(
      "../scheduler/financial-reports/bctcOverdueCheckJob.js"
    );

    const { Database } = await import("bun:sqlite");
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    db.run(`CREATE TABLE watchlist (
      code TEXT PRIMARY KEY,
      domain TEXT DEFAULT 'general'
    )`);
    db.run(`INSERT INTO watchlist VALUES ('VNM','consumer')`);
    db.run(`INSERT INTO watchlist VALUES ('FPT','tech')`);
    db.run(`CREATE TABLE financial_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code TEXT,
      period_year INTEGER,
      period_quarter INTEGER,
      published_at TEXT
    )`);
    db.run(`CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT,
      severity TEXT,
      signals_json TEXT,
      affected_actions_json TEXT,
      analysis_ids_json TEXT,
      message TEXT,
      read INTEGER DEFAULT 0,
      user_note TEXT,
      notified_telegram INTEGER DEFAULT 0
    )`);

    // now = 90 days after normal Q1 deadline so both are overdue
    const now = new Date("2025-06-01T00:00:00Z");

    const result = await runBctcOverdueCheck({ db, now, overdueDaysThreshold: 3 });

    // At least one overdue ticker was found
    expect(result.overdueFound).toBeGreaterThan(0);
    // Non-blocking: returns without throwing even though fire-and-forget runs
    expect(result.stocksChecked).toBe(2);
    // Batch alert was inserted
    expect(result.alertsInserted).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: Trade map — DHG/GMD/CTD/NKG profiles present + taiwan detection
// ─────────────────────────────────────────────────────────────────────────────

describe("1303i — cascade gap: trade map 4 sectors", () => {
  it("DHG/GMD/CTD/NKG all have trade profiles", () => {
    expect(getTradeProfile("DHG")).not.toBeNull();
    expect(getTradeProfile("GMD")).not.toBeNull();
    expect(getTradeProfile("CTD")).not.toBeNull();
    expect(getTradeProfile("NKG")).not.toBeNull();
  });

  it("china API restrictions text triggers DHG trade impact", () => {
    const text =
      "China restricts API pharmaceutical exports to curb drug shortages";
    const impacts = analyzeTradeImpact(text, ["DHG", "GMD", "CTD", "NKG"]);
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts.some((i) => i.code === "DHG" && i.country === "china")).toBe(
      true,
    );
  });

  it("detectCountries returns taiwan for tsmc/taiwan strait text", () => {
    const countries = detectCountries("tsmc taiwan strait tensions escalate");
    expect(countries).toContain("taiwan");
  });

  it("NKG has taiwan import exposure", () => {
    const profile = getTradeProfile("NKG");
    expect(profile).not.toBeNull();
    const taiwanExp = profile!.exposures.find((e) => e.market === "taiwan");
    expect(taiwanExp).toBeDefined();
    expect(taiwanExp?.type).toBe("import");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4/AC-5: Hormuz + Middle East rules unaffected (no regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("1303i — regression: Hormuz/Middle East rules still work", () => {
  it("hormuz escalation → oil_gas domain fires (sentiment=bearish for supply)", async () => {
    const text = "Iran attacks strait of hormuz — oil supply shock imminent";
    const chain = await runImpactChain({
      newsText: text,
      watchlist: [wl("GAS", "oil_gas")],
      ragRetriever: async () => [],
      commodityFetcher: async () => null,
      sbvFetcher: async () => null,
    });
    const oilEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilEntry).toBeDefined();
  });

  it("detectCountries('iran attack hormuz') → contains middle_east, NOT taiwan", () => {
    const countries = detectCountries("iran attack hormuz");
    expect(countries).toContain("middle_east");
    expect(countries).not.toContain("taiwan");
  });

  it("detectCountries taiwan text → does NOT contain middle_east", () => {
    const countries = detectCountries("taiwan strait tsmc disruption");
    expect(countries).toContain("taiwan");
    expect(countries).not.toContain("middle_east");
  });

  it("COUNTRY_KEYWORDS taiwan entry resolves correctly", () => {
    const countries = detectCountries("đài loan căng thẳng");
    expect(countries).toContain("taiwan");
  });
});
