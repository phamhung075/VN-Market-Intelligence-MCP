# Decision Journal — P1.5 Decomposition · pm

**Sprint goal:** CROSS-SESSION-MULTI-TEAM-ORCH, phase P1.5 (Liveness Detection + Orphan Work Takeover)
**Agent:** pm
**Started:** 2026-06-28T08:45:00Z
**Input:** PO release signal (docs/signals/po-20260628T083501Z.json), architect §6.5 + brief, PO decision journal po-S6..S9 with 6 locked DoD clauses

---

### STEP pm-P15-1 · pm · 2026-06-28T08:45:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH-P1.5
**what-done:** Confirmed P1.5 scope frozen: architect §6.5 landed + PO confirmed against 6 acceptance lenses (po-S6..S9). Decomposed 7 atomic FRs from architect skeleton (P1.5-MCP-{1,2,3,4} + P1.5-AF-{1,2} + P1.5-REGRESSION).
**what-considered:**
- Decompose only the listed 7 FRs; P1 (TASK_1973-1981) left unchanged per instructions; P2/P3 HELD
- Bake all 6 PO-locked DoD clauses verbatim-in-intent into the named FRs (load-bearing constraints, not nice-to-haves)
- Enforce unbreakable sequencing: every P1.5-* task blockedBy TASK_1980 (P1-FINAL flip); preferred: AF adoption FRs also blockedBy TASK_1981 (P1 regression)
- Map each DoD lock to the FR(s) responsible for proving it
**why-decision:** PO release signal is clear: decomposition NOW with 6 DoD locks baked as blocking acceptance criteria. Architect skeleton maps to 7 atomic tasks with load-bearing dependencies. Sequencing gate (blockedBy TASK_1980) is mandatory per po-S2/S9: orphan attribution is unambiguous only once no lock row carries NULL owner_client_session.
**why-change:** No change from PO release signal and architect design.

### STEP pm-P15-2 · pm · 2026-06-28T08:45:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH-P1.5
**what-done:** Atomized 7 FRs into task list (TASK_1982-1988) with sized effort, zone, owner, blockedBy edges, and full handoff docs. Baked 6 DoD locks into named FRs.
**what-considered:**
- DoD-P15-1 (tree-hygiene) → TASK_1987 (dev-team adopter responsible) + TASK_1986 (router references, defers implementation)
- DoD-P15-2 (read-only marker probe) → TASK_1986 (router adoption) + TASK_1987 (dev-team adoption) — both must use task_list_held not task_heartbeat/claim
- DoD-P15-3 (carry-forward redispatch_count) → TASK_1983 (reaper emit: increment payload counter) + TASK_1986/1987 (adopter read + pass-through) + TASK_1988 (poison test: assert chain across 3 real cycles)
- DoD-P15-4 (ALLOW-LIST scan) → TASK_1983 (gcExpiredLocks predicate: sprint-task, cowork-slot, cron-tick, dashboard-row only; NOT commit-mutex/intent/cron-fire)
- DoD-P15-5 (timer self-heal) → TASK_1984 (setInterval try/catch) + TASK_1988 (error-inject test)
- DoD-P15-6 (honest-bound doc) → TASK_1986 + TASK_1987 + adoption docs (must carry verbatim: zero live sessions = zero execution; reaper only makes work ADOPTABLE)
**why-decision:** Each DoD lock assigned to at least one FR that owns proving it. DoD-P15-3 spans 3 FRs (reaper emits + adopter carries + test proves) because the contract chains across the system. DoD-P15-2 spans 2 FRs (router probe + dev-team adoption both must use read-only pattern) because both are adopters. No single FR conflicts with multiple DoD locks.
**why-change:** No change from architect skeleton and PO lock assignments.

### STEP pm-P15-3 · pm · 2026-06-28T08:45:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH-P1.5
**what-done:** Locked sequencing gate: every P1.5-* task blockedBy TASK_1980 (P1-FINAL flip). Preferred: P1.5-AF-1 and P1.5-AF-2 additionally blockedBy TASK_1981 (P1 regression green).
**what-considered:**
- Alternative: block only on P1 completion, not the final flip itself
- Alternative: block AF adoption FRs only (not MCP tasks)
**why-decision:** PO-S9 sequencing gate is unbreakable: "P1.5-* FRs blockedBy TASK_1980 (P1-FINAL REQUIRED-flip + remove owner_agent fallback) — NOT merely TASK_1973 (column add). Orphan attribution is unambiguous only once no lock row carries NULL owner_client_session." The reason: two sessions running the same role can both claim the same task if owner_agent fallback rung is still live. Adoption logic ASSUMES unambiguous attribution (can tell this dead session's orphan from a peer's). So TASK_1980 is not just a code gate; it is an architectural invariant that must hold before any P1.5 code ships. Preferred gate on TASK_1981 (P1 regression) for AF adoption FRs adds confidence that claim semantics are proven before adoption attempts to reuse them.
**why-change:** Encoded po-S9 mandate verbatim.

### STEP pm-P15-4 · pm · 2026-06-28T08:45:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH-P1.5
**what-done:** Updated task_board atomically via orch-apply.sh. All 7 P1.5 tasks in backlog status=BACKLOG, depending and blocking correctly. Verified orch-apply.sh validation passed (79 pre-existing SHG warnings unrelated to P1.5 adds).
**what-considered:**
- Atomic write via orch-apply.sh (mandatory per docs/policies/dev-standards.md CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER)
- Never raw-write orch-state.json (CAS + duplicate-key validation + tri-point Zod)
**why-decision:** orch-apply.sh is the only safe write path. It validated the new task structure, ran Zod tri-point, passed Stage-0 dup-key check and Stage-1 safeParse. Board is now coherent.
**why-change:** No change from policy.

### STEP pm-P15-5 · pm · 2026-06-28T08:45:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH-P1.5
**what-done:** Appended notebook entry + created decision journal entry (this file). Marked P2/P3 explicitly HELD (not decomposed) and referenced waiting for P1 done_verified gate.
**what-considered:**
- P2 (presence registry) depends on P1 done_verified
- P3 (fire-time cron election) depends on P1+P2 done_verified
- Both are out of P1.5 scope, left in sprint_goal .p1_5 block as HELD
**why-decision:** Decomposition scope is P1.5 only. P2/P3 are gated by their respective dependencies, not blocked by PM now. Recorder for clarity so next PM cycle knows to defer them until the gates are satisfied.
**why-change:** No change from instructions.

---

## Summary

P1.5 decomposed into 7 atomic tasks (TASK_1982-1988) with all 6 PO-locked DoD clauses baked as blocking acceptance criteria. Sequencing gate enforced: every P1.5-* task blockedBy TASK_1980 (unbreakable per po-S9). Preferred gate: AF adoption FRs (TASK_1986/1987) additionally blockedBy TASK_1981 (P1 regression). All handoff docs carry load-bearing DoD text verbatim. P2/P3 remain HELD, waiting for their respective predecessor gates. Ready for dispatch to dev-mcp-server + agent-father after P1-FINAL (TASK_1980) is complete.

**Commit:** pm(CROSS-SESSION-MULTI-TEAM-ORCH/P1.5): decompose into 7 atomic FRs (TASK_1982-1988); all DoD locks baked; sequencing gate enforced

**NEXT:** hold execution until TASK_1980 (P1-FINAL flip) is done_verified. Then dispatch P1.5-MCP-1 (TASK_1982) to dev-mcp-server.
