## Task Report FIX-BCTC-BANK-BS-SECTION-CLASSIFIER

**Scope:** CODE sign-off only (PO decision, tick 2026-07-02T04:37Z). done_verified WITHHELD — live behavioral DoD gated on the user-approval mcp-server rebuild (batches with FIX-BCTC-ENRICHER-STUCK-BACKLOG).

**Commits reviewed:**
- `2c7fb5b0` — fix(mcp-server/bctc): B02a/TCTDHN bank-form balance-sheet section classifier
- `ff1bac44` — chore(dev-team/board): board flip in_progress→review

**Changed:**
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` +82/-8 — RC-1 (blank-Ma 3-cell row routing), RC-2 (content-based header/separator recovery via existing `isHeaderRow`), RC-3 (`initialSection` param + `finalSection` on `ParseResult`)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` +16/-1 — threads `finalSection` forward across `doneUnits` (ORDER BY unit_id ASC)
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` +12/-1 — sibling threading across `rawResults` (fixed-index order from `runBoundedPool`)
- `apps/mcp-server/src/__tests__/FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts` (new, 402L, 13 tests)
- `scripts/dev-mcp-server-fix-bctc-bs-section-classifier-flip.jq` (new, 47L) — idempotent, bound-`--arg`-only board-flip helper, routes through `orch-apply.sh`

**Tests (re-run independently, not taken on faith):**
- `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts`: 13 pass / 0 fail (52 expect calls) — RC-1/RC-2/RC-3 isolation + full B02a/TCTDHN 2-unit fixture through `aggregateScalars` (total_assets=2,924,176,928, total_liabilities=2,735,484,770, equity_total=188,692,158, identity exact, balanceViolation=null) + end-to-end `finalize_bctc_refine` integration (balance_sheet rows >0, general leakage=0, stale scalars unfrozen)
- Non-regression: 26-file direct-dependency set (every test file importing `refinedMarkdownParser`/`finalizeBctcRefineTool`/`bctcRefineJob`/`parseRefinedMarkdown`) — 356 pass / 0 fail (1399 expect calls), matches dev-mcp-server's claimed 356/356
- `bun tsc --noEmit`: 0 errors
- Note: task prompt referenced `TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD.test.ts` — confirmed via `git log`/`git status` this is a different, untracked file belonging to an unrelated (still-BLOCKED) sprint FIX-BCTC-BANK-SUMMARY-MAPPING, not part of commit `2c7fb5b0`. Ran the actual committed test file instead (name match confirmed against commit stat: 402 lines exact).

**DDD scan:** PASS — no `domain →` infrastructure/application imports in any touched production file. `refinedMarkdownParser.ts` (application/utils) has zero infra imports; `finalizeBctcRefineTool.ts` (interface) and `bctcRefineJob.ts` (scheduler) import infrastructure, which is normal for those layers.

**Security scan:** PASS — no `process.env` usage (one comment referencing the `Bun.env` convention, not a violation), no password/secret/token literals.

**mock-guard:** PASS — no fabricated-data patterns in the 4 modified/added production+test files.

**Ordering-assumption verification (regression-risk-specific):** Traced both callers' claims that DONE-unit order == page order:
- `windowPartitioner.ts:104` — `unit_id: unit-${String(windows.length).padStart(4,"0")}` — sequential, zero-padded → `ORDER BY unit_id ASC` (finalizeBctcRefineTool.ts) is lexicographically page-order-equivalent.
- `boundedPool.ts:38` — `results[index] = await fn(items[index])` — fixed-index array, not completion order → `bctcRefineJob.ts`'s filter-then-iterate over `rawResults` preserves page order.
Both hold; the RC-3 section-carry fix's ordering assumption is sound.

**Code quality:** Test fixtures are structurally-shaped synthetic reconstructions (Roman-numeral hierarchy, blank Ma column, dropped separator) pinned to the task's own DoD numbers — module docstring is explicit this is not verbatim live markdown (no live-DB access path for this worker). No per-ticker/date-literal hardcoding — all 3 fixes are shape-based (blank-cell detection, numeric-content detection, section-threading), applying uniformly to any bank-form report. No dead code introduced.

**verdict:** APPROVE-CODE (done_verified WITHHELD per PO scope — live CTG re-ingest unfreeze remains gated on the user-approval mcp-server rebuild)

### Board
`docs/data/orch/orch-state.json` `.task_board.review[]` row `id=FIX-BCTC-BANK-BS-SECTION-CLASSIFIER` — kept in `review[]` (not moved to `done[]`); fields set: `status_note="qa-approved-code; done_verified withheld pending deploy-gated behavioral DoD"`, `qa_verdict="APPROVE-CODE"`, `qa_at="2026-07-02T05:06:41Z"`.
