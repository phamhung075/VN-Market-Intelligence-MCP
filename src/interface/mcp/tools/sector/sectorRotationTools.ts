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

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";
import {
  detectSectorRotation,
  type SectorPriceData,
  type SectorRotationEntry,
} from "../../../../domain/services/sectorRotationDetector.js";
import type { DomainType } from "../../../../../bctc-schema.js";
import { fetchHosePrices, type MarketPrice } from "../../../../infrastructure/fetchers/hose.js";
import { fetchHnxPrices, fetchUpcomPrices } from "../../../../infrastructure/fetchers/hnx.js";
import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";

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
  exchange?: string;
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
      ? "[DÒNG TIỀN VÀO]"
      : entry.classification === "DONG_TIEN_RA"
        ? "[DÒNG TIỀN RA]"
        : "[ỔN ĐỊNH]";

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

  // ── 1a. Read watchlist FIRST (report 1059) ────────────────────────────────
  // We need watchlist codes both to drive the live price fan-out and to
  // override sector assignment for tickers not in the static SECTOR_PEERS map.
  let watchlistRows: WatchlistRow[] = [];
  try {
    watchlistRows = db
      .query<WatchlistRow, []>(
        "SELECT code, domain, exchange FROM watchlist",
      )
      .all();
  } catch {
    // Watchlist table may not exist
  }

  const watchlistByCode = new Map<
    string,
    { domain: string; exchange: string }
  >();
  for (const w of watchlistRows) {
    watchlistByCode.set(w.code.toUpperCase(), {
      domain: w.domain,
      exchange: (w.exchange || "HOSE").toUpperCase(),
    });
  }

  // ── 1b. Read current prices from DB (stored snapshot) ────────────────────
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

  // ── 1c. Live fetch for any watchlist code missing from the DB snapshot ──
  // Report 1059 root cause: outside the VN trading window, `market_prices`
  // can be empty or contain only indices while watchlist tickers have no
  // row. `get_portfolio_conviction` already solves this by force-fetching
  // live from vnstock/VPS API — we mirror the same fan-out here so sector
  // rotation agrees with conviction. Live fetchers also append to
  // `market_prices_history`, which feeds the 5d baseline on future runs.
  let priceSource: "stored" | "live" | "mixed" = "stored";
  const haveCodes = new Set(currentPrices.map((r) => r.code.toUpperCase()));
  const missingWatchlist = watchlistRows.filter(
    (w) => !haveCodes.has(w.code.toUpperCase()),
  );

  if (missingWatchlist.length > 0) {
    try {
      const hoseCodes: string[] = [];
      const hnxCodes: string[] = [];
      const upcomCodes: string[] = [];
      for (const w of missingWatchlist) {
        const ex = (w.exchange || "HOSE").toUpperCase();
        if (ex === "HNX") hnxCodes.push(w.code);
        else if (ex === "UPCOM") upcomCodes.push(w.code);
        else hoseCodes.push(w.code);
      }

      const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        new Promise((resolve) => {
          const t = setTimeout(() => resolve(fallback), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
            .catch(() => { clearTimeout(t); resolve(fallback); });
        });

      const [hoseRes, hnxRes, upcomRes] = await Promise.all([
        hoseCodes.length > 0
          ? withDeadline(
              fetchHosePrices(hoseCodes, undefined, { force: true }),
              8_000,
              [] as MarketPrice[],
            )
          : Promise.resolve([] as MarketPrice[]),
        hnxCodes.length > 0
          ? withDeadline(
              fetchHnxPrices(hnxCodes, undefined, { force: true }),
              8_000,
              [] as MarketPrice[],
            )
          : Promise.resolve([] as MarketPrice[]),
        upcomCodes.length > 0
          ? withDeadline(
              fetchUpcomPrices(upcomCodes, undefined, { force: true }),
              8_000,
              [] as MarketPrice[],
            )
          : Promise.resolve([] as MarketPrice[]),
      ]);

      const liveRows: MarketPriceRow[] = [];
      for (const p of [...hoseRes, ...hnxRes, ...upcomRes]) {
        if (haveCodes.has(p.code.toUpperCase())) continue;
        liveRows.push({
          code: p.code,
          price: p.price,
          change_pct: p.changePct,
          updated_at: p.fetchedAt,
        });
        haveCodes.add(p.code.toUpperCase());
      }
      if (liveRows.length > 0) {
        currentPrices = [...currentPrices, ...liveRows];
        priceSource = currentPrices.length === liveRows.length ? "live" : "mixed";
      }
    } catch (err) {
      logger.warn("[get_sector_rotation] Live price fallback failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (currentPrices.length === 0) {
    // Outside trading window with no stored snapshot is expected — make it
    // observable instead of a bare error (mirrors report 1057 banner work).
    return [
      "=== PHÂN TÍCH DÒNG TIỀN THEO NGÀNH ===",
      `Trading window: ${tradingWindowLabel(now)}`,
      "",
      "Chưa có dữ liệu giá thị trường",
    ].join("\n");
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

  // ── 4. Watchlist already loaded in step 1a ────────────────────────────────
  const watchlistCodes = watchlistRows.map((r) => r.code);

  // Build sector override map from watchlist.domain so that tickers not
  // listed in SECTOR_PEERS still get classified (report 1059).
  const codeSectorOverride: Record<string, DomainType> = {};
  for (const w of watchlistRows) {
    if (w.domain && w.domain !== "other") {
      codeSectorOverride[w.code.toUpperCase()] = w.domain as DomainType;
    }
  }

  // Determine which sectors are represented in the data
  const representedSectors = new Set<DomainType>();
  const { getSectorForCode } = await import(
    "../../../../domain/services/sectorRotationDetector.js"
  );
  for (const code of Object.keys(priceMap)) {
    const sector =
      codeSectorOverride[code.toUpperCase()] ?? getSectorForCode(code);
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
    codeSectorOverride,
  );

  // ── 6. Format output ──────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push("=== PHÂN TÍCH DÒNG TIỀN THEO NGÀNH ===");
  lines.push(`Trading window: ${tradingWindowLabel(now)}`);
  lines.push(
    `Nguon gia: ${priceSource === "live" ? "live API (force)" : priceSource === "mixed" ? "mixed (stored + live fallback)" : "stored snapshot (market_prices)"}`,
  );
  lines.push(`Cap nhat: ${now.toISOString().slice(0, 16).replace("T", " ")} (GMT)`);

  if (result.only1dAvailable) {
    lines.push("(chỉ có dữ liệu 1 ngày — chưa đủ 5 phiên giao dịch)");
  }

  lines.push("");

  if (result.sectors.length === 0) {
    lines.push("Chưa có dữ liệu ngành.");
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
      lines.push("-- Ngành có dòng tiền vào --");
      for (const entry of inflowSectors) {
        lines.push(formatSectorLine(entry));
      }
      lines.push("");
    }

    if (outflowSectors.length > 0) {
      lines.push("-- Ngành có dòng tiền ra --");
      for (const entry of outflowSectors) {
        lines.push(formatSectorLine(entry));
      }
      lines.push("");
    }

    if (neutralSectors.length > 0) {
      lines.push("-- Ngành ổn định / không rõ xu hướng --");
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
          `CẢNH BÁO: ${stockList} trong ngành ${w.sectorNameVi} đang bị rút vốn (DÒNG TIỀN RA)`,
        );
      }
      lines.push("");
    }
  }

  lines.push(`Tổng số ngành phân tích: ${result.sectors.length}`);

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
