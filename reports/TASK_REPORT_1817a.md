# Task Report: 1817a — Fix Test CWD Path Resolution
date: 2026-05-02
outcome: APPROVED

## Test Results
- Target tests (1112, FIX-1281, 1298b, 1299b, 1004): 53 passed / 0 failed
- Full suite: 8554 passed / 0 failed
- TypeScript: 1 pre-existing error in smartCompactSpawner.ts (TS2532 — unrelated to this task, present before 1817a, file added in separate commit ef509d25)

## DDD Compliance: PASS
All changes are isolated to `src/__tests__/` — no domain/infra import violations introduced.

## Security: PASS
- No hardcoded credentials
- No `process.env` usage introduced
- No SQL or path traversal issues

## Changes Verified
Five test files had path resolution based on `process.cwd()` / relative string literals, which failed when invoked from the monorepo root (`/VN-Market-Intelligence-MCP/`) instead of `apps/mcp-server/`. Fix: replace all occurrences with `import.meta.dir`-relative paths.

| File | Old Pattern | New Pattern |
|------|-------------|-------------|
| 1112-bctc-vps-proxy.test.ts | `glob.scan({ cwd: "src" })` | `glob.scan({ cwd: path.resolve(import.meta.dir, "..") })` |
| FIX-1281-bctc-vps-only.test.ts | `glob.scan({ cwd: "src" })` | `glob.scan({ cwd: path.resolve(import.meta.dir, "..") })` |
| 1298b-imf-infra.test.ts | `path.resolve("src/...")` | `path.resolve(import.meta.dir, "../...")` |
| 1299b-skill-gated-bootstrap.test.ts | `join(process.cwd(), "src/...")` | `join(import.meta.dir, "../...")` |
| 1004-vn-policy-cascade-rules.test.ts | `Bun.file("src/...")` | `Bun.file(import.meta.dir + "/../...")` |

## Merge Status
- Fix commit: `ad2cd36f` (already in main — fast-forward, no merge commit needed)
- Branch `task/1817a-test-cwd-paths` deleted
- Worktree `.claude/worktrees/agent-a0f89162` was an empty stub (no git worktree registration)

## Note: 1817b
1817b was confirmed complete by Architect prior to this QA cycle (no code changes required). Both 1817a and 1817b counted in totalTasksDone.

## Issues Found
### Blocking
None.

### Non-Blocking
- `smartCompactSpawner.ts` line 46: TS2532 `Object is possibly 'undefined'` — pre-existing, introduced in commit ef509d25, unrelated to this task. Should be addressed in a follow-up.
