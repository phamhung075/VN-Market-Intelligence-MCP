---
task_id: SSOT-W1-ZOD-SCHEMA-MODEL
sprint: SSOT-INTEGRITY-PERIMETER
wave: 1
rank: 1
type: dev
size: M
zone: apps/mcp-server/
priority: high
owner: dev-mcp-server
created_at: 2026-06-27T16:50:00Z
---

# SSOT-W1-ZOD-SCHEMA-MODEL

**Current state:** `apps/mcp-server/src/infrastructure/orchStateSchema.ts` is ~95% complete. Schema exists with all required structures.

**What's shipped:**
- StatusEnum: 12-value frozen set (including READY as ADD-1, PO-ratified 2026-06-27)
- TERMINAL_SET exported (5 values: DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED)
- All-9-lane nested schema via Lane = z.array(TaskSchema) reused across all flat lanes
- .strict() on OrchStateSchema and TaskBoardSchema (rejects unknown keys, subsumes jq-nesting corruption class)
- superRefine on OrchStateSchema for head.active_task_id referential integrity (hard gate, already working)
- checkLaneCoherence() exported (standalone function, warn-only during SHG migration)
- checkRefIntegrity() fully implemented with FileResolver injection (keeps schema unit-testable, closes 6 dangling refs)
- TaskSchema validates status: StatusEnum (primary corruption guard)
- TaskSchema and SprintSchema use .passthrough() (intentional during SHG migration; documented for post-SHG-5 .strict() promotion)

**Delta — what this task hardens:**
1. **Test coverage for Lane reuse:** Verify all 9 flat lanes (backlog, done, done_verified, in_progress, qa, ready, review, archive in lane iteration) + 2 nested (active_sprints/closed_sprints) use the shared Lane type. Compile-time omission would be visible in TaskBoardSchema definition — verify by inspection and type tests.
2. **QA-1 gate (all-lane status enum injection):** Write test that injects a non-enum status ("PARKED", "done_verified", "FOLDED") into a sample task in EACH of the 9 lanes on a scratch copy → validator must reject on EVERY lane. (This closes the 3-of-9 false-green gap.)
3. **QA-3 gate (unknown key rejection):** Inject an unknown key under a task_board object with .strict() → validator rejects with unrecognized_keys issue + migration hint.
4. **QA-4 gate (dangling ref rejection):** Already tested in Stage-1c of orch-validate.mjs, but verify schema's checkRefIntegrity() function is exported and tested in isolation (with mock FileResolver).
5. **Documentation of .passthrough()→.strict() progression:** Add a comment in TaskSchema and SprintSchema explaining when/why .strict() is promoted post-SHG-5 (once active-sprint tasks are fully migrated to hot-field stubs). Link to SSOT-W1-SERVER-ENFORCE task.
6. **Reconcile RED 1837a + 1980-f2:** Verify tests pass after TaskBoardSchema is applied to live data snapshots from those failing tests. (Related to SSOT-W1-SERVER-ENFORCE but test naming/structure may need minor updates here.)

**Acceptance criteria:**
- QA-1, QA-3, QA-4 test gates pass (each tests 1+ lanes, 1+ status values, 1+ unknown keys, 1+ dangling refs as appropriate).
- `z.infer<typeof OrchStateSchema>` compiles and matches expected type.
- All 9 lane usages of Lane are visible in TaskBoardSchema definition (review by inspection).
- Tests cover checkLaneCoherence() and checkRefIntegrity() in isolation with mock resolvers.
- .passthrough()→.strict() transition documented in schema comments.
- RED 1837a and 1980-f2 tests pass post-schema integration.
- No type errors in full mcp-server test suite.

**Files touched:**
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts` (add tests, add documentation)
- `apps/mcp-server/src/infrastructure/*.test.ts` (existing tests verify all 9 lanes, QA gates)

**Depends on:** None (this is rank-1; unblocks rank-2).

**Time estimate:** 2h (audit existing code, add test coverage for all 9 lanes, verify QA gates, documentation).
