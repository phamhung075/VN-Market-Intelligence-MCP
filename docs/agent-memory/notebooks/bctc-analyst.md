# BCTC Analyst — Notebook

**Last updated:** 2026-06-01T18:12Z | **Sprint:** bctc-analyst-routine

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

### Carry-over to next cycle (c009 — 21:00 UTC slot, 2026-06-01)
- ACB: CHEAP verdict (EY+7.82% with deposit=5.00%). Rate-sensitive headwind under TIGHTENING. Extraction impairment (conf 38%) persists — m_score/f_score null. Foreign flow -440K 7-cycle trend.
- DEPOSIT RATE UPDATE: Use 5.00% (not 4.7%) for EY_SPREAD calculations going forward. Live macro snapshot confirmed.
- FPT: ESC-3 ACTIVE 7th cycle (c002–c008). OCF/NI=-1.15, divergence_ratio=2.15. Opus deep-dive CRITICAL OVERDUE — PO must schedule Opus sub-agent on flow/deep-dive-opus.md (FPT Q1-2026). 7 cycles with no resolution = no longer data artifact — structural concern.
- DHG/EIB: extraction broken 7th consecutive cycle — PDFs on disk but get_bctc_full returns no data. BCTC-TABLE sprint URGENT blocker.
- 35 tickers overdue: no change. Watch for new ĐÃ NỘP in 21:00 UTC slot.
- NVL bond 5,000 ty VND due 2026-09-15 at 10.5%: <106 days. Real estate -2.95% today broad drop. Maturity risk elevated. NVL price +0.99% but sector weak.
- Macro: Brent 94.85 trending elevated (was 97+ in c007, slight retreat). Gold declining from extreme highs (4571 → 4521 → trending down). FII outflow persistent.
- Critic score plateau at 0.6 (retry=1 path). m_score/f_score null due to impaired extraction and no refined units.
- VIC news: Phạm Nhật Vượng Philippines expansion + robot company (13M USD) — not direct BCTC factor. VIC price -3.03% broad real estate drop.

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

### Carry-over to next cycle (c008 — 18:00 UTC slot, 2026-06-01)
- ACB: CHEAP verdict with extraction impairment. Foreign flow worsened (-440K 6th cycle high). Monitor.
- FPT: ESC-3 ACTIVE 6th cycle (c002-c007). Opus deep-dive CRITICAL — PO action overdue. FPT price +1.82% today, foreign flow improved.
- DHG/EIB: extraction broken 6th cycle. BCTC-TABLE sprint BLOCKER — dev-team urgent.
- Macro snapshot: 6 consecutive unavailabilities — service degraded. REGIME stuck NEUTRAL.
- Macro alert: Brent 97.07 (+4.47%) continues extreme. Gold declining (-1.81% today). VN-Index in correction.
- NVL bond maturity 2026-09-15: <105 days. Real estate sector -2.95% broad drop today.
- Critic score plateau at 0.2 (was 0.6 in c006) — m_score/f_score still null. Gate accepts retry=1 signals.

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

### Carry-over to next cycle (c007 — 15:00 UTC slot, 2026-06-01)
- ACB: CHEAP verdict qualified by extraction impairment (38%). Balance-sheet zeros persist 5 cycles. Critic score stuck at 0.6 due to missing m_score/f_score from impaired extraction.
- FPT: ESC-3 ACTIVE 5th consecutive cycle (c002–c006). OCF/NI=-1.15 = persistent accrual divergence. Opus deep-dive PENDING 5th cycle — CRITICAL ESCALATION: PO must schedule Opus sub-agent on flow/deep-dive-opus.md (FPT Q1-2026). Pattern now 5 consecutive cycles — no longer a data artifact.
- DHG/EIB: extraction broken 5th consecutive cycle — PDFs on disk but get_bctc_full returns no data. BCTC-TABLE sprint is blocker. Dev-team action needed urgently.
- 35 tickers overdue: no change. Watch for new ĐÃ NỘP filings in 15:00 UTC slot (2026-06-01).
- EIB: PE 37.7 / ROE 4% anomaly — cannot analyze without extraction.
- Macro snapshot: 5 consecutive unavailabilities — persistent service issue. REGIME stuck at NEUTRAL. PO should escalate to dev-team ASAP.
- NVL bond 5,000 ty VND due 2026-09-15 at 10.5%: maturity risk approaching (<105 days).
- MACRO ALERT: Brent crude extreme high (+3.69σ) AND Gold extreme low (-3.27σ) simultaneously at 00:00 UTC — commodity divergence signal for energy/gold sector. Not direct BCTC factor but context for GAS/PLX (oil) and VNH/GVR (agriculture) when filings arrive.
- Critic score: post_agent_signal requires explicit findingData with m_score/f_score — these remain null due to extraction impairment. Score plateau at 0.6 until extraction quality improves.

## c005 — Cycle 21:00 UTC (21:03–21:10 UTC) — mode: routine

- Mode: routine
- Stocks analyzed: 4 (ACB / FPT / DHG / EIB) — remaining 35 QUÁ HẠN no change
- Critical findings: DHG extraction broken (Chưa có dữ liệu BCTC — 4th consecutive cycle), EIB extraction broken (Chưa có dữ liệu BCTC — 4th consecutive cycle). FPT: ESC-3 ACTIVE persistent (OCF/NI=-1.15, divergence_ratio=2.15, 4th consecutive cycle c002–c005)
- Chain validations: 0 open findings (cycle_id=20260531-2100, minutes_back=30)
- Regime: NEUTRAL (fallback — macro snapshot unavailable 4th consecutive cycle)
- Max Deposit Rate: 4.7% (carry-over from c003)
- Carry regime: FII_OUTFLOW_RISK (carry-over)
- Investment clock: Overheat (CPI 5.46%, fetched 2026-05-16)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (carry-over, no 10Y G-Bond yield available)
- Calendar gate: Same 4 ĐÃ NỘP tickers (ACB/DHG/EIB/FPT — all filed 2026-05-24). No new ĐÃ NỘP vs c004. MODE = routine.
- Valuation flags: ACB=CHEAP (PE 7.8, EY+8.12%, balance-sheet confidence 38%), FPT=FAIR (PE 13.8, EY+2.55%, ESC-3 OCF/NI=-1.15), DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- ACB sector: PE 7.8 vs median 9.1 (NGANG BANG), PB 1.3 vs 1.6 (discount -18%), ROE 17.6% above median 16.7%; foreign flow -274K cp net (weak)
- FPT sector: PE 13.8 vs median 17.3 (discount -20%), PB 3.6 vs 1.5 (premium +136% — ROE-justified), ROE 28.3% vs median 10.6%; foreign flow -38K cp net (weak)
- FPT QoQ note: Revenue 12,480 ty vs prior-Q 20,225 ty (-38.3%); NI 2,477 ty vs prior-Q 20 ty (+12146% — prior-Q NI anomaly, not meaningful). YoY comparison not available (only 2025-Q4→2026-Q1 in tool).
- Signals posted: #4512 fundamental_validation ACB (critic 1.0), #4513 fundamental_validation FPT (critic 1.0) — IMPROVEMENT vs c003/c004 (critic was 0.4/0.8)
- Signal files updated: docs/signals/bctc_signal_ACB_20260531_routine.json, bctc_signal_FPT_20260531_routine.json, bctc_signal_DHG_20260531_routine.json, bctc_signal_EIB_20260531_routine.json
- E3 cache: MISS all 4 (slot-3 first run for cycle_id 20260531-2100)
- E1 trick passes: Not run this cycle (extraction impaired for ACB conf 38%; FPT ESC-3 carried from prior cycles; DHG/EIB no data)
- ESC flags: ACB=[F,F,F,F,F], FPT=[F,F,ESC3=T,F,F] — FPT escalation logged (Sonnet model — Opus deep-dive not invoked, model constraint, PO task pending)
- ESC-5: FALSE both ACB and FPT (no refined units — "no refined units found for report_id")
- Legal risk: CMG/VNECO2 securities violations (not watchlist); PC1 chairman arrest ongoing; VPB Lạng Son lending audit ongoing — no change from c004
- Insider signals: tool requires code + outstandingShares params — watchlist-level call not available; no signals detected
- Macro snapshot: service unavailable (4th consecutive cycle) — REGIME fallback NEUTRAL
- Sector data: fresh as of 2026-05-31 21:05 UTC
- Double-publish guard: task_claim "published:bctc-analyst-slot-3:2026-05-31" → claimed=true
- Recent market news: VN-Index correction ongoing (bearish 0.73% session noted), biofuel E10 rollout (bullish PLX/GAS sector), gold -7M VND/luong May (bearish gold), PHP port stock +20% expected (not watchlist)

### Carry-over to next cycle (c006 — 00:00 UTC slot)
- ACB: CHEAP verdict qualified by extraction impairment (38%). Watch for refined data to appear. Critic score improved to 1.0 this cycle with stronger BCTC-forensics finding_data.
- FPT: ESC-3 ACTIVE 4th consecutive cycle (c002/c003/c004/c005). OCF/NI=-1.15 = persistent accrual divergence. Opus deep-dive PENDING — needs PO to schedule Opus sub-agent on flow/deep-dive-opus.md (FPT Q1-2026). Priority escalation escalated 4 cycles now.
- DHG/EIB: extraction broken 4th consecutive cycle — PDFs on disk but get_bctc_full returns no data. BCTC-TABLE sprint is blocker. Dev-team action needed.
- 35 tickers overdue: no change. Watch for new ĐÃ NỘP filings in 00:00 UTC slot.
- EIB: PE 37.7 / ROE 4% anomaly — cannot analyze without extraction.
- Macro snapshot: 4 consecutive unavailabilities — persistent service issue. REGIME stuck at NEUTRAL fallback. PO should escalate to dev-team.
- NVL bond 5,000 ty VND due 2026-09-15 at 10.5%: maturity risk for real-estate sector approaching (< 4 months).
- post_agent_signal param fix: tool requires from_agent + to_agent fields (not just signal_type + payload). Tool discovery confirmed. Lesson logged.
- get_bctc_full + get_sector_comparison: tool requires `code` param, not `ticker`. Lesson confirmed again.

---
