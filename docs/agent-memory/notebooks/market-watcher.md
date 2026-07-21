# Market Watcher — Notebook
**Last updated:** 2026-07-21 16:16 UTC | **Sprint:** 2026-Q3

## Carry-over
- **SLOT OVERLAP (new, needs dispatcher look):** the EOD cycle wrote its ledger + `docs/signals/price_anomaly_20260721T1613.json` at 16:13 UTC while this offhours cycle was mid-run (started 16:09 UTC). Two market-watcher cycles processed the *same* 08:32 closing prices ~4 min apart. Dispatcher routed 16:09 to `offhours` because EOD window is 16:00±5 and the EOD slot itself fired late (~16:08–16:13). Not a data error — but two cycles per close is wasted work; worth a cadence fix.
- EOD slot had a 4-day gap (last fire 2026-07-17) and self-recovered today.

## Cycle (offhours, 16:09–16:16 UTC)
- Stocks: 10 | Anomalies: 2 (>2.5σ) | Volume spikes: 1 | Chain confirms: 0
- Regime: NEUTRAL (fallback — see WARN) | DXY: unavailable | US10Y: unavailable | fx_pressure: [] | pe_risk: []
- `[WARN] regime fallback: NEUTRAL (macro_snapshot JSON shape has no REGIME field)` — known schema gap, not an agent error
- Offhours floor applied: sigma 2.0→2.5σ, volume 2.0→2.5x
- Sweep forced: DXG, KDH, NVL (all last covered 2026-07-18T08:06Z, 80h stale) — all sub-threshold, no signal emitted (log-only, per flow)

### Anomalies emitted (bus → alert-commander)
- **GAS** -6.98% = 2.89σ (30d SD 2.42%), volume 4.02x → signal id 8680
- **D2D** -3.30% = 2.51σ (30d SD 1.32%), volume 1.46x, at 52w low → signal id 8681
- Near-miss, not emitted: PLX 2.44σ, GEX 1.86σ, BSR 1.80σ, FPT 1.94σ, DIG 1.38σ, DXG 1.48σ

### Dedup note — GAS double-coverage
GAS at this same close was already written to the EOD signal *file* at 16:13. AutoCure c47 off-hours guard was checked against the **bus** (`get_agent_signals`, 24h → zero market-watcher rows). Emitted anyway because the consumers differ: the EOD file feeds CHEF/unified-agent; alert-commander had received **no** GAS price_anomaly today. Flagging that the c47 guard text says "generated a signal" without distinguishing file-vs-bus lanes — ambiguous, and I resolved it by consumer. D2D was absent from the EOD set, so it is unambiguously net-new.

### Headline — crude/equity divergence persists
Brent +2.71% to $91.41 yet Dầu khí sector **-6.05%/1d**, worst of 17 sectors (next: Công nghệ -2.79%). GAS is the least-explained leg: still momentum decile 10 on 60d ROC (+20.3%) while breaking down intraday. Recorded as observation — `get_open_chain_findings(15m)` returned only news-scout rows (2 bearish `chain_catalyst` unattributed + 1 DIG `urgent_news`), no market chain to confirm against.

### Breadth is the real story
26 new 52w lows vs **0** new highs; only 5.6% of watchlist above MA50, 8.3% above MA200; ADL -316. Volatility term structure inverting: rv_10d 18.76% > rv_20d 14.73% > rv_60d 13.70% (regime still labelled NORMAL at 32.9th pct). 9 of 10 tickers priced returned `Tổng thể: GIẢM` with 0/4 bullish indicators; only NVL was neutral.

## Data gaps (honest — probed, not assumed)
- `get_insider_sentiment`: null, `INSUFFICIENT_DATA: no valid buy/sell transactions in 90d window`
- `get_vn_liquidity_state`: OMO null (`OMO HTML parse: no add/absorb rows found`), interbank_1w null (`dttktt.sbv.gov.vn unreachable from VPS`), SJC gold gap 0 (no SJC crawler row) → T-27 gap direction **unreadable**, not claimed
- `cny_vnd_rate` = 0 → T-28 `cny_coupling_active` **indeterminate**; no VND-stress call made either way
- `get_breadth_thrust`: mclellan_osc / summation / zweig / breadth_z all null (`sessions_below_21`, only 3 sessions accrued)
- Rapid-market-cap screen: both anomaly tickers pass the 500B size gate (GAS 176,387B, D2D 870B); valuation bands **UNAVAILABLE** — no BCTC rows for either, so no SKIP-EXPENSIVE could fire
- MACRO_HEALTH ran DEGRADED: production/consumption/inflation/investment tracks all `is_estimate=true`
- T-20 oil→CPI: Brent +2σ above 30d mean (open HIGH macro alert) → `cpi_pressure_imminent=true` flagged, no lag assumed

## Metrics (cycle 2026-07-21 16:16 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 10 |
| signals_emitted | 2 |
| signals_suppressed | 0 |
| evidence_fragments_recorded | 20 (ids 324–346; 10x momentum_5d + 10x momentum_20d) |
| sweep_tickers_forced | 3 |
| coverage_state_updated | yes |
| exit_status | complete |
