# TASK_1404b — Ops: BCTC Queue Cleanup + News VPS Investigation

**Date:** 2026-04-28
**Agent:** ops
**Source Reports:** Telegram 2668 (BCTC), 2664/2666/2667 (news)

---

## Task A — BCTC Queue Placeholder URL Cleanup

### Findings

Inspected `bctc_vps_queue` table. The original report (2668) referenced 44/47 pending rows with placeholder URLs. Actual state found was different:

| Category | Count | Details |
|----------|-------|---------|
| Pending with placeholder URLs | 3 | BID (id=218), BSR (id=29171), DGC (id=29172) — all `https://congbothongtin.ssc.gov.vn/test*` |
| Pending with NULL URL (valid — waiting for VPS) | 21 | Normal state |
| Skipped watchlist tickers needing retry | 9 | EIB, FPT, SSI, VCB (x2), VCI, VHM, VIC, VRE |
| Done with test.example.com URL (orphan) | 1 | id=193295, action_code=TEST |
| Skipped non-watchlist | 20 | BSR, DGC, DIG, DPM, DXG, FRT, GEX, HPG, HUT, KBC, etc. |

Note: Report 2668 mentioned "telegram_reports IDs 73, 76, 77" for stranded_bctc_pdf feedback — those IDs do not exist in the current DB (max ID=2624). These were likely already resolved or referencing Telegram message IDs, not DB row IDs.

### Actions Taken

1. **Cleared placeholder URLs** — NULLed `source_url`, reset `attempts=0` and `last_attempt=NULL` for rows 218 (BID), 29171 (BSR), 29172 (DGC). These will now be re-resolved by the VPS on next fetch cycle.

2. **Deleted orphaned test row** — Removed id=193295 (action_code=TEST, URL=test.example.com). Not a real ticker.

3. **Reset skipped watchlist tickers** — Reset 9 skipped rows (EIB, FPT, SSI, VCB x2, VCI, VHM, VIC, VRE) back to `pending` status with cleared attempts. These are valid watchlist tickers that were wrongly stuck at skipped.

4. **Triggered BCTC VPS fetch** — SSH command fired to VPS (125.212.251.27). Queue now shows 28 watchlist tickers pending with `url=MISSING`, ready for VPS URL resolution on next cycle.

### Final Queue State

```
pending: 33
skipped: 20 (non-watchlist tickers, intentionally skipped)
```

### Root Cause Note

The placeholder URLs (e.g. `https://congbothongtin.ssc.gov.vn/test`) appear to be seeded by a queue-initialization script that inserts stub records before the VPS resolves actual PDF URLs. The `bctcPdfPullJob` correctly skips these at 0 attempts, but the queue never cleans up stale stubs when VPS fails to resolve them. A code-level fix should either:
- Not insert `source_url` until VPS confirms a real URL
- Add a TTL on stub entries (e.g. NULL out after 3 days if still unresolved)

**Recommendation:** Log this for developer to fix queue initialization logic.

---

## Task B — vn-news-fetch Unhealthy Investigation

### Findings

| Source | Status | Detail |
|--------|--------|--------|
| `get_vps_service_health` | unhealthy | response_ms=0, uptime=3h 46m |
| `get_vps_proxy_health` | OK | 87 pushes today, last push 19:42 UTC, 240 items, 0 errors |
| `vps_push_log` DB table | Stale | Latest entries from 2026-04-24 — table not updated by current push path |
| Source health (system_status) | OK | cafef, vnexpress, vneconomy, etc. all showing "OK, 7min ago" |
| SLA status | OK | news age=24min, SLA=30min, not breached |

### Diagnosis

The `vn-news-fetch` service is **functionally healthy** — it is pushing 240 items every ~15 minutes as of today. The `unhealthy` status in `vps_service_health` reflects a health-check endpoint failure (response_ms=0), NOT a data pipeline failure.

The outage reported in 2664/2666/2667 (0 items since 14:15 UTC) was a **transient outage** that self-recovered. The service came back up (uptime shows 3h 46m from the poll time, consistent with a restart around 16:00 UTC).

**Discrepancy:** `vps_push_log` DB table has no entries after 2026-04-24, but `get_vps_proxy_health` shows 87 pushes today. This means the proxy health tool uses a different tracking mechanism (likely in-memory or a separate cache) than the `vps_push_log` SQLite table. The log table is either:
- Not being written to by the current push path
- Being written to a different DB instance
- The push path changed and stopped writing to this table

### Actions Taken

1. **Triggered news VPS fetch** — SSH command fired to VPS to re-run news fetch cycle. Confirms the service is reachable via SSH trigger.

2. **No restart needed** — Service is actively pushing data. Health-check endpoint issue is a monitoring gap, not a service failure.

### Recommendation

Two issues to hand to developer:

1. **vps_service_health health-check endpoint** — The HTTP health check for `vn-news-fetch` is returning 0ms (likely not responding), while the service itself works fine. The health check probe URL may need updating or the VPS service may not expose a `/health` endpoint.

2. **vps_push_log not being written** — The push log table shows last entry 2026-04-24. If this table is used for SLA monitoring or audit, it needs to be written again by the current push code path.

---

## Summary

| Task | Status |
|------|--------|
| BCTC placeholder URL rows cleared | DONE (3 rows NULLed, 1 deleted) |
| Skipped watchlist tickers reset | DONE (9 rows reset to pending) |
| BCTC VPS fetch triggered | DONE (28 tickers queued) |
| telegram_reports 73/76/77 | NOT FOUND — already resolved or wrong ID type |
| News VPS investigation | DONE — transient outage, self-recovered |
| News VPS fetch triggered | DONE |
| News health-check discrepancy | IDENTIFIED — needs developer fix |
| vps_push_log stale | IDENTIFIED — needs developer fix |

---

## Open Items for Developer

1. Fix BCTC queue initialization: do not insert placeholder `source_url` — leave NULL until VPS resolves real URL
2. Fix vn-news-fetch health-check endpoint on VPS (returns 0ms)
3. Investigate why vps_push_log is not being written post-2026-04-24
