/**
 * Task WATCHLIST-DB-SYSMAP-DRIFT-FIX
 *
 * Root cause: WATCHLIST_SEED in seedWatchlist.ts was a second hardcoded
 * 34-ticker array, independently diverged from docs/data/system-map.json
 * `.project.watchlist[]` (SSOT) — only 15/33 tickers overlapped. schema.ts
 * ran the stale seeder unconditionally on every non-test DB init, so a pure
 * one-time DB resync would not have survived the next restart.
 *
 * Fix: WATCHLIST_SEED now derives from system-map.json at module load
 * instead of being hardcoded. These tests pin the derivation contract:
 *   - mapSectorToDomain(): pure sector-text -> DomainType classifier
 *   - deriveWatchlistSeedFromSystemMap(): pure filter+map, active-only
 *   - WATCHLIST_SEED (loaded from the REAL system-map.json): ticker set,
 *     exchange values, and count exactly match system-map's active
 *     watchlist — the core acceptance criterion for this task.
 *   - loadWatchlistSeedFromSystemMap(): graceful degradation (never throws
 *     — a missing/unreadable file must not crash the whole MCP server).
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DomainType } from "../../bctc-schema.js";
import {
  WATCHLIST_SEED,
  mapSectorToDomain,
  deriveWatchlistSeedFromSystemMap,
  loadWatchlistSeedFromSystemMap,
  type SystemMapWatchlistEntry,
} from "../infrastructure/db/seedWatchlist.js";

// ── Resolve the real system-map.json from project root (worktree-safe) ─────
// Same pattern as FIX-I-B-board-details.test.ts / 1347b-stock-classification.
const TESTS_DIR = import.meta.dir; // .../apps/mcp-server/src/__tests__
const PROJECT_ROOT = join(TESTS_DIR, "..", "..", "..", "..");
const SYSTEM_MAP_PATH = join(PROJECT_ROOT, "docs", "data", "system-map.json");

interface SystemMapFile {
  project: { watchlist: SystemMapWatchlistEntry[] };
}

const systemMap: SystemMapFile = JSON.parse(
  readFileSync(SYSTEM_MAP_PATH, "utf-8"),
);
const activeEntries = systemMap.project.watchlist.filter(
  (e) => e.active !== false,
);

// ─────────────────────────────────────────────────────────────────────────────
// mapSectorToDomain — pure sector text -> DomainType classifier
// ─────────────────────────────────────────────────────────────────────────────

describe("WATCHLIST-DB-SYSMAP-DRIFT-FIX — mapSectorToDomain (pure)", () => {
  it("maps banking sector text", () => {
    expect(mapSectorToDomain("Banking")).toBe("banking");
  });

  it("maps real-estate variants using only the first '/' segment", () => {
    expect(mapSectorToDomain("Real estate / Retail REIT")).toBe("real_estate");
  });

  it("maps oil & gas sector text", () => {
    expect(mapSectorToDomain("Oil & Gas / Petroleum Retail")).toBe("oil_gas");
  });

  it("maps food/beverage sector text to agriculture (no food_beverage DomainType exists)", () => {
    expect(mapSectorToDomain("Food / Beverage / Retail")).toBe("agriculture");
  });

  it("maps steel sector text", () => {
    expect(mapSectorToDomain("Steel")).toBe("steel");
  });

  it("falls back to 'other' for unrecognized sector text", () => {
    expect(mapSectorToDomain("Zzz Unknown Sector")).toBe("other");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deriveWatchlistSeedFromSystemMap — pure filter+map
// ─────────────────────────────────────────────────────────────────────────────

describe("WATCHLIST-DB-SYSMAP-DRIFT-FIX — deriveWatchlistSeedFromSystemMap (pure)", () => {
  const fixture: SystemMapWatchlistEntry[] = [
    {
      ticker: "vnm",
      company: "Vinamilk",
      sector: "Agriculture / Dairy",
      exchange: "HOSE",
      active: true,
    },
    {
      ticker: "VEA",
      company: "VEAM Corp",
      sector: "Automotive (Honda/Toyota/Ford JV)",
      exchange: "UPCOM",
      active: false,
    },
  ];

  it("excludes inactive entries", () => {
    const seed = deriveWatchlistSeedFromSystemMap(fixture);
    expect(seed.find((e) => e.code === "VEA")).toBeUndefined();
  });

  it("uppercases ticker codes", () => {
    const seed = deriveWatchlistSeedFromSystemMap(fixture);
    expect(seed.find((e) => e.code === "VNM")).toBeDefined();
  });

  it("maps sector to domain per entry", () => {
    const seed = deriveWatchlistSeedFromSystemMap(fixture);
    expect(seed.find((e) => e.code === "VNM")?.domain).toBe("agriculture");
  });

  it("carries exchange through unchanged", () => {
    const seed = deriveWatchlistSeedFromSystemMap(fixture);
    expect(seed.find((e) => e.code === "VNM")?.exchange).toBe("HOSE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLIST_SEED — must exactly equal the live system-map.json active set
// ─────────────────────────────────────────────────────────────────────────────

describe("WATCHLIST-DB-SYSMAP-DRIFT-FIX — WATCHLIST_SEED matches live system-map.json SSOT", () => {
  it("WATCHLIST_SEED length equals system-map active watchlist count", () => {
    expect(WATCHLIST_SEED.length).toBe(activeEntries.length);
  });

  it("WATCHLIST_SEED ticker set exactly equals system-map active ticker set", () => {
    const seedCodes = new Set(WATCHLIST_SEED.map((e) => e.code));
    const ssotCodes = new Set(activeEntries.map((e) => e.ticker.toUpperCase()));
    expect(seedCodes).toEqual(ssotCodes);
  });

  it("WATCHLIST_SEED excludes VEA (inactive) and VNH (absent from SSOT entirely)", () => {
    const seedCodes = new Set(WATCHLIST_SEED.map((e) => e.code));
    expect(seedCodes.has("VEA")).toBe(false);
    expect(seedCodes.has("VNH")).toBe(false);
  });

  it("every WATCHLIST_SEED exchange exactly matches its system-map entry", () => {
    const ssotByCode = new Map(
      activeEntries.map((e) => [e.ticker.toUpperCase(), e.exchange]),
    );
    for (const entry of WATCHLIST_SEED) {
      const ssotExchange = ssotByCode.get(entry.code);
      expect(ssotExchange).toBeDefined();
      expect(entry.exchange).toBe(ssotExchange as typeof entry.exchange);
    }
  });

  it("every WATCHLIST_SEED domain is a valid DomainType (regression guard)", () => {
    const VALID_DOMAINS: DomainType[] = [
      "oil_gas", "banking", "real_estate", "steel", "aviation", "retail",
      "tech", "utilities", "agriculture", "insurance", "securities", "pharma",
      "pharmaceutical", "logistics", "gold_mining", "automotive",
      "construction", "energy", "machinery", "chemicals", "other",
    ];
    const validSet = new Set<string>(VALID_DOMAINS);
    for (const entry of WATCHLIST_SEED) {
      expect(
        validSet.has(entry.domain),
        `${entry.code} has invalid domain: "${entry.domain}"`,
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadWatchlistSeedFromSystemMap — graceful degradation (fail-loud via warn,
// never crash the whole server on a missing/corrupt SSOT file)
// ─────────────────────────────────────────────────────────────────────────────

describe("WATCHLIST-DB-SYSMAP-DRIFT-FIX — loadWatchlistSeedFromSystemMap graceful degradation", () => {
  it("returns an empty array (does not throw) when the file does not exist", () => {
    const seed = loadWatchlistSeedFromSystemMap("/nonexistent/path/system-map.json");
    expect(seed).toEqual([]);
  });
});
