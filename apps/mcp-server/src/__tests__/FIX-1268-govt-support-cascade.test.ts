/**
 * FIX-1268 — Government stock market support cascade → securities + banking BULLISH
 *
 * Bug: Article "VIETNAM GOVERNMENT PLANS STOCK MARKET SUPPORT MEASURES" (impact 10.0)
 * only cascaded to real_estate (HUT) when summary contained
 * "chính phủ kế hoạch hỗ trợ thị trường chứng khoán".
 *
 * Root cause: banking SECTOR_RULE missing:
 *   - "hỗ trợ thị trường chứng khoán"  (Vietnamese — specific stock market phrasing)
 *   - "stock market support measures"   (English — exact title phrase)
 *   - "government stock market support" (English — variant)
 *
 * Fix: add the three keywords to the banking rule so that
 * any summary matching the securities rule also matches banking.
 *
 * Acceptance criteria:
 *   AC-1  "chính phủ kế hoạch hỗ trợ thị trường chứng khoán" → securities domain BULLISH
 *   AC-2  "chính phủ kế hoạch hỗ trợ thị trường chứng khoán" → banking domain BULLISH
 *   AC-3  securities cascade produces action entries for SSI/VCI/VIX/VND
 *   AC-4  banking cascade produces action entries for BID/VCB/TCB
 *   AC-5  English phrase "stock market support measures" → banking domain BULLISH
 *   AC-6  English phrase "government stock market support" → banking domain BULLISH
 */

import { describe, test, expect } from "bun:test";
import {
  buildCausalChain,
  type WatchlistEntry,
} from "../../src/domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../../src/domain/services/newsNormalizer.js";

function makeSeed(summary: string, impactScore = 10): AnalysisEntry {
  return {
    id: `fix-1268-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceTitle: "VIETNAM GOVERNMENT PLANS STOCK MARKET SUPPORT MEASURES",
    sourceUrl: "",
    sourceType: "news",
    publishedAt: "2026-04-25T09:00:00Z",
    summary,
    level: "country",
    sentiment: "bullish",
    impactScore,
    impactDirection: "up",
    confidence: 0.9,
    timeHorizon: "short",
    reasoning: "test seed",
    affectedCountries: ["VN"],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: "2026-04-25T09:00:00Z",
  };
}

const watchlist: WatchlistEntry[] = [
  // Securities brokers
  { actionCode: "SSI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VCI", domain: "securities", exchange: "HOSE" },
  { actionCode: "VIX", domain: "securities", exchange: "HOSE" },
  { actionCode: "VND", domain: "securities", exchange: "HOSE" },
  // Banking stocks
  { actionCode: "BID", domain: "banking", exchange: "HOSE" },
  { actionCode: "VCB", domain: "banking", exchange: "HOSE" },
  { actionCode: "TCB", domain: "banking", exchange: "HOSE" },
  // Real estate (should still cascade)
  { actionCode: "HUT", domain: "real_estate", exchange: "HOSE" },
];

describe("FIX-1268 — Govt stock market support cascade → securities + banking", () => {
  // ── AC-1: Vietnamese phrase "hỗ trợ thị trường chứng khoán" → securities BULLISH
  test("AC-1: Vietnamese summary → securities domain BULLISH", () => {
    const chain = buildCausalChain(
      makeSeed("chính phủ kế hoạch hỗ trợ thị trường chứng khoán"),
      watchlist,
    );
    const securitiesEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("securities") &&
        e.sentiment === "bullish",
    );
    expect(securitiesEntry).toBeDefined();
  });

  // ── AC-2: Vietnamese phrase "hỗ trợ thị trường chứng khoán" → banking BULLISH
  test("AC-2: Vietnamese summary → banking domain BULLISH", () => {
    const chain = buildCausalChain(
      makeSeed("chính phủ kế hoạch hỗ trợ thị trường chứng khoán"),
      watchlist,
    );
    const bankingEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("banking") &&
        e.sentiment === "bullish",
    );
    expect(bankingEntry).toBeDefined();
  });

  // ── AC-3: securities cascade → action entries for SSI/VCI/VIX/VND
  test("AC-3: Vietnamese summary → action entries for SSI, VCI, VIX, VND", () => {
    const chain = buildCausalChain(
      makeSeed("chính phủ kế hoạch hỗ trợ thị trường chứng khoán"),
      watchlist,
    );
    const actionCodes = new Set(
      chain.entries
        .filter((e) => e.level === "action")
        .flatMap((e) => e.affectedActions),
    );
    expect(actionCodes.has("SSI")).toBe(true);
    expect(actionCodes.has("VCI")).toBe(true);
    expect(actionCodes.has("VIX")).toBe(true);
    expect(actionCodes.has("VND")).toBe(true);
  });

  // ── AC-4: banking cascade → action entries for BID/VCB/TCB
  test("AC-4: Vietnamese summary → action entries for BID, VCB, TCB", () => {
    const chain = buildCausalChain(
      makeSeed("chính phủ kế hoạch hỗ trợ thị trường chứng khoán"),
      watchlist,
    );
    const actionCodes = new Set(
      chain.entries
        .filter((e) => e.level === "action")
        .flatMap((e) => e.affectedActions),
    );
    expect(actionCodes.has("BID")).toBe(true);
    expect(actionCodes.has("VCB")).toBe(true);
    expect(actionCodes.has("TCB")).toBe(true);
  });

  // ── AC-5: English "stock market support measures" → banking domain BULLISH
  test("AC-5: English 'stock market support measures' → banking domain BULLISH", () => {
    const chain = buildCausalChain(
      makeSeed("vietnam government plans stock market support measures"),
      watchlist,
    );
    const bankingEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("banking") &&
        e.sentiment === "bullish",
    );
    expect(bankingEntry).toBeDefined();
  });

  // ── AC-6: English "government stock market support" → banking domain BULLISH
  test("AC-6: English 'government stock market support' → banking domain BULLISH", () => {
    const chain = buildCausalChain(
      makeSeed("government stock market support announced by authorities"),
      watchlist,
    );
    const bankingEntry = chain.entries.find(
      (e) =>
        e.level === "domain" &&
        e.affectedDomains.includes("banking") &&
        e.sentiment === "bullish",
    );
    expect(bankingEntry).toBeDefined();
  });
});
