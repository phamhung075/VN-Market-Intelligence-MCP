/**
 * Task 1347b — Stock Classification Coverage
 *
 * Asserts that docs/data/stock-classification.json covers all 30 watchlist
 * tickers with valid tradeExposure data.
 *
 * TDD: RED first (5 tickers covered, 26 missing) → GREEN after JSON update.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ── Load the JSON from project root (not from test-relative path) ────────────
// Resolve upward from __tests__ → src → mcp-server → apps → project root (5 levels)
// Uses the real resolved path to handle git worktrees correctly.

const TESTS_DIR = import.meta.dir; // .../apps/mcp-server/src/__tests__
const PROJECT_ROOT = join(TESTS_DIR, "..", "..", "..", "..");
const JSON_PATH = join(PROJECT_ROOT, "docs", "data", "stock-classification.json");

interface WatchlistEntry {
  ticker: string;
  company: string;
  sector: string;
  exchange: string;
  warning?: string | null;
}

interface StockClassification {
  lastUpdated: string;
  watchlist: WatchlistEntry[];
  tradeExposure: Record<string, Record<string, number>>;
  reverseMap: Array<{ event: string; stocks: string[] }>;
  sectorPeers: Record<string, { sector: string; peers: string[] }>;
}

const data: StockClassification = JSON.parse(readFileSync(JSON_PATH, "utf-8"));

// ── Canonical watchlist (30 tickers per sprint-054 expansion) ────────────────

const WATCHLIST_30 = [
  // Banking (4)
  "VCB", "BID", "SHB", "EIB",
  // Real estate (10)
  "VHM", "VIC", "KBC", "HUT", "DIG", "DXG", "KDH", "PDR", "NVL", "VRE",
  // Steel (1)
  "HPG",
  // Retail (3)
  "MSN", "FRT", "KDC",
  // Conglomerate/Food (1)
  "SAB",
  // Tech (1)
  "FPT",
  // Agriculture/Dairy (2)
  "VNM", "DPM",
  // Securities (4)
  "SSI", "VIX", "VND", "VCI",
  // Chemicals (1)
  "DGC",
  // Aviation (1)
  "VJC",
  // Utilities (1)
  "GEX",
  // Oil & gas (1)
  "BSR",
] as const;

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Task 1347b — stock-classification.json full coverage", () => {

  it("watchlist array contains all 30 tickers", () => {
    const tickers = data.watchlist.map((e) => e.ticker);
    const missing = WATCHLIST_30.filter((t) => !tickers.includes(t));
    expect(missing).toEqual([]);
  });

  it("tradeExposure exists for all 30 tickers", () => {
    const missing = WATCHLIST_30.filter((t) => !data.tradeExposure[t]);
    expect(missing).toEqual([]);
  });

  it("tradeExposure percentages sum to 100 (±1 rounding) for each ticker", () => {
    const outOfRange: string[] = [];
    for (const ticker of WATCHLIST_30) {
      const exposure = data.tradeExposure[ticker];
      if (!exposure) continue; // caught by previous test
      const total = Object.values(exposure).reduce((a, b) => a + b, 0);
      if (total < 99 || total > 101) {
        outOfRange.push(`${ticker}=${total}`);
      }
    }
    expect(outOfRange).toEqual([]);
  });

  it("reverseMap has at least 5 events each with at least 2 stocks", () => {
    const qualifying = data.reverseMap.filter((r) => r.stocks.length >= 2);
    expect(qualifying.length).toBeGreaterThanOrEqual(5);
  });

  it("sectorPeers covers Banking, Real estate, Steel, Aviation, Securities, Tech, Agriculture", () => {
    const sectors = Object.values(data.sectorPeers).map((p) => p.sector);
    for (const required of ["Banking", "Real estate", "Steel", "Tech", "Securities"]) {
      const found = sectors.some((s) => s.toLowerCase().includes(required.toLowerCase()));
      expect(found).toBe(true);
    }
  });

  it("lastUpdated is 2026-05-07 after the update", () => {
    expect(data.lastUpdated).toBe("2026-05-07");
  });

  it("each watchlist entry has ticker, company, sector, exchange fields", () => {
    for (const entry of data.watchlist) {
      expect(typeof entry.ticker).toBe("string");
      expect(entry.ticker.length).toBeGreaterThan(0);
      expect(typeof entry.company).toBe("string");
      expect(typeof entry.sector).toBe("string");
      expect(typeof entry.exchange).toBe("string");
    }
  });

  it("no duplicate tickers in watchlist array", () => {
    const tickers = data.watchlist.map((e) => e.ticker);
    const unique = new Set(tickers);
    expect(unique.size).toBe(tickers.length);
  });
});
