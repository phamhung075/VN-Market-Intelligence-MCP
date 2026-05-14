# Developer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c88-1905a-news-fetch-stealth-fix

## Last session summary

Task 1905a-news-fetch-stealth-fix — fix news-fetch container startup crash.

**Root cause:** `playwright-stealth` v0.0.1 is a never-functional placeholder package that throws `'Wrong package'` at import time. Option A (CJS interop) was ruled out immediately — no interop can fix a module that throws unconditionally.

**Fix (option B):** Removed `playwright-stealth` dep entirely. Replaced with inline stealth in `playwright-browser-factory.ts`:
- `STEALTH_INIT_SCRIPT` constant patches `navigator.webdriver = undefined` via `context.addInitScript()` before `newPage()`
- Added `viewport`, `locale`, `colorScheme` to `newContext()` options

**Files changed:**
- `apps/news-fetch/src/infrastructure/scrapers/playwright-browser-factory.ts` — core fix
- `apps/news-fetch/package.json` — dep removed
- `apps/news-fetch/bun.lock` — regenerated (1 removed)
- 6 test files — `addInitScript` added to playwright mocks, `playwright-stealth` mocks removed
- New: `src/__tests__/unit/1905a-playwright-browser-factory.test.ts` (6 ACs)

**Results:** 172 pass / 0 fail / tsc clean / DDD clean

**Commits:** `502499e3 fix(c88/news-fetch): 1905a — replace playwright-stealth placeholder with inline stealth`
**Branch:** `task/c88-1905a-news-fetch-stealth-fix`
**Handoff:** `reports/TASK_HANDOFF_1905a-news-fetch-stealth-fix.md`

## Previous last session summary

Task 1903-doc-pair — doc-only CHORE pair: stale label clear + macro fallback note.

**What was done:**
- Branch `task/c87-1903-doc-pair` created from main.
- 1903a: Removed `[UNVERIFIED — tool not found 2026-05-11]` label from `write_alert_verdict` entry in `.claude/tools/package/alert-commander.md`. Sweep of all `.claude/tools/package/*.md` found no other UNVERIFIED labels.
- 1903b: Added `get_macro_snapshot` fallback note to `.claude/flows/alert-commander/stage-bootstrap.md` step 0b.
- tsc gate: PASSED (doc-only).

**Commits:** `d7ddca53 docs(c87/agent-doc): 1903-doc-pair — clear stale UNVERIFIED label + macro fallback note`
**Branch:** `task/c87-1903-doc-pair`

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- NEVER use `git commit -am` — greedily absorbs staged index content (C2 atomicity violation, c47 incident SHA 8bec73d3).
- `mock.calls[0]` TS type is `[]` (empty tuple) — cast via `as unknown as Array<[T]>` for tsc compliance.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Branch `task/c88-1905a-news-fetch-stealth-fix` awaiting QA gate.
- Pre-existing playwright tsc errors in news-fetch (2 files) — confirmed resolved in 1905a fix.
