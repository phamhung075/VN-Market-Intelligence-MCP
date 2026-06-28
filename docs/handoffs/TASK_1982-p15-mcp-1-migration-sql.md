---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1982-p15-mcp-1-migration-sql
size: S
zone: apps/mcp-server/
depends_on: [TASK_1980]
blocks: [TASK_1983]
---

## TLDR

Add `redispatch_count` INTEGER column (default 0) to `task_locks` table and enum-widen `task_kind` CHECK to include `'orphan-signal'` value. This enables the reaper mechanism to track re-dispatch attempts and emit adoption signals for dead sessions' orphaned work.

## [PM] Planning Context

**Architect Brief Section:** §6.5.2 + §8 (Concrete Follow-On Tasks: P1.5-MCP-1)

**Zone:** apps/mcp-server/

**Acceptance Criteria:**

- [ ] SQL migration: `ALTER TABLE task_locks ADD COLUMN redispatch_count INTEGER DEFAULT 0;` wrapped in `migrateCoordinationTable` transaction (verify precedent: `20260524-coordination-add-commit-mutex.sql`)
- [ ] Enum-widen `task_kind` CHECK to add `'orphan-signal'` value in same transaction (same pattern as `commit-mutex` enum addition)
- [ ] Verify existing rows survive with `redispatch_count=0` via RAW-verify on live coordination.db in Docker named volume (NOT host ./data/)
- [ ] Task successfully passes via `task_list_held` before proceeding to P1.5-MCP-2
- [ ] No regression: existing rows with missing `redispatch_count` column default to 0 (cannot hit NULL edge case per SQLite DEFAULT semantics)

**DoD Locks Baked (PO-S9):**
- None (migration is a prerequisite for DoD-bearing FRs)

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:159-206` (enum-widen migration precedent for `commit-mutex`)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.2` (reaper mechanism overview)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§8` (named follow-on task spec)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/migrations/<YYYYMMDD>-coordination-add-redispatch-count.sql` (CREATE: new migration file)
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:159-206` (EDIT: extend `migrateCoordinationTable` to apply the new migration)

**Files to create:**
- SQL migration file (above)

**Knowledge needed:**
- SQLite DEFAULT semantics + nullable INTEGER defaults
- Zod enum validation (orphan-signal will be a new string variant in the `task_kind` enum)
- MCP server migration pattern (precedent: TASK_1973 P1-MCP-1 migration SQL)

## Context

The P1.5 liveness-detection phase requires tracking how many times an orphaned task has been re-dispatched to adopters. Without this counter, a task that crashes every adopter will infinite-loop; with it, the reaper can escalate to BUG after N_MAX=3 attempts (DoD-P15-3).

The migration is FIRST in the P1.5 MCP sequence because subsequent tasks (P1.5-MCP-2 and P1.5-MCP-3) read/write `redispatch_count` in the payloads and scan the enum.

## Success Signal

- Migration applies cleanly to a fresh coordination.db via the existing startup path (no manual SQL required)
- `task_list_held` returns rows with `redispatch_count` visible in the output
- Enum-widen causes no "orphan-signal" task_kind value to be rejected by the CHECK constraint
- No regression in existing SPRINT-S/SPRINT-M/etc. rows
