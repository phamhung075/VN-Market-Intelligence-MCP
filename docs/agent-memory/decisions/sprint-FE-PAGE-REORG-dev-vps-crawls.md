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

---

### STEP qa-S1 · qa · 2026-06-16T00:00:00Z
**task-id:** FIX-BCTC-SSC-503-RETRY
**what-done:** QA gate review of commit 6da9b030 (vps-scripts/discover-bctc-urls-browser.py +81/-5 + decision journal).
**what-considered:**
- G1 transient-vs-terminal classification: _is_transient_error() verified by live module import — 503/500→True, 404/403→False, ConnectionResetError/TimeoutError/URLError("timed out")→True, ValueError→False. Clean-200 never enters exception handler (break fires on success). Loop range(2): attempt 1 fails any error → hits return None (retry-exhausted path). Bound: max 60s added to 1 ticker × 1 retry, far below 6h cycle budget.
- G2 NO-FAKE-DATA: _ssc_parse_rows not touched (confirmed via git diff + grep). 0-results/non-filing → return None unchanged. Retry-exhausted → return None. No placeholder URL list fabricated anywhere.
- G3 TEST-PERSISTENCE: vps-scripts/ HAS an existing pytest harness (test_discover_bctc_title_classifier.py, 27 tests). The new _is_transient_error() function is a pure classifier with no I/O (zero network, zero sleep in isolation) — highly testable. Agent ran 23 simulation tests locally but did NOT commit them. Given the existing convention (pytest file in vps-scripts/), a test for the new classifier IS warranted.
- G4 py_compile + import-safety: py_compile OK, `import time` present at L72, _ssc_make_opener at L683 (no NameError on retry rebuild), existing 27-test suite 27/27 PASS after the change.
**why-decision:** CHANGES_REQUESTED on G3 only. The vps-scripts/ directory has an established pytest convention and _is_transient_error() is trivially unit-testable (pure function, no network). The 23 simulation tests exist but are uncommitted — they must be persisted in test_discover_bctc_title_classifier.py (or a sibling file) to satisfy the repo's test-persistence contract. G1/G2/G4 all PASS. The fix itself is correct and bounded.
**why-change:** test-persistence gap only; no production code defect found.
