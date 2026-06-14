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

## Session 2026-06-15 (VMT-8-MACRO-GRACEFUL-FAILCLOSE)

**Task:** Graceful fail-close on upstream-fetch failure for all 5 Zone-A use-cases (trade/bop/macro/cpi/liquidity). Was returning opaque HTTP 500 on VPS proxy down / NSO Excel parse error.

**Root cause confirmed:** `errorXxxResponse` builders in all 5 use-cases returned `(populatedDegradedDTO, fmt.Errorf(...))`. Handler's `if err != nil { 500 }` discarded the good DTO.

**Fix pattern (one shared, applied uniformly):**
- New `degradedXxxResponse(blockedReason)` → returns `(resp, nil)`: Status="degraded", IsEstimate=true, BlockedReason naming unreachable source. Handler emits HTTP 200.
- Kept `errorXxxResponse(msg)` → returns `(resp, err)`: Status="error". Handler emits HTTP 500. Only for nil-provider/wiring faults.
- Upstream-fetch/parse errors in Execute now call degraded path; nil-provider guards call error path.
- `degradedLiquidityResponse` added to harden liquidity's latent bug (Execute already handles upstream blocs non-fatally inline; function available for future whole-response degrade).

**DTOs extended:** `BlockedReason string json:"blocked_reason,omitempty"` added to TradeBalanceResponse, BOPResponse, MacroIndicatorsGSOResponse, CPIComponentsResponse, LiquidityStateResponse.

**Permanent invariants preserved on degraded paths:** BlocSplit FDI/Domestic.IsEstimate=true (ARCH Decision A), IRS.IsEstimate=true (DD-6), Interbank1W.IsEstimate=true + Rate1WPct=nil (architect Decision B), WeightsIsEstimate=true.

**Test gates:** G1 (8 use-case unit tests: fetch+parse failure per use-case), G2 (4 handler HTTP-200 tests via forced-failure fixture), G3 (8 nil-provider HTTP-500 regression), G4 (3 permanent-invariant table tests). 209 tests total, all PASS.

**Commit:** 7a176a44 — 14 files, apps/macro-indicators/** only.

---

## Session 2026-06-15 (F-MACRO-FETCH-DEADLINE — reliability fix, size S)

**Task:** Bound ALL outbound VPS fetches to `domain.FetchBudgetSec` (8s) so a hanging NSO/SBV origin fires `ctx.DeadlineExceeded` within budget → VMT-8 degrade path → HTTP 200 degraded-200. Previously callers set `TimeoutSec: 30` across 3 chained fetches (up to ~90s) causing gateway-timeout before degrade path fired.

**Root cause confirmed (code read):**
- `cache_vmt_nso.go discoverAndFetch`: `TimeoutSec: 30` on all 3 steps, outer ctx had no deadline → 3×30s = 90s hang window.
- `usecases_vmt_bop.go fetchAndParseQuarter`: `TimeoutSec: 30`, plus fallback quarter = 2×30s = 60s.
- `vpsFetch.go` zero-timeout fallback hardcoded `30 * time.Second`.

**Fix (single SSOT — no scatter):**
- Added `domain.FetchBudgetSec = 8` const in `pkg/domain/ports.go` — accessible to all layers, never hardcoded elsewhere.
- `vpsFetch.go` zero-timeout fallback now uses `domain.FetchBudgetSec` (not literal 30).
- `cache_vmt_nso.go discoverAndFetch`: `context.WithTimeout(ctx, FetchBudgetSec)` wraps WHOLE chain + per-step `TimeoutSec: FetchBudgetSec`.
- `usecases_vmt_bop.go Execute`: `context.WithTimeout(ctx, FetchBudgetSec)` wraps ALL of `fetchRecord` (current + fallback quarter). Inner `fetchAndParseQuarter` also sets `TimeoutSec: FetchBudgetSec` (belt-and-suspenders).
- `usecases_vmt_trade/macro/cpi.go Execute`: `context.WithTimeout(ctx, FetchBudgetSec)` wraps `GetOrFetchNSOMonthlyExcel` call.

**VMT-8 degrade logic: NOT TOUCHED.** Hang → error → existing `degradedXxxResponse` path → HTTP 200.

**Tests added (2 files, generic):**
- `pkg/application/fetch_deadline_test.go`: 7 tests — `hangingVpsFetcher` + `hangingNSOProvider` stubs; asserts elapsed < FetchBudgetSec+3s slack; Status="degraded", IsEstimate=true, BlockedReason set; permanent invariants (BlocSplit, WeightsIsEstimate, OffshoreParked); already-expired ctx; const sanity gate.
- `pkg/infrastructure/cache_vmt_nso_deadline_test.go`: 2 tests — real httptest hang server; NSO chain bounded to 8.006s (budget 11s); const SSOT structural check.

**Results:** `go build ./...` rc=0, `go vet ./...` rc=0, `go test ./... -count=1` ALL PASS (11 packages, 0 fail). Deadline tests fire at exactly 8s per run.

---

## Archive: Earlier Sessions (2026-06-13 through 2026-05-30)

Sessions VMT-5a, VMT-1a/1b, VMT-3b/VMT-4, VMT-2 (WAVE-2 A1-A5), TSU-DEV-U4, FIX-MACRO-GO-DIRECTIVE, FIX-MACRO-REFRESH-DEAD, U4 direction+delta sweep, and pre-2026-06-07 work (P1-E1, P2-X1–P2-X4, MACRO-SEED-WIRING, Docker fixes). See git history commits c712d96...9880eadc (2026-06-14 and prior).

---

**Current state (2026-06-08):** FIX-MACRO-GO-DIRECTIVE REVIEW (CI verification pending); FIX-MACRO-REFRESH-DEAD SHIPPED (macro freshness restored); U4 direction+delta REVIEW (ops REBUILD required); all provisioning gates functional (staleness, fixture fallback, per-field provenance).

**Zone health:** HEALTHY — all critical data pipeline fixes shipped; macro refresh cycle active; FRED EFFR stale (known, tier-2 fallback active until data-ingest refreshes).
