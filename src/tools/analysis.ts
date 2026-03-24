/**
 * Analysis tools — news fetching, impact chain, market snapshot, RAG search
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerAnalysisTools(server: McpServer) {

  // ── fetch_and_analyze ─────────────────────────────────────────────────
  server.tool(
    'fetch_and_analyze',
    'Fetch latest news from all sources (or a specific URL) and analyze their impact on the watchlist using the causal chain: global → country → sector → action',
    {
      url: z.string().url().optional()
        .describe('Optional specific URL to analyze. If omitted, fetches all configured news sources.'),
      maxItems: z.number().min(1).max(50).default(20)
        .describe('Maximum number of news items to process'),
    },
    async ({ url, maxItems }) => {
      // TODO: implement in src/fetchers/ + src/analysis/cascade.ts
      return {
        content: [{
          type: 'text' as const,
          text: url
            ? `Analyzing: ${url}\n[stub] — implement in src/fetchers/ + src/analysis/cascade.ts`
            : `Fetching last ${maxItems} news from all sources...\n[stub] — implement in src/fetchers/`,
        }]
      }
    }
  )

  // ── run_impact_chain ──────────────────────────────────────────────────
  server.tool(
    'run_impact_chain',
    'For a given news text, trace the full causal impact chain: global event → macroeconomic effect → affected Vietnamese sectors → specific watchlist stocks with expected price direction',
    {
      newsText: z.string().min(10).max(5000)
        .describe('The news content to analyze'),
      newsTitle: z.string().optional(),
      sourceUrl: z.string().url().optional(),
    },
    async ({ newsText, newsTitle }) => {
      // TODO: implement in src/analysis/cascade.ts
      return {
        content: [{
          type: 'text' as const,
          text: `Impact chain analysis for: "${newsTitle ?? newsText.slice(0, 80)}..."\n[stub] — implement in src/analysis/cascade.ts`,
        }]
      }
    }
  )

  // ── get_market_snapshot ───────────────────────────────────────────────
  server.tool(
    'get_market_snapshot',
    'Get current market snapshot: VN-Index, all watchlist stock prices with day change, top gainers/losers, key macro indicators (USD/VND, oil price, gold)',
    {},
    async () => {
      // TODO: implement in src/fetchers/market/
      return {
        content: [{
          type: 'text' as const,
          text: '[stub] — implement in src/fetchers/market/hose.ts + hnx.ts',
        }]
      }
    }
  )

  // ── search_similar_context ────────────────────────────────────────────
  server.tool(
    'search_similar_context',
    'RAG semantic search: find past analyses similar to a query. Returns matching historical analyses with their impact outcomes — useful for pattern recognition.',
    {
      query: z.string().min(5).max(1000)
        .describe('Natural language query, e.g. "oil price spike impact on GAS stock"'),
      level: z.enum(['global', 'country', 'domain', 'action']).optional()
        .describe('Filter by context level'),
      actionCode: z.string().optional()
        .describe('Filter by specific stock code'),
      limit: z.number().min(1).max(20).default(5),
    },
    async ({ query, level, actionCode, limit }) => {
      // TODO: implement in src/rag/retriever.ts
      return {
        content: [{
          type: 'text' as const,
          text: `RAG search: "${query}" (level=${level ?? 'all'}, stock=${actionCode ?? 'all'}, top ${limit})\n[stub] — implement in src/rag/retriever.ts`,
        }]
      }
    }
  )

  // ── get_pattern_summary ───────────────────────────────────────────────
  server.tool(
    'get_pattern_summary',
    'Analyze historical patterns for a stock: how has it reacted to specific event types in the past? E.g. "How does GAS typically respond to oil price increases?"',
    {
      actionCode: z.string().describe('Stock ticker code'),
      eventType:  z.string().optional()
        .describe('Optional event type filter, e.g. "oil price", "USD/VND", "interest rate"'),
      periodMonths: z.number().min(1).max(60).default(24)
        .describe('Look-back period in months'),
    },
    async ({ actionCode, eventType, periodMonths }) => {
      // TODO: implement in src/analysis/patterns.ts + src/rag/retriever.ts
      return {
        content: [{
          type: 'text' as const,
          text: `Pattern summary for ${actionCode}${eventType ? ` / "${eventType}"` : ''} over ${periodMonths} months\n[stub] — implement in src/analysis/patterns.ts`,
        }]
      }
    }
  )
}
