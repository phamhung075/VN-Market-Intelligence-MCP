/**
 * globalMarketsHandler.ts — GET /api/global-markets
 *
 * TASK17-PAGE12 endpoint:
 * Serve "Bối cảnh thị trường toàn cầu" (Global Market Context / World Risk Barometer).
 * 12 world-market indicators a VN analyst needs as risk-on/risk-off backdrop,
 * each with current value + direction + delta (24h and 7d).
 *
 * Source table: commodity_prices_history (stored-data-only; NO live network calls).
 * Read path: globalMarketsStore (infrastructure) — no SQL in this handler.
 * This handler ONLY maps + aggregates — db injected by server.ts.
 *
 * Live contract (probed 2026-06-11 against named-volume DB):
 *   1226 rows, hourly (~35/day), span ~51 days
 *   brent/gold/usd_vnd = 100% coverage
 *   vix/sp500/shanghai/hang_seng/dxy/copper/silver/jpy_vnd = all recent rows
 *   us10y_yield = 743/1226
 *   cny_vnd_rate = 0/1226 — DEAD COLUMN, EXCLUDED ENTIRELY
 *
 * CRITICAL ZERO-AS-MISSING RULE:
 *   For these market indicators, value=0 means "not captured" (older rows).
 *   Delta from a 0 baseline = NULL (no -100% fabrication).
 *
 * Query params:
 *   ?window=N  — sparkline series range in days, default 7, clamp [1, 30]
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string,           // ISO 8601 server clock
 *     currentAt:   string,           // fetched_at of latest row; "" when empty
 *     source:      string,           // source field of latest row
 *     window:      number,           // clamped window param
 *     indicators:  IndicatorItem[],  // 12 indicators in canonical order
 *     series:      { [key]: [{t,v}] }, // per-indicator sparkline (v>0 only)
 *     summary:     GlobalSummary,
 *     count:       number            // indicators.length (12 when data present, 0 when empty)
 *   }
 *
 * 200 + empty indicators/series + summary(nulls) when table empty (NO error).
 * 500 JSON {error:"db_error"} on DB error (mirrors convictionHistoryHandler catch).
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() here).
 * Imports ONLY from globalMarketsStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getLatestRow,
  getBaselineRow,
  getSeriesSince,
  type CommodityPriceRow,
} from "../../../infrastructure/db/globalMarketsStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 7;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 30;
const SERIES_ROW_CAP = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// INDICATORS config — canonical 12, display order, Vietnamese labels
// ─────────────────────────────────────────────────────────────────────────────

export interface IndicatorConfig {
  /** DB column name (key used in response) */
  key: keyof CommodityPriceRow & string;
  /** Vietnamese display label */
  label: string;
  /** Display unit (empty string if unitless) */
  unit: string;
  /** Grouping for frontend rendering */
  group: "commodities" | "equities" | "fx_rates";
}

/** The 12 indicators in canonical display order. cny_vnd_rate is intentionally excluded. */
export const INDICATORS: IndicatorConfig[] = [
  // Commodities
  { key: "brent_crude_usd",   label: "Dầu Brent",              unit: "USD/thùng", group: "commodities" },
  { key: "gold_usd_per_oz",   label: "Vàng",                   unit: "USD/oz",    group: "commodities" },
  { key: "copper_usd",        label: "Đồng",                   unit: "USD/lb",    group: "commodities" },
  { key: "silver_usd_per_oz", label: "Bạc",                    unit: "USD/oz",    group: "commodities" },
  // Equities
  { key: "sp500",             label: "S&P 500 (Mỹ)",           unit: "điểm",      group: "equities"    },
  { key: "shanghai_comp",     label: "Shanghai (TQ)",          unit: "điểm",      group: "equities"    },
  { key: "hang_seng",         label: "Hang Seng (HK)",         unit: "điểm",      group: "equities"    },
  // FX / Risk
  { key: "vix",               label: "VIX (chỉ số sợ hãi)",   unit: "",          group: "fx_rates"    },
  { key: "dxy",               label: "DXY (sức mạnh USD)",     unit: "",          group: "fx_rates"    },
  { key: "usd_vnd_rate",      label: "USD/VND",                unit: "đồng",      group: "fx_rates"    },
  { key: "jpy_vnd_rate",      label: "JPY/VND",                unit: "đồng",      group: "fx_rates"    },
  { key: "us10y_yield",       label: "Lợi suất TPCP Mỹ 10N",  unit: "%",         group: "fx_rates"    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result of a delta computation between current and baseline value. */
export interface DeltaResult {
  delta: number | null;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

/** One indicator item in the response. */
export interface IndicatorItem {
  key: string;
  label: string;
  unit: string;
  group: "commodities" | "equities" | "fx_rates";
  current: number;
  prev24h: number | null;
  delta24h: number | null;
  deltaPct24h: number | null;
  direction24h: "up" | "down" | "flat";
  prev7d: number | null;
  delta7d: number | null;
  deltaPct7d: number | null;
  direction7d: "up" | "down" | "flat";
}

/** One sparkline data point. */
export interface SeriesPoint {
  t: string;  // fetched_at ISO timestamp
  v: number;  // value (always > 0; zero-or-less points are dropped)
}

/** TopMover entry in summary. */
export interface TopMover {
  key: string;
  label: string;
  deltaPct24h: number;
  direction24h: "up" | "down" | "flat";
}

/** Summary block. */
export interface GlobalSummary {
  vix: number | null;
  vixBand: "low" | "elevated" | "high" | null;
  riskTone: "risk-on" | "risk-off" | "neutral" | null;
  topMovers: TopMover[];
}

/** Full response body for GET /api/global-markets. */
export interface GlobalMarketsResponse {
  generatedAt: string;
  currentAt: string;
  source: string;
  window: number;
  indicators: IndicatorItem[];
  series: Record<string, SeriesPoint[]>;
  summary: GlobalSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute delta between current and baseline values.
 *
 * CRITICAL ZERO-AS-MISSING RULE: baseline <= 0 OR null → {delta:null, deltaPct:null, direction:"flat"}
 * This prevents fabricating -100% moves from zero-filled older rows.
 *
 * @param current  - Current value (always from latest row)
 * @param baseline - Baseline value (from 24h or 7d lookback row); null if row absent
 * @returns DeltaResult with delta, deltaPct (rounded to 4dp), direction
 */
export function computeDelta(current: number, baseline: number | null): DeltaResult {
  // Zero-as-missing: baseline <= 0 means "not captured", never compute from it
  if (baseline === null || baseline <= 0) {
    return { delta: null, deltaPct: null, direction: "flat" };
  }

  const delta = current - baseline;
  const deltaPct = (delta / baseline) * 100;

  let direction: "up" | "down" | "flat";
  if (delta > 0) {
    direction = "up";
  } else if (delta < 0) {
    direction = "down";
  } else {
    direction = "flat";
  }

  return { delta, deltaPct, direction };
}

/**
 * Classify VIX level into risk-appetite band.
 * Thresholds: <20 → "low", [20,30] → "elevated", >30 → "high"
 *
 * @param vix - VIX value
 * @returns "low" | "elevated" | "high"
 */
export function classifyVix(vix: number): "low" | "elevated" | "high" {
  if (vix < 20) return "low";
  if (vix <= 30) return "elevated";
  return "high";
}

/**
 * Build a single IndicatorItem from DB rows and config.
 *
 * @param cfg      - IndicatorConfig for this indicator
 * @param latest   - Latest (current) DB row
 * @param row24h   - Baseline row ~24h ago (null if absent)
 * @param row7d    - Baseline row ~7d ago (null if absent)
 * @returns IndicatorItem ready for the response
 */
export function buildIndicator(
  cfg: IndicatorConfig,
  latest: CommodityPriceRow,
  row24h: CommodityPriceRow | null,
  row7d: CommodityPriceRow | null,
): IndicatorItem {
  const current = latest[cfg.key] as number;
  const prev24hRaw = row24h ? (row24h[cfg.key] as number) : null;
  const prev7dRaw  = row7d  ? (row7d[cfg.key]  as number) : null;

  const d24h = computeDelta(current, prev24hRaw);
  const d7d  = computeDelta(current, prev7dRaw);

  return {
    key:          cfg.key,
    label:        cfg.label,
    unit:         cfg.unit,
    group:        cfg.group,
    current,
    prev24h:      (prev24hRaw !== null && prev24hRaw > 0) ? prev24hRaw : null,
    delta24h:     d24h.delta,
    deltaPct24h:  d24h.deltaPct,
    direction24h: d24h.direction,
    prev7d:       (prev7dRaw !== null && prev7dRaw > 0) ? prev7dRaw : null,
    delta7d:      d7d.delta,
    deltaPct7d:   d7d.deltaPct,
    direction7d:  d7d.direction,
  };
}

/**
 * Build the summary block from a list of IndicatorItems and the VIX value.
 *
 * riskTone heuristic (documented, honest):
 *   vixBand "low"  → "risk-on"   (market complacency, appetite for risk)
 *   vixBand "high" → "risk-off"  (fear spike, flight to safety)
 *   else           → "neutral"   (elevated but not panic)
 *
 * topMovers = up to 5 indicators by |deltaPct24h| DESC (null deltaPct24h excluded).
 *
 * @param indicators - All 12 IndicatorItems (may be empty when table is empty)
 * @param vix        - Current VIX value (may be null when table is empty)
 * @returns GlobalSummary
 */
export function buildSummary(
  indicators: Pick<IndicatorItem, "key" | "label" | "deltaPct24h" | "direction24h">[],
  vix: number | null,
): GlobalSummary {
  if (vix === null) {
    return { vix: null, vixBand: null, riskTone: null, topMovers: [] };
  }

  const vixBand = classifyVix(vix);
  const riskTone: "risk-on" | "risk-off" | "neutral" =
    vixBand === "low"  ? "risk-on"  :
    vixBand === "high" ? "risk-off" :
    "neutral";

  // topMovers: non-null deltaPct24h only, sorted by |deltaPct24h| DESC, capped at 5
  const movers = indicators
    .filter((i) => i.deltaPct24h !== null)
    .sort((a, b) => Math.abs(b.deltaPct24h!) - Math.abs(a.deltaPct24h!))
    .slice(0, 5)
    .map((i) => ({
      key:          i.key,
      label:        i.label,
      deltaPct24h:  i.deltaPct24h!,
      direction24h: i.direction24h,
    }));

  return { vix, vixBand, riskTone, topMovers: movers };
}

/**
 * Build a ISO string that is `days` days before the given ISO timestamp.
 * Returns the SAME "YYYY-MM-DDTHH:MM:SS.sssZ" form so SQLite string comparison
 * against fetched_at works correctly.
 *
 * @param isoTimestamp - Base ISO 8601 timestamp (with Z)
 * @param days         - Number of days to subtract
 * @returns ISO string `days` days before the input
 */
function subtractDays(isoTimestamp: string, days: number): string {
  const d = new Date(isoTimestamp);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().replace(/(\.\d{3})Z$/, ".000Z").replace(/(\d{3})Z$/, (m) => m);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/global-markets.
 *
 * @param req - Incoming HTTP request (reads ?window= query param)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetGlobalMarkets(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?window= param — default 7, clamp [1, 30]
    const windowParam = url.searchParams.get("window");
    const windowParsed = windowParam !== null ? parseInt(windowParam, 10) : NaN;
    const windowBase = isNaN(windowParsed) ? DEFAULT_WINDOW_DAYS : windowParsed;
    const windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, windowBase));

    // ── Read latest row ──────────────────────────────────────────────────────
    const latest = getLatestRow(db);

    // 200-on-empty: when table is empty, return zeroed envelope
    if (!latest) {
      const emptyBody: GlobalMarketsResponse = {
        generatedAt: new Date().toISOString(),
        currentAt:   "",
        source:      "",
        window:      windowDays,
        indicators:  [],
        series:      {},
        summary:     { vix: null, vixBand: null, riskTone: null, topMovers: [] },
        count:       0,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(emptyBody));
      return;
    }

    const currentAt = latest.fetched_at;

    // ── Compute baseline timestamps ─────────────────────────────────────────
    // Use JS Date math so the resulting string is the same ISO form as fetched_at
    // (SQLite string compare requires identical format for WHERE fetched_at <= ? to work)
    const iso24hBefore = subtractDays(currentAt, 1);
    const iso7dBefore  = subtractDays(currentAt, 7);

    // ── Fetch baseline rows (parameterized — no interpolation) ───────────────
    const row24h = getBaselineRow(db, iso24hBefore);
    const row7d  = getBaselineRow(db, iso7dBefore);

    // ── Build indicators ─────────────────────────────────────────────────────
    const indicators: IndicatorItem[] = INDICATORS.map((cfg) =>
      buildIndicator(cfg, latest, row24h, row7d),
    );

    // ── Build series (sparklines) ────────────────────────────────────────────
    const sinceIso = subtractDays(currentAt, windowDays);
    const rawSeries = getSeriesSince(db, sinceIso, SERIES_ROW_CAP);

    const series: Record<string, SeriesPoint[]> = {};
    for (const cfg of INDICATORS) {
      const pts: SeriesPoint[] = [];
      for (const row of rawSeries) {
        const v = row[cfg.key] as number;
        if (v > 0) {
          pts.push({ t: row.fetched_at, v });
        }
      }
      if (pts.length > 0) {
        series[cfg.key] = pts;
      }
    }

    // ── Build summary ────────────────────────────────────────────────────────
    const vixCurrent = latest.vix > 0 ? latest.vix : null;
    const summary = buildSummary(indicators, vixCurrent);

    const body: GlobalMarketsResponse = {
      generatedAt: new Date().toISOString(),
      currentAt,
      source:      latest.source,
      window:      windowDays,
      indicators,
      series,
      summary,
      count:       indicators.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
