# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · dev-pdf-extractor

**Sprint goal:** Dashboard decision drilldown
**Agent:** dev-pdf-extractor
**Started:** 2026-06-07T21:30:00Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-06-07T21:30:00Z
**task-id:** FIX-PDFX-PUSH-CLIENTS-ASYNC-URLOPEN
**what-done:** Wrapped sync urllib.request.urlopen in asyncio.to_thread(_do_request) in layout_first_push_client.py, md_table_push_client.py, eval_push_client.py; added 3 nonblocking unit tests.
**what-considered:**
- asyncio.to_thread (stdlib, Python 3.9+, matches table_push_client.py pattern already in use)
- aiohttp replacement (rejected: AC-LFE-8 forbids aiohttp import; breaks constraint)
**why-decision:** asyncio.to_thread is the established in-repo pattern; mirrors the already-fixed TablePushClient; zero new dependencies; eval_push_client has no try/except wrapper so _do_request wraps the raw with block; all 3 tests TC-PUSH-LF-1/MD-1/EVAL-1 GREEN.
**why-change:** no change from plan

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-06-08T01:27:00Z
**task-id:** PDFX-SINGLE-WORKER-BLOCKING
**what-done:** Replaced asyncio.to_thread() with ProcessPoolExecutor(max_workers=1) for OCR path in ExtractTablesUseCase.
**what-considered:**
- Option A: multiple uvicorn workers (--workers 2) — quick but doesn't fix root cause
- Option B: ProcessPoolExecutor — OS-level process isolation, definitive fix
- Option C: bump healthcheck timeout only — mitigation, no root-cause fix
**why-decision:** ProcessPoolExecutor puts OCR in a separate OS process; OS schedules uvicorn independently even at 100% CPU saturation. Timeout bump added as safety margin.
**why-change:** Previous asyncio.to_thread() fix ran OCR in a thread inside the same process — still competed for OS scheduling slot when CPU was saturated.
### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-06-08T01:25:00Z
**task-id:** FIX-PDF-EXTRACTOR-UNHEALTHY
**what-done:** Diagnosed 3rd A-20 recurrence; confirmed ProcessPoolExecutor fix present but bypassed by 1-core cgroup limit; executed scoped restart; dropped architect escalation signal; blocked on code fix per RECURRING-BUG rule.
**what-considered:**
- Write patch 3: raise cpus in docker-compose (fast but RECURRING-BUG rule forbids; architect must own this)
- Restart blind without diagnosis (forbidden by task spec)
- Rebuild container (unnecessary — code has fix; issue is resource limits not code)
- Only: RECURRING-BUG rule fires at 3rd recurrence → no code fix, escalate only
**why-decision:** RECURRING-BUG rule: same A-20 class 3 times → architect design review mandatory. Root cause (1-CPU cgroup starves uvicorn when Tesseract child saturates quota) requires architectural decision (cpus raise vs sidecar vs healthcheck gate), not another patch.
**why-change:** Container restart is operational recovery (unblocks BCTC batch). No code change made.

---

### DJ-GATE-1 · dev-pdf-extractor · 2026-06-08T15:45:00Z
**task-id:** FIX-PDF-EXTRACTOR-UNHEALTHY (re-scoped: data-ingest probe)
**what-done:** Raw-probed live bctc_vps_queue + financial_reports + VPS bctc-cache + mcp-server logs. Determined root cause of BCTC staleness. Emitted zone_missing_tier3 signal to dev-mcp-server.

**live queue breakdown (2026-06-08T15:40Z):**
- `deferred_infra`: 328 rows (17h–644h old) — design-excluded, historical HIST-VPS-BACKFILL rows, sources geo-dead. SYSTEM-AUDITOR B-13 classification CORRECT for these.
- `done`: 48 rows
- `url_not_found`: 27 rows
- `pending`: 26 rows (475h–934h old)
  - 8 rows: null source_url (ACV, BDI, DAG, DLC, JSH, SIS, VDC, VNH) — VPS discovery returns 0 results (PDFs not yet published by companies or not discoverable via HNX/SSC)
  - 18 rows: placeholder VPS source_url (`http://125.212.251.27:8765/bctc-files/<TICKER>/<TICKER>_2026_Q1.pdf`) — set by `backfillBctcQ12026.ts`; VPS bctc-cache returns 404 for ALL because the files were never populated with canonical names; attempts range 0–435

**financial_reports freshness:**
- Latest `parsed_at`: 2026-06-08T02:15:48.712Z (~33 min stale at time of probe — NOT 38.5h stale)
- Last rows TODAY: KDC Q1 2026, NVL Q1 2026, NVL Q4 2025, CTG Q1 2026, REE Q1 2026
- The system-auditor "last fetch 2026-06-06T01:55Z" claim was stale at the time the auditor ran; the pipeline had been active today. Staleness claim was based on a snapshot taken before today's batch processed.

**root cause of "26 pending rows not draining":**
The 26 pending rows split into two failure modes, BOTH upstream of pdf-extractor:
1. **8 null-url rows (ACV/BDI/DAG/DLC/JSH/SIS/VDC/VNH):** PDFs genuinely not published yet. VPS `fetch-bctc.sh` ran at 11:48Z, found no PDFs. SSC/HNX/UPCOM returned 0 matches for Q1 2026. This is a CONTENT availability issue — not a pipeline bug.
2. **18 placeholder-url rows (VNM/VEA/SHB/HUT/DIG/DXG/KDH/PDR/MSN/FRT/SAB/VIX/VND/DGC/VJC/GEX/BSR/DBC):** `backfillBctcQ12026.ts` inserted placeholder URLs (`VNM_2026_Q1.pdf`) that the VPS `bctcPdfPullJob` tries to fetch — but VPS bctc-cache never stores files with canonical names (it stores original discovery names like `20260422-ACB-BCTC-...pdf`). The pull job attempts 429–435 times and always gets HTTP 404. Root fix: either (a) bctcQueueEnricherJob should OVERWRITE the placeholder URL with a real discovered URL, or (b) backfillBctcQ12026 should insert NULL source_url so the enricher can populate it. The enricher's WHERE clause `source_url IS NULL OR source_url = 'MISSING' OR source_url LIKE '/test-%'` does NOT match the placeholder VPS URLs — so it skips them, and the pull job keeps retrying 404s forever.

**why not pdf-extractor zone:**
Neither failure mode is in `apps/pdf-extractor/`. No PDF reaches the extractor for these 26 rows. The issue is:
- VPS content availability (companies haven't published) → no fix possible
- bctcQueueEnricherJob WHERE clause misses placeholder-URL rows → `apps/mcp-server/` fix needed
- backfillBctcQ12026 inserts placeholder URLs instead of NULL → `apps/mcp-server/` fix needed

**decision:** BCTC ingest is NOT completely stale — it processed 5 reports TODAY. The 26 pending rows are blocked upstream (content not available OR mcp-server enricher bug). Root cause definitif is in `apps/mcp-server/` (bctcQueueEnricherJob WHERE clause + backfill placeholder URL design). Emitting zone_missing_tier3 signal to po for re-route to dev-mcp-server.
**why-change:** No change from assessment. pdf-extractor zone has no actionable fix.
