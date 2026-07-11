// apps/mcp-server/src/__tests__/1787-gvr-sector-fix.test.ts
// Task 1787 — GVR must be classified as agriculture, not oil_gas
//
// SUPERSEDED by WATCHLIST-DB-SYSMAP-DRIFT-FIX (2026-07-11): GVR has zero
// entries in docs/data/system-map.json `.project.watchlist[]` — it was a
// seeder-only orphan, never part of the real watchlist SSOT. Now that
// WATCHLIST_SEED derives from system-map.json, GVR correctly drops out of
// the seed entirely rather than being relabeled to a different sector. Kept
// here as a regression guard that GVR stays absent. (GAS is ALSO absent from
// system-map.json — the original "GAS remains oil_gas" collateral assertion
// no longer applies and has been dropped, not carried forward as a false
// claim.)

import { describe, it, expect } from "bun:test";
import { WATCHLIST_SEED } from "../infrastructure/db/seedWatchlist.js";

describe("Task 1787 — GVR sector classification (superseded by WATCHLIST-DB-SYSMAP-DRIFT-FIX)", () => {
  it("GVR is absent from WATCHLIST_SEED (not in system-map.json SSOT)", () => {
    const gvr = WATCHLIST_SEED.find((e) => e.code === "GVR");
    expect(gvr).toBeUndefined();
  });
});
