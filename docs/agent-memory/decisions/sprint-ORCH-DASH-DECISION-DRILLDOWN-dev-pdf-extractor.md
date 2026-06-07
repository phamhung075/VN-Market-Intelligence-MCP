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
