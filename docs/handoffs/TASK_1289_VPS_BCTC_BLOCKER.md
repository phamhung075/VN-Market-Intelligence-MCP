# Task 1289 — VPS BCTC Fetch Blocker: PDF URL Enrichment

**Status:** BLOCKED — Requires dev intervention
**Date:** 2026-04-22
**Assigned to:** Dev Team
**From:** OPS/Architect

---

## Problem

VPS BCTC fetch script is stuck because the queue returns **generic disclosure page URLs** (hints) instead of **direct PDF download links**.

### Current Flow (Broken)

1. **Main server** (France IP, geo-blocked from SSC) tries to call `listSscDocuments()` to find real PDF URLs
2. This call **fails silently** → queue gets populated with `source_hints` only
3. **VPS script** receives queue with hint URLs like:
   - `https://congbothongtin.ssc.gov.vn/faces/NewsSearch`
   - `https://www.hsx.vn/Modules/Listed/Web/StockDisclosure/VCB`
4. Attempts to download PDFs from these pages → **fails** (pages are HTML, not PDFs)
5. Items marked as "skipped" → **31 items stuck pending**

---

## Root Cause

**File:** `src/interface/mcp/server.ts:1224-1271` (GET /api/bctc-fetch-queue endpoint)

```typescript
// Lines 1244-1256: Tries to enrich queue with PDF URLs
if (!skipEnrichment) {
  const { enrichQueueWithPdfUrls } = await import(
    "../../application/usecases/bctcQueueEnricher.js"
  );

  const listDocsForEnrich = async (code: string, quarter: string, year: number) => {
    try {
      const { listSscDocuments } = await import("../../infrastructure/fetchers/ssc.js");
      return listSscDocuments(code, "quarterly", year);  // ← FAILS: geo-blocked
    } catch {
      return [];  // Silently returns empty, queue gets hints only
    }
  };
```

**Issue:** `listSscDocuments()` is called from France (main server), but SSC portal is geo-blocked. Catch block silently returns empty array, causing queue to use hints instead of URLs.

---

## Solution

Move PDF URL discovery to **VPS side** (Vietnam IP, not geo-blocked from SSC).

### Option A: VPS-Based Scheduler Job (Recommended)

Create a scheduled job on VPS that:

1. **Queries main server queue** every 6 hours
2. **For each item with `source_url=NULL`:**
   - Call `listSscDocuments()` locally (VPS has SSC access)
   - Extract direct PDF download URL
   - POST back to main server via `/api/enrich-queue-item` (new endpoint)
3. Main server stores URL in `bctc_vps_queue.source_url`
4. Next fetch cycle uses direct URLs → downloads complete

**Pros:** Parallel, doesn't block fetch cycle, leverages VPS geo-location
**Cons:** Requires new endpoint on main server

### Option B: Extend Main Server with Breaker Fallback

Modify `src/interface/mcp/server.ts` to:

```typescript
// If listSscDocuments() fails (caught), queue a background job on VPS
// to discover URLs and POST them back later
// Use circuit breaker + exponential backoff
```

**Pros:** Single code path
**Cons:** Still depends on VPS job execution

---

## Current Queue State

```sql
-- Q4 2025 (correct period)
SELECT COUNT(*) as total,
       SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) as skipped
FROM bctc_vps_queue
WHERE period_year = 2025 AND period_quarter = 'Q4';

-- Result: 31 total | 12 pending | 0 completed | 19 skipped
```

**Stocks stuck (skipped, no PDFs found):**
```
BID, BSR, DGC, DIG, DPM, DXG, EIB, FPT, FRT, GEX, HUT, KBC,
KDC, KDH, MSN, NVL, PDR, SAB, SSI
```

---

## Testing

**VPS fetch script:** `/root/fetch-bctc.sh` (deployed and working)

Current behavior:
- ✅ Connects to queue endpoint (tunnel working)
- ✅ Parses JSON correctly
- ❌ Downloads fail (no PDFs in hint URLs)
- ❌ Items stay "pending"

**Test with real PDF URL:**
```bash
# Once source_url is populated:
curl -X POST https://zenmidi.com/api/push-bctc-pdf \
  -F "action_code=VCB" \
  -F "period_year=2025" \
  -F "period_quarter=Q4" \
  -F "source_url=https://congbothongtin.ssc.gov.vn/..." \
  -F "pdf=@test.pdf"
```

---

## Files to Review

1. **Queue enrichment logic:** `src/application/usecases/bctcQueueEnricher.ts`
2. **Queue endpoint:** `src/interface/mcp/server.ts:1224-1271`
3. **VPS fetch script:** `/root/fetch-bctc.sh` (reads queue, needs direct URLs)
4. **Fetch loop:** `/root/fetch-bctc-loop.sh` (runs every 6 hours)

---

## Next Steps (Dev)

1. **Decide:** Option A (VPS job) vs Option B (breaker fallback)
2. **Implement:** PDF URL enrichment on VPS side
3. **Deploy:** Push updated script to VPS via `./deploy-vinahost.sh`
4. **Verify:** Check that queue items move from "skipped" → "completed"
5. **Test:** Confirm financial reports appear in database

---

## Blockers Resolved Before This

- ✅ Cloudflare tunnel routing (was 404, now works)
- ✅ Curl timeouts (15s → 120s)
- ✅ Queue period calculation (now Q4 2025, not Q1 2026)
- ✅ Server restart + database reset

---

## References

- **Architecture:** `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`
- **VPS Setup:** `docs/handoffs/TASK_1289b.md` (OPS audit completed)
- **Tunnel status:** Cloudflare Dashboard → Networks → Tunnels → vn-market-mcp (working)
