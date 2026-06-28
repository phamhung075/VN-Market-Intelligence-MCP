---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1989-fix-coord-taskkind-enum-intent-gate
size: M
zone: apps/mcp-server/
depends_on: ["TASK_1980"]
blocks: ["TASK_1983", "TASK_1984", "TASK_1985", "TASK_1986", "TASK_1987", "TASK_1988"]
---

## TLDR

Router's pre-claim gate (step 2.5) calls task_claim(task_kind="intent") but deployed coordination service rejects it: enum has only 4 kinds, 'intent' absent. Single atomic Migration-3 repairs all 3 schema sites (SQLite CHECK, TS union, Zod enum) with complete 7-kind taxonomy (intent + orphan-signal + session-presence inert until called; plus existing 4), folds in redispatch_count column, and closes P1 gate-hardening scope.

---

## [PM] Planning Context

**Zone:** apps/mcp-server/ (coordination layer, database migrations, MCP tool schemas)

**Problem Scope:**

PO dogfooding (step 2.5 PRE-CLAIM) exposed: `task_claim(task_kind="intent")` → -32602 Invalid Parameters.
Root cause: three enum sites are unsynchronized. Deployed checks:
- SQLite CHECK (coordinationStore.ts line 180): 4-kind only (`'cowork-slot','sprint-task','dashboard-row','commit-mutex'`)
- TS union (coordinationStore.ts line 233): 4-kind only (`"cowork-slot" | "sprint-task" | "dashboard-row" | "commit-mutex"`)
- Zod enum (coordinationTools.ts line 86): 4-kind only (`["cowork-slot", "sprint-task", "dashboard-row", "commit-mutex"]`)

Recurrence: same pattern as commit-mutex enum-drift (TASK_1976/1977) — class fix via complete taxonomy in ONE migration.

**Acceptance Criteria:**

- [ ] **ONE coherent Migration-3 block** in `migrateCoordinationTable` with OWN detection guard (e.g., `!sql.includes("'intent'")`)
  - CRITICAL: editing line-180 CHECK string alone NO-OPS on live DBs because existing 'commit-mutex' guard already passed
  - Must RECREATE task_locks table with full 7-kind CHECK (SQLite cannot ALTER CHECK in-place)
  - Follow table-recreate precedent (PRAGMA legacy_alter_table / rename-create-copy-drop pattern already in place at Migration 1)

- [ ] **Full 7-kind CHECK constraint added:**
  ```
  cowork-slot, sprint-task, dashboard-row, commit-mutex, intent, orphan-signal, session-presence
  ```
  - intent = P1 router gate (active now via dispatch-claim SKILL)
  - orphan-signal = P1.5 reaper emit (inert CHECK value; caller ships in TASK_1983)
  - session-presence = P2 roster (inert CHECK value; no caller yet)

- [ ] **Widen ALL 3 sites in sync:**
  - ✓ SQLite CHECK (coordinationStore.ts line 180)
  - ✓ TS union TaskKind (coordinationStore.ts line 233)
  - ✓ Zod z.enum (coordinationTools.ts line 86)
  - ✓ All 4 coordination tool schemas: `.describe()` strings updated to document all 7 kinds

- [ ] **Fold in `redispatch_count INTEGER DEFAULT 0` column** on task_locks
  - PRAGMA table_info-guarded (do not add if already present)
  - Absorbed from TASK_1982 (now superseded)
  - Used by P1.5 reaper to track poison-task escalation (DoD-P15-3)

- [ ] **RAW-verify against LIVE coordination.db** (after ops rebuild):
  - Existing rows survive with redispatch_count=0
  - All 7 kinds accepted in live task_claim calls
  - All 4 original kinds still intact (cowork-slot, sprint-task, dashboard-row, commit-mutex)
  - No corruption of existing published rows

- [ ] **TypeScript compilation:**
  - exactOptionalPropertyTypes-safe
  - tsc 0 errors

---

## [PM] Files to Read First

(These are cited in the handoff to anchor dev's understanding.)

- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (lines 159–227): migrateCoordinationTable function + existing Migration 1 (commit-mutex precedent) + Migration 2 (owner_client_session column precedent)
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (line 233): TS union TaskKind type
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` (line 86): Zod enum for task_kind in task_claim schema
- `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` § 6.5.2 + § 8 (reaper logic + allow-list for orphan-signal + session-presence)
- Existing migration that added commit-mutex (find via grep "'commit-mutex'" in coordinationStore.ts; already shown at lines 170–209)

---

## [PM] Files to Modify

- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`
  - Lines 163–227: add Migration-3 block after Migration 2 (following the pattern)
  - Line 180 (new Migration-3 CHECK): add 7 kinds
  - Line 180–188 (new Migration-3 table schema): add redispatch_count column
  - Line 233: expand TS union to 7 kinds
  - All `.describe()` strings on the 4 coordination tools updated

- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts`
  - Line 86: expand Zod enum to 7 kinds
  - Line 87 (describe string): update to list all 7

---

## [PM] Files to Create

None. All changes are intra-service schema + type updates.

---

## [PM] Dependencies

**Inbound:** TASK_1980 (P1-FINAL: remove owner_agent fallback, proven by TASK_1981 regression green)

**Outbound:** Blocks all P1.5+ work:
- TASK_1983 (reaper allow-list, consumes intent + orphan-signal kinds)
- TASK_1984–1988 (depend on reaper kind taxonomy being live)

**Lateral:** None (single-zone change; no blockers from other agents).

---

## [QA] Acceptance of Definition Gate

**QA DoD (Decision D):** Live integration check closes TASK_1981's store-level-only gap.

Before marking DONE:

- [ ] **LIVE integration check** (against DEPLOYED rebuilt schema, named-volume coordination.db):
  - Router-style PRE-CLAIM: `task_claim(task_id="intent:test:gate", task_kind="intent", owner_agent="test", owner_client_session="<uuid>", ttl_seconds=600)` → `claimed: true` (not rejected with -32602)
  - Subsequent `task_release(task_id="intent:test:gate", owner_client_session="<uuid>")` cleans the lock
  - orphan-signal kind also accepted: `task_claim(task_id="...", task_kind="orphan-signal", ...)`
  - session-presence kind also accepted: `task_claim(task_id="...", task_kind="session-presence", ...)`

- [ ] **Regression check** (store-level + compiled code):
  - All 4 original kinds still work (cowork-slot, sprint-task, dashboard-row, commit-mutex)
  - No tsc errors; exactOptionalPropertyTypes safe

---

## [PM] Knowledge Needed

- `docs/policies/dev-standards.md` § SSOT-W1-ORCH-APPLY-WRAPPER (orch-apply.sh contract)
- `docs/protocols/fail-loud-protocol.md` (error handling)
- SQLite migration patterns (see Migration 1 in coordinationStore.ts for table-recreate precedent)
- TypeScript strict mode (exactOptionalPropertyTypes enforcement)

---

## Post-Ship Runbook (PO + OPS)

After dev lands code:

1. **Pipeline:** ops REBUILD mcp-server (post-code-change rule; see CLAUDE.md)
2. **QA:** regression incl. live integration check (per DoD above)
3. **Architect:** non-blocking brief § 3 / § 3.2 doc-sync (fold into follow-up doc task — do NOT gate dev)

---

## Decision Journal Reference

- `docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-po.md`
  - Step po-S10 (router gate non-functional + enum-drift root cause)
  - Step po-S11 (decisions B/C/D: complete 7-kind taxonomy in ONE Migration-3)

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — (1) `CREATE TABLE IF NOT EXISTS` updated to 7-kind CHECK + `owner_client_session` + `redispatch_count INTEGER DEFAULT 0`; (2) Migration-3 block added after Migration-2 (table-recreate pattern, detection guard `!schemaRow.sql.includes("'intent'")`); (3) `TaskKind` union expanded to 7 kinds; (4) `LockRow` interface gains `redispatch_count: number`; (5) `listHeldTasks` SELECT includes `redispatch_count`
  - `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` — `task_claim` tool description updated; `task_kind` Zod `z.enum` widened to 7 values + describe string updated; `task_list_held` `kind` filter enum widened to 7 values
- **Tests written:** `apps/mcp-server/src/__tests__/task-kind-intent-migration.test.ts` — 17 assertions, 10 ACs: intent/orphan-signal/session-presence accepted (AC-1..3), original 4 kinds regression (AC-4), Migration-3 upgrades 4-kind DB + preserves rows (AC-5..6), redispatch_count DEFAULT 0 (AC-7), redispatch_count preserved if already exists (AC-8), listHeldTasks returns redispatch_count (AC-9), full 3-migration cascade from oldest schema (AC-10)
- **Git commits:** f01eb0f8 feat(CROSS-SESSION-MULTI-TEAM-ORCH/coordination): TASK_1989 widen TaskKind enum to 7 kinds + Migration-3
- **Type check:** clean (`bun tsc --noEmit` — 0 errors, exactOptionalPropertyTypes-safe)
- **bun test (coordination suite):** 99 pass / 0 fail (5 coordination test files)
- **bun test (full suite):** 13636 pass / 53 fail — 53 failures are pre-existing network timeout tests (5000ms, require running containers); 0 new failures introduced
- **Tool count:** 166 tools — matches pre-task baseline (no tool registration changed)
- **Scheduler count:** 3 cron.schedule entries — matches pre-task baseline (no scheduler files touched)
- **Docs updated:** NONE (no service docs impacted; architecture brief doc-sync is non-blocking per pm)
- **Graphify:** skipped (no docs impacted)

**Zone health:** bun test coordination 99 pass / 0 fail, 166 tools intact, 3 cron.schedule, tsc 0 errors | HEALTHY

**OPS REBUILD REQUIRED BEFORE LIVE-VERIFY:**
The host `./data/coordination.db` is the stale decoy. Migration-3 runs on container startup against the named-volume coordination.db. QA live-integration-check (task_claim intent kind, orphan-signal, session-presence; all 4 original kinds; redispatch_count=0 for existing rows) can only proceed AFTER ops rebuilds the mcp-server container. Do NOT claim "live-verified" before rebuild.

---

## [QA] Review Record — 2026-06-28T12:10:00Z

**Verdict: APPROVED**

**DoD-1 Live Integration (all via gateway HTTP on rebuilt image 41d976df):**
- 1a intent: claimed:true → released:1 → re-claimed:true (round-trip) ✓
- 1b orphan-signal: claimed:true + released:1 ✓
- 1c session-presence: claimed:true + released:1 ✓
- 1d original 4 kinds (cowork-slot, sprint-task, dashboard-row, commit-mutex): all claimed:true ✓
- 1e "garbage": -32602 invalid_enum_value listing all 7 valid kinds — CHECK not degraded ✓

**DoD-2 redispatch_count:** task_list_held on 11 live rows — every row has redispatch_count=0 ✓

**DoD-3 Regression:** coordination suite 99+17/0 PASS; tsc 0 errors; isolation: wrong-session release→released:0, re-claim sees current_holder ✓. Full-suite baseline: 0 NEW failures vs pre-existing 53 timeout/network set (same set confirmed in TASK_1981 qa-S2).

**DoD-4 WAL adjudication:** NON-BLOCKING — read-only probe artifact. WAL replayed on every SQLite open; server connection proves schema live; restart-durable without explicit checkpoint. Ops hardening recommendation (checkpoint in migration bootstrap) routed as non-blocking backlog note.

**DDD:** PASS (domain/ zero infra imports; coordinationTools→infra direct import is pre-existing, not introduced by this task)
**Security:** PASS (Bun.env only, parameterized SQL, mock-guard PASS, no secrets)
**tsc:** 0 errors

**Non-blocking backlog note (WAL hardening):** Consider adding `PRAGMA wal_checkpoint(TRUNCATE)` after Migration-3 table-recreate in a future hardening task to ensure WAL content is flushed to main DB file immediately post-migration. This eliminates confusion when external read-only tools probe the DB before the next auto-checkpoint. Not required for correctness.

**TASK_1989 → DONE. P1.5 fan-out (TASK_1983, TASK_1984, TASK_1985, TASK_1986, TASK_1987, TASK_1988) UNBLOCKED.**
