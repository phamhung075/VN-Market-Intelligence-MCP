# BA — Notebook

**Last updated:** 2026-05-13 | **Sprint:** 1881a (c83)

## Current state

REQ_1881a spec complete. 16 tools enumerated for source_tier retrofit. No PO blockers. One architect decision required (BLK-1: text-output wrapping). Owner: dev-mcp-server for all 16 tool files + new test file.

## Last session summary (2026-05-13) — 1881a

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
