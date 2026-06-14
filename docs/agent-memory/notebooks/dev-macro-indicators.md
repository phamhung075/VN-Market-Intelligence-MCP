# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-06-14 (VMT-1a-TRADE-BALANCE + VMT-1b-BLOC-SPLIT — sprint VN-MACRO-TOOLING A3 WAVE-2)

**Task:** Implement VMT-1a (trade balance + HS attribution) + VMT-1b (bloc_split FDI estimate) in ONE pass. Bundled A3 per contract. NSO Excel cache REUSED from A2 (getOrFetchNSOMonthlyExcel, 6h TTL, cache hit — no new excelize/fetcher).

**Contract source:** scripts/probes/vmt-3-sample.json + orch-state.json live_contract (VMT-1a + VMT-1b). NSO monthly Excel sheets '14.XK' (exports), '15.NK' (imports), '12.FDI' (FDI registered). VN number format (period=thousands, comma=decimal). ParseVNNumber reused from BOP domain.

**Files created (9):**
- `pkg/domain/models_vmt_trade.go` — TradeBalanceRecord, HSSector, BlocSplitEstimate, BlocShareEstimate domain models
- `pkg/domain/services_vmt_trade.go` — ComputeTradeBalance (export-import), ComputeBlocSplit (always is_estimate=true PERMANENT ARCH Decision A)
- `pkg/domain/services_vmt_trade_test.go` — 8 table-driven tests (anchor May-2026, is_estimate invariant, fail-closed, note content)
- `pkg/application/dtos_vmt_trade.go` — TradeBalanceRequest, TradeBalanceResponse, HSSectorDTO, BlocSplitDTO, BlocShareDTO
- `pkg/application/usecases_vmt_trade.go` — TradeBalanceUseCase (NSOExcelProvider reused + TradeBalanceParser interface)
- `pkg/application/usecases_vmt_trade_test.go` — 6 tests (nil guards, fetch/parse error fail-closed, anchor May-2026, ARCH Decision A invariant)
- `pkg/infrastructure/parsers_vmt_trade.go` — ParseTradeBalanceFromExcel (sheets 14.XK+15.NK+12.FDI, total row detection, HS breakdown, FDI "Tổng số" row)
- `pkg/infrastructure/parsers_vmt_trade_test.go` — 7 parser tests incl. anchor + FDI value + fail-closed FDI miss
- `pkg/interface/http/handlers_vmt_trade.go` — handleTradeBalance chi handler for POST /trade-balance

**Files modified (2):**
- `pkg/interface/http/router.go` — RouterConfig extended (TradeBalance field), POST /trade-balance route added
- `cmd/server/main.go` — tradeBalanceParserAdapter + TradeBalanceUseCase wired (SHARES nsoExcelFetcher with A2)

**Key invariants confirmed:**
- getOrFetchNSOMonthlyExcel REUSED (same NSOExcelFetcher instance from A2) — no new excelize/fetcher — Entry 11
- VMT-1b bloc_split.fdi.is_estimate=true AND bloc_split.domestic.is_estimate=true PERMANENT (ARCH Decision A)
- Fail-closed: is_estimate=true even on FDI parse error AND on overall error paths
- bloc_split.note = "Cross-join estimate: FDI capital from NSO 12.FDI vs total export; Customs SPA inaccessible"
- VMT-1a is_estimate=false (trade totals + HS rows — primary NSO source)
- VN number format: ParseVNNumber (reused from BOP) — "27,4" tỷ USD × 1000 = 27400 M USD
- Total row detection: blank col0 + valid numeric col2 (first match in sheet)
- FDI "Tổng số" total row: matched in col1 or col0 (layout variant guard)
- Fence-A/B/C clean; golangci-lint 0 issues; go vet clean

**Anchor test results (G12 DoD PASS):**
- VMT-1a May-2026: ExportTotal=27400 M USD PASS, ImportTotal=24100 M USD PASS, TradeBalance=+3300 M USD PASS
- VMT-1b May-2026: BlocSplit.FDI.IsEstimate=true CONFIRMED (all test cases), FDIRegistered=24810 M USD PASS
- Sandbox: primitive 18/18 GREEN, module 2/2 GREEN

**Verification:** `go build ./...` GREEN, `go test ./... -count=1` ALL PASS (11 packages), `golangci-lint run` 0 issues.

**NSO Excel cache REUSE confirmed:** No new NSOExcelFetcher created, no new excelize dep added — same `nsoExcelFetcher` instance from VMT-3b/VMT-4 wiring in main.go.

**Commit scope (explicit path):** 11 files — 9 new + 2 modified — ALL in apps/macro-indicators/. Notebook staged separately.

---

## Session 2026-06-14 (VMT-3b-GSO-IIP + VMT-4-CPI — sprint VN-MACRO-TOOLING A2 WAVE-2)

**Task:** Implement VMT-3b (GSO/IIP, POST /macro-indicators) + VMT-4 (CPI Components, POST /cpi-components) in ONE pass. Shared NSO Excel download cache (Entry 11 decision). A1=VMT-2-BOP merged (dae7e68d); A2 dispatched as single agent to avoid router+cache conflict.

**Contract source:** scripts/probes/vmt-3-sample.json (PROBE-3 PASS). NSO monthly Excel, sheet "2.IIPthang" (IIP) + sheet "16.CPI" (CPI). excelize v2.8.1 added (first Excel dep in this service).

**Files created (14):**
- `pkg/domain/models_vmt_macro.go` — IIPSector, MacroIndicatorsGSORecord domain models
- `pkg/domain/models_vmt_cpi.go` — CPIBasket, CPIRecord domain models; WeightPct=nil policy documented
- `pkg/domain/services_vmt_macro.go` — MapIIPSectorKey (4 target sectors, case-insensitive)
- `pkg/domain/services_vmt_cpi.go` — MapCPIBasketKey (15 rows: headline + 14 baskets), CPIWeightsNote const
- `pkg/domain/services_vmt_macro_test.go` — 10 table-driven tests for MapIIPSectorKey (anchors + edge cases)
- `pkg/domain/services_vmt_cpi_test.go` — 17 table-driven tests for MapCPIBasketKey + CPIWeightsNote
- `pkg/application/dtos_vmt_macro.go` — MacroIndicatorsGSORequest, MacroIndicatorsGSOResponse, IIPSectorDTO
- `pkg/application/dtos_vmt_cpi.go` — CPIComponentsRequest, CPIComponentsResponse, CPIBasketDTO
- `pkg/application/usecases_vmt_macro.go` — MacroIndicatorsGSOUseCase (NSOExcelProvider + IIPParser interfaces)
- `pkg/application/usecases_vmt_cpi.go` — CPIComponentsUseCase (shared NSOExcelProvider + CPIParser interface)
- `pkg/infrastructure/cache_vmt_nso.go` — NSOExcelFetcher: getOrFetchNSOMonthlyExcel (6h TTL, macro_vmt_cache table, 3-step NSO discovery)
- `pkg/infrastructure/parsers_vmt_gso_indicators.go` — ParseIIPFromExcel (sheet "2.IIPthang", excelize by name)
- `pkg/infrastructure/parsers_vmt_cpi.go` — ParseCPIFromExcel (sheet "16.CPI", YoY derived col3-col2, weights=nil)
- `pkg/infrastructure/parsers_vmt_gso_indicators_test.go` — 4 parser tests incl. live anchor (YoY=103.27, YTD=108.79, MoM=109.08)
- `pkg/infrastructure/parsers_vmt_cpi_test.go` — 4 parser tests incl. live anchor (MoM=0.29, YTD=4.31, YoY=5.60), weights-always-nil invariant
- `pkg/interface/http/handlers_vmt_macro.go` — handleMacroIndicators chi handler
- `pkg/interface/http/handlers_vmt_cpi.go` — handleCPIComponents chi handler

**Files modified (3):**
- `pkg/interface/http/router.go` — RouterConfig extended (MacroIndicatorsGSO + CPIComponents fields), POST /macro-indicators + POST /cpi-components routes
- `cmd/server/main.go` — NSOExcelFetcher wiring (shared instance), MacroIndicatorsGSOUseCase + CPIComponentsUseCase + iipParserAdapter + cpiParserAdapter
- `go.mod` — excelize v2.8.1 added (first Excel dep); go directive stays 1.24.0 (toolchain forces it on local go1.26.2)

**Key invariants confirmed:**
- CPI weights=null (WeightPct=nil, WeightsIsEstimate=true) — MANDATORY per architect handoff § VMT-4 weights_policy
- NSOExcelFetcher shared instance: VMT-3b + VMT-4 use SAME instance (Entry 11) — no double VPS fetch
- excelize matched by sheet NAME, not index (resilient to sheet order changes)
- YoY derived as col3 - col2 (current month vs base minus prior year same month vs base)
- parseFloatCell: plain float format for IIP (NOT VN thousands-sep format; IIP uses "103.27" not "103,27")
- Fence-A/B/C clean; golangci-lint 0 issues; go vet clean

**Anchor test results:**
- iip_all_industry: YoYPct=103.27 PASS, YTDYoYPct=108.79 PASS, MoMPct=109.08 PASS
- cpi_total: MoMPct=0.29 PASS, AvgYTDYoYPct=4.31 PASS, YoYPct=5.60 PASS
- weights=nil invariant: PASS across all baskets

**Verification:** `go build ./...` GREEN, `go test ./... -count=1` ALL PASS (11 packages + new tests), `golangci-lint run` 0 issues.

**Next:** A3 (VMT-1a+VMT-1b trade balance, same NSO Excel, sheets 14.XK + 15.NK + 12.FDI). SERIALIZE.

---

## Session 2026-06-14 (VMT-2-BOP — sprint VN-MACRO-TOOLING A1 WAVE-2)

**Task:** Implement VMT-2 BOP (Balance of Payments) — first serialized Zone-A task.

**Contract source:** scripts/probes/vmt-2-sample.json (PROBE-2 PASS). Direct JSON GET from SBV Liferay headless API. NO Excel, NO PDF, NO excelize added.

**Files created (8):**
- `pkg/domain/models_vmt_bop.go` — BOPRecord, BOPCurrentAccount, BOPFinancialAccount, FXIncidenceResult, OffshoreParkedEstimate, BOPSnapshot domain models
- `pkg/domain/services_vmt_bop.go` — ParseVNNumber, ComputeFXIncidence (DD-5), ComputeOffshoreParked (always is_estimate=true)
- `pkg/domain/services_vmt_bop_test.go` — 30 table-driven tests anchored on Q4-2025 live payload
- `pkg/infrastructure/parsers_vmt_bop.go` — ParseBOPResponse, BuildBOPFetchURL, CurrentQuarterWindow, PrevQuarterWindow
- `pkg/application/dtos_vmt_bop.go` — BOPRequest, BOPResponse + sub-DTOs
- `pkg/application/usecases_vmt_bop.go` — BOPUseCase (BOPParser + BOPURLBuilder interfaces, Execute(), fetchRecord(), fallback to prev quarter)
- `pkg/application/usecases_vmt_bop_test.go` — 5 tests (live anchor, fetch error, nil fetcher, explicit window, always-estimate path)
- `pkg/interface/http/handlers_vmt_bop.go` — handleBOP() chi handler for POST /bop

**Files modified (2):**
- `pkg/interface/http/router.go` — RouterConfig struct (DD-1), NewRouter(cfg RouterConfig), POST /bop route wired
- `cmd/server/main.go` — BOPUseCase wiring + bopParserAdapter/bopURLBuilderAdapter composition-root types (Fence-C)

**Key invariants confirmed:**
- excelize NOT added (pure JSON API, Entry 10)
- offshore_parked.is_estimate=true ALWAYS (never fabricated confidence)
- E&O sign convention: BPM6, NO sign flip (loiVaSaiSot=-12375 = outflow confirmed)
- VN number format: "7.654"=7654 M USD, NOT 7.654 (ParseVNNumber)
- Fence-A/B/C all clean; go vet clean; go test ./... ALL PASS

**Verification:** `go build ./...` green, `go test ./...` ALL PASS (all packages), go vet clean.

**Next:** A1 merge gate → PM dispatches A2 (VMT-3b IIP + VMT-4 CPI, NSO Excel, excelize). SERIALIZE.

---

## Session 2026-06-13 (TSU-DEV-U4 seed-date fix — sprint TOOL-SURFACE-UPGRADE)

**Task:** Fix hardcoded calendar dates (2026-06-01/02/03) in T-U4-5 infrastructure tests for `fetchPrevSessionVnIndexFromDB`.

**Finding:** U4 implementation (commit 9880eadc, 2026-06-07) used hardcoded calendar dates for daily_ohlcv row ordering. These would not rot on ordering tests but violate the seed-date lesson — relative dates required per task mandate.

**Changes:** `repositories_test.go` — replaced 3 hardcoded dates with `time.Now().UTC().AddDate(0, 0, -N)` offsets in 3 of 4 U4 test functions. Empty-table test unchanged (no dates needed). Commit 56822e4a.

**Verification:** `go test ./... -count=1` ALL PASS (12 packages); no production logic changed; fences A/B/C clean; sandbox primitive 18/18 + module 2/2 GREEN.

**Status:** DONE — ops REBUILD of macro-indicators container required before QA live-verifies delta/direction in get_macro_snapshot response.

---

## Session 2026-06-08 (FIX-MACRO-GO-DIRECTIVE — sprint CI-RED-RECONCILE)

**Task:** Align `go.mod` go directive from 1.25.0 → 1.22 (repo standard). CI golangci-lint v2.0.2 (built go1.24) exits 3 on any module targeting go > builder.

**Finding:** Prior `go mod tidy` with local go1.26.2 over-pinned indirect deps: `golang.org/x/sys v0.42.0` and `modernc.org/libc v1.72.3`. Both are safe to downpin.

**Changes:**
- `go.mod`: `go 1.25.0` → `go 1.22` + added `toolchain go1.22.0` (matches api-gateway pattern)
- Downpinned: modernc.org/libc 1.72.3 → 1.49.3; golang.org/x/sys 0.42.0 → 0.19.0; 3 other modernc deps to lower versions

**Verification:** `go build ./...` CLEAN, `go vet ./...` CLEAN, `go test ./...` 12/12 PASS, `golangci-lint run` 0 issues.

**Status:** REVIEW (awaiting CI verification post-push)

---

## Session 2026-06-08 (FIX-MACRO-REFRESH-DEAD — CRITICAL)

**Root cause:** macroIndicatorRefreshJob silent-swallow. Two blockers:
1. `clients.ts:26` reads `MACRO_SERVICE_URL`, docker-compose sets `MACRO_INDICATORS_URL` → always localhost:5004 (refused)
2. `macroIndicatorRefreshJob` outer catch returns void (not re-throw) → wrapRun records success on failure

**Fixes (commit b7ce338f):**
- `clients.ts:26`: `MACRO_SERVICE_URL` → `MACRO_INDICATORS_URL`
- `macroIndicatorRefreshJob.ts`: added `throw err;` after Telegram alert in outer catch
- 5 new tests (env-var wiring, fail-loud contract, happy path) GREEN

**Baseline evidence:**
- Before: macro_indicators.fetched_at = 2026-05-16 (22+ days stale), job duration 82ms, status=success
- After: macro_indicators.fetched_at = 2026-06-08 02:36:41 (fresh), job duration ~17s (real HTTP), live data returned

**Status:** SHIPPED; container rebuilt; macro freshness restored

---

## Session 2026-06-07 (U4 direction+delta sweep — sprint TOOL-SURFACE-UPGRADE)

**Task:** Add `prev_session_delta` + `direction` to all 4 headline values (vnIndex, oil, gold, usdVnd) in `get_macro_snapshot`.

**Design:** Extended `MarketIndexPort.FetchPrevSessionVnIndex()` (second-most-recent daily_ohlcv close, OFFSET 1). Pure `computeDelta(current, prev)` helper (nil prev → nil/"unknown"; 0.1% flat threshold). Oil/gold/usdVnd: single-row tables → always (nil, "unknown"), never fabricated.

**Changes:**
- `ports.go`: `MarketIndexPort.FetchPrevSessionVnIndex` added
- `dtos.go`: 8 new fields (vnIndexDelta/Direction + oilDelta/Direction + goldDelta/Direction + usdvndDelta/Direction)
- `usecases.go`: `resolvePrevSessionVnIndex`, `computeDelta`, Execute() updated
- `repositories.go`: `FetchPrevSessionVnIndex`, `fetchPrevSessionVnIndexFromDB` added
- 8 new tests (T-U4-1..7) + test DB table updates

**Tests:** `go test ./...` ALL PASS (12 packages), sandbox primitive 18/18 + module 2/2 GREEN.

**Status:** REVIEW (ops REBUILD required; QA verify JSON includes delta/direction fields)

---

## Archive: Earlier Sessions (2026-06-06 through 2026-05-30)

**2026-06-06:** F-2 FETCH-OPS-PAGE-TRUTH — removed fake `totalLatencyMs:0` from summary map in handlers_external.go. AC-3 explicit absence test added. Status REVIEW (ops REBUILD).

**2026-06-05:** FDA-2 + FDA-3 — added per-field provenance on price fields (vnIndex, oil, gold, usdVnd) + liveness flags (is_estimate/source_tier). `/external` derives status from field provenance instead of hardcoding. 11 new tests RED→GREEN. Commit 0712c3a7.

**2026-06-04:** DSI-INV-1 — suppress fixture carry regime when FRED/VND inputs stale. Resolvers now return (float64, isLive bool). Carry suppression gate: `carryInputsLive = fedFundsLive && vndDepositLive`. When false → `regime="UNKNOWN", is_estimate=true, source_tier=4`. GetFedFundsSourceDate added (returns FRED MAX(date) regardless of staleness for fetched_at_source). Commit 09e93d76. Status ops REBUILD.

**2026-06-08:** FIX-MACRO-GO-FIXTURE-FALLBACK — extended `effrStaleBound` from 96h to 168h (7 days) to cover single-week gaps on weekends. FRED publishes business days only. Fallback chain: DB row within 168h (tier 2) → fixture 5.33 only when table empty (tier 4). Commit e03b3ca3. Tests: WeekendSim_BridgedDBValueServed + WeekendSim_FixtureOnlyWhenBothFail PASS.

**2026-05-30:** DPI-1 — `SBVRateSQLiteAdapter` reads `sbv_rates.usd_vnd_official` (6h staleBound, RFC3339Nano); replaces usdVnd if >0. Commit 86f702bf. BLOCKER: frozen fixture carry (4.7/5.33/8.2).

**2026-05-30:** DPI-2 — deleted `fixtureComputedAt`, added `computedAt := time.Now().UTC().Format(time.RFC3339)` at Execute() call time.

**2026-05-30:** DPI-2b — wired live carry/yield inputs from market.db. `CarryYieldInputsPort` (3 methods: GetVNDDepositRate, GetFedFundsRate, GetEarningYield). Resolvers pattern: port>0 ? port : fixture. AC-6 REGIME-FLIP PROVEN (deposit=6.0, fed=4.0 → carrySpread 2.00 NEUTRAL vs frozen −0.63 FII_OUTFLOW_RISK). Commit 56f39ec2.

**Earlier:** P1-E1, P2-X1–P2-X4 (primitives, handlers, DI wiring) — 20/20 GREEN. Category chip relabeling. MACRO-SEED-WIRING. Docker crash-loop fix (Dockerfile TS→Go multi-stage). All committed to history.

---

**Current state (2026-06-08):** FIX-MACRO-GO-DIRECTIVE REVIEW (CI verification pending); FIX-MACRO-REFRESH-DEAD SHIPPED (macro freshness restored); U4 direction+delta REVIEW (ops REBUILD required); all provisioning gates functional (staleness, fixture fallback, per-field provenance).

**Zone health:** HEALTHY — all critical data pipeline fixes shipped; macro refresh cycle active; FRED EFFR stale (known, tier-2 fallback active until data-ingest refreshes).
