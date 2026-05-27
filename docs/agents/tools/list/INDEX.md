# MCP Tools Documentation Index

Complete reference for all MCP tools organized by category.

## News-Analysis Tools (13)

### Agent Coordination / Signal Bus
- **[post_agent_signal](post_agent_signal.md)** — Post signal to agent bus for enrichment chain
- **[get_agent_signals](get_agent_signals.md)** — Retrieve pending signals for agent
- **[record_signal_outcome](record_signal_outcome.md)** — Mark signal as fired/suppressed/confirmed
- **[get_signal_effectiveness](get_signal_effectiveness.md)** — Aggregated signal quality metrics
- **[get_open_chain_findings](get_open_chain_findings.md)** — Query open findings for enrichment

### Cascade Engine
- **[get_cascade_metrics](get_cascade_metrics.md)** — Rule hit rates and accuracy overview
- **[get_cascade_outcomes](get_cascade_outcomes.md)** — Rule hits with price impact data

### Sentiment & Analysis
- **[get_sentiment_trend](get_sentiment_trend.md)** — Sentiment trend analysis for stock
- **[compare_stocks](compare_stocks.md)** — Side-by-side stock comparison
- **[compare_financials](compare_financials.md)** — Deep BCTC comparison across stocks
- **[fetch_and_analyze](fetch_and_analyze.md)** — Fetch + normalize news from 4 RSS sources
- **[run_impact_chain](run_impact_chain.md)** — Cascade analysis on headline
- **[search_similar_context](search_similar_context.md)** — RAG semantic search with recency weighting

## Briefings Tools (10)

### Communication
- **[send_telegram](send_telegram.md)** — Send to market/work/bug Telegram channels

### Market Intelligence
- **[get_market_summary](get_market_summary.md)** — Retrieve cached periodic summary
- **[generate_market_summary](generate_market_summary.md)** — Force-generate fresh summary

### Message Quality Review
- **[get_unreviewed_market_messages](get_unreviewed_market_messages.md)** — List unreviewed MARKET messages
- **[review_market_message](review_market_message.md)** — Label message as signal/noise

### Bug Report Workflow
- **[read_telegram_reports](read_telegram_reports.md)** — Read bug reports from BUG channel
- **[claim_telegram_report](claim_telegram_report.md)** — Mark report as claimed (in progress)
- **[process_telegram_report](process_telegram_report.md)** — Mark as processed + delete Telegram message

### Changelog
- **[log_fix](log_fix.md)** — Dev logs fix to changelog
- **[get_recent_fixes](get_recent_fixes.md)** — Check recently-fixed issues before reporting

## Additional Documentation

- **[All Tools](all-tools.md)** — Complete list of 80+ tools across all categories
- **[Tool Categories](categories.md)** — Tools grouped by functional domain
- **[Signal Types Reference](signal-types.md)** — Inter-agent signal classification and schemas

## Organization

All documentation files follow the same template:
1. **Purpose** — What the tool does
2. **Parameters** — Input schema with types and descriptions
3. **Return Format** — Output examples (success + errors)
4. **Use Cases** — When and why to use
5. **Related Tools** — Cross-references
6. **Notes** — Implementation details and constraints

## File Locations

- **News-Analysis tools**: `apps/mcp-server/src/interface/mcp/tools/news-analysis/`
- **Briefings tools**: `apps/mcp-server/src/interface/mcp/tools/briefings/`
- **This documentation**: `docs/agents/tools/list/`

## Quick Lookup

### By Agent
- **News Scout**: fetch_and_analyze, run_impact_chain, search_similar_context, post_agent_signal
- **Market Watcher**: get_cascade_metrics, get_cascade_outcomes, compare_stocks, get_sentiment_trend
- **Financial Analyst**: compare_stocks, compare_financials, get_open_chain_findings
- **Alert Commander**: get_agent_signals, record_signal_outcome, send_telegram
- **Report Analyzer**: compare_stocks, compare_financials, review_market_message
- **Digest & Predict**: get_market_summary, generate_market_summary, send_telegram
- **Dev Team**: read_telegram_reports, claim_telegram_report, process_telegram_report, log_fix

### By Data Model
- **Signals**: post_agent_signal, get_agent_signals, record_signal_outcome, get_signal_effectiveness
- **Cascade Rules**: get_cascade_metrics, get_cascade_outcomes, run_impact_chain
- **News/RAG**: fetch_and_analyze, search_similar_context, get_sentiment_trend
- **Financials**: compare_stocks, compare_financials
- **Market Summaries**: get_market_summary, generate_market_summary
- **Telegram Reports**: read_telegram_reports, claim_telegram_report, process_telegram_report
- **Changelog**: log_fix, get_recent_fixes

### By Workflow

**News Ingestion → Analysis → Signaling**
1. fetch_and_analyze — get latest news
2. run_impact_chain — cascade analysis
3. search_similar_context — find similar historical context
4. post_agent_signal — share findings
5. get_agent_signals — other agents receive signals
6. record_signal_outcome — track accuracy

**Bug Reporting → Fix → Resolution**
1. send_telegram(channel="bug") — report issue
2. read_telegram_reports — dev picks up
3. claim_telegram_report — mark in progress
4. process_telegram_report — mark fixed + delete message
5. log_fix — record in changelog

**Market Briefing**
1. fetch_and_analyze — get latest news
2. generate_market_summary — create summary
3. get_market_summary — retrieve cached summary
4. send_telegram(channel="market") — send to users
5. get_unreviewed_market_messages — quality review
6. review_market_message — label signal/noise

## Notes

- All tools in this list are production tools registered on the MCP server
- Parameter types use Zod schema notation (z.enum, z.string, z.number, etc.)
- Return format is always MCP-standard JSON with content array
- Tool calls are asynchronous; errors return isError: true flag
- Vietnamese text is used for user-facing output; English for internal/technical
