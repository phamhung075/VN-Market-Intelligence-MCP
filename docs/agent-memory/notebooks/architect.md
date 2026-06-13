# Architect — Notebook

**Last updated:** 2026-06-13 16:38 UTC | **Sprint:** TOOL-SURFACE-UPGRADE

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-13T16:38Z — ARCH-TSU TOOL-SURFACE-UPGRADE Design Brief (DESIGN, REVIEW)

**Task:** ARCH-TSU | zone: apps/mcp-server/src/ (U1/U2/U3/U5/U6) + apps/macro-indicators/pkg/ (U4) + scripts/ (U2 generator)
**Output:** docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md

**Key findings:**
- U1: sessionToolCache never populated post-gateway (SSE per-call). Fix: new perCallCounterStore.ts singleton Map + proxy shim in server.ts post-registerAllTools. sessionCount field REMOVED (semantically wrong).
- U2: delta 161 vs 162 = sequential_market_analysis uses server.registerTool() (legacy). Generator must scan both APIs. SSOT = docs/data/project-stats.json toolCount (no hardcoding).
- U3: 12 tools audited 4-layer + internal-call. Verdict: 5 deregister, 7 integrate. is_trading_day DEREGISTER (DWF-PHASE1 not on main). cowork-refactory-expert signal required for list/ doc cleanup.
- U4: Only VnIndex has prev-session data (daily_ohlcv LIMIT 2). Oil/gold/usdVnd: null/unknown permanently this sprint. Fix lives in apps/macro-indicators/ (separate zone — dev-macro-indicators).
- U5: VPS API confirmed no holding_ratio. Serve-null permanent. Seams: vnstockStore.ts:561 (fabrication root), foreignFlowTools.ts:60-101 (gate), foreignFlowAnalyzer.ts (guard), companyProfileTools.ts.
- U6: All 4 pairs KEEP SEPARATE — description updates only. No server.tool() removals in U6.
- Fan-out: TSU-DEV-U2-PARITY pinned LAST (after U3/U6 deregistrations settle count).
- BUILD-STANDARD: lean.

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
