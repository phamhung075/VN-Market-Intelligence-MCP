# Financial Analyst — Notebook

**Last updated:** 2026-05-22 | **Sprint:** —

## Last session summary

Cycle 2026-05-17 23:04–23:09 UTC. Analyzed 3/38 watchlist stocks with BCTC data (VCB, FPT, HPG) — remaining 35 lack any BCTC. Regime TIGHTENING + Investment Clock Overheat + FII_OUTFLOW_RISK. Posted 3 fundamental_validation signals (all FAIR; VCB/FPT with earnings_quality_warn) + 1 signal_feedback to news-scout (GAS sector reversal accepted via kinh_dich).

**VCB:** EY_SPREAD +2.09% → FAIR. PE 14.1 PREMIUM +57% vs banking median 9.0, ROE 16.7% BELOW sector median — premium not supported. Layer 7 fallback: earnings_quality_warn=true (OCF=1.23e15, suppressed). Kinh Dịch Khôn(2) THAN_TRONG 48% → Bác.

**FPT:** EY_SPREAD +2.25% → FAIR. PE 13.8 DISCOUNT -20%, ROE 28.3% sector-leading (+267% vs median). Layer 7 fallback: earnings_quality_warn=true (OCF/NI raw=503, NI=20.2 tỷ likely garbage extraction). Sentiment 30d trending bearish (-0.09). Kinh Dịch Khôn(2) THAN_TRONG → Bác.

**HPG:** EY_SPREAD +2.04% → FAIR. PE 14.2 DISCOUNT -57%, ROE 12.7% above median +338%. Layer 7 skipped — get_cash_flow returned all-zero. Kinh Dịch Sư(7) MUA 100% → Hoán (positive). USD/VND tailwind for steel export.

**GAS signal_feedback (accepted):** No BCTC for direct EY check, but kinh_dich Kiển(39) BAN 56% confirms oil_gas reversal thesis from news-scout chain_catalyst #3345 (PLX -40% contagion).

**BCTC data gap (persistent blocker, 5+ cycles):** 38/38 stocks Q1-2026 QUÁ HẠN (18+ days past deadline). Only VCB/FPT/HPG have any Q4-2025 data. Mass late-filing trend continues — escalate.

**Layer 7 extraction bug (persistent):** get_cash_flow returns implausible values for all 3 covered tickers — VCB ocf_ni_raw=1.42e8, FPT raw=504, HPG all zeros. Forensic gate degraded.

**FPT:** EY_SPREAD +2.25% → FAIR. PE 13.8 (DISCOUNT -20% vs tech sector 17.3), ROE 28.3% sector-leading. Layer 7 fallback flagged earnings_quality_warn=true (OCF extraction broken). Kinh Dịch THAN TRONG (Khôn → Bác). Sentiment trending bearish (-0.09 slope).

**VCB:** EY_SPREAD +2.09% → FAIR. PE 14.1 PREMIUM +57% vs banking median 9.0 with ROE 16.7% BELOW sector median 17.6% — premium not supported by ROE leadership. Net margin -10.2pp QoQ. Layer 7 fallback flagged earnings_quality_warn=true (OCF extraction absurd 1.2 quadrillion).

**BCTC data gap (persistent blocker):** 38/38 stocks Q1-2026 QUÁ HẠN (17+ days past deadline). Only FPT+VCB have any Q4-2025 data. Mass late-filing trend continues for 4+ cycles — escalate to data-pipeline.

**Layer 7 extraction bug:** get_cash_flow returns implausible OCF for both analyzed tickers (ratios 504 and 1.42e8). Forensic gate forced into manual accrual fallback. File to dev-mcp-server.

## Known patterns / preferences

- Regime extraction at bootstrap is mandatory. NEUTRAL regime → EY_SPREAD threshold still applies (1–3% = FAIR).
- BCTC Q4-2025 deadline 2026-04-15, Q1-2026 deadline 2026-04-30 — both overdue. Track when submissions arrive.
- Net margin compression QoQ is a red flag even when absolute levels are acceptable.
- P/E premium without ROE premium = valuation stretched — note in fundamental_validation signal.

---

## Cycle — 00:20 UTC (2026-05-22)

- **cycle_date**: 2026-05-22
- **findings**: [Regime=TIGHTENING (Global Liquidity TIGHTENING, US10Y 4.59% RISK-OFF, VND carry -0.33% FII_OUTFLOW_RISK, DXY 99.21 USD STABLE); Max Deposit Rate=5.00%; Investment Clock=Overheat (CPI 5.46% HIGH, growth UP); Pyramid tier=equity; 36/39 watchlist Q1-2026 BCTC QUÁ HẠN (22 days past 30/04 deadline); Only 3 newly filed: DHG (2026-05-19), EIB (2026-05-20), FPT (2026-05-19); VCB Q4-2025 EY_SPREAD=2.09% FAIR (PE 14.1 PREMIUM +57% vs banking median 9.0, ROE 16.7% BELOW median 17.6% — premium unjustified, Net Margin -10.2pp QoQ compression); FPT/DHG/EIB Q1-2026 extractions all zeros (confidence <44%, garbage); HPG Q4-2025 extraction broken (Revenue=0 but NI=5.6 tỷ, conf 44%); Open chain findings: 1 NVL urgent_news; Legal risks: 3 flags (PC1 chairman status, VPB lending audit x2); NVL bond 5,000 tỷ GIA HẠN 2026-09-15 @10.5%; No G-Bond 10Y yield]
- **actions**: [signal #3626 fundamental_validation VCB posted to alert-commander (FAIR, no earnings_quality_warn, m_score=1.15 healthy); 1 open NVL chain finding not validated (no BCTC data); WORK telegram sent; notebook updated; log_agent_work id=1076 in progress]
- **next_cycle_hint**: [Data pipeline CRITICAL: 36/39 Q1-2026 QUÁ HẠN for 3+ weeks; Q1-2026 BCTC extraction broken for DHG/EIB/FPT (all zeros extraction); Escalate to report-analyzer/data-pipeline for mass re-extraction attempt; NVL chain finding (urgent_news signal #3622) cannot be validated without Q1-2026 BCTC — skip signal_feedback; Layer-7 OCF/NI check healthy for VCB (ratio 1.15, no accrual divergence); VCB fundamentals support FAIR verdict but P/E multiple compression likely in TIGHTENING + Overheat regime]
- **estimated_tokens**: ~18000

## Cycle — 23:04 UTC

- **cycle_date**: 2026-05-17
- **findings**: [Regime=TIGHTENING (Global Liquidity TIGHTENING, US10Y 4.59% RISK-OFF, VND carry -0.33% FII_OUTFLOW_RISK, DXY 99.28 USD STABLE); Max Deposit Rate=5.00%; Investment Clock=Overheat (CPI 5.46% HIGH, growth UP); Pyramid tier=equity; 38/38 watchlist Q1-2026 BCTC QUÁ HẠN; only VCB/FPT/HPG have Q4-2025 BCTC data; VCB EY_SPREAD=2.09% FAIR (PE 14.1 PREMIUM +57%, ROE BELOW median 17.6%, earnings_quality_warn=true OCF=1.23e15 anomalous); FPT EY_SPREAD=2.25% FAIR (PE DISCOUNT -20%, ROE 28.3% sector-leading, earnings_quality_warn=true OCF raw=503, sentiment 30d -0.09 bearish); HPG EY_SPREAD=2.04% FAIR (PE DISCOUNT -57%, ROE above median, OCF all-zero so Layer 7 skipped); GAS kinh_dich Kiển(39) BAN 56% confirms PLX -40% contagion bearish news catalyst; NVL bond 5,000 tỷ VND GIA HẠN due 2026-09-15 @10.5% credit risk; 0 open chain findings 30min; 0 legal risks; G-Bond 10Y not available — gbond_regime_signal=false]
- **actions**: [signal #3350 fundamental_validation VCB posted to alert-commander (FAIR, earnings_quality_warn); signal #3351 fundamental_validation FPT posted (FAIR, earnings_quality_warn); signal #3352 fundamental_validation HPG posted (FAIR, no warn); signal #3353 signal_feedback GAS posted to news-scout (accepted via kinh_dich); WORK telegram sent; notebook updated; log_agent_work id=963 completed]
- **next_cycle_hint**: [Q1-2026 BCTC mass-late 18+ days past — escalate to data-pipeline / report-analyzer; Layer-7 get_cash_flow extraction broken for VCB/FPT/HPG — file persistent bug to dev-mcp-server; news-scout chain_catalyst PC1 governance & GAS oil_gas reversal both bearish — alert-commander to consider macro caution; FPT NI=20.2 tỷ extraction garbage (revenue=20,225 tỷ but margin 0.1%) — flag for data-pipeline re-extraction]
- **estimated_tokens**: ~32000

## Cycle — 23:06 UTC (2026-05-16)

- **cycle_date**: 2026-05-16
- **findings**: [Regime=TIGHTENING (Global Liquidity TIGHTENING, US10Y 4.59% RISK-OFF, VND carry -0.33% FII_OUTFLOW_RISK); Max Deposit Rate=5.00%; Investment Clock phase=Overheat (CPI 5.46% HIGH, growth UP); 38/38 watchlist QUÁ HẠN on Q1-2026 BCTC (none filed); only VCB+FPT have any BCTC data (Q4-2025); FPT EY_SPREAD=2.25% → FAIR (PE 13.8 DISCOUNT -20%, ROE 28.3% sector-leading, but Layer-7 OCF/NI ratio=504 extraction_error → earnings_quality_warn=true); VCB EY_SPREAD=2.09% → FAIR (PE 14.1 PREMIUM +57% vs banking median 9.0, ROE 16.7% BELOW sector median 17.6% — premium not supported, Layer-7 OCF anomalous → earnings_quality_warn=true); NVL bond GIA HẠN 5000 tỷ VND due 2026-09-15 @ 10.5% (real estate credit risk persists); 0 open chain findings; 0 legal risks; G-Bond 10Y yield unavailable — gbond_regime_signal skip]
- **actions**: [signal #3280 fundamental_validation FPT posted to alert-commander (FAIR, earnings_quality_warn); signal #3281 fundamental_validation VCB posted to alert-commander (FAIR, earnings_quality_warn); WORK telegram sent; notebook updated]
- **next_cycle_hint**: [Q1-2026 BCTC mass-late persists 17+ days past 30/04 deadline — escalate to data-pipeline if no submissions by 2026-05-20; FPT/VCB Layer-7 OCF extraction broken (ocf_ni_ratio 504 and 1.42e8 respectively) — file bug to dev-mcp-server; tool schema docs show `ticker` but actual MCP expects `code` (get_bctc_full / get_sector_comparison / get_kinhdich_reading) — update tools/package/financial-analyst.md]
- **estimated_tokens**: ~28000

## Recent session — 2026-05-17

### Analysis Cycle (23:04–23:09 UTC)
- Stocks: 3 with BCTC data (VCB, FPT, HPG) | Critical findings: [38/38 Q1-2026 BCTC QUÁ HẠN persistent 18+ days; Investment Clock=Overheat (CPI 5.46%); FII_OUTFLOW_RISK; Layer-7 OCF extraction broken for all 3; GAS confirms PLX -40% contagion bearish] | Chain validations: 0 open chain findings (but 2 stale chain_catalysts from news-scout: PC1 governance + GAS oil_gas)
- Regime: TIGHTENING | Max Deposit Rate: 5.00% | Valuation flags: [VCB=FAIR(eq_warn), FPT=FAIR(eq_warn), HPG=FAIR]
- **VCB** (banking, Q4-2025, conf 63%): Net Rev 16,169.8 tỷ (+18.1% QoQ), Net Profit 8,633.8 tỷ (-0.8% QoQ), Net Margin 53.4% (-10.2pp QoQ red flag). Sector PE 14.1 PREMIUM +57% vs banking median 9.0, PB 2.2 PREMIUM +45%, ROE 16.7% BELOW sector median 17.6% — premium not supported by ROE. EY=7.09%, EY_SPREAD=+2.09% → FAIR. Sentiment ỔN ĐỊNH slope +0.02. Kinh Dịch: Khôn(2) THAN_TRONG 48% → Bác (decay ahead). Layer 7 fallback: OCF=1.23e15 (suppressed extraction anomaly) → earnings_quality_warn=true. Layer 8: phase=Overheat, tier=equity. Signal #3350 posted.
- **FPT** (tech, Q4-2025, conf 81%): Net Rev 20,225.5 tỷ; Net Profit reported 20.2 tỷ (extraction-suspect — Net Margin 0.1% impossible). Sector PE 13.8 DISCOUNT -20% vs tech median 17.3, PB 3.6 PREMIUM +136%, ROE 28.3% sector-leading (+267% vs median). EY=7.25%, EY_SPREAD=+2.25% → FAIR. Sentiment 30d GIẢM slope -0.09 (27 bearish vs 18 bullish). Kinh Dịch: Khôn(2) THAN_TRONG 48% → Bác. Layer 7 fallback: OCF raw=503x (suppressed) → earnings_quality_warn=true. Layer 8: phase=Overheat, tier=equity. Signal #3351 posted.
- **HPG** (steel, Q4-2025, conf 44%): Net Rev=0 (extraction issue), Net Profit 5.6 tỷ, EPS=0. Sector PE 14.2 DISCOUNT -57% vs steel median 32.6, PB 1.7 PREMIUM +93%, ROE 12.7% above sector median 2.9%. EY=7.04%, EY_SPREAD=+2.04% → FAIR. Kinh Dịch: Sư(7) MUA 100% → Hoán (positive transition). Layer 7: get_cash_flow all zeros → skipped (non-fatal). Macro tailwind: USD/VND 26,350 high — supports steel export. Signal #3352 posted.
- **GAS** (oil_gas): No BCTC data. Kinh Dịch: Kiển(39) BAN/BAT_LOI 56% — Trắc trở hiểm nghèo, biến → Bác. Validates news-scout chain_catalyst #3345 (PLX -40% oil_gas sector reversal contagion). Signal #3353 signal_feedback accepted to news-scout.
- **Other watchlist (34 stocks)**: get_bctc_full returns "Chưa có dữ liệu" — analysis skipped. Includes ACB, BID, CTG, MBB, VPB, EIB, GAS, NVL, VIC, VHM, HCM, SSI, VCI, ACV, REE, HSG, NKG, MWG, POW, PPC, KBC, VRE, TCH, D2D, DHG, DPM, GVR, BDI, DLC, DAG, JSH, SIS, VDC, VNH, HVN.
- Macro: Brent 110.51 USD/bbl HIGH (tích cực GAS/PVD, áp lực HVN); Gold 4550 USD/oz; DXY 99.28 USD STABLE; USD/VND 26,350 (HIGH pressure — áp lực HVN, tích cực HPG xuất khẩu). NVL bond 5,000 tỷ VND GIA HẠN due 2026-09-15 @10.5%.
- Legal risks: None. Insider signals: None for VCB/FPT/HPG. Historical context (search_similar_context): No results for any of 3 covered tickers.
- Deadline Watch: 38/38 stocks Q1-2026 QUÁ HẠN (deadline 30/04 or 15/05, both passed). Mass late-filing trend persists 18+ days.
- Data quality: Layer-7 get_cash_flow extraction broken across VCB/FPT/HPG (VCB ratio raw=1.42e8, FPT raw=504, HPG all zeros). BCTC ingestion stalled for 34/38 stocks. FPT NI extraction garbage (20.2 tỷ vs 20,225 tỷ revenue).

## Recent session — 2026-05-16

### Analysis Cycle (23:00–23:07 UTC)
- Stocks: 2 with BCTC data (FPT, VCB) | Critical findings: [38/38 Q1-2026 BCTC QUÁ HẠN; Overheat phase; FII_OUTFLOW_RISK; both FA-analyzed stocks have Layer-7 OCF extraction_error] | Chain validations: 0 (0 open chain findings)
- Regime: TIGHTENING | Max Deposit Rate: 5.00% | Valuation flags: [FPT=FAIR(eq_warn), VCB=FAIR(eq_warn)]
- **FPT** (tech, Q4-2025, conf 81%): Net Rev 20,225.5 tỷ; Net Profit reported 20.2 tỷ (extraction-suspect, EPS=1 VND); PE 13.8 (DISCOUNT vs sector median 17.3 -20%); PB 3.6 (PREMIUM +136%); ROE 28.3% sector-leading. EY=7.25%, EY_SPREAD=+2.25% → FAIR. Sentiment 30d slope -0.09 (GIẢM, 18/63 bullish vs 27 bearish). News alert: US tech selloff exposure (-1.4% today). Kinh Dịch: Khôn (2) — THAN TRONG, 48% conf, biến → Bác (sụp đổ). Layer 7 fallback: OCF 10.19T vs NI 20.2B → accrual_ratio≈-503 (anomalous) → earnings_quality_warn=true. Layer 8: phase=Overheat, tier=equity. Signal #3280 posted (no bullish despite EY_SPREAD positive — earnings quality warn + TIGHTENING regime).
- **VCB** (banking, Q4-2025, conf 63%): Net Rev 16,169.8 tỷ (+18.1% QoQ); Net Profit 8,633.8 tỷ (-0.8% QoQ); Net Margin 53.4% (-10.2pp QoQ); ROE 3.8% quarterly (16.7% sector ratio). PE 14.1 PREMIUM +57% vs banking median 9.0; PB 2.2 PREMIUM +45%; ROE 16.7% BELOW sector median 17.6% — premium-without-ROE-leadership flag. EY=7.09%, EY_SPREAD=+2.09% → FAIR. Sentiment ỔN ĐỊNH slope +0.02. Kinh Dịch: Khôn (2) — THAN TRONG, 48% conf, biến → Bác. Layer 7 fallback: OCF 1.23×10¹⁵ (absurd extraction_error) → earnings_quality_warn=true. Layer 8: phase=Overheat, tier=equity. Banking not classified rate-sensitive per spec — no headwind flag. Signal #3281 posted.
- **Other watchlist (36 stocks)**: get_bctc_full returns "Chưa có dữ liệu BCTC" — analysis skipped. Includes VIC, GAS, NVL, HCM, ACV, REE, ACB, BID, CTG, MBB, VPB, EIB, HPG, HSG, NKG, MWG, SSI, VCI, POW, PPC, KBC, VHM, VRE, TCH, D2D, DHG, DPM, GVR, BDI, DLC, DAG, JSH, PPC, SIS, VDC, VNH, HVN — no Q1-2026 or recent Q4-2025 data in store.
- Macro/Bond: Brent 109.26 USD/bbl (+2.56σ HIGH — tích cực GAS/PVD, áp lực HVN/VJC); Gold 4561.9 USD/oz (-2.19σ LOW); DXY 99.27 USD STABLE; USD/VND 26,137 official / 26,350 market (HIGH currency pressure — áp lực HVN, VEA; tích cực HPG xuất khẩu). NVL bond 5,000 tỷ VND maturity 2026-09-15 @ 10.5% (GIA HẠN).
- Legal risks: None detected in window. Insider signals: [SKIP] requires per-stock outstandingShares not in package. Investment Clock: Overheat (CPI 5.46% HIGH, growth UP, PMI null). G-Bond 10Y: not in macro_snapshot → gbond_regime_signal=false (skipped per spec).
- Deadline Watch: 38/38 stocks Q1-2026 QUÁ HẠN (deadline 30/04 or 15/05). Mass late-filing trend continues (4+ cycles). Recommend pipeline escalation if persists past 2026-05-20.
- Data quality: get_cash_flow returns Layer-7-breaking values for both FPT (ocf_ni_ratio=504) and VCB (ocf_ni_ratio=1.42e8) — extraction pipeline bug. BCTC ingestion stalled (37 stocks with no data for 8+ cycles).

## Recent session — 2026-05-14

### Analysis Cycle (23:01–23:06 UTC)
- Stocks: 3 with BCTC data (VCB, FPT, HPG) | Critical findings: [VCB new filing 2026-05-14; 37/38 watchlist QUÁ HẠN LATE; NVL bond GIA HAN 5000ty VND due 2026-09-15 @ 10.5%] | Chain validations: 0 (no open chain findings)
- Regime: NEUTRAL (Global Liquidity NEUTRAL) | Max Deposit Rate: 5.00% | Valuation flags: [VCB=FAIR (EY_SPREAD=2.09%); FPT=data_quality_issue; HPG=low_confidence(44%)]
- VCB: Q4-2025 filed 2026-05-14 (today — CRITICAL new submission). Revenue +18.1% QoQ, Net Profit -0.8% QoQ, Net Margin 53.4% (-10.2pp). PE=14.1 (sector premium +57% vs median 9.0x), EY_SPREAD=2.09% → FAIR. ROE=16.7% (below sector median 17.6%). Sentiment GIẢM slope=-0.07. Layer 7: OCF/NI anomalous (142M) — extraction error per fix#10. Layer 8: insufficient_data. G-Bond: no 10Y yield data. Signal #3199 posted.
- FPT: Net Profit 20.2ty vs Revenue 20,225ty (0.1% margin) — data extraction anomaly confirmed. OCF/NI=503 anomalous. Sentiment GIẢM slope=-0.12. No PE available → EY_SPREAD not computed.
- HPG: Confidence 44% (low), Revenue 0 in BCTC — data extraction failure. Sentiment STABLE slope=-0.03.
- VIC/VPB/GAS/ACB/VHM: No BCTC data available.
- Deadline Watch: 37/38 stocks LATE (Q4-2025 deadline 15/04 or Q1-2026 deadline 30/04 both passed). VCB only stock with ĐÃ NỘP.

## Recent session — 2026-05-13

### Analysis Cycle (23:00–23:05 UTC)
- Stocks: 2 with BCTC data (VCB, FPT) | Critical findings: [37/38 stocks OVERDUE on BCTC; mass late-filing persists] | Chain validations: 0 (0 open chain findings)
- Regime: TIGHTENING (inferred from news "nỗi lo Fed tăng lãi suất") | Max Deposit Rate: 6.00% (assumed — get_macro_snapshot not in package, data gap) | Valuation flags: [VCB=FAIR, FPT=FAIR]
- VCB: Q4-2025 filed 2026-05-12. Revenue +18.1% QoQ, Net Profit -0.8% QoQ, Net Margin 53.4% (-10.2pp). PE=14.1 (sector premium +57% vs median 9.0x), EY_SPREAD=1.09% → FAIR. ROE=16.7% (below sector median 17.6%). Sentiment NEGATIVE slope=-0.17. KinhDich=THAN TRONG (Que Ty #8), reliability 48%. Tightening + rate_sensitive_headwind=true — no bullish signal. Signal #3121 posted.
- FPT: Q4-2025 partial BCTC (confidence 75%, revenue OK but Net Profit anomalous 0.1% margin). PE=13.8 (sector DISCOUNT -20% vs median 17.3), ROE=28.3% (far above sector 10.6%). EY_SPREAD=1.25% → FAIR. Sentiment NEGATIVE slope=-0.15. No bullish signal (TIGHTENING).
- HPG: BCTC confidence 44% (Net Revenue=0, parse failure) — insufficient for valuation. Skipped.
- Legal risks: None detected. Insider signals: [SKIP] requires outstandingShares param. Layer 7: [SKIP] get_cash_flow not in package. Layer 8: [SKIP] get_investment_clock_phase not in package. G-Bond: [SKIP] get_bond_maturity_calendar not in package.
- Deadline watch: 37/38 stocks OVERDUE (Q4-2025 deadline 15/04, Q1-2026 deadline 30/04). VCB sole filer as of today.
- Tool schema mismatches logged: get_bctc_full needs `code` not `ticker`; get_kinhdich_reading needs `code` not `ticker`; get_insider_signals requires `code` + `outstandingShares`.

---

## Recent session — 2026-05-12

### Analysis Cycle (23:01–23:06 UTC)
- Stocks: 1 analyzed (VCB) | Critical findings: [37/38 stocks OVERDUE on BCTC; VCB sole filer today] | Chain validations: 1 (VRE rejected — no BCTC)
- Regime: NEUTRAL (get_macro_snapshot not in package — data gap) | Max Deposit Rate: 6.00% (assumed) | Valuation flags: [VCB=FAIR]
- VCB: Q4-2025 filed 2026-05-12. Revenue +18.1% QoQ, Net Profit -0.8% QoQ, Net Margin -10.2pp. PE=14.1 (sector premium +57%), EY_SPREAD=1.09% → FAIR. ROE=16.7% (below median 17.6%). Sentiment NEGATIVE slope=-0.24. KinhDich=MUA (Que Khon, contradicts negative sentiment). Signal #3023 posted to alert-commander.
- VRE: price_anomaly (+5.51%, chain signal #3020 from market-watcher) — REJECTED, no BCTC data. Signal_feedback #3022 posted to news-scout.
- Legal risks: None. Insider: [SKIP] requires outstandingShares param. Layer 7: [SKIP] get_cash_flow tool not found. search_similar_context: [ERROR] server not responding. Investment Clock: insufficient_data. Pyramid: equity tier.
- Deadline watch: 37/38 stocks OVERDUE (Q4-2025 deadline 15/04, Q1-2026 deadline 30/04). Critical — no new filings except VCB.

---

## Recent session — 2026-05-11

### Analysis Cycle (23:00–23:05 UTC)
- Stocks: 3 analyzed (VCB, FPT, HPG) | Critical findings: [30/31 stocks OVERDUE on BCTC] | Chain validations: 0
- Regime: NEUTRAL (estimated — get_macro_snapshot not in package, data gap logged) | Max Deposit Rate: 4.70% (SBV ceiling estimate) | Valuation flags: [VCB=FAIR, FPT=FAIR, HPG=FAIR(low-conf)]
- VCB: EY_SPREAD=+2.39%, PE=14.1 (sector premium +57%), ROE 3.8% quarterly (below median), margin -10.2pp QoQ, KinhDich=MUA contradicts negative sentiment. Signal #2950.
- FPT: EY_SPREAD=+2.55%, PE=13.8 (sector discount -20%), ROE=28.3% (sector-leading), price at multi-year lows, heavy foreign selling, KinhDich=MUA contradicts strong negative sentiment. Signal #2951.
- HPG: EY_SPREAD=+2.34% (sector PE=14.2), BCTC confidence=44% (revenue parsing failure), KinhDich=GIU/BẤT LỢI confirms negative. Signal #2952.
- Legal risks: None. Insider: [SKIP] tool requires per-stock outstandingShares. G-Bond: [SKIP] tool not in package.
- Data gaps: 28/31 stocks no BCTC data. get_macro_snapshot not in package. get_insider_signals requires outstandingShares param.

---

## Recent session — 2026-05-21

### Analysis Cycle (00:30–00:45 UTC)
- Stocks: 1 fully analyzed (VCB Q4-2025, conf 63%) | 3 with PDFs stored but extraction broken (FPT, EIB, GAS) | Critical findings: [36/39 Q1-2026 reports QUÁ HẠN (18+ days past deadline — only DHG/EIB/FPT submitted); Investment Clock error; Layer-7 OCF/NI forensic ratio healthy for VCB (1.15); Macro TIGHTENING persists] | Chain validations: 0 (0 open chain findings 60min window)
- Regime: TIGHTENING (US 10Y 4.57% RISK-OFF threshold, VND carry -0.33% FII_OUTFLOW_RISK, Global Liquidity TIGHTENING, DXY 99.13 USD STABLE) | Max Deposit Rate: 5.00% | Valuation flags: [VCB=FAIR]
- **VCB** (banking, Q4-2025, conf 63%): Net Rev 16,169.8 tỷ (+18.1% QoQ), Net Profit 8,633.8 tỷ (-0.8% QoQ), Net Margin 53.4% (-10.2pp QoQ). PE 14.1 PREMIUM +57% vs banking median 9.0, ROE 16.7% BELOW sector median 17.6% — premium not supported by ROE leadership. EY=7.09%, EY_SPREAD=+2.09% → FAIR. Sentiment TĂNG slope +0.07 (11/25 bullish vs 5 bearish). OCF/NI ratio 1.15 (healthy, no earnings quality warn). Layer 7: pass (no divergence flag). Layer 8: phase=insufficient_data (investment clock error), tier=equity. Investment clock tool timeout — phase='insufficient_data' rendered. G-Bond 10Y yield unavailable → gbond_regime_signal=false. Signal fundamental_validation posted to alert-commander.
- **FPT** (tech, Q1-2026, conf 44%): PDF stored 2026-05-19 but extraction returns all zeros (Net Rev=0, Net Profit=0, EPS=0). Confidence degraded to 44%. Extraction error prevents EY_SPREAD computation. Skipped from valuation verdict — insufficient extraction confidence. Signal NOT posted (non-fatal data quality).
- **EIB/GAS/DHG**: PDFs stored (EIB 2026-05-20, GAS/DHG in storage) but extraction not attempted in this cycle (queue depth).
- **Other watchlist (35 stocks)**: get_bctc_full returns "Chưa có dữ liệu BCTC" — analysis skipped.
- Macro: Brent 105.45 USD/bbl (no change from snapshot), Gold 4546.2 USD/oz, USD/VND 26,161 official. DXY 99.13 USD STABLE. Banking/Real Estate regime BÌNH THƯỜNG per macro. Energy sector CAO tích cực (GAS/PLX up +3.7%/+4.4%), but currency pressure HIGH (26K threshold) áp lực HVN/logistics.
- Legal risks: None detected. Insider signals: None for VCB. Historical context (search_similar_context): Skipped in this cycle.
- Deadline Watch: CRITICAL — 36/39 stocks Q1-2026 QUÁ HẠN (deadline 30/04 or 15/05 now 5+ days past). Only 3 submitted (DHG 2026-05-19, EIB 2026-05-20, FPT 2026-05-19). Mass late-filing trend persists 5+ cycles. Escalate to data-pipeline / report-analyzer.
- Data quality: FPT extraction broken (Q1-2026 shows all zeros; confidence 44% garbage). VCB extraction clean. BCTC ingestion stalled for 35/39 stocks due to deadline delays.
- Tool errors: get_investment_clock_phase() socket timeout — phase='insufficient_data' applied per spec (non-fatal, continue).
- Token estimate: ~28k

## Recent session — 2026-05-09

Cycle 01:00 UTC. Stocks: VCB (FAIR, deteriorating), FPT (signal posted). Regime: NEUTRAL | Max Deposit Rate: 5.00%. BCTC gap: 29/31 stocks missing. Signals: 2 fundamental_validation posted.
