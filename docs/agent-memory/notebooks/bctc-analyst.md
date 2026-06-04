# BCTC Analyst — Notebook

**Last updated:** 2026-06-04 15:10 UTC (c019) | **Sprint:** BCTC-EXTRACT-QUALITY

## c016 · 2026-06-03T18:20Z
### Analysis Cycle (18:05–18:20 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c015; CTG DATA_INSUFFICIENT 8th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%); CTG no BCTC data (filed 2026-06-01, 8th cycle)
- Chain validations: 0 open findings (cycle_id=20260603-1800, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (live source_tier=1). Carry spread -0.33pp.
- VN-Index: 1819.01 (7th consecutive down session); Brent: $98 NEUTRAL; Gold: 4470.6 BULLISH; USD/VND: 26122 BEARISH
- Market EY: 8.20% CHEAP (3.20pp spread); FPT=FAIR (PE 13.8, EY+2.25%), ACB=CHEAP (rate_sensitive_headwind)
- FPT OCF: divergence_ratio=2.15. ESC-3 ACTIVE 16th cycle. GUARD RENEWED (stolen=true, TTL expired). ESC dispatch emitted bca-20260603T1815Z.
- Signals: #4854 FPT (critic 0.8), #4855 ACB (critic 0.6). Double-publish guard: claimed=true.

## c017 · 2026-06-03T21:10Z
### Analysis Cycle (21:05–21:10 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c016; CTG DATA_INSUFFICIENT 9th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38%); DHG PUB-5 blocked (conf 44%); EIB PUB-5 blocked (conf 31%); CTG no BCTC data (filed 2026-06-01, 9th cycle)
- Chain validations: 0 open findings (cycle_id=20260603-2100, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (live, 2026-06-03T21:04Z). Carry spread -0.33pp.
- Max Deposit Rate: 5.00%. Investment clock: Overheat (CPI 5.46%, source_tier=2), VN_DIRECT score=8, CORE_VN.
- VN-Index: 1819.01 (8th consecutive down session signal); Brent: $98.04 NEUTRAL; Gold: $4,470.3 BULLISH; USD/VND: 26122 BEARISH
- Market EY: 8.20% CHEAP (3.20pp spread). FPT=FAIR (PE 13.8, EY+3.2pp), ACB=CHEAP (rate_sensitive_headwind).
- FPT: PE 13.8 (sector 17.3 -20%), PB 3.6, ROE 28.3% (sector 10.6%). Foreign +738K cp 5d MANH HON. Price +2.27%.
- ACB: PE 7.8, PB 1.3 (-18%), ROE 17.6%. Price +3.59%. Foreign YEU HON. Rate_sensitive_headwind.
- FPT OCF: operating_cf=-2,847,813 VND mn vs NI=2,476,800. divergence_ratio=2.15. ESC-3 ACTIVE 17th cycle. GUARD HELD.
- Legal: CMG/VNECO2 violations, PC1 arrest, VPB audit (all non-watchlist, unchanged).
- NVL: institutional sell-off 1T VND (chain_catalyst impact=7 from c016, still active). Bond maturity risk elevated (~90 days).
- Signals posted: #4875 fundamental_validation FPT (critic 0.8), #4876 fundamental_validation ACB (critic 0.6)
- Signal files: bctc_signal_FPT_20260603_routine.json, bctc_signal_ACB_20260603_routine.json
- Double-publish guard: task_claim "published:bctc-analyst-slot-3:2026-06-03" → claimed=true

## c018 · 2026-06-04T00:10Z
### Analysis Cycle (00:05–00:10 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c017; CTG DATA_INSUFFICIENT 10th cycle despite PDF CTG_2026_Q1.pdf available 2026-06-01)
- Stocks analyzed: 2 (FPT conf 81% SERVICEABLE; ACB PUB-5 blocked conf 38%)
- Chain validations: 0 open findings (cycle_id=20260604-0000, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK (live, 2026-06-04T00:04Z). Carry spread -0.33pp. Max Deposit Rate: 5.00%.
- Macro: Brent $97.11 NEUTRAL; Gold $4,466.4 BULLISH; USD/VND 26122 BEARISH; Market EY 8.20% CHEAP (+3.20pp spread)
- Investment clock: Overheat (CPI 5.46% source_tier=2). VN-Index: 1819.01 (8+ consecutive down sessions).
- FPT: PE 13.8 (sector -20%), PB 3.6, ROE 28.3% (sector 10.6%); EY spread +2.25% → FAIR. Foreign +738K (MANH HON). No insider. KinhDich unavailable.
- FPT OCF: -2,847,813 VND mn vs NI 2,477ty; ocf_ni_ratio=-1.15; divergence_ratio=2.15. ESC-3 ACTIVE 18th cycle. GUARD HELD.
- ACB: PE 7.8 vs sector 9.1; PB 1.3 (-18%); ROE 17.6%; EY spread +7.82% → CHEAP. rate_sensitive_headwind=true. Foreign -1.5M cp (YEU HON). PUB-5 blocked.
- NVL: Bond 5,000ty VND due 2026-09-15 at 10.5%/yr (GIA HAN). Maturity risk ~93 days.
- Legal: CMG/VNECO2, PC1, VPB — all non-watchlist, unchanged from c017.
- Signals: #4900 FPT (critic 1.0), #4901 ACB (critic 0.8). Double-publish guard: claimed=true (slot-4).
- Signal files: bctc_signal_FPT_20260604_routine.json, bctc_signal_ACB_20260604_routine.json
- Log ID: 1234

## c019 · 2026-06-04T15:10Z
### Analysis Cycle (15:05–15:10 UTC) — mode: routine
- Mode: routine (no new ĐÃ NỘP vs c018; CTG DATA_INSUFFICIENT 11th cycle)
- Stocks analyzed: 1 (FPT conf 81%) — ACB PUB-5 blocked (conf 38% 11th cycle); CTG no BCTC (11th); DHG/EIB PUB-5 blocked
- Chain validations: 0 open findings (cycle_id=20260604-1500, minutes_back=30)
- Regime: TIGHTENING/FII_OUTFLOW_RISK. Brent $94.79 EXTREME-LOW (-3.18σ); Gold $4,537.8 BULLISH; USD/VND 26122 BEARISH
- Macro alert: CRITICAL Brent extreme drop ($94.79 vs mean $97.28); HIGH Gold elevated ($4,527). Investment clock: Overheat.
- VN-Index rebounding from support ("Blue-chips phục hồi"). PLX +6.90% treasury-stock-sale plan (+4.6x volume) — market-watcher domain.
- FPT: PE 13.8 (sector -20%), PB 3.6, ROE 28.3% (sector 10.6%). EY 7.25%, spread +2.25% → FAIR. Net margin 19.8%.
- FPT OCF: -2,847,813 VND mn vs NI +2,476,790. ocf_ni_ratio=-1.15. Q4/2025 OCF=+4,108ty (seasonal). ESC-3 DATA-COVERAGE-LIMITED (2/4 quarters). Coverage guard claimed (30d max TTL).
- FPT ESC-1/2/4/5: all FALSE. Balance check PASS. No escalation.
- Legal: CMG/VNECO2/PC1/VPB — all non-watchlist, unchanged from c018.
- NVL: bond 5,000ty VND due 2026-09-15 at 10.5% (GIA HAN). Maturity risk ~92 days.
- Signals: #4972 FPT fundamental_validation (critic 0.4), #4973 ACB DATA_INSUFFICIENT (critic 0.4)
- Signal files: bctc_signal_FPT_20260604_routine.json
- Double-publish guard: claimed=true (slot-1:2026-06-04). Log ID: 1244.

### Carry-over to c020 (18:00 UTC slot, 2026-06-04)
- CTG: 11th cycle no BCTC data. PDF CTG_2026_Q1.pdf (0.5MB) present. BCTC-CTG-ATTACHMENT-FETCH CRITICAL.
- ACB/DHG/EIB: PUB-5 blocked. BAL-1d-DEV corpus reflow needed for all three.
- FPT ESC-3: DATA-COVERAGE-LIMITED (2/4 quarters). Coverage guard held 30d. Monitor data accumulation.
- Brent $94.79 extreme drop — watch PLX/GAS fundamentals impact in next cycle.
