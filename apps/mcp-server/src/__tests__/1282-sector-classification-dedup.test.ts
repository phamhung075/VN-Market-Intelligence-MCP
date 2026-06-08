// src/__tests__/1282-sector-classification-dedup.test.ts
Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Load mcp.config.json
const configPath = path.resolve(import.meta.dir, "../../mcp.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
  market: { referenceStocks: Record<string, string[]> };
};
const referenceStocks = config.market.referenceStocks;

// Load SECTOR_PEERS via the domain service
// We import the compiled source directly for the test
import { getSectorPeers } from "../domain/services/sectorPeers.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// Build a map: ticker -> sectors[] from referenceStocks
function buildRefStocksIndex(ref: Record<string, string[]>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [sector, tickers] of Object.entries(ref)) {
    for (const ticker of tickers) {
      const existing = index.get(ticker) ?? [];
      existing.push(sector);
      index.set(ticker, existing);
    }
  }
  return index;
}

// Build a map: ticker -> sectors[] from SECTOR_PEERS domain service
// DomainType sectors that exist in SECTOR_PEERS
const DOMAIN_SECTORS = [
  "banking", "tech", "real_estate", "steel", "oil_gas", "aviation",
  "retail", "securities", "utilities", "agriculture", "insurance", "pharma",
  "logistics", "gold_mining", "automotive", "construction", "energy",
  "pharmaceutical", "other",
] as const;
type DomainSector = typeof DOMAIN_SECTORS[number];

function buildSectorPeersIndex(): Map<string, DomainSector[]> {
  const index = new Map<string, DomainSector[]>();
  for (const sector of DOMAIN_SECTORS) {
    // Pass Infinity to bypass the default MAX_PEERS_PER_SECTOR limit so we
    // compare against the complete SECTOR_PEERS list, not just the top-10.
    const peers = getSectorPeers(sector as Parameters<typeof getSectorPeers>[0], new Set(), Infinity);
    for (const peer of peers) {
      const existing = index.get(peer.code) ?? [];
      existing.push(sector);
      index.set(peer.code, existing);
    }
  }
  return index;
}

describe("Task 1282 — Sector classification deduplication", () => {
  // ─── No conflicting sector assignments ─────────────────────────────────────

  it("no ticker has conflicting sector assignment between referenceStocks and SECTOR_PEERS", () => {
    const refIndex = buildRefStocksIndex(referenceStocks);
    const peersIndex = buildSectorPeersIndex();
    const conflicts: string[] = [];

    for (const [ticker, refSectors] of refIndex) {
      const peerSectors = peersIndex.get(ticker);
      if (!peerSectors) continue; // ticker not in SECTOR_PEERS — no conflict possible

      // Check if any refSector for this ticker contradicts what SECTOR_PEERS says
      // A conflict = the ticker is assigned to sector X in referenceStocks but
      // SECTOR_PEERS does NOT include it in sector X (using canonical sector names only)
      for (const refSector of refSectors) {
        // Skip sectors that don't exist in SECTOR_PEERS (no comparison possible)
        if (!(DOMAIN_SECTORS as readonly string[]).includes(refSector)) continue;
        if (!peerSectors.includes(refSector as DomainSector)) {
          conflicts.push(`${ticker}: referenceStocks says "${refSector}" but SECTOR_PEERS does not`);
        }
      }
    }

    if (conflicts.length > 0) {
      console.error("Conflicts found:", conflicts);
    }
    expect(conflicts).toHaveLength(0);
  });

  // ─── No duplicate pharma entries ───────────────────────────────────────────

  it("referenceStocks does not contain both 'pharma' and 'pharmaceutical' keys", () => {
    const hasPharma = "pharma" in referenceStocks;
    const hasPharmaceutical = "pharmaceutical" in referenceStocks;

    // Both existing is the duplication bug: pharma is a subset of pharmaceutical
    // Only one should exist (pharmaceutical is the canonical expanded one)
    expect(hasPharma && hasPharmaceutical).toBe(false);
  });

  // ─── All tickers in referenceStocks are present in SECTOR_PEERS ────────────

  it("every ticker in referenceStocks exists in SECTOR_PEERS under the same sector", () => {
    const peersIndex = buildSectorPeersIndex();
    const missing: string[] = [];

    for (const [sector, tickers] of Object.entries(referenceStocks)) {
      // Skip sectors not in SECTOR_PEERS domain list
      if (!(DOMAIN_SECTORS as readonly string[]).includes(sector)) continue;

      for (const ticker of tickers) {
        const peerSectors = peersIndex.get(ticker);
        if (!peerSectors || !peerSectors.includes(sector as DomainSector)) {
          missing.push(`${ticker} in referenceStocks["${sector}"] not found in SECTOR_PEERS["${sector}"]`);
        }
      }
    }

    if (missing.length > 0) {
      console.error("Missing entries:", missing);
    }
    expect(missing).toHaveLength(0);
  });

  // ─── 1252 constraints: referenceStocks still holds required sectors/tickers ─

  it("still has construction sector (1252 constraint)", () => {
    expect(referenceStocks["construction"]).toBeDefined();
    expect(referenceStocks["construction"]!.length).toBeGreaterThan(0);
  });

  it("still has energy sector (1252 constraint)", () => {
    expect(referenceStocks["energy"]).toBeDefined();
    expect(referenceStocks["energy"]!.length).toBeGreaterThan(0);
  });

  it("still has pharmaceutical sector (1252 constraint)", () => {
    expect(referenceStocks["pharmaceutical"]).toBeDefined();
    expect(referenceStocks["pharmaceutical"]!.length).toBeGreaterThan(0);
  });

  it("still has gold_mining sector (1252 constraint)", () => {
    expect(referenceStocks["gold_mining"]).toBeDefined();
    expect(referenceStocks["gold_mining"]!.length).toBeGreaterThan(0);
  });
});
