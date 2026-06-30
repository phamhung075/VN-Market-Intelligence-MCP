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
