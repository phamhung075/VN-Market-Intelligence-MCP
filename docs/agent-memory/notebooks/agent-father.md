# Agent Father — Notebook

**Last updated:** 2026-05-13
**Sprint:** c57 / CLEAN-c56-leftovers-c57

## Last Session Summary

CLEAN-c56-leftovers-c57: 5 atomic commits bundling c56/c57 boundary leftovers. Committed 2 evidence log files (PRIMARY ARTIFACTS for c58 architect brief update — Docker VirtioFS root cause confirmed: PID 51247 com.apple.Virtualization.VirtualMachine.xpc holds .git/HEAD.lock read-only fd). Notebooks drift (news-scout + po), out-of-band session log (2026-05-12-digest-predict.md), processed signal moves (c56 + c57), TASKS.md archive trim 82L→80L (moved 1876a-A5 + 1862c-D to TASKS_ARCHIVE.md). No HEAD.lock recurrence in session.

## Commits (c57 — this session)

- `dd50904f` chore(memory/c57): notebooks drift — news-scout + po
- `188ce558` chore(sessions/c57): out-of-band agent session logs
- `03a8ea47` docs(evidence/c57): live HEAD.lock + index.lock race captures — Docker VirtioFS root cause
- `58d34642` chore(signals/c57): drained signal moves c56 + c57
- `aabd89f8` chore(tasks/c57): archive 2 oldest Done rows — TASKS.md 82L→80L

## Commits (c57 — earlier FIX tier)

- `749a0b02` fix(dev-team/c57): PREFLIGHT diagnostic + worktree gc — flow edit
- `3ff05127` docs(protocol/c57): head-lock-self-cure c57 update — H2 eliminated, diagnostic instrumentation

## H4 Root Cause Confirmed (c57)

PID 51247 = com.apple.Virtualization.VirtualMachine.xpc reading .git/HEAD.lock. Docker Desktop VM file mirroring watches entire project root (bind-mount subdirs in docker-compose.yml trigger parent scan). Validates H4. Feeds c58 architect brief for permanent fix: add .git/ to Docker Desktop file-sharing exclusion list OR migrate bind mounts to named volumes.

## Lessons Learned

- [c57] Evidence files committed in own atomic commit with full body description — traceable for c58 architect.
- [c57] PREFLIGHT algorithm can grow beyond split-policy 120L if inline algorithm needed. Size-justification comment required.
- [c57] git rename detection fires correctly when both deletion + creation staged together.
- HEAD.lock recurrence is a known pathology (c55 self-cure). Each occurrence: verify 0-byte + no live pid → rm safe.
- index.lock can auto-clear between git add and git commit — re-stage required.
- TASKS.md "≤80 lines" constraint: trim by moving oldest Done rows to TASKS_ARCHIVE.md inline table.
- [c53] index.lock from a prior process — safe to rm if no other git process running.
- docs/agents/ (not .claude/agents/) is canonical home for knowledge.md + handlers.md

## Cross-Team Notes

- cowork-refactory-expert: live tool surface rewrites — do not duplicate
- claude-manager-helper: DAG integrity + tree-map enforcement — do not duplicate
