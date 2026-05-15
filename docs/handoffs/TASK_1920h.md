# TASK 1920h — Retire skips and user_requests tables (formal deprecation)

**Sprint:** 1920 | **Tier:** 5 | **Type:** CLEAN | **Zone:** apps/mcp-server/ | **Size:** XS
**DDD Layer:** infrastructure/db schema
**Owner:** dev-mcp-server
**Status:** Ready for Dev

---

## Context

Two tables identified as zombie candidates in SPRINT_GOAL.md:

### Table: `skips`

Investigation result: **this table does not exist in any schema file in the codebase.** A thorough grep across all `schema*.ts` files finds zero `CREATE TABLE.*skips` statements. The word "skips" appears once in `schema-system.ts:365` as a comment: "Safe because CREATE TABLE IF NOT EXISTS skips on existing DBs — we use". This is referring to the SQLite `CREATE TABLE IF NOT EXISTS` behavior (i.e., the statement is a no-op on existing DBs), not a table named `skips`.

**Action for `skips`:** No schema change required. Add a brief DEPRECATED notice as a comment in `schema-system.ts` at the top of the file header comment block to document that a `skips` table is NOT defined and should not be created. Also add to `freshnessSlaMonitor` exclude-list comment.

### Table: `user_requests`

Investigation result: **`user_requests` is defined in `schema-system.ts:239`** with columns: `id, command, payload, status, response, created_at, answered_at`. Zero production code references it outside the schema definition. `askQueueStore.ts:5` explicitly states: "The `ask_queue` table is separate from `user_requests` — different schema...". The `/ask` and `/why` commands were deleted in task 1063 (step F removal in intelligenceCycleJob). `user_requests` is the old handler table for those commands.

**Action for `user_requests`:** The SPRINT_GOAL offers two options: (a) DROP via migration if zero read path, (b) annotate DEPRECATED in schema-system.ts + freshnessSlaMonitor exclude-list.

BA recommendation: **Option B (annotate DEPRECATED)**. Rationale: `CREATE TABLE IF NOT EXISTS` is idempotent; a live production DB may already have the table with rows. Dropping it requires a migration and carries rollback risk. Adding a DEPRECATED comment costs zero risk, satisfies the acceptance criterion, and unblocks `freshnessSlaMonitor` from false-flagging a stale table.

---

## Requirements

### FR-1 — DEPRECATED comment block in schema-system.ts for user_requests
**DDD layer:** infrastructure/db

Add a multi-line `// DEPRECATED` comment directly above the `CREATE TABLE IF NOT EXISTS user_requests` block:

```typescript
// ── User Requests (Task 238) — DEPRECATED as of Sprint 1920 ─────────────────
// Superseded by `ask_queue` (Task 1072). The /ask and /why Telegram commands
// were removed in Task 1063. Zero writers in production code.
// Retained as CREATE TABLE IF NOT EXISTS for backward-compat with existing DBs.
// DO NOT add new writers. Do NOT query this table. See ask_queue for replacem.
// freshnessSlaMonitor: excluded from coverage check (no active writer).
```

Do NOT change the `CREATE TABLE IF NOT EXISTS` statement itself — leave the table in place for existing DB safety.

### FR-2 — skips table documentation comment in schema-system.ts
**DDD layer:** infrastructure/db

Add a comment block near the top of `schema-system.ts` (in the module-level JSDoc or in the `initSystemSchema` function header):

```typescript
// NOTE: A table named `skips` was referenced in Sprint 1920 planning as a
// zombie table candidate. Investigation confirmed it DOES NOT EXIST in any
// schema file. No CREATE TABLE, no writers, no readers. No migration needed.
// The word "skips" in this file (line ~365) refers to SQLite IF NOT EXISTS
// semantics, not a table name.
```

### FR-3 — freshnessSlaMonitor exclude-list comment
**DDD layer:** infrastructure/db

In `freshnessSlaMonitorJob.ts`, add a comment to the `querySignalAges` function header (or the UNION ALL query block) documenting the excluded tables:

```typescript
// Excluded from SLA monitoring (zero active writers — DEPRECATED or N/A):
//   - user_requests: superseded by ask_queue (Task 1063, Sprint 1920)
//   - skips: table does not exist in schema (Sprint 1920 investigation)
```

---

## Acceptance Criteria

- AC-1: `freshnessSlaMonitor` does NOT flag `user_requests` or `skips` as stale tables in its WORK channel output.
- AC-2: `schema-system.ts` contains a DEPRECATED comment above the `CREATE TABLE IF NOT EXISTS user_requests` block.
- AC-3: `schema-system.ts` contains a note documenting that `skips` is not a real table.
- AC-4: No production code writes to `user_requests` (verified by grep: `INSERT INTO user_requests` = 0 matches outside schema and tests).
- AC-5: Existing tests that reference `user_requests` table structure continue to pass (no schema change).
- AC-6: `tsc` 0 errors (doc-only change, no type surface changes).

---

## Edge Cases

- Existing production DB with `user_requests` rows: the `CREATE TABLE IF NOT EXISTS` is unchanged — table remains in place, rows preserved. No data loss risk.
- `freshnessSlaMonitor` currently only checks `{price, bctc, news, sbv_fx, foreign_flow}` signal types via explicit UNION ALL. It does not dynamically discover tables. So `user_requests` is already implicitly excluded. The comment change in FR-3 makes this explicit for future maintainers.

---

## Files Changed (expected)

- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — add DEPRECATED comment above `user_requests` block; add skips note
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — add excluded-tables comment

**No migration file needed. No DROP statement. No test changes.**

---

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/`

**Developer assigned:** dev-mcp-server

**Acceptance Criteria (from BA spec, to verify in implementation):**
- AC-1: `freshnessSlaMonitor` does NOT flag `user_requests` or `skips` as stale tables in its WORK channel output.
- AC-2: `schema-system.ts` contains a DEPRECATED comment above the `CREATE TABLE IF NOT EXISTS user_requests` block.
- AC-3: `schema-system.ts` contains a note documenting that `skips` is not a real table.
- AC-4: No production code writes to `user_requests` (verified by grep: `INSERT INTO user_requests` = 0 matches outside schema and tests).
- AC-5: Existing tests that reference `user_requests` table structure continue to pass (no schema change).
- AC-6: `tsc` 0 errors (doc-only change, no type surface changes).

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — user_requests and skips context
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — querySignalAges function

**Files to create:**
- None (doc-only changes)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/schema-system.ts` — add DEPRECATED comment above `CREATE TABLE IF NOT EXISTS user_requests` block; add skips documentation note
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — add excluded-tables comment to querySignalAges header

**Dependencies:** None (independent, doc-only, XS size)

**Knowledge needed:**
- CREATE TABLE IF NOT EXISTS idempotence pattern
- Comment best practices for schema documentation
- DEPRECATED annotation standard in codebase

**Risk flags:**
- R-1920h-1: Create IF NOT EXISTS is unchanged → existing DBs retain table structure (no risk)
- R-1920h-2: Comment placement in schema file (above CREATE TABLE block, clear visibility)
- R-1920h-3: Grep verification for INSERT statements (AC-4) must exclude test files and schema definition

---

## Blockers

None. No PO questions. No architect brief required.

---

## Test Criteria Summary

| AC | Test type | Pass condition |
|----|-----------|----------------|
| AC-1 | Manual / grep | freshnessSlaMonitor UNION ALL does not include user_requests |
| AC-2 | Manual / file read | DEPRECATED comment present above CREATE TABLE user_requests |
| AC-3 | Manual / file read | skips documentation comment present |
| AC-4 | Grep | `INSERT INTO user_requests` = 0 matches in non-test production files |
| AC-5 | Test run | Existing test suite passes (no regression) |
| AC-6 | tsc | 0 errors |

---

## [QA] Task Report — 1920h

```
date: 2026-05-15
outcome: APPROVED
type: CLEAN (doc-only comment additions)
round: 1
commit: ac32a3dc
```

### Pipeline

- Targeted tests (freshness/SLA — 4 files): 54 pass / 0 fail
- Full suite: 9695 pass / 40 fail (all 40 pre-existing — network/integration tests unrelated to 1920h; 0 regressions)
- tsc: 0 errors | DDD: PASS | Security: PASS (no code changes — comment-only)

### AC Verification

- AC-1 PASS: `querySignalAges` UNION ALL in `freshnessSlaMonitorJob.ts` — 5 entries only (price/bctc/news/sbv_fx/foreign_flow). `user_requests` absent. No regression.
- AC-2 PASS: `schema-system.ts` L243-248 — DEPRECATED comment block present above `CREATE TABLE IF NOT EXISTS user_requests` (matches FR-1 spec verbatim).
- AC-3 PASS: `schema-system.ts` L22-26 — skips non-existence note present in module header (matches FR-2 spec verbatim).
- AC-4 PASS: `grep -rn "INSERT INTO user_requests"` across all `apps/**/*.ts` excluding `__tests__` and `schema-system.ts` = 0 matches.
- AC-5 PASS: 54 freshness/SLA targeted tests GREEN. Full suite 9695 pass — no regression vs pre-existing baseline.
- AC-6 PASS: `bun tsc --noEmit` = 0 errors (doc-only change, zero type surface impact).
