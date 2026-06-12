---
sprint: QUE-TOOLTIP-DRY
branch: task/QUE-TOOLTIP-DRY-3-downstream-annotation
size: XS
zone: apps/mcp-server/src/domain/services/kinhDich/
depends_on: []
blocks: []
---

## TLDR
Update the file-header comment on hexagramLibrary.ts to declare it a generated downstream of que-reference.js (SSOT constraint enforcement per PO-Q2). Zero data changes, zero TS type changes. This is a 3-line annotation-only change that codifies the SSOT architecture.

## [PM] Planning Context
- **Zone:** apps/mcp-server/ (domain layer, hexagramLibrary.ts only)
- **Acceptance Criteria:**
  - [ ] hexagramLibrary.ts file-header comment updated to 3 lines, stating:
    1. "AUTO-GENERATED downstream"
    2. "Source of truth = apps/kinh-dich-service/dashboard/que-reference.js"
    3. "DO NOT EDIT description text independently — any divergence from que-reference.js is a defect"
  - [ ] No data changes to hexagramLibrary.ts (all 64 hexagram records untouched)
  - [ ] No TS type changes (QUE_DATA, QUE_META exports unchanged)
  - [ ] Runtime consumers (kinhDichTools.ts) unaffected (continue reading state.trend field)
  - [ ] File compiles without error

- **Files to read first:**
  - apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts (current header + data structure)
  - apps/kinh-dich-service/dashboard/que-reference.js (SSOT reference)

- **Files to modify:**
  - apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts — file header comment only

- **Files to create:**
  - None

- **Dependencies:**
  - None (can run in parallel with QUE-TOOLTIP-DRY-1a; disjoint files)

- **Knowledge needed:**
  - docs/architecture-briefs/2026-06-12-que-tooltip-dry.md (BLOCKER-1 Option B decision + enforcement)
  - docs/handoffs/QUE-TOOLTIP-DRY-BA-spec.md (PO-Q2 ruling: "dual-source forbidden")

---

## Implementation Notes

### Comment Update Pattern

Add or replace the file-header comment block (first ~3 lines after any shebang or imports) with this text:

```typescript
/**
 * AUTO-GENERATED downstream.
 * Source of truth: apps/kinh-dich-service/dashboard/que-reference.js (emitted via go run ./cmd/sandbox -emit-reference)
 * DO NOT EDIT description text independently. Any divergence from que-reference.js is a defect.
 * 
 * Used by kinhDichTools.ts at runtime (reads state.trend) — no changes to data structure.
 * gen-que-descriptions.ts reads que-reference.js directly (no longer uses hexagramLibrary.ts as codegen source).
 */
```

### Scope

- **What to change:** File-header comment (JSDoc or /* */ block)
- **What NOT to change:**
  - Import statements
  - Export statements
  - QUE_DATA array
  - QUE_META array
  - Any hexagram record content
  - Any TS type definitions

### Verification

After edit, verify:
1. File still compiles: `bun build apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts`
2. No functional changes: `git diff apps/mcp-server/src/domain/services/kinhDich/hexagramLibrary.ts` shows only comment additions
3. Exports still available for kinhDichTools.ts import

---

## Rationale (PO-Q2)

Per PO ruling: "the end state MUST have exactly ONE source of truth for hexagram description text — not two that can drift."

This annotation enforces that principle:
- hexagramLibrary.ts is no longer the codegen source (that's now que-reference.js)
- hexagramLibrary.ts is no longer independently editable for description text (that violates the SSOT constraint)
- Runtime consumers (kinhDichTools.ts) can continue using hexagramLibrary.ts for Q&A operations (state.trend field), but any description text changes must flow from que-reference.js → codegen → frontend

---

## Risk Flags

- **RF-3 (LOW):** hexagramLibrary.ts runtime consumers (kinhDichTools.ts) read `state.trend`, not `marketTrendLabel`. No impact from this comment-only change.
- **RF-4 (INFO):** This change is purely architectural (documentation). Zero production impact.

---

## Note

This task is a parallel sibling to QUE-TOOLTIP-DRY-1a (codegen rewrite). It can be completed independently and in any order. No code conflicts expected.
