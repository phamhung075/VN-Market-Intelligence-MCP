---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 7
task_id: TASK_2006
branch: task/2006-daily-ff-deprecation-comment
size: S
zone: apps/mcp-server/
depends_on: ["TASK_2002"]
blocks: []
optional: true
---

## TLDR
**Follow-on task (optional, not required for P1 sprint delivery).** Add schema comment to `daily_ohlcv.foreign_*` columns marking them as frozen/historical. NOT a `DROP COLUMN` (live named-volume DB risk per parent design). Annotation-only for code archaeology and future developer clarity.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-7 (§5 PM Task Atomization — marked optional)

### Acceptance Criteria
- [ ] Schema comment added to `daily_ohlcv` table in `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:L97-100` marking columns as: "Frozen historical-only columns as of 2026-07-10 (ARCH-DAILY-FOREIGN-FLOW-TABLE). New foreign-flow data written to daily_foreign_flow table. Legacy columns retained for backward compatibility; do NOT write new data here."
- [ ] Comment added to `ohlcvForeignFlowStore.ts` JSDoc reiterating that `daily_ohlcv.foreign_*` is deprecated in favor of `daily_foreign_flow`
- [ ] No code changes — annotation/comment only
- [ ] Type checks pass (`pnpm check`)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 2 (SSOT-freeze annotation), § Risk Flags R-7

### Files to modify
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:L97-100` (comment on foreign_* columns)
- `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` (JSDoc annotation per R-7 mitigation)

### Files to create
- None (only comment additions)

### Dependencies
- **Depends on:** TASK_2002 (writer cutover must land before annotation makes sense)
- **Blocks:** none
- **Optional:** this task is a backlog follow-on, not required for P1 delivery

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Risk Flags R-7

### Notes
- **Zone:** `apps/mcp-server/` only
- **Size:** S — pure annotation, no code logic changes
- **Why optional:** annotation-only improvement for future developers; doesn't block any functionality or close any risk (SSOT-freeze is already enforced by writer logic in TASK_2002)
- **Why not a `DROP COLUMN`:** parent design explicitly decided against this due to live named-volume DB risk. Column removal is complex and risky; annotation achieves the same clarity without the risk. Can be revisited in a later maintenance sprint if needed.
- **Placement in backlog:** suitable for a dedicated sprint slot or as low-priority follow-on once core tasks (TASK_2000-2005) are shipped and verified

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:118-152` — JS block comment above the `daily_ohlcv` `db.exec` DDL + inline SQL `--` comments on the 4 `foreign_*` columns, near-verbatim architect phrasing ("Frozen historical-only columns as of 2026-07-10 (ARCH-DAILY-FOREIGN-FLOW-TABLE). New foreign-flow data written to daily_foreign_flow table. Legacy columns retained for backward compatibility; do NOT write new data here.")
  - `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts:48-58` — added a short JSDoc paragraph explicitly stating `daily_ohlcv.foreign_*` is DEPRECATED in favor of `daily_foreign_flow`, cross-referencing the schema comment (existing SSOT-FREEZE block from TASK_2002/2003 already covered the mechanism; this reiterates the AC's literal wording)
- **Tests written:** none (annotation-only, no new behavior to assert)
- **Git commits:** (recorded post-commit below)
- **Type check:** clean (`bun tsc --noEmit` / `pnpm check`, exit 0)
- **bun test:** targeted `daily-foreign-flow-*` suite (backfill/integration/schema, 3 files) 33/33 pass, 0 fail. Full suite: 14904 pass / 40 skip / 54 fail / 1239 files (557s) — within the standing `FIX-MCP-SUITE-HEALTH-BASELINE` band; `git diff` confirmed both touched files changed comment-lines only (zero code/logic delta), so the 54 pre-existing failures (e.g. `_deprecated/1302-technical-indicators.test.ts`, a simulated-failure scenario in `DS-OBS-01-FIX-sla-breach-work-bug-alert.test.ts`) are unrelated to this diff.
- **Tool count:** 184 tools — matches pre-task baseline (no tool touched)
- **Scheduler count:** 88 cron jobs — matches pre-task baseline (no scheduler touched)
- **Docs updated:** NONE (annotation-only, no behavior/API/schema-shape change to document)
- **Graphify:** skipped (no docs impacted)
