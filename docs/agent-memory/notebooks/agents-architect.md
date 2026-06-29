# agents-architect — Notebook

## 2026-06-28T17:18:50Z

**Brief:** `docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md`

CROSS-SESSION-MULTI-TEAM-ORCH P3 addendum: 5 items pinned. §A: tick-boundary period-key = floor(fire-time) to cron boundary → `cron:<flow>:YYYY-MM-DDTHH:MMZ`; distinct from `published:<kind>:<period>` artifact dedup (different TTL, purpose, task_id prefix). §B: dispatcher-level election (not per-slot); cowork pipeline is stateful — per-slot concurrent dispatch risks shared-state race with cadence/snapshot; existing Step 4.6 slot-claims are intra-dispatch dedup, unchanged. §C: SF-1 first (session-level), fire-election second (cross-session); fire-election loss releases SF-1 before EXIT; no deadlock. §D: TTL=600s (5× dispatch p99); no heartbeat (per-fire, not sticky); explicit task_release at flow exit; crash safety = TTL backstop + P1.5 orphan-signals. §E: retire 3 patterns — feedback_router_cowork_defer_to_live_leader, feedback_router_manual_drive_overlaps_devteam_loop (both memory-only), and sticky cowork-leader 1800s (executable in leader-lock.md); gate = P3-AF-1 ships + smoke tests pass; AF-1 backstop preserved. P3-MCP: NOT NEEDED — reuse cowork-slot + sprint-task task_kinds; task_id prefix discriminates.

**Signal dropped:** `docs/signals/cross-session-multi-team-orch-20260628T080825Z.json` → pm (rev 2 — addendum companion; no new signal needed)

---

## 2026-06-28T19:17:01Z

**Brief:** `docs/architecture-briefs/2026-06-28-simplicity-gate-skill.md`

SIMPLICITY-GATE: No preventive minimalism gate exists at authoring time; dev-* agents trend toward DDD maximalism because all existing gates fire after code lands (code-janitor=reactive DRY; code-simplifier=post-QA readability; self-critique=PLAN-ONLY advisory). New skill `.claude/skills/simplicity-gate/SKILL.md` provides a 4-question self-check (Q1 scope creep, Q2 single-use abstraction, Q3 senior-engineer test, Q4 line-ratio) that developer runs autonomously after TDD GREEN and before flipping task status to REVIEW. Self-enforced — no human-ask, no doctrine conflict. Wiring line added to all authoritative dev flow files at the After-code→Documentation-review boundary. Distinct lane from code-janitor (DRY/structural duplication, reactive cron) and code-simplifier (post-QA readability). QA advisory checklist item embedded in skill body; not a hard QA block by default.

**Signal dropped:** `docs/signals/simplicity-gate-20260628T191701Z.json` → agent-father

---

## 2026-06-29T20:18:45Z

**Brief:** `docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md`

DEFERRED-TASK-SCHEDULER: Fleet has cron(8) but no at(1) — no primitive for "once, at epoch T, wake agent X, then forget." MVP: new `scheduled_tasks` SQLite table in coordination.db (Migration 4); `fire_at`/`deadline_at`/`created_at`/`fired_at` = INTEGER epoch-seconds (never ISO8601 — strcompare bypass scar); `dedup_key TEXT UNIQUE` in CREATE TABLE DDL (never ADD COLUMN — silent no-op scar). 3 MCP tools: `schedule_task` / `cancel_scheduled_task` / `list_scheduled_tasks`. Internal `claim_due_scheduled_tasks` atomic UPDATE→RETURNING. Sweeper folded into cowork-team */15 as Step 0b.3 (after fire-time election win, before blind-guard). COWORK delivery via PRE-CLAIM intent gate (task_kind="intent", already deployed) → spawn agent. DEV delivery via orch-apply.sh + SignalRowSchema → signal_queue; zero new dev-side code. No new task_kind. 12 AC: epoch-int storage, UNIQUE DDL, deadline expiry gate, PRE-CLAIM gate, orch-apply delivery, roster-sourced team map, no orch-state write at insert time. 3 verify use-cases worked E2E: rebuild health check (ops/DEV), FOMC anchor (market-watcher/COWORK), bug re-probe (system-auditor/DEV). Phase-2 deferred: 24/7 launchd sweeper. ST-1..ST-8 all routed to dev-mcp-server.

**Signal dropped:** `docs/signals/deferred-task-scheduler-20260629T201845Z.json` → po
