# BCTC Analyst — Notebook

**Last updated:** 2026-06-02 18:12 UTC (c012) | **Sprint:** BCTC-EXTRACT-QUALITY

## c010 — Cycle 00:00 UTC (00:06–00:12 UTC) — mode: mixed (1 release pending + 4 routine)

- Mode: mixed (CTG=release/DATA_INSUFFICIENT again, ACB/FPT/DHG/EIB=routine)
- Stocks analyzed: 2 (ACB / FPT) — DHG/EIB extraction broken 9th consecutive cycle; CTG data still absent (24h+ lag post-2026-06-01 filing)
- NEW ĐÃ NỘP: CTG (filed 2026-06-01) — 2nd cycle with no extraction data. Pipeline blocker must be escalated beyond c010.
- Chain validations: 0 open findings (cycle_id=20260602-0000, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (macro snapshot live source_tier=1, carry spread -0.33pp: USD 5.33% vs VND deposit 5.00%)
- Max Deposit Rate: 5.00% (confirmed live macro snapshot 2026-06-02T00:06:49Z)
- Carry regime: FII_OUTFLOW_RISK (carry spread -0.33pp)
- Investment clock: Overheat (CPI 5.46%, fetched 2026-05-16 — source_tier=2)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield); <105 days maturity
- Calendar gate: ACB/DHG/EIB/FPT (ĐÃ NỘP 2026-05-24) + CTG (ĐÃ NỘP 2026-06-01). MODE = mixed.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+7.82% vs 5.00%), FPT=FAIR (PE 13.8, EY+2.25%, ESC-3), CTG=DATA_INSUFFICIENT (2nd cycle), DHG=DATA_INSUFFICIENT (9th cycle), EIB=DATA_INSUFFICIENT (9th cycle)
- ACB sector: PE 7.8 vs median 9.1 (NGANG BANG), PB 1.3 vs 1.6 (discount -18%), ROE 17.6% above median 16.7%; foreign flow +0 cp net vs sector +3K (YEU HON ngành — persistent)
- FPT sector: PE 13.8 vs median 17.3 (discount -20%), PB 3.6 vs 1.5 (premium +136% — ROE-justified), ROE 28.3% vs sector 10.6%; FPT +1.8% session vs sector +0.8% (MANH HON ngành). Sentiment TANG +0.12.
- FPT OCF: operating_cf=-2,847,813 VND millions vs NI=2,476,800 VND millions. ocf_ni_ratio=-1.15. divergence_ratio=2.15. ESC-3 ACTIVE 10th consecutive cycle (c001–c010). CRITICAL OVERDUE.
- ACB OCF: OCF=0 extraction artifact (bank BCTC). E4 Block Rule applied — ESC-3 skipped.
- CTG cash flow: all zeros (extraction artifact — no BCTC data in system despite 24h+ since filing)
- Signals posted: #4638 fundamental_validation ACB (critic 0.6 — retry=1 accepted), #4639 fundamental_validation FPT (critic 0.6 — retry=1 accepted)
- Signal files written: docs/signals/bctc_signal_ACB_20260602_routine.json, bctc_signal_FPT_20260602_routine.json, bctc_signal_DHG_20260602_routine.json, bctc_signal_EIB_20260602_routine.json, bctc_signal_CTG_20260602_release.json
- E3 cache: MISS all (cycle_id=20260602-0000 first run)
- E1 trick passes: Not run (ACB conf 38%; FPT ESC-3 active — E4 Block Rule; DHG/EIB/CTG no data)
- ESC flags: ACB=[F,F,SKIP(bank),F,F], FPT=[F,F,ESC3=T,F,F] — FPT Opus deep-dive CRITICAL OVERDUE 10th cycle
- ESC-5: Not run (no bctc_refined units — consistent 10th cycle)
- Legal risk: CMG/VNECO2 securities violations (not watchlist); PC1 chairman arrest ongoing (not watchlist); VPB Lạng Son lending audit ongoing — no change
- Macro: VN-Index 1844.54 (last close 2026-06-01), Brent 94.84 NEUTRAL ($60-100 band), Gold 4510.6 risk-off/BULLISH (declining from 4571 peak), USD/VND 26114 BEARISH, Equity earning yield 8.20% CHEAP (EY vs market, +3.20pp)
- Kinhdich: endpoint connection error (consistent with prior cycles)
- Double-publish guard: task_claim "published:bctc-analyst-slot-4:2026-06-02" → claimed=true
- Log ID: 1202

### Carry-over to next cycle (c011 — 15:00 UTC slot, 2026-06-02)
- CTG: RELEASE ticker STILL deferred (2nd consecutive cycle no data). Filed 2026-06-01. 24h+ lag is abnormal — extraction pipeline may be blocked. Dev team must investigate CTG-specific pipeline issue. Calendar: PE 7.8, PB 1.5, ROE 21% from sector.
- ACB: CHEAP verdict (EY+7.82% with deposit=5.00%). Rate-sensitive headwind under FII_OUTFLOW_RISK. Extraction impairment (conf 38%) persists — m_score/f_score null. Foreign flow negative 10+ cycles.
- FPT: ESC-3 ACTIVE 10th cycle (c001–c010). OCF/NI=-1.15, divergence_ratio=2.15. Opus deep-dive CRITICAL OVERDUE — PO MUST schedule Opus sub-agent on flow/deep-dive-opus.md (FPT Q1-2026). 10 cycles = definitively structural, not data artifact.
- DHG/EIB: extraction broken 9th consecutive cycle — PDFs on disk but get_bctc_full returns no data. BCTC-TABLE sprint URGENT blocker.
- 34 tickers overdue: ACV, BDI, BID, D2D, DAG, DLC, DPM, GAS, GVR, HCM, HPG, HSG, HVN, JSH, KBC, MBB, MWG, NKG, NVL, PLX, POW, PPC, REE, SIS, SSI, TCH, VCB, VCI, VDC, VHM, VIC, VNH, VPB, VRE. No change. Watch for new ĐÃ NỘP.
- DEPOSIT RATE: Use 5.00% (confirmed live c008+c009+c010). Do not revert to 4.7%.
- NVL bond 5,000 ty VND due 2026-09-15 at 10.5%: <105 days. Maturity risk elevated. Real estate sector broad drop.
- Macro: Brent 94.84 NEUTRAL. Gold declining trend (4571→4521→4514→4510). FII outflow persistent banking+RE. Deutsche Bank: Fed may have ended rate cut cycle (bearish for EM carry).
- Critic score: plateau at 0.6 (retry=1 path). m_score/f_score null due to extraction impairment and no refined units.
- FPT ESCALATION STATUS: 10 cycles CRITICAL. Operator attention required. Sonnet model cannot invoke deep-dive-opus.md directly — PO must dispatch Opus sub-agent.

## c009 — Cycle 21:00 UTC (21:05–21:10 UTC) — mode: mixed (1 release pending + 4 routine)

- Mode: mixed (CTG=release/DATA_INSUFFICIENT, ACB/FPT/DHG/EIB=routine)
- Stocks analyzed: 2 (ACB / FPT) — DHG/EIB extraction broken 8th consecutive cycle; CTG filed today, extraction lag
- NEW ĐÃ NỘP: CTG (filed 2026-06-01) — calendar confirmed, but get_bctc_full returns "Chưa có dữ liệu BCTC". Deferred to c010 (00:00 UTC slot).
- Chain validations: 0 open findings (cycle_id=20260601-2100, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (macro snapshot live source_tier=1, carry spread -0.33pp: USD 5.33% vs VND deposit 5.00%)
- Max Deposit Rate: 5.00% (confirmed live, macro snapshot 21:04 UTC)
- Carry regime: FII_OUTFLOW_RISK (carry spread -0.33pp)
- Investment clock: Overheat (CPI 5.46%, fetched 2026-05-16 — source_tier=2)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield)
- Calendar gate: 4 prior ĐÃ NỘP (ACB/DHG/EIB/FPT — 2026-05-24) + NEW CTG (2026-06-01). MODE = mixed.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+7.82% vs 5.00%), FPT=FAIR (PE 13.8, EY+2.25%, ESC-3), CTG=DATA_INSUFFICIENT, DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- ACB sector: PE 7.8 vs median 9.1 (NGANG BANG), PB 1.3 vs 1.6 (discount -18%), ROE 17.6% above median 16.7%; foreign flow +0 today vs sector +3K (YEU HON ngành)
- FPT sector: PE 13.8 vs median 17.3 (discount -20%), PB 3.6 vs 1.5 (premium +136% — ROE-justified), ROE 28.3% vs 10.6%; FPT +1.82% today vs sector +0.8% (MANH HON ngành)
- FPT OCF: operating_cf=-2,847,813 VND millions vs NI=2,476,800 VND millions. ocf_ni_ratio=-1.15. ESC-3 ACTIVE 9th consecutive cycle (c001–c009).
- ACB OCF: OCF=0 extraction artifact (bank BCTC). E4 Block Rule applied — ESC-3 skipped.
- Signals posted: #4622 fundamental_validation ACB (critic 0.6 — retry=1 accepted), #4623 fundamental_validation FPT (critic 0.6 — retry=1 accepted)
- Signal files written: docs/signals/bctc_signal_ACB_20260601_routine.json, bctc_signal_FPT_20260601_routine.json, bctc_signal_DHG_20260601_routine.json, bctc_signal_EIB_20260601_routine.json, bctc_signal_CTG_20260601_release.json
- E3 cache: MISS all (cycle_id=20260601-2100 first run)
- E1 trick passes: Not run (ACB conf 38%; FPT ESC-3 active — E4 Block Rule; DHG/EIB/CTG no data)
- ESC flags: ACB=[F,F,SKIP(bank),F,F], FPT=[F,F,ESC3=T,F,F] — FPT Opus deep-dive CRITICAL OVERDUE 9th cycle
- ESC-5: Not run (no bctc_refined units — consistent 9th cycle)
- Legal risk: CMG/VNECO2 securities violations (not watchlist); PC1 chairman arrest ongoing; VPB Lạng Son lending audit ongoing — no change
- Macro: VN-Index 1844.54, Brent 95.21 NEUTRAL ($60-100 band), Gold 4514.4 risk-off (BULLISH, declining from 4571 peak), USD/VND 26114 BEARISH, Equity earning yield 8.20% CHEAP (EY vs market)
- Market alerts: Real estate sector HIGH drops (VRE -3.26%, VIC -3.03%, VHM -2.56%), Banking broad drop, GAS -3.66%, PLX -3.05%. FII outflow 630ty (banking + real estate). Deutsche Bank: Fed may have ended rate cut cycle.
- Macro snapshot: LIVE this cycle (source_tier=1, 21:04 UTC) — first live read confirmed this session
- Double-publish guard: task_claim "published:bctc-analyst-slot-3:2026-06-01" → claimed=true
- Log ID: 1200

## c008 — Cycle 18:00 UTC (18:05–18:12 UTC) — mode: routine

- Mode: routine
- Stocks analyzed: 4 (ACB / FPT / DHG / EIB) — remaining 35 QUÁ HẠN no change
- Critical findings: DHG extraction broken (Chưa có dữ liệu BCTC — 7th consecutive cycle), EIB extraction broken (7th consecutive cycle). FPT: ESC-3 ACTIVE persistent (OCF/NI=-1.15, divergence_ratio=2.15, 7th consecutive cycle c002–c008)
- Chain validations: 0 open findings (cycle_id=20260601-1800, minutes_back=30)
- Regime: TIGHTENING (confirmed via news-scout chain_catalyst signals — macro snapshot source_tier=2)
- Max Deposit Rate: 5.00% (UPDATED from macro snapshot live — was 4.7% carry-over)
- Carry regime: FII_OUTFLOW_RISK (carry spread -0.33pp: USD 5.33% vs VND deposit 5.00%)
- Investment clock: Overheat (CPI 5.46%, fetched 2026-05-16 — source_tier=2)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield)
- Calendar gate: Same 4 ĐÃ NỘP (ACB/DHG/EIB/FPT — filed 2026-05-24). No new ĐÃ NỘP vs c007. MODE = routine.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+7.82% vs 5.00% deposit), FPT=FAIR (PE 13.8, EY+2.25%, ESC-3), DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- Deposit rate UPDATE: live macro snapshot returned deposit_rate=5.00% (prior cycles used 4.7% carry-over) — EY spreads adjusted accordingly
- ACB sector: PE 7.8 vs median 9.1 (NGANG BANG), PB 1.3 vs 1.6 (discount -18%), ROE 17.6% above median 16.7%; foreign flow -440K cp net (YEU HON sector -36K — worsening trend 7 cycles). Rate-sensitive sector under TIGHTENING → headwind flag set.
- FPT sector: PE 13.8 vs median 17.3 (discount -20%), PB 3.6 vs 1.5 (premium +136% — ROE-justified), ROE 28.3% vs sector 10.6%; foreign flow +94K (MANH HON sector -97K — improved vs c007). Sentiment TANG +0.12.
- FPT OCF: operating_cf=-2,847,813 VND millions vs NI=2,476,800 VND millions. ocf_ni_ratio=-1.15. ESC-3 ACTIVE 7th cycle.
- ACB OCF: OCF=0 extraction artifact (bank BCTC). E4 Block Rule applied — ESC-3 skipped.
- Signals posted: #4608 fundamental_validation ACB (critic 0.6 — retry=1 accepted), #4609 fundamental_validation FPT (critic 0.6 — retry=1 accepted)
- Signal files written: docs/signals/bctc_signal_ACB_20260601_routine.json, bctc_signal_FPT_20260601_routine.json, bctc_signal_DHG_20260601_routine.json, bctc_signal_EIB_20260601_routine.json
- E3 cache: MISS all 4 (cycle_id=20260601-1800 first run)
- E1 trick passes: Not run (extraction impaired for ACB conf 38%; FPT ESC-3 active — E4 Block Rule; DHG/EIB no data)
- ESC flags: ACB=[F,F,F,F,F], FPT=[F,F,ESC3=T,F,F] — FPT escalation logged (Sonnet model — Opus deep-dive NOT invoked, 7th cycle CRITICAL)
- ESC-5: Not run (no bctc_refined units — consistent 7th cycle)
- Legal risk: CMG/VNECO2 securities violations (not watchlist); PC1 chairman arrest ongoing; VPB Lạng Son lending audit ongoing — no change
- Macro: VN-Index 1844.54, Brent 94.85 NEUTRAL ($60-100 band), Gold 4521 risk-off (BULLISH safe-haven), USD/VND 26114 BEARISH (VND depreciation), Equity earning yield 8.20% CHEAP vs market
- Market context: FII outflow 630ty phiên đầu tuần (banking + real estate targeted). Brent +4.54% pressure. Deutsche Bank: Fed may have ended rate cut cycle.
- Double-publish guard: task_claim "published:bctc-analyst-slot-2:2026-06-01" → claimed=true
- Log ID: 1199

## c011 · 2026-06-02T15:10Z
### Analysis Cycle (15:06–15:10 UTC) — mode: mixed (1 release pending + 4 routine)
- Mode: mixed (CTG=release/DATA_INSUFFICIENT 3rd cycle, ACB/FPT/DHG/EIB=routine)
- Stocks analyzed: 2 (ACB/FPT) — DHG/EIB PUB-5 blocked (conf 44%/31%); CTG cover-letter-only PDF 3rd cycle
- Critical findings: FPT ESC-3 ACTIVE 11th consecutive cycle (OCF/NI=-1.15, divergence=2.15). CTG volume spike 2.9x on session with broad sector sell-off (unusual signal — strategic accumulation or news-driven). NVL nằm sàn -6.89% (bond 5,000ty maturing 2026-09-15 at 10.5%, <95 days). Banking sector broad sell-off -1.53% avg (10 mã).
- Chain validations: 0 open findings (cycle_id=20260602-1500)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (live source_tier=1, 2026-06-02T15:05Z). Carry spread -0.33pp (USD 5.33% > VND deposit 5.00%).
- Max Deposit Rate: 5.00% (confirmed live)
- VN-Index: 1826.47 (6 consecutive down sessions per news analysis)
- Valuation flags: ACB=CHEAP (PE 7.8, EY+7.82%, rate_sensitive_headwind), FPT=FAIR (PE 13.8, EY+2.25%), CTG/DHG/EIB=DATA_INSUFFICIENT
- ACB: PE 7.8 (sector 9.1), PB 1.3 (-18% discount), ROE 17.6% (above median 16.7%). Foreign flow -475K cp net 5-day (YEU HON). ACB +0.8% vs sector -1.3% (positive divergence). Insider: none.
- FPT: PE 13.8 (sector 17.3, -20%), PB 3.6 (premium ROE-justified), ROE 28.3% (sector 10.6%). Foreign +644K cp net 5-day (MANH HON). Sentiment TANG +0.12.
- ESC flags: ACB=[F,F,SKIP(bank),F,F], FPT=[F,F,ESC3=T,F,F]. ESC-3 guard re-claimed. Signal bca-20260602T1506Z → dev-team (orch signal_queue).
- Signals posted: #4708 fundamental_validation ACB (critic 0.6), #4709 fundamental_validation FPT (critic 0.8)
- Signal files: bctc_signal_ACB/FPT/DHG/EIB/CTG_20260602_*.json
- Log ID: 1209

### Carry-over to c012 (18:00 UTC slot, 2026-06-02)
- CTG: RELEASE 3rd cycle no data. BCTC-CTG-ATTACHMENT-FETCH blocker (cover-letter-only 0.5MB PDF). CTG volume spike 2.9x today warrants monitoring.
- ACB: CHEAP (EY+7.82%), rate-sensitive headwind. Conf 38% impairment persists. Foreign flow negative trend.
- FPT: ESC-3 ACTIVE 11th cycle. FU-BCTC-TOOL-PARAMS blocker. Prior Opus deep-dive: flag_for_human_review (conf=0.35).
- DHG/EIB: PUB-5 blocked — BAL-1d-DEV (report_scope + PUB-5 upgrade) needed. Committed data correct but unservable.
- NVL bond: 5,000ty VND due 2026-09-15 (<95 days, 10.5%). NVL nằm sàn -6.89% today. Maturity risk elevated.
- DEPOSIT RATE: 5.00% confirmed live. Do not revert.
- Macro: Brent 94.83 NEUTRAL, Gold 4,529 risk-off trend, USD/VND 26,118 BEARISH, VN-Index declining 6 sessions.

## c012 · 2026-06-02T18:12Z
### Analysis Cycle (18:05–18:12 UTC) — mode: mixed (1 release pending + 4 routine)
- Mode: mixed (CTG=release/DATA_INSUFFICIENT 4th cycle, ACB/FPT/DHG/EIB=routine)
- Stocks analyzed: 1 (FPT — conf 81%) — ACB/DHG/EIB PUB-5 blocked; CTG cover-letter PDF 4th cycle
- Critical findings: FPT ESC-3 ACTIVE 12th consecutive cycle (OCF/NI=-1.15, divergence=2.15). ESC-3 guard HELD. CTG volume 2.9x + -2.03% today.
- Chain validations: 0 open findings (cycle_id=20260602-1800)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (live source_tier=1, 2026-06-02T18:05Z). Carry spread -0.33pp.
- Max Deposit Rate: 5.00% (confirmed live)
- VN-Index: 1826.47 (6 consecutive down sessions); Brent 96.01 NEUTRAL; Gold 4,518.4 risk-off; USD/VND 26,118 BEARISH
- Valuation flags: FPT=FAIR (PE 13.8, EY+2.25%), ACB=CHEAP (PE 7.8, EY+7.82%, rate_sensitive_headwind), CTG/DHG/EIB=DATA_INSUFFICIENT
- FPT: PE 13.8 (sector 17.3 -20%), ROE 28.3% (sector 10.6%). Foreign +644K cp 5-day MANH HON. Sentiment TANG +0.12.
- ACB: PE 7.8 (sector 9.1 NGANG BANG), PB 1.3 (-18%), ROE 17.6%. Foreign -475K cp 5-day YEU HON. ACB +0.8% vs sector -1.3% (positive divergence).
- ESC flags: FPT=[F,F,GUARD-HELD,F,skip]; ACB=[F,F,skip-bank,F,skip]; others=no data
- Signals posted: #4726 fundamental_validation FPT (critic 0.6), #4727 fundamental_validation ACB (critic 0.6)
- Signal files: bctc_signal_FPT/ACB/CTG/DHG/EIB_20260602_*.json (cycle_id=20260602-1800)
- Legal: CMG/VNECO2 not watchlist; PC1 arrest not watchlist; VPB lending audit — no change
- NVL bond: 5,000ty VND due 2026-09-15 (<94 days). NVL nằm sàn -6.89% today. Elevated maturity risk.
- Double-publish guard: task_claim "published:bctc-analyst-slot-2:2026-06-02" → claimed=true
- Log ID: 1213

### Carry-over to c013 (21:00 UTC slot, 2026-06-02)
- CTG: RELEASE 4th cycle no data. BCTC-CTG-ATTACHMENT-FETCH blocker. Dev must escalate.
- ACB: CHEAP (EY+7.82%), rate-sensitive headwind. Conf 38%. Foreign negative trend.
- FPT: ESC-3 12th cycle. Guard HELD. Opus: flag_for_human_review (conf=0.35). Human review needed.
- DHG/EIB: PUB-5 blocked 10th cycle. BAL-1d-DEV needed.
- NVL bond: <94 days. DEPOSIT RATE: 5.00%.

---
