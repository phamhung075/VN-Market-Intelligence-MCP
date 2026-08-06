# Tool Group: macro (mcp-server)

**Module path:** `src/interface/mcp/tools/macro/`
**Scheduler:** `src/scheduler/macro/` (6 jobs)
**Domain services:** macroThresholds, macroIndicatorScorer, policyImpactMapper, predictionCascadeMapper, predictionSignalDetector

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_macro_snapshot` | Current macro snapshot: SBV rates, USD/VND, gold, oil, VN-index | — | macro-indicators svc (HTTP) |
| `macro_policy` | SBV monetary policy analysis and impact | — | macro-indicators svc |
| `macro_prediction` | Macro-based prediction signals | — | predictionSignalDetector |
| `macro_carry` | Carry trade analysis (USD/VND interest differential) | — | macro-indicators svc |
| `macro_dinhGia` | Định giá (valuation) using macro factors | ticker? | macro-indicators svc + market.db |
| `macro_calibration` | Macro signal calibration report | — | calibrationReportJob data |
| `macro_evidence` | Evidence items linked to macro signals | — | market.db (evidence_items) |
| `macro_imfSignals` | IMF/World Bank signals affecting VN | — | macro-indicators svc |
| `macro_rateLimit` | Rate limit status for macro data sources | — | rateLimiter domain svc |
| `update_thresholds` | Update alert thresholds dynamically | threshold_key, value | mcp.config.json (via config loader) |
| `get_calibration_report` | Signal calibration accuracy report | — | market.db (prediction_*) |
| `get_prediction_accuracy` | Prediction market accuracy stats (historical prediction_signals — unaffected by the acquisition retirement below) | — | market.db (prediction_*) |
| `create_prediction_claim` | Create a new prediction claim | claim, resolution_date | market.db |

> `get_prediction_markets` (live Polymarket + internal prediction data query) was deregistered by
> FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR (2026-07-31, architect RULING: RETIRE).
> gamma-api.polymarket.com is blocked at the ISP level by France's ANJ gambling regulator
> (rigged markets + zero KYC finding) — a sovereign-regulator block, not a generic
> anti-scraper geoblock, so the VPS-proxy pattern used for VN-source geoblocks does not
> apply here. `predictionMarkets.enabled` now defaults to `false` (config.ts + mcp.config.json);
> `predictionMarketPollJob` stays registered in the scheduler as a cheap no-op gated by that
> flag, so re-enabling is a single `PREDICTION_MARKETS_ENABLED=true` env flip if the upstream
> block is ever lifted. `market.db`'s `prediction_markets`/`prediction_signals` tables are left
> as-is (harmless once nothing reads/writes them).

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `baseRateComputationJob` | Daily | Compute SBV base rate impact on portfolio |
| `calibrationReportJob` | Weekly | Signal accuracy calibration report |
| `cascadeBacktestJob` | Weekly | Backtest cascade engine accuracy |
| `predictionMarketJob` | Every 30min | Fetch + store Polymarket data |
| `predictionOutcomeJob` | Daily | Check prediction claim outcomes |
| `predictionResolutionJob` | Daily | Resolve pending prediction claims |

---

## Invariants

1. `get_macro_snapshot` is the canonical source for VN interest rates, USD/VND, gold, oil in agent briefings.
1a. **`get_macro_snapshot.text` is human-readable prose, never raw JSON (FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT, 2026-08-01):**
   `text` is built by `buildMacroSnapshotText()` (`macroTools.ts`) — a GENERIC recursive
   renderer (`renderSection`/`humanizeKey`) that walks the raw macro-indicators response
   and emits a bracketed `[Section]` / indented `Key: Value` block, same shape family as
   `get_market_snapshot`'s text. No per-field/per-ticker hardcode: any field the Go
   service adds is rendered automatically, zero code change needed here. The raw
   upstream payload is ALSO passed through verbatim as the envelope's `data` field
   (`{ source_tier, text, fetchedAt, data }`) so synthesizing agents that need typed
   values (e.g. `data.signals.carry.regime`) don't have to parse prose. Closes a latent
   MARKET-channel leak-trap (VERIFY-COWORK-MACRO-SNAPSHOT-ENVELOPE, router-verified no
   active leak at the time) where `text` used to be `JSON.stringify(data)`.
2. Prediction market thresholds: `mcp.config.json` → `predictionMarkets` (volume threshold, probability shift %, min wallets).
3. `update_thresholds` is operator-level — dev-team flow only, not Cowork agents.
4. Adaptive thresholds auto-adjust based on rolling window statistics. Manual override via `update_thresholds`.
5. **`create_prediction_claim` write-door contract (FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT, 2026-07-25):** `creation_price` is captured unconditionally (latest close from `daily_ohlcv`), independent of the optional `direction`/`expected_move_pct` pair — `apps/mcp-server/src/infrastructure/db/predictionClaimStore.ts::insertPredictionClaim()` runs a `.strict()` Zod contract at the store boundary that REFUSES (throws) any insert with a null/missing `creation_price`, so no caller (tool handler or internal, e.g. `intelligenceCycleJob.ts`'s chain-synthesis auto-claim) can persist an unscoreable claim. Legacy pre-fix rows (creation_price=NULL, minted 2026-06-14 through 2026-07-25) are untouched — backfill is a separate, not-yet-decided question.
6. **`get_macro_snapshot` vnIndex cross-plane plausibility gate (FIX-VNINDEX-CROSS-PLANE-PLAUSIBILITY-GATE, 2026-08-06):** root incident — a tier-4 `is_estimate` `vnIndex` (1280.5, macro-indicators' fixture fallback) produced a bogus -526.13 "delta" that reached MARKET as fact (dish 933, false ~29% crash) with no same-cycle check against `apps/mcp-server`'s own local VN-Index reference. `macroVnIndexGate.ts::applyVnIndexPlausibilityGate(data)` (interface layer, extracted from `macroTools.ts` per the FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L precedent) is called immediately after `const data = result.data` — BEFORE both `buildMacroSnapshotText(data, fetchedAt)` AND the raw `data` JSON passthrough, so a single mutation point protects both channels. It reads `vn_index_cache` via the existing `getVnIndexCache()` reader, gates freshness via the existing `freshnessSlaChecker.checkSignalSla("price", ageMinutes)` (market-hours-aware, no new threshold), and delegates the actual verdict to the pure domain guard `evaluateVnIndexPlausibility()` (`domain/services/vnIndexPlausibilityGuard.ts`): fail-closed (gap-token) only when the local reference is untrustworthy AND macro reports estimate/tier>=3; fail-open when the local ref is untrustworthy but macro is tier-1; unconditional >=5% divergence check (local-denominator, inclusive at exactly 5.00%) whenever the local reference is fresh, regardless of tier (defends against a tier-1 mislabeling, not just a flagged estimate). On failure: `data.vnIndex`/`data.vnIndexDelta` → `null`, `data.vnIndexDirection` → `"unknown"`; `vnIndex_is_estimate`/`vnIndex_source_tier` are left UNCHANGED (diagnostic, not the leaking channel). **Documented structural limit:** on macro-indicators' tier-1 happy path, its own primary query reads the SAME physical `market_prices.VNINDEX` row this guard's local reference also reads — the guard conclusively catches the fixture-fallback/mislabeling incident class, but cannot discriminate a corrupted-but-honestly-tier1-reported value (both planes are byte-identical by construction); a genuinely independent tier-1 corroboration would require a live re-fetch (out of scope — see the guard file's own doc-comment).
