/**
 * Task 1207 — Market-wide Cascade Confidence Cap for Non-Watchlist Company Events
 *
 * When a company event (earnings, scandal) is triggered by a specific company
 * that is NOT in the user's watchlist, cascade confidence at domain level must
 * be capped at 0.6. This prevents non-watchlist noise from generating
 * high-confidence alerts.
 *
 * Rules:
 *   - If seedEntry.affectedActions is non-empty (company-specific event)
 *     AND none of those companies are in the watchlist
 *     → all domain-level CausalChainEntry.confidence capped at 0.6
 *   - If ANY affected company IS in the watchlist → no cap applied (0.85 ceiling)
 *   - If seedEntry.affectedActions is empty (market-wide event) → no cap applied
 */

import { describe, it, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import type { DomainType } from "../../bctc-schema.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const NON_WATCHLIST_CONFIDENCE_CAP = 0.6;

function makeSeed(params: {
  domain: DomainType;
  affectedActions: string[];
  keywords?: string;
}): AnalysisEntry {
  return {
    id: "seed-test",
    level: "country",
    sourceTitle: `Company event: ${params.affectedActions.join(",")}`,
    sourceUrl: "",
    sourceType: "news",
    // Include a keyword that triggers a SECTOR_RULE to get domain-level entry
    // "lãi suất tăng" → triggers banking rules at high confidence
    summary: params.keywords ?? `lãi suất tăng — ${params.affectedActions.join(",")} công bố kết quả kinh doanh tệ`,
    sentiment: "bearish",
    impactScore: 70,
    impactDirection: "down",
    confidence: 0.80,
    timeHorizon: "short",
    reasoning: "Company-specific bad earnings.",
    affectedCountries: ["VN"],
    affectedDomains: [params.domain],
    affectedActions: params.affectedActions,
    parentIds: [],
    tags: [],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function makeWatchlist(...codes: Array<{ code: string; domain: DomainType }>): WatchlistEntry[] {
  return codes.map(({ code, domain }) => ({ actionCode: code, domain, exchange: "HOSE" }));
}

function getDomainEntries(chain: ReturnType<typeof buildCausalChain>) {
  return chain.entries.filter((e) => e.level === "domain");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Task 1207 — Non-Watchlist Company Confidence Cap", () => {

  // ── NC-01: Non-watchlist company event → domain confidence capped at 0.6 ──
  it("NC-01: company event for non-watchlist company caps domain confidence at 0.6", () => {
    // VHM is NOT in watchlist; article is specifically about VHM earnings scandal
    const seed = makeSeed({
      domain: "real_estate",
      affectedActions: ["VHM"],
      // "sắc lệnh" doesn't trigger sector rules — we rely on domain from affectedDomains
      keywords: "VHM công bố kết quả kinh doanh tệ trong quý 4",
    });

    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
      { code: "HPG", domain: "steel" },
      // VHM is NOT in the watchlist
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    // Should have at least one domain entry (from affectedDomains)
    expect(domainEntries.length).toBeGreaterThan(0);

    // All domain entries must be capped at 0.6
    for (const entry of domainEntries) {
      expect(entry.confidence).toBeLessThanOrEqual(NON_WATCHLIST_CONFIDENCE_CAP);
    }
  });

  // ── NC-02: Watchlist company event → no confidence cap ────────────────────
  it("NC-02: company event for watchlist company is NOT capped", () => {
    // VCB IS in watchlist — earnings event should not be capped
    const seed = makeSeed({
      domain: "banking",
      affectedActions: ["VCB"],
      keywords: "lãi suất tăng VCB công bố lãi kỷ lục trong quý 4",
    });

    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    expect(domainEntries.length).toBeGreaterThan(0);

    // At least one domain entry should exceed 0.6 (no cap applied)
    const hasAboveCap = domainEntries.some(
      (e) => e.confidence > NON_WATCHLIST_CONFIDENCE_CAP,
    );
    expect(hasAboveCap).toBe(true);
  });

  // ── NC-03: Empty affectedActions → market-wide event → no cap ─────────────
  it("NC-03: market-wide event (no company) is NOT capped", () => {
    const seed = makeSeed({
      domain: "banking",
      affectedActions: [], // market-wide event
      keywords: "lãi suất tăng toàn thị trường ngân hàng tăng NIM",
    });

    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    expect(domainEntries.length).toBeGreaterThan(0);

    // Market-wide events should not be capped — can exceed 0.6
    const hasAboveCap = domainEntries.some(
      (e) => e.confidence > NON_WATCHLIST_CONFIDENCE_CAP,
    );
    expect(hasAboveCap).toBe(true);
  });

  // ── NC-04: Multiple affected companies — at least one in watchlist → no cap ─
  it("NC-04: multi-company event where at least one is in watchlist → no cap", () => {
    // Article about both VHM and VIC scandal; VIC is in watchlist
    const seed = makeSeed({
      domain: "real_estate",
      affectedActions: ["VHM", "VIC"], // VIC will be in watchlist
      keywords: "VHM VIC lãi suất tăng kết quả kinh doanh bất động sản",
    });

    const watchlist = makeWatchlist(
      { code: "VIC", domain: "real_estate" },  // VIC IS in watchlist
      { code: "VCB", domain: "banking" },
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    expect(domainEntries.length).toBeGreaterThan(0);

    // Since VIC is in watchlist → no cap
    const hasAboveCap = domainEntries.some(
      (e) => e.confidence > NON_WATCHLIST_CONFIDENCE_CAP,
    );
    expect(hasAboveCap).toBe(true);
  });

  // ── NC-05: Non-watchlist event cap appears in reasoning annotation ─────────
  it("NC-05: non-watchlist cap annotates reasoning with [NonWatchlistCap]", () => {
    const seed = makeSeed({
      domain: "steel",
      affectedActions: ["NKG"],  // NKG not in watchlist
      keywords: "NKG thép kết quả kinh doanh tệ trong quý 4",
    });

    const watchlist = makeWatchlist(
      { code: "HPG", domain: "steel" },  // HPG is, NKG is NOT
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    expect(domainEntries.length).toBeGreaterThan(0);

    // At least one domain entry should mention the cap
    const hasCap = domainEntries.some(
      (e) => e.confidence <= NON_WATCHLIST_CONFIDENCE_CAP,
    );
    expect(hasCap).toBe(true);

    // Reasoning should include annotation
    const cappedEntry = domainEntries.find(
      (e) => e.reasoning.includes("[NonWatchlistCap:"),
    );
    expect(cappedEntry).toBeDefined();
  });

  // ── NC-06: cap is exact 0.6 ceiling — existing confidence below cap passes ─
  it("NC-06: domain entries already below 0.6 are unchanged by cap", () => {
    // Use a domain not in any SECTOR_RULE so it gets the default 0.55 confidence
    const seed = makeSeed({
      domain: "pharmaceutical",
      affectedActions: ["DHG"],  // not in watchlist
      keywords: "DHG dược phẩm kết quả kinh doanh quý 4",
    });

    const watchlist = makeWatchlist(
      { code: "VCB", domain: "banking" },
    );

    const chain = buildCausalChain(seed, watchlist);
    const domainEntries = getDomainEntries(chain);

    // All domain entries should be <= 0.6 (already at or below cap)
    for (const entry of domainEntries) {
      expect(entry.confidence).toBeLessThanOrEqual(NON_WATCHLIST_CONFIDENCE_CAP);
    }
  });
});
