# Decision Journal — Sprint TOOL-SURFACE-UPGRADE · architect

**Sprint goal:** 162-tool vn-market surface is auditable and honest. 6 units: telemetry counter, registry generator+parity, 12 weak-claim tool verdicts, direction+delta sweep, foreign flow null fix, TSH leftover merge diffs.
**Agent:** architect
**Started:** 2026-06-07T08:03:51Z

---

### STEP architect-S1 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** Resolved ARCH-U2-2 (161 vs 162 delta). sequential_market_analysis uses server.registerTool() not server.tool() — grep for server.tool( misses it. agentBootstrap.ts probe fake server handles both APIs; runtime count = 162 is correct. Static generator must scan BOTH server.tool() AND server.registerTool() call-sites.
**what-considered:**
- Only option: read sequential-market-analysis.ts + agentBootstrap.ts probe implementation
**why-decision:** Evidence is definitive — one tool uses legacy API, the rest use standard API. Generator must handle both to reach 162.
**why-change:** no change from plan

### STEP architect-S2 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** Resolved ARCH-U2-1 (tools outside tools/**/*.ts). Audited: registry.ts is sole import aggregator; no server.tool() calls in server.ts main file; only sequential-market-analysis.ts uses registerTool() from tools/ directory. Generator scope = tools/**/*.ts (both APIs).
**what-considered:**
- Check server.ts: no registrations found (toolRegistry array drives all registration)
- Check bootstrap: intercept only, no new tools
**why-decision:** Registry pattern is centralized via toolRegistry array in registry.ts; all tool files are under tools/
**why-change:** no change from plan

### STEP architect-S3 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U1 counter design: sessionToolCache dead post-gateway (per-call SSE drop confirmed). Design: new in-memory Map `perCallCounterStore` in infrastructure layer; hook via thin wrapper at server.tool() dispatch entry point in agentBootstrap.ts probe or directly in each tool handler via a middleware-style wrapper applied in registry.ts.
**what-considered:**
- Option A: patch agentBootstrap probe to also increment counter — rejected, probe is module-init only not per-call
- Option B: wrap each handler in registry.ts with a counter increment — invasive, 162 callsites
- Option C: intercept at McpServer.tool() call in server.ts after toolRegistry runs — cleanest, single hook point
**why-decision:** Option C: wrap server.tool() registrations post-registry via a server proxy shim; the shim increments an in-memory Map on every handler invocation; job reads the Map. Zero changes to tool handlers.
**why-change:** no change from plan

### STEP architect-S4 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U5 ARCH-U5-1 resolved. VPS fetch-foreign-flow.sh API field audit comment (line 42) explicitly documents that bgapidatafeed.vps.com.vn returns fBVol/fSVolume/fRoom ONLY. No holding_ratio field returned by VPS API. Therefore: serve-null permanently applies for this sprint; holding_ratio ingest fix is a future sprint with a different data source.
**what-considered:**
- Only option: audit vps-scripts/fetch-foreign-flow.sh field mapping
**why-decision:** API field audit is inline in the script with a 2026-05-30 date — authoritative. No holding_ratio in VPS API response.
**why-change:** no change from plan

### STEP architect-S5 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U6 get_market_summary vs generate_market_summary diff. Both in summaryTools.ts, same generatePeriodicSummary() use-case. DISTINCT: get_ = read-cache-first (fallback to generate); generate_ = force-regenerate overwriting cache. They are intentional read/write variants of the same operation, not duplicates. Decision: KEEP BOTH, clarify descriptions only.
**what-considered:**
- Merge option: rejected — callers need both paths (digest-predict agent uses both explicitly)
- Keep with description update: correct — generate_ is used for weekly force-refresh in weekly.md flow
**why-decision:** digest-predict flow/weekly.md calls generate_market_summary(period="weekly") explicitly; digest-predict/daily.md calls get_market_summary — they are consumer-differentiated.
**why-change:** no change from plan

### STEP architect-S6 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U6 get_insider_signals vs get_insider_transactions diff. DISTINCT: get_insider_signals (leadershipTools.ts) = domain classification service wrapping injected transaction list, outputs signal verdicts (buy/sell/mass-buy patterns + confidence), requires caller to provide transactions array. get_insider_transactions (insiderTools.ts) = DB-backed historical lookup from insiderStore, returns raw SSC transaction rows with streak detection. Decision: KEEP BOTH, update descriptions to make data-source distinction explicit.
**what-considered:**
- Merge: rejected — different data paths (domain classifier vs DB query), different input models
- Keep with description update: correct
**why-decision:** get_insider_signals takes transactions as input parameter (caller-provided); get_insider_transactions fetches from insiderStore DB. Different architectural layers and use cases.
**why-change:** no change from plan

### STEP architect-S7 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U6 trigger_*_vps_fetch consolidation ruling. 5 tools have similar shape but diverging schemas: bctc returns {queued, attempted, success, failed, log_tail}, price/news return {service, attempted, success, failed, log_tail}; news tool has no tickers parameter (source-based not ticker-based). Decision: KEEP SEPARATE. Consolidation would require a typed union schema with source-discriminated responses — adds complexity with zero caller benefit since each is called in specialized ops contexts.
**what-considered:**
- Consolidate: trigger_vps_fetch(source: enum) — rejected; response shape diverges too much
- Keep separate with description update: chosen
**why-decision:** bctc tool has dry_run + tickers filter; news tool is source-based; merging into one tool produces a confusing schema. Description update is sufficient.
**why-change:** no change from plan

### STEP architect-S9 · architect · 2026-06-13T16:35:00Z
**task-id:** ARCH-TSU
**what-done:** Authored docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md. All 6 ARCH-BLOCKER resolutions confirmed from brownfield scan already in BA spec. Tool-count binding: SSOT pointer = docs/data/project-stats.json toolCount (not hardcoded). U4 zone split flagged: dev-macro-indicators is separate from dev-mcp-server slot. U3 5-question verdicts finalized: 5 deregister, 7 integrate. Fan-out stubs ordered with TSU-DEV-U2-PARITY as final mcp-server task. sessionCount field REMOVED (semantically wrong post-gateway). No code written.
**what-considered:**
- Only path: write brief from confirmed evidence; all blockers resolved in BA spec brownfield scan 2026-06-07
**why-decision:** All ARCH-BLOCKER resolutions were already in place; brief synthesizes and formalizes them into file:line seams + DoD per AC1-AC9.
**why-change:** no change from plan

### STEP architect-S8 · architect · 2026-06-07T08:03:51Z
**task-id:** ARCH-TSU
**what-done:** U4 ARCH-U4-1 resolved. VnIndex prev-session: market_prices table stores only latest price (PRIMARY KEY = code, no history); market_prices_history stores time-series rows (code, price, fetched_at). daily_ohlcv stores daily close (code, date, close). commodity_prices stores only latest commodity row (single row per source). Conclusion: VnIndex prev-close = daily_ohlcv ORDER BY date DESC LIMIT 2 (second row = yesterday close). Oil/gold prev = commodity_prices has no history (single row) → null/unknown. usdVnd prev = sbv_rates has no history column → null/unknown. Only VnIndex can serve real delta; others must serve direction:"unknown" unless a prev-session snapshot job is added (out of scope this sprint).
**what-considered:**
- market_prices_history for VnIndex: sub-5-min ticks, not session close — wrong granularity
- daily_ohlcv: correct daily close granularity for VnIndex
**why-decision:** daily_ohlcv is the correct prev-session source for VnIndex. Oil/gold/usdVnd have no prev-session row in DB → honest null.
**why-change:** no change from plan
