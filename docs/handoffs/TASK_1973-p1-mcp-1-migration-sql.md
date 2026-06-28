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

### What Changed

**File modified:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`
- Lines 147-230 (approximately): `migrateCoordinationTable` function restructured.
  - Migration 1 (commit-mutex enum widen) converted from an early-return guard into a conditional block, so execution falls through to Migration 2.
  - Migration 2 added: PRAGMA `table_info(task_locks)` guard checks for `owner_client_session` column; if absent, executes `ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT`. Idempotent — no-op on repeat calls.

**File created:** `apps/mcp-server/src/__tests__/P1-MCP-1-owner-client-session-migration.test.ts`
- 10 tests across 6 AC groups covering: column addition on post-commit-mutex DB, NULL survival for existing rows, idempotency (double-call), brand-new DB path, nullable INSERT, NOT UNIQUE proof (two rows with same session UUID both insert).

### SQL Applied

```sql
ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT;
-- nullable, NOT UNIQUE (UNIQUE silently dropped on ADD COLUMN in SQLite —
-- feedback_sqlite_add_column_unique_silent_noop)
```

### Idempotency Mechanism

```typescript
const columns = db.prepare("PRAGMA table_info(task_locks)").all() as Array<{ name: string }>;
const hasOwnerClientSession = columns.some((col) => col.name === "owner_client_session");
if (!hasOwnerClientSession) {
  db.exec("ALTER TABLE task_locks ADD COLUMN owner_client_session TEXT");
}
```

Re-run-safe: PRAGMA check before ALTER ensures the ALTER only fires once per DB lifetime.

### Build Status

- TypeScript type check: CLEAN (`bun tsc --noEmit` — no output, no errors)
- New tests: 10 pass, 0 fail
- Regression suite (5 coordination test files, 63 tests total): 0 fail
- Container rebuild: DONE (`docker compose build mcp-server && docker compose up -d --no-deps mcp-server`)

### RAW Live-DB Verification (inside named-volume container)

Container: `vn-market-intelligence-mcp-mcp-server-1` (Up, healthy after rebuild)

Migration log line observed on first `listHeldTasks` call:
```
[coordinationStore] Migrated task_locks: added owner_client_session column (nullable TEXT, P1-MCP-1).
```

`PRAGMA table_info(task_locks)` output from live `/app/data/coordination.db` (named volume):

```json
[
  {"cid":0,"name":"task_id","type":"TEXT","notnull":1,"dflt_value":null,"pk":1},
  {"cid":1,"name":"task_kind","type":"TEXT","notnull":1,"dflt_value":null,"pk":0},
  {"cid":2,"name":"owner_session","type":"TEXT","notnull":1,"dflt_value":null,"pk":0},
  {"cid":3,"name":"owner_agent","type":"TEXT","notnull":1,"dflt_value":null,"pk":0},
  {"cid":4,"name":"claimed_at","type":"INTEGER","notnull":1,"dflt_value":null,"pk":0},
  {"cid":5,"name":"expires_at","type":"INTEGER","notnull":1,"dflt_value":null,"pk":0},
  {"cid":6,"name":"heartbeat_at","type":"INTEGER","notnull":1,"dflt_value":null,"pk":0},
  {"cid":7,"name":"ttl_seconds","type":"INTEGER","notnull":1,"dflt_value":"3600","pk":0},
  {"cid":8,"name":"payload","type":"TEXT","notnull":0,"dflt_value":null,"pk":0},
  {"cid":9,"name":"owner_client_session","type":"TEXT","notnull":0,"dflt_value":null,"pk":0}
]
```

Column `cid:9` — `owner_client_session TEXT notnull:0 dflt_value:null` — confirmed present, nullable, no UNIQUE constraint.

Existing rows after migration (all 5 pre-migration rows survive with NULL):
```json
[
  {"task_id":"cowork-leader","task_kind":"cowork-slot","owner_agent":"cowork-dispatcher","owner_client_session":null},
  {"task_id":"published:chef-evening:2026-06-28","task_kind":"cowork-slot","owner_agent":"unified-agent","owner_client_session":null},
  {"task_id":"published:digest-daily:2026-06-27","task_kind":"cowork-slot","owner_agent":"digest-predict","owner_client_session":null},
  {"task_id":"esc-datacov:FPT:Q1-2026:ESC-3","task_kind":"sprint-task","owner_agent":"bctc-analyst","owner_client_session":null},
  {"task_id":"published:digest-sunday:2026-06-15/2026-06-21","task_kind":"cowork-slot","owner_agent":"digest-predict","owner_client_session":null}
]
```

### Rebuild Status

APPLIED AND VERIFIED LIVE. Container rebuilt and restarted with new code. Migration ran on first `listHeldTasks` call after restart. No further rebuild needed for this migration.

### Non-goals (per task scope)

- No changes to `coordinationTools.ts` (TASK_1975)
- No changes to matching-ladder in `heartbeatTask`/`releaseTask` (TASK_1974)
- No `owner_client_session` param added to tool schemas (TASK_1975)
- `owner_client_session` intentionally nullable in P1 (REQUIRED flip is TASK_1980)

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
