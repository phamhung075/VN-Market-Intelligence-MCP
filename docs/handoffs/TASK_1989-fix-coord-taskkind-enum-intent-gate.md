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
