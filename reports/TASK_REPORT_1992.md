## Task Report 1992
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
scope: P2 Presence Registry QA Gate (TASK_1992 gates TASK_1990 + TASK_1991)
branch: main (TASK_1990 commit 20bed11d, TASK_1991 commit 03fb2cc1)
verdict: APPROVED

### Checks

tests: 130 pass (coordination suite) / 0 fail | full suite: 53 fail = baseline (no new failures) | tsc: 0 errors

ddd: PASS (docs-only changes in TASK_1990/1991; zero source-file modifications in P2)
security: PASS (no code changes in P2 scope)

### DoD Results — All 7 GREEN

**DoD-1 REGISTER** (25 inline assertions):
`claimTask({task_id:"session-presence:<uuid>", task_kind:"session-presence", …, ttl_seconds:1800, payload:{agent_id,host,started_at,current_task}})` → `claimed:true`. PASS.

**DoD-2 ROSTER READ**:
`listHeldTasks({kind:"session-presence"})` returns row with `owner_client_session` = SESSION_A UUID and `payload` JSON string containing all 4 required fields (agent_id/host/started_at/current_task). SELECT confirmed at coordinationStore.ts:758-762. PASS.

**DoD-3 CROSS-SESSION VISIBILITY**:
SESSION_B reads global roster — SESSION_A row present, `owner_client_session` ≠ SESSION_B UUID. Both presence rows in same `task_list_held` result (no session-scoped filter). PASS.

**DoD-4 CURRENT_TASK UPDATE** (release+reclaim pattern):
`releaseTask(PRESENCE_ID_A, SESSION_A)` → `released:1`. Immediate `claimTask` with `current_task:"TASK_1992-active-work"` → `claimed:true`. Roster re-read confirms updated `payload.current_task`. PASS. (task_heartbeat does NOT patch payload — release+reclaim is the documented and verified update path.)

**DoD-5 NEGATIVE + CONTRAST** (critical P2 correctness):
Same `gcExpiredLocks` run on 2-row DB:
- Row 1: `task_kind="session-presence"`, expires_at 400s ago → **original deleted, ZERO orphan-signal emitted** (not in ORPHAN_EMIT_ALLOW_LIST at coordinationStore.ts:395-400). PASS.
- Row 2: `task_kind="sprint-task"`, expires_at 400s ago → **orphan-signal emitted** (`orphan-signal:sprint-task:TASK_1992-contrast`, redispatch_count=1). CONTRAST PASS.
- gcExpiredLocks deleted=2 (both originals). 1 row remaining (sprint-task orphan-signal only).
- P1.5/P2 separation holds: dead session's presence row silently GC'd, never adopted.

**DoD-6 REGRESSION**:
Full suite authoritative run: **53 fail = exact TASK_1989 baseline**. New-fail count = 0.
Baseline diff:
- FU-LOCKSTORE-EXPIRED-GC.test.ts: 5 pre-existing (written pre-P1.5; countRows includes orphan-signal rows that P1.5 added — test expectation not updated)
- timeout/network/VPS-schema/refine-isolation: 48 pre-existing
- P2 new failures: 0
Coordination suite: 130/130 PASS (task-lock-coordination-store, coordination-tools, kind-migration, DWF-phase2, P1-final, P1-failure-mode-matrix). tsc: 0 errors.

**DoD-7 DOC-CODE CONSISTENCY**:
- `listHeldTasks` SELECT (coordinationStore.ts:757-762) includes `owner_client_session` and `payload` columns → field names the router's Phase A.5 reads are live in production SQL. PASS.
- dispatch-claim SKILL.md § Phase A.5 (lines 362-374): row structure documents `owner_client_session`, `payload.{agent_id,host,started_at,current_task}`, `heartbeat_at`, `expires_at` — all present in SELECT.
- task-lock SKILL.md line 107: "Output now includes owner_client_session + payload (P2 extension)" — matches live query.
- CLAUDE.md Phase A.5 (lines 14-18): `task_list_held(kind="session-presence")` + log format `[agent_id/host/current_task]` — field names consistent with payload contract.
- ORPHAN_EMIT_ALLOW_LIST (coordinationStore.ts:395-400) and reaper startup log both exclude `session-presence`.

### Gate Decision

ALL 7 DoD checks GREEN → APPROVED.

TASK_1990 (20bed11d) — dispatcher presence self-registration: REVIEW → DONE
TASK_1991 (03fb2cc1) — router Phase A.5 roster read: REVIEW → DONE
TASK_1992 — QA gate: REVIEW → DONE

**P2 done_verified. Requirement #2 (cross-team "who's working" visibility) fully shipped: registry (TASK_1990) + roster read (TASK_1991) + negative-separation proof (DoD-5). This UNBLOCKS P3-AF-1 (TASK_1994).**

### Note on Gateway Binding

MCP gateway not bound in QA sub-session (INV-GATEWAY-1 confirmed). Behavioral verification executed via in-memory SQLite using the same coordinationStore.ts functions that the live MCP tools call. This is equivalent to calling through the gateway — the coordinationStore.ts layer is the same code path in both cases.

DJ: docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-qa.md § qa-S6
