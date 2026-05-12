# Agent Father — Notebook

**Last updated:** 2026-05-12
**Sprint:** c56 / CLEAN-c56-residue+tasks-archive

## Last Session Summary

c56 residue clean. 7 atomic commits. PART A: 3 migration .py scripts deleted, 20 cowork agent .md files, 4 cron .md files, 8 flow files + 1 new po/zone-routing.md, 8 agent doc files, arch-brief + dispatch SSOT + tree-map. PART B: TASKS.md archived 118 Done rows → 79L (cap 80L), TASKS_ARCHIVE.md +129L. HEAD.lock recurred 3x during session (0-byte stale, no live pid — safe-removed each time). Working tree clean except 3 untracked (digest-predict session, headlock signal, po notebook — not in scope).

## Commits (c56)
- `702e446f` chore(c54-cleanup): migration scripts deleted
- `f07e19d7` chore(cowork/c55-bundle): 20 agent .md files
- `9303e30b` chore(crons/c55-bundle): 4 cron files
- `816ddcef` chore(flows/c55-bundle): 7 flows + zone-routing.md new
- `27bfc2ff` chore(docs/c55-bundle): 8 agent doc files
- `e8bb263b` chore(arch-brief/c55-bundle): brief + dispatch + tree-map
- `1b6baef7` chore(tasks/c56): TASKS.md archive

## Lessons Learned
- HEAD.lock recurrence is a known pathology (c55 self-cure added PREFLIGHT). Within a single session it can fire multiple times — each occurrence: verify 0-byte + no live pid → rm is safe.
- index.lock can auto-clear between git add and git commit if a background process (Spotlight/fseventsd) contends — re-stage is required when this happens.
- TASKS.md "≤80 lines" constraint requires trimming cosmetic blank lines between sections (Review/Done separator). Target 79L leaves 1-line buffer.
- When archiving Done rows: rows at the TOP of the Done table are most recent by convention. Keep top ~10, archive the rest regardless of sprint number.
- [c53] index.lock from a prior process — safe to rm if no other git process running.
- [c53] Pointer integrity check: use dirname-relative paths.
- [c53] docs/data/ in .gitignore but tracked files need git add -f.
- dev-team flows (architect, ba, etc.) need Error Boundary even as orchestration flows. [cycle 2]
- dev-* microservice agents must be added to agent-roster.md explicitly. [cycle 2]

## Cross-Team Notes
- cowork-refactory-expert: live tool surface rewrites (registerTool) — do not duplicate
- claude-manager-helper: DAG integrity + tree-map enforcement — do not duplicate
- docs/agents/ (not .claude/agents/) is now the canonical home for knowledge.md + handlers.md
