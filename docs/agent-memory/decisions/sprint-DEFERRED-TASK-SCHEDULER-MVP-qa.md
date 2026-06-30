---
<!-- size-justification: 85L — QA terminal review record for DEFERRED-TASK-SCHEDULER-MVP; AC gate table + deployment gate + test results cannot decompose further. -->
sprint: DEFERRED-TASK-SCHEDULER-MVP
agent: qa
session: f981431d-ca74-49ee-9eb4-efc4f06531eb
reviewed_at: 2026-06-30T04:38Z
verdict: APPROVED
---

# QA Review — DEFERRED-TASK-SCHEDULER-MVP

Sprint: DEFERRED-TASK-SCHEDULER-MVP (at(1) one-shot deferred-task scheduler)
Implementation commits: 588b1031 (feat), 4847cab1 (notebook)
Handoff: docs/handoffs/BA-DEFERRED-SCHEDULER.md

## Deployment Gate

Image `sha256:6c3bb23e` built 2026-06-30T04:02:02Z (after commit 588b1031 at 2026-06-29T21:33Z UTC).
`scheduled_tasks` table present in live `coordination.db` (confirmed via bun in container).
All 7 tools callable via gateway call_tool (SSE session probe). DEPLOYED — NOT stale.

## AC Gate Verdicts (12 ACs + D1/D2/D3)

All PASS. Key evidences:

- **AC-1**: Live DB PRAGMA: fire_at type=INTEGER; claimDueScheduledTasks binds integer params; Python live probe: all time fields are int.
- **AC-2**: Live schema `dedup_key TEXT UNIQUE` in CREATE TABLE; sqlite_autoindex_scheduled_tasks_2 auto-index confirms UNIQUE constraint active.
- **AC-3**: Live test: insert fire_at=now-10, deadline_at=now-5 → claim_due → status=firing → expire_scheduled_task → status=expired (no routing). Unit test passes.
- **AC-4**: Step 0b.3 is inside recurring */15 cron in cowork-team/flow/main.md (after leader-lock WIN, before Step 0c). Comment AC-4 guard present.
- **AC-5**: Flow doc Step 0b.3: task_claim("intent:one-shot:<id>", task_kind="intent") before Agent() for COWORK path.
- **AC-6**: Flow doc Step 0b.3: DEV path pipes to `bash "$PROJECT_ROOT/scripts/orch-apply.sh"` with `--argjson row` bound variables. D3: companion file always written.
- **AC-7**: task_locks CHECK enum = 7 kinds (unchanged). scheduled_tasks is a separate table — no new task_kind needed.
- **AC-8**: AGENT_TEAM_MAP declarative map in agentTeamMap.ts; resolveAgentTeam("not-a-real-agent") → null → error returned live.
- **AC-9**: Honest caveat in schedule_task tool description text (line 65-67 scheduledTaskTools.ts) + system.md §Phase-2.
- **AC-10**: list_scheduled_tasks returns all audit fields; live test: fired row shows fired_at non-null + sweep_tick set.
- **AC-11 (D1)**: MVP terminal set = {fired, failed, expired, cancelled}. TERMINAL_STATUSES includes "fired". No mark_task_done tool. Unit test: 'in_progress' rejected by CHECK. All 4 terminals demonstrated live.
- **AC-12**: schedule_task calls insertScheduledTask() only — zero orch-state.json writes at insert time.
- **D2**: 4 privileged helpers absent from agentBootstrap.ts packages; accessible via gateway call_tool only.
- **D3**: DEV path ALWAYS writes companion file (no char-count threshold). summary = one-liner only.

## Test Results

- scheduledTasks.test.ts: 23 / 0
- Coordination suite (8 files): 156 / 0
- bun tsc --noEmit: 0 errors
- Full mcp-server suite: 14033 tests / 0 fail (exit 0)

## Terminal State Written

- head: status=done, next_agent=null, active_task_id=null, updated_by=qa
- sprint_goal.entries[18]: status=done, next_agent=null, qa_verdict=APPROVED, qa_at=2026-06-30T04:38Z
- Board DTS-ST rows: already all DONE (dev-mcp-server)
- BA-DEFERRED-SCHEDULER: already DONE (dev-mcp-server)

## Verdict

APPROVED — all 12 AC gates PASS, D1/D2/D3 directives respected, deployed and live-verified.
