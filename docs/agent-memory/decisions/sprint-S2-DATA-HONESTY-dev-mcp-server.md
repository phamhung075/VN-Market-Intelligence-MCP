# Decision Journal — Sprint S2-DATA-HONESTY · dev-mcp-server

**Sprint goal:** Data honesty — surface real pipeline state, not badge-green proxy metrics
**Agent:** dev-mcp-server
**Started:** 2026-06-27T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-27T07:35:00Z
**task-id:** FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP
**what-done:** Added `refine_pending` counter to `fetchStatusHandler.ts` `BctcQueueCounts` to expose refine-layer stall state in the `/api/fetch-status` endpoint.
**what-considered:**
- Option A: Fix at DISCOVER layer (PO hypothesis) — ruled out; recon proved filings were already discovered/pulled.
- Option B: Expose refine stall in existing monitoring endpoint — chosen; minimum-footprint truth fix.
- Option C: Trigger fleet-cron re-run — operational, not code; separate action outside this zone.
**why-decision:** Root cause was false-green in `queryBctcCounts()`: it only read `bctc_vps_queue` (both HPG+ACV = 'done') and never checked `financial_reports.refine_status`; adding one SELECT surfaces the real 47-report stall.
**why-change:** PO hypothesis said DISCOVER layer defect; recon disproved — actual gap is REFINE layer stall post June-7 fleet-cron halt.
