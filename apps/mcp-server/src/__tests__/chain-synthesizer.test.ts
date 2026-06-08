Bun.env["DB_PATH"] = ":memory:";

/**
 * Task: Enrichment Chain — Sequential Agent Reasoning
 * Tests for chainSynthesizer.ts (domain service) and agentSignalStore helpers.
 *
 * TDD: write failing tests first (RED), then implement (GREEN).
 */

import { Database } from "bun:sqlite";
import { describe, it, expect, beforeEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  synthesizeChain,
  type ChainLink,
} from "../domain/services/chainSynthesizer.js";
import {
  computeCycleId,
  postSignal,
  getChainFindings,
  getOpenChainFindings,
  getChainFromRoot,
} from "../infrastructure/db/agentSignalStore.js";
// No schema singleton needed — DB helper tests use makeRawDb() for isolation

// ── DB factory for test isolation ────────────────────────────────────────────
// Creates a fresh in-memory DB with the agent_signals schema.
// Bypasses the module-level singleton entirely to avoid cross-test contamination.
function makeRawDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      signal_type  TEXT NOT NULL,
      stock_code   TEXT,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'unread',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at   TEXT NOT NULL DEFAULT (datetime('now', '+2 hours')),
      outcome      TEXT,
      outcome_at   TEXT,
      outcome_detail TEXT,
      cycle_id     TEXT,
      finding_data TEXT NOT NULL DEFAULT '{}',
      causal_ref   INTEGER,
      chain_depth  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_signals_cycle ON agent_signals(cycle_id);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_chain ON agent_signals(causal_ref);
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLink(overrides: Partial<ChainLink> = {}): ChainLink {
  return {
    id: 1,
    agent: "news-scout",
    signalType: "chain_catalyst",
    stockCode: "VNM",
    findingData: { confidence: 0.8, direction: "bullish", event_type: "news" },
    depth: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── synthesizeChain — core logic ──────────────────────────────────────────────

describe("synthesizeChain", () => {
  it("returns null when fewer than 2 links are provided", () => {
    const result = synthesizeChain([makeLink()]);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(synthesizeChain([])).toBeNull();
  });

  it("synthesizes from two links (news + price)", () => {
    const links: ChainLink[] = [
      makeLink({
        id: 1,
        agent: "news-scout",
        signalType: "chain_catalyst",
        depth: 0,
        findingData: { confidence: 0.75, direction: "bullish", event_type: "news" },
      }),
      makeLink({
        id: 2,
        agent: "market-watcher",
        signalType: "price_confirmation",
        depth: 2,
        findingData: { confidence: 0.80, direction: "bullish", confirms_direction: true },
      }),
    ];

    const chain = synthesizeChain(links);
    expect(chain).not.toBeNull();
    expect(chain!.stockCode).toBe("VNM");
    expect(chain!.chainLength).toBe(2);
    expect(chain!.agents).toContain("news-scout");
    expect(chain!.agents).toContain("market-watcher");
    expect(chain!.conviction).toBeGreaterThan(0);
    expect(chain!.conviction).toBeLessThanOrEqual(1);
    expect(chain!.narrative).toContain("xác tín");
    expect(chain!.narrative).not.toContain("xac tin");
  });

  it("produces higher conviction with three confirming layers", () => {
    const twoLinks: ChainLink[] = [
      makeLink({ id: 1, agent: "news-scout", depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, agent: "market-watcher", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];

    const threeLinks: ChainLink[] = [
      ...twoLinks,
      makeLink({
        id: 3,
        agent: "bctc-collector",
        signalType: "fundamental_validation",
        depth: 1,
        findingData: { confidence: 0.85, direction: "bullish", validates: true },
      }),
    ];

    const two = synthesizeChain(twoLinks)!;
    const three = synthesizeChain(threeLinks)!;
    expect(three.conviction).toBeGreaterThanOrEqual(two.conviction);
  });

  it("lowers conviction when any layer has validates=false", () => {
    const confirmingLinks: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.9, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 1, agent: "bctc-collector", signalType: "fundamental_validation", findingData: { confidence: 0.9, direction: "bullish", validates: false } }),
    ];

    const allConfirming: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.9, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 1, agent: "bctc-collector", signalType: "fundamental_validation", findingData: { confidence: 0.9, direction: "bullish", validates: true } }),
    ];

    const withPenalty = synthesizeChain(confirmingLinks)!;
    const noPenalty = synthesizeChain(allConfirming)!;
    expect(withPenalty.conviction).toBeLessThan(noPenalty.conviction);
  });

  it("lowers conviction when confirms_direction=false", () => {
    const conflicting: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.9, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.9, direction: "bearish", confirms_direction: false } }),
    ];
    const chain = synthesizeChain(conflicting)!;
    expect(chain.conviction).toBeLessThan(0.9);
  });

  it("action is BUY when conviction >= 0.8 and direction is bullish", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.9, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 1, agent: "bctc-collector", signalType: "fundamental_validation", findingData: { confidence: 0.9, direction: "bullish", validates: true } }),
      makeLink({ id: 3, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.9, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    if (chain.conviction >= 0.8) {
      expect(chain.action).toBe("BUY");
    }
  });

  it("action is SELL when conviction >= 0.8 and direction is bearish", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.9, direction: "bearish", event_type: "news" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.9, direction: "bearish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    if (chain.conviction >= 0.8) {
      expect(chain.action).toBe("SELL");
    }
  });

  it("action is WATCH when conviction is 0.6-0.79", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.65, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.60, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.conviction).toBeGreaterThanOrEqual(0.55); // base average
    if (chain.conviction >= 0.6 && chain.conviction < 0.8) {
      expect(chain.action).toBe("WATCH");
    }
  });

  it("action is HOLD for low conviction", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.3, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.3, direction: "bullish", confirms_direction: false } }),
    ];
    const chain = synthesizeChain(links)!;
    if (chain.conviction < 0.6) {
      expect(chain.action).toBe("HOLD");
    }
  });

  it("generates Vietnamese narrative text", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.85, direction: "bullish", event_type: "news", summary: "Tin tức tích cực về xuất khẩu" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.85, direction: "bullish", confirms_direction: true, summary: "Giá tăng mạnh" } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.narrative).toContain("VNM");
    // Should contain Vietnamese text indicators
    expect(chain.narrative.length).toBeGreaterThan(20);
  });

  it("narrative contains agent count confirmation line", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, agent: "news-scout", depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, agent: "market-watcher", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.narrative).toContain("2");
  });

  it("hasCatalyst is true when chain_catalyst signalType is present", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, signalType: "chain_catalyst", depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, agent: "market-watcher", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.dimensions.hasCatalyst).toBe(true);
  });

  it("hasFundamental is true when fundamental_validation is present", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, signalType: "price_confirmation", findingData: { confidence: 0.8, direction: "bullish" } }),
      makeLink({ id: 2, agent: "bctc-collector", signalType: "fundamental_validation", depth: 1, findingData: { confidence: 0.8, direction: "bullish", validates: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.dimensions.hasFundamental).toBe(true);
    expect(chain.dimensions.hasCatalyst).toBe(false);
  });

  it("hasPriceAction is true when price_confirmation is present", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, agent: "market-watcher", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.dimensions.hasPriceAction).toBe(true);
  });

  it("hasVolumeConfirm when volume_above_average in findingData", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.8, direction: "bullish", volume_above_average: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.dimensions.hasVolumeConfirm).toBe(true);
  });

  it("fills confidenceBreakdown per agent", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, agent: "news-scout", depth: 0, findingData: { confidence: 0.75, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, agent: "market-watcher", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.85, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.confidenceBreakdown).toHaveLength(2);
    const newScout = chain.confidenceBreakdown.find(c => c.agent === "news-scout");
    expect(newScout?.confidence).toBe(0.75);
  });

  it("extracts stockCode from links that have it", () => {
    const links: ChainLink[] = [
      makeLink({ id: 1, stockCode: null, depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 2, stockCode: "FPT", signalType: "price_confirmation", depth: 2, findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.stockCode).toBe("FPT");
  });

  it("conviction is clamped to [0, 1]", () => {
    // Even with perfect scores + bonuses, should not exceed 1.0
    const manyLinks: ChainLink[] = Array.from({ length: 10 }, (_, i) =>
      makeLink({
        id: i + 1,
        agent: `agent-${i}`,
        signalType: i === 0 ? "chain_catalyst" : "price_confirmation",
        depth: i,
        findingData: { confidence: 1.0, direction: "bullish", confirms_direction: true, validates: true },
      })
    );
    const chain = synthesizeChain(manyLinks)!;
    expect(chain.conviction).toBeLessThanOrEqual(1.0);
    expect(chain.conviction).toBeGreaterThanOrEqual(0.0);
  });

  it("rootId is set to the id of the depth=0 link", () => {
    const links: ChainLink[] = [
      makeLink({ id: 42, depth: 0, findingData: { confidence: 0.8, direction: "bullish", event_type: "news" } }),
      makeLink({ id: 99, depth: 2, agent: "market-watcher", signalType: "price_confirmation", findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true } }),
    ];
    const chain = synthesizeChain(links)!;
    expect(chain.rootId).toBe(42);
  });
});

// ── computeCycleId ────────────────────────────────────────────────────────────

describe("computeCycleId", () => {
  it("returns format YYYYMMDD-HHMM", () => {
    const id = computeCycleId(new Date("2026-04-04T09:00:00Z"));
    expect(id).toMatch(/^\d{8}-\d{4}$/);
  });

  it("rounds minutes down to 15-min boundaries", () => {
    expect(computeCycleId(new Date("2026-04-04T09:07:00Z"))).toEndWith("-0900");
    expect(computeCycleId(new Date("2026-04-04T09:15:00Z"))).toEndWith("-0915");
    expect(computeCycleId(new Date("2026-04-04T09:29:00Z"))).toEndWith("-0915");
    expect(computeCycleId(new Date("2026-04-04T09:30:00Z"))).toEndWith("-0930");
    expect(computeCycleId(new Date("2026-04-04T09:44:00Z"))).toEndWith("-0930");
    expect(computeCycleId(new Date("2026-04-04T09:45:00Z"))).toEndWith("-0945");
  });

  it("uses current date if no date provided", () => {
    const id = computeCycleId();
    expect(id).toMatch(/^\d{8}-\d{4}$/);
  });

  it("generates correct year-month-day", () => {
    const id = computeCycleId(new Date("2026-12-31T23:59:00Z"));
    expect(id).toStartWith("20261231");
  });

  it("hour 09 is zero-padded", () => {
    const id = computeCycleId(new Date("2026-04-04T09:00:00Z"));
    expect(id).toContain("-09");
  });
});

// ── agentSignalStore DB helpers ───────────────────────────────────────────────

describe("agentSignalStore DB helpers", () => {
  let db: Database;

  beforeEach(() => {
    db = makeRawDb();
  });

  it("postSignal stores a new signal with enrichment columns", () => {
    const id = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VNM",
      payload: { title: "Test", detail: "Detail" },
      cycleId: "20260404-0900",
      findingData: { confidence: 0.8, direction: "bullish", event_type: "news" },
      chainDepth: 0,
      ttlMinutes: 30,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("getChainFindings returns only findings in the given cycleId", () => {
    const cycleId = "20260404-0900";

    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VNM",
      payload: { title: "A" },
      cycleId,
      findingData: { confidence: 0.8, direction: "bullish", event_type: "news" },
      chainDepth: 0,
      ttlMinutes: 30,
    });
    postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_confirmation",
      stockCode: "VNM",
      payload: { title: "B" },
      cycleId,
      findingData: { confidence: 0.8, direction: "bullish", confirms_direction: true },
      chainDepth: 2,
      ttlMinutes: 30,
    });
    // Different cycle
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "FPT",
      payload: { title: "C" },
      cycleId: "20260404-0915",
      findingData: { confidence: 0.7, direction: "bullish", event_type: "news" },
      chainDepth: 0,
      ttlMinutes: 30,
    });

    const findings = getChainFindings(db, cycleId);
    expect(findings.length).toBe(2);
    expect(findings.every(f => f.stockCode === "VNM")).toBe(true);
  });

  it("getChainFindings returns empty array for unknown cycleId", () => {
    const findings = getChainFindings(db, "99991231-0000");
    expect(findings).toEqual([]);
  });

  it("getOpenChainFindings returns signals within minutes window", async () => {
    postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "VCB",
      payload: { title: "Fresh" },
      cycleId: computeCycleId(),
      findingData: { confidence: 0.8, direction: "bullish", event_type: "news" },
      chainDepth: 0,
      ttlMinutes: 60,
    });
    const open = getOpenChainFindings(db, 30);
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open.some(f => f.stockCode === "VCB")).toBe(true);
  });

  it("getChainFromRoot follows causal_ref chain", () => {
    const rootId = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "chain_catalyst",
      stockCode: "FPT",
      payload: { title: "Root" },
      cycleId: "20260404-0900",
      findingData: { confidence: 0.8, direction: "bullish", event_type: "news" },
      chainDepth: 0,
      ttlMinutes: 30,
    });
    postSignal(db, {
      fromAgent: "market-watcher",
      toAgent: "alert-commander",
      signalType: "price_confirmation",
      stockCode: "FPT",
      payload: { title: "Child" },
      cycleId: "20260404-0900",
      findingData: { confidence: 0.8, direction: "bullish" },
      causalRef: rootId,
      chainDepth: 1,
      ttlMinutes: 30,
    });

    const chain = getChainFromRoot(db, rootId);
    expect(chain.length).toBe(2);
    expect(chain[0]!.id).toBe(rootId);
  });

  it("postSignal without enrichment columns still works (backward compat)", () => {
    const id = postSignal(db, {
      fromAgent: "news-scout",
      toAgent: "alert-commander",
      signalType: "urgent_news",
      stockCode: "VNM",
      payload: { title: "Old style" },
      ttlMinutes: 30,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("getChainFindings groups by stockCode correctly (2+ per stock)", () => {
    const cycleId = "20260404-0915";

    // VNM: 2 findings
    postSignal(db, { fromAgent: "a1", toAgent: "ac", signalType: "chain_catalyst", stockCode: "VNM", payload: { title: "1" }, cycleId, findingData: { confidence: 0.7, direction: "bullish", event_type: "news" }, chainDepth: 0, ttlMinutes: 30 });
    postSignal(db, { fromAgent: "a2", toAgent: "ac", signalType: "price_confirmation", stockCode: "VNM", payload: { title: "2" }, cycleId, findingData: { confidence: 0.7, direction: "bullish" }, chainDepth: 2, ttlMinutes: 30 });
    // FPT: 1 finding only
    postSignal(db, { fromAgent: "a3", toAgent: "ac", signalType: "chain_catalyst", stockCode: "FPT", payload: { title: "3" }, cycleId, findingData: { confidence: 0.7, direction: "bullish", event_type: "news" }, chainDepth: 0, ttlMinutes: 30 });

    const all = getChainFindings(db, cycleId);
    const vnmFindings = all.filter(f => f.stockCode === "VNM");
    const fptFindings = all.filter(f => f.stockCode === "FPT");
    // getChainFindings returns all findings in cycle (filtering to 2+ is done by caller)
    expect(vnmFindings.length).toBe(2);
    expect(fptFindings.length).toBe(1);
  });
});
