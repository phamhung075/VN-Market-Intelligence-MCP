/**
 * Task 186 — Sector Rotation MCP Tool
 *
 * Interface layer: registers `get_sector_rotation` on a McpServer instance.
 *
 * The tool:
 *   1. Reads current prices from `market_prices` (latest snapshot)
 *   2. Reads historical prices from `market_prices_history` (1d and 5d ago)
 *   3. Reads watchlist stock codes from the `watchlist` table
 *   4. Calls detectSectorRotation() from the domain layer
 *   5. Formats a Vietnamese summary with inflow/outflow sector rankings
 *
 * Output format:
 *   === PHAN TICH DONG TIEN THEO NGANH ===
 *   ...ranked sectors with DONG TIEN VAO / DONG TIEN RA labels...
 *   CANH BAO: [stock] trong nganh [sector] dang bi rut von
 *
 * @module interface/mcp/tools/sectorRotation
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";
import {
  detectSectorRotation,
  type SectorPriceData,
  type SectorRotationEntry,
} from "../../../domain/services/sectorRotationDetector.js";
import type { DomainType } from "../../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface MarketPriceRow {
  code: string;
  price: number;
  change_pct: number | null;
  updated_at: string;
}

interface PriceHistoryRow {
  code: string;
  price: number;
  fetched_at: string;
}

interface WatchlistRow {
  code: string;
  domain: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (exported for integration testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a sector entry into a display line.
 *
 * Example output:
 *   [DONG TIEN VAO] Ngan hang (+8.50% / 5d, +1.20% / 1d)  VCB BID CTG
 */
function formatSectorLine(entry: SectorRotationEntry): string {
  const label =
    entry.classification === "DONG_TIEN_VAO"
      ? "[DONG TIEN VAO]"
      : entry.classification === "DONG_TIEN_RA"
        ? "[DONG TIEN RA]"
        : "[ON DINH]";

  const ret5d =
    entry.avg5dReturn !== null
      ? `${entry.avg5dReturn >= 0 ? "+" : ""}${entry.avg5dReturn.toFixed(2)}% / 5d`
      : "N/A / 5d";
  const ret1d =
    entry.avg1dReturn !== null
      ? `${entry.avg1dReturn >= 0 ? "+" : ""}${entry.avg1dReturn.toFixed(2)}% / 1d`
      : "N/A / 1d";

  const stockList = entry.stocks.join(" ");
  return `${label} ${entry.sectorNameVi} (${ret5d}, ${ret1d})  ${stockList}`;
}

/**
 * Build the sector rotation report string from a database connection.
 *
 * Exported so integration tests can inject an in-memory DB.
 *
 * @param db - SQLite database connection.
 * @returns Formatted Vietnamese text report.
 */
export async function getSectorRotationReport(db: Database): Promise<string> {
  const now = new Date();

  // ── 1. Read current prices ────────────────────────────────────────────────
  let currentPrices: MarketPriceRow[] = [];
  try {
    currentPrices = db
      .query<MarketPriceRow, []>(
        "SELECT code, price, change_pct, updated_at FROM market_prices WHERE price IS NOT NULL",
      )
      .all();
  } catch {
    // Table may not exist yet
  }

  if (currentPrices.length === 0) {
    return "Chua co du lieu gia thi truong";
  }

  // ── 2. Read historical prices (1d and 5d ago) ─────────────────────────────
  // We fetch all history rows for the codes we have current prices for,
  // then pick the closest snapshot to 1d and 5d ago.
  const codes = currentPrices.map((r) => r.code);
  const codesPlaceholder = codes.map(() => "?").join(", ");

  let historyRows: PriceHistoryRow[] = [];
  try {
    historyRows = db
      .query<PriceHistoryRow, string[]>(
        `SELECT code, price, fetched_at FROM market_prices_history
         WHERE code IN (${codesPlaceholder})
         ORDER BY fetched_at DESC`,
      )
      .all(...codes);
  } catch {
    // History table may not exist
  }

  // Build per-code price history arrays for 1d and 5d lookup
  const historyByCode = new Map<string, PriceHistoryRow[]>();
  for (const row of historyRows) {
    const arr = historyByCode.get(row.code) ?? [];
    arr.push(row);
    historyByCode.set(row.code, arr);
  }

  /**
   * Find the price closest to `targetDate` for a given code.
   * Tolerates up to 3 trading days of slippage (weekends, holidays).
   */
  function findHistoricalPrice(
    code: string,
    targetDate: Date,
    toleranceHours = 72,
  ): number | null {
    const rows = historyByCode.get(code) ?? [];
    const targetMs = targetDate.getTime();
    const toleranceMs = toleranceHours * 60 * 60 * 1000;

    let bestRow: PriceHistoryRow | null = null;
    let bestDiff = Infinity;

    for (const row of rows) {
      const rowMs = new Date(row.fetched_at).getTime();
      const diff = Math.abs(rowMs - targetMs);
      if (diff < toleranceMs && diff < bestDiff) {
        bestDiff = diff;
        bestRow = row;
      }
    }

    return bestRow?.price ?? null;
  }

  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  // ── 3. Build priceMap ─────────────────────────────────────────────────────
  const priceMap: Record<string, SectorPriceData> = {};
  for (const row of currentPrices) {
    priceMap[row.code] = {
      code: row.code,
      priceNow: row.price,
      price1dAgo: findHistoricalPrice(row.code, oneDayAgo),
      price5dAgo: findHistoricalPrice(row.code, fiveDaysAgo),
      changePct: row.change_pct,
    };
  }

  // ── 4. Read watchlist ─────────────────────────────────────────────────────
  let watchlistRows: WatchlistRow[] = [];
  try {
    watchlistRows = db
      .query<WatchlistRow, []>("SELECT code, domain FROM watchlist")
      .all();
  } catch {
    // Watchlist table may not exist
  }

  const watchlistCodes = watchlistRows.map((r) => r.code);

  // Determine which sectors are represented in the data
  const representedSectors = new Set<DomainType>();
  for (const code of Object.keys(priceMap)) {
    const { getSectorForCode } = await import(
      "../../../domain/services/sectorRotationDetector.js"
    );
    const sector = getSectorForCode(code);
    if (sector && sector !== "other") representedSectors.add(sector);
  }

  // Also include sectors from the watchlist
  for (const row of watchlistRows) {
    if (row.domain && row.domain !== "other") {
      representedSectors.add(row.domain as DomainType);
    }
  }

  // ── 5. Run detection ──────────────────────────────────────────────────────
  const result = detectSectorRotation(
    priceMap,
    Array.from(representedSectors),
    watchlistCodes,
  );

  // ── 6. Format output ──────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push("=== PHAN TICH DONG TIEN THEO NGANH ===");
  lines.push(`Cap nhat: ${now.toISOString().slice(0, 16).replace("T", " ")} (GMT)`);

  if (result.only1dAvailable) {
    lines.push("(chi co du lieu 1 ngay — chua du 5 phien giao dich)");
  }

  lines.push("");

  if (result.sectors.length === 0) {
    lines.push("Chua co du lieu nganh.");
  } else {
    // Inflow sectors first
    const inflowSectors = result.sectors.filter(
      (s) => s.classification === "DONG_TIEN_VAO",
    );
    const outflowSectors = result.sectors.filter(
      (s) => s.classification === "DONG_TIEN_RA",
    );
    const neutralSectors = result.sectors.filter(
      (s) => s.classification === "NEUTRAL",
    );

    if (inflowSectors.length > 0) {
      lines.push("-- Nganh co dong tien vao --");
      for (const entry of inflowSectors) {
        lines.push(formatSectorLine(entry));
      }
      lines.push("");
    }

    if (outflowSectors.length > 0) {
      lines.push("-- Nganh co dong tien ra --");
      for (const entry of outflowSectors) {
        lines.push(formatSectorLine(entry));
      }
      lines.push("");
    }

    if (neutralSectors.length > 0) {
      lines.push("-- Nganh on dinh / khong ro xu huong --");
      for (const entry of neutralSectors) {
        lines.push(formatSectorLine(entry));
      }
      lines.push("");
    }

    // Watchlist warnings
    const warnings = result.sectors.filter((s) => s.watchlistWarning);
    if (warnings.length > 0) {
      for (const w of warnings) {
        // Find which watchlist stocks are in this outflow sector
        const watchlistInSector = watchlistCodes.filter(
          (c) => w.stocks.includes(c.toUpperCase()) || w.stocks.includes(c),
        );
        const stockList =
          watchlistInSector.length > 0 ? watchlistInSector.join(", ") : w.stocks.join(", ");
        lines.push(
          `CANH BAO: ${stockList} trong nganh ${w.sectorNameVi} dang bi rut von (DONG TIEN RA)`,
        );
      }
      lines.push("");
    }
  }

  lines.push(`Tong so nganh phan tich: ${result.sectors.length}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register sector rotation MCP tool: get_sector_rotation.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerSectorRotationTools(server: McpServer): void {
  server.tool(
    "get_sector_rotation",
    "Detect sector rotation on the Vietnamese stock market. " +
      "Groups stocks by sector and classifies each sector as 'DONG TIEN VAO' (inflow), " +
      "'DONG TIEN RA' (outflow), or 'ON DINH' (neutral) based on 5-day and 1-day returns. " +
      "Sectors are ranked by 5-day return. If a watchlist stock is in an outflow sector, " +
      "a warning line is appended.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();
        const report = await getSectorRotationReport(db);
        return {
          content: [{ type: "text" as const, text: report }],
        };
      } catch (err) {
        logger.error("[get_sector_rotation] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating sector rotation report: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
