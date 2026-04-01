/**
 * Assemble Morning Briefing — Task 101 (Application Layer)
 *
 * Orchestrates a complete daily digest before Vietnamese market open (08:00 GMT+7):
 *   1. Best-effort pollNews() — fresh data, failure does not abort
 *   2. Best-effort fetchVnIndex() — VN-Index snapshot, null on failure
 *   3. Query rag_analyses for top 5 stories since midnight GMT+7
 *   4. Query alerts for unread alerts from the last 12 hours
 *   5. Query watchlist for tracked stocks (with market_prices join)
 *   6. Query financial_reports for new reports since midnight GMT+7
 *   7. Persist briefing to ./data/briefings/YYYY-MM-DD.json
 *   8. Return the structured DailyBriefing object
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../infrastructure/logger.js";
import type { BriefingPredictionSignal } from "../../infrastructure/db/predictionStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** One top story from rag_analyses. */
export interface TopStory {
  title: string;
  level: string;
  sentiment: string;
  impactScore: number;
}

/** A condensed alert entry for the briefing. */
export interface BriefingAlert {
  severity: string;
  message: string;
  /** Stock codes affected by this alert */
  stocks: string[];
}

/** One watchlist entry for the briefing. */
export interface WatchlistEntry {
  code: string;
  domain: string;
  /** Current price in VND, if available */
  price?: number;
  /** Percentage change from previous close, if available */
  changePct?: number;
}

/** One new financial report since midnight. */
export interface NewReport {
  code: string;
  period: string;
}

/** VN-Index snapshot. */
export interface VnIndexSnapshot {
  price: number;
  changePct: number;
}

/** Macro indicator status for the briefing dashboard. */
export interface MacroIndicator {
  name: string;
  value: number;
  unit: string;
  /** σ-based status (e.g., "bình thường", "cao bất thường +2.3σ") */
  status: string;
}

/**
 * Structured daily market digest.
 *
 * Produced by `assembleBriefing()` and persisted to
 * `./data/briefings/YYYY-MM-DD.json` (overwrites on re-run).
 */
export interface DailyBriefing {
  /** Date of the briefing in Vietnam timezone, YYYY-MM-DD */
  date: string;
  /** VN-Index snapshot; undefined if fetch failed */
  vnIndex?: VnIndexSnapshot;
  /** Top 5 stories from rag_analyses since midnight, sorted by impact_score DESC */
  topStories: TopStory[];
  /** Unread alerts from the last 12 hours */
  alerts: BriefingAlert[];
  /** All watchlist stocks with last-known price */
  watchlistSummary: WatchlistEntry[];
  /** Stock codes with new financial_reports since midnight */
  newReports: NewReport[];
  /** Macro dashboard: key indicators with σ-based status */
  macroSnapshot: MacroIndicator[];
  /** Sensitive dates / upcoming events affecting the market */
  sensitiveWarnings: string[];
  /** Auto-tracked commodity indicators discovered from news */
  trackedCommodities: { indicator: string; value: number; unit: string; dataPoints: number }[];
  /** Unresolved HIGH/CRITICAL alerts from previous session (not yet read) */
  unresolvedAlerts: BriefingAlert[];
  /** Top conviction signal — cross-validated strongest signal for today */
  topConviction: { code: string; score: number; direction: string; summary: string } | null;
  /** HIGH/CRITICAL prediction market signals from the last 24h (crowd-sourced early warnings) */
  predictionSignals: BriefingPredictionSignal[];
  /** ISO 8601 timestamp when this briefing was generated */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injectable options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable dependencies for testability.
 *
 * @param db              - SQLite Database (defaults to getDb())
 * @param pollNewsFn      - Override for pollNews (best-effort, errors are caught)
 * @param fetchVnIndexFn  - Override for VN-Index fetch (best-effort, errors are caught)
 * @param briefingsDir    - Override output directory (defaults to ./data/briefings)
 */
export interface AssembleBriefingOptions {
  db?: Database;
  pollNewsFn?: () => Promise<unknown>;
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>;
  briefingsDir?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface RagRow {
  source_title: string | null;
  level: string;
  sentiment: string | null;
  impact_score: number | null;
}

interface AlertRow {
  severity: string;
  message: string | null;
  affected_actions_json: string | null;
}

interface WatchlistRow {
  code: string;
  domain: string;
  price: number | null;
  change_pct: number | null;
}

interface FinancialReportRow {
  action_code: string;
  period_type: string | null;
  period_year: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns midnight today in Vietnam timezone (UTC+7) as an ISO 8601 string
 * (in UTC, so e.g. "2026-03-27T17:00:00.000Z" for Vietnam date 2026-03-28).
 */
function midnightVietnamAsUtc(): string {
  const now = new Date();
  // Shift to Vietnam clock
  const vnNow = new Date(now.getTime() + 7 * 3600_000);
  // Construct midnight in Vietnam as UTC
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) -
      7 * 3600_000,
  );
  return midnight.toISOString();
}

/**
 * Returns today's date in Vietnam timezone as a YYYY-MM-DD string.
 */
function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + 7 * 3600_000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse affected_actions_json to extract stock code strings.
 * Handles both `[{ code: "VCB" }]` and `["VCB"]` formats.
 */
function parseAffectedCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code: unknown }).code);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles a structured morning briefing for the Vietnamese market day.
 *
 * Steps (all DB queries run against the injected `db`; best-effort calls
 * are wrapped in try/catch so a single failure never aborts the briefing):
 *
 *   1. pollNews() — best-effort pre-fetch of fresh news
 *   2. fetchVnIndex() — best-effort VN-Index snapshot
 *   3. Query top 5 rag_analyses since midnight GMT+7 sorted by impact_score
 *   4. Query unread alerts from the last 12 hours
 *   5. Query all watchlist stocks joined with latest market_prices
 *   6. Query new financial_reports since midnight GMT+7
 *   7. Persist briefing JSON to briefingsDir/YYYY-MM-DD.json
 *   8. Return DailyBriefing
 *
 * @param options - Injectable dependencies; all are optional for production use.
 * @returns       - Structured DailyBriefing object.
 */
export async function assembleBriefing(
  options: AssembleBriefingOptions = {},
): Promise<DailyBriefing> {
  // Resolve DB lazily (avoid importing getDb at module level for testability)
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      return getDb();
    })());

  const briefingsDir = options.briefingsDir ?? "./data/briefings";

  // ── Step 1: Best-effort pollNews ─────────────────────────────────────────
  const pollFn =
    options.pollNewsFn ??
    (async () => {
      const { pollNews } = await import("./pollNews.js");
      return pollNews({ db });
    });

  try {
    await pollFn();
  } catch (err) {
    logger.warn("[assembleBriefing] pollNews failed — continuing without fresh data", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 2: Best-effort VN-Index ─────────────────────────────────────────
  const vnIndexFn =
    options.fetchVnIndexFn ??
    (async () => {
      try {
        const { fetchVnIndex } = await import(
          "../../infrastructure/fetchers/hose.js"
        );
        const result = await fetchVnIndex();
        if (result) {
          return {
            price: result.price,
            changePct: result.changePct,
          };
        }
        return null;
      } catch (err) {
        logger.warn("[assembleBriefing] fetchVnIndex failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    });

  let vnIndex: VnIndexSnapshot | undefined;
  try {
    const result = await vnIndexFn();
    if (result !== null && result !== undefined) {
      vnIndex = result;
    }
  } catch (err) {
    logger.warn("[assembleBriefing] fetchVnIndex failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    vnIndex = undefined;
  }

  // ── Step 3: Top 5 stories since midnight ─────────────────────────────────
  const midnight = midnightVietnamAsUtc();

  const ragRows = db
    .prepare<RagRow, [string]>(`
      SELECT source_title, level, sentiment, impact_score
      FROM rag_analyses
      WHERE created_at >= ?
      ORDER BY impact_score DESC
      LIMIT 5
    `)
    .all(midnight);

  const topStories: TopStory[] = ragRows.map((row) => ({
    title: row.source_title ?? "(no title)",
    level: row.level,
    sentiment: row.sentiment ?? "neutral",
    impactScore: row.impact_score ?? 0,
  }));

  // ── Step 4: Unread alerts from last 12 hours ─────────────────────────────
  const since12h = new Date(Date.now() - 12 * 3600_000).toISOString();

  const alertRows = db
    .prepare<AlertRow, [string]>(`
      SELECT severity, message, affected_actions_json
      FROM alerts
      WHERE triggered_at >= ?
      ORDER BY triggered_at DESC
    `)
    .all(since12h);

  const alerts: BriefingAlert[] = alertRows.map((row) => ({
    severity: row.severity,
    message: row.message ?? "",
    stocks: parseAffectedCodes(row.affected_actions_json),
  }));

  // ── Step 5: Watchlist with latest prices ─────────────────────────────────
  const watchlistRows = db
    .prepare<WatchlistRow, []>(`
      SELECT w.code, w.domain, mp.price, mp.change_pct
      FROM watchlist w
      LEFT JOIN market_prices mp ON mp.code = w.code
      ORDER BY w.code
    `)
    .all();

  const watchlistSummary: WatchlistEntry[] = watchlistRows.map((row) => {
    const entry: WatchlistEntry = {
      code: row.code,
      domain: row.domain,
    };
    if (row.price != null) entry.price = row.price;
    if (row.change_pct != null) entry.changePct = row.change_pct;
    return entry;
  });

  // ── Step 6: New financial reports since midnight ──────────────────────────
  const reportRows = db
    .prepare<FinancialReportRow, [string]>(`
      SELECT action_code, period_type, period_year
      FROM financial_reports
      WHERE parsed_at >= ?
      ORDER BY parsed_at DESC
    `)
    .all(midnight);

  const newReports: NewReport[] = reportRows.map((row) => ({
    code: row.action_code,
    period:
      row.period_type && row.period_year
        ? `${row.period_year}-${row.period_type}`
        : String(row.period_year ?? "unknown"),
  }));

  // ── Step 7: Macro dashboard (σ-based) ──────────────────────────────────────
  let macroSnapshot: MacroIndicator[] = [];
  try {
    const { getAllMacroStats } = await import("../../infrastructure/db/macroStatsStore.js");
    const { classifyDeviation } = await import("../../domain/services/macroThresholds.js");

    const stats = getAllMacroStats();
    macroSnapshot = stats.map((s) => {
      const dev = classifyDeviation(s);
      return {
        name: s.name,
        value: s.current,
        unit: s.name.includes("Pct") ? "%" : s.name.includes("usd") ? "USD" : "",
        status: dev.summary,
      };
    });
  } catch { /* best-effort */ }

  // ── Step 8: Sensitive date warnings ─────────────────────────────────────────
  let sensitiveWarnings: string[] = [];
  try {
    const { detectSensitiveDates } = await import("../../domain/services/priceNewsValidator.js");
    sensitiveWarnings = detectSensitiveDates();
  } catch { /* best-effort */ }

  // ── Step 9: Auto-tracked commodities ────────────────────────────────────────
  let trackedCommodities: { indicator: string; value: number; unit: string; dataPoints: number }[] = [];
  try {
    const { listTrackedIndicators } = await import("../../infrastructure/db/commodityTracker.js");
    trackedCommodities = listTrackedIndicators().map((t) => ({
      indicator: t.indicator,
      value: t.value,
      unit: t.unit,
      dataPoints: t.dataPoints,
    }));
  } catch { /* best-effort */ }

  // ── Step 10: Auto-resolve stale low/medium alerts (72h) ──────────────────
  try {
    db.exec(`
      UPDATE alerts
      SET resolved_at = datetime('now'), resolution_notes = 'Auto-resolved: stale >72h'
      WHERE severity IN ('low', 'medium')
        AND resolved_at IS NULL
        AND triggered_at < datetime('now', '-72 hours')
    `);
  } catch { /* resolved_at column may not exist */ }

  // ── Step 10b: Unresolved HIGH/CRITICAL alerts ─────────────────────────────
  let unresolvedAlerts: BriefingAlert[] = [];
  try {
    const unresolvedRows = db
      .prepare<AlertRow, []>(`
        SELECT severity, message, affected_actions_json
        FROM alerts
        WHERE severity IN ('high', 'critical')
          AND resolved_at IS NULL
        ORDER BY triggered_at DESC
        LIMIT 5
      `)
      .all();
    unresolvedAlerts = unresolvedRows.map((row) => ({
      severity: row.severity,
      message: row.message ?? "",
      stocks: parseAffectedCodes(row.affected_actions_json),
    }));
  } catch { /* best-effort */ }

  // ── Step 11: Top conviction signal from watchlist ──────────────────────────
  let topConviction: DailyBriefing["topConviction"] = null;
  try {
    const { computeConviction } = await import("../../domain/services/convictionScorer.js");
    let bestScore = 0;

    for (const stock of watchlistRows) {
      if (stock.price == null || stock.change_pct == null) continue;
      const result = computeConviction({
        code: stock.code,
        changePct: stock.change_pct,
      });
      if (result.score > bestScore && result.level !== "weak") {
        bestScore = result.score;
        topConviction = {
          code: result.code,
          score: result.score,
          direction: result.direction,
          summary: result.summary,
        };
      }
    }
  } catch { /* best-effort */ }

  // ── Step 12: Prediction market signals (HIGH/CRITICAL only, last 24h) ────────
  let predictionSignals: BriefingPredictionSignal[] = [];
  try {
    const { getRecentPredictionSignals } = await import("../../infrastructure/db/predictionStore.js");
    const allSignals = getRecentPredictionSignals(db, 24);
    predictionSignals = allSignals.filter(
      (s) => s.severity === "high" || s.severity === "critical",
    );
  } catch { /* best-effort */ }

  // ── Step 13: Persist briefing ─────────────────────────────────────────────
  const date = todayVietnam();
  const generatedAt = new Date().toISOString();

  const briefing: DailyBriefing = {
    date,
    ...(vnIndex !== undefined ? { vnIndex } : {}),
    topStories,
    alerts,
    watchlistSummary,
    newReports,
    macroSnapshot,
    sensitiveWarnings,
    trackedCommodities,
    unresolvedAlerts,
    topConviction,
    predictionSignals,
    generatedAt,
  };

  try {
    mkdirSync(briefingsDir, { recursive: true });
    const filePath = join(briefingsDir, `${date}.json`);
    writeFileSync(filePath, JSON.stringify(briefing, null, 2), "utf-8");
    logger.info("[assembleBriefing] briefing persisted", { filePath });
  } catch (err) {
    logger.warn("[assembleBriefing] failed to persist briefing", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return briefing;
}
