---
task_id: HC-ARCH
sprint: BCTC-HUMAN-CONFIRM
agent: architect
status: DONE
date: 2026-05-30
---

# HC-ARCH — Architect Handoff

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/` (primary — dev-mcp-server) + `docs/agents/refine_bctc_md/flow/main.md` (1 file — agent-father)
  - Multi-zone: PM must split into per-zone tasks. See §9 of brief.
- **BUILD-STANDARD:** lean (both zones have existing files; additive feature only)
- **BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`

### Verified paths:
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `bctc_table_rows` DDL confirmed (lines 103-120): NO `source_confidence` column. `financial_reports` has `refine_status` (line 439) and `text_status` (line 433); NO `confirm_status`. `bctc_human_corrections` table does NOT exist.
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` — `BctcTableRow.source_confidence` IS in the interface (line 32) and populated by `parseTrustFlag` — but `parseTrustFlag` is NOT exported (line 92). The INSERT in `finalizeBctcRefineTool.ts` (lines 143-165) omits `source_confidence` from the SQL — silent data loss. Both gaps are confirmed real gaps.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — Phase 4 DELETE on line 140 is `DELETE FROM bctc_table_rows WHERE report_id = ?` (unconditional). The correction-skip guard and selective delete are not present.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — no `confirm_status` filter exists.
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — `isValidUuid` exported (line 48), reused by all new handlers. Existing `handleBctcInspect*` functions untouched.
- `apps/mcp-server/src/interface/mcp/server.ts` — route dispatch block at lines 367-502. New routes slot in after line 502 in the bctc-inspect block. Body parsing pattern confirmed at lines 427-435.
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — last BCTC tool entries at lines 107-109 (#142-#144). New tools will be #145-#146. Import + array entry pattern confirmed.
- `docs/agents/refine_bctc_md/flow/main.md` — Phase 0, Step 5 is `text_status == "COMPLETE"` check. NO `confirm_status` check. Must add Step 2b (see brief §4.2). This file is agent-father zone.

### Reuse patterns:
- `isValidUuid()` from `bctcInspectHandler.ts` — import in all 3 new route handlers, do not duplicate.
- `bctcCorrectionService.submitCorrection()` — shared by both `bctcCorrectHandler.ts` and `submitBctcCorrectionTool.ts`. Zero duplication.
- `parseTrustFlag` — after `export` added, shared by `bctcFlagEnumerationService.ts`. Do not re-implement.
- DI pattern for db: all handlers receive `db: Database` as a parameter (not `getDb()` inside handler). Matches existing pattern in `bctcInspectHandler.ts`.

### Design decisions:
- **ARCH-DECIDE A:** Post-pass override (Option A2). `applyCorrections()` private helper in `finalizeBctcRefineTool.ts`. Parser 0-diff.
- **ARCH-DECIDE B:** Stable key = `(report_id, label, page_number, statement_section, code_or_null)`. Ambiguous lookup → `anchor_status = 'anchor_ambiguous'` (safe-fail, never mis-applies). `reAnchorCorrections()` in `bctcHumanCorrectionsStore.ts`.
- Layer 1 guard: `getBctcPendingRefineTool.ts` WHERE clause (primary) + `refine_bctc_md/flow/main.md` Phase 0 Step 2b (belt-and-suspenders).
- Layer 2 guard: selective DELETE in `finalizeBctcRefineTool.ts` — single transaction, EC-7 safe.

### Scan clean: true ✓

### ARCH-DECIDE rulings (one line each):
- **A:** `applyCorrections()` post-pass at `finalizeBctcRefineTool.ts` call site; parser internals 0-diff.
- **B:** Stable key `(label, page_number, statement_section, code_or_null)`; `reAnchorCorrections()` in infra store; ambiguous = safe-fail (`anchor_ambiguous`), never mis-applies.

---

## Task List for PM

See `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` §9 for full task decomposition guidance.

Minimum 7 tasks:

| Task ID | Zone | Owner | Description |
|---|---|---|---|
| HC-DEV-1 | apps/mcp-server/ | dev-mcp-server | Schema migrations + infra store + application services. Foundation. |
| HC-DEV-2 | apps/mcp-server/ | dev-mcp-server | finalizeBctcRefineTool + getBctcPendingRefineTool + parseTrustFlag export. Depends on HC-DEV-1. |
| HC-DEV-3 | apps/mcp-server/ | dev-mcp-server | HTTP route handlers + server.ts dispatch. Depends on HC-DEV-1. |
| HC-DEV-4 | apps/mcp-server/ | dev-mcp-server | MCP tools + registry + barrel. Depends on HC-DEV-1. |
| HC-DEV-5 | apps/mcp-server/ | dev-mcp-server | DV test file (bundled with production tasks — not a separate sprint step). |
| HC-DEV-6 | apps/mcp-server/ | dev-mcp-server | bctc-inspector.html flags panel. Depends on HC-DEV-3. |
| HC-AF-1 | docs/agents/ | agent-father | refine_bctc_md/flow/main.md Phase 0 Step 2b. Independent — can run parallel to HC-DEV-2. |

---

## Non-Negotiables (carry into every dev handoff)

- main branch only · additive only · DV tests RED-before/GREEN-after same commit · scoped `git add <file>` never `-A` · verify persistence via direct `new Database(':memory:')` reads · balance badge FORBIDDEN as sole QA gate · `source_confidence = 1.0` for all corrected rows · ops REBUILD container after dev changes (`--no-cache` + `force-recreate`) · all viewer copy PLAIN Vietnamese · never ask user to run code · agent-father edits `docs/agents/` files (not dev-mcp-server)

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/HC-ARCH.md
ZONE: apps/mcp-server/ (dev-mcp-server) + docs/agents/ (agent-father — 1 file)
NEXT: pm | break design into atomic tasks and create developer handoffs per §9 of brief
HANDOFF: docs/handoffs/HC-ARCH.md
PIPELINE: continue
```
