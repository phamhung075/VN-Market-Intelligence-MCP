# PM Decomposition: SSOT-INTEGRITY-PERIMETER Wave-1

**task-id:** ARCH-SSOT-INTEGRITY-PERIMETER (moved to done after brief delivery)

**date:** 2026-06-27T16:50:00Z

**agent:** pm-agent

**decision:** Architect ARCH-SSOT-INTEGRITY-PERIMETER brief is complete (docs/architecture-briefs/SSOT-INTEGRITY-PERIMETER-hardening.md delivered commit c0ed9587). PM decomposed into 6 Wave-1 audit-then-harden zone tasks and created SSOT-INTEGRITY-PERIMETER sprint.

## Decomposition Summary

The architect's brief specified 6 Wave-1 tasks. Audit found that all 6 have 85-95% of their code already shipped (NOT build-from-zero tasks — audit-then-harden pattern). Each task is scoped to the delta (gap between shipped code and brief target spec).

### Task Inventory

| Task ID | Zone | Type | Size | Rank | Status | Depends On | Est. Time |
|---------|------|------|------|------|--------|-----------|-----------|
| SSOT-W1-ZOD-SCHEMA-MODEL | apps/mcp-server/ | dev | M | 1 | TODO | - | 2h |
| SSOT-W1-ZOD-VALIDATOR-CLI | scripts/ | dev | M | 2 | TODO | Rank-1 | 2h |
| SSOT-W1-HOOK-ENFORCE | .claude/ | dev | S | 3 | TODO | Rank-1 | 1.5h |
| SSOT-W1-SERVER-ENFORCE | apps/mcp-server/ | dev | M | 4 | TODO | Rank-1 | 2h |
| SSOT-W1-ORCH-APPLY-WRAPPER | scripts/ | dev | S | 5 | TODO | Rank-2 | 1.5h |
| SSOT-W1-BASH-SHIM | scripts/ | dev | S | 6 | TODO | Rank-2 | 1h |

**Total Wave-1:** 6 tasks, ~10.5 hours, single owner (dev-mcp-server), no external blockers.

### Shipped Code Audit

**SSOT-W1-ZOD-SCHEMA-MODEL** (orchStateSchema.ts): 95% shipped
- StatusEnum (12 values), TERMINAL_SET, all-9-lane nested Lane, .strict(), superRefine, checkLaneCoherence/checkRefIntegrity exported
- Delta: Test coverage all 9 lanes, QA-1/3/4 gates, .passthrough→.strict docs, RED reconciliation

**SSOT-W1-ZOD-VALIDATOR-CLI** (orch-validate.mjs): 95% shipped
- Stage-0 (dup-key), Stage-1 (safeParse), Stage-1b (coherence warn), Stage-1c (ref integrity), auto-fix hints, exit codes
- Delta: Full test coverage, tokenizer correctness, auto-fix completeness, exit code testing

**SSOT-W1-HOOK-ENFORCE** (PreToolUse + PostToolUse): 90% shipped
- orch-state-hook-prewrite.mjs, orch-state-hook-bash-backstop.sh, both registered in .claude/settings.local.json
- Delta: Verify inline-validate wiring (Write/Edit/concat), error handling, QA-5 gate, integration test

**SSOT-W1-SERVER-ENFORCE** (orchStateStore.ts): 60% shipped
- writeOrchStateAtomic with CAS retry, safeParse mentioned, all callers route through
- **RISK-1:** status field still has `| string` escape hatch (8-value instead of 12-value derived)
- Delta: Replace status type with z.infer<typeof StatusEnum>, audit safeParse wiring, QA-6/7 gates, RED reconciliation

**SSOT-W1-ORCH-APPLY-WRAPPER** (orch-apply.sh): 85% shipped
- CAS-mtime, stdin→temp, empty-guard, Zod validation, CAS re-check, atomic rename, exit codes, trap cleanup
- Delta: Codebase audit for ~290 jq writers, CANONICAL pointer in dev-standards.md, QA-2/1 gates, CAS concurrent test

**SSOT-W1-BASH-SHIM** (orch-state-validate.sh): 90% shipped
- Thin shim exec bun orch-validate.mjs, backward compatible, all logic delegated
- Delta: Superset proof docs (G-1..G-5), QA-7 gate, type compilation, RED reconciliation

### Zone Assignment

- apps/mcp-server/ (2 tasks): schema model (rank 1), server enforce (rank 4)
- scripts/ (3 tasks): validator CLI (rank 2), orch-apply wrapper (rank 5), bash shim (rank 6)
- .claude/ (1 task): hook enforce (rank 3)

All assigned to **dev-mcp-server**.

### Dependencies

Rank 1 (schema) unblocks all. Rank 2 (validator) unblocks ranks 5/6 (wrapper/shim). Parallel paths possible once rank 1 ships.

### What-Considered

**(A) Build-from-zero** — REJECTED: 85-95% code shipped; rework is debt.

**(B) Mark all DONE/redundant** — REJECTED: Gaps remain (test coverage, QA gates, type closure, RED reconciliation).

**(C) Audit-then-harden with scoped deltas** — CHOSEN: Efficient, respects DDD zones, clear DoD, small diffs, high merge velocity.

### Head State Update

- status: ready
- active_task_id: SSOT-W1-ZOD-SCHEMA-MODEL
- next_agent: dev-mcp-server
- next_action: Begin Wave-1 audit-then-harden, starting with rank-1 schema task (est. 2h)

ARCH task moved from in_progress[] to done[].

---

**Signature:** pm-agent | 2026-06-27T16:50:00Z
