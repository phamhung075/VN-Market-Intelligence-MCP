# Requirements Spec — SIG-IMPL-GATE
## Gated Self-Improvement Loop — Phase 2: Lane-B Detection Substrate + D-IMPROVE Proposal-Doc Bridge

**Sprint:** SELF-IMPROVE-GATE (Phase 2)
**Author:** ba
**Date:** 2026-05-27
**Status:** DRAFT — AWAITING ARCHITECT BLUEPRINT
**Handoff:** `docs/handoffs/TASK_SELF-IMPROVE-GATE.md § [PO] SIG-IMPL-GATE Kickoff`
**Design SSOT:** `docs/spikes/SPIKE_1947-auto-improve-loop.md` (§4/§5/§8/§9/§12)
**Architecture brief:** `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md` §9 Phase 2
**Zone:** `apps/mcp-server/` ONLY
**Ship target:** SHADOW MODE — all paths default `SELF_IMPROVE_AUTO_DISPATCH=false` at ship time

---

## 0. Scope Statement

This is a GREENFIELD build of an ALREADY-SPECIFIED design. The five Sprint-1948 substrate files are confirmed absent (PO grep-verified at kickoff):

- `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — ABSENT
- `apps/mcp-server/src/domain/services/degradationRules.ts` — ABSENT
- `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` — ABSENT
- `improve_check_log` table in `schema-system.ts` — ABSENT
- `SELF_IMPROVE_AUTO_DISPATCH` env var anywhere — ABSENT

No reconciliation work. No brownfield migration. The spec below is the complete build scope.

**What this phase does NOT ship:** proposal status flip to `DONE` (that is agent-father's job per C-2), WIP-cap check, recheck loop (Phase 1 SPIKE §12 explicitly excludes these), auto-dispatch of any kind (all paths default-false at ship time).

**Lane-C boundary check (PO-confirmed, no STOP required):** building shadow-mode detect→log→proposal-emit is reversible (git-tracked), machine-verifiable (tests + gate proof), and implements rather than edits gate logic. Not lane-C. Proceed.

---

## 1. Glossary (this spec)

| Term | Meaning |
|---|---|
| Two-window delta | Compare `getAccuracyStats(7d).accuracy_rate` vs `getAccuracyStats(30d).accuracy_rate` per `signal_type` |
| DEGRADED | `baseline_rate - current_rate >= 0.10` with `sample_count_7d >= 3` AND `sample_count_30d >= 3` |
| PERSISTENTLY LOW | `baseline_rate < 0.40` with `sample_count_30d >= 10` |
| COVERAGE GAP | Watchlist stock with ≥1 `agent_signals` row but 0 resolved `signal_outcomes` rows in last 30d |
| DEGRADATION_CAUSE_MAP | Rule-lookup table keyed by `signal_type` → `{likely_cause, suggested_fix, fix_area}` — pure TypeScript constant, zero imports |
| improve_check_log | New SQLite table for snapshot + dispatch-status tracking (SPIKE §8 schema verbatim) |
| dispatch_status | Enum in `improve_check_log`: `'shadow' \| 'dispatched' \| 'deferred_wip_cap' \| 'improvement_confirmed' \| 'no_improvement' \| 'worsened'` |
| D-IMPROVE bridge | The extension that makes `selfImproveOrchestratorJob.ts` emit a structured proposal doc in addition to the WORK Telegram |
| SELF_IMPROVE_AUTO_DISPATCH | Per-dispatch-path kill-switch — NOT a single global flag |
| Proposal doc | `docs/improvement-proposals/IMP-<YYYYMMDD>-<slug>.md` with fields per brief §3 + C-1 structured additions |
| wrapRun() | Existing `cron_job_runs` dedup pattern (see `accuracyDigestJob.ts` as reference) |
| GATE-PROOF | QA procedure: inject deliberate violation → confirm gate goes RED → remove → confirm GREEN → record evidence |

---

## 2. Task Decomposition

The build decomposes into five atomically-testable tasks, plus one QA task. Each task has a single owner (dev-mcp-server except the last which is qa). Tasks are ordered by dependency; within the dependency chain they are sequential (same service zone, share `schema-system.ts` and `cronConfig.ts`).

```
TASK-1: Schema + Store (improveCheckStore.ts + schema-system.ts)
  ↓
TASK-2: Domain detection service (degradationRules.ts)
  ↓ (both TASK-1 and TASK-2 required)
TASK-3: Orchestrator cron + wiring (selfImproveOrchestratorJob.ts, cronConfig.ts, startScheduler.ts)
  ↓
TASK-4: D-IMPROVE proposal-doc bridge (extension of selfImproveOrchestratorJob.ts)
  ↓
TASK-5: Per-path kill-switch (SELF_IMPROVE_AUTO_DISPATCH per-path keying + default-false enforcement)
  ↓
TASK-6 (QA): Gate-proof procedure (deliberate violation → RED → GREEN → evidence recorded)
```

---

## TASK-1 — improve_check_log Schema + improveCheckStore.ts

### Description

Add the `improve_check_log` table to the system schema (SPIKE §8 verbatim) and write the infrastructure store for snapshot write/read operations.

### DDD Layer

- `improve_check_log` DDL lives in: `infrastructure/db/schema-system.ts` (add to `initSystemTables()`)
- Store lives in: `infrastructure/db/improveCheckStore.ts` (new file)

### Files

| File | Change type | Note |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Modify | Add `improve_check_log` table + index to `initSystemTables()`. Add module-header comment row. |
| `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` | New | Snapshot insert + baseline-read functions. Injectable `db` param for testing. |

### Schema (SPIKE §8 — do not modify the column set)

```sql
CREATE TABLE IF NOT EXISTS improve_check_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type      TEXT    NOT NULL,
  window_7d_rate   REAL,
  window_30d_rate  REAL,
  sample_count_7d  INTEGER,
  sample_count_30d INTEGER,
  hypothesis       TEXT,
  dispatch_status  TEXT    NOT NULL DEFAULT 'shadow',
  fix_signal_id    TEXT,
  checked_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  rechecked_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_improve_check_log_signal_type
  ON improve_check_log(signal_type, checked_at DESC);
```

The `dispatch_status` column accepts: `'shadow' | 'dispatched' | 'deferred_wip_cap' | 'improvement_confirmed' | 'no_improvement' | 'worsened'`. A CHECK constraint is acceptable; the architect decides whether to enforce at DB or application layer.

### improveCheckStore.ts — Required Functions

The store must expose at minimum:

1. `insertImproveCheckSnapshot(db, row)` — writes one row with `dispatch_status='shadow'` (default); returns the new `id`. Throws on missing required fields (fail-loud, per protocol).
2. `getBaselineForSignalType(db, signal_type, opts?)` — returns the most recent row for the given `signal_type` with `dispatch_status IN ('dispatched','shadow')` and `checked_at` within the last N days (architect chooses N, default 7). Returns `null` if no row found (table-absent fallback required: return `null` rather than throw if table does not exist).
3. `getPendingRecheckRows(db)` — returns rows where `dispatch_status = 'dispatched'` and `checked_at < (now - 7 days)` and `rechecked_at IS NULL`. Used by the recheck step in a future phase; the function must exist but is not called by TASK-3 at ship time.
4. `updateDispatchStatus(db, id, status, opts?)` — updates `dispatch_status` (and optionally `rechecked_at`, `fix_signal_id`). Used by the orchestrator to flip `shadow` → `dispatched` when kill-switch is true (not in this phase) and by a future recheck step.

All functions must accept an injectable `db: Database` parameter (never call `getDb()` inside the store — callers inject the handle).

### Acceptance Criteria

- AC-T1-1: `initSystemTables()` is idempotent — running it twice on the same DB produces no error and no data loss. Verified by calling it twice in a test against an in-memory DB and asserting the table exists with its index.
- AC-T1-2: `insertImproveCheckSnapshot` inserts a row and returns a valid integer `id >= 1`. Test: insert two rows, verify `id` is 1 and 2.
- AC-T1-3: `getBaselineForSignalType` returns `null` when the table is empty and when the table does not exist (simulate by calling against a DB without the table being created; function must catch and return `null`).
- AC-T1-4: `getBaselineForSignalType` returns the most recent row (not the oldest) when multiple rows exist for the same `signal_type`.
- AC-T1-5: `insertImproveCheckSnapshot` with a missing `signal_type` field throws a typed error (does not silently insert a null-valued row).
- AC-T1-6: No regression to existing `initSystemTables()` tables — running the extended function against a DB with the pre-existing 14 system tables leaves all existing rows and indexes intact. Test: insert a row into `cron_job_runs`, call `initSystemTables()`, verify the row is still present.

### Edge Cases

- Table already exists (server restart with live DB): `CREATE TABLE IF NOT EXISTS` makes this a no-op. No migration guard needed (add-only table, no constraint changes).
- `dispatch_status` value outside the enum: reject at insert time (fail-loud). Do not silently coerce to `'shadow'`.

---

## TASK-2 — degradationRules.ts Domain Service

### Description

Implement the pure domain-layer detection service: the `DEGRADATION_CAUSE_MAP` rule-table constant and the `detectDegradedSignalTypes()` function that applies the two-window delta policy (SPIKE §4 verbatim).

### DDD Layer

`domain/services/degradationRules.ts` — pure TypeScript constant + pure function. Zero imports from infrastructure or application layers. No side effects. No DB calls.

### Files

| File | Change type |
|---|---|
| `apps/mcp-server/src/domain/services/degradationRules.ts` | New |

### DEGRADATION_CAUSE_MAP (SPIKE §5 — do not redesign)

```typescript
// Three entries + _default per SPIKE §5 verbatim.
// signal_type keys: "price_confirmation", "chain_catalyst", "volume_spike", "_default"
// Each entry: { likely_cause: string, suggested_fix: string, fix_area: string }
```

The architect may add additional entries for signal types in the existing `signal_outcomes` table (e.g. `'legal_risk'` from Sprint 1948e-fix noted in BA notebook). Adding entries is additive and does not require a design decision; removing or modifying existing entries IS a lane-C action (changes the gate's own success criteria) and must NOT be done in this task.

### detectDegradedSignalTypes() — Interface

The function must accept `AccuracyStatsByType[]` (the type returned by `getAccuracyStats`) for both the 7-day and 30-day windows, and return a typed array of degradation findings. The exact TypeScript interface is architect-deferred (see open design points §4), but the return type must carry at minimum: `signal_type`, `detection_class` (`'DEGRADED' | 'PERSISTENTLY_LOW' | 'COVERAGE_GAP'`), `current_rate`, `baseline_rate`, `sample_count_30d`, `hypothesis` (from DEGRADATION_CAUSE_MAP lookup), `fix_area`.

Detection policy (SPIKE §4 — SETTLED, do not re-litigate):

- DEGRADED: `(baseline_rate - current_rate) >= 0.10` AND `sample_count_7d >= 3` AND `sample_count_30d >= 3`
- PERSISTENTLY LOW: `baseline_rate < 0.40` AND `sample_count_30d >= 10`
- Both: a signal type may be both DEGRADED and PERSISTENTLY_LOW — return one finding per class or merge; architect decides the dedup behavior
- COVERAGE GAP: handled separately by `queryCoverageGaps()` (also in this file or in the orchestrator; architect decides placement)
- `_default` fallback: when `signal_type` is not a key in `DEGRADATION_CAUSE_MAP`, use the `_default` entry. Never return `undefined` from the hypothesis lookup.

### Acceptance Criteria

- AC-T2-1: Given a 7d rate of 0.40 and 30d rate of 0.55 (delta = 0.15, both ≥3 samples), `detectDegradedSignalTypes()` returns one finding with `detection_class='DEGRADED'`.
- AC-T2-2: Given a 7d rate of 0.38 and 30d rate of 0.39 (delta = 0.01, <10pp), returns empty array (no degradation).
- AC-T2-3: Given a 30d rate of 0.35 and `sample_count_30d = 15`, returns one finding with `detection_class='PERSISTENTLY_LOW'`.
- AC-T2-4: Given `sample_count_30d = 5` (below threshold), returns empty array regardless of rates (SPIKE §9 minimum-sample gate).
- AC-T2-5: For `signal_type='volume_spike'`, hypothesis lookup returns the SPIKE §5 entry for `volume_spike` (not `_default`).
- AC-T2-6: For `signal_type='unknown_type_xyz'`, hypothesis lookup returns the `_default` entry (not `undefined`, not a throw).
- AC-T2-7: `degradationRules.ts` has zero imports from `infrastructure/` or `application/`. Verified by import-linter or grep.
- AC-T2-8: `DEGRADATION_CAUSE_MAP` is exported as `const` (not a function). Its entries are immutable at runtime. The architect may define this as `as const` or `Readonly<>` — either is acceptable.

### Edge Cases

- Both windows have `null` rate (no data): return empty (insufficient sample — not an error, not degradation).
- 7d window has rate but 30d has `null`: return empty (cannot compute delta without baseline).
- `sample_count_7d = 0` with a computed rate: treat as insufficient sample; do not compute delta.

---

## TASK-3 — selfImproveOrchestratorJob.ts + cron wiring

### Description

Implement the daily `selfImproveOrchestratorJob.ts` scheduler entry and wire it into `cronConfig.ts` and `startScheduler.ts`. The job must run the full detect→hypothesis→log→WORK-Telegram pipeline in shadow mode. The D-IMPROVE proposal-doc emit is a SEPARATE task (TASK-4) to allow independent testability — TASK-3 ships log + WORK Telegram only; TASK-4 extends to doc emit.

**Cron slot:** `0 9 * * *` (09:00 UTC daily — SETTLED, do not change). Verified collision-free: `bctcOverdueCheck` uses `0 9 * * *` on weekdays only (`1-5`); the new job is `* * *` (daily). The architect must confirm whether the same minute is safe (same process, sequential execution is fine; architect decides the minute offset if needed — `2 9 * * *` is an alternative that costs nothing).

### DDD Layer

`interface/scheduler` — imports from `infrastructure/db` and `domain/services` only. Never imports from another scheduler job.

### Files

| File | Change type |
|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | New |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | Modify — add `CRONS.selfImproveOrchestrator` |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | Modify — wire the new job |

### Job Execution Steps (SPIKE §6 Phase 1 + SPIKE §7)

1. DB-backed dedup guard via `cron_job_runs` (`wrapRun()` pattern from `accuracyDigestJob.ts` — reuse exact pattern). If a `success` row exists for today, skip and exit cleanly.
2. In-memory concurrency guard (module-scope `_running` flag — same pattern as `accuracyDigestJob.ts`).
3. Call `getAccuracyStats(db, {days: 7})` and `getAccuracyStats(db, {days: 30})` — both must succeed before proceeding. If either throws, log error and exit cleanly (non-fatal for the rest of the pipeline).
4. Call `detectDegradedSignalTypes(stats7d, stats30d)` → findings array.
5. Call `queryCoverageGaps(db)` → coverage gap findings. (Placement of this function: architect-deferred open point i — see §4.)
6. If no findings: log `[selfImproveOrchestratorJob] no_degradation` and exit cleanly (AC-3 of SPIKE §12 — no WORK Telegram sent).
7. For each finding: insert a row into `improve_check_log` via `insertImproveCheckSnapshot()` with `dispatch_status='shadow'`.
8. Safety gate: max 2 new `shadow` rows per job run (SPIKE §9 anti-runaway). If findings.length > 2, take the top 2 by severity (DEGRADED > COVERAGE_GAP > PERSISTENTLY_LOW); log the remainder as skipped.
9. Cooldown guard: before inserting, check `improve_check_log` for an existing row for the same `signal_type` with `dispatch_status IN ('shadow','dispatched')` within the last 7 days. If found, skip that finding (log `[D-IMPROVE] skip duplicate: {signal_type}`).
10. Send exactly 1 WORK Telegram listing all findings (signal_type, baseline_rate, current_rate, delta, hypothesis text). If no findings survive the cooldown guard, send nothing.
11. The `SELF_IMPROVE_AUTO_DISPATCH` check is present in code but always evaluates to false in Phase 2 (all paths default-false per TASK-5). The orchestrator must read the per-path kill-switch value but must not dispatch anything at ship time.

### wrapRun() / cronConfig.ts Pattern

Follow the exact same registration pattern as `runAccuracyDigest` in `startScheduler.ts`:
- Import `runSelfImproveOrchestrator` from `./audits/selfImproveOrchestratorJob.js`
- Register with `cron.schedule(CRONS.selfImproveOrchestrator, () => runSelfImproveOrchestrator())`
- `CRONS.selfImproveOrchestrator = Bun.env.CRON_SELF_IMPROVE_ORCHESTRATOR ?? '0 9 * * *'`

### Acceptance Criteria

- AC-T3-1 (SPIKE AC-1): `selfImproveOrchestratorJob` run succeeds with `cron_job_runs.status = 'success'`. Test: call `runSelfImproveOrchestrator()` with an injected DB that has 0 signal_outcomes rows → expect success + `no_degradation` log.
- AC-T3-2 (SPIKE AC-2): For each `signal_type` with `sample_count_30d >= 10` and a delta >= 10pp, one `improve_check_log` row is inserted with the correct `signal_type` and `window_7d_rate`/`window_30d_rate` values.
- AC-T3-3 (SPIKE AC-3): When no degradation detected, the job exits with `status='success'` and sends no WORK Telegram. Test: inject `sendWork` mock that records calls; assert zero calls.
- AC-T3-4 (SPIKE AC-4): When ≥1 degraded type detected, exactly 1 WORK Telegram is sent listing all findings. Test: inject mock `sendWork`; assert called exactly once.
- AC-T3-5 (SPIKE AC-5): `improve_check_log` table exists (created by TASK-1's `initSystemTables()`) — the job does not create the table itself, it fails-loud if the table is absent. Test: call the job against a DB that has NOT had `initSystemTables()` called → expect a logged error + clean exit (no throw to process).
- AC-T3-6 (SPIKE AC-7): Coverage gap detection: WORK message includes list of watchlist stocks with ≥1 `agent_signals` row but 0 `signal_outcomes` resolved rows in 30d. Test: inject a DB with a watchlist stock that has `agent_signals` rows but no `signal_outcomes` resolved rows → verify the WORK message includes that ticker.
- AC-T3-7: Cooldown guard: if an `improve_check_log` row already exists for `signal_type='price_confirmation'` with `dispatch_status='shadow'` and `checked_at` = today, the job does not insert a second row for the same `signal_type`.
- AC-T3-8: Anti-runaway: if `detectDegradedSignalTypes()` returns 5 findings, only 2 rows are inserted into `improve_check_log` (the top-2 by severity).
- AC-T3-9: The job function accepts an injectable `deps` object (`db`, `sendWork`, `detectFn`, `coverageGapFn`) for test isolation — none of these use real DB or real Telegram in unit tests.

### Non-Functional Requirements

- NFR-T3-1: The job must not hold the DB connection open for longer than one synchronous execution pass. Use the caller-injected `db` handle (from `startScheduler.ts`'s single DB init, following the `accuracyDigestJob.ts` pattern).
- NFR-T3-2: The job must NOT read `Bun.env` directly inside the function body (except via `CRONS` config). All env reads are at module-scope or injected.

---

## TASK-4 — D-IMPROVE Proposal-Doc Bridge

### Description

Extend `selfImproveOrchestratorJob.ts` to write a structured `docs/improvement-proposals/IMP-<YYYYMMDD>-<slug>.md` file in DRAFT form for each finding that survives the cooldown guard, AND append a row to `docs/signals/DASHBOARD.md` with `type=improvement_proposal, status=NEW`. This is the seam connecting the code substrate (TASK-3) to the flow-governance layer (EDIT-1..5 from Phase 1).

The D-IMPROVE bridge runs AFTER the `improve_check_log` inserts and the WORK Telegram send. A failure in the doc-write must NOT abort the `improve_check_log` write or the WORK Telegram (the doc-write is the add-on; the log+Telegram is the primary function per PO condition C-5).

### DDD Layer

`interface/scheduler` — the proposal doc write is a file-system side effect of the orchestrator job. The file format is defined by brief §3 (the governance layer's concern), but the write happens inside the scheduler layer. The architect must decide whether to extract a `writeImprovementProposal()` helper to `infrastructure/signals/` (following the pattern from SPIKE §6 Phase 2 `writeImprovementSignal()`) or keep it inline. Either is acceptable; the requirement is that the write is testable via injection.

### Files

| File | Change type | Note |
|---|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | Modify | Add D-IMPROVE doc-write step |
| `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` | New (architect-optional) | If architect extracts the write helper; if kept inline, this file is not created |

### Proposal Doc Format (brief §3 + C-1 additions)

Each proposal doc must contain all required fields from brief §3. The C-1 requirement adds two STRUCTURED fields that are NOT in brief §3's original "Proposed Change" free-prose section:

```markdown
## Structured Target (C-1 — REQUIRED for agent-father dispatch)

**target_agent:** <kebab-case agent name, e.g. "dev-mcp-server"> OR "UNRESOLVED" if no automated path
**target_files:** ["<path1>", "<path2>"]  — OR [] if UNRESOLVED
```

These fields are written by the orchestrator at emit time using the `fix_area` field from `DEGRADATION_CAUSE_MAP`. Mapping rule: `fix_area = 'apps/mcp-server/src/scheduler/alerts/'` maps to `target_agent='dev-mcp-server'` and `target_files` is a partial path hint. The architect must specify the exact `fix_area` → `target_agent` mapping (open design point ii — see §4).

Lane classification at emit time follows brief §1 three-lane rule: lane-C checked FIRST. For detection substrate proposals (signal accuracy degradation), the lane is always LANE-B at emit time (hard ungameable gate: test suite goes red on deliberate regression). The orchestrator must write `lane: "LANE-B"` for signal-accuracy degradation findings and `lane: "LANE-A"` for coverage-gap findings (coverage-gap fix is a `.md` flow edit, no hard machine gate).

### DASHBOARD.md Row Format

Following the brief §9 EDIT-1 D-IMPROVE-2c format:

```
| {id} | {ISO-8601-UTC} | system-auditor | improvement_proposal | {summary ≤40 chars} | NEW | {proposal-path} |
```

The row is appended to the `## po` section of `docs/signals/DASHBOARD.md`. If the `## po` section does not exist, the job must create it (not fail). If `DASHBOARD.md` does not exist, the job must create the file with the section header (not fail).

### Cooldown + Dedup for Doc Writes

Before writing a proposal doc, check `docs/improvement-proposals/` for an existing file with the same `weakness_identifier` (defined as `signal_type + detection_class`, e.g. `price_confirmation_DEGRADED`). If a DRAFT or ARCHITECT-REVIEWED file already exists for this identifier, skip the doc write (log the skip; the `improve_check_log` insert still happens). This prevents duplicate proposal docs accumulating on repeated daily runs before the prior one is resolved.

The slug derivation rule is an open design point (see §4-ii). A safe default: `IMP-{YYYYMMDD}-{signal_type}-{detection_class_lower}` (e.g. `IMP-20260527-price-confirmation-degraded`).

### Acceptance Criteria

- AC-T4-1: After a run with one DEGRADED finding for `signal_type='price_confirmation'`, a file `docs/improvement-proposals/IMP-{date}-price-confirmation-degraded.md` exists and contains all required brief §3 fields plus the C-1 `target_agent` and `target_files` fields with non-empty values (not "UNRESOLVED" for a known `fix_area`).
- AC-T4-2: The proposal doc's `target_agent` field is kebab-case (validated by the test with a regex `^[a-z][a-z0-9-]+$`).
- AC-T4-3: The proposal doc's `target_files[]` field is a valid JSON array (parseable by `JSON.parse()`).
- AC-T4-4: A corresponding `improvement_proposal` row with `status=NEW` is appended to `docs/signals/DASHBOARD.md § ## po`.
- AC-T4-5: If a DRAFT proposal doc already exists for `price_confirmation_DEGRADED`, a second run does NOT create a second file (cooldown guard prevents it). Test: call the orchestrator twice on the same injected data; assert only one proposal doc exists.
- AC-T4-6: If the doc-write step throws (simulated by injecting a write function that throws), the `improve_check_log` insert and the WORK Telegram send from TASK-3 are NOT affected — the job exits with `status='success'` for the log+Telegram steps and logs a warning for the doc-write failure (C-5: add-on must not take down the primary pipeline).
- AC-T4-7 (C-1): For a `_default` DEGRADATION_CAUSE_MAP entry (unknown signal type), `target_agent` is `"UNRESOLVED"` and `target_files` is `[]`. The proposal doc still writes successfully — UNRESOLVED is a valid value for proposals that require manual triage.
- AC-T4-8: DASHBOARD.md row for the proposal is appended, not prepended (file append only). Test: read DASHBOARD.md before and after; assert the new row appears after the last existing row in the `## po` section.

---

## TASK-5 — Per-Path SELF_IMPROVE_AUTO_DISPATCH Kill-Switch (C-4)

### Description

Implement the `SELF_IMPROVE_AUTO_DISPATCH` kill-switch as a PER-DISPATCH-PATH keyed structure, default `false` per path. This is NOT a single global boolean. PO condition C-4 is the acceptance-critical requirement: one global flag that once `true` blesses all paths is REJECTED.

This task is architecturally independent: it defines the kill-switch data structure and the read pattern. The orchestrator in TASK-3/4 references it. At ship time, every path must be `false` — the "flip to live" for any path happens only after QA records GATE-PROOF for that path (TASK-6 / future per-path approvals).

### DDD Layer

The kill-switch is configuration (environment + runtime check). The read function belongs in `infrastructure/` or inline in the orchestrator. The architect decides the layer placement. The key constraint is that the per-path key schema is typed (no untyped string lookups).

### Files

| File | Change type | Note |
|---|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | Modify (extends TASK-3) | Reads the per-path kill-switch; gates dispatch step |
| `docker-compose.yml` (or `.env.example`) | Modify | Add `SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=false` and similar per-path env vars with comments |
| Architect-defined kill-switch helper | Possibly new | If architect extracts to a shared utility |

### Per-Path Keying Scheme (OPEN DESIGN POINT — see §4-i)

The exact keying scheme is architect-deferred (see §4 open design point i). The requirement is:

1. The kill-switch is keyed by a dispatch-path identifier. The dispatch-path identifier must be derived from the combination of `signal_type` and the gate mechanism that would be used (e.g. test suite, lint). A simple scheme: env var per path, e.g. `SELF_IMPROVE_AUTO_DISPATCH_<SIGNAL_TYPE_UPPER>=false`.
2. The default for any path not explicitly set in env is `false`. This must be enforced by the code (not by relying on the env var being absent — absent = `false`).
3. Reading an unknown dispatch-path key must return `false` (fail-safe, not fail-loud for this one case — unknown path = unknown gate = definitely false).
4. The kill-switch is read-only at runtime; no automated code path writes it to `true`. Only QA (human) or ops sets it.
5. The data structure must be typed so that adding a new path requires a code change (not a freeform string lookup), making the set of known paths visible in the codebase.

### Acceptance Criteria

- AC-T5-1 (C-4 HARD): At ship time, every known dispatch-path has `SELF_IMPROVE_AUTO_DISPATCH=false`. Test: call `isAutoDispatchEnabled(signalType)` for every entry in `DEGRADATION_CAUSE_MAP` → all must return `false` when no env override is set.
- AC-T5-2: Setting env var for one specific path to `true` enables ONLY that path. Test: inject env with `SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=true`; call `isAutoDispatchEnabled('price_confirmation')` → returns `true`; call `isAutoDispatchEnabled('chain_catalyst')` → returns `false`.
- AC-T5-3: An unknown signal type returns `false` (fail-safe). Test: `isAutoDispatchEnabled('totally_unknown_type_xyz')` → `false`.
- AC-T5-4: No single `SELF_IMPROVE_AUTO_DISPATCH=true` env var causes all paths to return `true`. If this pattern is found in code, it is a REJECT. Test: assert that setting a hypothetical `SELF_IMPROVE_AUTO_DISPATCH=true` (no path suffix) does NOT enable `isAutoDispatchEnabled('price_confirmation')`.
- AC-T5-5: The kill-switch type is exported and visible (e.g. as a `DispatchPath` enum or union type). Grep for `isAutoDispatchEnabled` must return a typed function signature, not an `any` parameter.

### Non-Functional Requirements

- NFR-T5-1: The kill-switch read must add ≤1ms to the job execution time (pure sync env read).
- NFR-T5-2: `docker-compose.yml` or `.env.example` includes commented-out per-path env vars with the note `# default false; flip ONLY after QA records GATE-PROOF in proposal doc`.

---

## TASK-6 (QA) — Gate-Proof Procedure

### Description

QA must execute the GATE-PROOF-1..5 procedure (brief §5) for the detection gate before any path may be flipped from `false` to `true`. This task is a QA task, not a dev task. It is listed here as a spec requirement because dev-team must not declare SIG-IMPL-GATE DONE until QA has either (a) recorded GATE-PROOF evidence or (b) explicitly reported that the gate does NOT go red (which triggers lane demotion to lane-A per brief §5).

**GATE-PROOF target:** the detection gate = the unit test suite that covers `detectDegradedSignalTypes()`. Inject a deliberate violation INTO the subject code (not the test config) — e.g. change the threshold constant from `0.10` to `0.50` in `degradationRules.ts` — and confirm the AC-T2-1 test goes RED. Then restore. Confirm GREEN.

### DDD Layer

QA layer — no production code changes. Test execution + evidence recording only.

### Files

| File | Change type | Note |
|---|---|---|
| First lane-B proposal doc generated by the running orchestrator | Modify | QA appends `## Gate Proof` section with GATE-PROOF-1..5 evidence |

### Acceptance Criteria

- AC-T6-1 (SPIKE AC-6): `SELF_IMPROVE_AUTO_DISPATCH` env var exists in the Docker environment and defaults to `false` (per-path). No path is `true` at ship time. Verified by QA reading `docker-compose.yml` / `.env.example`.
- AC-T6-2: QA injects a deliberate violation INTO `degradationRules.ts` (not the test file, not the gate config). Specifically: changes the DEGRADED threshold so a 15pp delta does NOT trigger detection. The test suite for AC-T2-1 must go RED. QA records the failing test name and output.
- AC-T6-3: QA removes the violation. The test suite returns to GREEN. QA records the restoration confirmation.
- AC-T6-4: QA writes the GATE-PROOF evidence into the first real proposal doc generated by the running orchestrator: `## Gate Proof — "Gate proven red on [date] by [method]. Evidence: [test output excerpt]"`.
- AC-T6-5: If the gate does NOT go red (AC-T6-2 step fails — the test passes despite the violation), QA records `GATE-PROOF-FAILED` in the proposal doc and the lane-B path for this detection gate is reclassified to LANE-A. This demotion must be recorded explicitly; QA must NOT silently pass. An assertion that a test suite "passes" without demonstrating red is a REJECT (feedback_fence_false_green).

### QA Dependency Note for Architect/PM

TASK-6 depends on TASK-1 through TASK-5 being deployed and the running orchestrator having generated at least one `improve_check_log` row and one proposal doc in the live container. The ops REBUILD step (not restart — `feedback_rebuild_after_dev_change`) must complete before TASK-6 can start. PM must sequence the sprint: dev tasks serial by dependency, QA after ops rebuild.

---

## 3. Hard Constraints (carry into architect blueprint)

| Constraint | Source | Requirement |
|---|---|---|
| No new Docker service | project_host_memory_panic | All 5 new files run inside the existing mcp-server process. SPIKE §3 Option A is REJECTED. |
| No new cowork agent | project_host_memory_panic | SPIKE §3 Option B is REJECTED. |
| No new cron beyond `selfImproveOrchestratorJob` at `0 9 * * *` | project_host_memory_panic, 8GB Docker cap | One new cron slot. If the architect needs a second slot for any reason, STOP and return to PO with a line-itemed RAM+disk+tick budget. |
| Shadow mode at ship | SIG-PO-GATE verdict | Every dispatch path default-false. Nothing auto-dispatches at ship time. |
| No test regression floor | SIG-PO-GATE kickoff | Floor: 9408 PASS, ceiling: 348 FAIL per `docs/data/project-stats.json`. New code adds ≥6 unit tests per SPIKE §12 AC-8 plus C-4 kill-switch test plus D-IMPROVE doc-emit test. |
| Serialized commits, no `-A`/`.` | feedback_concurrent_commit_race | Explicit path `git add` only. Files left UNSTAGED for main terminal to commit. Do NOT touch `pilot-status-*.json`. |
| ops REBUILD after dev change | feedback_rebuild_after_dev_change | After dev-mcp-server completes all 5 tasks, ops force-recreates the mcp-server container. |
| DB single-writer constraint | project_mcp_server_write_wedge | The orchestrator job runs INSIDE mcp-server (Option C). Never crosses process boundary to write `market.db`. |
| Fail-loud-skip for D-IMPROVE errors | SIG-PO-GATE C-5 | A bad candidate in the D-IMPROVE doc-write step must log + skip that candidate, never abort the Tier-2 freshness sweep or the log+Telegram pipeline. |
| No changes to gate/audit logic | SIG-PO-GATE lane-C boundary | Modifying `DEGRADATION_CAUSE_MAP` entries (threshold changes, removing signal types) is lane-C. The build only ADDS new `DEGRADATION_CAUSE_MAP` entries. |
| Lane-C items out of scope | SIG-PO-GATE kickoff §lane-C-boundary | Global/fleet-wide flip of all paths to live, any gate/audit self-edit, and un-pausing Sprint 1948 OBSERVE gates are NOT in scope. If the build cannot proceed without one of these, STOP and return to PO. |

---

## 4. Open Design Points for Architect (flag only — do not re-decide the settled spec)

These are the two genuinely open points the PO kickoff explicitly instructs BA to surface. They are NOT blockers — the architect resolves them in the technical blueprint.

### Open Point i — Per-Path Kill-Switch Keying Scheme (C-4)

**Question:** What is the exact TypeScript type for the dispatch-path identifier, and what is the env var naming convention for per-path keys?

**Constraints the architect must honor:**
1. The default for any path is `false` (fail-safe on unknown paths).
2. The set of known paths must be visible as a typed constant in the codebase (not freeform strings).
3. A single `SELF_IMPROVE_AUTO_DISPATCH=true` global must NOT enable all paths.
4. Adding a new path requires a code change (not just setting a new env var).

**Suggested starting point (architect may refine or reject):**
```typescript
// DispatchPath keyed by signal_type — each path has its own env var
const DISPATCH_PATHS = ['price_confirmation','chain_catalyst','volume_spike','coverage_gap'] as const;
type DispatchPath = typeof DISPATCH_PATHS[number];
// env var: SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION, etc.
function isAutoDispatchEnabled(path: DispatchPath): boolean {
  const key = `SELF_IMPROVE_AUTO_DISPATCH_${path.toUpperCase()}`;
  return Bun.env[key] === 'true';
}
```

### Open Point ii — Proposal Doc Slug + Dedup Key + fix_area → target_agent Mapping

**Question 1 (slug):** What is the canonical slug derivation rule for `IMP-<YYYYMMDD>-<slug>`? The BA-suggested default is `{signal_type}-{detection_class_lower}` (e.g. `price-confirmation-degraded`), but the architect may define a different scheme. The rule must be deterministic (same inputs → same slug) so the cooldown guard can check for duplicates by filename pattern.

**Question 2 (dedup key):** How is the weakness_identifier derived for the cooldown guard? BA-suggested: `signal_type + '_' + detection_class` as a composite string. Architect may use a different scheme as long as it is deterministic and collision-safe.

**Question 3 (fix_area → target_agent mapping):** The `fix_area` values in `DEGRADATION_CAUSE_MAP` are partial paths (`apps/mcp-server/src/scheduler/alerts/`, `apps/mcp-server/src/scheduler/news/`, `apps/technical-analysis/`, `manual`). The architect must define the mapping to `target_agent` (kebab-case agent names). C-1 requires that this mapping is used at doc-emit time; the orchestrator must not parse free-text prose to derive it.

**No blocker:** these are internal design details the architect can resolve without PO input. If the architect finds a conflict that requires a product decision, they return to PO.

---

## 5. Blockers for PO Resolution

No blockers at this time. The PO kickoff pre-resolved the lane-C boundary check. No item in this spec requires a product call from the user.

The one item that WOULD become a blocker: if during the architect blueprint phase any of the hard constraints in §3 are found to be mutually contradictory (e.g. the single-writer DB constraint cannot be satisfied without a new process), the architect STOPS and returns to PO before writing any code. That is the standing lane-C protocol, not a current blocker.

---

## 6. Test Count Summary

| Task | New unit tests (minimum) |
|---|---|
| TASK-1 | 6 (AC-T1-1 through AC-T1-6) |
| TASK-2 | 8 (AC-T2-1 through AC-T2-8 — the 8th is a static/lint check, counts as a test gate) |
| TASK-3 | 9 (AC-T3-1 through AC-T3-9) |
| TASK-4 | 8 (AC-T4-1 through AC-T4-8) |
| TASK-5 | 5 (AC-T5-1 through AC-T5-5) |
| **Total new** | **36 minimum** |
| TASK-6 (QA) | Gate-proof evidence record (not unit tests) |

All new tests must run via the existing test runner (Bun test) without touching real DB or real Telegram. Injectable deps pattern is mandatory for all new scheduler code (reference: `AccuracyDigestDeps` interface in `accuracyDigestJob.ts`).

---

## 7. Notebook Append

**Session:** 2026-05-27 · SIG-IMPL-GATE-BA

SIG-IMPL-GATE decomposition complete. 5 dev tasks + 1 QA task, 36 minimum new unit tests. Two open design points surfaced for architect (i: per-path kill-switch keying; ii: slug derivation + fix_area→target_agent mapping). Zero PO blockers.

Key decisions encoded:
- TASK-5 (C-4 per-path kill-switch) is a standalone task explicitly calling out the REJECTED global-flag anti-pattern as an AC.
- TASK-4 (D-IMPROVE bridge) explicitly requires fail-loud-skip isolation from TASK-3's primary pipeline (C-5).
- TASK-6 (QA gate-proof) is named and spec'd with the false-green prevention clause: "tests pass" ≠ "gate proves red."
- C-1 structured `target_agent`/`target_files[]` fields are in TASK-4 AC-T4-1..3 with the UNRESOLVED fallback for `_default` entries.
- SPIKE §12 AC-1..AC-8 are all mapped to TASK-3/TASK-2 ACs above (verified coverage).
- Cron collision check: `bctcOverdueCheck = '0 9 * * 1-5'` (weekdays), new job `= '0 9 * * *'` (daily) — same minute, different day pattern. Architect must confirm whether `2 9 * * *` is safer. Not a blocker, surfaced as detail.

Files left UNSTAGED per main-terminal commit-serialization rule.
