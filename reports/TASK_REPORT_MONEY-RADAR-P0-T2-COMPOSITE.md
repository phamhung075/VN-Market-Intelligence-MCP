# Task Report: MONEY-RADAR-P0-T2-COMPOSITE — get_money_radar_composite live-data QA
date: 2026-07-01
outcome: CHANGES_REQUESTED
commit: 0026f9e1

## Method

Live-data verification harness: `scripts/qa/verify-money-radar-live.ts` — invokes the
COMMITTED usecase (`getMoneyRadarComposite`) against a docker-cp'd snapshot of the
live named-volume market DB (`vn-market-intelligence-mcp-mcp-server-1:/app/data/market.db`)
plus real sibling HTTP services (stock-price :5010 host-mapped, technical-analysis
:5003, macro-indicators :5004 — genuinely live, no stubbing except the deliberate
"thin" scenario). Read-mostly against a disposable DB copy; `recordDailyScore`'s
INSERT OR IGNORE lands on the copy only, never on the production volume.

## Gate Results (7/7 items — real observed evidence)

**1. Real non-null composite score, 4 named legs contributing — PARTIAL PASS (bug found)**
Live run: `score: -0.02269989707258007`, `coverage_pct: 0.679`, `source_tier: 2`,
`is_estimate: false`. 3 of 4 named legs non-null and real: `obv_slope: 0.0811`,
`rel_vol_z_20: -0.9279`, `volatility_regime: 0` (NORMAL). `foreign_accum_z_market: null`
— traced root cause (blocking, see Issues).

**2. coverage_pct<0.5 → score:null + null_reason, not zero-fill (HN-2) — PASS**
Forced empty-DB + all-fail-fetch run (real code, no fixtures): `score: null`,
`coverage_pct: 0`, `source_tier: null`, `null_reason` lists all 10 missing components
with individual reasons; every `components{}` entry renders `null`, never `0`.

**3. D2 fires on REAL historical example — PASS**
`market_prices_history` (composite's own VNINDEX source) currently retains only
~1 calendar day table-wide on live DB (42,171 rows, all dated 2026-07-01) — D1/D2
cannot resolve through the composite's own live code path today (see non-blocking
finding). Sourced VNINDEX from `daily_ohlcv` (754-day depth, same data, already in
the live DB) to scan real history: 99 real D2-candidate windows found, most recent
2026-06-22 → 2026-06-26. Window ending **2026-06-24**: `index_return_5d = +0.0398`
(VNINDEX up), aggregate OBV slope across 37 resolved watchlist tickers `= -0.5135`
(22 falling vs rising). Fed through the actual committed
`detectD2PriceVsObv(0.0398, -0.5135)` → `{"id":"D2","status":"FIRED"}`;
`aggregateDivergence([d2])` → `{"flag":"AMBER","severity":1,"detectors":["D2"]}`.

**4. Null divergence axis → UNKNOWN, never GREEN (HN-4) — PASS**
Same forced-thin run as item 2: `divergence.flag: "UNKNOWN"`, all 4 detectors
UNKNOWN, `detectors: []`, `severity: 0`, never GREEN.

**5. credit-flow is_estimate=true excluded (HN-3) — PASS**
Direct live call `getCreditFlowSignalHandler({})` → `{"direction":"up","is_estimate":true}`.
Full live composite correctly shows `credit_flow_direction: null` (excluded per
`getMoneyRadarComposite.ts:292-304`).

**6. source_tier = min contributing tier (HN-7) — PASS**
Live run: `source_tier: 2` — cross-checked manually: non-null legs were
foreign_net_direction(T2), obv_slope(T3), rel_vol_z_20(T3), up_down_vol_ratio(T3),
degraded_vwap_proxy_z(T3), carry_regime(T2, is_estimate=false), volatility_regime(T3)
→ min=2, matches. Also unit-spot-checked `fuseComponents()` directly: a null
tier-3 slot correctly excluded from the tier floor (result stayed at min(2,4)=2).

**7. No fabrication on thin-data paths — PASS**
Every null component in both the "thin" run and the live run renders as JSON
`null` — spot-printed per-component in the harness; none silently became `0` or a
plausible-looking number.

## Blocking Issue

`apps/mcp-server/src/application/usecases/getMoneyRadarComposite.ts:174` —
`computeForeignAccumRank({})` never passes ticker codes (unlike the sibling call
to `computeMoneyFlowOscillators` at line ~215 which does pass
`watchlistCodes`). Compounded by
`apps/mcp-server/src/infrastructure/microservices/clients.ts:489` —
`ComputeForeignAccumRankRequest.tickers` field name does not match the Go
stock-price service's actual DTO field
(`apps/stock-price/pkg/application/foreign_accum_dtos.go:9`:
`Codes []string \`json:"codes,omitempty"\``).

Live-verified: `curl -X POST /price/foreign-accum-rank -d '{}'` →
`{"tickers":[],"foreign_accum_z_market":null}`; same call with
`{"codes":[...41 watchlist tickers]}` → `{"tickers":[41 rows],"foreign_accum_z_market":-6.0e-18}`
(a real non-null value). Confirmed `WATCHLIST_TICKERS` env var is unset on the
live stock-price container, so the Go handler's env-fallback (used whenever no
`codes` field is recognized) also resolves empty. Net effect: `foreign_accum_z_market`
— one of this task's own DoD-required non-null legs — is **deterministically
always null in production**, not intermittent. This is an honest null (not a
fabrication, no HN violation), but it is a real, reproducible, in-scope
correctness defect that silently defeats a primary composite signal.

**Fix:** pass `{ tickers: watchlistCodes }` at the call site AND correct/alias the
DTO field name to `codes` to match the Go contract.

## Non-Blocking Finding (surfaced, not this task's fix scope)

`market_prices_history` (read by `getVnIndexDailyCloses` in
`moneyRadarStore.ts:48`) currently retains only ~1 calendar day of data
table-wide across ALL tickers on the live DB (not VNINDEX-specific) — an
intraday polling cache, not a growing daily-close history. This means D1 and
D2 will resolve UNKNOWN (never FIRED/CLEAR) through the composite's live code
path today, regardless of real market conditions, purely from data depth.
`daily_ohlcv` (code='VNINDEX') already holds 754 days of the exact same close
series in this same live DB. Same root class as the previously known project
issue "OHLCV startup purge defeated by backfill seeder" / "price-history ~2d
deep" — pre-existing, cross-tool infra gap, not introduced by this commit (the
code correctly reuses the same query pattern as `correlationTools.ts`'s
`loadPriceHistory()`). The detector logic itself is correct and honest
(UNKNOWN, not a false CLEAR/GREEN) — this is a data-availability gap, not a
code defect. Recommend a follow-up backlog item, not a block on this task.

## Deploy Status (informational)

Running container `vn-market-intelligence-mcp-mcp-server-1` predates this
commit — image built `2026-07-01T00:05:49Z`, commit landed
`2026-07-01T10:14:14Z` UTC. Confirmed 3 ways: (1) `docker exec ... grep -rl
get_money_radar_composite /app/src` → 0 matches; (2) live `/health` reports
`toolCount: 182` matching the PRE-commit `tool-registry.json.totalCount`
(current checked-out repo now says 183); (3) image-creation timestamp
precedes commit timestamp. Rebuild required before the tool is servable —
expected, ops rebuilds after APPROVED.

## Merge Status
CHANGES_REQUESTED — fixer to apply the foreign_accum_z_market wiring fix
(round < 2, per qa-checklist).
