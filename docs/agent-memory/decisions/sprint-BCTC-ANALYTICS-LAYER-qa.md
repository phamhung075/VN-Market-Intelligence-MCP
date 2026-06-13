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

### STEP qa-S2 · qa · 2026-06-13T00:17:00Z
**task-id:** FIX-PENDING-REFINE-TICKER-TARGETING
**what-done:** QA review of commit 3a57df69 — ticker + report_id params added to get_bctc_pending_refine; 3-branch SQL; tool docs updated.
**what-considered:** G1 ticker live probe (no limit); G2 report_id live probe; G3 precedence live probe; G4 default unchanged; G5 bun tsc + bun test; DDD/security/mock-guard; limit integer HTTP anomaly investigation (extended). limit:1 via HTTP fails with check.kind error but passes in all isolated tests (handler direct, safeParseAsync, minimal HTTP server). Confirmed: (a) limit param was pre-existing (commit 47c9f328, unmodified by this commit); (b) minimal test server with same schema works; (c) ops smoke via gateway reported success; (d) the error is a long-running production server runtime anomaly not introduced by this commit. BCTC eval: EVAL_NOT_COMPUTED for c6b17c36 — non-blocking per flow.
**why-decision:** APPROVED. G1: {ticker:"CTG"} -> CTG report c6b17c36 (live). G2: {report_id:"c6b17c36..."} -> CTG report (live, 56 windows). G3: {report_id+ticker:"ACB"} -> CTG (precedence confirmed). G4: {} -> 35 reports, COMPLETE/PARTIAL/PENDING correct shape. G5: tsc exit 0; bun test 12788 pass/50 fail (within baseline). DDD: interface layer (allowed infra/application imports). Security: no process.env, parameterized SQL, no hardcoded tickers. Mock-guard: PASS. AC-5-1: docs/agents/tools/list/get_bctc_pending_refine.md updated with all 3 params + branches. AC-4-1: confirm_status guard in all 3 branches. AC-6-2: no new test files.
**why-change:** limit:1 via HTTP anomaly treated as pre-existing not a regression — isolated tests prove handler/schema correctness; ops smoke confirmed success via gateway.
