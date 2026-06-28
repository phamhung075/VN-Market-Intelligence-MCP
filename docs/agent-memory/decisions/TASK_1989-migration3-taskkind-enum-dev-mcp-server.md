---
task_id: TASK_1989
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
agent: dev-mcp-server
date: 2026-06-28
kind: implementation-decision
---

# TASK_1989 — Migration-3 Design Decisions

## D-1: Detection guard must be own expression, not reuse Migration-1 guard

Migration-1 guard is `!schemaRow.sql.includes("'commit-mutex'")`. On all live DBs, Migration-1 already ran and `'commit-mutex'` IS in the schema SQL. Reusing that guard → no-op forever. DECISION: use `!schemaRow.sql.includes("'intent'")` as an independent expression. This correctly fires on all 4-kind DBs (live post-Mig-1 state) and is idempotent on the new 7-kind schema.

## D-2: Table-recreate for CHECK constraint (mirrors Migration-1 pattern)

SQLite cannot ALTER a CHECK constraint in-place. DECISION: same RENAME→CREATE→INSERT...SELECT→DROP→RENAME pattern as Migration-1. The new table is `task_locks_v3`. Transaction-wrapped. On any error: ROLLBACK preserves existing rows exactly.

## D-3: Fold redispatch_count into Migration-3 table-recreate (don't ADD COLUMN separately)

Since we are already recreating the table, adding a separate ADD COLUMN step (as TASK_1982 planned) would be redundant and would introduce two sequential migrations touching the same table. DECISION: include `redispatch_count INTEGER DEFAULT 0` directly in the `task_locks_v3` schema. PRAGMA table_info-guarded fresh-read INSIDE the migration block handles the edge case where `redispatch_count` already exists (TASK_1982 partially shipped scenario) — use column value if present, else `0` in the INSERT...SELECT.

## D-4: schemaRow read once at top — migration blocks can see table state AFTER prior migrations

schemaRow is read once. After Migration-1 recreates the table, schemaRow.sql still reflects the OLD schema. Migration-3 guard `!schemaRow.sql.includes("'intent'")` still fires correctly on old DBs because the old schema (whether 3-kind or 4-kind) never had 'intent'. PRAGMA table_info inside Migration-3 reads the LIVE table state, which will already have owner_client_session from Migration-2.

## D-5: 3 inert kinds included in one migration window

Per pm decision B/C/D (po-S11): collapse future migration windows. `orphan-signal` (P1.5 reaper) and `session-presence` (P2 roster) are CHECK values with no active callers yet. Including them as inert values in Migration-3 is harmless and avoids a Migration-4 and Migration-5 in the near term.

## Commit

f01eb0f8 feat(CROSS-SESSION-MULTI-TEAM-ORCH/coordination): TASK_1989 widen TaskKind enum to 7 kinds + Migration-3
