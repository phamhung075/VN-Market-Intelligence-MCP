# Developer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c89-1906a-headlock-cure-permanent

## Last session summary

Task 1906a-headlock-cure-permanent — doc-only reclassification of HEAD.lock PREFLIGHT self-cure.

**What was done:**
- `docs/protocols/head-lock-self-cure.md` +13L net:
  - Status line added to header: PERMANENT OPERATIONAL POLICY (reclassified 2026-05-14)
  - New `§ (f) Policy Classification` — rationale, c87/c88/c89 3-cycle evidence, F1 structural cure cross-ref, `1897b-carry` tracking pointer
- `reports/TASK_HANDOFF_1906a-headlock-cure-permanent.md` created (ULTRA)
- No code changed, no tests, tsc gate N/A (doc-only)

**Commits:** (see SHA in branch task/c89-1906a-headlock-cure-permanent)
**Branch:** `task/c89-1906a-headlock-cure-permanent`

## Previous last session summary

Task 1905a-news-fetch-stealth-fix — fix news-fetch container startup crash.

**Root cause:** `playwright-stealth` v0.0.1 is a never-functional placeholder package that throws `'Wrong package'` at import time.

**Fix (option B):** Removed `playwright-stealth` dep entirely. Replaced with inline stealth in `playwright-browser-factory.ts`:
- `STEALTH_INIT_SCRIPT` constant patches `navigator.webdriver = undefined` via `context.addInitScript()` before `newPage()`
- Added `viewport`, `locale`, `colorScheme` to `newContext()` options

**Results:** 172 pass / 0 fail / tsc clean / DDD clean
**Commits:** `502499e3 fix(c88/news-fetch): 1905a — replace playwright-stealth placeholder with inline stealth`
**Branch:** `task/c88-1905a-news-fetch-stealth-fix`

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
- Branch `task/c89-1906a-headlock-cure-permanent` awaiting QA gate.
