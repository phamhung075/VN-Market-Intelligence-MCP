# dev-mcp-server -- Notebook

## 2026-06-09 · BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE — REVIEW

**Task:** BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE | Sprint: CI-RED-RECONCILE | Size: M | DJ: dev-mcp-server-S23
**Root cause:** InMemoryTransport+Client ~5000ms timeout on Bun 1.3.13/Ubuntu CI. 3 test files: MSG-1-market-foreign-flow, RAPID-A-get-company-profile-tool, RAPID-H-insider-lookback. Rewired to `_registeredTools` direct handler. 20 total tests all pass. tsc CLEAN. projected_delta -15.
**Status:** REVIEW — router owns push + CI gate.

---

## 2026-06-10 · BPE-DEV-2 — REVIEW

**Task:** BPE-DEV-2 | Sprint: BCTC-PROSE-EXTRACT | Size: M | DJ: dev-mcp-server-S27
**Scope:** Serving layer — bctcInspectHandler + bctcFullTools prose extension.
**Fix:** bctcInspectHandler L511-591: page_type filter changed from `= 'table'` to `IN ('table', 'prose')`. EC-1 guard: empty prose stitched_markdown falls through to pdf_extracted_text fallback (pek_coverage_gap:true). New semantics: gap=true means "no content of either type." bctcFullTools: added ProseSectionEntry interface + prose_sections[] to BctcStructuredData; new query on bctc_layout_units (quarantine=0, stitched_markdown != '', sorted by page asc); 4000-char cap per unit with prose_truncated flag (RISK-6).
**Tests:** 12 new (PROSE-UNIT-SERVE.test.ts) + 59 pass on 5 affected files. tsc CLEAN. tools=157. sched=78.
**Commit:** 5cea706a. REBUILD REQUIRED before live.

---

## 2026-06-11 · REAUDIT-001 — Fix reputation trend always stable — DONE

**Task:** REAUDIT-001 | Sprint: SHIP-WAVE-REAUDIT | Priority: CRITICAL | Zone: apps/mcp-server/
**Root cause:** reputationComputeJob computed priorDate=today-7d and called getReputation(db,code,priorDate) with WHERE date=? exact match. Production rows land at irregular intervals (3-7d gaps) so lookup always returned null → priorScore=undefined → trend="stable" for 100% of 235 rows.
**Fix 1 (reputationStore.ts):** Added getReputationPrior(db,code,beforeDate) — WHERE code=? AND date < ? ORDER BY date DESC LIMIT 1. Parameterized SQL. Returns ReputationScore|null.
**Fix 2 (reputationComputeJob.ts):** Removed priorDate offset calc. Replaced getReputation(db,code,priorDate) with getReputationPrior(db,code,today). Import updated. Comment explains why.
**Tests:** 9 new TCs in 1922d-reputation-compute.test.ts — getReputationPrior: empty-DB null, single-row, row-ON-threshold=null, multi-row-gaps-returns-most-recent, ticker-scope. runReputationComputeJob end-to-end: prior=40+no-data=improving; 100%-neg+prior=50=deteriorating.
**Results:** 81 pass / 0 fail (4 reputation test files). tsc --noEmit exit 0. toolCount=157. schedulerCount=78.
**QA timing:** trend values update only on next 08:30 UTC cron run after ops rebuild. VCB series (62.5→45→64→58→66) should yield non-stable trends.
**Commit:** b9f003ab
**Zone health:** bun test 81/0 scoped | tsc exit 0 | 157 tools intact | 78 cron.schedule | HEALTHY
