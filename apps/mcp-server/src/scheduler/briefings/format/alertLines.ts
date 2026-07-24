/**
 * Alert-line formatter — extracted from franceSummaryJob.ts
 * (FACTORY-SCHEDULER-dedup-briefing-formatters, task 1784 originally).
 *
 * Verbatim move — no logic change. Consolidated alongside the other briefing
 * formatters into `format/` even though it was not previously cross-imported
 * by another job file, per the ticket's shared-formatters grouping.
 *
 * Layer: interface/scheduler — imports from infrastructure/notifiers only.
 */

import { TelegramMessageFactory } from "../../../infrastructure/notifiers/telegramMessageFactory.js";

/** Maps severity to a short Vietnamese label. */
function severityLabel(s: string): string {
  switch (s) {
    case "critical": return "NGHIÊM TRỌNG"
    case "high":     return "CAO"
    case "warning":  return "CẢNH BÁO"
    case "info":     return "THÔNG TIN"
    default:         return s.toUpperCase()
  }
}

/**
 * Minimal alert row shape accepted by formatAlertLines.
 * Matches the AlertRow internal interface (id/severity/message/triggered_at).
 */
export interface AlertDisplayRow {
  id: string
  severity: string
  message: string | null
  triggered_at: string
}

/**
 * Render alert rows as indented display lines with two fixes (Task 1784):
 *
 * BUG-4 — Sector label rewrite:
 *   When an alert body (the part after " — ") contains "Ngành", the alert is
 *   sector-level. Extract the sector name from the body and render the label as
 *   "[<SectorName>] Sector (<SEVERITY>)" instead of the per-ticker prefix.
 *
 * BUG-5 — Same-body deduplication:
 *   Multiple alerts whose bodies are identical (same sector event, one row per
 *   watchlist ticker) are collapsed to a single display line. When collapsed,
 *   a "(+N)" suffix shows the total count of original alerts.
 *
 * Returns an array of indented strings (each starting with "  ").
 * Returns [] for empty input.
 *
 * Exported for unit testing.
 */
export function formatAlertLines(alerts: AlertDisplayRow[]): string[] {
  if (alerts.length === 0) return []

  // Group alerts by their body text (part after first " — ").
  // Alerts with no " — " separator use the full message as the key.
  const bodyGroups = new Map<string, { rows: AlertDisplayRow[]; body: string }>()

  for (const a of alerts) {
    const msg = a.message ?? ""
    const sepIdx = msg.indexOf(" — ")
    const body = sepIdx !== -1 ? msg.slice(sepIdx + 3) : msg
    const existing = bodyGroups.get(body)
    if (existing) {
      existing.rows.push(a)
    } else {
      bodyGroups.set(body, { rows: [a], body })
    }
  }

  const lines: string[] = []

  for (const { rows, body } of bodyGroups.values()) {
    const representative = rows[0]!
    const sev = severityLabel(representative.severity)
    const count = rows.length

    // BUG-4: detect sector-level alert by "Ngành" in body
    const sectorMatch = body.match(/Ngành\s+([^\s,.(]+(?:\s+[^\s,.(]+)*?)\s+(giảm|tăng|biến)/)
    if (sectorMatch) {
      const sectorName = sectorMatch[1]!.trim()
      // BUG-5: show count only when > 1
      const countSuffix = count > 1 ? ` (+${count})` : ""
      const formattedBody = TelegramMessageFactory.formatAlertMessage(body)
      lines.push(`  [${sectorName}] Sector (${sev})${countSuffix}: ${formattedBody}`)
    } else {
      // Regular alert — render each individually (different bodies, no collapse)
      for (const a of rows) {
        const msg = TelegramMessageFactory.formatAlertMessage(a.message ?? "")
        lines.push(`  [${sev}] ${msg}`)
      }
    }
  }

  return lines
}
