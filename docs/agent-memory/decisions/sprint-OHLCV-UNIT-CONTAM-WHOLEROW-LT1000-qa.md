# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · qa

**Sprint goal:** Eliminate the 2nd daily_ohlcv unit-contamination class (whole-row thousands-format, close<1000) degrading public RS/ROC/52w cards; harden the writer so residue cannot re-accumulate.
**Agent:** qa
**Started:** 2026-06-30T22:58:00Z

---

### STEP qa-S1 · qa · 2026-06-30T22:58:00Z
**task-id:** CONTAM-10-MIGRATION
**what-done:** Ran bun test on CONTAM-10 suite (22 pass / 0 fail, exit 0, no Bun JIT crash); verified all 6 design-contract items against source; APPROVED.
**what-considered:**
- Trust developer 22/0 badge without re-running — REJECTED: task prompt mandates independent ground-truth gate.
- CHANGES_REQUESTED on "2 files" bun anomaly — REJECTED: 22 tests are all in 1 test file; "2 files" = bun counting test file + migration source; assertions 22/0 is authoritative.
**why-decision:** All 6 design-contract criteria verified green (per-ticker anchor, INDEX_TICKERS exclusion in both CTEs, INNER JOIN no-anchor skip, all-4-field UPDATE, safety rails complete, CANONICAL pointer present); CONTAM-10-EXEC unblocked.
**why-change:** No change from plan — green gate proceeds to APPROVED.

---

### STEP qa-S2 · qa · 2026-07-01T00:17:00Z
**task-id:** CONTAM-10-SANITY
**what-done:** Verified Pass-4 detection code (commit dbaa318d) in ohlcvSanityCheckJob.ts + test file. Ran 11/11 pass4 suite green; full mcp-server suite 14111/0 exit 0; tsc 0 errors. Detection-only grep: zero SQL UPDATE/INSERT/DELETE targeting daily_ohlcv in Pass-4 diff (only grep hits were in commit message text). INDEX_TICKERS reused via spread for SQL IN-list and .has() for per-row check — no second Set literal. Deployed container Up+healthy, `whole_row_lt1000_scale` flag string confirmed in /app/src/. APPROVED.
**what-considered:**
- Bun post-completion C++ crash (after 14111 tests, exit 0) — diagnosed as known Bun JIT bug, not a test failure; exit code 0 is authoritative; crash happens after reporting phase completes.
- "~84/84" zone count in task brief vs 115/0 in OHLCV sanity zone (8 files) vs 14111/0 full suite — the "~84" was a pre-addition estimate; actual zone count is 115/0, full count is 14111/0; both green.
- Detection-only grep output had 2 hits — both in commit message section (word "updated"), not in code diff; confirmed zero code-level UPDATE/INSERT/DELETE statements targeting daily_ohlcv.
**why-decision:** All 6 AC checks green: (1) 11/11 pass4 + 14111/0 full suite + tsc 0; (2) detection-only confirmed; (3) INDEX_TICKERS reused, no dup; (4) firing predicate correct via ROW_NUMBER() anchor map; (5) DDD+security clean, mock-guard PASS; (6) deployed image carries Pass-4 code.
**why-change:** No change from plan — APPROVED.
