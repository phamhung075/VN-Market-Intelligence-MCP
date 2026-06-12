# Decision Journal — Sprint BCTC-ANALYTICS-LAYER · qa

**Sprint goal:** BCTC analytics layer quality — fix refine/finalize state machine deadlock + confidence + targeting
**Agent:** qa
**Started:** 2026-06-13T00:00:00Z

---

### STEP qa-S1 · qa · 2026-06-13T00:00:00Z
**task-id:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE
**what-done:** QA review of commit c38c76e6 — BLOCK-5 confidence recompute in finalizeBctcRefineTool.ts.
**what-considered:** G1 live finalize call; G2 DB query post-finalize; G3 get_bctc_full PUB-5 gate; G4 VNM raise-only proof; G5 code diff review; G6 targeted test suites.
**why-decision:** APPROVED. All 6 gates green. G1: BLOCK-5 fired (old=0.375, new=0.6, hasBalanceSheet+hasCashFlow but not hasIncomeStatement — ACB is bank with 2 sections present). G2: DB confirms 0.6. G3: get_bctc_full(ACB) returns real financial data (Net Revenue 6,989 tỷ, Net Profit 4,320 tỷ); PUB-5 no longer blocking. G4: VNM=0.9375 unchanged. G5: generic mechanism (no hardcode), parameterized SQL, raise-only guard exact per AC-2-3. G6: DE2=7/0, AR=20/0, FU-6f=8/0; tsc clean. BCTC eval=yellow (non-blocking per flow gate). Note: ACB ended at 0.6 not 1.0 because income_statement section missing (bank-specific) — this is correct behavior, not a regression.
**why-change:** Only path: all checks green.
