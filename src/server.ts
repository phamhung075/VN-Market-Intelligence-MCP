/**
 * VN Market Intelligence MCP — McpServer factory
 * ─────────────────────────────────────────────────────────────────────────
 * Creates and returns a configured McpServer with all tools registered.
 * Each tool group is in its own module under src/tools/.
 *
 * Tool inventory:
 *   Watchlist  → add | remove | get | update_thresholds
 *   Analysis   → fetch_and_analyze | run_impact_chain | get_market_snapshot
 *                search_similar_context | get_pattern_summary
 *   Reports    → fetch_ssc_reports | get_financial_summary | compare_financials
 *   Alerts     → get_alerts | mark_alert_read | run_daily_briefing
 *                get_analysis_history
 * ─────────────────────────────────────────────────────────────────────────
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

// Tool module imports (stubs — implement in src/tools/*.ts)
import { registerWatchlistTools } from './tools/watchlist.js'
import { registerAnalysisTools  } from './tools/analysis.js'
import { registerReportTools    } from './tools/reports.js'
import { registerAlertTools     } from './tools/alerts.js'

// ── Create and configure the MCP server ───────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name:    'vn-market-intelligence',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Register all tool groups
  registerWatchlistTools(server)
  registerAnalysisTools(server)
  registerReportTools(server)
  registerAlertTools(server)

  return server
}
