# Microservice: macro-indicators

**Language:** TypeScript / Bun
**Port:** 5004 (external + internal)
**Role:** Macro economic snapshot and policy analysis. Aggregates SBV FX rates, commodity prices (via Yahoo Finance), Trading Economics indicators, and prediction market data. Reads `market.db` (readonly). Runs macro scoring and policy impact mapping.

---

## DDD Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| domain | Macro logic | macroThresholds.ts, macroIndicatorScorer.ts, policyImpactMapper.ts, predictionCascadeMapper.ts, predictionSignalDetector.ts |
| infrastructure | `market.db` (readonly), Trading Economics scraper, Yahoo Finance client | Read macro_indicators, commodities, sbv_rates, prediction_* tables |
| interface | HTTP endpoints | Called by mcp-server |

---

## Tool Surface

Macro tools live in mcp-server. See `docs/architecture/microservice/mcp-server/macro.md` for: `get_macro_snapshot`, `macro_policy`, `macro_prediction`, `macro_carry`, `macro_dinhGia`, `macro_calibration`, `macro_evidence`, `macro_imfSignals`, `macro_rateLimit`, `update_thresholds`, `get_calibration_report`, `get_prediction_accuracy`.

---

## Upstream Dependencies (data in)

| Source | How | Cadence |
|--------|-----|---------|
| Vinahost VPS `vn-sbv-fetch.service` | SBV FX rates pushed | 30min |
| Trading Economics | Direct scrape (via mcp-server fetcher) | Per job |
| Yahoo Finance | Direct scrape | Per job |
| Polymarket | Direct REST | 30min |
| `market.db` | Readonly SQLite | On-demand |

---

## Downstream Dependencies (calls out)

None. Leaf service.

---

## Database Write Authority

None. Reads `market.db` with `readonly:true`. mcp-server scheduler jobs write macro data to market.db.

---

## Scheduler Jobs (in mcp-server)

- `baseRateComputationJob` — compute SBV base rate impact
- `calibrationReportJob` — signal accuracy calibration
- `cascadeBacktestJob` — backtest cascade engine accuracy
- `predictionMarketJob` — fetch and store Polymarket data
- `predictionOutcomeJob` — check prediction outcomes
- `predictionResolutionJob` — resolve prediction claims

These jobs call macro-indicators microservice via HTTP (Phase 3b refactor).

---

## Known Invariants

1. Reads `market.db` in readonly mode.
2. Macro snapshot is the canonical source for VN interest rates, USD/VND, gold, oil for agent briefings.
3. Prediction markets: Polymarket volume threshold and probability shift thresholds in `mcp.config.json` → `predictionMarkets`.
