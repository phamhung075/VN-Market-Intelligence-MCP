/**
 * Domain Service — Portfolio Rebalancing Calculator
 *
 * Pure business logic: given current positions, target weights, and total
 * portfolio value, computes exact share quantities to buy or sell in order
 * to reach the target allocation.
 *
 * Layer: domain/services (zero I/O — no SQLite, no HTTP)
 *
 * Key decisions:
 *   - Drift tolerance: ±0.5% — positions within this band are marked GIU NGUYEN
 *     to avoid excessive micro-trading on negligible imbalances.
 *   - sharesNeeded is always rounded to a whole integer (fractional shares are
 *     not traded on Vietnamese exchanges).
 *   - amountVnd = abs(sharesNeeded) * currentPrice (gross transaction value, VND).
 *
 * All monetary values in VND (dong), NOT million VND, because share prices and
 * counts are expressed at real-world granularity.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** One position in the investor's current portfolio. */
export interface Position {
  /** Stock ticker (e.g. "VCB") */
  code: string;
  /** Number of shares currently held */
  shares: number;
  /** Current market price per share in VND */
  currentPrice: number;
}

/**
 * The rebalancing recommendation for one position.
 *
 * All weight values are percentages (0–100).
 * amountVnd is the gross transaction value in VND.
 */
export interface RebalanceAction {
  /** Stock ticker */
  code: string;
  /** Current weight as % of total portfolio value */
  currentWeight: number;
  /** Target weight as % of total portfolio value */
  targetWeight: number;
  /** currentWeight − targetWeight (positive = overweight, negative = underweight) */
  drift: number;
  /** Recommended action */
  action: "MUA THEM" | "BAN BOT" | "GIU NGUYEN";
  /**
   * Number of shares to trade.
   * Positive → buy, negative → sell, 0 → hold.
   * Always an integer (whole shares only).
   */
  sharesNeeded: number;
  /** Gross transaction value in VND (abs(sharesNeeded) * currentPrice) */
  amountVnd: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum drift (in percentage points) before a rebalance action is triggered.
 * Positions within this band are classified as GIU NGUYEN.
 */
const DRIFT_TOLERANCE_PCT = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Core calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute rebalancing actions for a portfolio.
 *
 * @param positions          - Current holdings (code, shares, currentPrice)
 * @param targetWeights      - Target allocation weights: code → % (0–100)
 * @param totalPortfolioValue - Total portfolio value in VND (used to compute
 *                             target monetary amounts per stock)
 * @returns Array of RebalanceAction, one per position, sorted by abs(drift) desc.
 */
export function computeRebalancing(
  positions: Position[],
  targetWeights: Map<string, number>,
  totalPortfolioValue: number,
): RebalanceAction[] {
  if (positions.length === 0) return [];

  const actions: RebalanceAction[] = [];

  for (const pos of positions) {
    const marketValue = pos.shares * pos.currentPrice;

    // Current weight as %
    const currentWeight =
      totalPortfolioValue > 0
        ? (marketValue / totalPortfolioValue) * 100
        : 0;

    // Target weight from caller-supplied map; defaults to 0 if not found
    const targetWeight = targetWeights.get(pos.code) ?? 0;

    // Signed drift: positive → overweight, negative → underweight
    const drift = currentWeight - targetWeight;

    let action: RebalanceAction["action"];
    let sharesNeeded: number;

    if (Math.abs(drift) <= DRIFT_TOLERANCE_PCT) {
      // Within tolerance — hold
      action = "GIU NGUYEN";
      sharesNeeded = 0;
    } else {
      // Target monetary value for this position
      const targetValue = (targetWeight / 100) * totalPortfolioValue;
      // Delta in VND (negative = need to sell, positive = need to buy)
      const deltaVnd = targetValue - marketValue;

      // Convert to whole shares (round toward zero to avoid over-trading)
      sharesNeeded =
        pos.currentPrice > 0
          ? Math.trunc(deltaVnd / pos.currentPrice)
          : 0;

      if (sharesNeeded > 0) {
        action = "MUA THEM";
      } else if (sharesNeeded < 0) {
        action = "BAN BOT";
      } else {
        // delta was non-zero but rounds to 0 shares → hold
        action = "GIU NGUYEN";
      }
    }

    const amountVnd = Math.abs(sharesNeeded) * pos.currentPrice;

    actions.push({
      code: pos.code,
      currentWeight,
      targetWeight,
      drift,
      action,
      sharesNeeded,
      amountVnd,
    });
  }

  // Sort by absolute drift descending (biggest imbalance first)
  actions.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return actions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a rebalancing result as a plain-text Vietnamese report.
 *
 * Example output:
 * ```
 * Tai can bang danh muc
 *
 * Ma    | Hien tai | Muc tieu | Lech    | Hanh dong
 * VCB   | 41.46%   | 40.00%   | +1.46%  | BAN BOT 14 cp (~1,190,000 VND)
 * FPT   | 29.27%   | 30.00%   | -0.73%  | MUA THEM 6 cp (~720,000 VND)
 * HPG   | 29.27%   | 30.00%   | -0.73%  | MUA THEM 24 cp (~720,000 VND)
 *
 * Tong gia tri danh muc: 20,500,000 VND
 * ```
 *
 * @param actions            - Output of computeRebalancing()
 * @param totalPortfolioValue - Total portfolio value in VND
 * @returns Formatted plain-text report (no markdown, no diacritics)
 */
export function formatRebalancingReport(
  actions: RebalanceAction[],
  totalPortfolioValue: number,
): string {
  const lines: string[] = [];

  lines.push("Tai can bang danh muc");
  lines.push("");

  // Column header
  lines.push(
    padRight("Ma", 6) +
      "| " +
      padRight("Hien tai", 10) +
      "| " +
      padRight("Muc tieu", 10) +
      "| " +
      padRight("Lech", 9) +
      "| Hanh dong",
  );

  lines.push("-".repeat(70));

  for (const a of actions) {
    const currentStr = `${a.currentWeight.toFixed(2)}%`;
    const targetStr = `${a.targetWeight.toFixed(2)}%`;
    const driftSign = a.drift >= 0 ? "+" : "";
    const driftStr = `${driftSign}${a.drift.toFixed(2)}%`;

    let actionStr: string;
    if (a.action === "GIU NGUYEN") {
      actionStr = "GIU NGUYEN";
    } else {
      const absShares = Math.abs(a.sharesNeeded);
      const amtFmt = a.amountVnd.toLocaleString("en-US");
      actionStr = `${a.action} ${absShares} cp (~${amtFmt} VND)`;
    }

    lines.push(
      padRight(a.code, 6) +
        "| " +
        padRight(currentStr, 10) +
        "| " +
        padRight(targetStr, 10) +
        "| " +
        padRight(driftStr, 9) +
        "| " +
        actionStr,
    );
  }

  lines.push("");
  lines.push(
    `Tong gia tri danh muc: ${totalPortfolioValue.toLocaleString("en-US")} VND`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function padRight(s: string, width: number): string {
  return s.length >= width ? s + " " : s.padEnd(width);
}
