# Task 1289 — VPS-Based BCTC URL Enrichment (COMPLETED)

**Status:** COMPLETE
**Date:** 2026-04-22
**Implementation:** Option A (VPS-Based Scheduler Job)

---

## Problem Solved

31 BCTC financial reports were stuck in queue since April 12-14 because:
- Main server (France IP) is geo-blocked from SSC portal (congbothongtin.ssc.gov.vn)
- Queue endpoints return generic disclosure page URLs (hints) instead of direct PDF download links
- VPS fetch script fails to download PDFs from hint URLs (pages are HTML, not PDFs)

**Root Cause:** `listSscDocuments()` in `src/infrastructure/fetchers/ssc.ts` failed silently when called from France, causing queue items to get hints-only instead of real PDF URLs.

---

## Solution Implemented

Move PDF URL discovery to VPS (Vietnam IP, not geo-blocked from SSC). Two-stage flow:

### Stage 1: VPS URL Enrichment (Every 6 Hours)

**Service:** `vn-bctc-enrich.timer` / `vn-bctc-enrich.service`

**Script:** `/root/enrich-bctc-urls.sh`

Flow:
1. Query main server `/api/bctc-fetch-queue?skip_enrichment=true` to get queue items
2. For each item with `source_url=NULL`:
   - Try HOSE portal: `https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=CODE`
   - Fallback to HNX portal: `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=CODE`
   - Fallback to UPCOM portal: `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=CODE`
   - Extract PDF download URL via regex from HTML
3. POST discovered URL back to main server `/api/enrich-queue-item`
4. Log results to `/var/log/vn-bctc-enrich.log`

**Schedule:** Every 6 hours (OnBootSec=2min, OnUnitActiveSec=6h)

### Stage 2: PDF Fetch (Every 6 Hours)

**Service:** `vn-bctc-fetch.service` (existing, unchanged)

**Script:** `/root/fetch-bctc.sh`

Now uses enriched `source_url` field instead of hints, so it can download PDFs directly.

---

## New Endpoint

**POST /api/enrich-queue-item**

**Location:** `src/interface/mcp/server.ts` lines 1482-1552

**Request:**
```json
{
  "action_code": "VCB",
  "period_year": 2025,
  "period_quarter": "Q4",
  "source_url": "https://www.hsx.vn/bctc-vcb-q4-2025.pdf"
}
```

**Response:**
```json
{
  "ok": true,
  "updated": true
}
```

**Security:**
- Requires `X-API-Key` header matching `VPS_PUSH_API_KEY` environment variable
- Validates all fields present and well-typed
- Only updates items where `source_url IS NULL` (prevents overwriting cached URLs)

**Database Update:**
```sql
UPDATE bctc_vps_queue 
SET source_url = ? 
WHERE action_code = ? AND period_year = ? AND period_quarter = ? AND source_url IS NULL
```

---

## Deployment

### Installation

```bash
./deploy-vinahost.sh
```

This now deploys:
1. All 6 existing VPS services (prices, BCTC fetch, news, SBV, foreign flow, OHLCV backfill)
2. **NEW:** Service 7 — `vn-bctc-enrich.timer` + `vn-bctc-enrich.service`

### Files Deployed

```
/root/enrich-bctc-urls.sh                    — enrichment script
/etc/systemd/system/vn-bctc-enrich.service  — systemd service definition
/etc/systemd/system/vn-bctc-enrich.timer    — systemd timer (every 6h)
```

### Verification

After deployment, verify the timer is running:
```bash
ssh root@$VINAHOST_IP systemctl status vn-bctc-enrich.timer
ssh root@$VINAHOST_IP systemctl list-timers vn-bctc-enrich.timer
ssh root@$VINAHOST_IP tail -20 /var/log/vn-bctc-enrich.log
```

---

## How It Works (Step-by-Step)

### Initial State

```
Queue at 2026-04-12:
  VCB Q4-2025: pending, source_url=NULL, source_hints=[ssc_page, hose_page]
  TCB Q4-2025: pending, source_url=NULL, source_hints=[ssc_page, hose_page]
  ...31 items total
```

### 6-Hour Interval

**Minute 0: Enricher Runs (vn-bctc-enrich.timer triggered)**

```
1. Pull queue from main server:
   GET https://zenmidi.com/api/bctc-fetch-queue?skip_enrichment=true
   → Returns 10-30 pending items with source_url=NULL

2. For VCB Q4-2025:
   a) Try HOSE: https://www.hsx.vn/.../ArticleList?category=BCTC&issuerCode=VCB
      → Extract: https://www.hsx.vn/.../Article/BCTC-VCB-Q4-2025.pdf
   b) Found! → POST to /api/enrich-queue-item

3. For TCB Q4-2025:
   a) Try HOSE → success
   b) POST URL back

4. Log: "2026-04-22T18:05:15Z === BCTC URL ENRICHMENT DONE ==="
```

**Result in Database:**
```
bctc_vps_queue:
  VCB Q4-2025: pending, source_url=https://www.hsx.vn/.../VCB-Q4-2025.pdf
  TCB Q4-2025: pending, source_url=https://hnx.vn/.../TCB-Q4-2025.pdf
```

**Minute 5: BCTC Fetch Runs (vn-bctc-fetch.service, every 6h)**

```
1. Pull queue: GET https://zenmidi.com/api/bctc-fetch-queue
   → Now returns items WITH source_url populated

2. For VCB Q4-2025:
   a) source_hints = [https://www.hsx.vn/.../VCB-Q4-2025.pdf, ssc_page, hose_page]
   b) Try first hint → HTTP 200, is PDF, > 1024 bytes
   c) Download PDF
   d) POST to /api/push-bctc-pdf with PDF binary

3. Update queue item: status='completed', no longer pending

4. Next cycle: only 30-1=29 items remain
```

---

## Monitoring

### Check Enrichment Status
```bash
ssh root@$VINAHOST_IP tail -50 /var/log/vn-bctc-enrich.log
```

Example output:
```
2026-04-22T18:05:15Z === BCTC URL ENRICHMENT START ===
2026-04-22T18:05:16Z Queue: 31 items pending (skip_enrichment=true)
2026-04-22T18:05:17Z VCB 2025-Q4: trying HOSE portal...
2026-04-22T18:05:18Z VCB 2025-Q4: found PDF on HOSE: https://www.hsx.vn/...
2026-04-22T18:05:19Z VCB 2025-Q4: enrich POST → {"ok":true,"updated":true}
...
2026-04-22T18:05:45Z === BCTC URL ENRICHMENT DONE ===
```

### Check Queue Status
```bash
ssh root@$VINAHOST_IP curl -s -H "X-API-Key: $VPS_PUSH_API_KEY" \
  https://zenmidi.com/api/bctc-fetch-queue?skip_enrichment=true | jq '.queue[] | {action_code, status, source_url}'
```

Expected progression:
- **Day 1 (1st enrichment run):** 31 pending → 20+ enriched (some portals may not have all PDFs)
- **Day 1 (1st fetch run):** 20+ enriched → downloads start, status changes to 'completed'
- **Day 2 onwards:** Remaining items get enriched in subsequent 6-hour cycles

---

## Files Modified

1. **src/interface/mcp/server.ts**
   - Added POST `/api/enrich-queue-item` endpoint (lines 1482-1552)

2. **vps-scripts/enrich-bctc-urls.sh** ← NEW
   - VPS enrichment script that queries queue and discovers URLs

3. **vps-scripts/vn-bctc-enrich.service** ← NEW
   - Systemd service definition (oneshot)

4. **vps-scripts/vn-bctc-enrich.timer** ← NEW
   - Systemd timer (runs every 6h after 2min boot delay)

5. **deploy-vinahost.sh**
   - Updated to deploy enrichment service + timer

---

## Troubleshooting

### Enricher not running?

Check timer status:
```bash
systemctl status vn-bctc-enrich.timer
systemctl list-timers vn-bctc-enrich.timer
```

If timer exists but is inactive, enable and start:
```bash
systemctl enable vn-bctc-enrich.timer
systemctl start vn-bctc-enrich.timer
```

### Service failed?

Check service status and logs:
```bash
systemctl status vn-bctc-enrich.service
journalctl -u vn-bctc-enrich.service -n 50 --no-pager
```

Common issues:
- **"cannot reach MCP server"** → Check tunnel: `curl https://zenmidi.com/health`
- **"jq: command not found"** → VPS missing jq: `apt-get install jq`
- **"Permission denied"** → Script not executable: `chmod +x /root/enrich-bctc-urls.sh`

### Enrichment returns empty URLs?

Check HOSE/HNX/UPCOM portals are accessible:
```bash
curl -s 'https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=VCB' | head -50
```

If portal is down, enricher logs "no PDF URL found in any portal" but continues (non-blocking).

### Queue still stuck after 2+ enrichment cycles?

Some stocks may not have published BCTC yet (overdue filing). Check manually:
```bash
# SSH to VPS
curl -s https://www.hsx.vn/Modules/CMS/Web/ArticleList?category=BCTC&issuerCode=BID | grep -i "q4.*2025\|2025.*q4"
```

If no results, filing is genuinely not published. Task complete for accessible items.

---

## References

- **Architecture:** `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`
- **BCTC Queue Endpoint:** `src/interface/mcp/server.ts:1224-1336`
- **Queue Enricher (old, on main server):** `src/application/usecases/bctcQueueEnricher.ts`
- **Previous Blocker:** `docs/handoffs/TASK_1289_VPS_BCTC_BLOCKER.md`
- **VPS Setup Guide:** `.claude/knowledge/vps-setup.md`

