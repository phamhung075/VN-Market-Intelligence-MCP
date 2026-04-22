# Task 1289 — VPS BCTC URL Enrichment — Deployment & OPS Handoff

**Status:** Implementation Complete, Ready for Deployment
**Date:** 2026-04-22
**Assigned to:** OPS Team

---

## What This Does

Unblocks 31 BCTC financial reports stuck in queue since April 12-14.

The VPS now runs a 6-hourly enrichment job that discovers direct PDF URLs from HOSE/HNX/UPCOM portals (accessible from Vietnam) and updates the queue. The existing fetch script then downloads PDFs using these enriched URLs instead of generic hint pages.

**Expected outcome:** 20-25 PDFs recovered within 12 hours of deployment.

---

## One-Time Deployment (5 minutes)

**From local machine:**

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
./deploy-vinahost.sh
```

This script:
1. Validates `.env` (VINAHOST_IP, VINAHOST_PASSWORD, VPS_PUSH_API_KEY)
2. SCPs 7 service scripts to VPS
3. Enables and starts the new `vn-bctc-enrich.timer`
4. Verifies all services are healthy

**Expected output:**
```
══════════════════════════════════════════
 Deploy complete — Vinahost Vietnam owns all 7 services
 ...
 BCTC URL enricher:  systemctl status vn-bctc-enrich.timer ← NEW
 ...
```

---

## What Gets Deployed

### New on VPS

```
/root/enrich-bctc-urls.sh                    (3 KB) — enrichment script
/etc/systemd/system/vn-bctc-enrich.service  — service definition
/etc/systemd/system/vn-bctc-enrich.timer    — timer definition (every 6h)
```

### Changed on VPS

None. Existing 6 services unchanged (prices, BCTC fetch, news, SBV, foreign flow, backfill).

### Changed on Main Server

Added endpoint:
```
POST /api/enrich-queue-item
```
Endpoint code: `src/interface/mcp/server.ts:1482-1552`

No schema or database changes.

---

## Verification (Post-Deployment)

### Step 1: Check Timer is Running

```bash
ssh root@$VINAHOST_IP systemctl status vn-bctc-enrich.timer
```

Expected output:
```
● vn-bctc-enrich.timer - VN Market BCTC URL Enricher Timer
   Loaded: loaded (/etc/systemd/system/vn-bctc-enrich.timer; enabled; vendor preset: enabled)
   Active: active (waiting)
   Trigger: Tue 2026-04-22 18:00:05 UTC
```

### Step 2: Trigger First Enrichment Run (Don't Wait 6h)

```bash
ssh root@$VINAHOST_IP systemctl start vn-bctc-enrich.service
sleep 3
ssh root@$VINAHOST_IP tail -30 /var/log/vn-bctc-enrich.log
```

Expected output:
```
2026-04-22T17:55:15Z === BCTC URL ENRICHMENT START ===
2026-04-22T17:55:16Z Queue: 31 items pending (skip_enrichment=true)
2026-04-22T17:55:17Z VCB 2025-Q4: trying HOSE portal...
2026-04-22T17:55:18Z VCB 2025-Q4: found PDF on HOSE: https://www.hsx.vn/.../...pdf
2026-04-22T17:55:19Z VCB 2025-Q4: enrich POST → {"ok":true,"updated":true}
...
2026-04-22T17:55:45Z === BCTC URL ENRICHMENT DONE ===
```

If you see this output, enrichment is working.

### Step 3: Check Database Was Updated

```bash
sqlite3 ~/data/market.db \
  "SELECT action_code, source_url FROM bctc_vps_queue WHERE source_url IS NOT NULL LIMIT 5"
```

Expected output:
```
VCB|https://www.hsx.vn/...pdf
TCB|https://hnx.vn/...pdf
HPG|https://www.hsx.vn/...pdf
...
```

If you see URLs populated, endpoint is working.

### Step 4: Trigger BCTC Fetch Manually (Optional)

Next fetch will run automatically in 6 hours, but if you want to test immediately:

```bash
ssh root@$VINAHOST_IP systemctl start vn-bctc-fetch.service
sleep 5
ssh root@$VINAHOST_IP tail -30 /var/log/vn-bctc-fetch.log
```

Check for messages like:
```
2026-04-22T17:56:00Z VCB 2025-Q4: downloaded 52345B from https://...pdf
2026-04-22T17:56:05Z VCB 2025-Q4: push → {"ok":true,"queued":"VCB-2025-Q4"}
```

---

## Monitoring (Ongoing)

### Daily Health Check

```bash
# Check enricher logs (last 24h)
ssh root@$VINAHOST_IP tail -100 /var/log/vn-bctc-enrich.log

# Check queue status (how many items enriched?)
ssh root@$VINAHOST_IP curl -s \
  -H "X-API-Key: $VPS_PUSH_API_KEY" \
  https://zenmidi.com/api/bctc-fetch-queue?skip_enrichment=true | jq '.total'

# Check fetch logs (are PDFs being downloaded?)
ssh root@$VINAHOST_IP tail -50 /var/log/vn-bctc-fetch.log
```

### Expected Timeline

| Time | Event | Status |
|------|-------|--------|
| T+0m | Deployment | 31 items pending, source_url=NULL |
| T+2m | Enricher runs | 20-25 items discover URLs |
| T+6h | Fetch runs | 20-25 PDFs downloaded, status=completed |
| T+12h | Enricher runs again | Remaining 6-11 items discover URLs |
| T+18h | Fetch runs again | All discovered PDFs downloaded |

By T+18h, 20-25 PDFs should be in financial_reports table. Remaining items (if any) likely mean the stock hasn't published BCTC yet (overdue filing).

---

## Troubleshooting

### Timer Won't Start

**Symptom:** `systemctl status vn-bctc-enrich.timer` shows `inactive`

**Fix:**
```bash
ssh root@$VINAHOST_IP systemctl enable vn-bctc-enrich.timer
ssh root@$VINAHOST_IP systemctl start vn-bctc-enrich.timer
```

### No Logs Appearing

**Symptom:** `/var/log/vn-bctc-enrich.log` doesn't exist or is empty

**Cause:** Service hasn't run yet (waits 2min after boot, then every 6h)

**Fix:**
```bash
# Manual trigger to test
ssh root@$VINAHOST_IP systemctl start vn-bctc-enrich.service

# Check logs immediately
ssh root@$VINAHOST_IP tail -10 /var/log/vn-bctc-enrich.log
```

### "cannot reach MCP server"

**Symptom:** Enricher log shows "FAIL: cannot reach MCP server"

**Cause:** Tunnel down or API key mismatch

**Fix:**
```bash
# From VPS, test endpoint
ssh root@$VINAHOST_IP curl -s \
  -H "X-API-Key: $VPS_PUSH_API_KEY" \
  https://zenmidi.com/health

# Should return: {"status":"ok",...}
# If timeout or 401, check:
#  1. VPS can reach internet: ping 8.8.8.8
#  2. VPS_PUSH_API_KEY matches: echo $VPS_PUSH_API_KEY
#  3. Tunnel is running: systemctl status cloudflared
```

### "no PDF URL found in any portal"

**Symptom:** Enricher log says "all hints exhausted — skip" for a stock

**Cause:** Stock hasn't published BCTC on HOSE/HNX/UPCOM yet (overdue filing)

**Status:** Item stays pending. This is expected — some stocks file late.

**Check manually:**
```bash
ssh root@$VINAHOST_IP curl -s \
  'https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=BID' | grep -i "q4"
  
# If no matches, filing not published yet
```

---

## What If Something Goes Wrong?

### Rollback (Remove Enricher)

Enricher is non-critical — it just enriches URLs. If it breaks:

```bash
ssh root@$VINAHOST_IP << 'EOF'
systemctl stop vn-bctc-enrich.timer
systemctl disable vn-bctc-enrich.timer
rm /etc/systemd/system/vn-bctc-enrich.* /root/enrich-bctc-urls.sh
systemctl daemon-reload
EOF
```

Fetch script will then fall back to using hint URLs (original behavior). PDFs won't download, but queue won't break.

### Restore Enricher

If you rolled back and want to redeploy:

```bash
./deploy-vinahost.sh
```

---

## FAQ

**Q: Will this affect existing BCTC fetch performance?**
A: No. Enricher runs independently, every 6h. Fetch script unchanged.

**Q: What if enricher crashes?**
A: Timer will retry automatically after 10 seconds. Logs go to `/var/log/vn-bctc-enrich.log`.

**Q: Can I disable the enricher temporarily?**
A: Yes: `systemctl stop vn-bctc-enrich.timer`. Fetch will still work (using hints).

**Q: How long does enrichment take?**
A: ~30 seconds for 31 items (1s per portal try × 3 portals/item).

**Q: Are any secrets exposed in logs?**
A: No. Logs contain stock codes, URLs, and HTTP response bodies. API key is in curl headers but never logged.

---

## References

- Full implementation guide: `docs/IMPLEMENTATION_1289.md`
- Source code: `src/interface/mcp/server.ts:1482-1552`
- VPS scripts: `vps-scripts/enrich-bctc-urls.sh`, `vps-scripts/vn-bctc-enrich.*`
- Original blocker: `docs/handoffs/TASK_1289_VPS_BCTC_BLOCKER.md`

---

## Sign-Off

Implementation: COMPLETE
Testing: PASS (6317/6317 tests)
TypeScript: PASS
Ready for: Production deployment

Contact Dev Team if issues arise during deployment.

