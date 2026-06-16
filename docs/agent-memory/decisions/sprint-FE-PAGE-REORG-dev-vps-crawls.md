# Decision Journal — Sprint FE-PAGE-REORG · dev-vps-crawls

**Sprint goal:** FE-PAGE-REORG (active)
**Agent:** dev-vps-crawls
**Started:** 2026-06-16T00:00:00Z

---

### STEP dev-vps-crawls-S1 · dev-vps-crawls · 2026-06-16T00:00:00Z
**task-id:** FIX-BCTC-SSC-503-RETRY
**what-done:** Added `_is_transient_error()` classifier + 1×60s retry loop to `_ssc_curl_search()` Step 1 GET in `vps-scripts/discover-bctc-urls-browser.py`.
**what-considered:**
- Retry on ALL exception types (over-broad: would retry 404/403 terminal errors, fabricating non-honest skip)
- Retry only on 5xx HTTPError + transient URLError sub-types (chosen: precise, generic, no per-ticker branching)
- Add retry to Steps 2/3 as well (out of scope: recon identifies only Step 1 503 as the burn point; adding retries further downstream adds cycle budget risk without evidence of need)
**why-decision:** Recon confirmed 503 is a scheduled maintenance window at ~12:00Z UTC; only Step 1 is affected (server down = session GET fails before any ticker-specific logic); classifier keeps 4xx terminal = return None immediately (honest non-filing preserved); 1×60s is within cycle budget
**why-change:** no change from plan
