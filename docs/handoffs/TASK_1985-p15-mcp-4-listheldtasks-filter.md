---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
phase: P1.5
branch: task/1985-p15-mcp-4-listheldtasks-filter
size: S
zone: apps/mcp-server/
depends_on: [TASK_1980, TASK_1984]
blocks: [TASK_1986, TASK_1987]
---

## TLDR

Extend `listHeldTasks` tool to support an optional `owner_agent` filter parameter (for role-scoped orphan-signal reads by the router and dev-team). Add `redispatch_count` to the output schema for orphan-signal rows so adopters can read the current re-dispatch attempt count and escalate if it exceeds N_MAX=3.

## [PM] Planning Context

**Architect Brief Section:** §6.5.4 + §8 (Concrete Follow-On Tasks: P1.5-MCP-4)

**Zone:** apps/mcp-server/

**Acceptance Criteria:**

- [ ] `listHeldTasks` tool schema: add optional input parameter `owner_agent: string` (filter `task_locks.owner_agent` WHERE clause, empty/absent = no filter = all rows)
- [ ] Output schema extended to include `redispatch_count` field (for orphan-signal rows; can be NULL or 0 for other kinds)
- [ ] Adopter queries: `task_list_held(kind="orphan-signal", owner_agent="dev-team")` returns only orphan-signal rows with matching `owner_agent` value
- [ ] Output row structure carries `{task_id, task_kind, owner_agent, owner_client_session, created_at, expires_at, heartbeat_at, payload{…, redispatch_count}, redispatch_count}` (both in payload AND as top-level for easy access)
- [ ] Non-orphan rows unaffected by the new `owner_agent` filter (backward-compat: existing callers omit the param and get the full list)
- [ ] RAW-verify: query live coordination.db and confirm `listHeldTasks(kind="orphan-signal", owner_agent="dev-team")` filters correctly

**DoD Locks Baked (PO-S9):**
- None for this task (it is a prerequisite for DoD-bearing adoption FRs)

**Files to read first:**
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (tool schema definitions, listHeldTasks)
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (listHeldTasks query implementation)
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md:§6.5.4` (poison-task escalation spec; redispatch_count usage)

**Files to modify:**
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (schema + tool handler)
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (listHeldTasks query)

**Dependencies:**
- TASK_1983 (orphan-signal rows must exist for this to be meaningful)
- TASK_1982 (redispatch_count column must exist)

**Knowledge needed:**
- MCP tool schema Zod definitions (optional parameters)
- SQLite WHERE clause with optional filters (e.g., `WHERE 1=1 AND (owner_agent = ? OR ? IS NULL)` pattern)

## Context

The router (P1.5-AF-1) and dev-team (P1.5-AF-2) need to query for adoptable orphan-signals filtered by their own role (`owner_agent`). Without the filter, they would see all orphan-signals including those for other agent roles (e.g., dev-team seeing digest-predict's orphaned work) and get confused about which ones to adopt.

The `redispatch_count` in the output lets adopters check the poison-task gate BEFORE attempting to re-claim.

## Success Signal

- `task_list_held(kind="orphan-signal", owner_agent="dev-team")` returns only rows with `owner_agent="dev-team"`
- Output row includes both a top-level `redispatch_count` field and a `payload.redispatch_count` (for convenience)
- Regression: `task_list_held()` without filters still works, returning all kinds
- Acceptance test: create an orphan-signal for `owner_agent="dev-team"` with `redispatch_count=2`, query with filter, verify it appears with correct count
