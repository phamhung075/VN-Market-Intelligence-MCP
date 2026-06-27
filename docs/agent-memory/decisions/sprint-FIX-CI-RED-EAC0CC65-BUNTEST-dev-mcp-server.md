# Decision Journal — Sprint FIX-CI-RED-EAC0CC65-BUNTEST · dev-mcp-server

**Sprint goal:** Unblock CI bun test RED on origin/main HEAD eac0cc65 — 73 failures across 16 files
**Agent:** dev-mcp-server
**Started:** 2026-06-27T00:00:00Z
**Pushed SHA:** 6bcbe2e5

---

### DJ-GATE-1 · dev-mcp-server · 2026-06-27

**task-id:** FIX-CI-RED-EAC0CC65-BUNTEST

**root-cause-analysis:**
16 unrelated test files failing simultaneously pointed to shared infrastructure. Recon found 4 shared root causes:

1. **`confidence_score` column missing** (`alertStore.ts`): `storeAlerts` and `storeAlertsFromCommander` INSERT into `agent_signals` with `confidence_score` but `ensureConfidenceScoreColumn()` guard was absent. Tests that create `agent_signals` manually (without running schema-news.ts migrations) hit `SQLiteError: table agent_signals has no column named confidence_score`.

2. **`OrchStateSchema.strict()` rejects legacy root keys**: Root-level `_schema`, `_ssot`, `_updated_at`, `_updated_by` are defined in the `OrchState` TypeScript interface and present in test fixtures, but `.strict()` rejects any unknown root key. Any test that validates orch-state through the schema failed with `Unrecognized key(s)`.

3. **`head: {}` violates `HeadSchema` requires status**: `improvementSignalWriter.ts` bootstraps a shell orch-state with `head: {}` when no file exists, but `HeadSchema` requires `status: z.string()`. Produces `head.status: Required` error on first write.

4. **Three test-specific issues** (time-drift + schema-evolution + parallelism-false-positive):
   - `1948a-improve-check-store.test.ts`: hardcoded `checked_at = '2026-05-27'` now >30 days old, filtered by `withinDays: 30` window.
   - `1837a-pipeline-state.test.ts`: live orch-state has `head.status = "ready"` but `validStatuses` array didn't include "ready" (added 2026-06-27 via ADD-1 READY-bootstrap).
   - `DWF-phase1-cadence.test.ts`: expected 16 enabled cowork slots but `cowork-schedule.json` now has 17 (tnb-audit slot added).
   - `1407b-sla-market-hours-gate.test.ts` MH-3: off-hours date (Apr 27) is outside BCTC earnings window; FIX-BCTC-SLA-THRESHOLD-360 expanded threshold to `minutesSinceLastEarningsWindowEnd + 30 ≈ 17341`, so 400-min stale no longer breaches. Fixed by using Apr 6 (inside window).
   - `WF2-signal-queue-cas.test.ts` T9: `superRefine` referential integrity check requires `active_task_id` to resolve to a task in `task_board`; task stub was missing required `title` and `owner` fields causing tsc failure.

**what-done:**
- `apps/mcp-server/src/infrastructure/db/alertStore.ts`: added `ensureConfidenceScoreColumn()` guard; called in both `storeAlerts` and `storeAlertsFromCommander`.
- `apps/mcp-server/src/infrastructure/orchStateSchema.ts`: added `_schema`, `_ssot`, `_updated_at`, `_updated_by` as optional fields before `.strict()`.
- `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts`: changed `head: {}` → `head: { status: "idle" }` in shell bootstrap.
- `apps/mcp-server/src/__tests__/1948a-improve-check-store.test.ts`: replaced hardcoded stale dates with `datetime('now', '-N days')` SQLite expressions.
- `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts`: added "ready" to `validStatuses` array.
- `apps/mcp-server/src/__tests__/DWF-phase1-cadence.test.ts`: updated slot count assertion from 16 → 17.
- `apps/mcp-server/src/__tests__/1407b-sla-market-hours-gate.test.ts`: replaced `OFF_HOURS_DATE` (Apr 27, outside window) with `BCTC_EARNINGS_WINDOW_DATE` (Apr 6, inside window) in MH-3.
- `apps/mcp-server/src/__tests__/WF2-signal-queue-cas.test.ts`: added `title: "WF-2 stub", owner: "dev"` to task stub in T9 to satisfy `OrchStateTaskBoardTask` TypeScript interface.

**what-considered:**
- Weakening tests (e.g. removing `.strict()` outright, removing `superRefine`) — rejected: tests must remain accurate sentinels; only source files should change for schema issues.
- Using `as OrchState` type-cast in WF2 T9 to bypass TypeScript error — rejected: real fields are better than casting; hides potential real bugs.
- Lowering `withinDays` window to cover stale dates — rejected: time-drift root cause; fix dates, not window.

**why-decision:**
Recon showed 16 files → 4 shared root causes. Fixing the shared infrastructure (alertStore guard + schema optional fields + shell status) resolved the bulk (13 files). Remaining 3 were classic test-drift (time, enum-add, counter-add) plus 1 TypeScript-only blocker. All fixes narrow scope to minimum: source files for infra bugs, test fixtures for drift.

**verify:**
- 16 originally failing files: all 0 fail when run individually
- 8 additional files showing "Illegal instruction: 4" in parallel CI: 0 fail individually (Bun macOS native crash under P≥8, not test failures)
- `pnpm --filter vn-market check` (tsc): PASS
- Pre-push hook: PASSED, fast-forward push succeeded
- Pushed SHA on origin/main: `6bcbe2e5`
