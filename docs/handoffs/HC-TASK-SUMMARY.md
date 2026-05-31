---
# HC-HUMAN-CONFIRM Task Decomposition Summary
# PM Dispatch Manifest
sprint: BCTC-HUMAN-CONFIRM
date: 2026-05-30
---

# Task List — 7 Atomic Tasks

All tasks carry the same non-negotiables:
- Main branch only · Additive only · Scoped `git add` per file (never `-A`)
- DV tests RED-before/GREEN-after in SAME commit as production (HC-DEV-5 bundled with production)
- Direct in-container `market.db` persistence verification via bun:sqlite
- Balance badge FORBIDDEN as sole QA gate
- Plain Vietnamese all user-facing copy
- Never ask user to run code; spawn ops/developer/qa instead
- After agent .md edits, paste-ready Cowork refresh prompt required

---

## Zone: `apps/mcp-server/` — dev-mcp-server (6 tasks)

These tasks share the same zone. **SERIALIZE** dev-mcp-server commits to avoid concurrent-commit-race. WIP=2 limit applies (max 2 tasks In Progress at once).

### HC-DEV-1 (Foundation Layer)
- **Status:** READY
- **Depends on:** none
- **Blocks:** HC-DEV-2, HC-DEV-3, HC-DEV-4
- **Files:** CREATE 2 (store, 2 services); MODIFY 1 (schema)
- **Duration:** ~2h
- **Handoff:** `docs/handoffs/HC-DEV-1.md`
- **Summary:** Schema migrations (source_confidence, confirm_status, bctc_human_corrections table) + infra store for corrections CRUD + application services for flag enumeration and correction orchestration. Foundation — must complete first.
- **DV Tests:** DV-HC-9, DV-HC-10, DV-HC-13
- **Exit:** All 3 schema blocks deployed (idempotent), store + services callable with in-memory DB, HC-DEV-1 DV tests GREEN.

---

### HC-DEV-2 (Layer 1+2 Guards + `source_confidence` Fix)
- **Status:** READY
- **Depends on:** HC-DEV-1
- **Blocks:** none
- **Files:** MODIFY 3 (getBctcPendingRefineTool, finalizeBctcRefineTool, refinedMarkdownParser)
- **Duration:** ~2h
- **Handoff:** `docs/handoffs/HC-DEV-2.md`
- **Summary:** Layer 1 report-level skip in `getBctcPendingRefineTool` WHERE clause. Layer 2 selective delete + applyCorrections post-pass + reAnchorCorrections in finalizeBctcRefineTool (atomic transaction, EC-7 safe). Fix `source_confidence` INSERT gap. Export `parseTrustFlag` (7-char additive).
- **DV Tests:** DV-HC-3, DV-HC-7, DV-HC-8, DV-HC-11, DV-HC-12
- **Exit:** Layer 1+2 guards live, source_confidence in INSERT, parseTrustFlag exported, HC-DEV-2 DV tests GREEN, confirmed reports skip refine, corrected rows pinned with confidence 1.0, re-anchor handles duplicates + ambiguous cases.
- **Serialization:** Must serialize within dev-mcp-server (avoid concurrent commit of 3 modified files).

---

### HC-DEV-3 (HTTP Handlers + Server Dispatch)
- **Status:** READY
- **Depends on:** HC-DEV-1
- **Blocks:** HC-DEV-6
- **Files:** CREATE 3 (handlers); MODIFY 2 (server.ts, import lines)
- **Duration:** ~1.5h
- **Handoff:** `docs/handoffs/HC-DEV-3.md`
- **Summary:** Three new route handlers (bctcFlagsHandler, bctcCorrectHandler, bctcConfirmHandler) + server.ts dispatch for 4 routes (flags GET, correct POST, confirm POST, confirm/reset POST). All handlers delegate to HC-DEV-1 services.
- **DV Tests:** DV-HC-1, DV-HC-2, DV-HC-4, DV-HC-5, DV-HC-6
- **Exit:** All 4 HTTP routes live, handlers receive db via DI, HC-DEV-3 DV tests GREEN, HTTP contract verified (200 on success, 409 on confirmed, 400 on bad input).
- **Serialization:** Can be parallel to HC-DEV-2 after HC-DEV-1 completes (separate files, same zone).

---

### HC-DEV-4 (MCP Tools + Registry)
- **Status:** READY
- **Depends on:** HC-DEV-1
- **Blocks:** none
- **Files:** CREATE 2 (tools); MODIFY 2 (registry, barrel)
- **Duration:** ~1h
- **Handoff:** `docs/handoffs/HC-DEV-4.md`
- **Summary:** Two MCP tools (#145, #146): `list_flagged_bctc_cells` and `submit_bctc_correction`. Register in tool registry with correct IDs and maker functions. Barrel exports. Both delegate to HC-DEV-1 services (shared with HTTP handlers, zero duplication).
- **DV Tests:** DV-HC-10
- **Exit:** Both tools registered, callable with Zod schemas, return correct JSON shapes, HC-DEV-4 DV test GREEN.
- **Serialization:** Can be parallel to HC-DEV-2/3 after HC-DEV-1 completes (separate files, same zone).

---

### HC-DEV-5 (Unified DV Test Suite)
- **Status:** READY
- **Depends on:** HC-DEV-1, HC-DEV-2, HC-DEV-3, HC-DEV-4
- **Blocks:** none
- **Files:** CREATE 1 (test file)
- **Duration:** ~2h (spread across all 4 production tasks)
- **Handoff:** `docs/handoffs/HC-DEV-5.md`
- **Summary:** Consolidated test file with all 13 DV test cases (DV-HC-1 through DV-HC-13). RED-before/GREEN-after in SAME commit as production code for each task. Uses in-memory DB, verifies persistence via direct DB reads (not HTTP response assertions). Not a separate sprint step — bundled with production.
- **DV Tests:** All 13 (DV-HC-1..13)
- **Exit:** All 13 tests RED before production code, GREEN after, same commits as production tasks.
- **Committing:** DV tests committed WITH production code, not separately. Each production task includes its DV-HC-* tests in the same commit.

---

### HC-DEV-6 (Viewer Panel)
- **Status:** READY
- **Depends on:** HC-DEV-1, HC-DEV-3
- **Blocks:** none
- **Files:** MODIFY 1 (bctc-inspector.html)
- **Duration:** ~1.5h
- **Handoff:** `docs/handoffs/HC-DEV-6.md`
- **Summary:** New "Sửa tay / Xác nhận cuối" tab in existing viewer. Displays flagged cells (red/yellow, OCR/image values, page, label). User can correct cells (Vietnamese number input), mark report ĐÃ XÁC NHẬN (lock), reset. All actions call HC-DEV-3 HTTP endpoints. ADDITIVE only — existing panes untouched.
- **DV Tests:** none (frontend manual/Playwright optional)
- **Exit:** Tab works, flags load, corrections submit, confirm lock/reset work, existing panes untouched, all text plain Vietnamese, Vietnamese number parsing works.
- **Serialization:** HC-DEV-1 and HC-DEV-3 must complete first. Can be done after both.

---

## Zone: `docs/agents/refine_bctc_md/` — agent-father (1 task)

This task is a separate zone (agent .md files are agent-father's domain). **Can run in parallel** to any dev-mcp-server task after HC-DEV-1 completes.

### HC-AF-1 (Cron Flow Guard)
- **Status:** READY
- **Depends on:** HC-DEV-1 (schema columns must exist to be queryable)
- **Blocks:** none
- **Files:** MODIFY 1 (flow/main.md)
- **Duration:** ~20min
- **Handoff:** `docs/handoffs/HC-AF-1.md`
- **Summary:** Single step (2b) added to Phase 0 of `refine_bctc_md/flow/main.md`. Guard checks `confirm_status == "CONFIRMED"` and exits cleanly (belt-and-suspenders with HC-DEV-2 Layer 1 guard in tool).
- **DV Tests:** none (flow integration tested by QA)
- **Exit:** Step 2b added, flow reads correctly, confirmed reports skip with `skipped: true`.
- **Post-commit:** Paste-ready Cowork refresh prompt required (per feedback in memory).

---

## Dispatch Order (Serialization + Parallelization)

### Phase 1: Foundation (HC-DEV-1)
1. **Deploy HC-DEV-1** (dev-mcp-server)
   - Schema migrations + infra store + services
   - DV tests: DV-HC-9, DV-HC-10, DV-HC-13
   - Exit: schema live, services callable

### Phase 2: Parallel Layer (after HC-DEV-1 ✓)
Launch 4 tasks in parallel (respecting WIP=2):

**Batch A (serialize within dev-mcp-server zone):**
- **HC-DEV-2** (Guard layer) → NEXT
- **HC-AF-1** (agent-father, parallel to HC-DEV-2) → optional immediate dispatch or defer to Phase 3

**Batch B (can start after HC-DEV-1, independent):**
- **HC-DEV-3** (HTTP handlers)
- **HC-DEV-4** (MCP tools)

**Constraint:** Within dev-mcp-server zone, serialize commits to avoid concurrent-commit-race. Recommend:
- HC-DEV-2 completes → commit
- HC-DEV-3 or HC-DEV-4 starts/completes → commit
- HC-DEV-6 requires HC-DEV-3 live, so schedule after HC-DEV-3 completes

### Phase 3: Viewer (after HC-DEV-3 ✓)
- **Deploy HC-DEV-6** (viewer panel)
  - Depends on HTTP endpoints from HC-DEV-3 live

### Phase 4: Cron Flow (flexible, after HC-DEV-1)
- **Deploy HC-AF-1** (agent-father, any time after HC-DEV-1)
  - Can be done in parallel with HC-DEV-2 or deferred to Phase 3 after HC-DEV-3
  - Requires Cowork refresh prompt after commit

---

## Recommended Dispatch Schedule (Respecting WIP=2)

```
Time:  HC-DEV-1               HC-DEV-2             HC-DEV-3             HC-DEV-4      HC-DEV-6      HC-AF-1
       ├─ [READY] ─────┐
       │                ├─ [IN PROGRESS] ──┐
       │                │                  ├─ [READY, pending HC-DEV-2 completion]
       │                │                  │
       │ [DONE] ────────┤                  │
       │                └─────────────┐    ├─ [IN PROGRESS] ────────┐
       │                              │    │                         │
       │                   ┌──────────┤    │ [IN PROGRESS] ─────┐    │
       │                   │          │    │                    │    │
       │         [DONE]    ├──────────┘    ├─ [DONE]            │    │
       │                   │                │                    │    │
       │                   │          [START HC-DEV-6]           │    │
       │                   │                │            [DONE]  │    │
       │                   │                │            [DONE]  ├────┤
       │             [DONE]│                │                    │    │
       │                   │                │                    │    │
       │                   │          [START HC-AF-1 parallel]   │    │
       │                   │                │                    │    │
       │                   │                │                    │    │
       │                   │          [HC-AF-1 DONE]             │    │
       │                   │          [+Cowork refresh]          │    │
       └───────────────────┴────────────────┴────────────────────┴────┘

Serialization within dev-mcp-server: HC-DEV-2 → HC-DEV-3/4 → HC-DEV-6
Parallelization: HC-AF-1 independent (agent-father zone), can overlap any phase
WIP Limit: max 2 In Progress at once; after HC-DEV-1 DONE, HC-DEV-2 + HC-AF-1 = 2 (at capacity)
```

---

## Task Status Matrix

| Task | Zone | Owner | Status | Duration | Depends | DV Tests | Handoff |
|---|---|---|---|---|---|---|---|
| HC-DEV-1 | apps/mcp-server | dev-mcp-server | READY | ~2h | none | 3 | HC-DEV-1.md |
| HC-DEV-2 | apps/mcp-server | dev-mcp-server | READY | ~2h | HC-DEV-1 | 5 | HC-DEV-2.md |
| HC-DEV-3 | apps/mcp-server | dev-mcp-server | READY | ~1.5h | HC-DEV-1 | 5 | HC-DEV-3.md |
| HC-DEV-4 | apps/mcp-server | dev-mcp-server | READY | ~1h | HC-DEV-1 | 1 | HC-DEV-4.md |
| HC-DEV-5 | apps/mcp-server | dev-mcp-server | READY | ~2h (spread) | HC-DEV-1..4 | 13 | HC-DEV-5.md |
| HC-DEV-6 | apps/mcp-server | dev-mcp-server | READY | ~1.5h | HC-DEV-1, HC-DEV-3 | 0 | HC-DEV-6.md |
| HC-AF-1 | docs/agents/ | agent-father | READY | ~20min | HC-DEV-1 | 0 | HC-AF-1.md |
| **TOTAL** | — | — | — | **~10h** | — | **13** | — |

---

## Correctness Invariants (Carry into Every Handoff)

1. **Stable key for re-anchor:** `(report_id, label, page_number, statement_section, code_or_null)`. Duplicate-label case → `anchor_status='anchor_ambiguous'`, never mis-apply.
2. **Post-pass override:** `applyCorrections()` at `finalizeBctcRefineTool.ts` call site. Parser internals 0-diff.
3. **`source_confidence` = 1.0 for corrected rows.** Parser-computed confidence preserved for uncorrected rows.
4. **Confirm_status = CONFIRMED skips cron fan-out:** Layer 1 in `getBctcPendingRefineTool` WHERE clause + Layer 2 in `finalizeBctcRefineTool` Layer 1 check.
5. **Corrections survive cron re-run:** Layer 2 selective DELETE preserves corrected row IDs; re-anchor links corrections to new rows post-parse.
6. **ESC-5 clears for confirmed cells:** `source_confidence ≥ 0.50` (gate passes). Corrected rows = 1.0 (always pass).
7. **Additive only:** No breaking changes to `/api/bctc-inspect`, MD→table view, agent/debug toggle, `has_pek`.
8. **Main branch only.** No branches. Scoped `git add` per file (never `-A`).
9. **DV tests RED-before/GREEN-after same commit as production.** No mocking frameworks; direct in-memory DB reads verify persistence.
10. **Balance badge FORBIDDEN as sole QA gate.** Persistence verified by direct DB read (via bun:sqlite `new Database(path)` in-container), not by balance badge result.

---

## NEXT (PO Dispatch)

**Immediate:**
1. Assign HC-DEV-1 to dev-mcp-server
2. Concurrently, assign HC-AF-1 to agent-father (can start after HC-DEV-1 understanding)
3. Schedule HC-DEV-2 to launch as soon as HC-DEV-1 DONE

**After HC-DEV-1 DONE:**
1. Assign HC-DEV-2 (blocks HC-DEV-3 only partially — HC-DEV-3 can start after HC-DEV-1 if HC-DEV-2 is in progress)
2. Assign HC-DEV-3 and HC-DEV-4 in parallel (both depend only on HC-DEV-1, independent of each other)
3. HC-AF-1 can deploy anytime (independent zone)

**After HC-DEV-3 DONE:**
1. Assign HC-DEV-6 (needs live HTTP endpoints from HC-DEV-3)

**After all production DONE:**
1. Confirm ops REBUILD container (`--no-cache` + `force-recreate`) before QA goes live

---

## Files Created/Modified Summary

### Create (9 files)
- `docs/handoffs/HC-DEV-1.md` ← reading this for context
- `docs/handoffs/HC-DEV-2.md` ← reading this for context
- `docs/handoffs/HC-DEV-3.md` ← reading this for context
- `docs/handoffs/HC-DEV-4.md` ← reading this for context
- `docs/handoffs/HC-DEV-5.md` ← reading this for context
- `docs/handoffs/HC-DEV-6.md` ← reading this for context
- `docs/handoffs/HC-AF-1.md` ← reading this for context
- `apps/mcp-server/src/infrastructure/db/bctcHumanCorrectionsStore.ts`
- `apps/mcp-server/src/application/usecases/bctcFlagEnumerationService.ts`
- `apps/mcp-server/src/application/usecases/bctcCorrectionService.ts`
- `apps/mcp-server/src/interface/mcp/routes/bctcFlagsHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/bctcCorrectHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/bctcConfirmHandler.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/submitBctcCorrectionTool.ts`
- `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts`

### Modify (9 files)
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` (7-char export only)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/registry.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts`
- `apps/mcp-server/src/interface/mcp/server.ts`
- `apps/mcp-server/src/interface/mcp/routes/bctc-inspector.html`
- `docs/agents/refine_bctc_md/flow/main.md`

### Delete (0 files)

---

## RETURN

```
COMPLETE: HC-HUMAN-CONFIRM task decomposition.
TASKS: 7 atomic tasks (HC-DEV-1..6 + HC-AF-1)
HANDOFFS: docs/handoffs/HC-DEV-*.md, HC-AF-1.md (all linked below)
DEPENDENCIES: Linear HC-DEV-1 → HC-DEV-2/3/4 → HC-DEV-6; HC-AF-1 independent parallel
SERIALIZATION: dev-mcp-server zone must serialize (avoid concurrent-commit-race); WIP=2 limit
NEXT: pm dispatch HC-DEV-1 to dev-mcp-server; concurrently HC-AF-1 to agent-father
DURATION: ~10h total (spread across 2-3 day sprints with WIP=2)
PIPELINE: continue → dispatch HC-DEV-1
```

### Direct Handoff Links
- Detailed specs: `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` § 1-9
- Task specs:
  - Foundation: `docs/handoffs/HC-DEV-1.md`
  - Guards: `docs/handoffs/HC-DEV-2.md`
  - HTTP handlers: `docs/handoffs/HC-DEV-3.md`
  - MCP tools: `docs/handoffs/HC-DEV-4.md`
  - DV tests: `docs/handoffs/HC-DEV-5.md`
  - Viewer panel: `docs/handoffs/HC-DEV-6.md`
  - Flow guard: `docs/handoffs/HC-AF-1.md`
