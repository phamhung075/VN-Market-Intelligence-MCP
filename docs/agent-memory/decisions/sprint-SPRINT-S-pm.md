# PM Decision Journal — SPRINT-S

## pm-STEP-001 — FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER decomposition

**task_id:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER

**Decision:** Decompose into 2 independent parallel tasks: TASK-BCTC-INSPECT-UI-FILTERS (M, ~2h) + TASK-BCTC-INSPECT-LABEL-FIX (S, ~1h).

**what-considered:** 
- Option A: 1 large task covering all (html + handler + tests together) → rejected: scope bloat, no granular progress tracking
- Option B: 2 tasks (UI feature vs label fix) → chosen: clear separation of concerns, true parallel execution, each is atomic ~2h work
- Option C: 3 tasks (html / handler / tests separate) → rejected: over-granulated, handler + test are tightly coupled (AC9 fix + AC-14 assertion must land together)

**why-decision:** 
Architect's design identified that AC9 root-cause (period_type already Q1..Q4-shaped, not QUARTERLY/ANNUAL literal) is a widened scope vs BA's initial "type coercion only" framing. The larger client-side UI feature (FR-1..FR-8, ~2h with new test file) naturally separates from the server-side ~8-line label fix (AC9) + test assertion (AC-14). Two tasks allow:
- Developer to parallelize or sequence by their choice
- If dev-mcp-server can only pick one immediately, they get one complete, testable deliverable (not a split feature)
- Architecture clarity: client-side faceting (UI filters feature) vs server-side label normalization (display bug)

**why-change:** 
Architect corrected BA's mechanism (D-1 spec: buildLabel should test if period_type already encodes the quarter, not just coerce the period_quarter value). This widening made a 1-task decomposition less clean. Two tasks keep the decomposition unambiguous.

**parent row:** FEAT-BCTC-INSPECT-QUARTER-TICKER-FILTER (moved ready→done, marked with children: [UI-FILTERS, LABEL-FIX])

**children minted:** 
- TASK-BCTC-INSPECT-UI-FILTERS (status: TODO, ready[], M size, depends_on: [])
- TASK-BCTC-INSPECT-LABEL-FIX (status: TODO, ready[], S size, depends_on: [])

**handoff files created:**
- docs/handoffs/TASK-BCTC-INSPECT-UI-FILTERS.md
- docs/handoffs/TASK-BCTC-INSPECT-LABEL-FIX.md

**orch-state write:** Applied via orch-apply.sh, task_total 767→769 (+2 ready), conservation OK, no new ceiling violations.
