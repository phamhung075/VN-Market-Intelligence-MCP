/**
 * France Summary Job — Tasks 1316/1317/1365 (Interface / Scheduler Layer)
 *
 * Sends a morning digest of VN market data to the MARKET channel at
 * 07:00 UTC = 08:00 CET (before Paris market open). Relevant to the
 * France-based user who monitors Vietnam markets from UTC+1/+2.
 *
 * Three data sources (each independent, per-query try/catch):
 *   1. Top 3 price movers     — market_prices ORDER BY ABS(change_pct) DESC LIMIT 3
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
import { logger } from "../infrastructure/logger.js"

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
  /** Top-3 non-neutral TA signals (replaces taCount). */
  taSignals: TaSignalRow[]
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
 * Returns [] on any DB error (per-query isolation).
 */
function fetchTopMovers(db: Database): MoverRow[] {
  try {
    return db
      .prepare<MoverRow, []>(`
        SELECT code, price, change_pct
        FROM market_prices
        WHERE change_pct IS NOT NULL
        ORDER BY ABS(change_pct) DESC
        LIMIT 3
      `)
      .all()
  } catch (err) {
    logger.warn("[franceSummaryJob] market_prices query failed", {
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
    return db
      .prepare<AlertRow, []>(`
        SELECT id, severity, message, triggered_at
        FROM alerts
        WHERE triggered_at >= datetime('now', '-24 hours')
        ORDER BY ${SEVERITY_CASE}, triggered_at DESC
        LIMIT 3
      `)
      .all()
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

/** Formats change_pct with sign (e.g. +3.5% or -5.2%). */
function formatPct(pct: number | null): string {
  if (pct == null) return "n/a"
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

/** Maps severity to a short Vietnamese label. */
function severityLabel(s: string): string {
  switch (s) {
    case "critical": return "NGHIEM TRONG"
    case "high":     return "CAO"
    case "warning":  return "CANH BAO"
    case "info":     return "THONG TIN"
    default:         return s.toUpperCase()
  }
}

/** Maps rsiStatus to Vietnamese label. */
function rsiLabel(status: TaSignalRow["rsiStatus"]): string {
  switch (status) {
    case "overbought": return "qua mua"
    case "oversold":   return "qua ban"
    default:           return ""
  }
}

/** Maps priceVsMa20 to Vietnamese label. */
function ma20Label(pos: TaSignalRow["priceVsMa20"]): string {
  switch (pos) {
    case "above": return "gia tren MA20"
    case "below": return "gia duoi MA20"
    default:      return ""
  }
}

/**
 * Builds the full digest message in Vietnamese plain-text format.
 *
 * Fourth argument changed from taCount: number → taSignals: TaSignalRow[]
 * (Task 1365 — replaces TA count with per-ticker RSI/MA20 signals).
 * Accepts number for legacy call-site compat (treated as empty signals array).
 */
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taSignals: TaSignalRow[] | number,
): string {
  const lines: string[] = []
  lines.push(`Ban tin sang Phap — Thi truong VN (${dateStr})`)
  lines.push("")

  // Section 1: price movers
  if (movers.length > 0) {
    lines.push(`Top bien dong gia (${movers.length}):`)
    for (const m of movers) {
      const priceFmt = m.price != null ? m.price.toLocaleString("vi-VN") : "n/a"
      lines.push(`  ${m.code}: ${priceFmt} dong (${formatPct(m.change_pct)})`)
    }
  } else {
    lines.push("Khong co du lieu gia.")
  }

  lines.push("")

  // Section 2: alerts
  if (alerts.length > 0) {
    lines.push(`Canh bao gan nhat (${alerts.length}):`)
    for (const a of alerts) {
      const msg = (a.message ?? "").slice(0, 100)
      lines.push(`  [${severityLabel(a.severity)}] ${msg}`)
    }
  } else {
    lines.push("Khong co canh bao.")
  }

  lines.push("")

  // Section 3: TA signals (per-ticker RSI/MA20 detail)
  // Accepts TaSignalRow[] (new) or number (legacy — treated as empty)
  const signals: TaSignalRow[] = Array.isArray(taSignals) ? taSignals : []

  if (signals.length > 0) {
    lines.push(`Tin hieu ky thuat (top ${signals.length}):`)
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
  } else {
    lines.push("Khong co tin hieu ky thuat")
  }

  return lines.join("\n")
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
    const { getDb } = await import("../infrastructure/db/schema.js")
    resolvedDb = getDb()
  }

  // DB-level same-day dedup guard (FR-2)
  // Fail-open: if check throws, proceed with send.
  if (alreadySentToday(resolvedDb)) {
    return { sent: false, moverCount: 0, alertCount: 0, taSignals: [] }
  }

  // Resolve send function — default: sendTelegramMarket (MARKET channel)
  let resolvedSend: SendFn
  if (opts.sendFn) {
    resolvedSend = opts.sendFn
  } else {
    const { sendTelegramMarket } = await import("../infrastructure/notifiers/telegram.js")
    resolvedSend = (text: string) =>
      sendTelegramMarket(text, {
        parseMode: "",
        persist: { from_agent: "france-summary", message_type: "france_summary" },
      })
  }

  // Resolve clock
  const nowFn = opts.nowFn ?? (() => new Date())

  // ── Per-query fetch (isolated try/catch) ───────────────────────────────
  const movers = fetchTopMovers(resolvedDb)
  const alerts = fetchTopAlerts(resolvedDb)
  const taSignals = fetchTaSignals(resolvedDb, opts.computeTaFn)

  // Silent skip when all three sources are empty
  if (movers.length === 0 && alerts.length === 0 && taSignals.length === 0) {
    return { sent: false, moverCount: 0, alertCount: 0, taSignals: [] }
  }

  const dateStr = formatDateVI(nowFn())
  const message = formatFranceSummaryVI(dateStr, movers, alerts, taSignals)

  try {
    await resolvedSend(message)
    return { sent: true, moverCount: movers.length, alertCount: alerts.length, taSignals }
  } catch (err) {
    logger.warn("[franceSummaryJob] Telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { sent: false, moverCount: movers.length, alertCount: alerts.length, taSignals }
  }
}
