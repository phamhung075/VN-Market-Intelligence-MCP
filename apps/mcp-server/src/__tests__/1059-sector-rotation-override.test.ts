/**
 * Report 1059 — sector rotation same-data-gap as portfolio conviction.
 *
 * The domain layer fix: `detectSectorRotation()` now accepts an optional
 * `codeSectorOverride` map so the MCP tool can inject watchlist.domain
 * assignments for tickers that are NOT listed in the static SECTOR_PEERS
 * map. Without this override, any watchlist ticker that is not a recognised
 * sector leader was silently dropped, leaving `Tong so nganh phan tich: 0`
 * even when live price data existed.
 *
 * See docs/IMPLEMENTATION_STATUS.md and the report-1059 commit for context.
 */

import { describe, it, expect } from "bun:test";
import {
  detectSectorRotation,
  type SectorPriceData,
} from "../domain/services/sectorRotationDetector.js";

function stock(
  code: string,
  priceNow: number,
  price1dAgo: number | null,
  price5dAgo: number | null,
): SectorPriceData {
  return { code, priceNow, price1dAgo, price5dAgo };
}

describe("report 1059 — codeSectorOverride", () => {
  it("uses the override to classify tickers missing from SECTOR_PEERS", () => {
    // Fabricate a code that is almost certainly not in SECTOR_PEERS.
    const code = "ZZZ1059";
    const priceMap: Record<string, SectorPriceData> = {
      [code]: stock(code, 110, 108, 100), // +10% 5d, +1.85% 1d → inflow
    };

    // Without override: sector is unknown → zero sectors reported.
    const without = detectSectorRotation(priceMap, [], []);
    expect(without.sectors.length).toBe(0);

    // With override: the ticker is pinned to `tech` via watchlist.domain.
    const override = { [code]: "tech" as const };
    const withOverride = detectSectorRotation(
      priceMap,
      ["tech"],
      [],
      override,
    );
    expect(withOverride.sectors.length).toBe(1);
    expect(withOverride.sectors[0]?.sector).toBe("tech");
    expect(withOverride.sectors[0]?.classification).toBe("DONG_TIEN_VAO");
    expect(withOverride.sectors[0]?.stocks).toContain(code);
  });

  it("override does not disturb SECTOR_PEERS lookups for known tickers", () => {
    // FPT is a seed in the tech sector peer list.
    const priceMap: Record<string, SectorPriceData> = {
      FPT: stock("FPT", 120, 118, 110),
    };
    const result = detectSectorRotation(priceMap, [], [], {});
    // At least one sector should classify FPT.
    expect(result.sectors.length).toBeGreaterThan(0);
    const flat = result.sectors.flatMap((s) => s.stocks);
    expect(flat).toContain("FPT");
  });
});
