/**
 * France Summary Job — Tasks 1316/1317/1365 (Interface / Scheduler Layer)
 *
 * Sends a morning digest of VN market data to the MARKET channel at
 * 07:00 UTC = 08:00 CET (before Paris market open). Relevant to the
 * France-based user who monitors Vietnam markets from UTC+1/+2.
 *
 * Three data sources (each independent, per-query try/catch):
 *   1. Top 3 price movers     — daily_ohlcv INNER JOIN watchlist, (close-open)/open*100 ORDER BY ABS(change_pct) DESC LIMIT 3
 *   2. Top 3 recent alerts    — alerts ORDER BY severity rank DESC LIMIT 3
 *   3. TA signals (top 3)     — watchlist tickers × computeTaFn, non-neutral, sorted by RSI dev
 *
 * Silent skip when all three sources return empty data.
 * Default sendFn: sendTelegramMarket (MARKET channel — user-facing digests).
 *
 * DDD Layer: interface/scheduler — may import from infrastructure only.
 *
 * All dependencies are injectable for TDD (db, sendFn, nowFn, computeTaFn).
 */

import type { Database } from "bun:sqlite"
import { logger } from "../../infrastructure/logger.js"
import { formatPnlSection } from "../../domain/services/portfolioPnlCalculator.js"
import type { PortfolioPnlResult } from "../../domain/services/portfolioPnlCalculator.js"
import type { VnIndexSnapshot } from "../../application/usecases/assembleEveningSummary.js"
import type { GlobalSnapshot } from "../../application/usecases/assembleBriefing.js"
import { formatGlobalSnapshotSection } from "./format/globalSnapshotSection.js"
import { formatForeignFlowSection } from "./format/foreignFlowSection.js"
import { isVnIndexFresh } from "./format/vnIndexFreshness.js"
import { formatAlertLines } from "./format/alertLines.js"
import type { ForeignFlowMover } from "../../application/usecases/assembleEveningSummary.js"
import type { BctcDeadlineRow } from "../../application/usecases/assembleBriefing.js"

// Re-exported for back-compat — test 1784 imports formatAlertLines directly from
// this job file. Shared formatter now lives in ./format/ (FACTORY-SCHEDULER-
// dedup-briefing-formatters) — this also removes the former job→job imports of
// formatGlobalSnapshotSection (from morningBriefingJob.ts) and
// formatForeignFlowSection/isVnIndexFresh (from eveningSummaryJob.ts).
export { formatAlertLines } from "./format/alertLines.js"
export type { AlertDisplayRow } from "./format/alertLines.js"

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram send function. */
export type SendFn = (text: string) => Promise<boolean>

/** Subset of TaSignal — only fields needed for France briefing display. */
export interface TaSignalRow {
  code: string
  rsi14: number | null
  rsiStatus: "overbought" | "oversold" | "neutral"
  priceVsMa20: "above" | "below" | "neutral"
  ma20: number | null
}

/** Result of runFranceSummary. */
export interface FranceSummaryResult {
  /** Whether a message was sent to Telegram. */
  sent: boolean
  /** Number of price movers included (max 3). */
  moverCount: number
  /** Number of alerts included (max 3). */
  alertCount: number
  /** Deduplicated alert rows returned (max 3, 40-char prefix dedup). */
  alerts: AlertRow[]
  /** Top-3 non-neutral TA signals (replaces taCount). */
  taSignals: TaSignalRow[]
  /** VN-Index snapshot included in digest, or null if unavailable. */
  vnIndex: VnIndexSnapshot | null
  /** Global market snapshot (VIX, DXY, S&P500, Hang Seng); null when unavailable. */
  globalSnapshot: GlobalSnapshot | null
  /** Foreign flow top movers from daily_ohlcv; null when unavailable. */
  foreignFlowMovers?: ForeignFlowMover[]
  /** Upcoming BCTC filing deadlines for watchlist stocks (Task 1519). */
  upcomingDeadlines?: BctcDeadlineRow[]
  /**
   * Raw mover rows (Task 1785) — exposed for tests to assert change_pct values.
   * change_pct is prev-close-to-close, or null when no previous session row exists.
   */
  movers?: MoverRow[]
}

/** Options for runFranceSummary (injectable for TDD). */
export interface FranceSummaryOptions {
  /** SQLite DB (defaults to getDb() singleton). */
  db?: Database
  /** Telegram send function (defaults to sendTelegramMarket). */
  sendFn?: SendFn
  /** Injectable clock (defaults to () => new Date()). */
  nowFn?: () => Date
  /** Injectable TA compute fn for TDD (defaults to defaultComputeTa). */
  computeTaFn?: (code: string, db: Database) => TaSignalRow | null
  /**
   * Injectable portfolio P&L fn for TDD.
   * Defaults to computing P&L from the positions table via portfolioPnlCalculator.
   * Return null to skip the P&L section (e.g. no positions or DB unavailable).
   */
  getPnlFn?: () => Promise<PortfolioPnlResult | null>
  /**
   * Injectable VN-Index fetch fn for TDD.
   * Defaults to querying market_prices WHERE code = 'VNINDEX'.
   * Return null to skip the VN-Index block.
   */
  fetchVnIndexFn?: () => Promise<VnIndexSnapshot | null>
  /**
   * Injectable global snapshot fn for TDD.
   * Defaults to querying commodity_prices (same query as assembleBriefing.ts Step 12b).
   * Return null to skip the global section.
   */
  getGlobalSnapshotFn?: () => Promise<GlobalSnapshot | null>
  /**
   * Injectable foreign flow fn for TDD.
   * Signature matches eveningSummaryJob usage: receives the resolved DB.
   * Defaults to querying daily_ohlcv (latest date, ABS(foreign_net_vol) DESC LIMIT 5).
   * Return [] to skip the section.
   */
  getForeignFlowMoversFn?: (db: Database) => ForeignFlowMover[]
  /**
   * Injectable BCTC deadline fn for TDD (Task 1519).
   * Receives (db, now) and returns upcoming/overdue deadline rows for watchlist stocks.
   * Stub — not wired to hasContent or send path until GREEN phase.
   */
  getUpcomingDeadlinesFn?: (db: Database, now: Date) => BctcDeadlineRow[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface MoverRow {
  code: string
  price: number | null
  change_pct: number | null
}

interface AlertRow {
  id: string
  severity: string
  message: string | null
  triggered_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity ordering for alert sort
// The ORDER BY uses a CASE expression mapping severity to numeric rank.
// critical=4, high=3, warning=2, info=1, unknown=0
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_CASE = `
  CASE severity
    WHEN 'critical' THEN 4
    WHEN 'high'     THEN 3
    WHEN 'warning'  THEN 2
    WHEN 'info'     THEN 1
    ELSE                 0
  END DESC
`

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches top 3 price movers by ABS(change_pct) descending.
 * Only watchlist tickers are considered (INNER JOIN watchlist).
 *
 * Task 1785 fix: change_pct = (today.close - yesterday.close) / yesterday.close * 100
 * This matches the session-over-session % used in morningBriefing, EOD, and alerts.
 * The previous implementation used (close - open) / open * 100 (intraday only).
 *
 * Date selection: picks the latest date that has at least one watchlist ticker
 * with a computable prev-close change (> 0.1%). Falls back to MAX(date) when none.
 *
 * When yesterday's close is missing, change_pct is NULL; formatPct renders "N/A".
 *
 * Returns [] on any DB error (per-query isolation).
 */
function fetchTopMovers(db: Database): MoverRow[] {
  try {
    return db
      .prepare<MoverRow, []>(`
        WITH latest_date AS (
          SELECT COALESCE(
            (
              SELECT t.date
              FROM daily_ohlcv t
              INNER JOIN watchlist w ON w.code = t.code
              INNER JOIN daily_ohlcv y
                ON y.code = t.code
               AND y.date = (SELECT MAX(d2.date) FROM daily_ohlcv d2 WHERE d2.code = t.code AND d2.date < t.date)
              WHERE y.close IS NOT NULL AND y.close != 0
                AND ABS((t.close - y.close) / y.close * 100.0) > 0.1
              ORDER BY t.date DESC
              LIMIT 1
            ),
            (SELECT MAX(date) FROM daily_ohlcv)
          ) AS date
        ),
        ohlcv_change AS (
          SELECT
            t.code,
            t.close AS price,
            CASE
              WHEN y.close IS NOT NULL AND y.close != 0
                THEN (t.close - y.close) / y.close * 100.0
              WHEN t.open IS NOT NULL AND t.open != 0
                THEN (t.close - t.open) / t.open * 100.0
              ELSE NULL
            END AS change_pct
          FROM daily_ohlcv t
          INNER JOIN watchlist w ON w.code = t.code
          JOIN latest_date ld ON t.date = ld.date
          LEFT JOIN daily_ohlcv y
            ON y.code = t.code
           AND y.date = (SELECT MAX(d2.date) FROM daily_ohlcv d2 WHERE d2.code = t.code AND d2.date < t.date)
        )
        SELECT code, price, change_pct
        FROM ohlcv_change
        ORDER BY ABS(COALESCE(change_pct, 0)) DESC
        LIMIT 3
      `)
      .all()
  } catch (err) {
    logger.warn("[franceSummaryJob] daily_ohlcv query failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Fetches top 3 alerts ordered by severity rank (critical > high > warning > info).
 * Only alerts triggered within the last 24 hours are considered (FR-1).
 * Returns [] on any DB error (per-query isolation).
 */
function fetchTopAlerts(db: Database): AlertRow[] {
  try {
    const rows = db
      .prepare<AlertRow, []>(`
        SELECT id, severity, message, triggered_at
        FROM alerts
        WHERE triggered_at >= datetime('now', '-24 hours')
        ORDER BY ${SEVERITY_CASE}, triggered_at DESC
        LIMIT 10
      `)
      .all()
    const seen = new Map<string, AlertRow>()
    for (const r of rows) {
      const prefix = (r.message ?? "").slice(0, 40)
      if (!seen.has(prefix)) seen.set(prefix, r)
    }
    return Array.from(seen.values()).slice(0, 3)
  } catch (err) {
    logger.warn("[franceSummaryJob] alerts query failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Fetches top-3 non-neutral TA signals for all watchlist tickers.
 *
 * Steps:
 *   1. SELECT code FROM watchlist ORDER BY code
 *   2. For each code: call computeTaFn(code, db)
 *   3. Filter: keep rows where rsiStatus !== "neutral" || priceVsMa20 !== "neutral"
 *   4. Sort: Math.abs((rsi14 ?? 50) - 50) descending (most extreme RSI first)
 *   5. Slice top 3
 *
 * Returns [] on any error (fail-open, per-query isolation).
 */
function fetchTaSignals(
  db: Database,
  computeTaFn?: (code: string, db: Database) => TaSignalRow | null,
): TaSignalRow[] {
  try {
    interface WatchlistRow { code: string }
    const codes = db
      .prepare<WatchlistRow, []>("SELECT code FROM watchlist ORDER BY code")
      .all()
      .map((r) => r.code)

    const rows: TaSignalRow[] = []
    for (const code of codes) {
      try {
        const signal = computeTaFn ? computeTaFn(code, db) : null
        if (
          signal !== null &&
          signal !== undefined &&
          (signal.rsiStatus !== "neutral" || signal.priceVsMa20 !== "neutral")
        ) {
          rows.push(signal)
        }
      } catch {
        // per-ticker isolation — continue
      }
    }

    rows.sort(
      (a, b) =>
        Math.abs((b.rsi14 ?? 50) - 50) - Math.abs((a.rsi14 ?? 50) - 50),
    )

    return rows.slice(0, 3)
  } catch (err) {
    logger.warn("[franceSummaryJob] fetchTaSignals failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-level same-day dedup guard (FR-2)
// Prevents duplicate digests when the cron re-fires after a server restart.
// Fail-open: if the DB check throws (e.g. table missing on first boot), returns
// false so the digest proceeds rather than being silently suppressed.
// ─────────────────────────────────────────────────────────────────────────────

function alreadySentToday(db: Database): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(
        `SELECT COUNT(*) AS cnt
         FROM market_messages
         WHERE from_agent = 'france-summary'
           AND sent_at >= date('now')`,
      )
      .get()
    return (row?.cnt ?? 0) > 0
  } catch {
    return false // fail-open: do not suppress if DB check fails
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Formats a date as DD/MM/YYYY (Vietnamese convention). */
function formatDateVI(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Formats change_pct with sign (e.g. +3.5% or -5.2%). Returns "N/A" for null. */
function formatPct(pct: number | null): string {
  if (pct == null) return "N/A"
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

/** Maps rsiStatus to Vietnamese label. */
function rsiLabel(status: TaSignalRow["rsiStatus"]): string {
  switch (status) {
    case "overbought": return "quá mua"
    case "oversold":   return "quá bán"
    default:           return ""
  }
}

/** Maps priceVsMa20 to Vietnamese label. */
function ma20Label(pos: TaSignalRow["priceVsMa20"]): string {
  switch (pos) {
    case "above": return "giá trên MA20"
    case "below": return "giá dưới MA20"
    default:      return ""
  }
}

// AlertDisplayRow and formatAlertLines (+ its private severityLabel helper)
// moved to ./format/alertLines.ts (FACTORY-SCHEDULER-dedup-briefing-formatters)
// — see re-exports above.

/**
 * Builds the full digest message in Vietnamese plain-text format.
 *
 * Fourth argument changed from taCount: number → taSignals: TaSignalRow[]
 * (Task 1365 — replaces TA count with per-ticker RSI/MA20 signals).
 * Accepts number for legacy call-site compat (treated as empty signals array).
 *
 * Fifth argument (Task 1444/1445): optional portfolioPnl — renders DANH MỤC
 * block when present and non-empty. Omitted when null/undefined or empty items.
 */
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
  portfolioPnl?: PortfolioPnlResult | null,
  vnIndex?: VnIndexSnapshot | null,
  globalSnapshot?: GlobalSnapshot | null,
  foreignFlowMovers?: ForeignFlowMover[],
  upcomingDeadlines?: BctcDeadlineRow[],
): string {
  const header = `Bản tin sáng Pháp — Thị trường VN (${dateStr})`

  const blocks: string[] = []

  // Section 0: VN-Index close — always first block when present
  if (vnIndex != null) {
    const closeFmt = Math.round(vnIndex.close).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    const chSign = vnIndex.change >= 0 ? "+" : ""
    const pctSign = vnIndex.changePct >= 0 ? "+" : ""
    const staleSuffix =
      vnIndex.fetchedAt && !isVnIndexFresh(vnIndex.fetchedAt) ? " (cũ)" : "";
    blocks.push(
      `VN-Index: ${closeFmt} (${chSign}${Math.round(vnIndex.change)} / ${pctSign}${vnIndex.changePct.toFixed(2)}%)${staleSuffix}`,
    )
  }

  // Section 0.5: global snapshot (VIX/DXY/SP500/HangSeng) — before movers
  if (globalSnapshot != null) {
    blocks.push(formatGlobalSnapshotSection(globalSnapshot).join("\n"))
  }

  // Section 1: price movers — omit entirely when empty
  if (movers.length > 0) {
    const lines: string[] = []
    lines.push(`Top biến động giá (${movers.length}):`)
    for (const m of movers) {
      const priceFmt = m.price != null ? m.price.toLocaleString("vi-VN") : "n/a"
      lines.push(`  ${m.code}: ${priceFmt} đồng (${formatPct(m.change_pct)})`)
    }
    blocks.push(lines.join("\n"))
  }

  // Section 1.5: Foreign investor flow (Khối ngoại) — Task 1516
  if (foreignFlowMovers && foreignFlowMovers.length > 0) {
    blocks.push(...formatForeignFlowSection(foreignFlowMovers))
  }

  // Section 2: alerts — omit entirely when empty
  // formatAlertLines applies BUG-4 (sector label rewrite) and BUG-5 (body dedup)
  if (alerts.length > 0) {
    const alertLines = formatAlertLines(alerts)
    if (alertLines.length > 0) {
      const lines: string[] = []
      lines.push(`Cảnh báo gần nhất (${alerts.length}):`)
      for (const l of alertLines) lines.push(l)
      blocks.push(lines.join("\n"))
    }
  }

  // Section 3: TA signals — omit entirely when empty
  // Accepts TaSignalRow[] (new) or number (legacy — treated as empty)
  const signals: TaSignalRow[] = Array.isArray(taSignals) ? taSignals : []

  if (signals.length > 0) {
    const lines: string[] = []
    lines.push(`Tín hiệu kỹ thuật (top ${signals.length}):`)
    for (const s of signals) {
      const parts: string[] = []
      const rsi = rsiLabel(s.rsiStatus)
      if (rsi) {
        const rsiVal = s.rsi14 != null ? ` (RSI ${s.rsi14.toFixed(1)})` : ""
        parts.push(`${rsi}${rsiVal}`)
      }
      const ma = ma20Label(s.priceVsMa20)
      if (ma) parts.push(ma)
      const detail = parts.length > 0 ? ` — ${parts.join(", ")}` : ""
      lines.push(`  ${s.code}${detail}`)
    }
    blocks.push(lines.join("\n"))
  }

  // Section 4: portfolio P&L — omit when null/undefined or items empty
  if (portfolioPnl != null && portfolioPnl.items.length > 0) {
    const pnlBlock = formatPnlSection(portfolioPnl)
    if (pnlBlock.length > 0) {
      blocks.push(pnlBlock)
    }
  }

  // Section 4.5: BCTC sắp đến — mirrors morningBriefingJob.ts BCTC block
  if (upcomingDeadlines && upcomingDeadlines.length > 0) {
    const lines: string[] = []
    lines.push("BCTC sắp đến:")
    for (const row of upcomingDeadlines) {
      if (row.status === "QUA_HAN") {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — QUÁ HẠN ${Math.abs(row.daysUntilDeadline)} ngày`
        )
      } else {
        lines.push(
          `  ${row.code}: Q${row.quarter}/${row.year} — hạn ${row.deadline} (${row.daysUntilDeadline} ngày)`
        )
      }
    }
    blocks.push(lines.join("\n"))
  }

  return header + (blocks.length > 0 ? "\n\n" + blocks.join("\n\n") : "")
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the France morning summary job.
 *
 * Queries top 3 price movers, top 3 alerts, and TA signal count from SQLite.
 * Sends a Vietnamese plain-text digest to the MARKET channel.
 * Silent when all three sources return empty (no send, no log noise).
 *
 * Never throws — all errors are caught and logged.
 *
 * @param opts - Injectable dependencies for testability
 */
export async function runFranceSummary(opts: FranceSummaryOptions = {}): Promise<FranceSummaryResult> {
  // Resolve DB
  let resolvedDb: Database
  if (opts.db) {
    resolvedDb = opts.db
  } else {
    const { getDb } = await import("../../infrastructure/db/schema.js")
    resolvedDb = getDb()
  }

  // DB-level same-day dedup guard (FR-2)
  // Fail-open: if check throws, proceed with send.
  if (alreadySentToday(resolvedDb)) {
    return { sent: false, moverCount: 0, alertCount: 0, alerts: [], taSignals: [], vnIndex: null, globalSnapshot: null, foreignFlowMovers: [], upcomingDeadlines: [], movers: [] }
  }

  // Resolve send function — default: sendTelegramMarket (MARKET channel)
  let resolvedSend: SendFn
  if (opts.sendFn) {
    resolvedSend = opts.sendFn
  } else {
    const { sendTelegramMarket } = await import("../../infrastructure/notifiers/telegram.js")
    resolvedSend = (text: string) =>
      sendTelegramMarket(text, {
        parseMode: "",
        persist: { from_agent: "france-summary", message_type: "france_summary" },
      })
  }

  // Resolve clock
  const nowFn = opts.nowFn ?? (() => new Date())

  // ── VN-Index snapshot (best-effort, injectable via fetchVnIndexFn) ─────────
  let vnIndex: VnIndexSnapshot | null = null
  try {
    if (opts.fetchVnIndexFn) {
      vnIndex = await opts.fetchVnIndexFn()
    } else {
      // Default: query market_prices for VNINDEX ticker
      interface VnIndexRow { price: number; change_pct: number; updated_at: string }
      // Compute cutoff date using mocked nowFn for testability
      const threeDaysAgo = new Date(nowFn().getTime() - 3 * 24 * 60 * 60 * 1000)
      const cutoffDateStr = threeDaysAgo.toISOString().split('T')[0]!!
      const row = resolvedDb
        .prepare<VnIndexRow, [string]>(
          `SELECT price, change_pct, updated_at FROM market_prices WHERE code = 'VNINDEX' AND date(updated_at) >= ? LIMIT 1`,
        )
        .get(cutoffDateStr)
      if (row) {
        vnIndex = {
          close: row.price,
          change: Math.round(row.price * (row.change_pct / 100) / (1 + row.change_pct / 100)),
          changePct: row.change_pct,
          fetchedAt: row.updated_at,
        }
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] fetchVnIndexFn failed — skipping VN-Index block", {
      error: err instanceof Error ? err.message : String(err),
    })
    vnIndex = null
  }

  // ── Global snapshot (best-effort, injectable via getGlobalSnapshotFn) ──────
  let globalSnapshot: GlobalSnapshot | null = null
  try {
    if (opts.getGlobalSnapshotFn) {
      globalSnapshot = await opts.getGlobalSnapshotFn()
    } else {
      // Default: query commodity_prices (same as assembleBriefing Step 12b)
      interface CpRow { vix: number; dxy: number; sp500: number; hang_seng: number; fetched_at: string }
      const cpRow = resolvedDb
        .prepare<CpRow, []>(
          `SELECT vix, dxy, sp500, hang_seng, fetched_at FROM commodity_prices ORDER BY fetched_at DESC LIMIT 1`,
        )
        .get()
      if (cpRow && (cpRow.vix !== 0 || cpRow.dxy !== 0 || cpRow.sp500 !== 0 || cpRow.hang_seng !== 0)) {
        globalSnapshot = {
          vix: cpRow.vix,
          dxy: cpRow.dxy,
          sp500: cpRow.sp500,
          hangSeng: cpRow.hang_seng,
          fetchedAt: cpRow.fetched_at,
        }
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getGlobalSnapshotFn failed — skipping global section", {
      error: err instanceof Error ? err.message : String(err),
    })
    globalSnapshot = null
  }

  // ── Per-query fetch (isolated try/catch) ───────────────────────────────
  const movers = fetchTopMovers(resolvedDb)
  const alerts = fetchTopAlerts(resolvedDb)
  const taSignals = fetchTaSignals(resolvedDb, opts.computeTaFn)

  // ── Portfolio P&L (best-effort, injectable via getPnlFn) ───────────────
  let portfolioPnl: PortfolioPnlResult | null = null
  try {
    if (opts.getPnlFn) {
      portfolioPnl = await opts.getPnlFn()
    } else {
      // Default: query positions table + market_prices (mirrors assembleEveningSummary)
      interface OpenPositionRow { code: string; shares: number; avg_price: number }
      interface PriceRow { code: string; price: number }
      const openPositions = resolvedDb
        .prepare<OpenPositionRow, []>(
          `SELECT code, shares, avg_price FROM positions WHERE status = 'open'`,
        )
        .all()
      if (openPositions.length > 0) {
        const codes = openPositions.map((p) => `'${p.code}'`).join(",")
        const priceRows = resolvedDb
          .prepare<PriceRow, []>(
            `SELECT code, price FROM market_prices WHERE code IN (${codes}) AND updated_at >= datetime('now', '-3 days')`,
          )
          .all()
        const priceMap = new Map(priceRows.map((r) => [r.code, r.price]))
        const { computePortfolioPnl } = await import(
          "../../domain/services/portfolioPnlCalculator.js"
        )
        portfolioPnl = computePortfolioPnl(
          openPositions.map((p) => ({
            code: p.code,
            shares: p.shares,
            avgPrice: p.avg_price,
          })),
          priceMap,
        )
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getPnlFn failed — skipping P&L section", {
      error: err instanceof Error ? err.message : String(err),
    })
    portfolioPnl = null
  }

  const hasPnl = portfolioPnl != null && portfolioPnl.items.length > 0

  // ── Foreign flow movers (best-effort, injectable via getForeignFlowMoversFn) ─
  let foreignFlowMovers: ForeignFlowMover[] = []
  try {
    if (opts.getForeignFlowMoversFn) {
      foreignFlowMovers = opts.getForeignFlowMoversFn(resolvedDb)
    } else {
      // Default: query daily_ohlcv_with_flow (TASK_2003) latest date, exclude NULL
      // foreign_net_vol, top 5 by ABS(net). View COALESCEs daily_foreign_flow
      // (new) then daily_ohlcv.foreign_* (legacy) so column names are unchanged.
      interface FfRow { code: string; foreign_buy_vol: number; foreign_sell_vol: number; foreign_net_vol: number }
      const latestDateRow = resolvedDb
        .prepare<{ date: string }, []>(
          `SELECT date FROM daily_ohlcv_with_flow WHERE foreign_net_vol IS NOT NULL ORDER BY date DESC LIMIT 1`,
        )
        .get()
      if (latestDateRow) {
        const ffRows = resolvedDb
          .prepare<FfRow, [string]>(
            `SELECT code, foreign_buy_vol, foreign_sell_vol, foreign_net_vol
               FROM daily_ohlcv_with_flow
              WHERE date = ? AND foreign_net_vol IS NOT NULL
              ORDER BY ABS(foreign_net_vol) DESC
              LIMIT 5`,
          )
          .all(latestDateRow.date)
        foreignFlowMovers = ffRows.map((r) => ({
          code: r.code,
          foreignNetVol: r.foreign_net_vol,
          foreignBuyVol: r.foreign_buy_vol,
          foreignSellVol: r.foreign_sell_vol,
        }))
      }
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getForeignFlowMoversFn failed — skipping foreign flow section", {
      error: err instanceof Error ? err.message : String(err),
    })
    foreignFlowMovers = []
  }

  // ── BCTC upcoming deadlines (best-effort, injectable via getUpcomingDeadlinesFn) ─
  let upcomingDeadlines: BctcDeadlineRow[] = []
  try {
    const now = nowFn()
    if (opts.getUpcomingDeadlinesFn) {
      upcomingDeadlines = opts.getUpcomingDeadlinesFn(resolvedDb, now)
    } else {
      // Default: mirrors assembleBriefing.ts Step 18
      const { getCurrentDeadline, getNextDeadline, classifyFilingStatus } =
        await import("../../domain/services/financial-reports/earningsCalendar.js")

      // Read watchlist rows (code + domain)
      interface WatchlistRow { code: string; domain: string }
      const wlRows = resolvedDb
        .prepare<WatchlistRow, []>(`SELECT code, domain FROM watchlist`)
        .all()

      // Detect period_quarter column presence
      let hasPeriodQuarter = false
      try {
        const cols = resolvedDb.query<{ name: string }, []>(
          "PRAGMA table_info(financial_reports)"
        ).all()
        hasPeriodQuarter = cols.some((c) => c.name === "period_quarter")
      } catch { /* schema probe failed */ }

      interface FiledAtRow { filed_at: string | null }
      const filedAtStmt = hasPeriodQuarter
        ? resolvedDb.prepare<FiledAtRow, [string, number, number]>(`
            SELECT MAX(parsed_at) AS filed_at FROM financial_reports
            WHERE action_code = ? AND period_year = ? AND period_quarter = ?
          `)
        : null

      const queryFiledAt = (code: string, year: number, quarter: number): string | null => {
        if (filedAtStmt) {
          const r = filedAtStmt.get(code, year, quarter)
          return r?.filed_at ?? null
        }
        const periodType = `Q${quarter}`
        const r = resolvedDb.prepare<FiledAtRow, [string, number, string]>(`
          SELECT MAX(parsed_at) AS filed_at FROM financial_reports
          WHERE action_code = ? AND period_year = ? AND period_type = ?
        `).get(code, year, periodType)
        return r?.filed_at ?? null
      }

      const rows: BctcDeadlineRow[] = []
      for (const wl of wlRows) {
        try {
          const nextInfo = getNextDeadline(now, wl.domain)
          const currentInfo = getCurrentDeadline(now, wl.domain)
          const daysToCurrent = Math.floor(
            (currentInfo.deadline.getTime() - now.getTime()) / (24 * 3600_000)
          )
          const daysToNext = Math.floor(
            (nextInfo.deadline.getTime() - now.getTime()) / (24 * 3600_000)
          )
          const info =
            Math.abs(daysToNext) <= Math.abs(daysToCurrent) ? nextInfo : currentInfo
          const filedAt = queryFiledAt(wl.code, info.year, info.quarter)
          const fs = classifyFilingStatus(now, { ...info, filingDate: filedAt })
          if (fs.status === "SAP_DEN" || fs.status === "QUA_HAN") {
            rows.push({
              code: wl.code,
              domain: wl.domain,
              quarter: info.quarter,
              year: info.year,
              deadline: info.deadline.toISOString().slice(0, 10),
              daysUntilDeadline: fs.daysUntilDeadline!,
              status: fs.status,
            })
          }
        } catch { /* per-stock failure — skip silently */ }
      }
      upcomingDeadlines = rows.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)
    }
  } catch (err) {
    logger.warn("[franceSummaryJob] getUpcomingDeadlinesFn failed — skipping BCTC deadlines", {
      error: err instanceof Error ? err.message : String(err),
    })
    upcomingDeadlines = []
  }

  // Silent skip when all sources are empty (including vnIndex and globalSnapshot)
  if (
    movers.length === 0 &&
    alerts.length === 0 &&
    taSignals.length === 0 &&
    !hasPnl &&
    vnIndex == null &&
    globalSnapshot == null &&
    foreignFlowMovers.length === 0 &&
    upcomingDeadlines.length === 0
  ) {
    return { sent: false, moverCount: 0, alertCount: 0, alerts: [], taSignals: [], vnIndex: null, globalSnapshot: null, foreignFlowMovers: [], upcomingDeadlines: [], movers: [] }
  }

  const dateStr = formatDateVI(nowFn())
  const message = formatFranceSummaryVI(dateStr, movers, alerts, taSignals, portfolioPnl, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines)

  try {
    await resolvedSend(message)
    return { sent: true, moverCount: movers.length, alertCount: alerts.length, alerts, taSignals, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines, movers }
  } catch (err) {
    logger.warn("[franceSummaryJob] Telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { sent: false, moverCount: movers.length, alertCount: alerts.length, alerts, taSignals, vnIndex, globalSnapshot, foreignFlowMovers, upcomingDeadlines, movers }
  }
}
