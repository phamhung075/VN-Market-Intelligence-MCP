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
