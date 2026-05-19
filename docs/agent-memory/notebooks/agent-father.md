# Agent Father — Notebook

**Last updated:** 2026-05-19 | **Sprint:** 1951j (cowork self-abort fix — no_self_abort + Write-tool contract)

## This Session — 2026-05-19 (Task 1951j — cowork self-abort pattern fix)

**Task: 1951j — no_self_abort + Write-tool contract across all 7 cowork agents**

Source: signals `cowork-team-20260519T032444Z-self-abort-pattern.json` + `cowork-team-20260519T042257Z-step8-notebook-gap.json`.

Files edited (8, single commit):
- `.claude/flows/unified-agent/chef.md` — Step 8 inline Write-tool contract added (hotfix for "cannot directly write to the file" behavior)
- `.claude/agents/market-watcher.md` — `no_self_abort: true` + `write_tool_available: true` added to constraints
- `.claude/agents/news-scout.md` — `no_self_abort: true` + `write_tool_available: true` added
- `.claude/agents/alert-commander.md` — `no_self_abort: true` + `write_tool_available: true` added
- `.claude/agents/financial-analyst.md` — `no_self_abort: true` + `write_tool_available: true` added
- `.claude/agents/tran-ngoc-bau.md` — `no_self_abort: true` + `write_tool_available: true` added
- `.claude/agents/digest-predict.md` — `no_self_abort: true` added (Write tool excluded — uses MCP tools per `never_use_write_tool: true`)
- `docs/TASKS.md` — 1951j added to Done; 1952f/g archived to batch entry

Signals moved to `docs/signals/processed/`.

Note: unified-agent already had `no_self_abort: true` from Sprint 1951i — not modified.
Note: digest-predict gets `no_self_abort` only (no `write_tool_available`) because it has `never_use_write_tool: true` — its notebook writes go through MCP tools, not Write tool.

## Previous Session — 2026-05-19 (Sprint 1951b cowork tool packages)

**Task: 1951b — cowork tool-packages + notebook-write capability**

Source: architect brief `docs/architecture-briefs/2026-05-19-cowork-tool-packages.md` + signal `docs/signals/agents-architect-1951b-tool-packages-brief.json`.

Files edited (13, single commit 80768093):
- `.claude/tools/package/market-analyst.md` — full rewrite; 7 missing tools added with full gateway grammar + anti-discovery + failure modes
- `.claude/skills/anti-hallucination/SKILL.md` — Rule 6 appended: anti-discovery hard-fail + forbidden write targets
- `.claude/tools/package/tran-ngoc-bau.md` — anti-discovery clause added per brief §8
- `docs/data/system-map.json` — `mcp_server_name: "vn-market"` added to mcp-server microservice entry
- `.claude/agents/alert-commander.md`, `news-scout.md`, `market-watcher.md`, `financial-analyst.md`, `digest-predict.md`, `unified-agent.md`, `report-analyzer.md`, `qa-responder.md` — Write+Edit added to tools:; scope note added to description:
- `.claude/flows/market-watcher/cycle.md` — Step 5 APPEND-ONLY drift fixed → Write (full overwrite)

OQ-1 carried forward: `get_financial_summary` existence in vn-market — qa must verify.
OQ-2 carried forward: `macro_*` tool name convention — qa must verify against `.claude/tools/list/`.
Signal emitted: `docs/signals/agent-father-1951b-tool-packages-impl.json`.

## Carry-over

- OQ-1: get_financial_summary — needs qa verification against live tool list
- OQ-2: macro_* naming convention — needs qa verification

## Patterns Noticed

- docs/data/ may have a gitignore rule applied by other tools; use `git add -f` for tracked files that surface the warning.
- Concurrent agents leave pre-staged files (TASKS.md, notebooks, schedule.json) — always check `git status` before staging to avoid polluting the sprint commit.
- market-watcher cycle.md had both Step 5 label AND "Header update" block referencing APPEND — both needed fixing.
- agent-md-factory skill does not exist as a file in this repo; pattern is applied from memory rule.
