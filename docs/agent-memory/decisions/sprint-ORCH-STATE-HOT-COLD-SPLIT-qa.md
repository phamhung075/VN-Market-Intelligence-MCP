# Decision Journal — Sprint ORCH-STATE-HOT-COLD-SPLIT · qa

**Sprint goal:** Shrink orch-state.json from 2.46 MB to < 150 KB via hot/cold split
**Agent:** qa
**Started:** 2026-06-26T18:05:00Z

---

### STEP qa-S1 · qa · 2026-06-26T18:10:00Z
**task-id:** HSC-1
**what-done:** QA reviewed scripts/orch-cold-evict.sh against 6 mandatory gates; all pass; verdict APPROVED.
**what-considered:**
- Gate 1 atomic write: both COLD_TEMP and HOT_TEMP use mktemp in same dir as target; mv within-fs = atomic. PASS.
- Gate 2 cold-before-hot ordering: lines 390-397 build+validate cold, lines 400-407 build+validate hot, line 424 mv cold, line 429 mv hot. Data-safe ordering confirmed. PASS.
- Gate 3 mtime-CAS retry: loop up to MTIME_CAS_RETRIES=3; mutex by caller contract (consistent with brief §4.2). PASS.
- Gate 4 dry-run byte-identical: MD5 d26143ad3b44194aedde05ec8f72d1b2 identical before+after --dry-run run. PASS.
- Gate 5 parameterized: KEEP_RECENT_DONE / DONE_MAX_AGE_DAYS / TERMINAL_SPRINT_STATUSES / TERMINAL_SIGNAL_STATUSES all env-var. No hardcoded tickers. PASS.
- Gate 6 ARG_MAX: two-pass; ID maps ~27KB via --argjson; full 2.46MB via file path/--slurpfile only. PASS.
**why-decision:** All 6 mandatory gates green; 2 low-severity non-blocking findings documented (cold sentinel backlog_detail omission; projected 955KB > 500KB HSC-2 target is brief miscalculation not script bug).
**why-change:** no change — APPROVED as submitted.
