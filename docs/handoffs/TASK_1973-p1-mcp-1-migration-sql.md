---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1973-p1-mcp-1-migration-sql
size: S
zone: apps/mcp-server/
depends_on: []
blocks: ["TASK_1974", "TASK_1975"]
---

## TLDR

Add `owner_client_session TEXT` column to `task_locks` table (nullable, NOT UNIQUE) as the foundational ownership discriminator for cross-session same-role agent teams. Wrap in `migrateCoordinationTable` transaction. Verify existing rows survive with NULL via `task_list_held`.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] SQL migration `ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT` is wrapped in the existing `migrateCoordinationTable` transaction (precedent: coordinationStore.ts:159-206)
  - [ ] Migration runs without error; existing rows survive with NULL in the new column (backward-compatible)
  - [ ] Verified via RAW `task_list_held` call against LIVE coordination.db in the Docker named volume that rows are intact and nullable: `host ./data/coordination.db is a stale decoy — do NOT probe it`
  - [ ] No client-side callers changed in this task (server-side column addition only)
  - [ ] Commit message includes migration SQL block and references the sprint brief (docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §8)
- **Files to read first:**
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts:159-206 (migration pattern precedent)
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts:334-417 (claimTask — will be extended in MCP-2)
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §8 (concrete task list)
  - feedback_sqlite_add_column_unique_silent_noop.md (why NOT UNIQUE is mandatory)
- **Files to create:** None (migration SQL only)
- **Files to modify:**
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — add column to `migrateCoordinationTable` function
  - Optionally: 20260628-add-owner-client-session.sql (if SQL is split into a migrations/ file; consult coordinationStore.ts pattern)
- **Dependencies:** None (this is P1's first task, a prerequisite)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` — full brief, especially §1-2 (root cause + session identity scheme), §4 (heartbeat + stale reclaim), §8 P1-MCP-1 spec
  - `docs/policies/dev-standards.md` — dev discipline
  - feedback_sqlite_add_column_unique_silent_noop.md — why UNIQUE is silently dropped on ADD COLUMN

## [Developer] Implementation Notes

1. **SQL statement:** Add to `migrateCoordinationTable` transaction:
   ```sql
   ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT;
   -- nullable, NOT UNIQUE (UNIQUE silently dropped on ADD COLUMN in SQLite)
   ```
2. **Placement:** Locate `migrateCoordinationTable` in coordinationStore.ts (around line 159-206). Add the ALTER to the existing table migration block within the transaction.
3. **Existing rows:** Will get NULL in the new column. No default needed; NULL signals "pre-P1 row, callers should use matching-ladder fallback" (implemented in P1-MCP-2).
4. **RAW-verify:** After deployment, call `task_list_held()` against the LIVE coordination.db (via the running mcp-server container) and spot-check that the returned rows include a `owner_client_session` field (NULL for old rows, SOME-UUID for new claims).
5. **No server restart needed for schema:** SQLite DDL is online-safe; the next `migrateCoordinationTable` call applies it. Callers using the old row format (without the column) will see NULL.

---

## AC: Verify Locally

```bash
# After code lands:
# (1) Spin up containers (docker compose up -d)
# (2) From router or any test client, call task_list_held() via the gateway
# (3) Verify response includes owner_client_session field (NULL for pre-migration rows)
# (4) Check git log for the migration commit
```

## RETURN to PM

Once this task is DONE (QA verified on LIVE coordination.db):
- Unblock TASK_1974 (P1-MCP-2: coordinationStore.ts matching-ladder rebind)
- Unblock TASK_1975 (P1-MCP-3: coordinationTools.ts params + stop server injection)
- Allow P1-AF-* tasks (AF-1/2/3/4) to begin work (they depend only on migration being in-flight, not shipped)
