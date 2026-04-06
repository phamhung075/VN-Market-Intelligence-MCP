/**
 * Task 183 — get_alert_accuracy MCP Tool
 *
 * Interface layer: registers one MCP tool on a McpServer instance.
 *
 * Tool registered:
 *   get_alert_accuracy — retrospective alert accuracy scorer
 *
 * Logic:
 *   1. Query `alerts` table for alerts within `days` lookback period
 *   2. For each alert, extract predicted direction from `signals_json`
 *      (price_drop → expected "down", price_surge → expected "up",
 *       other signal types → neutral / UNKNOWN)
 *   3. Look up actual price change from `market_prices_history`:
 *      price at alert time vs price 1-3 days later
 *   4. Score: correct direction = HIT, wrong = MISS, no data = UNKNOWN
 *
 * Output format (Vietnamese plain text, no Markdown):
 *   Do chinh xac tin hieu (30 ngay)
 *   Tong: 45 | Hit: 28 (62%) | Miss: 12 (27%) | Unknown: 5 (11%)
 *
 *   Phan tich theo loai tin hieu:
 *     price_drop:  70% (21/30)
 *     price_surge: 55% (6/11)
 *   ...
 *
 *   Co phieu chinh xac thap nhat:
 *     VEA: 3 canh bao, 33% chinh xac
 *
 * @module interface/mcp/tools/alertAccuracy
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type AccuracyResult = "HIT" | "MISS" | "UNKNOWN";

/** Direction predicted by the signal */
type PredictedDirection = "up" | "down" | "neutral" | "volatility";

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
}

interface PriceRow {
  price: number;
  fetched_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the predicted market direction from a signal type.
 *
 * price_drop   → down  (bullish bearish: the signal says price will go down)
 * price_surge  → up
 * volume_spike → volatility (any meaningful price move in either direction
 *                counts as a HIT — volume spike predicts movement, not
 *                direction)
 * report_new   → neutral
 * news_mention → neutral (direction unknown without further context)
 */
function signalDirection(signalType: string): PredictedDirection {
  if (signalType === "price_drop") return "down";
  if (signalType === "price_surge") return "up";
  if (signalType === "volume_spike") return "volatility";
  return "neutral";
}

/**
 * Extract signal types from the `signals_json` column.
 * Returns an empty array when the field is null or invalid JSON.
 */
function extractSignalTypes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const types: string[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object" && "type" in item) {
        const t = (item as { type: unknown }).type;
        if (typeof t === "string") types.push(t);
      }
    }
    return types;
  } catch {
    return [];
  }
}

/**
 * Extract the primary stock code from `affected_actions_json`.
 * Returns null when the field is null, invalid, or empty.
 */
function extractPrimaryCode(json: string | null): string | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "code" in first) {
      const code = (first as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Determine the primary predicted direction for an alert by inspecting its
 * signals. The first directional signal (price_drop / price_surge) wins.
 * Falls back to "neutral" when no directional signal is present.
 */
function alertPredictedDirection(signalTypes: string[]): PredictedDirection {
  // Pass 1: prefer concrete directional signals (price_drop / price_surge)
  for (const t of signalTypes) {
    const d = signalDirection(t);
    if (d === "up" || d === "down") return d;
  }
  // Pass 2: fall back to volatility signals (volume_spike)
  for (const t of signalTypes) {
    const d = signalDirection(t);
    if (d === "volatility") return "volatility";
  }
  return "neutral";
}

/**
 * Score one alert against the actual price history.
 *
 * Scoring rules:
 *   - Direction is "neutral" → UNKNOWN (not scoreable)
 *   - No price data at or after alert time → UNKNOWN
 *   - Actual price change aligns with predicted direction → HIT
 *   - Actual price change opposes predicted direction     → MISS
 *   - No meaningful price change (< 0.1%) → UNKNOWN (ambiguous)
 *
 * @param predictedDir - Direction the signal predicted
 * @param alertTime    - ISO 8601 timestamp when the alert was triggered
 * @param code         - Stock ticker to look up in market_prices_history
 * @returns AccuracyResult
 */
function scoreAlert(
  predictedDir: PredictedDirection,
  alertTime: string,
  code: string,
): AccuracyResult {
  if (predictedDir === "neutral") return "UNKNOWN";

  const db = getDb();
  const alertTs = new Date(alertTime).getTime();
  if (Number.isNaN(alertTs)) return "UNKNOWN";

  // Find the price closest to (but after) the alert time
  const priceAtAlert = db
    .prepare<PriceRow, [string, string]>(`
      SELECT price, fetched_at
      FROM market_prices_history
      WHERE code = ? AND fetched_at >= ?
      ORDER BY fetched_at ASC
      LIMIT 1
    `)
    .get(code, alertTime) as PriceRow | undefined;

  if (!priceAtAlert) return "UNKNOWN";

  // Find a price 1-3 days after the alert
  const minLookForward = new Date(alertTs + 1 * 86_400_000).toISOString();
  const maxLookForward = new Date(alertTs + 3 * 86_400_000).toISOString();

  let priceAfter = db
    .prepare<PriceRow, [string, string, string]>(`
      SELECT price, fetched_at
      FROM market_prices_history
      WHERE code = ? AND fetched_at >= ? AND fetched_at <= ?
      ORDER BY fetched_at ASC
      LIMIT 1
    `)
    .get(code, minLookForward, maxLookForward) as PriceRow | undefined;

  // Intraday fallback (task 307 / report #673): when the strict 1-3 day
  // window has no data yet (early-stage deployment, very recent alert),
  // try a 1-12h forward window instead. Trades temporal precision for
  // coverage so accuracy stops being '100% UNKNOWN' on day 1.
  if (!priceAfter) {
    const intradayMin = new Date(alertTs + 1 * 3_600_000).toISOString();
    const intradayMax = new Date(alertTs + 12 * 3_600_000).toISOString();
    priceAfter = db
      .prepare<PriceRow, [string, string, string]>(`
        SELECT price, fetched_at
        FROM market_prices_history
        WHERE code = ? AND fetched_at >= ? AND fetched_at <= ?
        ORDER BY fetched_at ASC
        LIMIT 1
      `)
      .get(code, intradayMin, intradayMax) as PriceRow | undefined;
  }

  if (!priceAfter) return "UNKNOWN";

  const changePct =
    ((priceAfter.price - priceAtAlert.price) / priceAtAlert.price) * 100;

  // Threshold: ignore changes smaller than 0.1% (noise)
  if (Math.abs(changePct) < 0.1) return "UNKNOWN";

  if (predictedDir === "down" && changePct < 0) return "HIT";
  if (predictedDir === "up" && changePct > 0) return "HIT";
  // Volatility predictors (volume_spike) are HIT when ANY meaningful price
  // move follows the alert. They never MISS — only HIT or UNKNOWN — because
  // volume spikes predict movement, not direction.
  if (predictedDir === "volatility") {
    return Math.abs(changePct) >= 0.5 ? "HIT" : "UNKNOWN";
  }
  return "MISS";
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

function formatAccuracyReport(
  days: number,
  actionCodeFilter: string | undefined,
  totalAlerts: number,
  hits: number,
  misses: number,
  unknowns: number,
  signalBreakdown: Map<string, { hit: number; miss: number; unknown: number }>,
  stockBreakdown: Map<string, { hit: number; miss: number; unknown: number }>,
): string {
  if (totalAlerts === 0) {
    const filter = actionCodeFilter ? ` cho ${actionCodeFilter}` : "";
    return `Khong co du lieu de danh gia${filter} trong ${days} ngay qua.`;
  }

  const hitPct = Math.round((hits / totalAlerts) * 100);
  const missPct = Math.round((misses / totalAlerts) * 100);
  const unknownPct = 100 - hitPct - missPct;

  const lines: string[] = [
    `Do chinh xac tin hieu (${days} ngay)`,
    "",
  ];

  if (actionCodeFilter) {
    lines.push(`Co phieu: ${actionCodeFilter}`);
    lines.push("");
  }

  lines.push(
    `Tong: ${totalAlerts} canh bao | Hit: ${hits} (${hitPct}%) | Miss: ${misses} (${missPct}%) | Unknown: ${unknowns} (${unknownPct}%)`,
  );

  // ── Signal type breakdown ─────────────────────────────────────────────────
  if (signalBreakdown.size > 0) {
    lines.push("");
    lines.push("Phan tich theo loai tin hieu:");

    // Sort by scoreable (hit+miss) count descending
    const sorted = [...signalBreakdown.entries()].sort(
      ([, a], [, b]) => b.hit + b.miss - (a.hit + a.miss),
    );

    for (const [sigType, counts] of sorted) {
      const scoreable = counts.hit + counts.miss;
      if (scoreable === 0) {
        lines.push(`  ${sigType}: N/A (${counts.unknown} unknown)`);
      } else {
        const pct = Math.round((counts.hit / scoreable) * 100);
        lines.push(
          `  ${sigType}: ${pct}% (${counts.hit}/${scoreable})`,
        );
      }
    }
  }

  // ── Stock breakdown — worst performers (by accuracy on scoreable) ─────────
  const worstStocks: Array<{ code: string; hit: number; total: number; accuracy: number }> = [];

  for (const [code, counts] of stockBreakdown.entries()) {
    const scoreable = counts.hit + counts.miss;
    if (scoreable === 0) continue;
    const accuracy = Math.round((counts.hit / scoreable) * 100);
    worstStocks.push({ code, hit: counts.hit, total: scoreable, accuracy });
  }

  // Sort ascending by accuracy (worst first)
  worstStocks.sort((a, b) => a.accuracy - b.accuracy);

  if (worstStocks.length > 0) {
    lines.push("");
    lines.push("Co phieu chinh xac thap nhat:");

    const displayCount = Math.min(5, worstStocks.length);
    for (let i = 0; i < displayCount; i++) {
      const s = worstStocks[i]!;
      lines.push(
        `  ${s.code}: ${s.total} canh bao, ${s.accuracy}% chinh xac`,
      );
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_alert_accuracy` MCP tool on the given server instance.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerAlertAccuracyTool(server: McpServer): void {
  server.tool(
    "get_alert_accuracy",
    "Retrospective alert accuracy: compare signals to actual price outcomes. " +
      "Scores each alert as HIT (correct direction), MISS (wrong direction), " +
      "or UNKNOWN (no price data). " +
      "Shows breakdown by signal type and worst-performing stocks.",
    {
      days: z
        .number()
        .optional()
        .default(30)
        .describe("Lookback period in days (default: 30)"),
      actionCode: z
        .string()
        .optional()
        .describe("Filter to a specific stock ticker, e.g. VNM"),
    },
    async ({ days: daysRaw, actionCode }) => {
      const days = daysRaw ?? 30;

      try {
        await initDatabase();
        const db = getDb();

        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        // Build query with optional stock filter
        let query = `
          SELECT id, triggered_at, severity, signals_json, affected_actions_json
          FROM alerts
          WHERE triggered_at >= ?
        `;
        const queryParams: (string | number)[] = [since];

        if (actionCode) {
          query += " AND affected_actions_json LIKE ?";
          queryParams.push(`%${actionCode}%`);
        }

        query += " ORDER BY triggered_at DESC";

        const alertRows = db
          .prepare(query)
          .all(...queryParams) as AlertRow[];

        // ── Score each alert ───────────────────────────────────────────────
        let totalAlerts = 0;
        let hits = 0;
        let misses = 0;
        let unknowns = 0;

        const signalBreakdown = new Map<
          string,
          { hit: number; miss: number; unknown: number }
        >();
        const stockBreakdown = new Map<
          string,
          { hit: number; miss: number; unknown: number }
        >();

        for (const row of alertRows) {
          const signalTypes = extractSignalTypes(row.signals_json);
          const code = extractPrimaryCode(row.affected_actions_json);

          if (!code) continue; // skip alerts without a stock code
          if (actionCode && code !== actionCode) continue;

          const predictedDir = alertPredictedDirection(signalTypes);
          const result = scoreAlert(predictedDir, row.triggered_at, code);

          totalAlerts++;
          if (result === "HIT") hits++;
          else if (result === "MISS") misses++;
          else unknowns++;

          // Update signal breakdown
          const primarySignal = signalTypes[0] ?? "unknown";
          const sigCounts = signalBreakdown.get(primarySignal) ?? { hit: 0, miss: 0, unknown: 0 };
          if (result === "HIT") sigCounts.hit++;
          else if (result === "MISS") sigCounts.miss++;
          else sigCounts.unknown++;
          signalBreakdown.set(primarySignal, sigCounts);

          // Update stock breakdown
          const stockCounts = stockBreakdown.get(code) ?? { hit: 0, miss: 0, unknown: 0 };
          if (result === "HIT") stockCounts.hit++;
          else if (result === "MISS") stockCounts.miss++;
          else stockCounts.unknown++;
          stockBreakdown.set(code, stockCounts);
        }

        const text = formatAccuracyReport(
          days,
          actionCode,
          totalAlerts,
          hits,
          misses,
          unknowns,
          signalBreakdown,
          stockBreakdown,
        );

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[get_alert_accuracy] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tinh toan do chinh xac: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
