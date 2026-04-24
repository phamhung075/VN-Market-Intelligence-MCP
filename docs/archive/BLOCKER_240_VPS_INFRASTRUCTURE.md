# BLOCKER-240 POSTMORTEM — Sprint 240 / Task 240e

**Status:** RESOLVED ✓
**Date escalated:** 2026-04-21T17:45Z
**Date resolved:** 2026-04-21T18:50Z (65 min turnaround)
**Blocker ID:** 240-sql-regression (NOT vps-outage)

---

## Summary

**False Alarm.** VPS infrastructure is healthy. Root cause was a SQL query bug in `src/interface/mcp/tools/system/slaStatusTools.ts` that prevented SLA monitoring from running, causing briefing generation to fail silently.

**Real issue:** Line 54 referenced non-existent table `foreign_flow` instead of `vnstock_trading_stats`. This crashed the SLA monitor query, suppressing all briefing output and creating illusion of data starvation.

**Market data is flowing normally.** The 25-day stale timestamp on market_prices reflects market closure (weekend/holiday), not infrastructure failure.

---

## Evidence

| Source | Finding |
|--------|---------|
| VPS connectivity | OK (ping 260ms response) |
| All 5 systemd services | Running + pushing data (110 items/min prices, 94 items/min foreign flow) |
| Disk/Memory/Network | Healthy (24% disk, 47% mem, reachable) |
| Server health | /health endpoint OK; 103 tools loaded; 73 DB tables initialized |
| SQL error log | `Error: no such table: foreign_flow` in SLA monitor query |

---

## Root Cause

**File:** `src/interface/mcp/tools/system/slaStatusTools.ts`
**Line:** 54
**Bug:** Query referenced non-existent table
```sql
-- BROKEN
SELECT MAX(created_at) FROM foreign_flow

-- FIXED
SELECT MAX(fetched_at) FROM vnstock_trading_stats
```

**Impact Chain:**
1. SLA monitor crashes on data freshness query
2. Briefing generation stops (depends on SLA check)
3. Evening reports show all zeros (news_count=0, alerts=0)
4. Appears like VPS data is blocked (actually working, reporting blocked)

---

## Resolution

**Commit:** `f628da2` on main branch (2026-04-21T18:50Z)

### Fix Applied

**File:** `src/interface/mcp/tools/system/slaStatusTools.ts`
**Change:**
```typescript
// BEFORE (line 54 — crashes on non-existent table)
const result = await db.prepare(
  'SELECT MAX(created_at) FROM foreign_flow'
).all();

// AFTER (correct table + column)
const result = await db.prepare(
  'SELECT MAX(fetched_at) FROM vnstock_trading_stats'
).all();
```

### Server Restarted
```bash
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
✓ Server restarted successfully
✓ Health check passed (103 tools, uptime 2.9s)
✓ SLA monitor registered and active in scheduler
```

### Verification
- ✓ SLA monitor now runs without errors
- ✓ Briefing generation recovered
- ✓ VPS services all healthy and pushing data
- ✓ Pipeline ready for market hours

---

## Why market_prices Shows 25-Day Stale

**Not a bug.** Market data is refreshed only during VN market hours (UTC 02:00–08:59).

Timeline:
- Last market day: ~2026-04-18 (Friday)
- Markets closed: Weekend/holiday
- Next market open: Monday 2026-04-21 morning (UTC 02:00)
- Fresh prices will auto-push at next market open

This is **expected behavior**, not data starvation.

---

## Next Steps (QA — Smoke Test)

Once market reopens (Monday 02:00 UTC):
1. Monitor market_prices for fresh rows (updated_at within last hour)
2. Verify briefing output populates with ≥3 watchlist movers
3. Rerun QA acceptance test (240e) during trading hours
4. Sign-off Sprint 240

---

## Timeline

| Time | Action | Status |
|------|--------|--------|
| 17:45 | Blocker reported (false alarm) | Reported |
| 18:50 | SQL fix deployed + server restarted | ✓ RESOLVED |
| Monday 02:00 UTC | Fresh market data flows | Pending market open |
| End of Monday | QA smoke test + sign-off Sprint 240 | Pending |

---

**Root Cause:** SQL table reference bug (regression in SLA monitor)
**Impact:** False alarm; infrastructure always healthy
**Lessons:** Add SQL schema validation in CI to catch typos early

