# Decision Journal — Sprint QUE-TOOLTIP-DRY · pm

**Sprint goal:** Wire hover tooltips to every frontend quẻ render site, enforcing ONE source of truth for hexagram description text. Resolve BLOCKER-1 (SSOT mechanism) via Option B; defer BLOCKER-2 (FlipRow) to future sprint.
**Agent:** pm
**Started:** 2026-06-12T11:25:00Z

---

### STEP pm-S1 · pm · 2026-06-12T11:25Z
**task-id:** QUE-TOOLTIP-DRY-DECOMPOSE
**what-done:** Decomposed ARCH-QUE-TOOLTIP-DRY into 3 atomic subtasks with clear AC, dependency order, and zone isolation. Created handoff files TASK_QUE-TOOLTIP-DRY-1a.md, TASK_QUE-TOOLTIP-DRY-1b.md, TASK_QUE-TOOLTIP-DRY-3.md + deferred follow-up TASK_QUE-TOOLTIP-DRY-FLIP-ROW.md. Registered all 3 sprint tasks in orch-state.json.
**what-considered:**
- Task split (architect provided 3 subtasks): Subtask 1 (codegen + QueName update) vs Subtask 2 (SnapshotRow migration + NFR gates) vs Subtask 3 (annotation only). Architect flagged FR-2 must block FR-1 (interface stability) — enforced via depends=[QUE-TOOLTIP-DRY-1a] on task 1b.
- Zone isolation: 1a touches scripts/ + apps/frontend/; 1b touches only apps/frontend/ routes; 3 touches only apps/mcp-server/. No file conflicts -> 1a and 3 can run in parallel.
- Parallelism: 1b (FR-1 consumer) depends on 1a (producer interface change). 3 is independent. Result: tier1 = {1a, 3}; tier2 = {1b}.
- Deferred scope: BLOCKER-2 (FlipRow) explicitly out per PO-Q4 ruling: "If DTO lacks ids, defer to separate sprint." Confirmed: KinhDichFlip interface has no hexagramNumber fields today. Created deferred task doc (not in sprint).
- SSOT constraint (PO-Q2): Option B (declare hexagramLibrary.ts downstream) chosen by architect. Enforced via task 3 annotation. Option A (bulk endpoint) rejected as brittle (docker dependency at codegen time).
- NFR gates (code janitor class): NFR-1/2/3 all grep-based; bundled into task 1b as pass/fail criteria (not separate tasks).
**why-decision:** 3-task structure matches architect's findings; depends graph enforces FR-2→FR-1 causal order; task 3 is zero-risk annotation (comment only, no code); deferred task is explicit per PO ruling (not silent omission).
**why-change:** no change from plan

---

### STEP pm-S2 · pm · 2026-06-12T11:25Z
**task-id:** QUE-TOOLTIP-DRY-ORCH-STATE
**what-done:** Atomically added QUE-TOOLTIP-DRY sprint to task_board with all 3 tasks registered. Verified no duplicate sprint IDs, no duplicate task IDs across active_sprints. All tasks marked TODO status, dependencies declared, zone fields populated.
**what-considered:**
- Atomic write: Used Python json.dump (atomic for small updates on POSIX) to read + modify + write orch-state.json. No partial-write risk.
- Task ID format: QUE-TOOLTIP-DRY-1a, QUE-TOOLTIP-DRY-1b, QUE-TOOLTIP-DRY-3 (matches architect's naming in brief; 1b chosen over 2 per architect task numbering).
- Task ownership: 1a and 1b both dev-kinh-dich (same zone team); 3 is dev-mcp-server. Allows parallel spawn by dev-team per zone.
**why-decision:** Atomic update prevents race; no new task-ID contention detected across 28 active sprints.
**why-change:** no change from plan
