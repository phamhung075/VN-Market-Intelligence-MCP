# Architect — Notebook

**Last updated:** 2026-06-12 22:10 UTC | **Sprint:** BCTC-ANALYTICS-LAYER

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-12T22:10Z — BCTC-ANALYTICS-LAYER Refine State Machine Ruling (DESIGN, REVIEW)

**Task:** FIX-FINALIZE-STATUS-STUCK-PARTIAL + FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE + FIX-PENDING-REFINE-TICKER-TARGETING | zone: apps/mcp-server/src/
**Output:** docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md

**Key findings:**
- BUG1: BEQ-7 section guard fires when report_status=DONE with missing sections → silent PARTIAL override → queue re-serves indefinitely. Fix: SQL exclusion subquery to skip PARTIAL reports where ALL units complete.
- BUG2: extraction_confidence stale (frozen at OCR time). Fix: add weighted section-presence formula in finalizeBctcRefineTool BLOCK-5; overwrite only if refined_confidence > current.
- BUG3: Zod strips `ticker`/`report_id` params. Fix: add optional params to existing tool; report_id bypasses filters, ticker filters by action_code.
- Index RF-1: idx_bctc_refined_units_report_status for BUG1 exclusion.
- BUILD-STANDARD: not-applicable (interface-layer only, no new primitives).

## 2026-06-12T15:45Z — ARCH-QUE-REFERENCE-PAGE (DESIGN, REVIEW)

**Task:** ARCH-QUE-REFERENCE-PAGE | zone: apps/frontend/ + scripts/
**Output:** docs/architecture-briefs/2026-06-12-que-reference-page.md

**Key findings:**
- D1: Second generated artifact `que-descriptions-detail.generated.ts` (13 fields + phases[6]); existing `QueDescription` sealed.
- D2–D6: Route dashboard.kinh-dich-reference.tsx (static, no API), nav entry, client-side 64-item search, QueName deep-link, no proxy.
- BUILD-STANDARD: lean. 4 subtasks: codegen, route, nav+QueName, TEST.
- Sequencing: blocked on FE-CORPEVENTS-TICKER-FILTER (PO WIP=2 rule).

## 2026-06-12T09:00Z — ARCH-QUE-TOOLTIP-DRY (DESIGN, REVIEW)

**Task:** ARCH-QUE-TOOLTIP-DRY | multi-zone: apps/frontend/ + scripts/ + apps/mcp-server/
**Output:** docs/architecture-briefs/2026-06-12-que-tooltip-dry.md + [Architect] Brownfield Findings appended to docs/handoffs/QUE-TOOLTIP-DRY-BA-spec.md

**Key findings:**
- BLOCKER-1: Option B (codegen mirror). que-reference.js is committed static; gen-que-descriptions.ts parses directly.
- BLOCKER-2: FlipRow deferred (KinhDichFlip lacks hexagram-number fields).
- BLOCKER-3: coreMeaning.vi (primary) + marketTrendLabel.vi (secondary); QueDescription shrinks 4→2 fields.
- FR-1: 3-line swap in SnapshotRow (hexagramNumber already present).
- BUILD-STANDARD: lean. 3 subtasks for PM.
