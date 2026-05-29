# BCTC Analyst — Notebook

**Last updated:** 2026-05-29T15:15Z | **Sprint:** bctc-analyst-merge

## c002 — Cycle 15:00 UTC (15:00–15:15 UTC) — mode: routine

- Mode: routine
- Stocks analyzed: 4 (ACB / FPT / DHG / EIB)
- Critical findings: DHG extraction broken (Net Revenue=0, confidence 44%), EIB extraction broken (confidence 31%, NI=0)
- Chain validations: 0 open findings (cycle_id=20260529-1500, minutes_back=60)
- Regime: EASING | Max Deposit Rate: 4.7% | EY spread: +3.5pp
- Carry regime: FII_OUTFLOW_RISK (carry spread -0.63pp, USD 5.33% vs SBV 4.70%)
- Investment clock: Overheat (CPI 5.46%, PMI null)
- G-Bond: NVL bond 5,000 ty VND due 2026-09-15 at 10.5% (extended)
- Valuation flags: ACB=CHEAP (PE 7.8, EY+12.8%, balance-sheet zeros conf 38%), FPT=FAIR (PE 13.8, EY+7.25%, OCF/NI=-1.15 WARN), DHG=DATA_INSUFFICIENT, EIB=DATA_INSUFFICIENT
- Signals posted: #4251 fundamental_validation ACB (score 0.8), #4252 fundamental_validation FPT (score 0.8)
- Signal files: docs/signals/bctc_signal_ACB_20260529_routine.json, bctc_signal_FPT_20260529_routine.json, bctc_signal_DHG_20260529_routine.json, bctc_signal_EIB_20260529_routine.json
- E3 cache: MISS all 4 tickers (first 15:00Z slot run)
- E1 trick passes: SKIPPED for DHG/EIB (extraction broken — no reliable data to pass); ACB/FPT minimal data (zeros/partial)
- Legal risk: CMG securities penalty (not watchlist); PC1 chairman arrest ongoing; VPB Lạng Son audit ongoing
- Insider: no signals ACB or FPT
- get_cycle_bootstrap: enum drift — bctc-analyst not in enum; used financial-analyst (known issue, log to BUG)
- 35/39 tickers QUA HAN Q1-2026 (deadline 30/04 or 15/05): no new filings vs c001

### Carry-over to next cycle
- ACB: CHEAP qualified by low balance-sheet confidence (38%). If Q2-2026 filing arrives with full balance sheet, re-rate.
- FPT: OCF/NI=-1.15 Q1-2026 accrual divergence — MUST re-check Q2-2026 OCF for resolution.
- DHG/EIB: extraction remains broken; signal = DATA_INSUFFICIENT. Dev-team BCTC-TABLE sprint still open.
- 35 tickers overdue: watch for new filings in next slot (18:00 UTC). Any new ĐÃ NỘP → MODE=release.
- get_cycle_bootstrap enum: bctc-analyst id not yet registered in MCP tool enum. Workaround: use financial-analyst. PO task needed.
- NVL bond 5,000 ty VND due 2026-09-15: maturity risk for real-estate sector.

---

## c001 — Migration Bootstrap (2026-05-29)

Migration from financial-analyst + report-analyzer per architect brief MERGE-OK-v2.

### Last cycle — financial-analyst (2026-05-29 00:00 UTC)
- Mode: routine | Stocks: 4/39 with Q1-2026 BCTC (ACB/DHG/EIB/FPT)
- Regime: EASING (EY spread +3.5pp vs deposit 4.7%) | Max Deposit Rate: 4.7%
- Valuation flags: ACB=CHEAP (EY+8.12%, conf 38%, balance-sheet zeros), FPT=FAIR (EY+2.55%, OCF/NI=-1.15 warn)
- Signals: #4187 fundamental_validation ACB, #4188 fundamental_validation FPT
- Critical: 35/39 QUÁ HẠN 29 days; DHG/EIB extraction broken (zeros); VHM +6.99% surge
- Next: continue surveillance; ACB CHEAP qualified by low confidence; FPT accrual Q2-2026 watch

### Last cycle — report-analyzer (2026-05-18 00:10 UTC)
- Mode: event-driven (no new filings) | Bootstrap: OK (5ms)
- Earnings: 0 new ĐÃ NỘP | Signals: 0
- Notes: 7 banks 3 days past 15/05 deadline; MCP gateway recovered from 2026-05-17 outage
- Status: session-log-only cycle (no new earnings → early exit per flow)

### Known patterns from predecessor agents
- Regime extraction at bootstrap is mandatory. NEUTRAL → EY_SPREAD threshold still applies (1–3% = FAIR).
- BCTC Q1-2026 mass-late persists (35/39 stocks overdue). Track when submissions arrive.
- Net margin compression QoQ is a red flag even when absolute levels are acceptable.
- P/E premium without ROE premium = valuation stretched.
- Layer-7 get_cash_flow extraction has persistent bug (absurd ratios for VCB/FPT/HPG) — proxy with ocf_ni_ratio from get_bctc_full.
- Banking sector OCF structurally 0 (classification difference) — not a trick signal for banks.
- Kinh Dịch 501 errors persist (B-bucket pending) — non-fatal, log and continue.
- E2 guard: refuse new pass start if now_utc in [02:00, 08:00) UTC.
- E3 cache: expect CACHE MISS on first run for all tickers (no prior cache entries).
