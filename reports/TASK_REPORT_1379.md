# Task Report: 1379 — HTML Strip Before Telegram Send
date: 2026-04-28
outcome: APPROVED

## Summary

Fixed HTML tags (e.g. `<br/>`, `<b>`) leaking verbatim into Telegram plain-text messages.
Root cause: agent-generated content included HTML that was passed unsanitized through `coreSend()`.
Fix: `replace(/<[^>]*>/g, "")` applied after NFC normalization, before `splitMessage()`, covering all three channels.

QA also fixed a TypeScript error (`TS2741`) in the test file — `makeFetch` return type was `typeof fetch` (which includes `preconnect`); corrected to explicit async function signature.

## Test Results

- Task tests (1379-html-strip-telegram.test.ts): 3 passed / 0 failed
- Full suite on main post-merge: 7866 passed / 21 skipped / 0 failed
- Baseline delta: +3 tests (was 7863 before merge)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

- Change is in `infrastructure/notifiers/telegram.ts` — correct layer
- No domain imports from infrastructure

## Security: PASS

- No hardcoded credentials
- Uses `Bun.env` only (no `process.env`)
- No SQL involved in this change
- HTML stripping is a defence-in-depth measure for the output path

## Issues Found

### Blocking
- [FIXED BY QA] `apps/mcp-server/src/__tests__/1379-html-strip-telegram.test.ts:22` — `makeFetch` return type `typeof fetch` causes `TS2741` (missing `preconnect`). Fixed to explicit `(_url: string, init?: RequestInit) => Promise<Response>`.

### Non-Blocking
- None

## Merge Status

Merged via cherry-pick to main (worktree base was stale — 120 pre-existing failures unrelated to this task; main ran clean before and after merge).

Commits on main:
- `b27ecd74` fix(1379): strip HTML tags from Telegram message text before send
- `2f874dd6` fix(1379): correct makeFetch return type in test — TS2741
