/**
 * Report tools — SSC BCTC financial report fetching, parsing, and analysis
 * Source: congbothongtin.ssc.gov.vn
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getDb } from '../db/schema.js'

const StockCode  = z.string().min(2).max(10).toUpperCase()
const ReportType = z.enum(['quarterly', 'semi-annual', 'annual', 'all']).default('all')
const PeriodType = z.enum(['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'ANNUAL'])

export function registerReportTools(server: McpServer) {

  // ── fetch_ssc_reports ─────────────────────────────────────────────────
  server.tool(
    'fetch_ssc_reports',
    'Scrape new financial reports (báo cáo tài chính) from congbothongtin.ssc.gov.vn for one stock or all watchlist stocks. Downloads PDFs, extracts financials, stores in database.',
    {
      actionCode: StockCode.optional()
        .describe('Stock code to fetch. If omitted, fetches for ALL watchlist stocks.'),
      reportType: ReportType,
      year: z.number().min(2010).max(2030).optional()
        .describe('Specific year to fetch. Defaults to current year.'),
      forceRefresh: z.boolean().default(false)
        .describe('Re-download even if report already exists in database'),
    },
    async ({ actionCode, reportType, year, forceRefresh }) => {
      // TODO: implement in src/fetchers/reports/ssc.ts
      const target = actionCode ?? 'all watchlist stocks'
      return {
        content: [{
          type: 'text' as const,
          text: `Fetching SSC reports for ${target} (type=${reportType}, year=${year ?? 'current'}, force=${forceRefresh})\n[stub] — implement in src/fetchers/reports/ssc.ts`,
        }]
      }
    }
  )

  // ── get_financial_summary ─────────────────────────────────────────────
  server.tool(
    'get_financial_summary',
    'Get a structured financial summary for a stock from the database: latest revenue, net profit, EPS, key ratios (ROE, ROA, margins, D/E), and trend vs previous period.',
    {
      actionCode: StockCode,
      periodType: PeriodType.optional()
        .describe('Period type filter. If omitted, returns latest available.'),
      year: z.number().optional(),
      quarter: z.number().min(1).max(4).optional(),
    },
    async ({ actionCode, periodType, year, quarter }) => {
      const db = getDb()

      // Build query filter
      let where = 'WHERE action_code = ?'
      const params: (string | number)[] = [actionCode]

      if (year)        { where += ' AND period_year = ?';    params.push(year)        }
      if (quarter)     { where += ' AND period_quarter = ?'; params.push(quarter)     }
      if (periodType)  { where += ' AND period_type = ?';    params.push(periodType)  }

      const row = db.prepare(
        `SELECT * FROM v_chart_timeseries ${where} ORDER BY sort_key DESC LIMIT 1`
      ).get(...params) as any

      if (!row) {
        return {
          content: [{
            type: 'text' as const,
            text: `No financial data found for ${actionCode}${year ? ` ${year}` : ''}${quarter ? ` Q${quarter}` : ''}. ` +
                  `Run fetch_ssc_reports first.`,
          }]
        }
      }

      const summary = [
        `📊 ${actionCode} — ${row.period} (${row.audit_status})`,
        ``,
        `Revenue        : ${row.net_revenue_ty?.toFixed(1)} tỷ VND`,
        `Gross Profit   : ${row.gross_profit_ty?.toFixed(1)} tỷ VND  (${row.gross_margin_pct?.toFixed(1)}%)`,
        `Net Profit     : ${row.net_profit_ty?.toFixed(1)} tỷ VND  (${row.net_margin_pct?.toFixed(1)}%)`,
        `EBITDA         : ${row.ebitda_ty?.toFixed(1)} tỷ VND`,
        `EPS            : ${row.eps?.toLocaleString()} VND/CP`,
        ``,
        `ROE            : ${row.roe?.toFixed(1)}%`,
        `ROA            : ${row.roa?.toFixed(1)}%`,
        `D/E ratio      : ${row.debt_to_equity?.toFixed(2)}x`,
        `Net Debt/EBITDA: ${row.net_debt_to_ebitda?.toFixed(2)}x`,
        `Current ratio  : ${row.current_ratio?.toFixed(2)}x`,
        ``,
        `Total Assets   : ${row.total_assets_ty?.toFixed(1)} tỷ VND`,
        `Equity         : ${row.equity_ty?.toFixed(1)} tỷ VND`,
        `Cash           : ${row.cash_ty?.toFixed(1)} tỷ VND`,
        `Operating CF   : ${row.operating_cf_ty?.toFixed(1)} tỷ VND`,
        `P/E            : ${row.pe?.toFixed(1)}x`,
        `P/B            : ${row.pb?.toFixed(1)}x`,
        ``,
        `Published: ${row.published_at ?? 'unknown'}`,
      ].join('\n')

      return { content: [{ type: 'text' as const, text: summary }] }
    }
  )

  // ── compare_financials ────────────────────────────────────────────────
  server.tool(
    'compare_financials',
    'Compare financial performance of a stock between two periods: year-over-year (YoY) or quarter-over-quarter (QoQ). Shows absolute and % change for all key metrics.',
    {
      actionCode:  StockCode,
      compareType: z.enum(['YoY', 'QoQ']).default('YoY'),
      year:        z.number().describe('Reference year'),
      quarter:     z.number().min(1).max(4).optional()
        .describe('Reference quarter (required for QoQ)'),
    },
    async ({ actionCode, compareType, year, quarter }) => {
      const db = getDb()

      // Fetch from v_yoy_comparison view
      let row: any
      if (compareType === 'YoY') {
        row = db.prepare(`
          SELECT * FROM v_yoy_comparison
          WHERE action_code = ? AND curr_year = ? ${quarter ? 'AND period_type = ?' : ''}
          LIMIT 1
        `).get(...([actionCode, year, quarter ? `Q${quarter}` : undefined].filter(Boolean))) as any
      }

      if (!row) {
        return {
          content: [{
            type: 'text' as const,
            text: `No comparison data for ${actionCode} ${year}${quarter ? ` Q${quarter}` : ''}. Need at least 2 periods in database.`,
          }]
        }
      }

      const fmt = (v: number | null, suffix = '') =>
        v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}${suffix}` : 'N/A'

      const lines = [
        `📈 ${actionCode} — ${compareType} Comparison: ${row.curr_year} vs ${row.prev_year} (${row.period_type})`,
        ``,
        `Metric            ${row.prev_year}          ${row.curr_year}          Change`,
        `─────────────────────────────────────────────────────────`,
        `Revenue (tỷ VND)  ${row.prev_revenue_ty?.toFixed(1).padStart(10)}   ${row.curr_revenue_ty?.toFixed(1).padStart(10)}   ${fmt(row.revenue_yoy_pct, '%')}`,
        `Net Profit (tỷ)   ${row.prev_profit_ty?.toFixed(1).padStart(10)}   ${row.curr_profit_ty?.toFixed(1).padStart(10)}   ${fmt(row.profit_yoy_pct, '%')}`,
        `EPS (VND/CP)      ${row.prev_eps?.toFixed(0).padStart(10)}   ${row.curr_eps?.toFixed(0).padStart(10)}   ${fmt(row.eps_yoy_pct, '%')}`,
        `Net Margin        ${''.padStart(10)}   ${''.padStart(10)}   ${fmt(row.net_margin_pp, 'pp')}`,
        `Gross Margin      ${''.padStart(10)}   ${''.padStart(10)}   ${fmt(row.gross_margin_pp, 'pp')}`,
        `ROE               ${''.padStart(10)}   ${''.padStart(10)}   ${fmt(row.roe_pp, 'pp')}`,
      ]

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )
}
