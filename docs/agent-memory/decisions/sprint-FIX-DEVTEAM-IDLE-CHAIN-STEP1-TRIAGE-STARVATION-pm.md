# Decision Journal — Sprint FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION · pm

**Sprint goal:** Decompose architect brief into atomic dev task rows. Plan-only phase only — zero implementation, zero flow-doc edits.
**Agent:** pm
**Started:** 2026-07-29T05:34:15Z

---

### STEP pm-S1 · pm · 2026-07-29T05:34:15Z
**task-id:** FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION
**what-done:** Decomposed architect brief `docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md` (§6 file list) into 5 sequential atomic dev task rows. All rows added to `.task_board.backlog[]` via `orch-apply.sh`. Parent row remains plan_only:true, supervised:true (UNCHANGED).

**what-considered:**
- Atomic scoping: the brief's two co-required parts (aged round-robin Part 1 + durable inbox Part 2) cannot be split into parallel work — both coordinate around the same `dev_team_idle_chain` root key and share SSOT files list per §8. All 5 tasks are sequential.
- File grouping: §6 lists 10 files/entities; grouped into 5 tasks per zone/concern: (1) schema+jq utilities (infrastructure layer), (2) main.md (interface/orchestration), (3) drain-signals.md/js (interface/signal), (4) test instruments (test/audit), (5) conservation guard+docs (test/docs). Natural separation by layer + concern.
- Task sizing: aiming for ~2h atomic units (~150L prose + 200L code per task). T1 ~1.5h (schema + 2 jq functions, small). T2 ~2.5h (large flow rewrite). T3 ~2h (drain reorder + script). T4 ~2h (test harness + audit extension). T5 ~1h (1-line jq + docs). Total ~9h downstream, sequential no parallelism.
- Dependency ordering: T1 (schema) unblocks T2 (flow). T2 → T3 (drain must know about Step 1's durable-inbox read). T3 → T4 (tests must run against implemented code). T4 → T5 (conservation guard depends on implementation complete).
- Owner assignment: dev-mcp-server for infrastructure/scripts (T1,T3,T5). dev-team for orchestration flow (T2). qa-responder for test harness (T4). Standard zones.
- Acceptance criteria mapping: AC-1 (fairness) → T2+T4. AC-2 (durability) → T3+T4. AC-3 (cap byte-unchanged) → T5 verification. AC-4 (satisfiability) → T4 same-instrument. All ACs covered atomically.

**why-decision:**
- Sequential-only choice: brief's own §8 explicitly states `.dev_team_idle_chain` is shared SSOT work and must not be parallel-worktree-isolated (shared files list implies sequential dispatch). Parallelizing any 2+ tasks would risk .head clobber races or schema validation failures mid-flight.
- T1→T2 dependency: main.md's rotation-select logic must read rotation_selected($doc) jq function + call the new stamp-writer script; those utilities must exist before the flow doc references them.
- T3 placement after T2: drain-signals.md/js documents and implements the durable-append-to-`.dev_team_idle_chain.pending_triage_inbox`; T2 must land first so Step 1's read/clear logic is stable before drain changes.
- AC-3 as T5 verification task: the acceptance criterion (BOUNDED-1 cap + WIP gate byte-unchanged) is not an implementation task — it is a verification gate. Placing it in T5 as a git-diff check + grep confirmation makes explicit that this is gated, not an assumed carry-forward.

**why-change:** No change from architect's §6 file list — this journal records the *decomposition structure* PM applied to mechanize the brief, not a re-architecture. Architect's constraint-proof (AC-3, HEAD-single-writer §8 risk) is preserved exactly.

---

## Board state after STEP pm-S1

**minted task rows (backlog):**
- TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES (S, high, depends=[])
- TASK-DEVTEAM-IDLE-CHAIN-2-MAIN-FLOW (L, high, depends=[T1])
- TASK-DEVTEAM-IDLE-CHAIN-3-DRAIN-DURABILITY (M, high, depends=[T2])
- TASK-DEVTEAM-IDLE-CHAIN-4-TESTS-AC1-AC2-AC4 (M, high, depends=[T3])
- TASK-DEVTEAM-IDLE-CHAIN-5-CONSERVATION-DOCS (S, high, depends=[T4])

**parent row state (UNCHANGED):**
- FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION: status=BACKLOG, plan_only=true, supervised=true, owner=pm, next_agent=pm

**next phase:** Implementation is a downstream out-of-band or Supervised-Lane-Sweep dispatch (same structural reason this row required out-of-band spawn — the SLS lane itself is starved until the fairness fix ships).

---

## RETURN
DECOMPOSED: architect brief §6 file list into 5 sequential atomic dev tasks per PM standard (scoped ~2h each, atomic per zone/concern, dependency-ordered, ACs mapped 1:1).
BOARD: 5 rows minted in backlog[], all status=BACKLOG, all priority=high.
COMMIT: pathspec-scoped git add of docs/data/orch/orch-state.json only (not .head, not other agents' zones).
NEXT: downstream dev team (or SLS post-fix — same out-of-band constraint as parent). No auto-advance (parent row supervised:true preserved).
