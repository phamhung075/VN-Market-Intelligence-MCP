# Decision Journal — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · pm-decomposition

**Sprint goal:** P1 (Attribution Fix) decomposition only. P1.5/P2/P3 explicitly held.
**Agent:** pm
**Task ID:** CROSS-SESSION-MULTI-TEAM-ORCH (umbrella sprint task)
**Decomposition date:** 2026-06-28T08:30:00Z

---

### STEP pm-S1 · PM-DECOMPOSE-P1 · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH (sprint-level)

**what-done:** Decomposed P1 (attribution fix — the unblocker) into 9 atomic FRs with explicit sequencing + dependency DAG. Created 9 TASK_NNN.md handoff files (TASK_1973-1981). Updated task_board.backlog via orch-apply.sh with TODO/BACKLOG status and correct depends_on/blocks relationships. Recorded notebook + decision journal. **HELD P1.5/P2/P3 decomposition** (P1.5 architect §P1.5 not yet landed; P2/P3 remain future phases).

**what-considered:**
- Option A: BUNDLE P1 into one large task (8-week burn, not actionable)
- Option B: Atomize into 9 tasks (~2h each), sequence with explicit DAG, allow parallel Tier-1 (MCP-2/3/AF-1..4 in parallel after MCP-1)
- Option C: Decompose P1 + P1.5 together (architect §P1.5 not landed; would create unstable gate)
- Option D: Skip P1-FINAL entirely (PO said no — violates locked DoD gate; would re-open same-role multi-team bug)

**why-decision:** Option B is correct: P1 is the unblocker (the prerequisite for everything downstream), is self-contained, and has clear sequencing (MCP-1 FIRST, then Tier-1 parallel, then P1-FINAL point-of-no-return, then acceptance tests). Decomposing P1.5 now would create a gate on an incomplete brief section — violated instructions "hold P1.5 decomposition until architect §P1.5 lands." Option D violates PO's locked gate and brief's hard constraint.

**why-change:** No change from brief §8 + PO signoff. PM simply executes the decomposition as specified.

---

### STEP pm-S2 · PM-SEQUENCING-DAG · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH

**what-done:** Encoded sequencing summary (brief §Sequencing Summary) as explicit task_board dependency DAG: TASK_1973 has no dependencies (ready immediately), TASK_1974/1975/1976/1977/1978/1979 all depend on TASK_1973 (Tier-1 can parallel after MCP-1 done), TASK_1980 depends on all Tier-1 tasks (point-of-no-return gate), TASK_1981 depends on TASK_1980 (acceptance tests last). Encoded in task_board: depends_on=[...], blocks=[...] fields per FM.

**what-considered:**
- Serial sequencing (MCP-1 → MCP-2 → MCP-3 → AF-1 → AF-2 → AF-3 → AF-4 → P1-FINAL → P1-REGRESSION) — safe but slow (~18-22 weeks if 2h per task + overhead)
- Aggressive parallelism (all Tier-1 in parallel from day 1 without MCP-1) — violates migration constraint (column must exist before matching-ladder code runs)
- Hybrid (MCP-1 serial, Tier-1 parallel) — correct per brief §Sequencing Summary

**why-decision:** Hybrid is optimal: MCP-1 must be serial (schema change prerequisite). Tier-1 (MCP-2/3/AF-1/2/3/4) can parallel independently on separate zones (mcp-server vs .claude/ skills/flows). P1-FINAL and P1-REGRESSION must be serial (they are acceptance gates). This enables 6-way parallelism during the Tier-1 window while honoring all constraints.

**why-change:** No change from brief sequencing. PM simply encoded it.

---

### STEP pm-S3 · PM-P1-FINAL-LOCKED-GATE · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH

**what-done:** Marked TASK_1980 (P1-FINAL) as **LOCKED DoD gate (PO-mandated, non-negotiable)** in the handoff file and task_board entry. Documented the acceptance criteria: owner_client_session REQUIRED in tool schemas + remove owner_agent from ALL ownership WHERE predicates. Included explicit warning in TASK_1980 handoff: "If dropped, same-role multi-team bug silently re-opens." Cited PO decision journal (po-S2) as the source of this lock.

**what-considered:**
- Make P1-FINAL optional (allow weakening the gate during rollout) — violates PO's explicit locked gate + brief's hard constraint
- Move P1-FINAL earlier (before all callers ship) — violates brief §7 migration sequence (must have callers passing field first)
- Make P1-FINAL acceptance optional — violates PO's locked gate definition

**why-decision:** PO explicitly locked this gate (po-S2 decision: "the one gap is acceptance-bar strength… elevated brief migration-step-5 from implicit to explicit blocking acceptance criterion"). The hard constraint is non-negotiable: "Two sessions running the same role (two dev teams, two analysis teams) share `owner_agent`. Therefore the authoritative ownership key MUST be the per-session UUID (`owner_client_session = CLAUDE_CODE_SESSION_ID`). **Never `owner_agent`.** If step 5 (P1-FINAL) is dropped, both sessions' ownership logic falls through to role match = same-role multi-team bug re-opens. This must be encoded as a ONE-WAY point-of-no-return gate, gated last after all callers ship.

**why-change:** No change from PO signoff. PM enforces the locked gate at decomposition time.

---

### STEP pm-S4 · PM-P1-5-HELD · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH

**what-done:** HELD P1.5 (Orphan Detection + Work Takeover) decomposition. Verified architect brief §P1.5 section exists in sprint_goal .p1_5 block (PO pre-approved shape), but instructions say "DO NOT decompose P1.5 into FRs yet — its concrete architect §P1.5 section has NOT landed in the brief." Did not decompose P1.5. Left the .p1_5 block in sprint_goal untouched. Documented in notebook + DJ that P1.5 is additive, does not block P1, and decomposition is deferred.

**what-considered:**
- Decompose P1.5 now (available in sprint_goal .p1_5 block) — violates explicit instruction "hold P1.5 FR decomposition until the architect's §P1.5 lands"
- Hold P1.5 entirely (no pre-approval recorded) — would lose the PO pre-approved shape already captured in sprint_goal
- Decompose P1 + P1.5 together — creates gate on incomplete spec (§P1.5 not "landed" in the brief, only pre-approved in decision context)

**why-decision:** Instructions are explicit: "pm decomposes P1 now, holds P1.5 FRs until architect §P1.5 + po confirm." The .p1_5 block in sprint_goal is a shape pre-approval (PO conditional approval), not a full specification. The brief's main §P1.5 section (486L, per PO decision journal) must land before decomposition. This prevents unstable decomposition on incomplete spec.

**why-change:** No change. Instruction adherence.

---

### STEP pm-S5 · PM-HANDOFF-CREATION · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH

**what-done:** Created 9 atomic TASK_NNN.md handoff files with full acceptance criteria, files-to-read, files-to-create/modify, dependencies, knowledge required, and developer implementation notes for each. All handoffs cite the brief and include RAW-verify notes where applicable (especially MCP tasks: "coordination.db lives in the Docker named volume — host ./data/coordination.db is a stale decoy").

**what-considered:**
- Minimal handoffs (1-page, low detail) — insufficient for async 2+ week parallelism
- Full handoffs (~4-6 pages each, detailed AC + implementation notes) — actionable for dev-mcp-server and agent-father teams
- Hybrid (brief + links to architect brief) — handoffs should be self-contained; links alone cause context gaps

**why-decision:** Full handoffs enable async parallel execution. Dev teams need AC, file paths, and implementation strategy in one place (do not need to re-read the architect brief unless for deep context). Handoffs include explicit RAW-verify notes to prevent tool-against-stale-data errors (a recurring trap per project memory).

**why-change:** No change from PM flow (Step 3b: handoffs created per template).

---

### STEP pm-S6 · PM-ORCH-STATE-ATOMIC-WRITE · 2026-06-28T08:30:00Z

**task-id:** CROSS-SESSION-MULTI-TEAM-ORCH

**what-done:** Updated task_board.backlog atomically via orch-apply.sh (route through script/orch-apply.sh per dev-standards.md CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER). 9 tasks added with correct sprint/priority/zone/depends_on/blocks fields. Validators passed (74 pre-existing SHG warnings, non-blocking). Write succeeded, file CAS-renamed atomically.

**what-considered:**
- Raw git add + commit to orch-state.json — violates SSOT-W1-ORCH-APPLY-WRAPPER contract; would bypass Zod validation + CAS guard
- Manual jq edit + mv — violates atomic write contract; raceablind with concurrent writers
- orch-apply.sh — correct per policy

**why-decision:** orch-apply.sh is the canonical write path. Enforces atomic rename (CAS guard), Zod tri-point validation, dup-key detection, and coherence warnings. Use it.

**why-change:** No change from PM flow.

---

## Summary

**P1 Atomic FRs Decomposed (9 tasks, sequenced, locked gate encoded):**

| Task ID | Title | Owner | Status | Blocks |
|---------|-------|-------|--------|--------|
| TASK_1973 | P1-MCP-1: SQL migration | dev-mcp-server | TODO | 1974, 1975 |
| TASK_1974 | P1-MCP-2: coordinationStore matching-ladder | dev-mcp-server | BACKLOG | 1980 |
| TASK_1975 | P1-MCP-3: coordinationTools params | dev-mcp-server | BACKLOG | 1980 |
| TASK_1976 | P1-AF-1: CLAUDE.md step 2.5 | agent-father | BACKLOG | 1980 |
| TASK_1977 | P1-AF-2: dispatch-claim SKILL | agent-father | BACKLOG | 1980 |
| TASK_1978 | P1-AF-3: leader-lock delete anti-pattern | agent-father | BACKLOG | 1980 |
| TASK_1979 | P1-AF-4: task-lock SKILL rebind | agent-father | BACKLOG | 1980 |
| TASK_1980 | **P1-FINAL: REQUIRED flip (LOCKED GATE)** | **dev-mcp-server** | **BACKLOG** | **1981** |
| TASK_1981 | P1-REGRESSION: acceptance tests | qa + dev-mcp-server | BACKLOG | — |

**P1 Sequencing:**
- Tier-0: TASK_1973 (MCP-1, serial, must be first)
- Tier-1 (parallel after Tier-0): TASK_1974/1975/1976/1977/1978/1979 (MCP-2/3, AF-1/2/3/4)
- Tier-2 (serial after Tier-1): TASK_1980 (P1-FINAL, point-of-no-return)
- Tier-3 (serial after Tier-2): TASK_1981 (P1-REGRESSION, closes P1)

**P1.5/P2/P3: HELD** (not decomposed)

**NEXT:** dev-mcp-server to pick up TASK_1973 (SQL migration) → after TASK_1973 DONE, dispatch Tier-1 wave in parallel → after Tier-1 DONE, dispatch TASK_1980 → after TASK_1980 DONE, dispatch TASK_1981. After P1 done_verified, escalate P1.5 decomposition to architect + PO.
