/**
 * Decision Note Synthesizer — Domain Service
 *
 * Produces deterministic, rule-based Vietnamese action recommendations
 * and formatted P&L display lines for the portfolio conviction dashboard.
 *
 * All logic is pure (no I/O). The module is consumed by the
 * `get_portfolio_conviction` MCP tool (task 180).
 *
 * Decision rules:
 *   conviction >= 0.8 AND pnlPct > 0       → THEM VAO     (Add more)
 *   0.6 <= conviction < 0.8                → GIU NGUYEN   (Hold)
 *   0.4 <= conviction < 0.6 AND pnlPct < -5 → XEM XET GIAM (Consider reducing)
 *   conviction < 0.4 OR pnlPct < -10       → GIAM BOT     (Reduce position)
 *   pnlPct is null (no position)           → CHUA CO VI THE
 *
 * Note: conviction score is on the [0, 1] scale from convictionScorer.ts.
 *
 * @module domain/services/decisionNoteSynthesizer
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input for building a P&L display line. Pass null when no position exists. */
export interface PositionLineInput {
  shares: number;
  /** Average purchase price in VND */
  avgPrice: number;
  /** Latest market price in VND */
  currentPrice: number;
  /** Unrealized P&L percentage */
  pnlPct: number;
}

/** Input for the action note decision rules. */
export interface ActionNoteInput {
  /** Conviction score from convictionScorer.ts, range [0, 1] */
  convictionScore: number;
  /** Unrealized P&L percentage. null = no position data. */
  pnlPct: number | null;
  /** Overall market direction from conviction scoring */
  direction: "bullish" | "bearish" | "neutral";
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPositionLine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format the P&L display line for the portfolio dashboard.
 *
 * Returns "CHƯA CÓ VỊ THẾ" when called with null.
 *
 * Example output:
 *   "Vị thế: 1,000 cổ phiếu @ 75,000 | Giá hiện tại: 85,000 | Lãi/Lỗ: +13.33%"
 *
 * @param input - Position data, or null if no position exists.
 */
export function buildPositionLine(input: PositionLineInput | null): string {
  if (input === null) {
    return "CHƯA CÓ VỊ THẾ";
  }

  const { shares, avgPrice, currentPrice, pnlPct } = input;

  const sharesStr = shares.toLocaleString("en-US");
  const avgStr = Math.round(avgPrice).toLocaleString("en-US");
  const curStr = Math.round(currentPrice).toLocaleString("en-US");
  const sign = pnlPct >= 0 ? "+" : "";
  const pnlStr = `${sign}${pnlPct.toFixed(2)}%`;

  return `Vị thế: ${sharesStr} cổ phiếu @ ${avgStr} | Giá hiện tại: ${curStr} | Lãi/Lỗ: ${pnlStr}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildActionNote
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a deterministic Vietnamese action recommendation.
 *
 * The note always begins with "Khuyến nghị: " followed by the action keyword.
 *
 * Rules evaluated in priority order:
 *   1. No position data                          → CHƯA CÓ VỊ THẾ
 *   2. pnlPct < -10                              → GIẢM BỚT (stop-loss)
 *   3. conviction < 0.4                          → GIẢM BỚT (low confidence)
 *   4. conviction >= 0.8 AND pnlPct > 0          → THÊM VÀO
 *   5. 0.4 <= conviction < 0.6 AND pnlPct < -5  → XEM XÉT GIẢM
 *   6. default (0.6 <= conviction < 0.8, or
 *               0.4-0.6 with pnlPct >= -5)       → GIỮ NGUYÊN
 *
 * @param input - Conviction score, P&L percentage, and direction.
 */
export function buildActionNote(input: ActionNoteInput): string {
  const { convictionScore, pnlPct, direction } = input;

  // Rule 1: No position data
  if (pnlPct === null) {
    return "Khuyến nghị: CHƯA CÓ VỊ THẾ";
  }

  // Rule 2: Hard stop-loss — deep loss triggers reduction regardless of conviction
  if (pnlPct < -10) {
    return "Khuyến nghị: GIẢM BỚT";
  }

  // Rule 3: Low conviction — signals are too noisy to trust
  if (convictionScore < 0.4) {
    return "Khuyến nghị: GIẢM BỚT";
  }

  // Rule 4: High conviction + positive P&L → add to position
  if (convictionScore >= 0.8 && pnlPct > 0) {
    return "Khuyến nghị: THÊM VÀO";
  }

  // Rule 5: Moderate conviction + moderate loss → consider reducing
  if (convictionScore >= 0.4 && convictionScore < 0.6 && pnlPct < -5) {
    return "Khuyến nghị: XEM XÉT GIẢM";
  }

  // Rule 6: Default — hold position
  // Covers: 0.6 <= conviction < 0.8 (any P&L)
  //         0.8+ conviction with pnlPct <= 0
  //         0.4-0.6 with pnlPct >= -5
  void direction; // direction available for future extension
  return "Khuyến nghị: GIỮ NGUYÊN";
}
