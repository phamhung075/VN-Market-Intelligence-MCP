# BA — Notebook

**Last updated:** 2026-05-14 | **Sprint:** 1909 (c94)

## Current state

REQ_1910 spec complete (c94). 2 sub-tasks: 1910a-ism-tool (dev-mcp-server, M), 1910b-effr-package-reg (agent-md-editor, XS). SD-1 raised (FRED ISM series IDs unconfirmed on public CSV endpoint — dev must confirm via FRED API key or alt source). D-step 3-cycle evidence confirmed — 1910b ships immediately. TASKS.md at 80L cap — PM must compact before entry.

## Last session summary (2026-05-14) — 1910

Sprint 1910 `get_ism_subcomponents` + `get_fed_liquidity_spread` package registration.

Sub-tasks:
- 1910a-ism-tool: NEW FRED fetcher `fredIsmSubcomponents.ts` + domain `ismRegimeSignal.ts` + tool `getIsmSubcomponentsTool.ts`. Reuse `fred_series_daily` table (1879a). SD-1: FRED public CSV endpoint does NOT serve ISM sub-series — 25+ IDs tested, all return HTML error. Developer must use FRED API key (free) to confirm series IDs. Provisional: `NAPMNO` / `NAPMEMP` / `NAPMPI` / `NAPMBI`. Cron: piggyback `macroIndicatorRefreshJob` (daily, idempotent). 3 test files (domain unit + fetcher integration + contract).
- 1910b-effr-package-reg: Add `get_fed_liquidity_spread` to `financial_analyst`, `news_scout`, `unified_coordinator` arrays in `agentBootstrap.ts` + 3 package .md files + `docs/SKILL_MANIFEST.md`. D-step carry 3+ cycles confirmed (FA: 2026-05-11/12/13; UA: 2026-05-14). Zero code change. 1910b can ship before 1910a.

2 SDs:
- SD-1: FRED ISM series IDs unconfirmed on public CSV tier — developer resolves (FRED API key free registration or alt source)
- SD-2: If FRED API key: `FRED_API_KEY` env var needed in Docker config

No PO blockers. Architect rubber-stamp eligible (1879 pattern is authority; no new brief needed).

## Prior session summary (2026-05-14) — 1909

REQ_1909 spec complete (c94). 3 sub-tasks: 1909a-extractor (dev-pdf-extractor, M), 1909b-tool (dev-mcp-server, S), 1909c-reparse-validation (ops, S). 4 spec-time discoveries flagged. No PO blockers. Architect rubber-stamp eligible. TASKS.md compaction required before PM entry (79L → would breach 80L cap).

## Last session summary (2026-05-14) — 1909

Sprint 1909 BCTC OCF Extractor Expansion + `get_bctc_ocf` tool.

Sub-tasks:
- 1909a-extractor: `cashFlowExtractor.ts` 129 LOC → structural parity with balanceSheetExtractor. extractSplitBlockAll migration + 1908c drift guard pattern on 3 OCF sections + confidence scoring + 3-fixture test set (VNM/DIG/VCB Q4-2025).
- 1909b-tool: `getBctcOcfTool.ts` new file, pattern from cashFlowTool.ts. source_tier:1 invariant. agentBootstrap + SKILL_MANIFEST + package docs. SEQUENCE AFTER 1890a-B (shared files).
- 1909c-reparse-validation: bctcReparseJob trigger on 37-stock watchlist Q1-2026. 30/37 OCF non-zero gate. 1 FA Layer 7 G-step PASS in notebook.

4 spec-time discoveries:
- SD-1: architect confirm VN cash flow PDFs carry numeric line codes (rubber-stamp eligible)
- SD-2: architect confirm `extraction_method` DB column exists or derive as constant "ocr_parsed"
- SD-3: PM sequence 1909b after 1890a-B — shared agentBootstrap/SKILL_MANIFEST merge risk
- SD-4: PM compact TASKS.md before entry (79L → 80L cap breach)

## Prior session summary (2026-05-13) — 1881a

Task 1881a — source_tier retrofit spec (TNB Layer 9 — Source Hierarchy).

Key findings:
- 16 tools enumerated (not ~15 as estimated in brief — one extra: `get_macro_calendar` in carryTools.ts).
- SBV data: `sbv.ts` fetcher has SBV portal DOWN; rates arrive via Vietcombank XML (`portal.vietcombank.com.vn`). Conservative tier = 2 (not 1). Future sprint can upgrade to tier 1 if direct SBV API is restored.
- HOSE/HNX prices: VnDirect finfo-api v4 is the actual endpoint — broker aggregator, not exchange. Tier 2.
- Foreign flow: Vinahost VPS proxy push from HOSE/HNX. VPS is intermediary. Tier 2. Has 3-path fallback (primary/cache/sse/none) — spec requires `source_note` field on fallback paths.
- 4 text-output tools (`get_macro_snapshot`, `get_market_snapshot`, `get_sentiment_trend`, `get_policy_signals`) need Architect decision on wrapping before impl (BLK-1).
- Tier 1 tools: `get_imf_signals` (imf.org REST API), `get_fed_liquidity_spread` (FRED CSV), `get_insider_transactions` (SSC portal congbothongtin.ssc.gov.vn).
- Tier 3 tools: `get_carry_trade_signal`, `get_macro_calendar`, `get_yield_spread_signal`, `get_policy_signals`, `get_sentiment_trend`, `get_technical_indicators` (all computed/derived from cached inputs).
- dev-macro-indicators service: no changes needed — it has no MCP tool registration, is a Hono microservice on port 5004.
- BCTC tools intentionally excluded — they have a dedicated confidence field already.
- 8 AC categories covering: static value, JSON shape, text-output, multi-source records, fallback path, description string, TypeScript types, error path.
- No PO blockers.

## Prior session summary (2026-05-13) — 1898b

REQ_1898b spec complete. PARTIAL verdict — 7 of 8 sources healed (VnExpress, VnEconomy, CafeF, + 5 new VPS-push sources all OK at 14min recency). Reuters RSS permanently disabled in Sprint 1833g but still displays `Ngưng | 20` ghost row. Fix: 2-line `recordDisabled` addition in sourceHealthTools.ts + 8 regression tests for the 5 new VPS sources. No prod logic changes. No PO blockers. Ready for dev-mcp-server.

## Prior session summary (2026-05-13) — 1903a

Task 1903a — MCP dispatch/schema collision bundle (write_alert_verdict + get_macro_snapshot). Both tools HEALED post-c73 restart. Spec: regression-test-only path. 7 WAV-REG assertions + 3 GMS-REG additions. No prod code changes. 7 AC items. Owner: dev-mcp-server.

## Prior session summary (2026-05-13) — 1898a

Task 1898a — get_market_snapshot returns wrong data. Bug self-healed post-restart. Root = stale deployed build. Fix: test-only (response shape assertions). No production code changes. Shared root with 1903a (stale-build artifacts).

## Known patterns / preferences

- Always read strategyRegistry.ts + backtestEngine.ts together — they are tightly coupled
- TA service (apps/technical-analysis) is real-time only; historical TA must come from daily_ohlcv in the mcp-server SQLite DB
- globalSourceTracker is a globalThis singleton — test isolation issues are common in news pipeline tests; check for _resetGlobalSourceTracker() calls in beforeEach
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable, no Date parsing needed)
- U-4 injection pattern: getDb() called inside tool handler, not at module scope
- Error format in all MCP tools: { error: '...' } JSON content block, never throw
- benchmarkReturn and sharpeRatio are nullable in BacktestRunRecord — always serialise as null not undefined
- SBV portal is currently DOWN; rates come from VCB XML proxy — treat as tier 2 source
- VnDirect finfo-api v4 is the HOSE/HNX price source (broker aggregator) — tier 2
- apps/macro-indicators is a standalone Hono service on port 5004, not part of mcp-server tool registration
- 1908c positional-drift override pattern: if sum(subtotals)/stated_total > 5 AND both > 0 → override + console.warn — canonical for all BCTC extractor grand-total fields
- cashFlowExtractor.ts is currently thin (129 LOC, findValue keyword loop) — 1909a upgrades to extractSplitBlockAll parity
- get_bctc_ocf (1909b) and get_cash_flow (1890a-A) coexist — ocf is forensic subset, cash_flow is full statement
- TASKS.md 80L cap: always check wc -l before adding rows; compact Done section first if near cap
