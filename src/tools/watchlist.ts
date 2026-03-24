/**
 * Watchlist tools — manage the user's Vietnamese stock portfolio list
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/schema.js'

// ── Shared schemas ────────────────────────────────────────────────────────

const StockCode = z.string().min(2).max(10).toUpperCase()
  .describe('Stock ticker code (e.g. VCB, HPG, GAS)')

const Exchange = z.enum(['HOSE', 'HNX', 'UPCOM'])
  .describe('Vietnamese stock exchange')

const DomainType = z.enum([
  'oil_gas', 'banking', 'real_estate', 'steel', 'aviation',
  'retail', 'tech', 'utilities', 'agriculture', 'insurance',
  'securities', 'pharma', 'other'
]).describe('Business sector / industry')

const AlertThresholds = z.object({
  priceDropPercent:  z.number().min(-100).max(0).default(-3)
    .describe('Alert when price drops below this % (e.g. -3)'),
  priceRisePercent:  z.number().min(0).max(100).default(5)
    .describe('Alert when price rises above this % (e.g. 5)'),
  impactScoreMin:    z.number().min(0).max(10).default(7)
    .describe('Minimum AI impact score to trigger alert (0-10)'),
  reportNew:         z.boolean().default(true)
    .describe('Alert when a new SSC financial report is published'),
})

// ── Tool registration ─────────────────────────────────────────────────────

export function registerWatchlistTools(server: McpServer) {

  // ── add_to_watchlist ───────────────────────────────────────────────────
  server.tool(
    'add_to_watchlist',
    'Add a Vietnamese stock to the investment watchlist with optional alert thresholds',
    {
      code:       StockCode,
      exchange:   Exchange,
      domain:     DomainType.optional(),
      notes:      z.string().max(500).optional()
        .describe('Personal notes about this position'),
      thresholds: AlertThresholds.optional(),
    },
    async ({ code, exchange, domain, notes, thresholds }) => {
      const db = getDb()
      const now = new Date().toISOString()
      const t = thresholds ?? { priceDropPercent: -3, priceRisePercent: 5, impactScoreMin: 7, reportNew: true }

      try {
        db.prepare(`
          INSERT INTO watchlist (code, exchange, domain, notes, added_at,
            alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code) DO UPDATE SET
            exchange = excluded.exchange,
            domain   = excluded.domain,
            notes    = excluded.notes,
            alert_drop_pct   = excluded.alert_drop_pct,
            alert_rise_pct   = excluded.alert_rise_pct,
            alert_impact_min = excluded.alert_impact_min,
            alert_report_new = excluded.alert_report_new
        `).run(
          code, exchange, domain ?? 'other', notes ?? null, now,
          t.priceDropPercent, t.priceRisePercent, t.impactScoreMin,
          t.reportNew ? 1 : 0
        )

        return {
          content: [{
            type: 'text' as const,
            text: `✓ ${code} (${exchange}) added to watchlist.\n` +
                  `Alerts: drop ${t.priceDropPercent}% | rise +${t.priceRisePercent}% | impact ≥${t.impactScoreMin}/10`,
          }]
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }] }
      }
    }
  )

  // ── remove_from_watchlist ──────────────────────────────────────────────
  server.tool(
    'remove_from_watchlist',
    'Remove a stock from the watchlist',
    { code: StockCode },
    async ({ code }) => {
      const db = getDb()
      const result = db.prepare('DELETE FROM watchlist WHERE code = ?').run(code)

      return {
        content: [{
          type: 'text' as const,
          text: result.changes > 0
            ? `✓ ${code} removed from watchlist`
            : `${code} was not in the watchlist`,
        }]
      }
    }
  )

  // ── get_watchlist ──────────────────────────────────────────────────────
  server.tool(
    'get_watchlist',
    'Display all stocks in the watchlist with current alert thresholds and last known price',
    {},
    async () => {
      const db  = getDb()
      const rows = db.prepare(`
        SELECT w.*, p.price, p.change_pct, p.updated_at AS price_updated
        FROM watchlist w
        LEFT JOIN market_prices p ON p.code = w.code
        ORDER BY w.domain, w.code
      `).all() as any[]

      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'Watchlist is empty. Use add_to_watchlist to add stocks.' }] }
      }

      const lines = [
        `📋 Watchlist — ${rows.length} stocks\n`,
        ...rows.map(r =>
          `  ${r.code.padEnd(6)} [${r.exchange}] ${r.domain.padEnd(12)} ` +
          `Price: ${r.price ? `${r.price.toLocaleString()} VND (${r.change_pct > 0 ? '+' : ''}${r.change_pct?.toFixed(2)}%)` : 'N/A'}\n` +
          `         Alerts: ≤${r.alert_drop_pct}% | ≥+${r.alert_rise_pct}% | impact≥${r.alert_impact_min} | report=${r.alert_report_new ? '✓' : '✗'}` +
          (r.notes ? `\n         Notes: ${r.notes}` : '')
        )
      ]

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  // ── update_thresholds ─────────────────────────────────────────────────
  server.tool(
    'update_thresholds',
    'Update the alert thresholds for a specific stock in the watchlist',
    {
      code:       StockCode,
      thresholds: AlertThresholds,
    },
    async ({ code, thresholds }) => {
      const db = getDb()
      const result = db.prepare(`
        UPDATE watchlist SET
          alert_drop_pct   = ?,
          alert_rise_pct   = ?,
          alert_impact_min = ?,
          alert_report_new = ?
        WHERE code = ?
      `).run(
        thresholds.priceDropPercent,
        thresholds.priceRisePercent,
        thresholds.impactScoreMin,
        thresholds.reportNew ? 1 : 0,
        code
      )

      return {
        content: [{
          type: 'text' as const,
          text: result.changes > 0
            ? `✓ ${code} thresholds updated:\n  drop ${thresholds.priceDropPercent}% | rise +${thresholds.priceRisePercent}% | impact ≥${thresholds.impactScoreMin}/10 | report=${thresholds.reportNew}`
            : `${code} not found in watchlist`,
        }]
      }
    }
  )
}
