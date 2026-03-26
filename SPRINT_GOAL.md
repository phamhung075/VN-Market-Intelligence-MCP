# Sprint Goal

## Current Sprint

status: PLANNING
sprint_id: 001

### Goal
Complete the BCTC RAG pipeline so Claude can fetch a Vietnamese financial report, parse all 3 statements, compute ratios, embed, and store — then answer investment questions about it.

### Scope
**IN**: Cash flow extractor, RAG retriever, BCTC pipeline use case, MCP tool for BCTC search
**OUT**: SSC live scraper (use fixture PDFs for now), market price feeds, alert engine

### Success Metric
Agent can call `fetch_ssc_reports('VCB', 'quarterly', 2024)` and receive a response with:
- netRevenue > 0
- totalAssets > 0
- PE ratio, ROE ratio computed
- Result stored in LanceDB (searchable by semantic query)

---

## Completed Sprints

| Sprint | Goal | Status |
|--------|------|--------|
| 000 | Project setup, DB schema, env config, embeddings, vectorstore, watchlist, BCTC balance sheet + income stmt | Done |
