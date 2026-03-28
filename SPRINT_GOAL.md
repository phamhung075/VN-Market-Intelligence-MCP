# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 003

### Goal
Add news intelligence and the watchlist/alert system so Claude can monitor stocks and detect market-moving events in real time.

### Scope

**IN**
- 021: RSS base fetcher + CafeF news — pull live headlines from CafeF RSS feed
- 082: Watchlist MCP tools (add/remove/get/update) — CRUD operations + threshold persistence
- 063: Signal detector (price + news + report) — domain service that classifies raw events into typed signals
- 064: Multi-signal alert generator — combines signals against thresholds and writes Alert rows to SQLite
- 086: Alert MCP tools (get_alerts, briefing, history) — Claude-callable interface for the alert system

**OUT (deferred to Sprint 004+)**
- 022-028: Other news fetchers (VnExpress, Reuters, Trading Economics, Yahoo Finance, HOSE/HNX prices, SBV macro)
- 061-062: News normalizer + cascade engine (needs more fetchers first)
- 065-066: Pattern matcher, AI summary generator
- 083-084: Analysis MCP tools, Market MCP tools
- 101-105: Scheduler jobs (morning briefing, news poll, market scan, SSC nightly, evening summary)
- 121-125: Dedicated integration/E2E test suites

### Success Metric
1. User calls `add_to_watchlist('VCB', 'HOSE', 'banking')` — tool returns success; stock persists in SQLite.
2. `fetch_cafef_news()` returns ≥ 5 news items with title, url, publishedAt, and summary.
3. Signal detector processes a news item mentioning VCB and returns at least one Signal with type `news_mention` and stock `VCB`.
4. Alert generator produces an Alert with severity ≥ `medium` when 2+ signals fire for a watchlist stock.
5. `get_alerts()` returns the generated alert; `run_daily_briefing()` returns a structured report containing VCB.

### Dependency chain

```
082 (Watchlist tools)  ← depends on 081 ✅, 002 ✅ — start immediately
021 (CafeF RSS fetcher) ← depends on 003 ✅ — start immediately
  └─ 063 (Signal detector) ← depends on 021, 082
       └─ 064 (Alert generator) ← depends on 063, 002 ✅
            └─ 086 (Alert MCP tools) ← depends on 064, 081 ✅
```

### Sprint task order (recommended)
1. 082 + 021 in parallel (independent, all dependencies already Done)
2. 063 (depends on 021 and 082)
3. 064 (depends on 063)
4. 086 (depends on 064 and 081 ✅)

---

## Completed Sprints

| Sprint | Goal | Status |
|--------|------|--------|
| 000 | Project setup, DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
| 001 | BCTC RAG pipeline: cash flow, ratio, delta, orchestrator, RAG retriever | Done |
| 002 | SSC portal scraper, PDF extractor, full BCTC pipeline, Bun MCP server, SSC report MCP tools | Done |
