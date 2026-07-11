// apps/mcp-server/src/__tests__/VNH-sector-fix.test.ts
// Sprint VNH-SECTOR-FIX — VNH must be classified as agriculture, not real_estate
//
// SUPERSEDED by WATCHLIST-DB-SYSMAP-DRIFT-FIX (2026-07-11): VNH has zero
// entries in docs/data/system-map.json `.project.watchlist[]` (confirmed —
// it was a seeder-only orphan, never part of the real watchlist SSOT). Now
// that WATCHLIST_SEED derives from system-map.json, VNH correctly drops out
// of the seed entirely rather than being relabeled to a different sector.
// The original sector-relabel fix (commit 9713118fe) is moot; kept here as a
// regression guard that VNH stays absent, plus the still-valid collateral
// assertions from the original fix.

import { describe, it, expect } from "bun:test";
import type { DomainType } from "../../bctc-schema.js";
import { WATCHLIST_SEED } from "../infrastructure/db/seedWatchlist.js";

// Runtime array of all valid DomainType members.
// Typed as DomainType[] so the compiler catches any value that is not in the union.
// Adding a new member to DomainType that is NOT added here produces a compile error,
// ensuring this list stays in sync with the canonical union (AC-FR5-4).
const VALID_DOMAINS: DomainType[] = [
  "oil_gas",
  "banking",
  "real_estate",
  "steel",
  "aviation",
  "retail",
  "tech",
  "utilities",
  "agriculture",
  "insurance",
  "securities",
  "pharma",
  "pharmaceutical",
  "logistics",
  "gold_mining",
  "automotive",
  "construction",
  "energy",
  "machinery",
  "chemicals",
  "other",
];

describe("Sprint VNH-SECTOR-FIX — VNH sector classification (superseded by WATCHLIST-DB-SYSMAP-DRIFT-FIX)", () => {
  it("VNH is absent from WATCHLIST_SEED (not in system-map.json SSOT)", () => {
    const vnh = WATCHLIST_SEED.find((e) => e.code === "VNH");
    expect(vnh).toBeUndefined();
  });

  it("real_estate peers are unaffected (no collateral damage)", () => {
    const realEstatePeers = ["NVL", "KBC", "VRE", "VIC", "VHM"];
    for (const code of realEstatePeers) {
      const entry = WATCHLIST_SEED.find((e) => e.code === code);
      expect(entry?.domain).toBe("real_estate");
    }
  });

  it("every seed domain is a valid DomainType member (fleet-wide regression guard)", () => {
    const validSet = new Set<string>(VALID_DOMAINS);
    for (const entry of WATCHLIST_SEED) {
      expect(
        validSet.has(entry.domain),
        `${entry.code} has invalid domain: "${entry.domain}"`
      ).toBe(true);
    }
  });
});
