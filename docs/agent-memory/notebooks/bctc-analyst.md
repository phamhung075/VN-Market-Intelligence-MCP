# BCTC Analyst — Notebook

**Last updated:** 2026-06-02 (Opus deep-dive dispatch) | **Sprint:** bctc-analyst-routine

## ESC-3 OPUS DEEP-DIVE — FPT Q1-2026 — DONE (FPT-OPUS-DEEPDIVE, on-Opus dispatch)

- Ran flow/deep-dive-opus.md ESC-3 handler ONLY (read-only; not cycle.md/main.md). Resolves the 10-cycle-overdue ESC-3 — STOP re-escalating FPT OCF/NI.
- Tools: get_cash_flow(FPT) OK (single Q1/2026 only, NO 8-quarter history, NO WC line items); get_bctc_full needs `code` not `ticker` — re-ran with code=FPT, confirmed zero lines.
- CONFIRMED zero-extraction artifacts in get_bctc_full: OperatingProfit=0, EBITDA=0, Cash=0, EPS=1, QoQ garbled (NP +12146%, GM 100%→34%). Base data real (conf 81%, source_tier 1): rev 12,480 ty, GP 4,244.9 ty, NP 2,476.8 ty.
- Units reconcile: OCF -2,847,813 & NI 2,476,800 both VND millions → OCF magnitude is REAL, not a unit-scale artifact.
- Verdict: artifact_vs_real = MIXED / partial-artifact. Headline divergence real; earnings-quality INTERPRETATION unconfirmable because the indirect-method reconciling lines (OperatingProfit/EBITDA/Cash + AR/inv/AP/D&A) are missing/zero. Cannot decompose accruals.
- recommended_action=flag_for_human_review, confidence=0.35. Route to bctc-inspect: repair 3 zero lines + rebuild WC bridge before any quality verdict.
- Output: docs/signals/bctc_FPT_deepdive_20260602.json (deep_dive_result → po). FPT ESC-3 now CLOSED at analyst layer; disposition owned by human review.
- GOTCHA for future cycles: get_cash_flow ignores `quarters` param (returns only current quarter); get_bctc_full/get_bctc_refined take `code`/`report_id`, NOT `ticker`.


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

## c007 — Cycle 15:00 UTC (15:04–15:10 UTC) — mode: routine

- Mode: routine
- Stocks analyzed: 4 (ACB / FPT / DHG / EIB) — remaining 35 QUÁ HẠN no change
- Critical findings: DHG extraction broken (Chưa có dữ liệu BCTC — 6th consecutive cycle), EIB extraction broken (6th consecutive cycle). FPT: ESC-3 ACTIVE persistent (OCF/NI=-1.15, divergence_ratio=2.15, 6th consecutive cycle c002–c007)
- Chain validations: 0 open findings (cycle_id=20260601-1500, minutes_back=30)
- Regime: NEUTRAL (fallback — macro snapshot unavailable 6th consecutive cycle)
- Max Deposit Rate: 4.7% (carry-over from c003)
- Carry regime: FII_OUTFLOW_RISK (confirmed: ACB -440K YEU HON, sector net negative)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield)
- Calendar gate: Same 4 ĐÃ NỘP (ACB/DHG/EIB/FPT — filed 2026-05-24). No new ĐÃ NỘP vs c006. MODE = routine.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+8.12%, conf 38%), FPT=FAIR (PE 13.8, EY+2.55%, ESC-3), DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- ACB: NI 4,320.4 ty, NII 6,989.2 ty, Assets 1,030,900 ty. Foreign flow -440K (WORSE vs c006 -274K). Sentiment TANG (+0.07).
- FPT: Revenue 12,480 ty, NI 2,476.8 ty, Gross margin 34%. Foreign flow +94K (IMPROVED vs c006 -38K, MANH HON sector). Sentiment TANG (+0.12).
- Signals posted: #4591 fundamental_validation ACB (critic 0.2), #4592 fundamental_validation FPT (critic 0.2)
- Signal files: bctc_signal_ACB_20260601_routine.json, bctc_signal_FPT_20260601_routine.json, bctc_signal_DHG_20260601_routine.json, bctc_signal_EIB_20260601_routine.json
- E3 cache: MISS all 4 (cycle_id=20260601-1500 first run)
- ESC flags: ACB=[F,F,F,F,F], FPT=[F,F,ESC3=T,F,F] — FPT Opus deep-dive PENDING 6th cycle
- Kinhdich: connection error (endpoint unavailable — not a tool issue)
- Macro: Brent 97.07 (+4.47%), Gold 4483.8 (-1.81%); Deutsche Bank: Fed may have ended rate-cut cycle (bearish)
- Market session: VN-Index -19pt, Real estate -2.95%, Oil/gas -3.66% (GAS), Banking -0.97% broad drop
- Legal: CMG/VNECO2 violations, PC1 chairman arrest ongoing, VPB Lạng Son audit ongoing — no change
- Double-publish guard: task_claim "published:bctc-analyst-slot-1:2026-06-01" → claimed=true
- Log ID: 4591/4592

## c006 — Cycle 00:00 UTC (00:07–00:15 UTC) — mode: routine

- Mode: routine
- Stocks analyzed: 4 (ACB / FPT / DHG / EIB) — remaining 35 QUÁ HẠN no change
- Critical findings: DHG extraction broken (Chưa có dữ liệu BCTC — 5th consecutive cycle), EIB extraction broken (Chưa có dữ liệu BCTC — 5th consecutive cycle). FPT: ESC-3 ACTIVE persistent (OCF/NI=-1.15, divergence_ratio=2.15, 5th consecutive cycle c002–c006)
- Chain validations: 0 open findings (cycle_id=20260601-0000, minutes_back=30)
- Regime: NEUTRAL (fallback — macro snapshot unavailable 5th consecutive cycle)
- Max Deposit Rate: 4.7% (carry-over from c003)
- Carry regime: FII_OUTFLOW_RISK (carry-over)
- Investment clock: Overheat (CPI 5.46%, fetched 2026-05-16)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield available)
- Calendar gate: Same 4 ĐÃ NỘP tickers (ACB/DHG/EIB/FPT — all filed 2026-05-24). No new ĐÃ NỘP vs c005. MODE = routine.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+8.12%, balance-sheet confidence 38%), FPT=FAIR (PE 13.8, EY+2.55%, ESC-3 OCF/NI=-1.15), DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- ACB sector: PE 7.8 vs median 9.1 (NGANG BANG), PB 1.3 vs 1.6 (discount -18%), ROE 17.6% above median 16.7%; foreign flow -274K cp net (weak, data from 2026-05-29 — stale)
- FPT sector: PE 13.8 vs median 17.3 (discount -20%), PB 3.6 vs 1.5 (premium +136% — ROE-justified), ROE 28.3% vs median 10.6%; foreign flow -38K cp net (weak)
- FPT QoQ note: Revenue 12,480 ty vs prior-Q 20,225 ty (-38.3%); NI 2,477 ty vs prior-Q 20 ty (+12146% — prior-Q NI anomaly, not meaningful). YoY comparison not available (only 2025-Q4→2026-Q1 in tool).
- Signals posted: #4521 fundamental_validation ACB (critic 0.6), #4522 fundamental_validation FPT (critic 0.6) — same critic score as c005 (no m_score/f_score available due to extraction impairment)
- Signal files written: docs/signals/bctc_signal_ACB_20260601_routine.json, bctc_signal_FPT_20260601_routine.json, bctc_signal_DHG_20260601_routine.json, bctc_signal_EIB_20260601_routine.json
- E3 cache: MISS all 4 (cycle_id=20260601-0000 first run)
- E1 trick passes: Not run this cycle (extraction impaired for ACB conf 38%; FPT ESC-3 carried from prior cycles — passes skipped per E4 Block Rule confidence < 0.5 threshold; DHG/EIB no data)
- ESC flags: ACB=[F,F,F,F,F], FPT=[F,F,ESC3=T,F,F] — FPT escalation logged (Sonnet model — Opus deep-dive not invoked, model constraint, PO task pending 5th cycle)
- ESC-5: Not run (no bctc_refined units available — consistent with c004/c005)
- Legal risk: CMG/VNECO2 securities violations (not watchlist); PC1 chairman arrest ongoing; VPB Lạng Son lending audit ongoing — no change
- Macro alerts: CRITICAL — Brent crude 92.9 USD (+3.69σ above mean 91.24); Gold 4571.8 USD/oz (-3.27σ below mean 4591.41) — both EXTREME at 00:00 UTC
- Sector data: fresh as of 2026-06-01 00:07 UTC
- Double-publish guard: task_claim "published:bctc-analyst-slot-4:2026-06-01" → claimed=true
- Log ID: 1186

---
