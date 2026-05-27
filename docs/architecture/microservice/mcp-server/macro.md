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
| `get_prediction_accuracy` | Prediction market accuracy stats | — | market.db (prediction_*) |
| `create_prediction_claim` | Create a new prediction claim | claim, resolution_date | market.db |
| `get_prediction_markets` | Polymarket + internal prediction data | — | market.db (prediction_*) |

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
2. Prediction market thresholds: `mcp.config.json` → `predictionMarkets` (volume threshold, probability shift %, min wallets).
3. `update_thresholds` is operator-level — dev-team flow only, not Cowork agents.
4. Adaptive thresholds auto-adjust based on rolling window statistics. Manual override via `update_thresholds`.
