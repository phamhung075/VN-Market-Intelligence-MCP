# Developer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** 1881a / ssot-doc

## Last session summary

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

## Previous last session summary

Task 1888-CDG (B, C, D, G sub-tasks) — SSOT doc-only bundle. Three coordinated cleanups in one atomic commit.

**What was done:**

- Sub-task C (tool-registry): categories tools[] arrays sum = 125. toolCount field was 133 (stale). Reconciled to 125 per canonical array rule. project-stats.json#toolCount updated to match.
- Sub-task D (cron-registry): jobs[] array has 62 entries. schedulerFileCount field was 59, cronJobCount was 59. Both reconciled to 62. Added `_definition` key documenting authoritative source (jobs[] length, excludes orchestrators).
- Sub-task G (task-size-rules): Created docs/standards/task-size-rules.md with FIX/SPRINT-S/M/L table, line-budget guidelines, escalation rules. Replaced inline line with pointer.
- JSON validation passed (jq . all 3 files exit 0).

**Commits:**
- `76829836 fix(1888-CDG): SSOT bundle — tool-registry + cron-registry + task-size-rules`
- Branch: main (worktree, no task branch — doc-only per PO instructions)

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
