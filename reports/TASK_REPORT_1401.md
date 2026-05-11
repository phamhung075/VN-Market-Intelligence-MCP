# TASK_REPORT_1401 — BCTC Queue Cleanup: Delete Placeholder Source URLs

**Date:** 2026-04-28
**Status:** DONE
**Branch:** task/1401-fix-bctc-placeholder-urls

---

## Summary

Removed 46 blocking rows from `bctc_vps_queue` in the live Docker SQLite DB:

| Category | Rows Deleted |
|---|---|
| Literal placeholder source_url rows | 2 |
| Stale NULL source_url, pending, 0 attempts | 44 |
| **Total** | **46** |

---

## Pre-Delete State

| Metric | Count |
|---|---|
| Total queue rows | 54 |
| Rows with `source_url LIKE '%test.example.com%'` or `'congbothongtin.ssc.gov.vn/test'` | 2 |
| Rows with `source_url IS NULL AND status='pending' AND attempts=0` | 44 |

### Literal Placeholder Rows Deleted

| id | action_code | period | source_url | status |
|---|---|---|---|---|
| 218 | BID | 2025/Q4 | `https://congbothongtin.ssc.gov.vn/test` | pending |
| 193295 | TEST | 2025/Q1 | `https://test.example.com/test.pdf` | done |

### Stale NULL Rows Deleted (44 tickers)

ACB, ACV, BDI, CTG, D2D, DAG, DHG, DLC, DPM, DXG, EIB, FRT, GAS, GEX, GVR, HCM, HSG, HUT, HVN, JSH, KBC, KDC, KDH, MBB, MSN, NKG, NVL, PDR, POW, PPC, SAB, SIS, SSI, VCI, VDC, VEA, VHM, VIC, VIX, VJC, VND, VNM, VPB, VRE

All rows: `period_year=2025`, `period_quarter=Q4`, `status=pending`, `attempts=0`, `source_url=NULL`

---

## Discrepancy Note

The handoff described "44 rows with placeholder source_urls (containing 'test.example.com' or 'congbothongtin.ssc.gov.vn/test')." The actual DB contained only 2 rows matching those literal URL patterns. The remaining 44 blocking rows had `source_url IS NULL` — they were stale pending entries for real tickers that the enricher had never been able to populate since April 14, 2026. Both categories were deleted as they all blocked fresh re-discovery.

---

## Post-Delete State

| Metric | Value |
|---|---|
| Total queue rows | 8 |
| Rows with placeholder URLs | 0 |
| Rows with NULL+pending+0attempts | 0 |
| All remaining rows status | `done` |

Remaining 8 rows (BSR, DGC, DIG, FPT, HPG, SHB, VCB Q4-2025, VCB Q1-2025) all have real VPS source URLs and `status=done` — unaffected.

---

## Verification Query

Run inside the mcp-server container to confirm clean state:

```bash
docker exec vn-market-mcp-server-1 bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/app/data/market.db', { readonly: true });
const r1 = db.query(\"SELECT COUNT(*) as cnt FROM bctc_vps_queue WHERE source_url LIKE '%/test%'\").get();
const r2 = db.query(\"SELECT COUNT(*) as cnt FROM bctc_vps_queue WHERE source_url IS NULL AND status='pending'\").get();
console.log('placeholder URLs (must be 0):', r1);
console.log('null+pending (must be 0):', r2);
db.close();
"
```

Expected output:
```
placeholder URLs (must be 0): { cnt: 0 }
null+pending (must be 0): { cnt: 0 }
```

---

## How Re-Discovery Works

The `bctcQueueEnricherJob` processes rows where `source_url IS NULL OR source_url = 'MISSING' OR source_url LIKE '/test-%'`. With the stale rows deleted, the unique constraint `(action_code, period_year, period_quarter)` is freed.

Re-seeding happens when:
1. The `seedWatchlist` startup function runs on next container restart, OR
2. An MCP tool (e.g. `get_bctc_report`) triggers `INSERT OR IGNORE INTO bctc_vps_queue` for a specific ticker

Once re-seeded with NULL source_url, the enricher will call `discoverHosePdfUrls()` via the VPS proxy to populate real PDF URLs on the next cron cycle.

---

## Script

`scripts/fix-bctc-placeholder-urls.sql` — committed in this task. Idempotent; safe to re-run (DELETEs on already-deleted rows affect 0 rows).

---

## Acceptance Criteria Verification

| Criterion | Status |
|---|---|
| 1. All placeholder rows deleted from `bctc_vps_queue` | PASS — 46 rows deleted |
| 2. Verification query confirms 0 rows with placeholder URLs remain | PASS — 0 rows |
| 3. ACB has its queue slot free (no pending placeholder row) | PASS — ACB deleted, slot free |
| 4. No test files modified | PASS — DB data fix only |
| 5. SQL script committed as `scripts/fix-bctc-placeholder-urls.sql` | PASS |
| 6. Task report documents rows deleted, tickers unblocked, how to verify | PASS — this report |
