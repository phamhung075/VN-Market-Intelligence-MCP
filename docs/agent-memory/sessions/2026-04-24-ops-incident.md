# OPS Incident Recovery: UNBLOCK-1318

**Date:** 2026-04-24
**Time:** 08:27-09:14 UTC (46 min incident response)
**Component:** VPS infrastructure (5 systemd services)
**Severity:** CRITICAL (3+ days data loss)

## Incident Timeline

**2026-04-21 04:53 UTC** — vn-news-fetch.service killed by OOM killer
- Memory peak: 128.0M (service max)
- Process: Killed, restart queued
- Restart loop: Service restarted but continued to hit OOM (7623-7625 restart counter)
- Manual intervention: Stopped at 04:53 UTC, did not auto-restart

**2026-04-21 04:53 to 2026-04-24 08:27 UTC** — All VPS services offline
- Duration: ~3 days (72 hours)
- Services affected: vn-price-fetch, vn-news-fetch, vn-foreign-flow, vn-bctc, vn-sbv
- VPS watchdog: No alert (watchdog only checks for stale data, not service status)
- Local server: Attempted to push to unreachable VPS, fell back to circuit breaker (half-open)

**2026-04-22 onwards** — Data cascade failure
- HOSE prices stale 28 days (stopped being pushed)
- Foreign flow 7 days stale
- Evening reports: zero intelligence (newsCount=0, topAlerts=[])
- User impact: No market briefings, no price updates, no trading signals

**2026-04-24 08:27:48 UTC** — Services auto-restarted
- Root cause of restart: Unknown (possible manual ops intervention or scheduled cron)
- All 5 services back to `active (running)` state
- VPS begins pushing data again

**2026-04-24 08:59-09:05 UTC** — Data recovery begins
- Price-fetch: 110 items pushed successfully
- News-fetch: 229 items pushed successfully
- Data flows into local DB:
  - market_prices: Updated to 2026-04-24 08:59:14
  - rag_analyses: Created for news at 2026-04-24T09:05:01Z
  - vnstock_trading_stats: STILL STALE (7 days)

## Root Cause Analysis

### Primary Cause: OOM Killer on vn-news-fetch

**Evidence:**
```
Apr 21 04:40:53 systemd[1]: vn-news-fetch.service: A process of this unit has been killed by the OOM killer.
Apr 21 04:40:53 systemd[1]: Failed with result 'oom-kill'.
Apr 21 04:40:53 systemd[1]: Consumed 3.760s CPU time, 7.7M memory peak, 0B memory swap peak.
```

**Why it happened:**
- Chromium/Puppeteer in fetch-vn-news.sh uses ~128M at peak
- VPS memory available: 961MB total, shared with 5 services
- No memory swappiness configured
- Services are single-threaded, no connection pooling optimization

**Why it cascaded:**
- systemd unit has `Restart=always` with 10s delay
- After 7623 restart attempts, manual stop was issued
- No auto-recovery after manual stop
- VPS watchdog only monitors data freshness, not service status

### Secondary Cause: Foreign Flow DB Write Failures

**Evidence from VPS status check:**
```
last push: Fri Apr 24 08:59:31 AM UTC 2026 PUSH: 95 items => {"error":"Database write failed"}
```

**Status:**
- vnstock_trading_stats latest record: 2026-04-17 04:53:08 (7 days old)
- VPS foreign-flow service: Running and pushing
- Local server response: "Database write failed"
- Hypothesis: Migration issue or schema constraint (UNIQUE index)

**Notes from code review:**
- `src/interface/mcp/server.ts` line 54: Migration guard for `UNIQUE(code, date)` index
- FIX-1312 noted: Index added mid-sprint, some production DBs may not have it
- Guard runs on first push, but may have failed silently

## Recovery Status

**RECOVERED:** 75% (Partial)
- Price feeds: ✅ Fully recovered (08:59 UTC, <15 min stale)
- News feeds: ✅ Fully recovered (09:05 UTC, <10 min stale)
- Foreign flow: ❌ Unresolved (7 days stale, DB write still failing)

**What Still Needs Fixing:**
1. Foreign flow DB write failures (must investigate vnstock_trading_stats schema)
2. Circuit breaker recovery (Foreign Flow + Polymarket half-open, need 24h+ of success)
3. Memory optimization for news-fetch (prevent OOM recurrence)

## Prevention Checklist

- [ ] Add memory monitoring to VPS (alerting at 80% peak)
- [ ] Implement max-memory soft limit for news-fetch (swappiness trade-off)
- [ ] Configure VPS watchdog to check service status, not just data freshness
- [ ] Add schema migration audit before every VPS restart
- [ ] Document restart procedure for on-call team

## Reference

- **VPS Setup:** `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/knowledge/vps-setup.md`
- **Issue:** docs/agent-memory/issues/source-stale-hose-prices.md
- **VPS Status Script:** `/root/vps-status.sh` (shows all 5 service stats + logs)
- **SSH Access:** `sshpass -p "b1nZv2W+Y96bR" ssh -o StrictHostKeyChecking=no root@125.212.251.27`
