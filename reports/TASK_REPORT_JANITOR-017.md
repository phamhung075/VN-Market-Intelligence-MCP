# Task Report: JANITOR-017 — Extract BROWSER_UA into browserHeaders.ts
date: 2026-05-01
outcome: APPROVED

## Summary

Refactor: centralised Chrome 131 User-Agent and browser headers into a shared
`infrastructure/fetchers/browserHeaders.ts` helper. 17 fetchers + 2 application
services migrated from inline header objects to `buildBrowserHeaders()`.

## Test Results
- Unit tests (017-browser-headers): 5 passed / 0 failed
- Full suite: 8626 passed / 32 failed
- TypeScript: 0 errors (`bun tsc --noEmit`)
- Baseline at merge: 8622 pass (net +4 — from 017 test file additions)

## Pre-existing Failures (32) — Not Introduced by JANITOR-017

All 32 failures confirmed pre-existing. JANITOR-017 commit (`b24a7df6`) touches
only `infrastructure/fetchers/` files and adds `017-browser-headers.test.ts`.
Failing test suites are:
- Dockerfile python3 availability checks (3)
- Sprint documentation invariants (1)
- Task 1112 BCTC VPS Proxy AC-10 (1)
- imfDataFetcher SQL injection check / cronConfig (2)
- bctcQueueEnricherJob bug #2 (1)
- signalOutcomeJob AC-2/3/4/5/6/8 (6)
- extractorGuards impossible-figures guard (2)
- FIX-1281 VPS-only guard AC-7 (1)
- franceSummaryJob AC3 movers (1)
- agentBootstrap DDD guard (1)
- Signal Quality Audit Service (6)
- VN Policy Cascade AC-11 (1)
- Scheduler documentation paths (3)
- Agent Memory Tools (2)
- Single-Writer Guard TEST-3 (1)

## DDD Compliance: PASS

- `browserHeaders.ts` is in `infrastructure/fetchers/` — correct layer.
- File header explicitly documents: "DO NOT import this from domain/".
- Domain scan: zero actual imports from infrastructure in domain/ files.

## Security: PASS

- No `process.env` — only `Bun.env` (not applicable here; no env access).
- No hardcoded secrets or API keys.
- No SQL queries in this change.

## Verification Checks

| Check | Result |
|-------|--------|
| `browserHeaders.ts` exists at correct path | PASS |
| `Chrome/131.0.0.0` only in `browserHeaders.ts` | PASS (0 results in other fetchers) |
| `bun tsc --noEmit` | 0 errors |
| `bun test --filter 017-browser-headers` | 5/5 pass |
| Full suite no new failures | PASS (all 32 failures pre-existing) |

## Merge Status

Branch `feat/janitor-017-browser-ua` was already merged to `main` via merge
commit `83a37db1 merge(feat/janitor-017-browser-ua): finish`.

Post-merge cleanup:
- Local branch `feat/janitor-017-browser-ua` deleted.
- Worktree `.claude/worktrees/agent-af164a9c` removed.
- Main worktree confirmed clean at `83a37db1`.

## Files Changed (JANITOR-017 commit b24a7df6)

- `apps/mcp-server/src/__tests__/017-browser-headers.test.ts` (new)
- `apps/mcp-server/src/infrastructure/fetchers/browserHeaders.ts` (new)
- 17 fetcher/service files migrated to `buildBrowserHeaders()` import
