---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1983-p15-mcp-2-gc-emit-logic
size: M
zone: apps/mcp-server/
depends_on: [TASK_1980, TASK_1982]
blocks: [TASK_1984]
---

## TLDR

Extend `gcExpiredLocks` to emit orphan-signal rows into `task_locks` BEFORE deleting expired lock rows. For each expired lock (heartbeat_age > TTL) of an adoptable kind, create a companion orphan-signal row carrying the original task_id, task_kind, owner_agent, original owner_client_session, durable checkpoint data in payload (last_payload), and incremented redispatch_count. Implement as a single transaction so orphan-signal exists atomically with original row deletion.

## [PM] Planning Context

**Architect Brief Section:** §6.5.2 + §8 (Concrete Follow-On Tasks: P1.5-MCP-2)

**Zone:** apps/mcp-server/

**Acceptance Criteria:**

- [ ] `gcExpiredLocks` pre-GC phase scans: `SELECT task_id, task_kind, owner_agent, owner_client_session, payload, redispatch_count FROM task_locks WHERE expires_at + ? < unixepoch('now') AND task_kind NOT IN ('session-presence', 'orphan-signal') AND task_id NOT LIKE 'published:%'` (ALLOW-LIST: only scan adoptable kinds)
- [ ] For each row matching the predicate: emit orphan-signal row with payload carrying `{original_task_id, original_task_kind, original_owner_client_session, owner_agent, last_payload, orphaned_at: unixepoch('now'), redispatch_count: prior_value+1}`
- [ ] Orphan-signal TTL set to 7200s (2h adoption window) per brief §6.5.2
- [ ] `owner_client_session` in orphan-signal row is NULL (available for any session to adopt)
- [ ] All INSERT-or-REPLACE + DELETE in a single SQLite transaction (atomic, all-or-nothing)
- [ ] Error handling: wrap in try/catch, log non-fatal errors (reaper must be robust to transient DB issues — see DoD-P15-5)
- [ ] ALLOW-LIST predicate (DoD-P15-4): only kinds with a defined resume contract per §6.5.5 table (sprint-task, cowork-slot, cron-tick-with-published-checkpoint, dashboard-row); commit-mutex, intent:*, cron:* fire-claims are NOT emitted
- [ ] RAW-verify: manually query the live coordination.db (Docker named volume) and confirm orphan-signal rows exist with correct structure after a lock expires

**DoD Locks Baked (PO-S8/S9):**
- DoD-P15-3 — reaper MUST carry-forward `redispatch_count` from existing row's payload into the new orphan-signal payload's `redispatch_count: prior+1` field (if absent from existing payload, default 0 → orphan-signal gets 1)
- DoD-P15-4 — ALLOW-LIST predicate (not deny-list): emit only for `task_kind IN ('sprint-task', 'cowork-slot', 'cron-tick-with-published-checkpoint', 'dashboard-row')`; new kinds default to NOT-emitting

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:298-317` (current `gcExpiredLocks` implementation)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.2` (reaper emit spec)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.5` (resume-contract table: which kinds have defined adoption behavior)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (lines 298-317, plus new helper function for orphan-signal emission)

**Dependencies:**
- TASK_1982 (migration SQL must apply first so `redispatch_count` column exists)
- TASK_1980 (P1-FINAL: P1.5 blocked until `owner_client_session` is REQUIRED, making orphan attribution unambiguous)

**Knowledge needed:**
- SQLite transaction semantics (all-or-nothing atomicity)
- Payload JSON structure (how to serialize checkpoint data per §6.5.5)
- ALLOW-LIST filtering (hardcode the safe kinds; new kinds opt-in only)

## Context

The reaper is the server-side liveness-detection component that runs in the always-on mcp-server process. Every 600s (via P1.5-MCP-3), it scans for expired locks and emits adoption signals. This task implements the core scanning and emission logic.

Without this, expired locks are silently deleted (today's behavior) and their work is lost. With it, a peer session can read the orphan-signal row and adopt the work from a durable checkpoint.

## Success Signal

- `coordinator_test.ts` acceptance test: inject an expired lock row with `redispatch_count=0`, call `gcExpiredLocks`, verify orphan-signal row exists with `redispatch_count=1`, and original row is deleted
- Manual SQL query on live coordination.db: verify `SELECT COUNT(*) FROM task_locks WHERE task_kind='orphan-signal'` increases after a lock expires
- Regression: existing published:* and session-presence rows are still silently deleted (NOT emitted as orphan-signals)
