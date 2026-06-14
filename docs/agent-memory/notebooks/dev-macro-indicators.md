# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

---

## Session 2026-06-14 (VMT-5b-LIQUIDITY-STATE-INTERBANK-OMO — sprint VN-MACRO-TOOLING A5 FINAL WAVE-2)

**Task:** Extend POST /liquidity-state with OMO net outstanding + interbank_1w. NO new route. Builds on A4 (VMT-5a, commit 226be604). Final serial Zone-A task in WAVE-2.

**Contract source:** scripts/probes/vmt-4-sample.json (OMO section). June-12-2026 live probe: HTTP 200, 408KB HTML, OMO PASS. Anchor: Mua kỳ hạn 35d=217.45 + 56d=1000.0 = TotalAdd=1217.45 bn VND; Tổng cộng SKIPPED; TotalAbsorb=0; net=1217.45; AuctionDate=12/06/2026.

**Key decisions:**
- OMO parser: `ParseSBVOMOHTML` — walks HTML AST for `<tr>` rows; classifies by "mua kỳ hạn" (add), "bán kỳ hạn"/"tín phiếu" (absorb). "tổng cộng" rows SKIPPED. VN diacritic normalisation via `normaliseVNText`. Auction date from "ngày DD/MM/YYYY" in heading text. Volume parsed via `parseOMOVolume` (period=thousands, comma=decimal VN format).
- OMO URL: `sbvOMOURL = https://www.sbv.gov.vn/vi/web/sbv_portal/nghi%E1%BB%87p-v%E1%BB%A5-th%E1%BB%8B-tr%C6%B0%E1%BB%9Dng-m%E1%BB%9F` — stable monthly-release page. Direct, no VPS proxy. TLS: `buildDirectTLSConfig` (same as A4 policy rates).
- interbank_1w: PERMANENT is_estimate=true + rate_1w_pct=null + blocked_reason="dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)" (architect Decision B). NO fetch attempted. `BuildInterbankRate()` always returns these values.
- OMO fail-closed: ParseOK=false → `BuildOMOFailed(reason, fetchedAt)` → is_estimate=true + net_outstanding=nil.
- OMO success: `BuildOMOSuccess(add, absorb, date, ts)` → is_estimate=false + net=add-absorb.

**Files created (2):**
- `pkg/infrastructure/parsers_vmt_sbv_interbank_omo.go` — `FetchSBVOMOFromHTML`, `ParseSBVOMOHTML`, `OMOParseResult`, `parseOMOVolume`, `normaliseVNText`, `extractAuctionDate`, `isDateDDMMYYYY`
- `pkg/infrastructure/parsers_vmt_sbv_interbank_omo_test.go` — 14 tests (volume parsing, date validation, anchor HTML, mixed add+absorb, subtotal skip, empty/malformed HTML)

**Files modified (5):**
- `pkg/domain/models_vmt_liquidity.go` — Added `OMOOutstanding` + `InterbankRate` + extended `LiquidityStateRecord`
- `pkg/domain/services_vmt_liquidity.go` — Added `BuildInterbankRate`, `BuildOMOSuccess`, `BuildOMOFailed` + constants
- `pkg/domain/services_vmt_liquidity_test.go` — Added 13 tests (interbank always-true, rate nil, OMO anchor, drain, fail-closed all paths)
- `pkg/application/dtos_vmt_liquidity.go` — Added `OMOOutstandingDTO`, `InterbankRateDTO`; extended `LiquidityStateResponse`
- `pkg/application/usecases_vmt_liquidity.go` — Added `OMOInputs`, `OMOProvider` interface; extended `LiquidityStateUseCase` (3rd arg); updated `Execute` + `errorLiquidityResponse`
- `pkg/application/usecases_vmt_liquidity_test.go` — Updated all stubs for 3-arg constructor; added nil-OMO guard + OMO+interbank invariant tests
- `cmd/server/main.go` — Added `omoAdapter` composition-root type + wired into `NewLiquidityStateUseCase`

**Key invariants confirmed:**
- interbank_1w: is_estimate=true on ALL paths (success, error, nil-provider, nil-omo) — architect Decision B PERMANENT
- interbank_1w: rate_1w_pct=nil on ALL paths — NEVER non-nil
- interbank_1w: blocked_reason="dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)" on ALL paths
- IRS: is_estimate=true on ALL paths (DD-6 PERMANENT — A4 invariant preserved)
- OMO: is_estimate=false on parse success (primary SBV HTML) — NOT an estimate
- OMO: is_estimate=true on parse failure (fail-closed)
- OMO: net_outstanding=nil on parse failure (fail-closed)
- NO VPS proxy — SBV direct fetch (same domain as BOP/A4)
- NO new dependency — go.mod UNCHANGED
- NO market.db read for OMO (HTML only); existing DB reads via A4 adapters unchanged
- DB_PATH env → /app/data/market.db (LIVE named volume) — inherited from A4

**Anchor test results (G12 DoD PASS):**
- OMO net_outstanding: 1217.45 bn VND (June-12-2026 probe: add=1217.45, absorb=0) CONFIRMED
- interbank_1w: is_estimate=true + rate_1w_pct=null + blocked_reason set CONFIRMED (all paths incl. error)
- IRS: is_estimate=true CONFIRMED (all paths — DD-6 permanent, inherited from A4)

**Verification:** `go build ./...` GREEN, `go test ./... -count=1` ALL PASS (11 packages, 0 fail), `golangci-lint run` 0 issues. go.mod UNCHANGED (no new dep).

**WAVE-2 serial Zone-A chain:** A5 DONE. FINAL task. Next: VMT-7a-e handler-registration wave + VMT-7-REGISTER.

---

## Session 2026-06-14 (VMT-5a-LIQUIDITY-STATE-NO-GATE — sprint VN-MACRO-TOOLING A4 WAVE-2)

**Task:** Implement VMT-5a (POST /liquidity-state) — three blocs: policy_rates (SBV HTML direct + DB fallback) + sjc_gold_gap (market.db EXISTING reads, DD-7) + fx_coupling (market.db reads) + irs (is_estimate=true PERMANENT DD-6).

**Contract source:** scripts/probes/vmt-4-sample.json (SBV FX + OMO sections). Live DB probe: sbv_rates has refinancing_rate_pct=4.5, discount_rate_pct=1.5; commodity_prices (yahoo) has gold_usd_per_oz=4238.8, dxy=99.807, usd_vnd=26250. No SJC crawler row → SJCPriceMnVND=0 → fail-closed is_estimate=true.

**Key decisions:**
- policy_rates: SBV HTML direct fetch (www.sbv.gov.vn/webcenter/portal, no VPS proxy per task spec). Falls back to sbv_rates DB (refi+discount only; lombard=0 on fallback). is_estimate=true on DB fallback.
- sjc_gold_gap: No SJC table in market.db → SJCPriceMnVND=0 permanently until SJC crawler lands → ComputeSJCGoldGap fail-closed (is_estimate=true, gap=0). worldPriceMnVND = gold_usd_per_oz * usd_vnd / 1e6 * troyOzPerTael (1.20565).
- fx_coupling: sbv_rates.usd_vnd_official as center rate; dxy+cny from commodity_prices (yahoo). BandPct=5.0 (SBV ±5% policy constant). usd_vnd_buy/sell=0 (not in sbv_rates table — safe degrade).
- IRS: BuildIRSField() → is_estimate=true PERMANENT (DD-6) — same pattern as VMT-1b bloc_split.

**Files created (8):**
- `pkg/domain/models_vmt_liquidity.go` — PolicyRates, SJCGoldGap, FXCoupling, IRSField, LiquidityStateRecord domain models
- `pkg/domain/services_vmt_liquidity.go` — BuildIRSField (always true), ConvertWorldGoldToMnVND, ComputeSJCGoldGap, BuildFXCoupling
- `pkg/domain/services_vmt_liquidity_test.go` — 15 tests (IRS always-true, anchor gold conversion, SJC fail-closed, FX coupling)
- `pkg/application/dtos_vmt_liquidity.go` — PolicyRatesDTO, SJCGoldGapDTO, FXCouplingDTO, LiquidityStateIRSDTO, LiquidityStateResponse
- `pkg/application/usecases_vmt_liquidity.go` — LiquidityStateUseCase (PolicyRatesProvider + SJCFXProvider interfaces)
- `pkg/application/usecases_vmt_liquidity_test.go` — 7 tests (nil guards, IRS always-true incl. error paths, SJC fail-closed, anchor, policy fallback)
- `pkg/infrastructure/adapters_vmt_sjc_fx.go` — SJCGoldFXAdapter (market.db reads) + ParseSBVPolicyRatesHTML + FetchSBVPolicyRatesFromHTML + FetchSBVPolicyRatesFromDB
- `pkg/interface/http/handlers_vmt_liquidity.go` — handleLiquidityState chi handler for POST /liquidity-state

**Files modified (2):**
- `pkg/interface/http/router.go` — RouterConfig extended (LiquidityState field), POST /liquidity-state route added
- `cmd/server/main.go` — policyRatesAdapter + sjcFXAdapter + LiquidityStateUseCase wired

**Key invariants confirmed:**
- IRS.IsEstimate=true on ALL paths (DD-6 PERMANENT) including nil-provider, fetch-error, parse-error
- SJCGoldGap.IsEstimate=true when SJC absent from DB (fail-closed, DD-7 — no SJC crawler yet)
- policy_rates.IsEstimate=true on DB fallback path; false on HTML success
- FXCoupling.IsEstimate=false when center rate > 0; true on DB absent/stale
- dbPath = /app/data/market.db (LIVE named volume from DB_PATH env) — NOT host ./data/market.db
- NO new excelize / NO new heavy dep (HTML + SQLite only)
- NO new crawl/fetch for sjc_gold_gap (existing DB reads only, DD-7 compliant)
- TLS: buildDirectTLSConfig NEVER InsecureSkipVerify=true; VPS_CACERT_PATH pattern respected

**Anchor test results (G12 DoD PASS):**
- policy_rates parse: refi=4.5 PASS, discount=1.5 PASS (DB anchor from live sbv_rates)
- sjc_gap: SJC absent → gap=0, is_estimate=true CONFIRMED (fail-closed)
- irs: is_estimate=true ALWAYS CONFIRMED (5 test cases incl. all error paths)
- world gold anchor: gold=4238.8 USD/oz * usd_vnd=26250 * troyOzPerTael=1.20565 / 1e6 ≈ 134.2 mn VND/tael PASS
- FX coupling anchor: usd_center=25155, band=5.0%, dxy=99.807 PASS

**Verification:** `go build ./...` GREEN, `go test ./... -count=1` ALL PASS (11 packages, 0 fail), `golangci-lint run` 0 issues.

**Commit scope (explicit path):** 10 files — 8 new + 2 modified — ALL in apps/macro-indicators/. Notebook staged separately.

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
