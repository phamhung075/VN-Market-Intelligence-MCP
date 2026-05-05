# Ops — Notebook

**Last updated:** 2026-05-05 01:15 UTC | **Sprint:** 1846+ Incident Response

## Current Status: P1 VNSTOCK BUG + P2 VPS DIAGNOSIS REQUIRED

### Incident Summary (2026-05-05 01:00 UTC)

**Four infrastructure issues identified:**

1. **P1 — vnstock-sync officers.filter crash** (CODE BUG)
   - Multiple stocks (VCI, EIB, VDC, FPT, GAS, VHM) fail with `officers.filter is not a function`
   - Root cause: `officers` parameter is `null`/`undefined`, not an array
   - File: `apps/mcp-server/src/infrastructure/db/vnstockStore.ts`, line 393
   - Fix needed: Add null/array guard before calling `.filter()`
   - Impact: Shareholder/officer records not being stored; subsequent NOT NULL violations

2. **P2 — News sources showing as "0 items"** (FALSE ALERT)
   - Actually WORKING — fallback to newsapi is active
   - Fetched 180 items, inserted 1 (dedup working correctly)
   - No action needed; monitoring only

3. **P3 — BCTC fetch stale (5 days)** (VPS SERVICE DOWN)
   - Last push: 2026-04-27 16:58 UTC
   - Requires SSH diagnosis to VPS to check systemd service status
   - Likely cause: `vn-bctc-fetch.service` inactive or network issue

4. **P4 — Foreign flow stale (31h)** (VPS SERVICE DOWN)  
   - Missed full trading session 2026-05-03
   - Same as BCTC: needs VPS service check

### Docker System Status
- All 9 services UP and HEALTHY
- market.db: 87 MB, healthy
- WAL file: 16 MB (normal, <100 MB)
- No database corruption detected

## Known Patterns & Preferences

- VPS Vinahost (Vietnam) is the proxy for ALL geo-blocked VN sources: prices, BCTC PDFs, news, SBV FX rates, foreign flow data
- BCTC pipeline is PULL-based (since 2026-04-27): mcp-server pulls from `VPS:8765/bctc-files/` 
- SQLite corruption root cause (fixed Sprint 1336): macOS Docker VirtualMachine process tears SHM on container stop. Fix = named volume
- Docker restart command: `cd $PROJECT_ROOT && docker-compose down && docker-compose up -d`
- WAL file > 50MB is a flag worth investigating. Normal < 10MB.
- Use `trigger_bctc_vps_fetch(dry_run=true)` first to diagnose before live fetch

## Actions Required

**IMMEDIATE (P1):**
1. Spawn developer agent to fix vnstock officers bug
   - Add null/array type guard in `storeOfficers()`
   - Ensure `fetchVnstockOfficers()` always returns array (not null)
   - Test with stocks that were failing (VCI, EIB, VDC, FPT, GAS, VHM)
   - Commit fix + test before continuing

**NEXT (P2):**
2. SSH to VPS (125.212.251.27) and diagnose:
   - `systemctl status vn-bctc-fetch.service`
   - `systemctl status vn-foreign-flow.service`
   - Check journalctl logs for both
   - Verify network connectivity: `ping 8.8.8.8`
   - Report findings to WORK channel

**FOLLOW-UP (P3):**
3. Monitor macro-indicators schema mismatch (low priority)
   - Check if service is writing to market.db
   - Verify table has `fetched_at` column

## Diagnostic Commands (for next session)

```bash
# SSH to VPS
ssh -i ~/.ssh/id_rsa root@125.212.251.27

# Check service status
systemctl status vn-bctc-fetch.service
systemctl status vn-foreign-flow.service
systemctl list-units --type=service vn-* --all

# Check recent logs
journalctl -u vn-bctc-fetch.service -n 100 --no-pager
journalctl -u vn-foreign-flow.service -n 100 --no-pager

# Check network
ping -c 3 8.8.8.8
ip route
```

## Carry-over for Next Session

- After P1 fix is committed and tested, spawn ops to handle VPS diagnosis
- Monitor if news sources continue to work with fallback
- Consider adding circuit-breaker to officers fetch (currently unprotected)
