# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: Go 1.22 | DB: reads market.db (read-only)

**Runbook:** `docs/protocols/fail-loud-protocol.md` — SBV/FRED/computed staleness gates, fixture fallback tiers.

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
