# Decision Journal — Sprint FIX-BCTC-BANK-BS-SECTION-CLASSIFIER · qa

**Sprint goal:** Confirm the bank BS section-classifier fix (commit 2c7fb5b0) behaves correctly on real data via the now-deployed live mcp-server, closing the deploy-gated behavioral DoD withheld from done_verified.
**Agent:** qa
**Started:** 2026-07-03T06:10:00Z

---

### STEP qa-S1 · qa · 2026-07-03T06:10:00Z
**task-id:** FIX-BCTC-BANK-BS-SECTION-CLASSIFIER
**what-done:** Confirmed deploy claim (image a169f5e2b7e2 running, built 2026-07-03T06:38 CEST = 04:38Z; `git merge-base --is-ancestor 2c7fb5b08 HEAD` = true; commit timestamps bracket the build). Gateway MCP tool unavailable in this sub-session (INV-GATEWAY-1, confirmed empirically — no `mcp__gateway__*` tool registered) — substituted direct HTTP JSON-RPC to the live mcp-server (`POST localhost:3000/mcp`, the same running container, `tools/list`/`tools/call`), the closest available equivalent to the mandated gateway path. Baseline `get_financial_summary(CTG,2026,Q1)` = CORRUPT/total_assets=0. Called `finalize_bctc_refine(report_id=96e36139-5dac-414d-8e4d-20a4725890d1, report_status=PARTIAL)` on the real, already-DONE (56/56 units) refined markdown for the exact report named throughout the sprint as the defect case — ok:true, rows_parsed 440→451 (11 more real rows recovered, consistent with the RC-1/RC-2 fixes). Post-call `get_financial_summary` UNCHANGED: still CORRUPT/total_assets=0.
**what-considered:**
- Re-running finalize on CTG (the real defect case, already fully refined) vs. a synthetic/other-ticker probe: CTG was chosen because it is literally the DoD target and finalize is designed idempotent/re-runnable (safe to invoke on already-DONE data); a fresh non-bank probe would not exercise the classifier fix at all.
- Investigated root cause via docker logs (`docker logs`, read-only, not `exec`) — found "[finalize_bctc_refine] scalar backfill: no non-null scalars found" — every scalar (not just total_assets) resolved null, implying `isBankFormFromRows` likely classified this real row set as NON-bank, falling to a corporate code path CTG's real Roman-numeral bank form never satisfies.
- Cross-checked the 451 materialized rows via `GET /api/bctc-inspect/table/{doc_id}` (read-only REST): zero rows contain "Tổng tài sản"/"Tổng nợ phải trả"/"Vốn chủ sở hữu" (the exact DoD-target grand-total labels) anywhere in the report; a DIFFERENT, unrelated pair ("Tổng tài sản"=119,220,360 / "Tổng nợ phải trả"=52,351,162, page 56 notes-schedule table) exists but is not the primary balance sheet. Several rows also show code/label/value column misalignment (e.g. page 45 equity-movement table) — additional real-world parsing defects outside RC-1/RC-2/RC-3's fixed scope.
**why-decision:** The unit-test fixture (13/13, synthetic-but-DoD-number-accurate per the test's own docblock: "this repo has no live-DB access path for this worker... the real transcribed markdown text is not reproduced verbatim") does NOT reproduce the real CTG document's actual structural complexity (62 pages, multiple table shapes, notes/schedule pages). On genuinely real data the fix measurably improves row recovery (440→451) but does NOT achieve the behavioral DoD (CTG total_assets unfreeze) — verdict is FAIL, not done_verified. Board left in REVIEW with FAIL evidence, routed back to dev-mcp-server (zone owner) rather than promoted.
**why-change:** Diverges from the router's expectation (deploy-gate-cleared ⇒ done_verified) — the deploy IS live and the CODE-level gate remains valid (APPROVE-CODE unchanged), but the behavioral DoD itself fails on real data. This is exactly the gap the deploy-gated DoD was designed to catch.

### STEP qa-S2 · qa · 2026-07-03T06:10:00Z
**task-id:** FIX-BCTC-BANK-BS-SECTION-CLASSIFIER
**what-done:** Documenting the live-data side effect for traceability: my `finalize_bctc_refine` call DELETE+INSERT'd `bctc_table_rows` for report_id 96e36139 (440→451 rows) and refreshed `refine_status`/ratio/validation_status housekeeping fields (BLOCK-3/BLOCK-4/BLOCK-5) — it did NOT change any `financial_reports` scalar column (total_assets/total_liabilities/equity_total all stayed at their prior frozen values, confirmed identical pre/post via `get_financial_summary`). Live-served behavior for CTG 2026-Q1 is unchanged (still the honest CORRUPT-DATA guard, not silently wrong).
**what-considered:**
- only path: this was the minimum action needed to produce genuine real-data behavioral evidence; no destructive/irreversible change occurred (scalars untouched, guard still correctly refuses to serve corrupt data).
**why-decision:** transparency — anyone reading `bctc_table_rows` row-count history for this report_id later should know a QA-triggered re-finalize (not a silent drift) explains the 440→451 delta.
**why-change:** no change from plan.
