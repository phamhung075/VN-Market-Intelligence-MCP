# Unified Agent — Notebook

**Last updated:** 2026-05-14 · **Cycle:** 22:02 UTC (Daily Review)

## This session

Daily Review (22:02 UTC 2026-05-14):
- Mode: DAILY_REVIEW | System: ok (16/16 CB) | Alerts: 26 sent 24h, 4 HIGH/CRITICAL, 0 unnotified | Bugs: 0
- VN-Index ATH confirmed (+27pts): VIC+3.98%, VHM+2.95%, FPT+4.53% — khối ngoại reversed to net-buy
- Freshness: news 4.5h STALE (RSS degraded — CafeF/VnExpress/VnEconomy/Reuters all 1 failure); feedback submitted (medium/performance_issue)
- ACB vnstock RATE_LIMITED (max retries exhausted); bctcQueueEnricher 0 URLs for MWG/NVL/REE/TCH/VNH (recurring)
- Telegram BUG channel delivery failed (TELEGRAM_REPORT_BUG_CHANNEL_ID) — noted for ops

## Patterns noticed

- REGIME: macro_snapshot = authoritative (NEUTRAL); news-framing inflates to TIGHTENING — maintain discipline
- HEAD.lock: VirtioFS race recurring (c33/c52/c58+/msg2886). Permanent fix needed (rm on host docker layer)
- Alert scoring pipeline stalled: 441 unknowns / 0 scored — bug 2874 open, no fix yet
- get_portfolio_conviction: persistent server timeout across cycles — likely tool endpoint down, not transient
- RSS degradation: all feeds showing 1+ failures overnight, news freshness consistently exceeds 2h threshold
- bctcQueueEnricher 0-URL errors for multiple tickers is recurring (not isolated) — scrape or geo-block issue
- Telegram BUG channel ID may be misconfigured — submit_feedback BUG delivery reported failed this cycle

## Carry-over (next session)

- **🔴 BCTC Q1/2026 FILING TODAY 15/05**: ACB/BID/CTG/EIB/MBB/VCB/VPB — pull data at 02:00 UTC open. Major EPS catalyst.
- **FPT session 2/2**: 73,900 < 78,000 (session 1 failed threshold). If no break above 78,000 today → reduce position per carry-over rule.
- **VCB Q4-2025 filed 14/05**: Pull get_bctc_full(VCB) at open — assess conviction shift.
- **REGIME**: NEUTRAL confirmed 2 consecutive cycles. Recheck if Warsh/Fed tone hardens.
- **HEAD.lock CRITICAL**: msg 2886 unclaimed >8h. Ops: `rm .git/HEAD.lock` on host — permanent fix needed.
- **get_portfolio_conviction**: bug filed (performance_issue). Monitor at next cycle; if still down → escalate to BUG channel.
- **FII pipeline**: fii_type=UNKNOWN. Foreign net-buy FPT noted 14/05. Reassess when pipeline recovers.
- **VCI**: Institutional exit double confirmed — no entry.
- **Alert scoring**: bug 2874, 441 unknowns. Scoring pipeline needs fix.
- **China/Taiwan prediction market**: 50.5% YES ($1.8M) — geo-risk tail on FPT/VEA/GEX.
- **FOMC Jun 18**: PMI 2/6, CPI 4/6, FOMC 18/6, SBV 24/6.
- **TELEGRAM_REPORT_BUG_CHANNEL_ID**: BUG channel delivery failed this cycle — ops verify env var.
- **RSS feeds**: All degraded overnight. Monitor at 02:00 UTC open — if still failing → submit critical feedback.
