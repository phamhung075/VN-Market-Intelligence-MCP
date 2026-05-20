# Agent Father — Notebook

**Last updated:** 2026-05-20 | **Sprint:** task-lock Phase 1 + 1957b

## This Session — 2026-05-20 (Task task-lock-phase1 — coordination.db + 4 MCP tools)

**Task:** Phase 1 of task-lock system per architect brief `docs/architecture-briefs/2026-05-20-task-lock-system.md`

**Commit:** `79ac45e9` | Tests: 29 pass / 0 fail | Smoke: 9/9 PASS | toolCount: 142→146

Files created (8): coordination.db migration, coordinationStore.ts, coordinationTools.ts, 2 test files, task-lock-protocol.md, skill, smoke-task-lock.ts
Files modified (11): registry.ts, system/index.ts, 8 tool packages, mcp-tools.md
NEXT: pm plan Phase 2 (cowork-slot flow wiring) + Phase 3 (sprint-task drain)

## Previous Session — 2026-05-20 (Task 1957b — cowork master-cron skill + runbook)

**Task: 1957b — Phase-1 completion artefacts for cowork master-scheduler**

Source: `docs/signals/processed/po-1957-cowork-scheduler.json` + architecture brief `docs/architecture-briefs/2026-05-18-cowork-master-scheduler.md`.

**Root cause context:** The `*/15 * * * *` CronCreate dispatcher (Sprint 1951c `cowork-team`) is session-scoped. When the Claude Code CLI session ended, the dispatcher evaporated → cowork went dark ~44h. Two artefacts from the 1951c cutover plan were declared MANDATORY but never built. Task 1957b builds them.

Files created (3):
- `.claude/skills/cron-cowork-team/SKILL.md` — idempotent master CronCreate registration skill. Invoked via `/cron-cowork-team`. Step 1: CronList check (no-op if present). Step 2: CronCreate `*/15 * * * *` durable:true pointing at `.claude/flows/cowork-team/main.md`. Step 3: post-verify. Includes CronDelete admin section.
- `docs/protocols/cowork-master-cron-runbook.md` — 9-section operational runbook. Covers: architecture (Layer A=RemoteTriggers persistent, Layer B=CronCreate session-scoped), silence-detection signatures (chef >6h, alert-commander >24h, no signals >20min during 02:00-08:30Z), session-start procedure, Layer B recovery, Layer A recovery, diagnostic commands, escalation criteria, 5-test sanity checklist, prevention guidance.
- `docs/signals/agent-father-1957b-cowork-skill-built.json` — completion signal to po + ops.

Files updated (3):
- `CLAUDE.md` — `/cron-cowork-team` 1-line pointer added under new `## Skills (slash commands)` section in Defaults block.
- `docs/signals/DASHBOARD.md` — 1957b → DONE, 1957c gate status updated (1957b-done CLEARED), timestamp updated.
- `docs/TASKS.md` — 1957b → DONE row with signal reference; 1957c gate cleared.

Acceptance verified:
- AC-1: Skill present, idempotent (CronList guard in Step 1).
- AC-2: Second invocation = no-op by design.
- AC-3: Runbook has §3 Session-start, §2 Silence-detection, §4 Recovery, §8 Sanity tests.
- AC-4: CLAUDE.md pointer present.
- AC-5: Signal emitted.
- AC-6: DASHBOARD.md + TASKS.md updated; 1957c unblocked.
- AC-7: Notebook overwritten (this entry).

Gate cleared for 1957c (ops): re-block 1951d cutover in docs/TASKS.md Blocked-by column.

## Previous Session — 2026-05-19 (Sprint 1951j — cowork self-abort fix)

**Task: 1951j — no_self_abort + Write-tool contract across all 7 cowork agents**

Source: signals `cowork-team-20260519T032444Z-self-abort-pattern.json` + `cowork-team-20260519T042257Z-step8-notebook-gap.json`.

Files edited (8, single commit):
- `.claude/flows/unified-agent/chef.md` — Step 8 inline Write-tool contract added
- `.claude/agents/market-watcher.md`, `news-scout.md`, `alert-commander.md`, `financial-analyst.md`, `tran-ngoc-bau.md`, `digest-predict.md` — `no_self_abort: true` + `write_tool_available: true` added
- `docs/TASKS.md` — 1951j added to Done

## Previous Session — 2026-05-19 (Sprint 1951b cowork tool packages)

**Task: 1951b — cowork tool-packages + notebook-write capability**

Files edited (13, single commit 80768093): market-analyst.md, anti-hallucination SKILL.md, tran-ngoc-bau tool package, system-map.json, 8 agent .md files (alert-commander, news-scout, market-watcher, financial-analyst, digest-predict, unified-agent, report-analyzer, qa-responder), market-watcher cycle.md.

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification

## Patterns Noticed

- `agent-md-factory` skill does not exist as a file in this repo; pattern is applied from memory rule / SSOT conventions.
- docs/data/ may have a gitignore rule applied by other tools; use `git add -f` for tracked files that surface the warning.
- Concurrent agents leave pre-staged files — always check `git status` before staging.
- 1957 context: CronCreate is session-scoped (dies on CLI exit). RemoteTriggers are claude.ai-native and session-independent. The two layers are complementary, not alternatives. Never delete RemoteTriggers before the skill + runbook are in place.
- DASHBOARD.md is modified between reads by concurrent agents — always re-read before editing.
