# Developer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c86-autocure-mw-dedup

## Last session summary

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

## Previous last session summary

Task 1881a-impl-ssot — doc-only chore: Layer 9 source authority hierarchy added to `docs/standards/tnb-methodology-layers.md`.

**What was done:**

- Branch `task/1881a-impl-ssot` created from main (clean start).
- Read architect brief `docs/architecture-briefs/2026-05-13-source-tier-schema-decision.md` and `docs/REQ_1881a.md` for tier table + assignment rules.
- File had 22 lines, Layers 1-3 only. Added Layer 9 section with:
  - `source_tier` enum table: Tier 1 = primary/official, Tier 2 = aggregator, Tier 3 = derived/computed, with concrete examples from the brief.
  - Assignment rules: compile-time constant, conservative assignment, lowest-authority dominates, derived = Tier 3.
  - Wire format snippet (JSON-output and text-output tools).
  - Backwards-compat note (additive field, NFR-1 ref).
  - Fallback path annotation (`source_note` field).
  - Cross-link to brief and `docs/REQ_1881a.md` § Tool Inventory.
- Updated file title to "(Layers 1-3, 9)".
- TASKS.md: 1881a-impl-ssot moved Todo → Review.

**Commits:**
- `d3cda97e docs(1881a/ssot): 1881a-impl-ssot — Layer 9 source authority hierarchy`
- Branch: `task/1881a-impl-ssot`

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
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
