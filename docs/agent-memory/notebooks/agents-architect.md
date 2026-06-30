# agents-architect — Notebook

## 2026-06-28T19:17:01Z

**Brief:** `docs/architecture-briefs/2026-06-28-simplicity-gate-skill.md`

SIMPLICITY-GATE: No preventive minimalism gate exists at authoring time; dev-* agents trend toward DDD maximalism because all existing gates fire after code lands (code-janitor=reactive DRY; code-simplifier=post-QA readability; self-critique=PLAN-ONLY advisory). New skill `.claude/skills/simplicity-gate/SKILL.md` provides a 4-question self-check (Q1 scope creep, Q2 single-use abstraction, Q3 senior-engineer test, Q4 line-ratio) that developer runs autonomously after TDD GREEN and before flipping task status to REVIEW. Self-enforced — no human-ask, no doctrine conflict. Wiring line added to all authoritative dev flow files at the After-code→Documentation-review boundary. Distinct lane from code-janitor (DRY/structural duplication, reactive cron) and code-simplifier (post-QA readability). QA advisory checklist item embedded in skill body; not a hard QA block by default.

**Signal dropped:** `docs/signals/simplicity-gate-20260628T191701Z.json` → agent-father

---

## 2026-06-29T20:18:45Z

**Brief:** `docs/architecture-briefs/2026-06-29-deferred-task-scheduler.md`

DEFERRED-TASK-SCHEDULER: Fleet has cron(8) but no at(1) — no primitive for "once, at epoch T, wake agent X, then forget." MVP: new `scheduled_tasks` SQLite table in coordination.db (Migration 4); `fire_at`/`deadline_at`/`created_at`/`fired_at` = INTEGER epoch-seconds (never ISO8601 — strcompare bypass scar); `dedup_key TEXT UNIQUE` in CREATE TABLE DDL (never ADD COLUMN — silent no-op scar). 3 MCP tools: `schedule_task` / `cancel_scheduled_task` / `list_scheduled_tasks`. Internal `claim_due_scheduled_tasks` atomic UPDATE→RETURNING. Sweeper folded into cowork-team */15 as Step 0b.3 (after fire-time election win, before blind-guard). COWORK delivery via PRE-CLAIM intent gate (task_kind="intent", already deployed) → spawn agent. DEV delivery via orch-apply.sh + SignalRowSchema → signal_queue; zero new dev-side code. No new task_kind. 12 AC: epoch-int storage, UNIQUE DDL, deadline expiry gate, PRE-CLAIM gate, orch-apply delivery, roster-sourced team map, no orch-state write at insert time. 3 verify use-cases worked E2E: rebuild health check (ops/DEV), FOMC anchor (market-watcher/COWORK), bug re-probe (system-auditor/DEV). Phase-2 deferred: 24/7 launchd sweeper. ST-1..ST-8 all routed to dev-mcp-server.

**Signal dropped:** `docs/signals/deferred-task-scheduler-20260629T201845Z.json` → po

---

## 2026-06-30T17:50:58Z

**Brief:** `docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md`

CCATO-GATE: "narrative claim-vs-truth re-probe" × "blocks before publish" = empty across all 6 existing gates; verified on fb-post-2026-06-30.md (VNM line 28 + foreign-flow line 10 cleared all gates). Root cause: NO_TA self-reported at main.md:176-177, fb-data-integrity-gate.sh checks only present numbers. Tier-1 fix: shared `claim-truth-gate` skill + `narrative-truth-gate.sh` re-probe engine (reads `docs/data/claim-tool-map.json` SSOT; exits non-zero on contradiction; PASS-on-null avoids honest-NULL false positive). Wiring: fb-market-poster STEP 4d; CHEF Rule AF-3 in Step 6.7; market-watcher Step 4f; alert-commander Step 4a-pre; digest-predict P-5.5. TNB extends Step 2 to call same library (backstop). Self-heal: FAIL → self-correct in-cycle → emit narrative_contradiction signal → recurring≥2 → anomaly-task-bridge → po sprint. Tier-1 = scripts/+flow .md only; Tier-4 agent_id fix (evidenceTools.ts:413) = dev-mcp-server.

**Signal dropped:** `docs/signals/narrative-quality-ccato-gate-20260630T175058Z.json` → po
