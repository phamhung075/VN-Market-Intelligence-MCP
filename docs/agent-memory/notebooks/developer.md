# Developer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c87-1903-doc-pair

## Last session summary

Task 1903-doc-pair — doc-only CHORE pair: stale label clear + macro fallback note.

**What was done:**

- Branch `task/c87-1903-doc-pair` created from main.
- 1903a: Removed `[UNVERIFIED — tool not found 2026-05-11]` label from `write_alert_verdict` entry in `.claude/tools/package/alert-commander.md`. Tool confirmed shipped in c77/c82 (commit 4833b052). Sweep of all `.claude/tools/package/*.md` found no other UNVERIFIED labels.
- 1903b: Added `get_macro_snapshot` fallback note (1 line, ≤3 lines constraint met) to `.claude/flows/alert-commander/stage-bootstrap.md` step 0b. Fallback: derive regime hint from news context; logs `REGIME_SOURCE=news-fallback`. Cross-linked to `regime-extraction/SKILL.md`.
- tsc gate: PASSED (doc-only, no TS changes).
- Pushed branch to remote.
- Handoff written to `reports/TASK_HANDOFF_1903-doc-pair.md`.

**Commits:**
- `d7ddca53 docs(c87/agent-doc): 1903-doc-pair — clear stale UNVERIFIED label + macro fallback note`
- Branch: `task/c87-1903-doc-pair`

## Previous last session summary

Task AUTOCURE-C86-MW-DEDUP — doc-only chore: TNB c47 auto-cure off-hours duplicate guard committed and pushed.

**What was done:**

- Branch `task/c86-autocure-mw-dedup` created from main.
- Staged ONLY `.claude/flows/market-watcher/cycle.md` (3 lines added: AutoCure 2026-05-14 TNB c47 off-hours duplicate guard block).
- Other uncommitted files (tool-usage-stats.json, notebooks/financial-analyst.md, notebooks/tran-ngoc-bau.md) left unstaged — not in scope.
- Pre-push tsc hook: PASSED (doc-only, no TS changes).
- Pushed branch to remote.

**Commits:**
- `564230d2 chore(market-watcher/c86): TNB c47 auto-cure — off-hours duplicate guard`
- Branch: `task/c86-autocure-mw-dedup`

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- NEVER use `git commit -am` — greedily absorbs staged index content (C2 atomicity violation, c47 incident SHA 8bec73d3).

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
