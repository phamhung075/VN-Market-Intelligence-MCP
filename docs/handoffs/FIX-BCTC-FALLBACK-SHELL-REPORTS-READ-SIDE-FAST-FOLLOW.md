---
sprint: FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE
branch: fix/bctc-fallback-shell-extraction-read
size: M
zone: apps/mcp-server/
depends_on: ["FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write"]
blocks: []
---

## TLDR

Apply the identical format-to-existence validation correction (isValidUuid → DB lookup) to ~14 read-side call sites across the BCTC inspection, correction, and eval toolchain. This unblocks human and agent access to the newly-writable fallback-shell data. **Sequenced after write-side fix is verified live** to keep verification gates crisp.

## [PM] Planning Context

- **Zone:** apps/mcp-server/ (interface, service, routes layers)
- **Priority:** P1 (read-side data is stranded without this, but gated until write-side proves stable)

- **Acceptance Criteria:**
  - [ ] ~14 call sites replaced (list below) with identical existence-check pattern as write-side fix
  - [ ] All affected read-side handlers/services maintain backwards compat with real UUID report_ids (no regression)
  - [ ] Test coverage updated for each modified file: new case seeding fallback- ID, pushing data, then reading via the inspected path
  - [ ] MCP tools affected (`get_bctc_page_text`, `get_bctc_page_image`, bctc-inspect UI, correction submission, eval recompute) all green on fallback- ID inputs
  - [ ] Live verification (post-deploy): retrieve layout/table data written by write-side fix using inspection tools with fallback- report_ids

- **Call sites to fix** (grep results, ~14 total):

  1. **bctcInspectHandler.ts** (6 call sites):
     - L~85 (doc-detail lookup)
     - L~145 (page-text lookup)
     - L~165 (page-image lookup)
     - L~185 (zone-detail lookup)
     - L~205 (balance-check lookup)
     - L~225 (table-row lookup)
     (These ARE the actual surface behind `get_bctc_page_text`, `get_bctc_page_image` MCP tools and `/api/bctc-inspect` UI)

  2. **bctcCorrectHandler.ts** (1 call site):
     - L~75 (report lookup before accepting correction submission)

  3. **bctcConfirmHandler.ts** (2 call sites):
     - L~60, L~80 (report lookups)

  4. **bctcEvalPushStageHandler.ts** (1 call site):
     - L~50 (eval-stage push gate)

  5. **bctcInspectMdHandler.ts** (1 call site):
     - L~40 (markdown-table inspection)

  6. **bctcFlagsHandler.ts** (1 call site):
     - L~35 (flag-update gate)

  7. **bctcEvalDetailHandler.ts** (1 call site):
     - L~70 (eval detail lookup)

  8. **bctcEvalRecomputeHandler.ts** (1 call site):
     - L~85 (recompute trigger gate)

  9. **bctcEvalPageHandler.ts** (1 call site):
     - L~95 (page-level eval lookup)

  10. **bctcBatchTableBackfillJob.ts** (1 call site):
      - L~44 (local isValidUuid copy, same pattern as bctcInspectHandler)

  11. **bctcCorrectionService.ts** (1 call site):
      - L~71 (local isValidUuid copy, same pattern)

  (Note: Exact line numbers are from architect brief; use semble-search to confirm current lines in live codebase.)

- **Files to read first:**
  - docs/architecture-briefs/2026-08-05-fix-bctc-fallback-shell-reports-structurally-unextractable.md § 5 (Fast-follow detail)
  - Output of write-side task's verification gate (await completion of prior task)

- **Dependencies:** FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write (write-side fix must be verified live first; prevents validation-gate interference)

- **Knowledge needed:**
  - Same as write-side: docs/policies/dev-standards.md + architecture brief
  - Code patterns already in place from write-side fix (same validation shape)

## Implementation Notes

### Pattern (identical to write-side, applied 14 more times)

Replace:
```ts
if (typeof reportId !== "string" || !isValidUuid(reportId)) {
  // error response
}
```

With:
```ts
if (typeof reportId !== "string" || reportId.length === 0) {
  // error response (adjusted message)
}
const knownReport = db.prepare("SELECT 1 FROM financial_reports WHERE id = ?").get(reportId);
if (!knownReport) {
  // error response
}
```

**Note:** Some files have local copies of `isValidUuid()` (bctcBatchTableBackfillJob.ts, bctcCorrectionService.ts). DO NOT remove the local copy — just replace its call sites. The shared `isValidUuid()` from bctcInspectHandler.ts will remain untouched (still used correctly elsewhere).

### Why NOT bundled with write-side fix

- Write-side fix (3 files, push handlers) is immediately verifiable: push payload lands or doesn't (binary, live proof in 72h)
- Read-side fix (14 files, inspection/correction/eval) is only meaningful AFTER write-side succeeds (data must exist first)
- Bundling would blur verification: is a 400-on-read because code failed, or because write-side wasn't ready? Sequential order keeps causality crisp.
- Write-side is higher-risk (PEK pipeline depends on it); read-side is lower-risk (optional feature enablement)

## Verification Gate

Live probe post-deploy (must have passed write-side AC-2 verification first):
```bash
# Pick a fallback- report_id known to have written layout_units / table_rows via write-side task
fallback_id="fallback-VND-2023-Q4"  # example

# Inspect layout via the tool surface:
curl http://mcp-server:3000/api/bctc-inspect?report_id=$fallback_id
# Must 200, not 400

# Retrieve page text:
# (via MCP tool get_bctc_page_text with report_id=$fallback_id)
# Must succeed, not 400
```

---

**Scope:** Read-side validation gates only. The agent-facing refine toolchain (pushBctcRefinedUnitTool, finalizeBctcRefineTool, backfillBctcScalarsTool) carries NO isValidUuid gate — already format-agnostic, requires zero changes.
