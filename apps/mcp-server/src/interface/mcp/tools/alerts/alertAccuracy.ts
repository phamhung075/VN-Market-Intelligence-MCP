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
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { writeAlertOutcome } from "../../../../infrastructure/db/alertStore.js";
import type { AlertOutcome } from "../../../../infrastructure/db/alertStore.js";
import {
  classifyAlertType,
  scoreAlertOutcome,
} from "../../../../domain/services/alertOutcomeScorer.js";
import type { PricePoint } from "../../../../domain/services/alertOutcomeScorer.js";

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
  // Task 1847d-A: outcome columns (NULL when not yet scored)
  outcome: string | null;
  outcome_at: string | null;
  outcome_detail: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Output formatter
// ─────────────────────────────────────────────────────────────────────────────

/** Structured accuracy report (task 1847d-D) */
export interface AccuracyReport {
  /** Human-readable text report */
  text: string;
  /** HIT/MISS/UNKNOWN counts grouped by primary signal type */
  summary_by_type: Record<string, { hit: number; miss: number; unknown: number }>;
  /** Percentage (0-100) of alerts in the window that have a non-null outcome */
  scored_pct: number;
  total: number;
  hits: number;
  misses: number;
  unknowns: number;
  /** True when scoreable (hits+misses) < 20 — not enough data to trust the % */
  insufficientSample: boolean;
  /**
   * ALT-FUNC-02 FIX: top-level aggregate accuracy rate in [0,1] range.
   * null when no scoreable data (hits+misses === 0).
   * Calculated as hits / (hits + misses).
   */
  accuracy_rate: number | null;
}

/**
 * Format accuracy report from pre-scored alert rows.
 * Exported for testability (task 1411, updated task 1847d-D).
 *
 * Path 1 (fast): when `outcome` column is non-null → use it directly.
 * Path 2 (fallback): when `outcome` IS NULL → on-the-fly price comparison.
 *
 * @param rows   - AlertRow array (empty → no-data message)
 * @param days   - Lookback window echoed in header
 * @param filter - Optional stock code filter
 */
export function formatAccuracyReport(
  rows: AlertRow[],
  days: number,
  filter?: string,
): AccuracyReport {
  const emptyReport = (msg: string): AccuracyReport => ({
    text: msg,
    summary_by_type: {},
    scored_pct: 0,
    total: 0,
    hits: 0,
    misses: 0,
    unknowns: 0,
    insufficientSample: false,
    accuracy_rate: null,
  });

  if (rows.length === 0) {
    const filterSuffix = filter ? ` cho ${filter}` : "";
    return emptyReport(`Không có dữ liệu để đánh giá${filterSuffix} trong ${days} ngày qua.`);
  }

  let totalAlerts = 0;
  let hits = 0;
  let misses = 0;
  let unknowns = 0;
  // Track how many rows have a pre-scored outcome column
  let scoredFromDb = 0;
  const signalBreakdown = new Map<string, { hit: number; miss: number; unknown: number }>();
  const stockBreakdown = new Map<string, { hit: number; miss: number; unknown: number }>();

  for (const row of rows) {
    const signalTypes = extractSignalTypes(row.signals_json);
    const code = extractPrimaryCode(row.affected_actions_json);
    if (!code) continue;
    if (filter && code !== filter) continue;

    let result: AccuracyResult;

    // ── Path 1: use pre-scored outcome column when available ──────────────
    if (row.outcome !== null && row.outcome !== undefined) {
      const o = row.outcome.toUpperCase();
      result = (o === "HIT" || o === "MISS") ? (o as AccuracyResult) : "UNKNOWN";
      scoredFromDb++;
    } else {
      // ── Path 2: domain scorer (AC-1) ──────────────────────────────────
      const db = getDb();
      const alertTs = new Date(row.triggered_at).getTime();
      const calendarDaysElapsed = Number.isNaN(alertTs)
        ? 0
        : Math.floor((Date.now() - alertTs) / 86_400_000);

      const classification = classifyAlertType(row.signals_json, null);

      // Fetch first price at/after alert time (must be in the past — no future timestamps)
      const priceAtAlertRow = Number.isNaN(alertTs)
        ? undefined
        : (db
            .prepare<PriceRow, [string, string]>(`
              SELECT price, fetched_at
              FROM market_prices_history
              WHERE code = ? AND fetched_at >= ? AND fetched_at <= datetime('now')
              ORDER BY fetched_at ASC
              LIMIT 1
            `)
            .get(code, row.triggered_at) as PriceRow | undefined);
      const alertPrice = priceAtAlertRow?.price ?? null;

      // Fetch window prices AFTER the alert baseline price (exclusive start) and
      // within evalWindowDays, capped at now — no future timestamps.
      const windowStart = priceAtAlertRow?.fetched_at ?? row.triggered_at;
      const windowEnd = Number.isNaN(alertTs)
        ? row.triggered_at
        : new Date(alertTs + classification.evalWindowDays * 86_400_000).toISOString();
      const windowRows = Number.isNaN(alertTs) || !priceAtAlertRow
        ? []
        : (db
            .prepare<PriceRow, [string, string, string]>(`
              SELECT price, fetched_at
              FROM market_prices_history
              WHERE code = ? AND fetched_at > ? AND fetched_at <= min(?, datetime('now'))
              ORDER BY fetched_at ASC
            `)
            .all(code, windowStart, windowEnd) as PriceRow[]);
      const windowPrices: PricePoint[] = windowRows.map((r) => ({
        price: r.price,
        fetchedAt: r.fetched_at,
      }));

      const domainResult = scoreAlertOutcome(
        classification,
        alertPrice,
        windowPrices,
        calendarDaysElapsed,
      );
      const o = domainResult.outcome.toUpperCase();
      result = (o === "HIT" || o === "MISS") ? (o as AccuracyResult) : "UNKNOWN";
    }

    totalAlerts++;
    if (result === "HIT") hits++;
    else if (result === "MISS") misses++;
    else unknowns++;

    const primarySignal = signalTypes[0] ?? "unknown";
    const sigCounts = signalBreakdown.get(primarySignal) ?? { hit: 0, miss: 0, unknown: 0 };
    if (result === "HIT") sigCounts.hit++;
    else if (result === "MISS") sigCounts.miss++;
    else sigCounts.unknown++;
    signalBreakdown.set(primarySignal, sigCounts);

    const stockCounts = stockBreakdown.get(code) ?? { hit: 0, miss: 0, unknown: 0 };
    if (result === "HIT") stockCounts.hit++;
    else if (result === "MISS") stockCounts.miss++;
    else stockCounts.unknown++;
    stockBreakdown.set(code, stockCounts);
  }

  if (totalAlerts === 0) {
    const filterSuffix = filter ? ` cho ${filter}` : "";
    return emptyReport(`Không có dữ liệu để đánh giá${filterSuffix} trong ${days} ngày qua.`);
  }

  const scoreable = hits + misses;
  const insufficientSample = scoreable < 20;
  const hitPct = scoreable === 0 ? 0 : Math.round((hits / scoreable) * 100);
  const missPct = scoreable === 0 ? 0 : Math.round((misses / scoreable) * 100);
  const unknownPct = 100 - hitPct - missPct;

  const lines: string[] = [];

  // AC-4: prepend warning when sample is too small to trust %
  if (insufficientSample) {
    lines.push(`Chua du du lieu danh gia (N=${scoreable}, can ≥20)`);
    lines.push("");
  }

  lines.push(`Độ chính xác tín hiệu (${days} ngày)`);
  lines.push("");

  if (filter) {
    lines.push(`Cổ phiếu: ${filter}`);
    lines.push("");
  }

  if (insufficientSample) {
    // Skip accuracy % line — sample too small
    lines.push(
      `Tổng: ${totalAlerts} cảnh báo | Hit: ${hits} | Miss: ${misses} | Unknown: ${unknowns}`,
    );
  } else {
    lines.push(
      `Tổng: ${totalAlerts} cảnh báo | Hit: ${hits} (${hitPct}%) | Miss: ${misses} (${missPct}%) | Unknown: ${unknowns} (${unknownPct}%)`,
    );
  }

  // ── Signal type breakdown and worst stocks — only when sample is sufficient ─
  if (!insufficientSample) {
    if (signalBreakdown.size > 0) {
      lines.push("");
      lines.push("Phân tích theo loại tín hiệu:");

      const sorted = [...signalBreakdown.entries()].sort(
        ([, a], [, b]) => b.hit + b.miss - (a.hit + a.miss),
      );

      for (const [sigType, counts] of sorted) {
        const sigScoreable = counts.hit + counts.miss;
        if (sigScoreable === 0) {
          lines.push(`  ${sigType}: N/A (${counts.unknown} unknown)`);
        } else {
          const pct = Math.round((counts.hit / sigScoreable) * 100);
          lines.push(`  ${sigType}: ${pct}% (${counts.hit}/${sigScoreable})`);
        }
      }
    }

    // ── Stock breakdown — worst performers ─────────────────────────────────
    const worstStocks: Array<{ code: string; hit: number; total: number; accuracy: number }> = [];

    for (const [code, counts] of stockBreakdown.entries()) {
      const stockScoreable = counts.hit + counts.miss;
      if (stockScoreable === 0) continue;
      const accuracy = Math.round((counts.hit / stockScoreable) * 100);
      worstStocks.push({ code, hit: counts.hit, total: stockScoreable, accuracy });
    }

    worstStocks.sort((a, b) => a.accuracy - b.accuracy);

    if (worstStocks.length > 0) {
      lines.push("");
      lines.push("Cổ phiếu chính xác thấp nhất:");

      const displayCount = Math.min(5, worstStocks.length);
      for (let i = 0; i < displayCount; i++) {
        const s = worstStocks[i]!;
        lines.push(`  ${s.code}: ${s.total} cảnh báo, ${s.accuracy}% chính xác`);
      }
    }
  }

  // scored_pct: fraction of rows in the window with non-null outcome column
  const scored_pct =
    rows.length > 0 ? Math.round((scoredFromDb / rows.length) * 100) : 0;

  // summary_by_type: convert signalBreakdown map to plain object
  const summary_by_type: Record<string, { hit: number; miss: number; unknown: number }> = {};
  for (const [sigType, counts] of signalBreakdown.entries()) {
    summary_by_type[sigType] = counts;
  }

  // ALT-FUNC-02 FIX: aggregate accuracy_rate = hits / (hits + misses), null when no data.
  const accuracy_rate = scoreable > 0 ? hits / scoreable : null;

  return {
    text: lines.join("\n"),
    summary_by_type,
    scored_pct,
    total: totalAlerts,
    hits,
    misses,
    unknowns,
    insufficientSample,
    accuracy_rate,
  };
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
      days: z.coerce
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
        // Task 1847d-D: include outcome columns for Path 1 (fast) scoring
        let query = `
          SELECT id, triggered_at, severity, signals_json, affected_actions_json,
                 outcome, outcome_at, outcome_detail
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

        // ── Score each alert (2-path: DB column or on-the-fly) ────────────
        const report = formatAccuracyReport(alertRows, days, actionCode);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
        };
      } catch (err) {
        console.error("[get_alert_accuracy] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính toán độ chính xác: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}

/**
 * Register the `mark_alert_outcome` MCP tool on the given server instance.
 *
 * Allows Alert Commander (or any caller) to manually record the outcome of an
 * alert as HIT, MISS, or UNKNOWN.  Validates alert existence before writing.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerMarkAlertOutcomeTool(server: McpServer): void {
  server.tool(
    "mark_alert_outcome",
    "Post-hoc scoring: writes HIT/MISS/UNKNOWN to the SQLite alerts table (market.db), " +
      "updating outcome/outcome_at/outcome_detail on an existing alert row. " +
      "Lifecycle distinction: write_alert_verdict fires at alert creation time (writes a pending " +
      "row to alert-verdicts JSON file); mark_alert_outcome is called post-hoc after the real " +
      "price outcome is known. These two tools operate on separate stores and separate lifecycles — " +
      "do NOT confuse them. Package destination: ops/alert-commander. " +
      "Used by Alert Commander after verifying whether the predicted direction materialised.",
    {
      alert_id: z.string().describe("The ID of the alert to score"),
      outcome: z
        .enum(["HIT", "MISS", "UNKNOWN"])
        .describe("Outcome of the alert: HIT (correct), MISS (wrong), UNKNOWN"),
      detail: z
        .string()
        .optional()
        .describe("Optional explanation, e.g. 'Price dropped 3.2% next day'"),
    },
    async ({ alert_id, outcome, detail }) => {
      try {
        await initDatabase();
        const db = getDb();

        // Explicit outcome validation (defense-in-depth beyond Zod)
        const validOutcomes: AlertOutcome[] = ["HIT", "MISS", "UNKNOWN"];
        if (!validOutcomes.includes(outcome as AlertOutcome)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: `Invalid outcome value: "${outcome}". Must be HIT, MISS, or UNKNOWN.`,
                }),
              },
            ],
          };
        }

        // Validate alert exists
        const existing = db
          .prepare<{ id: string; outcome: string | null }, [string]>(
            "SELECT id, outcome FROM alerts WHERE id = ? LIMIT 1",
          )
          .get(alert_id);

        if (!existing) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  error: `Alert ID not found: ${alert_id}`,
                }),
              },
            ],
          };
        }

        const result = writeAlertOutcome(
          alert_id,
          outcome as AlertOutcome,
          detail,
          db,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                alert_id,
                outcome,
                already_scored: result.alreadyScored,
                message: result.alreadyScored
                  ? `Alert was already scored — outcome updated to ${outcome}`
                  : `Outcome recorded: ${outcome}`,
              }),
            },
          ],
        };
      } catch (err) {
        console.error("[mark_alert_outcome] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: (err as Error).message,
              }),
            },
          ],
        };
      }
    },
  );
}
