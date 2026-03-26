# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 002

### Goal
Connect the BCTC pipeline to real Vietnamese financial data and serve it via MCP — so Claude can fetch, parse, and return live financial reports for any listed stock.

### Scope

**IN**
- 029: SSC portal scraper — get report URLs from congbothongtin.ssc.gov.vn
- 030: PDF downloader + pdf-parse text extractor
- 048: SSC fetch → parse → store pipeline (full end-to-end application use case)
- 081: Bun HTTP server + SSE transport (MCP server entry point)
- 085: SSC report MCP tools (fetch_ssc_reports / get_financial_summary / compare_financials)

**OUT (deferred to Sprint 003)**
- News fetchers (021–028)
- Analysis / cascade engine (061–066)
- Alert tools (086)
- Scheduler jobs (101–105)

### Success Metric
1. Claude connects to the server via MCP SSE (`GET http://localhost:3000/sse` returns 200).
2. User calls `fetch_ssc_reports('VCB', 'quarterly', 2024)` — tool triggers full pipeline: scrape SSC → download PDF → parse all 3 statements → compute ratios → embed → store in SQLite + LanceDB.
3. Returned payload has `netRevenue > 0`, `totalAssets > 0`, PE and ROE ratios populated.
4. User calls `get_financial_summary('VCB')` — returns formatted human-readable metrics block.

### Dependency chain

```
029 (SSC scraper)
  └─ 030 (PDF extractor)
       └─ 048 (pipeline: fetch → parse → store)  ← depends on 047 ✅, 011 ✅
            └─ 085 (MCP tools: fetch/summary/compare)
                 └─ requires 081 (Bun MCP server) — can run in parallel with 029
```

### Sprint task order (recommended)
1. 081 + 029 in parallel (no shared dependency)
2. 030 (depends on 029)
3. 048 (depends on 029, 030, 047 ✅, 011 ✅)
4. 085 (depends on 048, 081)

---

## Completed Sprints

| Sprint | Goal | Status |
|--------|------|--------|
| 000 | Project setup, DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
| 001 | BCTC RAG pipeline: cash flow, ratio, delta, orchestrator, RAG retriever | Done |
