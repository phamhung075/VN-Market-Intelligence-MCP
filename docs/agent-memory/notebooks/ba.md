# BA — Notebook

**Last updated:** 2026-05-18 | **Sprint:** 1950-T1 (c3)

## Current state (2026-05-18) — Sprint 1950-T1

REQ_1950 spec complete. Chef WORK-channel telemetry — spec written to `docs/handoffs/REQ_1950.md`. TASKS.md 1950-T1 updated with BA spec link. No PO blockers. NEXT: agent-father (XS/S doc-only patch to chef.md — no architect brief needed).

Key decisions:
- ENTRY fires immediately after Bootstrap, before Step 0 GATHER reads.
- CLOSE (success) fires at end of Step 8, after notebook append — not after MARKET send in Step 7. Rationale: LOG is the definitive end-of-cycle marker.
- CLOSE (silent) replaces the free-form intraday zero-cluster string in Step 1 with standardised format. Same send_telegram call location, string changes only.
- FAILED wraps Steps 0–7 only. Step 8 LOG is outside the try block (housekeeping must not suppress the FAILED signal). Step 8 failures fall through to cowork-boundary default error rule.
- `cycle_id` = `chef-{dish_type}-{YYYYMMDDTHHmmZ}` constructed once at ENTRY, reused in CLOSE/FAILED — enables T2 grep-based pairing.
- Intraday `convergence_detected` field present on SENT only (not SILENT — by definition false; not included to keep SILENT line compact).
- No PO blockers. All fields derivable from existing chef.md inputs.

## Prior state (2026-05-18) — BA-1942d (c2)

BA-1942d spec complete. Accuracy digest frontend card — spec written to `docs/REQ_1945b-accuracy-digest-frontend-card.md`. Task 1945b added to Todo (FEATURE, dev-frontend + dev-api-gateway). BA-1942d moved to Done.

Key findings:
- `getSystemAccuracyDigestStats()` is in `signalOutcomeStore.ts` (infra/db) — called only by cron job today, NO HTTP route exists yet.
- New HTTP route needed: `GET /api/accuracy/digest?days=N` in mcp-server server.ts (same pattern as `/api/signals/stock/:code`). api-gateway already proxies `/mcp/*` verbatim — no gateway code change.
- Frontend placement: existing `dashboard.analysis.tsx` page, new SectionCard below "Kinh Dịch — Cổ phiếu mẫu". No new route file.
- 5 states mapped: empty / all-neutral / insufficient-sample / partial / normal. Discriminator: `totalResolved` vs `neutralOnlyRows` vs `bySignalType.length` — mirrors AC-3/AC-8 logic from cron job.
- Seeding window constraint: `signal_outcomes` data expected ≥2026-05-25. Empty state must show this date as a constant (not hardcoded in JSX — passed as prop/constant from loader).
- Colour thresholds ≥0.70 green / 0.40–0.69 amber / <0.40 red — must match `accuracyBadgeProps()` in `client.ts` (lines 372–387).
- `days` clamp: 1–90, default 30. Frontend always sends 30.
- Non-fatal: accuracy fetch failure must not block Analysis page render (Promise.allSettled arm).

## Prior state (2026-05-18)

Sprint 1942c spec complete (c1). HPG get_cash_flow all-zeros fix.

Two-scenario root cause documented:
- Scenario A: HPG has financial_reports rows but operating_cash_flow=NULL because OCR label miss ("sản xuất kinh doanh" variant) AND/OR bridgeOCFToFinancialReports found no matching vnstock_cash_flow period.
- Scenario B: HPG has zero financial_reports rows (1942b fallback fires), but vnstock_cash_flow.operating_cf_bn=0.0 because CASH_FLOW_SCRIPT key 'Net cash inflows/outflows from operating activities' absent in HPG VCI columns.

Key code invariants confirmed:
- storeCashFlow() calls bridgeOCFToFinancialReports() immediately after INSERT — so if vnstock_cash_flow is populated, bridge fires synchronously.
- buildFallbackResponse() in cashFlowTool.ts multiplies operating_cf_bn * 1000 — 0.0 propagates as 0, not null.
- CASH_FLOW_SCRIPT uses a single hardcoded column key — no fallback keys for steel sector.
- FINANCE_SCRIPT uses 'Attributable to parent company' for NI — may be absent for HPG VCI response.

No PO blockers. SD-1: developer must run FR-1 SQL diagnostic first to determine A vs B.
Owner: dev-mcp-server. Size: S. No sequence dependency on 1942a/b.
TASKS.md at 89L (>80L cap) — PM must compact before adding rows.

## Prior state (2026-05-15)

Sprint 1920 decomposition complete (c132). 9 tasks total decomposed: 1920a/b/c/d/e/f/g/h/i. Specs written to docs/handoffs/TASK_1920[a-i].md. TASKS.md updated owner=dev-mcp-server status=Ready for Dev. WORK telegram attempted — MCP gateway 404 via curl (cowork-internal only), logged here instead of incident doc.

Key findings 1920a/b/c/d:
- 1920a: Two separate crons in one file (vnstockFundamentalsRefresh Mon 01:00 UTC + vnstockTradingStatsRefresh daily 08:30 UTC weekdays). isRunning guard critical (7-10 min sweep). Per-ticker try/catch. Do NOT bypass 2500ms delay in syncVnstockData.ts.
- 1920b: SD-1 (dev-resolvable, not PO blocker) — AC-0: dev confirms HNX/vnstock bond endpoint geo-access from France at implementation time. upsertBond() ON CONFLICT(issuer_code) already correct. Zero-row WORK alert required (downstream agents break on empty bond_maturity).
- 1920c: Thin scheduler caller only — writers (commodityTracker.ts + shippingIndex.ts) already exist. Two call blocks with independent try/catch. NOTE: commodityTracker.ts calls getDb() directly (code-smell, non-blocking, TODO comment requested). INSERT OR REPLACE for snapshot (safe: no FK on rowid confirmed ARCH-1920 R-4).
- 1920d: CRITICAL PRE-CONDITION — schema migration UNIQUE(broker_name, sanction_start) + INSERT OR IGNORE MUST ship same PR as job. Quarter-guard in job body ([3,6,9,12] month check). Cron 0 8 25-31 * 5 (node-cron L not supported). No VPS needed for SSC page from France.

No PO blockers on any of a/b/c/d.

Key findings:
- 1920e: cascadeBacktestJob has NO saveRun call. Repo method is `saveRun()` not `recordRun()`. Aggregate metrics computable from in-loop accumulator. No new files needed.
- 1920f: `prepareSignalAuditRecord()` exists in domain (signalValidator.ts:193) but NO infrastructure store file exists. Need new `signalQualityAuditStore.ts`. Write gate: only price_confirmation + urgent_news signal types. monthlySignalQualityAuditJob queries signal_rejections (different table) — the audit is for a different downstream use (report-analyzer).
- 1920g: intelligenceCycleJob Step G (runChainSynthesis) produces SynthesizedChain with conviction + action + narrative. Wire insertPredictionClaim after postSignal call for conviction≥0.7. mapChainAction: BUY→bullish, SELL→bearish, MONITOR/HOLD→neutral. 7-day resolution horizon.
- 1920h: `skips` table confirmed non-existent in any schema file — only word "skips" in schema-system.ts:365 is a comment about SQLite semantics. `user_requests` exists in schema-system.ts:239, zero production writers outside schema. Option B (DEPRECATED comment) chosen — no DROP to protect live DBs.
- 1920i: freshnessSlaMonitorJob querySignalAges uses hard-coded 5-type UNION ALL. Need to extend to 12 types post-1920a–g. Null guard for zero-row tables critical (prevents false breach on day-1 seeding). Soft sequencing dependency on 1920a–g.

No PO blockers identified. No architect brief required for any of e/f/g/h/i.

## Last session summary (2026-05-14) — 1912b

Sprint 1912b — alert-engine Go migration spec.

Key findings from TS source inspection:
- 2 routes: GET /health, POST /evaluate. Health JSON: {status,service,port:5006}.
- EvaluateAlertResponse (internal DTO): {fired, cooldown_sec, reason, fingerprint}.
- AlertEvaluateResponse (clients.ts consumer): {alert_id, code, fired, reason, telegram_sent}. SHAPE MISMATCH — developer must reconcile (D-1).
- 3 domain functions: computeFingerprint (djb2, 8-hex, order-independent signalTypes), shouldSuppressAlert (cooldown+daily cap, critical/non-MACRO bypass), isDuplicate.
- EvaluateAlertUseCase: mute → dedup(60min) → cooldown/cap → store → telegram. sendTelegram defaults false.
- SQLite: alert_engine.db sole write target. WAL mode. Tables: alert_engine_records + alert_mutes + outcome cols (1847d-A).
- Telegram routing: critical/high → 'market', else → 'work'. Silent-skip on missing token.
- bbAlertScanJob + taAlertScanJob do NOT call /evaluate — write direct to alerts table in market.db (D-2).
- 3 TS test files: unit (195 LOC), integration/handlers (143 LOC), 1847d-A schema (175 LOC).

16 ACs: AC-1 CGO Dockerfile, AC-2 /health parity, AC-3 validation 4-cases, AC-4 stock uppercase, AC-5 response shape, AC-6 computeFingerprint numeric parity, AC-7 shouldSuppressAlert 5-case, AC-8 isDuplicate, AC-9 usecase orchestration, AC-10 SQLite WAL parity, AC-11 outcome schema (1847d-A), AC-12 mcp-server 8804 unchanged, AC-13 Telegram silent-skip, AC-14 log/slog JSON, AC-15 gateway 9/9 healthy, AC-16 tests-before-impl (R5).

## Last session summary (2026-05-14) — 1912c

Sprint 1912c — stock-price Go migration spec (Phase 3).

Key findings from TS source inspection:
- 3 routes confirmed: POST /price/fetch, GET /price/history/:code (path param), GET /health
- 3-tier waterfall: all tiers launched concurrently via Promise.allSettled — Go port uses goroutines + channels.
- Tier3 reads market.db (readonly) + writes to stock_price.db (isolated). TWO separate DSNs required.
- R-SPEC-1: clients.ts PriceSnapshot.timestamp field may diverge from FetchPriceResponse.fetchedAt — developer must verify field usage at call site.
- R-SPEC-2: handlers.ts uses GET /price/history/:code (path param) but clients.ts calls /price/history?code=X&days=N (query param). Discrepancy must be resolved before implementation.
- saveQuote is fire-and-forget — write failure must NOT fail the request (matches TS `catch(() => void 0)` pattern).
- market.db readonly invariant pre-exists in TS (`{ readonly: true }` on bun:sqlite) — Go must preserve via `?mode=ro` DSN.
- 14 ACs, 2 spec-time risk findings. No PO blockers.

14 ACs:
- AC-1: Dockerfile multi-stage CGO builds cleanly
- AC-2: /health 200 + exact JSON shape
- AC-3: /price/fetch byte-identical JSON
- AC-4: /price/history byte-identical JSON
- AC-5: tier waterfall fall-through (T1-wins, T2-fallback, T3-fallback, all-fail → 404)
- AC-6: Tier3 cache hit/miss paths + saveQuote fire-and-forget
- AC-7: market.db readonly DSN enforced
- AC-8: concurrent write safety on market.db (R4 mitigation)
- AC-9: Go test parity with 2 TS Vitest files / 204 LOC / 13 scenarios
- AC-10: mcp-server Vitest unchanged
- AC-11: api-gateway 9/9 aggregation healthy
- AC-12: code uppercased before fetch
- AC-13: /price/history days validation
- AC-14: /price/fetch missing code validation

## Last session summary (2026-05-14) — 1912a

Sprint 1912a — api-gateway Go migration spec.

Key findings from TS source inspection:
- 5 routes enumerated: GET /health, GET /health/:service, GET /health-dashboard, ANY /api/* (verbatim proxy), ANY /:service/* (prefix-strip proxy)
- /healthz does NOT exist in TS source — only in architect brief § 3.1 + TASKS.md. D-1 deviation raised (AC-11 blocks impl until resolved).
- 10 services in registry: 9 probeable + 1 virtual alias (api, noProbe=true, routes /api/* to MCP verbatim).
- Proxy timeout = 5x health timeout (10 000ms vs 2 000ms).
- ENV vars: PORT, MCP_URL, PDF_URL, RAG_URL, TA_URL, MACRO_URL, STOCK_URL, KINH_DICH_URL, ALERT_URL, NEWS_URL.
- 5 Vitest files confirmed: aggregate-health-service (domain unit), static-service-registry (infra unit), aggregate-health-usecase (integration), 1841a-health-dashboard (handler+HTML), 1892b-api-push-routes (proxy routing).
- No SQLite in gateway — CGO not needed (mattn/go-sqlite3 N/A for Phase 1).

11 ACs:
- AC-1: Dockerfile golang:1.22-alpine multi-stage builds cleanly
- AC-2: JSON parity /health + /health/:service
- AC-3: Proxy parity /api/* and /:service/*
- AC-4: Dashboard HTML parity
- AC-5: go test ./... covers all 5 Vitest scenarios
- AC-6: mcp-server 8804/8804 unchanged
- AC-7: log/slog JSON schema documented
- AC-8: rollback validated
- AC-9: DDD package layout
- AC-10: 24h smoke window before P2
- AC-11: /healthz deviation resolved before impl

3 deviations: D-1 (/healthz missing), D-2 (net/http vs chi — developer choice), D-3 (HTML template effort absorbed).

No PO blockers beyond dev-role decision (Option A or B).

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
