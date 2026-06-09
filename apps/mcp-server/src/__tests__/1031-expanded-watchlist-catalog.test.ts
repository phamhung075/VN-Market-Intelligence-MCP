/**
 * Task 1031 — Expanded watchlist 8 → 30 tickers catalog sync
 *
 * Asserts:
 *   1. Every ticker in the expanded 30-ticker watchlist exists in STOCK_CATALOG
 *      with a non-empty companyName.
 *   2. Every ticker in the watchlist can be resolved via getStockProfile() from
 *      SECTOR_PEERS with the correct domain and exchange.
 *   3. Each represented sector has the watchlist ticker present in its
 *      SECTOR_PEERS entry.
 */

import { describe, it, expect } from "bun:test";
import { STOCK_CATALOG } from "../domain/services/stockAliases.js";
import { getStockProfile } from "../domain/services/sectorPeers.js";
import type { DomainType } from "../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Full expanded watchlist (30 tickers)
// ─────────────────────────────────────────────────────────────────────────────

const WATCHLIST: { code: string; domain: DomainType; exchange: string }[] = [
  // Banking
  { code: "VCB", domain: "banking",     exchange: "HOSE" },
  { code: "BID", domain: "banking",     exchange: "HOSE" },
  { code: "SHB", domain: "banking",     exchange: "HOSE" },
  { code: "EIB", domain: "banking",     exchange: "HOSE" },
  // Real estate
  { code: "VHM", domain: "real_estate", exchange: "HOSE" },
  { code: "VIC", domain: "real_estate", exchange: "HOSE" },
  { code: "KBC", domain: "real_estate", exchange: "HOSE" },
  { code: "HUT", domain: "construction", exchange: "HNX"  },
  { code: "DIG", domain: "real_estate", exchange: "HOSE" },
  { code: "DXG", domain: "real_estate", exchange: "HOSE" },
  { code: "KDH", domain: "real_estate", exchange: "HOSE" },
  { code: "PDR", domain: "real_estate", exchange: "HOSE" },
  { code: "NVL", domain: "real_estate", exchange: "HOSE" },
  { code: "VRE", domain: "real_estate", exchange: "HOSE" },
  // Steel
  { code: "HPG", domain: "steel",       exchange: "HOSE" },
  // Retail / consumer
  { code: "MSN", domain: "retail",      exchange: "HOSE" },
  { code: "FRT", domain: "retail",      exchange: "HOSE" },
  { code: "KDC", domain: "retail",      exchange: "HOSE" },
  // Conglomerate
  { code: "SAB", domain: "retail",      exchange: "HOSE" },
  // Tech
  { code: "FPT", domain: "tech",        exchange: "HOSE" },
  // Agriculture
  { code: "VNM", domain: "retail", exchange: "HOSE" },
  { code: "DPM", domain: "agriculture", exchange: "HOSE" },
  // Securities
  { code: "SSI", domain: "securities",  exchange: "HOSE" },
  { code: "VIX", domain: "securities",  exchange: "HOSE" },
  { code: "VND", domain: "securities",  exchange: "HOSE" },
  { code: "VCI", domain: "securities",  exchange: "HOSE" },
  // Chemicals
  { code: "DGC", domain: "chemicals",   exchange: "HOSE" },
  // Aviation
  { code: "VJC", domain: "aviation",    exchange: "HOSE" },
  // Utilities / power
  { code: "GEX", domain: "utilities",   exchange: "HOSE" },
  // Oil & gas
  { code: "BSR", domain: "oil_gas",     exchange: "UPCOM" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1031 — Expanded watchlist catalog sync (30 tickers)", () => {
  describe("STOCK_CATALOG coverage", () => {
    for (const { code } of WATCHLIST) {
      it(`${code} has an entry in STOCK_CATALOG with non-empty companyName`, () => {
        const entry = STOCK_CATALOG[code];
        expect(entry).toBeDefined();
        expect(entry?.companyName.length).toBeGreaterThan(0);
        expect(entry?.aliases.length).toBeGreaterThan(0);
      });
    }
  });

  describe("SECTOR_PEERS coverage (getStockProfile)", () => {
    for (const { code, domain, exchange } of WATCHLIST) {
      it(`${code} resolves to domain="${domain}" exchange="${exchange}" in SECTOR_PEERS`, () => {
        const profile = getStockProfile(code);
        expect(profile).not.toBeNull();
        expect(profile!.domain).toBe(domain);
        expect(profile!.exchange).toBe(exchange);
      });
    }
  });

  describe("Catalog totals", () => {
    it("STOCK_CATALOG has at least 65 entries (was 51 before expansion)", () => {
      expect(Object.keys(STOCK_CATALOG).length).toBeGreaterThanOrEqual(65);
    });

    it("all 30 watchlist tickers are unique — no duplicates in the list", () => {
      const codes = WATCHLIST.map((w) => w.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(30);
    });
  });
});
