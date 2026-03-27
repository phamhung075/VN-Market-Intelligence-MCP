/**
 * Task 062 — Causal Cascade Engine
 *
 * Tests for:
 *   1. Pure domain function: buildCausalChain (src/domain/services/cascadeEngine.ts)
 *   2. Application wrapper: runImpactChain (src/application/usecases/runImpactChain.ts)
 *
 * TDD strategy:
 *   - Domain tests are synchronous — no mocking needed, pure functions only
 *   - Application tests mock the RAG retriever to avoid I/O
 */

import { describe, it, expect, mock } from "bun:test";
import {
  buildCausalChain,
} from "../domain/services/cascadeEngine.js";
import type {
  WatchlistEntry,
  CausalChain,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AnalysisEntry> = {}): AnalysisEntry {
  return {
    id: "test-001",
    level: "global",
    sourceTitle: "Test News",
    sourceUrl: "https://example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bullish",
    impactScore: 7,
    impactDirection: "up",
    confidence: 0.8,
    timeHorizon: "short",
    summary: "Test summary",
    reasoning: "Test reasoning",
    affectedCountries: [],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWatchlistEntry(
  actionCode: string,
  domain: string,
  exchange = "HOSE",
): WatchlistEntry {
  return { actionCode, domain: domain as DomainType, exchange };
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Task 062 — buildCausalChain (pure domain)", () => {
  // ── Basic structure ──────────────────────────────────────────────────────

  it("returns a CausalChain with all required fields", () => {
    const entry = makeEntry({ summary: "oil price rise today" });
    const chain = buildCausalChain(entry, []);

    expect(chain).toBeDefined();
    expect(typeof chain.id).toBe("string");
    expect(chain.id.length).toBeGreaterThan(0);
    expect(typeof chain.seedTitle).toBe("string");
    expect(typeof chain.createdAt).toBe("string");
    expect(Array.isArray(chain.entries)).toBe(true);
    expect(Array.isArray(chain.watchlistImpacts)).toBe(true);
  });

  it("includes the seed entry as the first chain entry", () => {
    const entry = makeEntry({
      level: "global",
      sourceTitle: "OPEC cuts output",
      summary: "OPEC cuts output. Oil price rise expected.",
    });
    const chain = buildCausalChain(entry, []);

    expect(chain.entries.length).toBeGreaterThan(0);
    const firstEntry = chain.entries[0]!;
    expect(firstEntry.level).toBe("global");
    expect(firstEntry.title).toBe("OPEC cuts output");
  });

  it("sets seedTitle from sourceTitle", () => {
    const entry = makeEntry({ sourceTitle: "Fed raises rates by 25bps" });
    const chain = buildCausalChain(entry, []);
    expect(chain.seedTitle).toBe("Fed raises rates by 25bps");
  });

  // ── Oil price → oil_gas sector ──────────────────────────────────────────

  it("generates oil_gas domain entry when summary contains 'oil price rise'", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply",
      sentiment: "bullish",
      impactScore: 8,
    });
    const chain = buildCausalChain(entry, []);

    const domainEntries = chain.entries.filter((e) => e.level === "domain");
    const oilEntry = domainEntries.find((e) =>
      e.affectedDomains.includes("oil_gas"),
    );
    expect(oilEntry).toBeDefined();
    expect(oilEntry!.confidence).toBeGreaterThan(0);
  });

  it("generates aviation domain entry with negative direction on oil price rise", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply aviation fuel",
      impactScore: 7,
    });
    const chain = buildCausalChain(entry, []);

    const aviationEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("aviation"),
    );
    expect(aviationEntry).toBeDefined();
    expect(aviationEntry!.sentiment).toBe("bearish");
  });

  // ── Fed rate → banking ──────────────────────────────────────────────────

  it("generates banking domain entry when summary contains 'interest rate hike'", () => {
    const entry = makeEntry({
      level: "global",
      summary: "interest rate hike fed hike expected next quarter",
      sentiment: "neutral",
      impactScore: 6,
    });
    const chain = buildCausalChain(entry, []);

    const domainEntries = chain.entries.filter((e) => e.level === "domain");
    const bankEntry = domainEntries.find((e) =>
      e.affectedDomains.includes("banking"),
    );
    expect(bankEntry).toBeDefined();
  });

  // ── Watchlist stock matching ────────────────────────────────────────────

  it("creates action entry for GAS stock when oil_gas domain is triggered", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply opec",
    });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("GAS", "oil_gas"),
    ];
    const chain = buildCausalChain(entry, watchlist);

    const actionEntries = chain.entries.filter((e) => e.level === "action");
    const gasEntry = actionEntries.find((e) =>
      e.affectedActions.includes("GAS"),
    );
    expect(gasEntry).toBeDefined();
    expect(gasEntry!.affectedDomains).toContain("oil_gas");
  });

  it("creates action entry for VCB stock when banking domain is triggered", () => {
    const entry = makeEntry({
      level: "global",
      summary: "interest rate hike fed hike will push borrowing costs up",
    });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("VCB", "banking"),
    ];
    const chain = buildCausalChain(entry, watchlist);

    const actionEntries = chain.entries.filter((e) => e.level === "action");
    const vcbEntry = actionEntries.find((e) =>
      e.affectedActions.includes("VCB"),
    );
    expect(vcbEntry).toBeDefined();
  });

  it("populates watchlistImpacts from action entries", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply opec",
    });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("GAS", "oil_gas"),
      makeWatchlistEntry("PVD", "oil_gas"),
    ];
    const chain = buildCausalChain(entry, watchlist);

    expect(chain.watchlistImpacts.length).toBe(2);
    const codes = chain.watchlistImpacts.map((i) => i.actionCode);
    expect(codes).toContain("GAS");
    expect(codes).toContain("PVD");
  });

  // ── No watchlist match ──────────────────────────────────────────────────

  it("returns empty watchlistImpacts when no watchlist stocks match triggered domains", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply",
    });
    // Banking stocks — not affected by oil price
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("VCB", "banking"),
      makeWatchlistEntry("BID", "banking"),
    ];
    const chain = buildCausalChain(entry, watchlist);

    // Oil price rise triggers oil_gas and aviation, not banking
    const bankImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "VCB" || i.actionCode === "BID",
    );
    expect(bankImpacts.length).toBe(0);
  });

  it("returns empty watchlistImpacts with an empty watchlist", () => {
    const entry = makeEntry({ summary: "oil price rise crude oil up" });
    const chain = buildCausalChain(entry, []);
    expect(chain.watchlistImpacts).toHaveLength(0);
  });

  // ── Multiple sectors ────────────────────────────────────────────────────

  it("generates multiple intermediate domain entries for multi-sector news", () => {
    const entry = makeEntry({
      level: "global",
      summary: "interest rate hike fed hike expected. Real estate sector hit as bất động sản costs rise.",
    });
    const chain = buildCausalChain(entry, []);

    const domainEntries = chain.entries.filter((e) => e.level === "domain");
    // Both banking and real_estate should be triggered
    const domains = domainEntries.flatMap((e) => e.affectedDomains);
    expect(domains).toContain("banking");
    expect(domains).toContain("real_estate");
  });

  // ── Confidence decreases through chain ─────────────────────────────────

  it("domain entry confidence is lower than seed entry confidence", () => {
    const entry = makeEntry({
      level: "global",
      confidence: 0.9,
      impactScore: 8,
      summary: "oil price rise crude oil up sharply opec",
    });
    const chain = buildCausalChain(entry, []);

    const domainEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(domainEntry).toBeDefined();
    expect(domainEntry!.confidence).toBeLessThan(entry.confidence);
  });

  it("action entry confidence is lower than domain entry confidence", () => {
    const entry = makeEntry({
      level: "global",
      confidence: 0.9,
      impactScore: 8,
      summary: "oil price rise crude oil up sharply opec",
    });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("GAS", "oil_gas")];
    const chain = buildCausalChain(entry, watchlist);

    const domainEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    const actionEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("GAS"),
    );

    expect(domainEntry).toBeDefined();
    expect(actionEntry).toBeDefined();
    expect(actionEntry!.confidence).toBeLessThan(domainEntry!.confidence);
  });

  // ── Pure function: no I/O ───────────────────────────────────────────────

  it("is synchronous and returns immediately (no Promise)", () => {
    const entry = makeEntry({ summary: "market rally vn-index tăng mạnh" });
    const result = buildCausalChain(entry, []);
    // If it were a Promise, this would fail because we're not awaiting
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.id).toBe("string");
  });

  // ── RAG enrichment ──────────────────────────────────────────────────────

  it("appends historical context to reasoning when ragResults provided", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up sharply opec",
    });
    const ragResults = [
      {
        id: "rag-001",
        level: "global",
        title: "Previous OPEC cut 2023",
        summary: "OPEC cut output by 1mb/d, oil spiked 10%",
        distance: 0.15,
        tags: ["opec", "oil"],
      },
    ];
    const chain = buildCausalChain(entry, [], ragResults);

    // RAG should enrich reasoning of some entry
    const allReasoning = chain.entries.map((e) => e.reasoning).join(" ");
    expect(allReasoning).toContain("Historical");
  });

  // ── Deduplication: duplicate watchlist stocks ───────────────────────────

  it("deduplicates watchlist entries with the same actionCode", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up opec",
    });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("GAS", "oil_gas", "HOSE"),
      makeWatchlistEntry("GAS", "oil_gas", "HOSE"), // duplicate
    ];
    const chain = buildCausalChain(entry, watchlist);

    const gasImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "GAS",
    );
    expect(gasImpacts.length).toBe(1);
  });

  // ── affectedDomains from seed entry covered by rules ───────────────────

  it("adds domain entries for seedEntry.affectedDomains not covered by SECTOR_RULES", () => {
    const entry = makeEntry({
      level: "domain",
      summary: "pharma sector outlook positive",
      affectedDomains: ["pharma"],
      sentiment: "bullish",
      impactScore: 6,
    });
    const chain = buildCausalChain(entry, []);

    const pharmaEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("pharma"),
    );
    expect(pharmaEntry).toBeDefined();
  });

  // ── WatchlistImpact fields ──────────────────────────────────────────────

  it("watchlistImpact has all required fields with correct types", () => {
    const entry = makeEntry({
      level: "global",
      summary: "oil price rise crude oil up opec",
      impactScore: 7,
    });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("GAS", "oil_gas")];
    const chain = buildCausalChain(entry, watchlist);

    expect(chain.watchlistImpacts.length).toBeGreaterThan(0);
    const impact = chain.watchlistImpacts[0]!;
    expect(impact.actionCode).toBe("GAS");
    expect(impact.domain).toBe("oil_gas");
    expect(["up", "down", "neutral"]).toContain(impact.impactDirection);
    expect(typeof impact.confidence).toBe("number");
    expect(impact.confidence).toBeGreaterThan(0);
    expect(impact.confidence).toBeLessThanOrEqual(1);
    expect(typeof impact.reasoning).toBe("string");
  });
});

// ── Application wrapper tests ────────────────────────────────────────────────

describe("Task 062 — runImpactChain (application wrapper)", () => {
  it("returns a CausalChain for a plain text news input", async () => {
    // Import here to allow module resolution after domain code is written
    const { runImpactChain } = await import(
      "../application/usecases/runImpactChain.js"
    );

    // Provide a mock RAG retriever to avoid actual embedding I/O
    const mockRagRetriever = async () => [];

    const result = await runImpactChain({
      newsText: "Oil prices rose sharply as OPEC announced output cuts",
      watchlist: [makeWatchlistEntry("GAS", "oil_gas")],
      ragRetriever: mockRagRetriever,
    });

    expect(result).toBeDefined();
    expect(typeof result.id).toBe("string");
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("uses provided seedEntry instead of normalizing newsText", async () => {
    const { runImpactChain } = await import(
      "../application/usecases/runImpactChain.js"
    );

    const seedEntry = makeEntry({
      sourceTitle: "Pre-normalized Oil News",
      summary: "oil price rise crude oil up opec",
      level: "global",
    });

    const result = await runImpactChain({
      newsText: "",
      seedEntry,
      watchlist: [],
      ragRetriever: async () => [],
    });

    expect(result.seedTitle).toBe("Pre-normalized Oil News");
  });

  it("continues gracefully when RAG retriever throws", async () => {
    const { runImpactChain } = await import(
      "../application/usecases/runImpactChain.js"
    );

    const failingRag = async (): Promise<never> => {
      throw new Error("LanceDB unavailable");
    };

    const result = await runImpactChain({
      newsText: "interest rate hike fed hike announced",
      watchlist: [makeWatchlistEntry("VCB", "banking")],
      ragRetriever: failingRag,
    });

    // Should still return a chain (without RAG context)
    expect(result).toBeDefined();
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("passes RAG results to buildCausalChain for reasoning enrichment", async () => {
    const { runImpactChain } = await import(
      "../application/usecases/runImpactChain.js"
    );

    const mockRag = async () => [
      {
        id: "rag-historical",
        level: "global",
        title: "OPEC 2022 cut",
        summary: "OPEC cut production by 2mb/d in 2022, oil jumped 15%",
        distance: 0.12,
        tags: ["opec", "oil"],
      },
    ];

    const result = await runImpactChain({
      newsText: "oil price rise crude oil up opec announces cut",
      watchlist: [],
      ragRetriever: mockRag,
    });

    const allReasoning = result.entries.map((e) => e.reasoning).join(" ");
    expect(allReasoning).toContain("Historical");
  });
});
