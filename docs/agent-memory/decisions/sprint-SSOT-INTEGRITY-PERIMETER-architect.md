---
task-id: ARCH-SSOT-INTEGRITY-PERIMETER
date: 2026-06-27
agent: architect
sprint: SSOT-INTEGRITY-PERIMETER
verdict: DESIGN_COMPLETE
---

**task-id:** ARCH-SSOT-INTEGRITY-PERIMETER

## Architect Decision Journal — SSOT-INTEGRITY-PERIMETER

### What Was Designed

Architecture brief for the SSOT Integrity Perimeter Hardening sprint. The brief covers 5 required sections: (1) orchStateSchema.ts as the single SSOT for status vocabulary and all-9-lane nested schema, (2) orch-validate.mjs as the canonical two-stage validator CLI, (3) dual-point enforcement (Claude hook + orchStateStore.ts server-side), (4) orch-apply.sh wrapper + bash shim contract, (5) Wave-1 decomposition into 6 atomic tasks for PM.

### Key Design Decisions

**Why Zod over extended bash-jq gates:**
The former `orch-state-validate.sh` scanned 3 of 9 task-bearing lanes (confirmed false-green). Extending lane-by-lane in bash recreates the same fragility with each new lane. A nested Zod schema validates every lane by construction — you cannot add a lane to `TaskBoardSchema` without the compiler seeing it. `zod` is already a production dep in apps/mcp-server. `z.infer` eliminates hand-maintained type drift.

**StatusEnum 12-value set (ADD-1, PO option-a):**
READY is the 12th value. Rationale: a `ready[]` lane exists in `task_board`; READY in the ready lane is lane-coherent. The ARCH-SSOT-INTEGRITY-PERIMETER task itself (status=READY) proved the 12th value is required at sprint-kickoff — without it the validator rejects the active sprint's own task, deadlocking the system. Only path: ADD-1 option-a (add READY). Alternative option-b (relabel ARCH-SSOT-INTEGRITY-PERIMETER to TODO) was PO-rejected.

**Stage-0 dup-key must precede JSON.parse:**
`JSON.parse` silently collapses duplicate keys to the last value — data corruption without error. Only option: tokenize raw text before parse. The recursive-descent scanner in orch-validate.mjs is minimal (no external dep) and correctly handles string escape sequences. No reuse opportunity from Zod (Zod operates on the post-parse JS object).

**Lane coherence starts WARN-only (ADD-2):**
Live data has ~72 coherence violations (backlog[] contains REVIEW/IN_PROGRESS/DONE stragglers from pre-SHG-2 migration). Promoting to hard-fail before the data migration runs would block all orch-state writes — system halt. Exporting `checkLaneCoherence()` as a standalone function (not a `superRefine`) lets the validator CLI report warnings without blocking, while keeping the promotion path (add `superRefine` post-SHG-2+SHG-4) in the same file.

**Dual-point is mandatory (not redundant):**
Memory note `project_orchstate_zod_dual_point_validation`: "hook is blind to server-internal writes." The PreToolUse hook catches Claude tool-call writes (Write|Edit tools). The server-side `safeParse()` catches internal mcp-server writes (task_claim, scheduler jobs). Removing either point leaves a writer class unguarded. Both must import the ONE schema from orchStateSchema.ts — no inline copies.

**PostToolUse backstop is non-blocking:**
The Bash backstop cannot block (action already happened). It surfaces a structured warning prompting git-rollback or repair. This is a deliberate tradeoff: blocking PostToolUse would deadlock the system if a legitimate Bash call matched the orch-state filter heuristic. Fix-forward is the recovery path.

**Wave-1 task naming follows code comments:**
The 6 task IDs (SSOT-W1-ZOD-SCHEMA-MODEL, SSOT-W1-ZOD-VALIDATOR-CLI, SSOT-W1-HOOK-ENFORCE, SSOT-W1-SERVER-ENFORCE, SSOT-W1-ORCH-APPLY-WRAPPER, SSOT-W1-BASH-SHIM) are already embedded in the comments of the shipped files. Following the same names avoids renaming churn and keeps the brief, code, and task board aligned.

**What was not considered:**
- A new standalone validation microservice: overkill, adds network hop, no benefit over in-process Zod.
- Re-implementing the duplicate-key scanner as a separate npm package: unnecessary dep; the 130-line tokenizer in orch-validate.mjs suffices for a single-file JSON.
- Blocking the PostToolUse backstop on validation failure: rejected (fix-forward is safer than system halt).

### Output

`docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md`

### Risk Flags Surfaced

- RISK-1 (HIGH): OrchStateTaskBoardTask.status still typed as hand-maintained union with `| string` escape hatch → must be replaced by z.infer<typeof StatusEnum> in SSOT-W1-SERVER-ENFORCE.
- RISK-2 (MED): ~72 lane-coherence violations in live data mean coherence warnings will appear on every validator run until SHG-2+SHG-4 migration completes. PM should sequence accordingly.
- RISK-3 (MED): closed_sprint stubs in hot file have no `tasks[]`. SprintSchema defaults `tasks: []` to handle gracefully; monitor if stubs gain tasks field in future (schema catches it immediately).

### Next Step

PM decomposes Wave-1 into 6 atomic zone tasks (named in brief § Section 5) and assigns dev-mcp-server + scripts zones.
