# Unified Agent — Memory Index

## System Status (Last Updated: 2026-05-09 06:02 UTC)

- [Last Market Cycle (07:01 UTC, May 8)](docs/agent-memory/sessions/2026-05-08-unified-agent.md) — **GREEN** ✓
- [Prediction Review (03:01 UTC, May 9)](docs/agent-memory/sessions/2026-05-09-unified-agent-0301.md) — **GREEN** ✓ — MCP Infrastructure RECOVERED
- [Alert Commander Cycle (04:03 UTC, May 9)](docs/agent-memory/sessions/2026-05-09-alert-commander.md) — **GREEN** ✓ — 7 news alerts reviewed, 0 fired, FII_OUTFLOW_RISK regime
- [Alert Commander Cycle (05:02 UTC, May 9)](docs/agent-memory/sessions/2026-05-09-alert-commander.md) — **GREEN** ✓ — 0 signals, 0 fired, NEUTRAL regime / FII_OUTFLOW_RISK
- [Alert Commander Cycle (06:02 UTC, May 9)](docs/agent-memory/sessions/2026-05-09-alert-commander.md) — **GREEN** ✓ — 3 urgent_news signals, 0 fired (all below 0.60 threshold), FII_OUTFLOW_RISK regime
- Off-Schedule Trigger (12:01 UTC, May 8) — No action needed
- Off-Schedule Trigger (16:01 UTC, May 8) — No action needed, awaiting 23:00 UTC daily review

## Schedule

**Market Cycles (Mon–Fri):** 01:00 | 02:00 | 03:30 | 04:30 | 06:00 | 07:30 | 08:30 UTC  
**Daily Review:** 23:00 UTC  
**Prediction Review:** 01:00 UTC daily  
**Weekly Review:** Sun 23:30 UTC

## Known Issues (As of 03:01 UTC 2026-05-09)

1. **🟢 RESOLVED: MCP Infrastructure RECOVERED** 
   - MCP server (localhost:3000) responding ✓
   - Cloudflare tunnel (zenmidi.com) responding ✓
   - Prediction review (03:01 UTC) executed successfully

2. **CRITICAL: Alert Quality** — 1% accuracy (303 alerts, 3 hits) — signal noise 33:1
   - Requires QA review of alert pipeline
   - Issue filed to @po

3. **CRITICAL: Portfolio Concentration** — 100% FPT position, -9.8% loss
   - Despite 32 stocks with STRONG conviction
   - Requires rebalancing plan confirmation

4. **MEDIUM: FII Outflow Risk** — VND carry spread -33bp
   - Monitor FPT/BID/VCB for FII selling pressure

---

**Current Status (03:01 UTC 2026-05-09):**
- Infrastructure RECOVERED — prediction review executed ✓
- Last successful cycle: 07:01 UTC (market.md) on May 8
- Last prediction review: 03:01 UTC (prediction.md) on May 9
- Next scheduled: 23:00 UTC (daily-review.md) on May 9
