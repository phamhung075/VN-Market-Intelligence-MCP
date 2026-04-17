/**
 * France Summary Job — Tasks 1316/1317 (Interface / Scheduler Layer)
 *
 * Sends a morning digest of VN market data to the MARKET channel at
 * 07:00 UTC = 08:00 CET (before Paris market open). Relevant to the
 * France-based user who monitors Vietnam markets from UTC+1/+2.
 *
 * Three data sources (each independent, per-query try/catch):
 *   1. Top 3 price movers     — market_prices ORDER BY ABS(change_pct) DESC LIMIT 3
 *   2. Top 3 recent alerts    — alerts ORDER BY severity rank DESC LIMIT 3
 *   3. TA signal count        — COUNT(*) from alerts WHERE signals_json type LIKE 'ta_%'
 *
 * Silent skip when all three sources return empty data.
 * Default sendFn: sendTelegramMarket (MARKET channel — user-facing digests).
 *
 * DDD Layer: interface/scheduler — may import from infrastructure only.
 *
 * All dependencies are injectable for TDD (db, sendFn, nowFn).
 */

import type { Database } from "bun:sqlite"
import { logger } from "../infrastructure/logger.js"

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram send function. */
export type SendFn = (text: string) => Promise<boolean>

/** Result of runFranceSummary. */
export interface FranceSummaryResult {
  /** Whether a message was sent to Telegram. */
  sent: boolean
  /** Number of price movers included (max 3). */
  moverCount: number
  /** Number of alerts included (max 3). */
  alertCount: number
  /** Number of TA signal alerts found in the DB. */
  taCount: number
}

/** Options for runFranceSummary (injectable for TDD). */
export interface FranceSummaryOptions {
  /** SQLite DB (defaults to getDb() singleton). */
  db?: Database
  /** Telegram send function (defaults to sendTelegramMarket). */
  sendFn?: SendFn
  /** Injectable clock (defaults to () => new Date()). */
  nowFn?: () => Date
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
 * Counts alerts that contain at least one signal of type 'ta_%'
 * (RSI, BB breakout, etc. written by taAlertScanJob / bbAlertScanJob).
 * Returns 0 on any DB error.
 */
function fetchTaSignalCount(db: Database): number {
  try {
    const row = db
      .prepare<{ cnt: number }, []>(`
        SELECT COUNT(*) AS cnt
        FROM alerts
        WHERE signals_json LIKE '%"type":"ta_%'
      `)
      .get()
    return row?.cnt ?? 0
  } catch (err) {
    logger.warn("[franceSummaryJob] TA count query failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
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

/**
 * Builds the full digest message in Vietnamese plain-text format.
 */
export function formatFranceSummaryVI(
  dateStr: string,
  movers: MoverRow[],
  alerts: AlertRow[],
  taCount: number,
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

  // Section 3: TA signal count
  lines.push(`Tin hieu ky thuat (TA): ${taCount} tin hieu`)

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
    return { sent: false, moverCount: 0, alertCount: 0, taCount: 0 }
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
  const taCount = fetchTaSignalCount(resolvedDb)

  // Silent skip when all three sources are empty
  if (movers.length === 0 && alerts.length === 0 && taCount === 0) {
    return { sent: false, moverCount: 0, alertCount: 0, taCount: 0 }
  }

  const dateStr = formatDateVI(nowFn())
  const message = formatFranceSummaryVI(dateStr, movers, alerts, taCount)

  try {
    await resolvedSend(message)
    return { sent: true, moverCount: movers.length, alertCount: alerts.length, taCount }
  } catch (err) {
    logger.warn("[franceSummaryJob] Telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { sent: false, moverCount: movers.length, alertCount: alerts.length, taCount }
  }
}
