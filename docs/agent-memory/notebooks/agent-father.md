# Agent Father — Notebook

**Last updated:** 2026-05-21T17:27:36Z | **Sprint:** 1965a — TASKS.md Reconciliation Pass design

## This Session — 2026-05-21T17:27Z (Task 1965a — system-auditor TASKS.md reconciliation pass DESIGN)

**Task:** 1965a — DESIGN: add TASKS.md Reconciliation Pass to system-auditor handlers.md + dimension D4 to audit-dimensions.md.

**Source:** `docs/signals/po-1965-kickoff.json` + `docs/architecture-briefs/2026-05-21-tasks-md-hardening.md` §3 Option A + §8 Phase 1.

**Task lock:** inner self-claim `task:1965a` (kind=sprint-task, ttl=3600s, owner=agent-father). pipeline-state.activeTaskId=null at claim time — no collision.

**Scope (DESIGN only — no code, no Docker changes):**

Two new files created under `docs/agents/system-auditor/` (directory did not exist):

1. `docs/agents/system-auditor/handlers.md`
   - TASKS.md Reconciliation Pass section: trigger 03:00Z daily, steps R-1..R-7
   - R-1: `task_list_held(kind="sprint-task")` via MCP; AC-4 pipeline-state empty-list cross-check
   - R-2: pipeline-state.json `activeTaskId` vs held lock cross-check
   - R-3: TASKS.md owner/status cross-check per held lock (owner diverge + status diverge)
   - R-4: git log concurrent-commit detection (30s window on docs/TASKS.md)
   - R-5: DASHBOARD `## po` emit per divergence (signal-dashboard skill format)
   - R-6: BUG channel for new divergences (dedup 7d, key: `d4_tasksmd_lock_diverge:<task_id>`)
   - R-7: clean signal log if zero divergences
   - Failure modes table: MCP fail, TASKS.md parse fail, pipeline-state missing, git log fail

2. `docs/agents/system-auditor/audit-dimensions.md`
   - Canonical dimension registry (D1 runtime, D2 fetch, D3 DB integrity pre-existing)
   - D4: TASKS.md/task-lock coherence — tier 3 at 03:00Z, checks D4-R1..D4-R4, AC-1..AC-5
   - Signal bus: DASHBOARD ## po + BUG channel (new only, 7d dedup)
   - Not-in-scope: auto-fix, coordination.db writes, TTL enforcement, Option C (deferred)

**Completion signal:** `docs/signals/agent-father-1965a-design-done.json` → to=dev-mcp-server, type=design-done

**Cascade:** None. Both files are additive (new directory + 2 new files). system-auditor.md flow file unchanged — implementation of the 03:00Z wiring is 1965b (dev-mcp-server). No agent .md edits needed for DESIGN phase.

**Pattern noted:** `docs/agents/system-auditor/` directory did not exist before this task — created fresh. Pattern matches `docs/agents/agents-architect/` and `docs/agents/ops/` which each have a `handlers.md` under a per-agent directory.

## Previous Session — 2026-05-21 (Task 1963-MW-IDENTITY — market-watcher identity pathology fix)

**Task:** Fix intermittent market-watcher identity pathology per DASHBOARD.md 1963-MW-IDENTITY.

**Root cause identified:** `mcp-tools.md` was `lazy_load(trigger=startup)`. When agent mis-identified its role, the trigger never fired — agent never learned MCP tools were available → "cannot call MCP tools" hallucination. YAML `description` field also lacked explicit identity statement.

**Changes applied to `.claude/agents/market-watcher.md` (1 file, 0 cascade):**
1. YAML `description` — explicit "You ARE the Market Watcher agent. Execute your flow end-to-end using call_tool(server="vn-market", ...)"
2. `mcp-tools.md` promoted from `lazy_load(trigger=startup)` to `always_load` (fail_loud: true)
3. Added `identity_role: "market-watcher"` constraint
4. Added `mcp_tool_available: true` constraint
5. Added missing `signals:` section (consumes: urgent_news, cross_validate; produces: price_anomaly)
6. Added missing `schedule:` section (market_hours, prepost, eod crons)
7. Version bumped to 2026-05-21

**Validation:** 5/5 — YAML frontmatter valid, all always_load paths resolve, flow path exists, inter_agent symmetric with news-scout, version updated.

**DASHBOARD:** 1963-MW-IDENTITY marked DONE. AC: 2 consecutive clean fires post-fix.

**Cascade:** None. The description/constraints/knowledge changes are self-contained within market-watcher.md.

## Previous Session — 2026-05-20 (Task task-lock-phase1 — coordination.db + 4 MCP tools)

**Task:** Phase 1 of task-lock system per architect brief `docs/architecture-briefs/2026-05-20-task-lock-system.md`

**Commit:** `79ac45e9` | Tests: 29 pass / 0 fail | Smoke: 9/9 PASS | toolCount: 142→146

Files created (8): coordination.db migration, coordinationStore.ts, coordinationTools.ts, 2 test files, task-lock-protocol.md, skill, smoke-task-lock.ts
Files modified (11): registry.ts, system/index.ts, 8 tool packages, mcp-tools.md
NEXT: pm plan Phase 2 (cowork-slot flow wiring) + Phase 3 (sprint-task drain)

## Previous Session — 2026-05-20 (Task 1957b — cowork master-cron skill + runbook)

**Task: 1957b — Phase-1 completion artefacts for cowork master-scheduler**

Files created (3): `.claude/skills/cron-cowork-team/SKILL.md`, `docs/protocols/cowork-master-cron-runbook.md`, `docs/signals/agent-father-1957b-cowork-skill-built.json`
Files updated (3): `CLAUDE.md`, `docs/signals/DASHBOARD.md`, `docs/TASKS.md`

## Previous Session — 2026-05-19 (Sprint 1951j — cowork self-abort fix)

Files edited (8): unified-agent chef.md Step 8, 6 cowork agent .md files (no_self_abort + write_tool_available), TASKS.md.

## Previous Session — 2026-05-19 (Sprint 1951b cowork tool packages)

Files edited (13, commit 80768093): market-analyst.md, anti-hallucination SKILL.md, tran-ngoc-bau tool package, system-map.json, 8 agent .md files, market-watcher cycle.md.

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification

## Patterns Noticed

- `agent-md-factory` skill does not exist as a file in this repo; pattern is applied from memory rule / SSOT conventions.
- docs/data/ may have a gitignore rule applied by other tools; use `git add -f` for tracked files that surface the warning.
- Concurrent agents leave pre-staged files — always check `git status` before staging.
- 1957 context: CronCreate is session-scoped (dies on CLI exit). RemoteTriggers are claude.ai-native and session-independent.
- DASHBOARD.md is modified between reads by concurrent agents — always re-read before editing.
- docs/agents/<agent-id>/ directories are created per-agent as handlers.md + audit-dimensions.md patterns emerge. Pattern confirmed for: agents-architect, ops, system-auditor (1965a).
