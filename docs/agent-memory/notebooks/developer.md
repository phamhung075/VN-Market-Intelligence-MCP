# Developer — Notebook

**Last updated:** 2026-05-15 | **Sprint:** SPRINT-S

## Last session summary

Task 1918a — `get_macro_snapshot` shape guard for alert-commander stage-bootstrap.

**Problem:** TNB c55 cycle-2 evidence: `get_macro_snapshot` returns `{"status":"degraded","message":"..."}` (system_status bleed) instead of `{"text":"...","fetchedAt":"...","source_tier":2}`. The retry-once logic in stage-bootstrap.md only handles call failure, not shape mismatch — so wrong-shape response is silently accepted and regime inference fails.

**What was done:**
- Created `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts` — exports `isMacroSnapshotValidShape(value: unknown): boolean`. Guard: object must have `text` field of type string. All other shapes (system_status, error, null, primitive) → false.
- Wrote test first (TDD RED): `1918a-macro-snapshot-shape-guard.test.ts` — 10 tests covering normal payload, minimal payload, `{status:degraded}` fixture (core), error payload, edge cases. Confirmed RED (module not found). Then created guard. GREEN: 10/10.
- Updated `.claude/flows/alert-commander/stage-bootstrap.md` Step 0b: added **Shape-validation gate** paragraph. Gate applies to both initial attempt and retry. Shape mismatch → news-fallback, same path as call failure + `[WARN]` log.
- Created `docs/handoffs/TASK_1918a.md`.
- Updated `docs/TASKS.md` — 1918a moved to Review.

**Commit:** `62697623 fix(1918a/flows): 1918a macro snapshot shape guard + stage-bootstrap gate`

**Total: 10 pass / 0 fail. tsc 0 errors.**

## Previous last session summary

Task 1899a-bloomberg-test-split — Split `1899a-bloomberg.test.ts` (491L, untracked) into 4 files ≤200L.

**What was done:**
- Created 4 split files in `apps/news-fetch/__tests__/`:
  - `1899a-bloomberg-dom.test.ts` — 189L, 12 expect(), DOM happy path (8 it) + maxItems (1 it)
  - `1899a-bloomberg-json-fallback.test.ts` — 182L, 8 expect(), JSON __NEXT_DATA__ fallback (5 it)
  - `1899a-bloomberg-perimeterx-lifecycle.test.ts` — 186L, 14 expect(), PX (2 it) + lifecycle close() (3 it) + error handling (2 it), sub-describes flattened to control line count
  - `1899a-bloomberg-normalize-date.test.ts` — 51L, 7 expect(), pure function, no mock.module
- Source file deleted from disk (was never committed to git — untracked)
- Each file carries own `mock.module('playwright', ...)` + `await import(...)` preamble (Bun per-file mock isolation)
- preamble trimmed in dom file to inline the locator logic and shorten helper function bodies to land ≤200L

**Total: 29 pass / 0 fail, 41 expect() = parity. tsc 0 errors.**

**Commit:** `40747a58 refactor(1899a/news-fetch): split bloomberg 491L test into 4 files ≤200L each`

**Branch:** main

**Note on full suite baseline:** `bun test apps/news-fetch/` = 172 pass / 0 fail. `pnpm test:all` (mcp-server) crashes Bun 1.3.13 with OOM — pre-existing issue unrelated to this change.

## Previous last session summary

Task 1914b — Fix `log_agent_work` two-call pattern documentation in all 10 agent package files.

**Root cause:** All 10 `.claude/tools/package/*.md` files documented `log_agent_work` with a fictitious single-call signature (`action/context/signal_ids`). The actual MCP API (`agentWorkLogTools.ts`) requires: Call 1 (`status: "running"` → `{ id }`), Call 2 (`id + status: "completed"|"error"`).

**What was done:** Docs-only. Table rows corrected, two-call recipe block added to each file. Broken example snippets in `report-analyzer.md` and `po.md` also fixed. All 10 files `Last Updated` bumped to 2026-05-15. `TASK_1914b.md` handoff written. 1914b moved to Done in TASKS.md.

**Commit:** `3b68df2c docs(1914b/agent-doc): 1914b fix log_agent_work two-call pattern in all 10 package files`

**Branch:** main

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- docs/data/ is gitignored — use `git add -f docs/data/*.json` for stats files.
- Semble search before grep for exploration.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- NEVER use `git commit -am` — greedily absorbs staged index content (C2 atomicity violation, c47 incident SHA 8bec73d3).
- `mock.calls[0]` TS type is `[]` (empty tuple) — cast via `as unknown as Array<[T]>` for tsc compliance.
- HEAD.lock from dead Spotlight/Docker process: verify no git process running, then `rm .git/HEAD.lock`. Recurring — permanent policy per head-lock-self-cure.md.
- Bun 1.3.13 OOM-crashes on mcp-server full suite (RAM 2.15GB peak → panic). Not our bug. Use per-service `bun test` for regressions.
- Test split strategy: each split file needs own mock.module + await import preamble (Bun per-file isolation). Trim preamble helpers not needed by the split group to control line count.

## Carry-over for next session

- toolCount in tool-registry.json = 125 (categories sum). Source code has ~137 server.tool() calls — categories list is stale by ~12 tools. Future task should add missing tools to categories.
- Branch `task/1881a-impl-ssot` awaiting QA gate — do NOT merge until QA approves.
- Branch `task/c86-autocure-mw-dedup` awaiting QA gate.
- Branch `task/c87-1903-doc-pair` awaiting QA gate.
- Branch `task/c88-1905a-news-fetch-stealth-fix` awaiting QA gate.
- Branch `task/c89-1906a-headlock-cure-permanent` awaiting QA gate.
- Branch `task/1916a-vps-discover-route` awaiting QA gate (VPS-side of 1916a).
