/**
 * Task 247 — Cascade Rule Hit Rate Instrumentation
 *
 * Tests for:
 *  1. cascadeHitStore: recordHit, getHitMetrics, getDeadRules
 *  2. buildCausalChain returns matchedRules
 *  3. MCP tool get_cascade_metrics output format
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  recordHit,
  getHitMetrics,
  getDeadRules,
} from "../infrastructure/db/cascadeHitStore.js";
import { ensureCascadeHitsTable } from "./helpers/cascadeHitsTestDdl.js";
import { buildCausalChain } from "../domain/services/cascadeEngine.js";
import type { WatchlistEntry } from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  ensureCascadeHitsTable(db);
  return db;
}

function makeAnalysisEntry(summary: string): AnalysisEntry {
  return {
    id: `entry-${Date.now()}`,
    createdAt: new Date().toISOString(),
    level: "global",
    sourceUrl: "https://example.com",
    sourceTitle: "Test news",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "neutral",
    impactScore: 6,
    impactDirection: "neutral",
    confidence: 0.7,
    timeHorizon: "short",
    summary,
    reasoning: "Test",
    affectedCountries: [],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
  };
}

// ─── Store tests ───────────────────────────────────────────────────────────────

describe("Task 247 — cascadeHitStore", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it("recordHit inserts a row into cascade_rule_hits", () => {
    recordHit(db, "oil_gas_rise", "giá dầu tăng", "oil_gas", "GAS,PVD");
    const row = db
      .query("SELECT COUNT(*) as cnt FROM cascade_rule_hits")
      .get() as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("recordHit stores rule_key and sector correctly", () => {
    recordHit(db, "banking_rate_hike", "lãi suất tăng", "banking", "VCB");
    const row = db
      .query("SELECT rule_key, affected_sector FROM cascade_rule_hits LIMIT 1")
      .get() as { rule_key: string; affected_sector: string };
    expect(row.rule_key).toBe("banking_rate_hike");
    expect(row.affected_sector).toBe("banking");
  });

  it("getHitMetrics returns correct hit counts grouped by rule_key", () => {
    recordHit(db, "oil_gas_rise", "giá dầu tăng", "oil_gas");
    recordHit(db, "oil_gas_rise", "giá dầu tăng mạnh", "oil_gas");
    recordHit(db, "banking_rate_hike", "lãi suất tăng", "banking");

    const metrics = getHitMetrics(db, 30);
    expect(metrics.length).toBe(2);
    // Ordered by hitCount DESC
    expect(metrics[0]!.ruleKey).toBe("oil_gas_rise");
    expect(metrics[0]!.hitCount).toBe(2);
    expect(metrics[1]!.ruleKey).toBe("banking_rate_hike");
    expect(metrics[1]!.hitCount).toBe(1);
  });

  it("getHitMetrics respects days filter", () => {
    // Insert a recent hit
    recordHit(db, "oil_gas_rise", "giá dầu tăng", "oil_gas");

    // Insert an old hit (manually set hit_at to 60 days ago)
    db.exec(`
      INSERT INTO cascade_rule_hits (rule_key, matched_text, affected_sector, hit_at)
      VALUES ('old_rule', 'old text', 'steel', datetime('now', '-60 days'))
    `);

    const metrics = getHitMetrics(db, 30);
    const keys = metrics.map((m) => m.ruleKey);
    expect(keys).toContain("oil_gas_rise");
    expect(keys).not.toContain("old_rule");
  });

  it("getHitMetrics includes lastHit timestamp", () => {
    recordHit(db, "real_estate_rate_cut", "lãi suất giảm", "real_estate");
    const metrics = getHitMetrics(db, 30);
    expect(metrics[0]!.lastHit).toBeTruthy();
    expect(typeof metrics[0]!.lastHit).toBe("string");
  });

  it("getDeadRules returns rules with 0 hits in the window", () => {
    recordHit(db, "oil_gas_rise", "giá dầu tăng", "oil_gas");

    const knownRules = ["oil_gas_rise", "aviation_fuel_cost", "steel_price_rise"];
    const dead = getDeadRules(db, knownRules, 30);

    expect(dead).toContain("aviation_fuel_cost");
    expect(dead).toContain("steel_price_rise");
    expect(dead).not.toContain("oil_gas_rise");
  });

  it("getDeadRules returns all rules when there are no hits", () => {
    const knownRules = ["rule_a", "rule_b", "rule_c"];
    const dead = getDeadRules(db, knownRules, 30);
    expect(dead.sort()).toEqual(["rule_a", "rule_b", "rule_c"].sort());
  });

  it("getDeadRules returns empty array when all rules have hits", () => {
    recordHit(db, "rule_x", "text", "banking");
    recordHit(db, "rule_y", "text", "oil_gas");

    const dead = getDeadRules(db, ["rule_x", "rule_y"], 30);
    expect(dead).toHaveLength(0);
  });
});

// ─── buildCausalChain matchedRules tests ──────────────────────────────────────

describe("Task 247 — buildCausalChain matchedRules", () => {
  const watchlist: WatchlistEntry[] = [
    { actionCode: "GAS", domain: "oil_gas", exchange: "HOSE" },
    { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  ];

  it("returns matchedRules array in CausalChain result", () => {
    const seed = makeAnalysisEntry("giá dầu tăng mạnh, opec quyết định cắt giảm sản lượng");
    const chain = buildCausalChain(seed, watchlist);
    expect(Array.isArray(chain.matchedRules)).toBe(true);
  });

  it("matchedRules contains rule key and sector for oil_gas trigger", () => {
    const seed = makeAnalysisEntry("giá dầu tăng mạnh do opec");
    const chain = buildCausalChain(seed, watchlist);
    const oilRule = chain.matchedRules.find((r) => r.sector === "oil_gas");
    expect(oilRule).toBeTruthy();
    expect(oilRule!.key).toBeTruthy();
  });

  it("matchedRules is empty when no sector rules match", () => {
    const seed = makeAnalysisEntry("tin tức bình thường không có từ khóa đặc biệt nào");
    const chain = buildCausalChain(seed, watchlist);
    expect(chain.matchedRules).toHaveLength(0);
  });

  it("matchedRules has one entry per triggered domain (first match wins)", () => {
    // "lãi suất tăng" triggers banking + real_estate
    const seed = makeAnalysisEntry("lãi suất tăng do fed hike mạnh");
    const chain = buildCausalChain(seed, watchlist);
    const bankingRules = chain.matchedRules.filter((r) => r.sector === "banking");
    expect(bankingRules.length).toBe(1);
  });
});

// ─── MCP tool output format tests ────────────────────────────────────────────

describe("Task 247 — get_cascade_metrics tool output", () => {
  it("formats metrics table with rule_key, hits, last_hit columns", () => {
    const metrics = [
      { ruleKey: "oil_gas_rise", hitCount: 15, lastHit: "2026-04-01 10:00:00" },
      { ruleKey: "banking_rate_hike", hitCount: 3, lastHit: "2026-04-02 08:00:00" },
    ];
    const deadRules = ["aviation_fuel_cost"];
    const days = 30;

    const lines: string[] = [];
    lines.push(`Cascade Rule Metrics — Last ${days} days\n`);
    lines.push(`${"Rule Key".padEnd(40)} ${"Hits".padStart(6)}  Last Hit`);
    lines.push("─".repeat(70));
    for (const m of metrics) {
      lines.push(`${m.ruleKey.padEnd(40)} ${String(m.hitCount).padStart(6)}  ${m.lastHit}`);
    }
    lines.push("");
    lines.push(`Dead rules (0 hits in ${days} days): ${deadRules.join(", ")}`);
    const output = lines.join("\n");

    expect(output).toContain("oil_gas_rise");
    expect(output).toContain("15");
    expect(output).toContain("Dead rules (0 hits in 30 days):");
    expect(output).toContain("aviation_fuel_cost");
  });

  it("shows 'No dead rules' when all rules have hits", () => {
    const deadRules: string[] = [];
    const text = deadRules.length === 0
      ? "Dead rules (0 hits in 30 days): none"
      : `Dead rules (0 hits in 30 days): ${deadRules.join(", ")}`;
    expect(text).toContain("none");
  });
});
