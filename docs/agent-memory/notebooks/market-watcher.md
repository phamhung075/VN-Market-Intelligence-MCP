# Market Watcher — Notebook

> Archived prior to 2026-05-12 → docs/agent-memory/archive/market-watcher-archive-2026-05-12.md

**Last updated:** 2026-05-12 07:41 UTC | **Sprint:** 1846

## Current state

Last successful cycle: 2026-05-12 05:38 UTC (market OPEN, 26 stocks priced)
- 26/31 watchlist tickers priced (5 N/A: BDI,DLC,SIS,VDC,JSH)
- VN-Index recovery to 1,920+ (bullish gap open vs Mon close 1,895.5)
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK | Oil elevated (Brent $105.11, US-Iran)
- 21 open alerts (VIC×5 MEDIUM/LOW, FPT×3, VRE, GAS, HCM, HSG)

## Known patterns / preferences

- EOD cycle scheduled for 16:00 UTC
- Requires: `get_watchlist()`, `get_price_history()`, `get_technical_indicators()`, `get_insider_signals()`
- Outputs: Ledger entries, Telegram MARKET channel summary
- post_agent_signal schema issue: price_anomaly payload missing required field `root` (linked to TASK-1365)
- Tool param mismatches (flagged, developer-gated): `get_price_history` uses `code` not `tickers`; `get_sector_comparison` requires `code`; `get_technical_indicators` + `get_ticker_intelligence` use `code` not `ticker`

---

## Last 5 cycles (2026-05-12)

### Cycle (00:38–00:41 UTC)
- Stocks: 31 (EOD snapshot 2026-05-11 09:00 UTC, market CLOSED) | Anomalies: 2 (FPT 2.13σ, VRE vol-spike 1.79σ) | Volume spikes: 2 (FPT ~13x, VRE ~17x) | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STRENGTHENING (USD/VND 26,123) | US10Y: RISK-OFF (FII outflows, VN-Index -20pts) | fx_pressure: [VRE, VHM, VIC, banking] | pe_risk: [FPT, VHM, VIC]
- FPT -2.64% (2.13σ, 30d stddev 1.24%, vol 16.91M ~13x avg) → signal #2960 → alert-commander. pe_compression_risk=true (FII xả mạnh nhất sàn, kh ngoại bán ròng ~14,100B VND). Price at multi-year low 70,000.
- VRE -6.41% (1.79σ, 30d stddev 3.59%, vol 11.67M ~17x avg ~690K) → signal #2961 → alert-commander. Volume spike trigger (>2.0x). fx_pressure=true (realty + USD strengthening). Massively underperforms sector (-1.36% avg vs -6.41%).
- HSG -2.81% (0.47σ — high base stddev from -21.63% drop 2026-05-04 anti-dumping probe) → not signalled. chain_catalyst: Australia anti-dumping investigation HSG/NKG (news-scout id=2957, impact=7).
- Sector 1d: Tech -2.15%, Real estate -1.36%, Steel -1.31%, Banking -0.76% | Oil&Gas +1.29% (Brent $104.46)
- Supply chain: STABLE (BDI=1,400) | Energy: NORMAL (hydro 70%) | Macro: Brent $104.46 + US-Iran tensions → CPI/SBV tightening risk
- Open chain findings: 0 (last 15 min) | GAS risk: energy shock (Asia + US-Iran, signal id=2959)

## Metrics (cycle 2026-05-12 00:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 10 |
| signals_emitted | 2 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3200 |

### Cycle (02:38–02:40 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (26,129) | US10Y: NEUTRAL (US equities new highs) | CARRY: NEUTRAL | fx_pressure: [] | pe_risk: []
- FPT +1.86% (1.43σ, 30d stddev ~1.30%) — below 2.0σ; chain_catalyst active (institutional accumulation, news-scout id=2966, exp 04:22 UTC). Evidence bearish 0.764 > bullish 0.640 — conviction split.
- GAS +0.95% (0.36σ, 30d stddev ~2.67%) — below threshold; HIGH alert for news_mention (Brent +3%, US-Iran). Bullish evidence 0.633.
- POW +1.08%, VHM +0.87%, VRE +0.89% — all below threshold.
- Sector 1d: Tech +1.05%, Logistics +1.58%, RE +1.30%, Insurance +1.02% leading | Auto -0.89%, Pharma -0.07% lagging. All STABLE (only 1d data, no 5-session rotation confirmed).
- Supply chain: STABLE (BDI=1,400, no disruptions) | HCM price_drop alert MEDIUM (was -6.90% at 02:01 UTC, now +0.36% recovery)
- Open chain findings: 0 (last 15 min) | Open alerts: 15 | System: OK

## Metrics (cycle 2026-05-12 02:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 7 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2200 |

### Cycle (03:38–03:41 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 new (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (inferred — no macro snapshot in package) | DXY: N/A | US10Y: N/A | fx_pressure: [] | pe_risk: []
- VRE +4.76% (≈1.29σ, 30d stddev ~3.70%) — below 2.0σ threshold; existing MEDIUM price_surge alert active (03:19 UTC, 33,600→35,350). Not re-signalled.
- HCM +2.00% (≈0.74σ, 30d stddev ~2.70%) — below threshold; recovered from intraday -6.90% (02:01 alert). Securities sector +0.43% 1d.
- GAS +0.82% (≈0.31σ, 30d stddev ~2.67%) — below threshold; bullish evidence 0.633; existing HIGH news_mention alert active (Brent +3%, US-Iran).
- Macro: Brent $105.11 (elevated), Gold $4,735.5 (stable/elevated), USD/VND 26,129. Open alerts: 17.
- Sector 1d: RE +1.27%, Securities +0.43%, Oil&Gas +0.20% leading | Banking -0.25%, Pharma -0.43% lagging. All STABLE (1d only, no 5-session rotation).
- Supply chain: STABLE (BDI=1,400, no disruptions) | Energy: NORMAL (hydro 70% est.) | Climate: early dry heat (May) — IDC,KBC,GEG; no watchlist impact.
- Open chain findings: 0 (last 15 min)

## Metrics (cycle 2026-05-12 03:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 11 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3500 |

### Cycle (04:37–04:45 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 1 (VIC)
- Regime: NEUTRAL | DXY: USD STABLE (26,129) | US10Y: RISK-ON (US mkts new highs) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- VIC -2.78% (0.94σ, 30d stddev ~2.96%) — below 2.0σ anomaly threshold; chain_catalyst confirmed (news-scout id=2970, conf=0.82, bearish). VCBF reduced VIC stake; large fund fully exited. Signal posted id=2972 (chain_depth=1).
- VRE +2.38% (0.66σ, 30d stddev ~3.61%) — partial recovery from yesterday's -6.41%. Below threshold.
- VHM -1.43% | CTG -1.12% | EIB -1.10% — all below threshold; broad banking/RE weakness.
- GAS +0.54% — oil elevated (Brent $104.89). Sector rotation: oil_gas +0.35%, realty +0.24%, banking -0.32%.
- CARRY_REGIME=FII_OUTFLOW_RISK: no hot_money_concentration check (not HOT_MONEY_INFLOW).
- Open chain findings: VIC (bearish, conf=0.82) + HSG (bearish, conf=0.75). HSG -0.41% — insufficient price confirmation.
- Open alerts: 20 | System: OK

## Metrics (cycle 2026-05-12 04:37 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 5 |
| signals_emitted | 1 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2800 |

### Cycle (05:38–05:42 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (26,129) | US10Y: RISK-OFF (gold $4,727.5, SPDR buying) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Notable moves: VIC -2.78% (0.94σ, below threshold, already signaled 04:37); VRE +2.38% (0.64σ, existing MEDIUM alert); EIB -1.10% (0.66σ, reversal of prior streak); VHM -1.43%, CTG -1.12%, GVR -1.29% — all below threshold
- Chain findings (15min): HSG bearish (AU anti-dumping, conf=0.75, HSG -0.41% weak confirm); GAS urgent_news (oil +3%, GAS +0.54% weak confirm); VCB bearish (gold/VND flight, conf=0.72, VCB -0.50% weak confirm) — no signals emitted
- Sector 1d: Auto +1.98%, Logistics +1.80%, Insurance +0.41%, Oil&Gas +0.35% leading | Retail -0.62%, Securities -0.36%, Banking -0.32%, Steel -0.12% lagging. All STABLE (1d only, no 5-session rotation)
- CARRY_REGIME=FII_OUTFLOW_RISK: no hot_money_concentration check (not HOT_MONEY_INFLOW)
- New chain_catalysts: VCB/banking gold-flight bearish (id=2976, exp 07:24 UTC); HSG AU anti-dumping (id=2974, exp 07:24 UTC, same catalyst as id=2849/2901/2957 prior cycles)
- Open chain findings: 3 (HSG/GAS/VCB — all weak price confirms, no signals posted)
- Signals emitted: 0 | Open alerts: 21 | System: OK

## Metrics (cycle 2026-05-12 05:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 4 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2500 |

### Cycle (06:38–06:41 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (98.16) | US10Y: NEUTRAL (4.41%) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- VN-Index 1,882.28 (-0.70%) — session pressure; VIC -2.65% (0.90σ), VHM -1.93% (0.49σ), VRE +2.53% (0.70σ), GAS +2.17% (0.87σ) — all below 2.0σ threshold
- Sector 1d: Oil&Gas +2.40%, Logistics +2.11%, Auto/Machinery +1.33%, RE +0.37% leading | Retail/Consumer -0.84%, Banking -0.35%, Utilities -0.33% lagging. All STABLE (1d only, no 5-session rotation).
- Supply chain: STABLE (BDI=1,400, no disruptions) | Energy: NORMAL (hydro 70% est.) | Climate: heat risk (May dry season) — IDC,KBC,GEG; no watchlist impact
- CARRY_REGIME=FII_OUTFLOW_RISK: no hot_money_concentration check (not HOT_MONEY_INFLOW)
- Open chain findings: 0 (last 15 min) | Open alerts: 21 | System: OK

## Metrics (cycle 2026-05-12 06:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 12 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 6000 |

### Cycle (07:38–07:43 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE | US10Y: NEUTRAL | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Notable intraday: VRE +5.51% (~1.59σ, below 2.0σ; existing MEDIUM alert), GVR +3.60% (~1.48σ), GAS +3.26% (~1.30σ, HIGH alert via Brent +3%)
- Chain signal: DHG chain_catalyst (news-scout, 07:22) — Chinese group acquires top VN pharma; FII_OUTFLOW_RISK may pressure pharma sector. No price move on DHG (+0.00%).
- Open chain findings: 0 (last 15 min) | Open alerts: 20 (21 at bootstrap) | System: OK

## Metrics (cycle 2026-05-12 07:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 |
| signals_emitted | 0 |
| signals_suppressed | 2 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 4500 |
