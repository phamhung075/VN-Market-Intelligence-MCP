# PO Notebook

_Last: 2026-06-28T11:36Z_

## This cycle — DECISION: P1 router-gate enum-drift defect → bless 7-kind taxonomy, ONE corrective

Router dogfooded the shipped P1 gate and found it NON-FUNCTIONAL: every dispatch's mandatory step-2.5 PRE-CLAIM `task_claim(task_kind="intent")` returns -32602. Deployed enum = 4 kinds `[cowork-slot, sprint-task, dashboard-row, commit-mutex]`; 'intent' absent. RAW-verified all 3 in-code enum sites carry only the 4 (CHECK coordinationStore.ts:180, TS-union :233, Zod coordinationTools.ts:86). 0 'intent:' locks ever existed → the gate has never once succeeded since TASK_1976/1977 shipped `task_kind="intent"`. Same class as the historical commit-mutex enum-drift.

**DECISIONS (A/B/C/D):**

- **A — taxonomy:** bless the COMPLETE 7-kind taxonomy in ONE Migration-3: existing 4 + `intent` (router gate, P1-corrective) + `orphan-signal` (P1.5) + `session-presence` (P2). Caller logic still ships per-phase; an inert CHECK value with no caller is harmless. 2nd recurrence of enum-drift → fix the CLASS (feedback_recurring_bug_escalation): collapses 3 migration/rebuild/drift windows into 1 and removes the concurrent-tree contamination on the shared enum line.
- **B — dedicated `intent` kind, SCHEMA fix (not doc):** the shipped CLAUDE.md/dispatch-claim `task_kind="intent"` is CORRECT; the schema lagged. Router's "self-collide on TASK_<N>" is imprecise (mutex keys on task_id PK; `intent:*` ≠ `sprint-task:*` → no PK collision) but a dedicated kind is still right for query-surface integrity + reaper allow-list semantics. Taxonomy was ALREADY blessed in po-S8/DoD-P15-4 (names intent:* as a reaper-excluded router kind, baked into TASK_1983) → no architect redesign.
- **C — ONE corrective:** `FIX-COORD-TASKKIND-ENUM-INTENT-GATE` (P1, blocking, zone apps/mcp-server/, dev-mcp-server) as Migration-3 with its OWN detection guard (editing line-180 CHECK alone NO-OPS on live DBs — its 'commit-mutex' guard already passed). Widens all 3 sites + describe strings + folds the redispatch_count column → SUPERSEDES TASK_1982 entirely; re-gate TASK_1983-1988 blockedBy→corrective; P2-MCP-1 enum scope pre-satisfied.
- **D — QA:** add the missing LIVE integration check — router PRE-CLAIM `task_claim(task_kind="intent")` returns claimed:true against the DEPLOYED schema (named-volume coordination.db, not host ./data decoy). Closes TASK_1981's store-level-only gap; also added as AC to TASK_1988.

**Sequence / unblocks first:** pm mints corrective + carves TASK_1982 + re-gates → dev-mcp-server Migration-3 → ops REBUILD → qa live integration check → router gate functional for ALL dispatch. THEN release the held P1.5 fan-out (TASK_1983-1988). architect off critical path (only a non-blocking brief §3/§3.2 doc-sync owed).

LESSON: an enum/contract shipped across two substrates (router doc says `task_kind="intent"`; MCP schema enum) is only "shipped" when an INTEGRATION test exercises the real caller against the LIVE deployed schema — a store-level attribution unit test (TASK_1981) passes while the actual gate -32602s every call. When a recurring drift-class (here: enum-widen dropping a site) recurs, the durable fix is to bless the COMPLETE forward taxonomy in one migration, not to patch the one missing value.
