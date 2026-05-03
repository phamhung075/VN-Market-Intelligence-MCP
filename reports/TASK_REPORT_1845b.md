# Task Report: 1845b — FIX worktree ENOENT (data/ git-ignored)
date: 2026-05-03
outcome: APPROVED

## Test Results
- Full suite (rm -rf data && bun test): 8774 pass / 7 fail
- Zero ENOENT failures — the target metric
- 7 failures confirmed pre-existing on main (network AbortError on HOSE/HNX/UPCOM APIs, velocity null, docs path assertion); none introduced by this task
- TypeScript: 0 errors (bunx tsc --noEmit clean)

## DDD Compliance: PASS
- Only file changed: apps/mcp-server/src/__tests__/setup.ts (test infrastructure, not domain code)
- Flagged pre-existing: apps/mcp-server/src/domain/repositories/IVnstockRepository.ts imports types from infrastructure/fetchers/vnstockBridge.js — this is a known Phase 1 pragmatic exception documented in the file header (tech-debt, not introduced by 1845b)

## Security: PASS
- No process.env — uses Bun.env exclusively
- No hardcoded credentials or secrets
- No SQL queries introduced
- import.meta.dir anchor is correct: resolves to apps/mcp-server/src/__tests__/ regardless of invocation CWD

## Key Checks
- setup.ts uses `import.meta.dir` not `process.cwd()`: PASS (line 21)
- bunfig.toml preload = ["./src/__tests__/setup.ts"]: PASS (line 25)
- Dirs created: data/, data/pdfs/, data/lancedb/, data/models/, data/briefings/, data/reports/, data/exports/: PASS
- mkdirSync with { recursive: true }: PASS — idempotent, safe on existing dirs

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing DDD violation in IVnstockRepository.ts (domain imports infrastructure types) — flagged with Phase 3 migration note in the file. Not introduced by this task.
- Bun 1.3.13 C++ panic fires at JIT cleanup after full suite completes — known Bun runtime bug (see 1836a spec), does not affect test results.

## Merge Status
Merged task/1845b-worktree-enoent-fix → main via no-ff merge.
Worktree: /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/.claude/worktrees/agent-a565a273
