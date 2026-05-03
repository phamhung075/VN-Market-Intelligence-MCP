# RAG Utilization Audit — Task 1840a
> Auditor: system-auditor | Date: 2026-05-03 | Sprint: 1840

---

## Summary

The RAG layer (`retriever.ts` / LanceDB) has two confirmed write paths and zero confirmed
automated read paths at runtime. The `tool-usage-stats.json` showing `sessionCount: 0` is
expected — the tracker records only Cowork SSE sessions, not cron-initiated tool calls. The
instrumentation itself is not broken; there simply have been no Cowork agent sessions since
the last 8-hour tracker flush.

The high-frequency news ingestion path (`pollNews`) writes to **SQLite** (`rag_analyses` table)
but does NOT write to **LanceDB** (the vector store). Every news article processed through the
VPS push pipeline and the `intelligenceCycleJob` misses the embedding step entirely. This is
the primary gap.

---

## Write Path Audit

### Confirmed Write Path 1 — `fetch_and_analyze` MCP tool
- File: `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts:183`
- Calls `insertAnalysis(...)` in parallel for all entries after SQLite insert (step 4)
- Status: **WORKING** — but only fires when a Cowork agent explicitly calls `fetch_and_analyze`
- Frequency: agent-initiated only (not scheduled)
- Gap: `fetch_and_analyze` is NOT called by `intelligenceCycleJob`. The scheduled cycle uses
  `pollNews` directly, which bypasses this tool entirely.

### Confirmed Write Path 2 — `fetchParseAndStoreBctc`
- File: `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts:428`
- Calls `insertAnalysis(...)` (non-fatal, wrapped in try/catch) after BCTC PDF extraction
- Status: **WORKING** — fires on `bctcReparseJob` cron
- Frequency: per BCTC PDF processed (low frequency, quarterly cycle)
- Note: `insertAnalysisFn` is injectable — tests mock it; production uses real `insertAnalysis`

### Missing Write Path — `pollNews` (high-frequency cron)
- File: `apps/mcp-server/src/application/usecases/pollNews.ts`
- The function inserts news articles into `rag_analyses` (SQLite) via `tryInsertEntry()` at line ~858
- The function calls `retriever(entry.summary, { k: 3 })` at line ~925 — this **reads** from
  LanceDB (via `searchContext`) as part of the cascade chain
- The function does **NOT** call `insertAnalysis` anywhere — confirmed by `grep` returning zero matches
- All VPS-pushed news (226 items/15min via POST `/api/push-news`) flows through `pollNews`
  (server.ts:407 — `setImmediate` block calls `pollNews` with VPS fetchers)
- Status: **GAP CONFIRMED** — Fix A required

### Write Path Architecture Note
- `intelligenceCycleJob.ts:207` stubs ALL fetchers to `async () => []` (Task 1228)
- Real news ingestion happens exclusively in `server.ts` via the VPS push endpoint
- The `pollNews` path in `server.ts:407` is the only high-frequency write path for news
- That path reaches `tryInsertEntry` (SQLite) but never `insertAnalysis` (LanceDB)

---

## Read Path Audit

### Confirmed Read Path 1 — `pollNews` cascade (indirect)
- File: `apps/mcp-server/src/application/usecases/pollNews.ts:925`
- Calls `retriever(entry.summary, { k: 3 })` for RAG-enriched cascade context
- `retriever` defaults to `defaultRagRetriever` which calls `searchContext`
- Status: **WIRED** — reads from LanceDB, but LanceDB is likely empty (write path missing)
- Result: returns `[]` on every call since no news entries have been embedded

### Confirmed Read Path 2 — `runImpactChain`
- File: `apps/mcp-server/src/application/usecases/runImpactChain.ts:239`
- Lazy-imports `searchContext` as default `RagRetriever`
- Status: **WIRED** — but only fires when `run_impact_chain` MCP tool is called by an agent

### Confirmed Read Path 3 — `runPredictionImpactChain`
- Not found as a distinct file — likely same pattern as `runImpactChain`
- Status: agent-initiated only, same low-frequency constraint

### Confirmed Read Path 4 — `search_similar_context` MCP tool
- File: `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts:341`
- Registered as an MCP tool, directly calls `searchContext`
- Status: **REGISTERED** — but never referenced in any cowork agent flow file (see below)

---

## Cowork Agent Flow Audit

### News Scout — `.claude/flows/news-scout/cycle.md`
- Step 1: calls `fetch_and_analyze` — this DOES write to LanceDB (Path 1 above)
- Steps 2–3: `run_impact_chain` — this DOES read from LanceDB (Path 2 above)
- `search_similar_context`: **NOT REFERENCED** anywhere in the flow
- The agent does not perform explicit historical pattern matching before generating analysis
- Status: **Fix B required**

### Financial Analyst — `.claude/flows/financial-analyst/cycle.md`
- Step 2: calls `get_bctc_full`, `get_sector_comparison`, `get_kinhdich_reading`
- Step 4: calls `get_open_chain_findings`
- `search_similar_context`: **NOT REFERENCED** anywhere in the flow
- No step fetches similar past BCTC quarterly patterns from RAG before analysis
- Status: **Fix C required**

### Tool permissions cross-check
- `news-scout.md` tools list: does NOT include `search_similar_context`
- `financial-analyst.md` tools list: does NOT include `search_similar_context`
- Both agents lack permission to call the tool — wiring in flow files alone is insufficient;
  the tool must also be added to each agent's `tools:` list

---

## LanceDB Entry Count

- `GET http://localhost:5002/health` returns: `{"status":"ok","service":"rag-service"}`
- No `/stats` or `/count` endpoint available on the rag-service HTTP API
- Entry count cannot be confirmed via HTTP; requires direct LanceDB volume inspection
- Inference: given the `pollNews` write gap is confirmed, LanceDB likely has very few entries
  (only from BCTC pipeline and any manual `fetch_and_analyze` calls)
- The `pipelineWatchdogJob` uses `rag_analyses.created_at` (SQLite) not LanceDB — so SQLite
  rows exist even though the LanceDB vector store may have zero or near-zero entries

---

## tool-usage-stats.json Assessment

- Current state: `{"sessionCount": 0, "uniqueTools": 0, "toolCounts": {}}`
- Root cause: `trackSessionToolUsageJob` reads from `sessionToolCache`, which is an
  in-memory LRU populated when Cowork agents connect via SSE (`server.ts:140-151`)
- The cache has TTL of 8h and max 100 sessions; it is **reset on server restart**
- `sessionCount: 0` means no Cowork agent SSE session was active in the last 8h window
- This is a **data absence problem**, not an instrumentation bug
- Fix D (from handoff): not a code fix — the stats will self-populate once agents run
- However: the instrumentation tracks which tools were loaded per session, NOT how many
  times each tool was called. Even after agents run, `search_similar_context` will only
  appear if it is in the agent's `skills`/`tools` list, not based on actual invocation count
- This means Fix D requires ensuring `search_similar_context` is in agent tool lists (same
  action as Fix B/C)

---

## Fix Priority Assessment

| Fix | Description | Severity | ROI | Required |
|-----|-------------|----------|-----|----------|
| A | Wire `pollNews` → `insertAnalysis` for each ingested news article | HIGH | HIGHEST — 226 articles/15min, this is the primary write path | YES |
| B | Add `search_similar_context` to News Scout flow + tools list | MEDIUM | HIGH — enables historical precedent matching on every news cycle | YES |
| C | Add `search_similar_context` to Financial Analyst flow + tools list | MEDIUM | HIGH — enables quarterly pattern matching on BCTC analysis | YES |
| D | Fix tool-usage-stats instrumentation | LOW | LOW — self-resolves after B+C; current 0 is correct | PARTIAL |

### Fix A Detail (highest ROI)
- Location: `apps/mcp-server/src/application/usecases/pollNews.ts`
- After `tryInsertEntry` returns `true` (line ~860), add non-fatal `insertAnalysis` call
- Use `level: entry.affectedActions.length > 0 ? "action" : "domain"`
- Tags: `["news", entry.sourceType, ...entry.affectedActions.map(c => c.toLowerCase())]`
- Content: `title: entry.sourceTitle`, `summary: entry.summary`
- Must inject `insertAnalysisFn` option (same pattern as `ragRetriever`) for testability
- Test: mock-inject `insertAnalysisFn` and verify it is called once per new article

### Fix B Detail
- Location 1: `.claude/agents/news-scout.md` — add `search_similar_context` to `tools:` list
- Location 2: `.claude/flows/news-scout/cycle.md` — add step before step 2:
  "Before sentiment scoring, call `search_similar_context(query=main_news_theme, k=3)` to
  retrieve historical precedents. Include results as context: 'N similar past events: ...'"

### Fix C Detail
- Location 1: `.claude/agents/financial-analyst.md` — add `search_similar_context` to `tools:` list
- Location 2: `.claude/flows/financial-analyst/cycle.md` — add step after step 2 BCTC fetch:
  "Call `search_similar_context(query=ticker+quarter_summary, action_code=ticker, k=3,
  recency_days=365)` to retrieve similar past BCTC patterns before generating verdict"

---

## Exact Gap Locations

| Gap | File | Line | Issue |
|-----|------|------|-------|
| No RAG write in pollNews | `apps/mcp-server/src/application/usecases/pollNews.ts` | ~858 (after `tryInsertEntry`) | `insertAnalysis` never called |
| No search_similar_context in news-scout flow | `.claude/flows/news-scout/cycle.md` | Step 2 (before sentiment) | Step missing |
| No search_similar_context in news-scout tools | `.claude/agents/news-scout.md` | line 5 (tools list) | Tool not permitted |
| No search_similar_context in financial-analyst flow | `.claude/flows/financial-analyst/cycle.md` | Step 2 (after BCTC fetch) | Step missing |
| No search_similar_context in financial-analyst tools | `.claude/agents/financial-analyst.md` | line 5 (tools list) | Tool not permitted |

---

## Acceptance Criteria Forecast

| AC | Status after fixes |
|----|-------------------|
| AC-1 | DONE — this report |
| AC-2 | Needs Fix A |
| AC-3 | Needs Fix B (flow + tools list) |
| AC-4 | Needs Fix C (flow + tools list) |
| AC-5 | Requires `bun test` run by developer/qa |
| AC-6 | Requires new test file for pollNews RAG write |
| AC-7 | Self-resolves after B+C + next agent cycle |
