# Task Report: 1324+1325 — push-news: wire all 9 VPS sources into pollNews
date: 2026-04-16
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| Task-specific (`1324-push-news-all-sources.test.ts`) | 10 | 0 |
| Related tests (`102-job-news-poll.test.ts` + 3 recent) | 35 | 0 |
| TypeScript (`bun tsc --noEmit`) | 0 errors | — |

## DDD Compliance: PASS

- `grep -r "from.*infrastructure" src/domain/` — only comments, zero real imports
- `grep -r "from.*application" src/domain/` — only comments, zero real imports

## Security: PASS

- No `process.env` usage in changed files
- No hardcoded credentials
- SQL queries use parameterized bindings

## Files Changed

| File | Change |
|------|--------|
| `src/application/usecases/pollNews.ts` | `SourceFetchers` extended with 6 optional VPS keys (`vietstock`, `vietnambiz`, `vnbusiness`, `tuoitre`, `nhandan`, `nld`) + index signature for future keys; `resolvedFetchers` built dynamically via `Object.entries` |
| `src/interface/mcp/server.ts` | push-news handler replaced hardcoded 3-key fetcher with `Object.fromEntries(Object.keys(bySource).map(...))` — fully dynamic, no maintenance required for new VPS sources |
| `src/__tests__/1324-push-news-all-sources.test.ts` | 10 tests: 6 per-source injection tests, 1 all-9-sources combined, 1 absent-keys regression, 1 cafef/vnexpress regression, 1 unknown-key no-crash |

## Acceptance Criteria

| AC | Status |
|----|--------|
| AC-1: `SourceFetchers` has 6 new VPS keys | PASS |
| AC-2: push-news handler wires bySource keys dynamically | PASS |
| AC-3: 9-source payload injection → `result.inserted >= 1` + DB rows increase | PASS |
| AC-4: cafef/vnexpress/vneconomy behavior unchanged | PASS |
| AC-5: `bun tsc --noEmit` 0 errors | PASS |

## Issues Found

### Blocking
None.

### Non-Blocking
- `knownKeys` list in `pollNews.ts` (line 400-403) enumerates the 11 known source names; used only to filter already-handled keys before the unknown-future-keys pass-through loop. Adding a new VPS source does NOT require updating `knownKeys` since unknown keys propagate automatically. Acceptable — the comment explains the intent clearly.

## Merge Status

Merged: `task/1324-1325-push-news-all-sources` → `main` (no-ff)
Branch deleted: local + remote
Server restarted: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` — health OK (toolCount: 98)
Sprint 103: archived to `docs/archive/sprints-064-080.md`
`docs/data/project-stats.json`: sprint 103, totalTasksDone 280
