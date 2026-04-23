# Task 1267 Diagnosis: BCTC PDF Fetch Timeouts Blocking Q4-2025 Discovery

**Issue Date**: 2026-04-23 10:30 VN  
**Status**: ROOT CAUSE IDENTIFIED  
**Severity**: CRITICAL — 0 new Q4-2025 PDFs in 9 days, deadline breached by 9 days

---

## Executive Summary

The BCTC PDF fetch pipeline is **BROKEN** but NOT due to timeout issues. Root cause is a **LOGIC DEFECT** in the queue management system:

1. **Queue is empty** (0 pending items) → VPS service has nothing to fetch
2. **Items pre-emptively marked as SKIPPED** (28 of 31) on 2026-04-14
3. **bctcQueueEnricherJob skips enrichment** with note "VPS will backfill URLs"
4. **But VPS cannot get source_url hints** if they're never populated
5. **Queue enrichment design is BACKWARDS**: Local server was supposed to provide hints, but was disabled as "hotfix"

---

## Diagnostic Results

### 1. VPS Service Status ✅ RUNNING
```
Service: vn-bctc-fetch.service
Status: active (running) since 2026-04-23 01:40:17 +07 (13h ago)
Restart counter: 3 (indicates repeated failures)
Last logs: All show "FAIL: cannot reach MCP server" from 2026-04-20 → 2026-04-22
Recent state: Queue shows 0 items since 2026-04-23 06:41:19
```

### 2. Queue Status ❌ EMPTY
```
Query: /api/bctc-fetch-queue
Response: { "queue": [], "total": 0 }

Database state:
  - Watchlist: 31 tickers
  - Q4-2025 financial_reports: 2 (only BSR, DGC)
  - Q4-2025 bctc_vps_queue: 31 items total
    - status='done': 3 (BSR, DGC, BID)
    - status='skipped': 28 (all others)
  - Items marked skipped: 2026-04-14 15:29:32 UTC (9 days ago)
```

### 3. Queue Item Status ❌ PREMATURELY MARKED SKIPPED

**Timeline of failure:**
- 2026-04-14 15:29:32 — 28 items created with status='pending'
- **Immediately**: bctcQueueEnricherJob runs, marks all as 'skipped' with reason:
  > "Skipped item (awaiting VPS push) — Main server cannot query SSC from France IP"
- 2026-04-20 onwards — VPS logs: "FAIL: cannot reach MCP server"
- 2026-04-23 — Queue empty, VPS has nothing to fetch

**Root cause chain:**
```
1. bctcQueueEnricherJob (hotfix from Task 1288c) disables ALL enrichment
   Reason: "Main server (France) cannot fetch SSC (geo-blocked)"
   
2. But enrichment was needed to populate source_url hints
   Required by: VPS /root/fetch-bctc.sh to know which URLs to try
   
3. Design flaw: Queue enricher SKIPS items instead of QUEUING them
   Expected: Items remain 'pending' → VPS gets hints → VPS fetches
   Actual: Items marked 'skipped' → VPS never gets them → Queue never populates
   
4. VPS cannot reach MCP server (network/auth issue?)
   Last success: 2026-04-22 05:49:46 (2 runs, then jq parse error)
   Then: Empty queue returned at 2026-04-23 06:41:19
```

### 4. VPS-to-MCP Connectivity ⚠️ INTERMITTENT

VPS logs show:
- **2026-04-20 to 2026-04-22 04:55**: Consistent "cannot reach MCP server" errors
- **2026-04-22 05:43**: Brief success ("Queue: 10 items pending"), then jq parse error
- **2026-04-23**: Returns empty queue (no "cannot reach" error, but 0 items)

**Interpretation**: MCP server was briefly reachable, but queue was invalid (jq parse failure). After queue fixed, it returned 0 items (correct, since all were skipped).

### 5. Circuit Breaker State ✅ NOT THE ISSUE

- **Observation**: No 'bctc' breaker in `circuitBreakerRegistry.ts`
- **Other breakers** (hose, hnx, ssc): All in 'closed' state (no failures)
- **Conclusion**: Circuit breaker is not wired for BCTC discovery, so failure tracking is absent

---

## Root Cause Analysis

### Design Defect: Queue Skip Logic

File: `src/scheduler/financial-reports/bctcQueueEnricherJob.ts` (lines 106–134)

**Hotfix (Task 1288c) disabled enrichment with faulty assumption:**

```typescript
// HOTFIX: Skip enrichment entirely
// Main server (France IP) cannot fetch from SSC (geo-blocked).
// VPS (Vietnam) is the ONLY source of BCTC queue items.
// Items without source_url should be skipped here and backfilled by VPS.
```

**Problem**: This assumes VPS can **self-discover** PDF URLs without hints. But:
- VPS script (`/root/fetch-bctc.sh`) iterates over `source_hints[]` array in queue
- Hints are populated by `bctcQueueEnricher.enrichQueueWithPdfUrls()` on the main server
- **If enrichment is skipped, hints array is empty**
- **VPS cannot fetch without hints**

### Architecture Mismatch

| Component | Responsibility | Status |
|-----------|-----------------|--------|
| Main server | Enrich queue with PDF URL hints (via SSC lookup) | DISABLED |
| VPS | Fetch PDFs from hinted URLs | CANNOT RUN (no hints) |
| Expected | Fallback discovery if hints fail | NOT IMPLEMENTED |

---

## Why This Broke on 2026-04-14

1. **Task 1288c was deployed** — hotfix to disable SSC enrichment (too many timeouts)
2. **bctcQueueEnricherJob ran** — marked all queue items as 'skipped'
3. **VPS script /root/fetch-bctc.sh receives empty queue**
4. **Since 2026-04-14, no new Q4-2025 PDFs have been fetched**

---

## Recommended Actions

### IMMEDIATE (Stop the bleed)

1. **Reset Q4-2025 queue items to 'pending'**:
   ```sql
   UPDATE bctc_vps_queue 
   SET status = 'pending' 
   WHERE period_year = 2025 AND period_quarter = 'Q4' AND status = 'skipped';
   ```

2. **Re-enable queue enrichment** in `src/scheduler/financial-reports/bctcQueueEnricherJob.ts`:
   - Remove the HOTFIX skip logic (lines 106–134)
   - Restore enrichment with a timeout guard (e.g., 5s per request, skip on timeout)
   - Mark items as 'enrichment_timeout' instead of 'skipped' if SSC fails

3. **Deploy and restart server**:
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
   ```

4. **Verify queue populates**:
   ```bash
   curl http://localhost:3000/api/bctc-fetch-queue \
     -H "X-API-Key: $VPS_PUSH_API_KEY" | jq '.total'
   ```
   Expected: 28 (or fewer if VPS already backfilled some)

### SHORT-TERM (Prevent recurrence)

1. **Implement VPS-side PDF discovery** as fallback:
   - If source_hints is empty, VPS should call HOSE/HNX/UPCOM APIs directly
   - This was the original design intent in `discoverBctcPdfUrlDirectApi.ts`
   - Currently only used in tests, never called from VPS script

2. **Add circuit breaker for BCTC**:
   ```typescript
   // src/infrastructure/circuitBreakerRegistry.ts
   bctc: new CircuitBreaker("bctc", {
     failureThreshold: 3,
     resetTimeoutMs: 300_000, // 5 min
   }),
   ```

3. **Wire circuit breaker into queue enrichment**:
   ```typescript
   // Wrap SSC enrichment calls with breaker
   const breaker = breakers.bctc;
   if (breaker.state === 'open') {
     // Skip enrichment, keep status='pending' (not 'skipped')
   }
   ```

### MEDIUM-TERM (Robust design)

1. **Implement enqueue-and-discover pattern**:
   - Queue items start as 'pending' with empty source_url
   - Enrichment job tries to populate source_url (non-blocking)
   - VPS gets items with hints OR without
   - VPS calls direct API discovery if hints fail (Option B already exists)

2. **Update VPS script** to call discovery API if hints are empty:
   ```bash
   # /root/fetch-bctc.sh
   if [ -z "$HINTS" ]; then
     # Call direct API discovery instead of skipping
     HINTS=$(curl ... /api/discover-bctc-pdf-url)
   fi
   ```

---

## Verification Checklist

After applying fixes:

- [ ] Q4-2025 queue items reset to 'pending'
- [ ] Server restarted (launchctl kickstart)
- [ ] Queue endpoint returns >20 items
- [ ] VPS logs show successful fetches (not "cannot reach" or "hints exhausted")
- [ ] New BCTC PDFs appear in database within 1 hour
- [ ] Financial_reports.count for Q4-2025 increases beyond 3

---

## Files Involved

- `src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — Queue skip logic (DEFECTIVE)
- `src/infrastructure/circuitBreakerRegistry.ts` — No BCTC breaker (MISSING)
- `/root/fetch-bctc.sh` (VPS) — No fallback discovery (MISSING)
- `src/application/usecases/discoverBctcPdfUrlDirectApi.ts` — Exists but unused
- `src/interface/mcp/server.ts` — Queue endpoint (WORKING)

---

## Impact Assessment

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Q4-2025 PDFs | 2 | 31 | -29 |
| Queue pending | 0 | 28+ | -28 |
| Days without update | 9 | <1 | 8 days overdue |
| VPS fetch attempts | 0 (no queue) | continuous | BLOCKED |

