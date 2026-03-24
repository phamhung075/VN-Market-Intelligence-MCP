/**
 * MCP Interface — barrel export
 *
 * MCP tool handlers and the McpServer factory.
 * Validates input with Zod, delegates to application use cases,
 * and always returns { content: [{ type: 'text', text: ... }] }.
 *
 * Sub-folders:
 *   tools/  — individual tool handler modules (watchlist, analysis, reports, alerts)
 *
 * Populated by future tasks:
 *   - Task 081: Bun HTTP server + SSEServerTransport
 *   - Task 082: Watchlist tools (add / remove / get / update_thresholds)
 *   - Task 083: Analysis tools (fetch_and_analyze, run_impact_chain)
 *   - Task 084: Market tools (snapshot, search_context, patterns)
 *   - Task 085: SSC report tools (fetch / summary / compare)
 *   - Task 086: Alert tools (get_alerts, briefing, history)
 */

// Re-export MCP interface components as they are implemented
export {};
