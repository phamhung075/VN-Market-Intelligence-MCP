# [QA] Review Record — BCTC-AGENTIC-REFINE

**Sprint:** BCTC-AGENTIC-REFINE  
**QA agent:** qa (claude-sonnet-4-6)  
**Date:** 2026-05-30  
**Commits reviewed:** d854e8ff (AR-AGENT-A) · 423a901e (AR-PDF) · 76a3b8d2 (AR-MCP) · 0a16fd6f (AR-AGENT-B)  
**Off-HOSE:** Sat 2026-05-30 — weekend, ban does not apply. Extraction permitted.

---

## STATUS: CHANGES_REQUESTED

**Blocking issue count: 1 (SCHEDULER-WIRING GAP)**  
**Advisory items: 1 (BAKE-OFF deferred)**

---

## Per-Criterion Verdict

### Criterion 1 — Bake-off on FPT + ACB (DEFERRED / N/A at this stage)

**PASS-CONDITIONAL**

The bake-off (numeric agreement, table-boundary correctness, Vietnamese trust prefixes) requires a LIVE refine run against FPT and ACB PDFs. This run cannot happen until the scheduler is wired (the blocking issue below) or AR-OPS provides the POST /api/refine-bctc/{report_id} manual trigger plus the Docker volume mount. The criterion is architecturally satisfied — the full refine path (Phase 0→4, fan-out, collect-then-write, parser with trust flags) is implemented and unit-tested. QA records this as PENDING: bake-off must be confirmed by AR-OPS after container rebuild and volume mount. The promotion gate is not falsely cleared here.

Evidence: bctcRefineJob.ts implements full fan-out orchestration per §0.6. refinedMarkdownParser.ts encodes all three trust-flag tiers (red 0.2 / yellow 0.4 / clean 1.0). continuation-stitch sub-flow and FPT [22,23] test both present.

### Criterion 2 — Numeric honesty: balance check FORBIDDEN as sole gate

**PASS**

Evidence:
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` — trust flag parsing fires BEFORE balance logic. Balance check is a catch-net recorded in flags, never overrides source_confidence.
- `apps/mcp-server/src/__tests__/AR-parser-dv.test.ts` line 19 and line 309: "Balance badge FORBIDDEN as sole gate (never overrides trust flags)" — explicit test covering the forbidden case.
- Contract encoded verbatim in `docs/agents/refine_bctc_md/flow/table-page.md`: "Balance check (assets = liab + equity) is a catch-net ONLY. A passing balance does NOT clear a flagged number."
- Independent numeric-fidelity check: trust flags on cells (source_confidence 0.2 / 0.4) are the primary path; balance is supplementary catch-net per FR-13.

### Criterion 3 — Idempotency DV ≥3×: row count stable

**PASS**

Evidence:
- `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` — test runs `refineOneReport()` 5 times (all-DONE, all-DONE again, PARTIAL via injected mock, PARTIAL again, PARTIAL→DONE recovery). COUNT(*) asserted stable = `windows.length` after each run.
- Line 280-301: "DIRECT DB persistence verification: bctc_refined_units survives bun:sqlite re-read" — uses `new Database(":memory:")` pattern (bun:sqlite, NOT better-sqlite3, NOT `{create:false}`). This is the correct pattern per the non-negotiable.
- DELETE-then-INSERT transaction in Phase 4 of bctcRefineJob.ts covers all windows atomically. FPT-42-dupes guard satisfied.

### Criterion 4 — Readiness gate: IN_PROGRESS OCR → SKIP

**PASS**

Evidence:
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` line 464: `if (reportRow.text_status === "IN_PROGRESS" || reportRow.text_status === "PARTIAL") { logger.info(...skip...); return; }`
- `apps/mcp-server/src/__tests__/AR-refine-readiness-gate.test.ts` — AC-FR12-1 test: `text_status = IN_PROGRESS` → skips, no write to `bctc_refined_units`. Confirmed in 76 passing tests.

### Criterion 5 — Continuation: FPT span [22,23] → ONE unit, no double-emit

**PASS**

Evidence:
- `apps/mcp-server/src/__tests__/AR-refined-units-idempotency.test.ts` lines 310-331: "FPT span [22,23]: pages with continuation marker land in ONE window" — `partitionIntoWindows()` called with page 22 + 23 (page 23 has `tiếp theo` marker), asserts `window22.page_numbers.contains(23)`. Page 24 gets its own 1-page window.
- `docs/agents/refine_bctc_md/flow/continuation-stitch.md` — FPT [22,23] worked example included verbatim per AC-FR13 requirement.
- All 76 DV tests pass.

### Criterion 6 — Expert flow intact: get_bctc_full sources from refinedMarkdownParser

**PASS**

Evidence:
- AR-AGENT-B (commit 0a16fd6f): `docs/agents/bctc-analyst/init.md` model updated to `claude-sonnet-4-5`. `docs/agents/bctc-analyst/flow/deep-dive-opus.md` created with `model: claude-opus-4`. ESC-1..ESC-5 gate appended to `flow/main.md` (additions-only diff — zero modification to existing pass logic per AC-0.5-4).
- ESC-5 uses `get_bctc_refined` tool (#141) to read `bctc_refined_units.confidence`; graceful FALSE if no rows (AC-0.5-5 via Option B).
- The 6 standard passes in main.md are unchanged (git diff shows only appended lines after existing pass block).
- `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` Phase 4 calls `parseRefinedMarkdown()` to populate `bctc_table_rows`, which is the source for `get_bctc_full`.

### Criterion 7 — DV tests RED-before/GREEN-after in SAME commit as production code

**PASS**

Evidence:
- AR-MCP commit 76a3b8d2: 5 test files (AR-parser-dv, AR-page-classifier, AR-schema-migration, AR-refine-readiness-gate, AR-refined-units-idempotency) all land in the SAME commit as all production code (bctcRefineJob.ts, refinedMarkdownParser.ts, pageClassifier.ts, schema-financial-reports.ts, getBctcPageTextTool.ts, getBctcPageImageTool.ts, getBctcRefinedTool.ts).
- `apps/mcp-server/src/__tests__/AR-parser-dv.test.ts` line 5: `// These tests were written BEFORE the parser implementation (RED_BEFORE = true).` Line 8: `// RED_BEFORE = true` — guard comment present.
- AR-PDF commit 423a901e: test_page_rasterizer.py (11 tests) + test_ocr_text_source.py (13 tests) in same commit as production code.

### Criterion 8 — Frozen/pristine: PDF-Extract-Kit subtree, text_table_extractor.py, scoped commits, main branch

**PASS**

Evidence:
- `git -C apps/pdf-extractor/PDF-Extract-Kit diff | wc -l` = 0. Pristine confirmed.
- `git show 423a901e -- apps/pdf-extractor/infrastructure/text_table_extractor.py | wc -l` = 0. Zero-byte-diff confirmed.
- All 4 commits land on `main` branch.
- Commit messages use scoped format per commit-convention.md. No `-A` flag evidence in commit messages (each commit lists explicit files in its body).

---

## Extra Verification (a): LIVE-PATH CHECK — Inlined State Machine in unit_grouper.py

**VERDICT: PASS — dead code retained for legacy tests only; NOT on refine live path**

Detailed trace:

1. `bctcRefineJob.ts` (mcp-server) calls pdf-extractor via HTTP only: `GET /api/page-text` and `POST /api/rasterize`. It never invokes any Python grouper code directly.

2. `apps/pdf-extractor/interface/handlers.py` — the two new routes (`/api/rasterize`, `/api/page-text`) import only `page_rasterizer.py` and `ocr_text_source_factory.py`. No import of `unit_grouper` or `build_document_map`.

3. `apps/pdf-extractor/infrastructure/pek_engine_adapter.py` — grep for `unit_grouper` and `group_pages_into_units` returns 0 hits. The YOLO bbox grouping import was removed in AR-PDF.

4. `apps/pdf-extractor/application/extract_layout_first_usecase.py` — imports `build_document_map` from `generic_md_table_extractor.py` (NOT from `unit_grouper.py`). The `build_document_map` function path is the legacy PEK layout-first pipeline, NOT the refine pipeline.

5. `apps/pdf-extractor/infrastructure/unit_grouper.py` — file header declares it "compatibility shim" for backward compat with `test_unit_grouper.py`. Grep across all non-test Python files confirms `unit_grouper` is only referenced in its own file. No live production code imports it.

**Conclusion:** the inlined state machine in `unit_grouper.py` is reachable ONLY from `test_unit_grouper.py` and `test_document_map.py` (legacy tests for the document-map path, which is NOT the refine path). FR-14 VIOLATION does NOT exist. The refine live path (bctcRefineJob → /api/page-text + /api/rasterize → page_rasterizer.py + ocr_text_source_factory.py) is clean.

---

## Extra Verification (b): SCHEDULER-WIRING GAP — bctcRefineJob NOT wired in startScheduler.ts

**VERDICT: FAIL — RED flag. Pipeline DORMANT until AR-OPS wires the cron.**

Evidence:

- `apps/mcp-server/src/scheduler/cronConfig.ts` line 182: `bctcRefineJob: Bun.env.CRON_BCTC_REFINE_JOB ?? '0 9,14,20 * * *'` — key EXISTS in CRONS map.
- `apps/mcp-server/src/scheduler/startScheduler.ts` — full file read (957 lines). No `import` for `runBctcRefineJob` or any equivalent. No `cron.schedule(CRONS.bctcRefineJob, ...)` call anywhere. Confirmed: the key is defined in cronConfig.ts but the scheduler never calls it.
- Without this wiring, the refine pipeline is PERMANENTLY DORMANT in the deployed container. The on-demand `POST /api/refine-bctc/{report_id}` route (bctcRefineHandler.ts) works, but the automated cron (09:00, 14:00, 20:00 UTC) never fires.
- This is a BLOCKING issue for production operation. The entire refine pipeline is installed but never runs automatically.

**Required fix (AR-OPS):**
File: `apps/mcp-server/src/scheduler/startScheduler.ts`

Add import (alongside other bctc* imports, ~line 32):
```typescript
import { runBctcRefineJob } from './financial-reports/bctcRefineJob.js'
```

Add cron schedule (alongside other bctcEvalRecompute and bctcReparseJob registrations):
```typescript
// Sprint BCTC-AGENTIC-REFINE — Refine orchestrator (09:00, 14:00, 20:00 UTC)
// All three times verified outside 02:00-08:59 UTC Mon-Fri OFF-HOSE window.
cron.schedule(CRONS.bctcRefineJob, async () => {
  await jobRunRepo.wrapRun('bctcRefineJob', async () => {
    await runBctcRefineJob(db)
  })
}, { timezone: 'UTC' })
```

This wiring must be done by AR-OPS during the container rebuild.

---

## Test Run Summary

| Suite | Files | Tests | Pass | Fail |
|---|---|---|---|---|
| AR-parser-dv.test.ts | 1 | — | — | — |
| AR-page-classifier.test.ts | 1 | — | — | — |
| AR-schema-migration.test.ts | 1 | — | — | — |
| AR-refine-readiness-gate.test.ts | 1 | — | — | — |
| AR-refined-units-idempotency.test.ts | 1 | — | — | — |
| **AR DV total** | **5** | **76** | **76** | **0** |
| Full mcp-server suite | 941 | 10,192 | 10,192 | 0 |
| bun tsc --noEmit | — | — | 0 errors | — |
| DDD scan (domain→infra imports in new files) | — | — | PASS | — |
| Security scan (process.env, hardcoded secrets) | — | — | PASS (one `...process.env` spread in spawn() call is legitimate subprocess env inheritance, not secret leak) | — |

---

## Issues

### BLOCKING: startScheduler.ts:~line 32 + ~line 950 — bctcRefineJob not wired

File: `apps/mcp-server/src/scheduler/startScheduler.ts`
- Missing import: `runBctcRefineJob` from `./financial-reports/bctcRefineJob.js`
- Missing `cron.schedule(CRONS.bctcRefineJob, ...)` call
- Impact: refine pipeline DORMANT in production until this is added and container rebuilt

Fix: see Extra Verification (b) above for exact code to add.

---

## Advisory (non-blocking)

1. **Bake-off deferred (Criterion 1):** FPT + ACB live refine cannot run until Docker volume `bctc-page-images` is mounted (AR-OPS) AND scheduler is wired (or on-demand POST invoked). QA records the criterion as PENDING rather than failed — the architecture is sound. AR-OPS must confirm bake-off metrics post-rebuild.

2. **deep-dive-opus.md size note:** The file has a `# size-justification:` comment on line 2 (after the `---` frontmatter on line 1). Frontmatter IS on line 1 — this is compliant with the agent_frontmatter_line1 memory rule.

3. **process.env spread in bctcRefineJob.ts line 276:** Used in `spawn()` call to pass full environment to the claude CLI subprocess. This is correct (child process needs API keys and config from parent env). Not a secret leak — no hardcoded values.

---

## RETURN

```
STATUS: CHANGES_REQUESTED
BLOCKING ISSUES: 1
  - apps/mcp-server/src/scheduler/startScheduler.ts — missing import + cron.schedule(CRONS.bctcRefineJob, ...) call
    The refine pipeline is DORMANT without this wiring.

EXTRA VERIFICATION (a) LIVE-PATH CHECK: PASS
  unit_grouper.py inlined state machine is NOT on the live refine path.
  Only reachable from legacy tests (test_unit_grouper.py, test_document_map.py).
  FR-14 violation does NOT exist.

EXTRA VERIFICATION (b) SCHEDULER-WIRING GAP: FAIL (RED — blocking)
  startScheduler.ts has no import or cron.schedule for bctcRefineJob.
  cronConfig.ts key exists. Production pipeline is DORMANT until wired.

CRITERIA SUMMARY:
  C1 Bake-off:         PASS-CONDITIONAL (deferred to post-AR-OPS rebuild)
  C2 Numeric honesty:  PASS
  C3 Idempotency ≥3×:  PASS
  C4 Readiness gate:   PASS
  C5 Continuation:     PASS
  C6 Expert flow:      PASS
  C7 DV RED→GREEN:     PASS
  C8 Pristine/frozen:  PASS

NEXT: AR-OPS
  Action 1 (blocking fix): wire bctcRefineJob in startScheduler.ts (import + cron.schedule)
  Action 2 (was already planned): Docker volume bctc-page-images mount + env vars
  Action 3: rebuild container, verify cron fires at 09:00/14:00/20:00 UTC
  Action 4: run bake-off on FPT + ACB (POST /api/refine-bctc/{id}) and confirm numeric agreement
  Action 5: report bake-off metrics back to QA for Criterion 1 sign-off

HANDOFF: docs/handoffs/AR-QA-handoff.md
PIPELINE: continue → AR-OPS (fix startScheduler.ts wiring + volume + rebuild)
```
