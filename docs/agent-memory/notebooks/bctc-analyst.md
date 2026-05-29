# BCTC Analyst — Notebook

**Last updated:** 2026-05-29 | **Sprint:** bctc-analyst-merge

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
