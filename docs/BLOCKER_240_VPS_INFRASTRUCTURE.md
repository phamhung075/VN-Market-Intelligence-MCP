# BLOCKER ESCALATION — Sprint 240 / Task 240e

**Status:** CRITICAL — Infrastructure (not code)
**Date:** 2026-04-21T17:45Z
**Blocker ID:** 240-vps-outage
**Impact:** Sprint 240 QA sign-off blocked; Sprint 241 planning blocked

---

## Summary

All 5 VPS geo-blocked services (vn-price-fetch, vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch, vn-foreign-flow) on Vinahost Vietnam instance became unreachable at 2026-04-21T17:30Z. This caused a complete halt to market data ingestion. The market_prices table has zero new rows for 25 days (last update: 2026-03-27 09:00 UTC).

**This is NOT a code defect.** All Sprint 240 implementation tasks (240a–240c) are merged and verified green. The price-fetch watchdog, backfill service, and freshness gates are implemented correctly. They are simply starved for data.

---

## Evidence

| Source | Finding |
|--------|---------|
| QA Report (240e) | vps_service_health table shows all 5 services unreachable since ~17:30 UTC |
| market_prices table | 1 row total; updated_at = 2026-03-27 09:00 UTC (25 days stale) |
| Briefing output | Empty (freshness gate suppressing correctly, as designed) |
| Test suite | 6119 pass / 1 fail (non-blocking timezone issue) |
| Server health | /health endpoint OK; 103 tools loaded; 73 DB tables initialized |

---

## Root Cause Analysis

**Most likely (in priority order):**

1. **VPS instance crashed or lost network connectivity** — Vinahost node failure, network outage, or instance restart
2. **All 5 systemd services stopped** — OOM kill, disk full, service crash loop
3. **SSH access down** — Cannot verify via SSH; would indicate instance level failure

**NOT code-related:**
- Watchdog job (vpsServiceHealthJob) executed and detected failure correctly
- Watchdog escalation logic is present but cannot trigger on a missing VPS
- Backfill service is ready; no data to backfill until VPS is restored

---

## Immediate Recovery Steps (Ops — Next 30 minutes)

### Step 1: Verify VPS Connectivity (5 min)

```bash
ping 119.18.x.x  # Replace with actual $VINAHOST_IP
ssh root@$VINAHOST_IP /root/vps-status.sh
```

**Expected output:** Service statuses (running/stopped), disk usage, memory, last run timestamps

### Step 2: Assess Service Status (5 min)

If SSH works:
```bash
ssh root@$VINAHOST_IP "systemctl status vn-price-fetch.service"
ssh root@$VINAHOST_IP "systemctl status vn-news-fetch.service"
ssh root@$VINAHOST_IP "df -h"
```

**Check for:**
- Services in failed/stopped state
- Disk full (100% / partition)
- Memory exhausted (OOM kill logs in journal)
- Network interface down

### Step 3: Restart Services (5 min)

If services are stopped:
```bash
ssh root@$VINAHOST_IP "systemctl restart vn-price-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-news-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-sbv-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-bctc-fetch.service"
ssh root@$VINAHOST_IP "systemctl restart vn-foreign-flow.service"
```

Verify restart:
```bash
ssh root@$VINAHOST_IP "systemctl status vn-price-fetch.service"
# Should show: active (running)
```

### Step 4: If Instance is Down

Contact Vinahost support via control panel:
1. Check instance status (running/stopped/restarting)
2. Restart instance via panel if stopped
3. Once alive, redeploy services: `./deploy-vinahost.sh`

### Step 5: Verify Recovery (10 min)

Monitor vps_service_health table:
```bash
sqlite3 market-intelligence.db "SELECT service, last_successful_run FROM vps_service_health ORDER BY last_check DESC LIMIT 5;"
```

**Expected:** All 5 services show recent last_successful_run timestamps (within last 15 min)

Monitor live data:
```bash
sqlite3 market-intelligence.db "SELECT COUNT(*), MAX(updated_at) FROM market_prices;"
# Should show new rows with recent updated_at (within last 1h)
```

---

## Unblocking Steps (Dev — After VPS recovery)

Once VPS is live and pushing data:

1. **Backfill 25-day gap** (2026-03-27 → 2026-04-21)
   - Run priceBackfillService.ts or manual import script
   - Verify ≥500 rows inserted with source='backfill'
   - Confirm schema has `source` column (may need migration)

2. **Rerun QA Smoke Test (240e)**
   - Execute during VN market hours (09:00–15:00 UTC+7)
   - All 6 acceptance criteria should pass
   - Morning + evening briefings should populate with ≥3 watchlist movers

3. **Sign-off Sprint 240**
   - Merge to main
   - Update TASKS.md → 240e Done, Sprint 240 COMPLETE

4. **Unblock Sprint 241**
   - Product Owner reassesses product gaps
   - Launch next sprint with live market data baseline

---

## Postmortem (After recovery)

Once VPS is running, schedule a postmortem to:
1. Identify what caused the outage (crash logs, systemd journal)
2. Add runbook monitoring (e.g., alert if last_successful_run >30min old)
3. Consider redundancy options (secondary VPS, failover)
4. Update VPS deployment docs + recovery procedures

---

## Communication

- **Team:** Do not start Sprint 241 until VPS is live
- **User:** Briefing output will remain empty until price data flows
- **QA:** Can rerun smoke test once vps_service_health shows recent timestamps

---

## Timeline

| Time | Action | Owner |
|------|--------|-------|
| 17:45 | Blocker identified + escalated | QA |
| 17:45–18:15 | Ops investigates VPS connectivity | Ops / Infra |
| 18:15–18:30 | Restart services or restore instance | Ops / Vinahost |
| 18:30–19:00 | Monitor vps_service_health table for recovery | Dev team |
| 19:00–19:30 | Backfill 25-day gap (if needed) | Dev |
| 20:00 | QA rerun smoke test | QA |
| Evening | Sign-off Sprint 240 + plan Sprint 241 | PO |

---

**Escalation Route:** Ops → Vinahost Support (if needed)
**Next Review:** 2026-04-21T18:30Z (check vps_service_health table)

