/**
 * Task 209 — Portfolio P&L Calculator (Domain Service)
 *
 * Pure business logic — no I/O, no SQLite, no HTTP.
 *
 * Given a list of open positions and a map of current prices, computes:
 *   - Per-position P&L (amount in VND and percentage)
 *   - Aggregate totals (sum of priced positions only)
 *
 * Also provides formatPnlSection() which produces the Vietnamese-format
 * DANH MỤC block used in the morning briefing.
 *
 * All prices are in raw VND (not million VND) — consistent with positionStore.ts
 * and market_prices table.
 *
 * @module domain/services/portfolioPnlCalculator
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input: one open position. */
export interface PositionInput {
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
}

/** Computed P&L for a single position. */
export interface PositionPnl {
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
  /** Current market price in VND, or null if unavailable. */
  currentPrice: number | null;
  /** Unrealized P&L in VND, or null when currentPrice is null. */
  pnlAmount: number | null;
  /** Unrealized P&L as a percentage of cost basis, or null when currentPrice is null. */
  pnlPct: number | null;
}

/** Result returned by computePortfolioPnl(). */
export interface PortfolioPnlResult {
  items: PositionPnl[];
  /** Sum of P&L for positions that have a current price. */
  totalPnlAmount: number;
  /**
   * Aggregate P&L percentage based on the cost of priced positions only.
   * Returns 0 if no priced positions exist.
   */
  totalPnlPct: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// computePortfolioPnl
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute per-position and aggregate P&L given open positions and live prices.
 *
 * Positions without a price in the `prices` map have:
 *   - currentPrice = null
 *   - pnlAmount    = null
 *   - pnlPct       = null
 *
 * They are excluded from the aggregate totals.
 *
 * @param positions - Array of open positions (shares, avgPrice, code).
 * @param prices    - Map of stock code → current price in VND.
 * @returns         - PortfolioPnlResult with per-item and aggregate data.
 */
export function computePortfolioPnl(
  positions: PositionInput[],
  prices: Map<string, number>,
): PortfolioPnlResult {
  if (positions.length === 0) {
    return { items: [], totalPnlAmount: 0, totalPnlPct: 0 };
  }

  let totalPnlAmount = 0;
  let totalPricedCost = 0;

  const items: PositionPnl[] = positions.map((pos) => {
    const currentPrice = prices.get(pos.code) ?? null;
    const costBasis = pos.shares * pos.avgPrice;

    if (currentPrice === null || pos.shares === 0 || costBasis === 0) {
      return {
        code: pos.code,
        shares: pos.shares,
        avgPrice: pos.avgPrice,
        currentPrice,
        pnlAmount: pos.shares === 0 ? 0 : null,
        pnlPct: pos.shares === 0 ? 0 : null,
      };
    }

    const pnlAmount = (currentPrice - pos.avgPrice) * pos.shares;
    const pnlPct = (pnlAmount / costBasis) * 100;

    totalPnlAmount += pnlAmount;
    totalPricedCost += costBasis;

    return {
      code: pos.code,
      shares: pos.shares,
      avgPrice: pos.avgPrice,
      currentPrice,
      pnlAmount,
      pnlPct,
    };
  });

  const totalPnlPct =
    totalPricedCost > 0 ? (totalPnlAmount / totalPricedCost) * 100 : 0;

  return { items, totalPnlAmount, totalPnlPct };
}

// ─────────────────────────────────────────────────────────────────────────────
// formatPnlSection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a VND amount with comma thousand-separators.
 * Uses en-US locale explicitly so output is always comma-separated
 * regardless of the system locale (vi-VN uses dots which differ by env).
 */
function fmtVnd(amount: number): string {
  return Math.abs(Math.round(amount)).toLocaleString("en-US");
}

/** Format P&L amount with sign. e.g. 10_000_000 → "+10,000,000" */
function fmtPnlAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${fmtVnd(amount)}`;
}

/** Format a percentage with sign and 1 decimal place. e.g. 13.333 → "+13.3%" */
function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Produce the Vietnamese-format DANH MUC block for the morning briefing.
 *
 * Returns an empty string when the portfolio is empty (no section rendered).
 *
 * Example output:
 * ```
 * DANH MỤC (2 vị thế)
 *
 * Mã    | SL      | Giá TB    | Giá HT    | Lãi/Lỗ
 * VCB   | 1,000   | 75,000    | 85,000    | +13.3% (+10,000,000)
 * FPT   | 500     | 120,000   | 115,000   | -4.2% (-2,500,000)
 *
 * Tổng: +7,500,000 VND (+5.6%)
 * ```
 *
 * @param result - The PortfolioPnlResult from computePortfolioPnl().
 * @returns       - Formatted string, or "" if no positions.
 */
export function formatPnlSection(result: PortfolioPnlResult): string {
  if (result.items.length === 0) return "";

  const lines: string[] = [
    `DANH MỤC (${result.items.length} vị thế)`,
    "",
    "Mã     | SL        | Giá TB     | Giá HT     | Lãi/Lỗ",
    "-------|-----------|------------|------------|-----------------------------",
  ];

  for (const item of result.items) {
    const slStr = item.shares.toLocaleString("en-US");
    const giaTbStr = fmtVnd(item.avgPrice);
    const giaHtStr = item.currentPrice !== null ? fmtVnd(item.currentPrice) : "N/A";
    const laiLoStr =
      item.pnlAmount !== null && item.pnlPct !== null
        ? `${fmtPct(item.pnlPct)} (${fmtPnlAmount(item.pnlAmount)})`
        : "N/A";

    lines.push(
      `${item.code.padEnd(6)} | ${slStr.padEnd(9)} | ${giaTbStr.padEnd(10)} | ${giaHtStr.padEnd(10)} | ${laiLoStr}`,
    );
  }

  lines.push("");

  const totalAmountStr = fmtPnlAmount(result.totalPnlAmount);
  const totalPctStr = fmtPct(result.totalPnlPct);
  lines.push(`Tổng: ${totalAmountStr} VND (${totalPctStr})`);

  return lines.join("\n");
}
