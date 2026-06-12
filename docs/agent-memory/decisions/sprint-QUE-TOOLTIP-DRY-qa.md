<!-- size-justification: QA decision journal for sprint QUE-TOOLTIP-DRY — 3 subtasks -->

# Decision Journal — QA — sprint QUE-TOOLTIP-DRY

---

## Entry 1

**date:** 2026-06-12T12:00Z
**agent:** qa
**task-id:** QUE-TOOLTIP-DRY-1a
**verdict:** APPROVED
**what-considered:**
- 14 sprint tests GREEN (QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts — 64-entry count, 2-field interface, field rename, quẻ 1 spot-check, NFR-3 graceful no-op)
- tsc --noEmit: exit 0 (frontend)
- Generated file header: "Source: apps/kinh-dich-service/dashboard/que-reference.js" confirmed
- 64 entries confirmed (node count)
- state_trend / judgment_interpretation / image_action: absent from QueName.tsx and generated file (grep exit=1)
- italic class: removed from secondary tooltip line (grep exit=1)
- Quẻ 1 spot-check: coreMeaning = "Sức sáng tạo nguyên thủy, năng lượng dương cương kiện không ngừng vận hành" (1 clause, matches que-reference.js); marketTrendLabel = "Thuận lợi (THUẬN LỢI)" — exact match
- mock-guard: PASS (exit 0)
- DDD: no domain→infrastructure import in modified files (exit 1 = 0 matches)
- Security: process.env L339-340 in kinh-dich-signals.tsx is pre-existing server-side origin resolution, not introduced by this sprint (git show diff confirms 0 sprint lines touching process.env)
**why-change:** All checks green. SSOT alignment complete. FR-2 AC satisfied.

---

## Entry 2

**date:** 2026-06-12T12:00Z
**agent:** qa
**task-id:** QUE-TOOLTIP-DRY-1b
**verdict:** APPROVED
**what-considered:**
- SnapshotRow L484-L489: `<QueName hexagram={item.hexagramNumber} name={item.hexagramName} />` confirmed in source (Read tool)
- QueName import at L55 of dashboard.kinh-dich-signals.tsx confirmed
- FlipRow (L452-L473): NO QueName, NO tooltip — renders only stockCode, fromAction, toAction, sentiment, confidence, timestamp — PO-Q4 deferral regression-free
- NFR-1: grep TooltipProvider|TooltipContent|TooltipTrigger in routes/ = 0 matches (exit 1)
- NFR-2: VN trend strings in routes are sentiment/sector labels, none are hexagram description text from QUE_DESCRIPTIONS — AC satisfied
- NFR-3: QueName L40-45 fallback intact, 1a test hexagram=0 still GREEN
- tsc --noEmit: exit 0
- mock-guard: PASS (exit 0)
- Pre-existing failures: 170 total (full suite) pre-sprint baseline confirmed by stash probe — not introduced by sprint
**why-change:** All checks green. FR-1 complete. NFR-1/2/3 verified.

---

## Entry 3

**date:** 2026-06-12T12:00Z
**agent:** qa
**task-id:** QUE-TOOLTIP-DRY-3
**verdict:** APPROVED
**what-considered:**
- hexagramLibrary.ts L1-8: JSDoc block updated — "AUTO-GENERATED downstream", "Source of truth: que-reference.js", "DO NOT EDIT independently" — all 3 annotation points confirmed (Read tool)
- Zero data changes to QUE_DATA / QUE_META / any hexagram record (diff shows comment-only change, per git show 66621b03)
- bun test kinhDich targeted (280, 301, 285, 302): 107 pass / 0 fail
- bun tsc --noEmit mcp-server: exit 0
- Tool count 157 + scheduler count 79 baseline maintained per handoff G12 evidence
- mock-guard: PASS (exit 0)
**why-change:** Annotation-only change. All gates green. PO-Q2 SSOT enforcement codified.
