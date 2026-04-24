---
agents: ops, developer
trigger: price_stale, circuit_breaker_open, vps_health
status: RECOVERING (partial recovery, foreign flow unresolved)
---

# CRITICAL: HOSE Price Data Stale (RECOVERED 75%)

## Status Update: 2026-04-24 09:14 UTC

**RECOVERED:** Price feeds + News feeds ✅
**UNRESOLVED:** Foreign flow DB writes ⚠️

## Incident Root Cause

**Primary:** VPS services crashed on 2026-04-21 04:53 UTC
- `vn-news-fetch.service` killed by OOM killer (128M peak)
- Service crashed into restart loop, manual stop issued
- All 5 VPS services remained offline for 72 hours (2026-04-21 to 2026-04-24)
- Services auto-restarted at 2026-04-24 08:27:48 UTC

**Secondary:** Foreign flow DB write failures (still unresolved)
- vnstock_trading_stats shows 7-day-old data (latest: 2026-04-17 04:53:08)
- VPS is pushing 95 items but local DB rejects: "Database write failed"
- Likely cause: Migration guard failed silently (FIX-1312, UNIQUE index on code,date)

## Recovery Timeline

```
2026-04-21 04:53 UTC  — Services crash (OOM)
2026-04-24 08:27:48   — Services restart (auto-recovery, cause unknown)
2026-04-24 08:59:14   — Price-fetch pushes 110 items (DB updated ✅)
2026-04-24 09:05:01   — News-fetch pushes 229 items (RAG analyzed ✅)
2026-04-24 09:14 UTC  — Foreign-flow still failing (DB write error)
```

## Data Freshness (as of 09:14 UTC)

| Data Source | Latest | Lag | Status |
|---|---|---|---|
| market_prices (HOSE) | 08:59:14 | <15 min | ✅ OK |
| rag_analyses | 09:05:01 | <10 min | ✅ OK |
| vnstock_trading_stats | 2026-04-17 | 7 days | ❌ CRITICAL |

## Circuit Breaker State

- Foreign Flow: **half-open** (440 consecutive failures before restart)
- Polymarket: **half-open** (165 consecutive failures before restart)
- Both require 24h+ of continuous success to fully reset

## Next Actions

### Immediate (OPS)
1. Investigate vnstock_trading_stats schema migration
   - Run: `sqlite3 data/market.db "PRAGMA index_info(vnstock_trading_stats);"`
   - Verify UNIQUE(code, date) index exists
   - Check for duplicate (code, date) pairs causing insert failures

2. Debug migration guard
   - Check if `runVnstockMigrations()` threw error
   - Log shows "migration guard failed" message in `/tmp/vn-market-mcp.log`

3. Monitor foreign-flow recovery
   - Wait for 10-20 consecutive successful pushes
   - Circuit breaker will auto-reset after 5min of health

### Short-term (Dev)
1. **Memory optimization:** Prevent OOM recurrence
   - Reduce Chromium memory footprint in fetch-vn-news.sh
   - Add memory monitoring to VPS
   - Configure soft limits (swappiness)

2. **Watchdog enhancement:** Monitor service status, not just data age
   - Current watchdog only checks `MAX(market_prices.updated_at)` age
   - Need SSH check: `systemctl is-active vn-price-fetch.service`

3. **Schema audit:** Validate migrations before VPS restart
   - Add startup check: verify UNIQUE indexes exist
   - Log index creation timestamp

### Long-term (Architecture)
1. Add on-call procedure for VPS restart recovery
2. Implement VPS memory auto-scaling
3. Add Telegram alerts for service-level failures (not just data freshness)
4. Document OOM recovery procedure in RUNBOOK.md

## References

- Full incident investigation: `docs/agent-memory/sessions/2026-04-24-ops-incident.md`
- VPS setup guide: `.claude/knowledge/vps-setup.md`
- Related FIX: FIX-1312 (UNIQUE index migration for vnstock_trading_stats)
- Code: `src/interface/mcp/server.ts` lines 50-62 (migration guard)

## Success Criteria for Closure

✅ Price feeds live (<15 min stale)
✅ News feeds live (<10 min stale)
⏳ Foreign flow: Monitor 24h for consistent updates
⏳ Circuit breakers: Reset after 5min of continuous success
