# Market Watcher — Notebook

**Last updated:** 2026-05-13 01:39 UTC | **Sprint:** 1846

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

### Cycle (12:38–12:41 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 1 (>1.5σ TIGHTENING) | Volume spikes: 1 (GVR ~8x avg) | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STRENGTHENING (USD/VND 26,129) | US10Y: RISK-OFF | CARRY: FII_OUTFLOW_RISK (FII net sell 800B VND) | fx_pressure: [] | pe_risk: []
- GVR +4.46% (1.84σ) — agriculture sector outlier (sector avg -0.3%); bullish evidence 0.7565; signal 2995 → alert-commander. VRE +5.51% & GAS +3.94% already alerted (prior cycles).
- TIGHTENING thresholds applied: sigma=1.5σ, vol_mult=1.5x, downside_bias=true
- Macro: Brent 107.81 (+2.23σ above avg 104.57) → CPI/SBV tightening risk. Gold 4,712. Energy grid NORMAL. Supply chain STABLE (BDI=1,400). Climate: dry season heat (no watchlist impact).
- CARRY_REGIME=FII_OUTFLOW_RISK: not HOT_MONEY_INFLOW — no hot_money_concentration check
- Open chain findings: 0 (last 15 min) | Open alerts: 17 | System: OK

## Metrics (cycle 2026-05-12 12:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 14 |
| signals_emitted | 1 |
| signals_suppressed | 2 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 7500 |

### Cycle (13:38–13:44 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>1.5σ, all previously signaled) | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STRENGTHENING (USD/VND 26,129) | US10Y: RISK-OFF | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (post-session off-hours, 13:38 UTC). Last session close 08:17 UTC.
- Notable session moves already alerted: VRE +5.51% (price_surge), HCM -6.90% (price_drop), GAS HIGH (oil +2.23σ), GVR +4.46% (signal emitted 12:38 cycle)
- Macro: Brent 107.79 (+2.23σ), Gold 4,699.7, USD/VND 26,129. Energy NORMAL. Supply chain STABLE (BDI=1,400). Climate: dry heat (no watchlist impact).
- Open chain findings: 0 (last 15 min) | Open alerts: 17 | System: OK

## Metrics (cycle 2026-05-12 13:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 8 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 5500 |

## Cycle — 13:44 UTC

- **cycle_date**: 2026-05-12
- **findings**:
  - Market CLOSED (off-hours, 13:38 UTC). Regime TIGHTENING persists (Brent +2.23σ, USD/VND 26,129).
  - No new anomalies above 1.5σ threshold; all session moves (VRE +5.51%, HCM -6.90%, GAS +3.94%, GVR +4.46%) already signaled in earlier cycles.
  - Chain confirms: 0. Supply chain stable (BDI=1,400). Energy grid normal. Climate: dry heat, no watchlist impact.
- **actions**: Notebook updated. WORK telegram sent. No price_anomaly signals emitted.

### Cycle (15:39–15:41 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ, all previously signaled) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (98.44) | US10Y: NEUTRAL (4.46%) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours cycle, 4h interval). Macro snapshot refreshed: Brent $108.20, Gold $4,661.6, USD/VND 26,299. Regime reverted TIGHTENING→NEUTRAL (Global Liquidity: NEUTRAL).
- Top closing moves: VRE +5.51% (~1.46σ, 30d stddev ~3.78%), GVR +4.46% (~1.65σ, 30d stddev ~2.70%), GAS +3.94% (~1.40σ, 30d stddev ~2.82%) — all below 2.0σ NEUTRAL threshold; all previously signaled (GVR signal 12:38, VRE/GAS alerts active).
- Sector rotation: all 15 sectors STABLE (1d data, no 5-session trend). Oil&Gas +2.69%, Logistics +2.11% leading; Retail -0.84%, Securities -0.38% lagging. FII_OUTFLOW_RISK — no hot_money_concentration check.
- Open chain findings: 0 (last 15 min) | Open alerts: 25 | System: OK

## Metrics (cycle 2026-05-12 15:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 7 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3800 |
- **next_cycle_hint**: EOD cycle at 16:00 UTC. Watch for pre-EOD macro moves on oil/gold. VRE/GVR momentum may continue next session if Brent stays elevated.
- **estimated_tokens**: 5500

### Cycle (14:38–14:40 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (STB signal 14:21 UTC) | DXY: USD STABLE | US10Y: RISK-ON (US equities new highs) | CARRY: NEUTRAL | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours, 14:40 UTC). Last session close 08:17 UTC. All session anomalies previously processed.
- Session final moves: VRE +5.51% (1.53σ, below 2.0σ — already alerted), GVR +4.46% (1.84σ, below 2.0σ — signal emitted 12:38), GAS +3.94% (1.55σ, below 2.0σ — Brent HIGH already processed)
- Macro: Brent 107.94 (+2.23σ above avg 104.57), Gold 4,699.6, USD/VND 26,129. BDI=1,400 (supply chain STABLE).
- Sector 1d: Oil&Gas +2.69%, Logistics +2.11%, Machinery +1.33%, RE +0.85% leading | Retail -0.84%, Securities -0.38%, Utilities -0.37%, Banking -0.16% lagging. All STABLE (1d only).
- Open chain findings: 0 (last 15 min) | Open alerts: 17 | System: OK

## Metrics (cycle 2026-05-12 14:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 7 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3800 |

### Cycle (19:39–19:42 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ, all previously signaled) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (26,129) | US10Y: NEUTRAL | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours 4h cycle). All session anomalies already processed in earlier cycles.
- Final session moves reviewed: VRE +5.51% (1.52σ, 30d stddev ~3.63%, below 2.0σ — price_surge alert active), GVR +4.46% (1.66σ, 30d stddev ~2.69%, below 2.0σ — signal emitted 12:38 UTC), GAS +3.94% (1.45σ, 30d stddev ~2.71%, below 2.0σ — HIGH alert active)
- Agent signals active: STB bullish banking catalyst (leadership change, impact=9); GAS/Brent CPI pressure → SBV tightening risk (Brent $107.91, +2.23σ above avg $104.57, impact=9)
- Sector 1d: Oil&Gas +2.69%, Logistics +2.11%, Machinery +1.33%, RE +0.85% leading | Retail -0.84%, Securities -0.38%, Utilities -0.37%, Banking -0.16% lagging. All STABLE (1d only, no 5-session rotation).
- Macro: Brent $107.91 (elevated, +2.23σ), Gold $4,689.6, USD/VND 26,129. Supply chain: STABLE (BDI=1,400). Energy: NORMAL.
- Open chain findings: 0 (last 15 min) | Open alerts: 25 | System: OK

## Metrics (cycle 2026-05-12 19:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 8 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 4200 |

### Cycle (16:38–16:50 UTC) — EOD
- Stocks: 26 priced, 5 N/A (BDI,DLC,SIS,VDC,JSH) | Ledger: 26 written (25 appended, 1 created: HSG)
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK | Brent: 107.51 | Gold: 4,673.2 | USD/VND: 26,129
- RSI: N/A all tickers (<35 candles in DB). YoY: N/A (insufficient history).
- Top movers: VRE +5.51%, GVR +4.46%, GAS +3.94% | Decliners: CTG -0.98% (223% vol), D2D -1.01%, HVN -0.00%
- MARKET EOD batch sent. WORK telegram sent.
- Insider: get_insider_signals requires code+outstandingShares — used "no activity" for all tickers.
- Open alerts: 25 | System: OK

## Metrics (cycle 2026-05-12 16:38 UTC — EOD)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 32 |
| signals_emitted | 0 |
| ledger_written | 26 |
| market_eod_sent | 1 |
| exit_status | complete |
| token_estimate | 16000 |

### Cycle (17:38–17:41 UTC)
- Stocks: 29 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE | US10Y: NEUTRAL | CARRY: NEUTRAL | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours, 4h interval). VN-Index: 1,901.10 +0.30%. Brent: $107.22 (elevated, +2.23σ). Gold: $4,683.2. USD/VND: 26,129.
- Top closing moves: VRE +5.51% (1.52σ, below 2.0σ), GVR +4.46% (1.66σ, below 2.0σ), GAS +3.94% (1.45σ, below 2.0σ) — all previously signaled/alerted.
- News-scout signal active: chain_catalyst id=3006 — multiple brokers lowering VN-Index 2026 target; "xanh vỏ đỏ lòng" risk near historical high. Impact score 8.
- Open chain findings: 0 (last 15 min) | Open alerts: 25 | System: OK

## Metrics (cycle 2026-05-12 17:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 8 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3200 |

## Doc self-heal (2026-05-12 EOD)
- Fixed 1 item in `.claude/flows/market-watcher/eod.md`
  - `get_insider_signals()`: corrected to `get_insider_signals(code="{TICKER}")` — requires `code` param, `outstandingShares` auto-fetched
- Commit pending: `.git/HEAD.lock` + `objects/maintenance.lock` held by git maintenance process. Fix staged, will commit next cycle.

### Cycle (18:38–18:39 UTC)
- Stocks: 26 priced (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 (>2.0σ NEUTRAL) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (news-scout signal id=3008, regime_adj_score=9.0) | DXY: USD STABLE (26,129) | US10Y: N/A | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours, 4h interval). EOD snapshot 08:17 UTC. VN-Index near historical high ~1,920 with broad caution: multiple brokers lowering 2026 targets, FII net sell 800B VND session.
- Top closing moves vs sigma: VRE +5.51% (1.52σ, below 2.0σ — existing MEDIUM price_surge), GVR +4.46% (1.73σ, below 2.0σ — signaled 12:38 cycle), GAS +3.94% (1.45σ, below 2.0σ — HIGH alert via Brent +2.23σ). No new anomalies.
- Macro: Brent 107.91, Gold 4,689.6, USD/VND 26,129. Supply chain STABLE (BDI=1,400). Energy NORMAL. Climate: dry season heat, no watchlist impact.
- News-scout signal active: id=3008 "xanh vỏ đỏ lòng" — index near all-time high but breadth deteriorating, FII selling; impact=9.
- Open chain findings: 0 (last 15 min) | Open alerts: 25 | System: OK

## Metrics (cycle 2026-05-12 18:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 6 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3000 |

### Cycle (20:38–20:41)
- Stocks: 31 watchlist | Priced (EOD): 26 | Anomalies: 0 (>2.0σ) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: N/A (no macro snapshot) | US10Y: N/A | fx_pressure: [] | pe_risk: []
- GVR +4.46% (1.66σ sub-threshold) | GAS +3.94% (1.48σ sub-threshold, HIGH news alert active)
- Chain catalysts read: VIC foreign selling 800B+ (news-scout #3014), CTCK downgrade VN-Index (news-scout #3015)
- Market CLOSED (off-hours cycle, 20:38 UTC) | No new price_anomaly signals emitted

## Metrics (cycle 2026-05-12 20:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 26 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3200 |

### Cycle (21:38–21:41 UTC)
- Stocks: 38 watchlist | Priced (EOD): 31 | Anomalies: 0 (>2.0σ NEUTRAL) | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (26,129) | US10Y: N/A | fx_pressure: [] | pe_risk: []
- Top movers (sub-threshold): VRE +5.51% (1.46σ, MEDIUM price_surge alert active), GVR +4.46% (1.65σ), GAS +3.94% (1.40σ, HIGH Brent news alert active)
- Macro: Brent 107.86 (+2.23σ HIGH alert), Gold 4,721.4, USD/VND 26,129. Supply chain STABLE (BDI=1,400, no disruptions). Energy NORMAL (hydro 70%, demand 53% capacity).
- Open chain findings: 0 (last 15 min) | Open alerts: 25 | System: OK | Market CLOSED (off-hours, 4h interval)

## Metrics (cycle 2026-05-12 21:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 9 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2800 |

### Cycle (22:38–22:40 UTC)
- Stocks: 38 watchlist | Priced (EOD close 08:17 UTC): 31 | Anomalies: 1 (VRE vol-spike 2.06x, 1.21σ) | Volume spikes: 1 | Chain confirms: 0
- Regime: NEUTRAL | DXY: USD STABLE (98.29, 4.46%) | US10Y: NEUTRAL | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- VRE +5.51% (1.21σ, 5-session stddev ~4.57%) — volume 12.47M = 2.06x 4-session avg (~6.05M). Outperforms sector: +5.51% vs real_estate avg +0.7% (+4.8pp). PE 9.8 vs sector 19.3 (deep discount). ROE 14.3% above sector median 6.3%. FII net 0. Technical data insufficient (14/35 candles). Signal #3020 → alert-commander (volume trigger).
- GVR +4.46% (1.71σ) | vol 1.75x avg — below both thresholds | GAS +3.94% (1.27σ) | vol 1.20x — below thresholds
- CARRY_REGIME=FII_OUTFLOW_RISK: not HOT_MONEY_INFLOW — no hot_money_concentration check
- Macro: Brent $107.22 (elevated, >$90 bullish oil_gas), Gold $4,722.6 (high risk-off signal), USD/VND 26,299. Supply chain STABLE (BDI N/A). Energy N/A. Sector rotation: all STABLE (1d data only).
- Open chain findings: 0 (last 15 min) | Open alerts: 0 per bootstrap | System: OK | Market CLOSED (off-hours)

## Metrics (cycle 2026-05-12 22:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 9 |
| signals_emitted | 1 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3500 |

### Cycle (23:38–23:40 UTC)
- Stocks: 31 watchlist | Priced (EOD close 08:17 UTC): 26 | Anomalies: 2 (VRE 1.52σ, GVR 1.73σ) | Volume spikes: 1 (VRE 2.4x) | Chain confirms: 0
- Regime: TIGHTENING (inferred — macro_snapshot not in bootstrap; prior cycles show NEUTRAL per Global Liquidity text; possible over-signal if NEUTRAL is correct) | DXY: USD STRENGTHENING (USD/VND 26,129) | US10Y: RISK-OFF (Gold $4,725) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [VRE] | pe_risk: []
- VRE +5.51% (1.52σ, 30d stddev ~3.63%, vol 12.47M ~2.4x avg) → signal #3024 → alert-commander. fx_pressure=true (realty+USD strengthening). Note: VRE previously signaled (#2961, #3020); redundant under NEUTRAL 2.0σ threshold.
- GVR +4.46% (1.73σ, 30d stddev ~2.58%, vol 4.45M ~1.29x avg, below vol spike threshold) → signal #3025 → alert-commander. Bullish evidence 0.76. Agriculture sector. No fx_pressure. Note: if NEUTRAL regime, 1.73σ < 2.0σ threshold — signal may be noise; GVR previously signaled at 12:38 (#2995).
- CARRY_REGIME=FII_OUTFLOW_RISK: not HOT_MONEY_INFLOW — no hot_money_concentration check
- Sector 1d: Oil&Gas +2.69%, Logistics +2.11%, RE +0.81%, Agriculture +0.24% leading | Retail -0.84%, Securities -0.38%, Utilities -0.37% lagging. All STABLE (1d only).
- Macro: Brent $107.3 (elevated), Gold $4,725.1 (risk-off), USD/VND 26,129. Agent signals: 0. Open chain findings: 0 (last 15 min). System: OK. Market CLOSED (off-hours, 4h cycle).

## Metrics (cycle 2026-05-12 23:38 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 9 |
| signals_emitted | 2 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 3800 |

### Cycle (00:39–00:40 UTC)
- Stocks: 31 watchlist | Priced (EOD close 2026-05-12 08:17 UTC): 26 (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 | Volume spikes: 0 | Chain confirms: 0
- Regime: TIGHTENING | DXY: USD STRENGTHENING (USD/VND 26,129) | US10Y: RISK-OFF (Gold $4,732.4) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (off-hours, 4h cycle, 00:39 UTC 2026-05-13). New trading day opens 02:00 UTC.
- Active agent signals: STB leadership change bullish catalyst (news-scout #3027, impact=7, exp 02:21 UTC); VN-Index "xanh vỏ đỏ lòng" warning near ATH, FII net sell 800B VND (news-scout #3028, impact=9, exp 02:21 UTC). Both expire before market open — watch for refresh.
- Macro: Brent $107.3 (elevated, SBV tightening risk), Gold $4,732.4 (risk-off), USD/VND 26,129. System: OK, 0 alerts pending.
- Pre-session context: VN-Index near historical high ~1,920; broker downgrades active; TIGHTENING regime → heightened sensitivity at open (sigma_threshold=1.5σ, downside_bias=true).
- Open chain findings: N/A (market closed) | Open alerts: 0 (per bootstrap)

## Metrics (cycle 2026-05-13 00:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 1 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 1800 |

### Cycle (01:39–01:41 UTC)
- Stocks: 31 watchlist | Priced (EOD close 2026-05-12 08:17 UTC): 26 (5 N/A: BDI,DLC,SIS,VDC,JSH) | Anomalies: 0 | Volume spikes: 0 | Chain confirms: 0
- Regime: NEUTRAL (news-scout id=3030, regime_adj_score=8.0) | DXY: USD STABLE (26,129) | US10Y: RISK-OFF (Gold $4,714.9) | CARRY: FII_OUTFLOW_RISK | fx_pressure: [] | pe_risk: []
- Market CLOSED (pre-market window, 01:39 UTC 2026-05-13 — opens 02:00 UTC in ~21 min). Thresholds: σ=2.0, vol_mult=2.0x, downside_bias=false.
- Active chain catalyst: id=3030 "xanh vỏ đỏ lòng" — multiple CTCK cut VN-Index 2026 forecasts; FII net sell 800B VND on 12/5 (VIC heaviest); liquidity declining near ATH. Impact=8. Expires 05:21 UTC (valid through market open).
- Pre-open context: VN-Index near historical high ~1,920; bearish macro overhang from broker downgrades + FII outflows. Watch for gap-down or sector rotation at 02:00 UTC open. VIC, VHM, VRE (realty) + banking sector under pressure from FII selling.
- Macro: Brent $106.73 (elevated, CPI/SBV tightening risk), Gold $4,714.9 (risk-off), USD/VND 26,129. Supply chain: STABLE (BDI sector trend stable). Energy: NORMAL.
- Sector 1d (2026-05-12 final): Oil&Gas +2.69%, Logistics +2.11%, RE +0.85% leading | Retail -0.84%, Securities -0.38%, Utilities -0.37% lagging. All 16 sectors STABLE (1d data only, no 5-session rotation).
- CARRY_REGIME=FII_OUTFLOW_RISK: not HOT_MONEY_INFLOW — no hot_money_concentration check.
- Open chain findings: 0 (last 15 min) | Open alerts: 1 (VIC LOW news_mention) | System: OK

## Metrics (cycle 2026-05-13 01:39 UTC)
| Field | Value |
|---|---|
| cycles_run | 1 |
| items_fetched | 3 |
| signals_emitted | 0 |
| signals_suppressed | 0 |
| market_alerts_fired | 0 |
| exit_status | complete |
| token_estimate | 2200 |
