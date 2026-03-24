/**
 * Alert tools — manage alerts and generate daily briefings
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/schema.js'

export function registerAlertTools(server: McpServer) {

  // ── get_alerts ────────────────────────────────────────────────────────
  server.tool(
    'get_alerts',
    'List investment alerts. Filter by severity, read status, or date range.',
    {
      severity:    z.enum(['info', 'warning', 'critical', 'all']).default('all'),
      unreadOnly:  z.boolean().default(false),
      actionCode:  z.string().optional().describe('Filter by specific stock code'),
      limitDays:   z.number().min(1).max(90).default(7)
        .describe('Show alerts from the last N days'),
      limit:       z.number().min(1).max(100).default(20),
    },
    async ({ severity, unreadOnly, actionCode, limitDays, limit }) => {
      const db = getDb()

      const since = new Date(Date.now() - limitDays * 86_400_000).toISOString()

      let where = 'WHERE triggered_at >= ?'
      const params: (string | number)[] = [since]

      if (severity !== 'all') { where += ' AND severity = ?'; params.push(severity) }
      if (unreadOnly)         { where += ' AND read = 0' }
      if (actionCode)         { where += ' AND affected_actions LIKE ?'; params.push(`%${actionCode}%`) }

      params.push(limit)

      const rows = db.prepare(
        `SELECT * FROM alerts ${where} ORDER BY triggered_at DESC LIMIT ?`
      ).all(...params) as any[]

      if (rows.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No alerts found for the last ${limitDays} days` +
                  (severity !== 'all' ? ` (severity: ${severity})` : '') +
                  (unreadOnly ? ' (unread only)' : ''),
          }]
        }
      }

      const icons: Record<string, string> = { info: 'ℹ', warning: '⚠', critical: '🚨' }

      const lines = [
        `🔔 Alerts — last ${limitDays} days (${rows.length} found)\n`,
        ...rows.map(r => {
          const icon = icons[r.severity] ?? '•'
          const read = r.read ? '✓' : '●'
          const actions = JSON.parse(r.affected_actions_json ?? '[]')
            .map((a: any) => `${a.code} ${a.expectedImpact === 'up' ? '↑' : '↓'} (${(a.confidence * 100).toFixed(0)}%)`)
            .join(', ')
          return `${read} ${icon} [${r.severity.toUpperCase()}] ${r.triggered_at.slice(0, 16)}\n` +
                 `   Signals: ${JSON.parse(r.signals_json ?? '[]').join(', ')}\n` +
                 `   Impacts: ${actions || 'none'}\n` +
                 `   ${r.message ?? ''}`
        })
      ]

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  // ── mark_alert_read ───────────────────────────────────────────────────
  server.tool(
    'mark_alert_read',
    'Mark one or all alerts as read',
    {
      alertId: z.string().optional()
        .describe('Specific alert ID to mark. If omitted, marks ALL unread alerts as read.'),
      note: z.string().max(500).optional()
        .describe('Optional personal note / reaction to this alert'),
    },
    async ({ alertId, note }) => {
      const db = getDb()
      let changes: number

      if (alertId) {
        changes = db.prepare(
          `UPDATE alerts SET read = 1, user_note = ? WHERE id = ?`
        ).run(note ?? null, alertId).changes
      } else {
        changes = db.prepare(`UPDATE alerts SET read = 1 WHERE read = 0`).run().changes
      }

      return {
        content: [{
          type: 'text' as const,
          text: `✓ Marked ${changes} alert(s) as read${note ? `. Note saved.` : '.'}`,
        }]
      }
    }
  )

  // ── run_daily_briefing ────────────────────────────────────────────────
  server.tool(
    'run_daily_briefing',
    'Generate a full daily briefing: overnight news summary, active alerts, watchlist performance, macro context (VN-Index, USD/VND, oil, gold), and key events to watch today.',
    {
      includeCharts: z.boolean().default(false)
        .describe('Include ASCII chart data for key metrics'),
    },
    async ({ includeCharts }) => {
      // TODO: aggregate all modules — news, market, alerts, macro
      return {
        content: [{
          type: 'text' as const,
          text: [
            `📅 VN Market Daily Briefing — ${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            ``,
            `[stub] — This tool will aggregate:`,
            `  1. Overnight global news + causal impact analysis`,
            `  2. Active unread alerts`,
            `  3. Watchlist price performance`,
            `  4. Macro snapshot: VN-Index, USD/VND, oil (WTI/Brent), gold`,
            `  5. New SSC reports published`,
            `  6. Key events today (FOMC, earnings, macro releases)`,
            ``,
            `Implement in src/tools/alerts.ts by calling:`,
            `  - fetchAllNews()        → src/fetchers/news/`,
            `  - getMarketSnapshot()   → src/fetchers/market/`,
            `  - getUnreadAlerts()     → src/db/`,
            `  - runImpactAnalysis()   → src/analysis/cascade.ts`,
          ].join('\n'),
        }]
      }
    }
  )

  // ── get_analysis_history ──────────────────────────────────────────────
  server.tool(
    'get_analysis_history',
    'Retrieve the history of AI analyses stored in the RAG database. Filter by stock, sector, context level, or date range.',
    {
      actionCode:  z.string().optional(),
      domain:      z.string().optional().describe('Sector filter, e.g. "oil_gas"'),
      level:       z.enum(['global', 'country', 'domain', 'action']).optional(),
      fromDate:    z.string().optional().describe('ISO date: start of range'),
      toDate:      z.string().optional().describe('ISO date: end of range'),
      limit:       z.number().min(1).max(50).default(10),
    },
    async ({ actionCode, domain, level, fromDate, toDate, limit }) => {
      const db = getDb()

      let where = 'WHERE 1=1'
      const params: (string | number)[] = []

      if (level)      { where += ' AND level = ?';           params.push(level) }
      if (fromDate)   { where += ' AND created_at >= ?';     params.push(fromDate) }
      if (toDate)     { where += ' AND created_at <= ?';     params.push(toDate) }
      if (actionCode) { where += ' AND affected_actions LIKE ?'; params.push(`%${actionCode}%`) }
      if (domain)     { where += ' AND affected_domains LIKE ?'; params.push(`%${domain}%`) }

      params.push(limit)

      const rows = db.prepare(
        `SELECT id, level, created_at, source_title, sentiment, impact_score, impact_direction, summary
         FROM rag_analyses ${where} ORDER BY created_at DESC LIMIT ?`
      ).all(...params) as any[]

      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No analyses found matching filters.' }] }
      }

      const lines = [
        `📚 Analysis History (${rows.length} entries)\n`,
        ...rows.map(r =>
          `[${r.level.toUpperCase()}] ${r.created_at.slice(0, 16)} | ${r.sentiment} | impact ${r.impact_score}/10 ${r.impact_direction}\n` +
          `  ${r.source_title ?? '(no title)'}\n` +
          `  ${r.summary?.slice(0, 120) ?? ''}...`
        )
      ]

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )
}
