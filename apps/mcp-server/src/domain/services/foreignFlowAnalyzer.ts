/**
 * Domain — Foreign Flow Delta Analyzer
 *
 * Detects smart-money entry/exit patterns from daily foreign trading volume history.
 * Uses consecutive direction streaks + cumulative net volume thresholds.
 *
 * Severity levels:
 *   - high:   3+ consecutive days same direction AND total > 100k shares
 *   - medium: 2 consecutive days OR small streak
 *   - low:    no clear direction
 *
 * Layer: domain/services (pure — no I/O)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One day of foreign trading data for a stock. */
export interface DailyForeignFlow {
  code: string;
  date: string;           // ISO date "YYYY-MM-DD"
  foreignVolume: number;  // cumulative foreign volume held
  foreignRoom: number;    // remaining foreign room
  holdingRatio: number | null;  // e.g. 0.30 = 30% foreign ownership; null = absent (VPS API does not return this field)
}

/** Severity matching existing domain convention (lowercase). */
export type FlowSeverity = "low" | "medium" | "high";

/** Result of foreign flow analysis. */
export interface ForeignFlowSignal {
  code: string;
  netFlowDirection: "net_buy" | "net_sell" | "neutral";
  consecutiveDays: number;
  totalNetVolume3d: number;  // sum of net volume deltas over last 3 days
  totalNetVolume5d: number;  // sum of net volume deltas over last 5 days
  holdingRatioChange5d: number | null;  // latest holdingRatio minus 5-day-ago holdingRatio; null when holding data is absent
  /** true when all holding_ratio values are null or 0 (absent per DSI invariant — VPS API does not return this field) */
  is_holding_ratio_fabricated: boolean;
  severity: FlowSeverity;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_VOLUME_THRESHOLD = 100_000;   // shares — triggers HIGH severity
const HIGH_STREAK_THRESHOLD = 3;         // consecutive days — triggers HIGH severity

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Analyze foreign flow patterns from daily history.
 *
 * @param history - Daily foreign flow entries sorted by date DESC (most recent first).
 *                  Must have at least 2 entries to compute deltas.
 * @returns ForeignFlowSignal or null if insufficient data.
 */
export function analyzeForeignFlow(
  history: DailyForeignFlow[],
): ForeignFlowSignal | null {
  if (history.length < 2) return null;

  // history[0] is guaranteed by the length check above
  const first = history[0]!;
  const code = first.code;

  // --- Compute daily deltas (positive = net buy, negative = net sell) ---
  // history[0] is most recent, history[1] is previous day
  const deltas: number[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    const curr = history[i]!;
    const prev = history[i + 1]!;
    deltas.push(curr.foreignVolume - prev.foreignVolume);
  }

  // --- Consecutive streak counting (from most recent day backwards) ---
  // deltas.length >= 1 because history.length >= 2
  const firstDelta = deltas[0] ?? 0;
  const firstDirection = firstDelta > 0 ? "buy" : firstDelta < 0 ? "sell" : "flat";
  let consecutiveDays = 0;

  if (firstDirection !== "flat") {
    consecutiveDays = 1;
    for (let i = 1; i < deltas.length; i++) {
      const d = deltas[i] ?? 0;
      const dir = d > 0 ? "buy" : d < 0 ? "sell" : "flat";
      if (dir === firstDirection) {
        consecutiveDays++;
      } else {
        break;
      }
    }
  }

  // --- Net volume sums ---
  const totalNetVolume3d = deltas.slice(0, Math.min(3, deltas.length)).reduce((a, b) => a + b, 0);
  const totalNetVolume5d = deltas.slice(0, Math.min(5, deltas.length)).reduce((a, b) => a + b, 0);

  // --- Holding ratio change over 5 days ---
  // history[0] = today, history[5] = 5 days ago (if available)
  // is_holding_ratio_fabricated = true when all holdingRatio values are absent (null or 0).
  // VPS API bgapidatafeed.vps.com.vn does NOT return holding_ratio — DSI invariant.
  // null = genuinely absent (canonical after vnstockStore.ts fix); 0 = legacy fabricated fallback.
  const isHoldingRatioFabricated = history.every((r) => r.holdingRatio === null || r.holdingRatio === 0);
  const latest = history[0]!;
  const oldest5d = history.length >= 6 ? history[5]! : history[history.length - 1]!;
  // null when absent — never compute a delta off null values
  const holdingRatioChange5d: number | null = isHoldingRatioFabricated
    ? null
    : (latest.holdingRatio ?? 0) - (oldest5d.holdingRatio ?? 0);

  // --- Determine direction ---
  let netFlowDirection: "net_buy" | "net_sell" | "neutral";
  if (consecutiveDays >= HIGH_STREAK_THRESHOLD && firstDirection !== "flat") {
    netFlowDirection = firstDirection === "buy" ? "net_buy" : "net_sell";
  } else if (Math.abs(totalNetVolume3d) >= HIGH_VOLUME_THRESHOLD) {
    netFlowDirection = totalNetVolume3d > 0 ? "net_buy" : "net_sell";
  } else if (consecutiveDays >= 2 && firstDirection !== "flat") {
    netFlowDirection = firstDirection === "buy" ? "net_buy" : "net_sell";
  } else {
    netFlowDirection = "neutral";
  }

  // --- Severity ---
  const absoluteNet3d = Math.abs(totalNetVolume3d);
  let severity: FlowSeverity = "low";

  if (
    consecutiveDays >= HIGH_STREAK_THRESHOLD &&
    absoluteNet3d >= HIGH_VOLUME_THRESHOLD
  ) {
    severity = "high";
  } else if (consecutiveDays >= 2 || absoluteNet3d >= HIGH_VOLUME_THRESHOLD / 2) {
    severity = "medium";
  }

  // --- Reasoning ---
  let reasoning: string;
  if (severity === "high" && netFlowDirection === "net_buy") {
    reasoning = `smart money accumulation: ${consecutiveDays} consecutive net buy days, total +${formatVol(absoluteNet3d)} shares (3d)`;
  } else if (severity === "high" && netFlowDirection === "net_sell") {
    reasoning = `smart money exit: ${consecutiveDays} consecutive net sell days, total -${formatVol(absoluteNet3d)} shares (3d)`;
  } else if (netFlowDirection === "net_buy") {
    reasoning = `net buy trend: ${consecutiveDays} days, +${formatVol(Math.abs(totalNetVolume3d))} shares (3d)`;
  } else if (netFlowDirection === "net_sell") {
    reasoning = `net sell pressure: ${consecutiveDays} days, -${formatVol(Math.abs(totalNetVolume3d))} shares (3d)`;
  } else {
    reasoning = `neutral: no clear directional pattern (3d net: ${totalNetVolume3d > 0 ? "+" : ""}${formatVol(totalNetVolume3d)})`;
  }

  if (holdingRatioChange5d !== null && Math.abs(holdingRatioChange5d) > 0.005) {
    const pctChange = (holdingRatioChange5d * 100).toFixed(2);
    reasoning += `; foreign ownership ${holdingRatioChange5d > 0 ? "up" : "down"} ${Math.abs(parseFloat(pctChange))}% over 5d`;
  }

  return {
    code,
    netFlowDirection,
    consecutiveDays,
    totalNetVolume3d,
    totalNetVolume5d,
    holdingRatioChange5d,
    is_holding_ratio_fabricated: isHoldingRatioFabricated,
    severity,
    reasoning,
  };
}

function formatVol(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}k`;
  return String(Math.round(vol));
}
