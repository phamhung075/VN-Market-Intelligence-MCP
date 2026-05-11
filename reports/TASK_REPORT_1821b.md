# Task Report: 1821b — Wire smartCompactSpawner as smart_compact MCP Tool (#118)
date: 2026-05-02
outcome: APPROVED

## Test Results
- Unit tests (1821b targeted): 2 passed / 0 failed
- Full suite: 8565 passed / 0 failed
- TypeScript: 0 errors (bun tsc --noEmit)

## DDD Compliance: PASS
- `smartCompactTool.ts` lives in `interface/mcp/tools/system/` — correct layer
- Import direction: interface → infrastructure — valid (not the forbidden domain → infrastructure)
- No domain layer violations found in scan

## Security: PASS
- No hardcoded credentials or API keys
- No SQL queries (tool triggers subprocess, no DB access)
- `process.env` used only to forward environment to `Bun.spawn` subprocess — standard shell pattern, not a config lookup
- `Bun.env` standard not violated (no config reads via process.env)
- Non-blocking note: `CLAUDE_BIN` hardcoded to `/Users/admin/.local/bin/claude` — portability concern for other machines, acceptable for single-machine deployment

## Checks Performed
- [x] Test file exists: `src/__tests__/1821b-smart-compact-tool.test.ts`
- [x] 2 smoke tests pass (registration + CompactResult shape on missing session)
- [x] Full suite: 8565 pass / 0 fail
- [x] tsc --noEmit: 0 errors
- [x] DDD scan: no domain → infrastructure imports
- [x] registry.ts: `registerSmartCompactTool` at position 118, comment confirms tool #118
- [x] No cron entry added
- [x] MCP tool returns `{ content: [{ type: "text" as const, text: ... }] }` format
- [x] Zod `.describe()` on input field
- [x] Handler wrapped in try/catch (via spawnSmartCompact return value)
- [x] Barrel export added to system/index.ts

## Issues Found
### Blocking
None.

### Non-Blocking
1. `CLAUDE_BIN` hardcoded to `/Users/admin/.local/bin/claude` (line 22 of smartCompactSpawner.ts) — portability concern for multi-developer setups. Acceptable for current single-machine deployment.
2. `process.env` spread into `Bun.spawn` env option (line 128 of smartCompactSpawner.ts) — correct subprocess pattern, not a dev-standards violation.

## Merge Status
- Merge commit: `6e9def79` (merge(1821b): wire smartCompactSpawner as smart_compact MCP tool (tool #118))
- Branch `worktree-agent-ad8ab93a` deleted
- Branch `task/1821b-smart-compact-tool` deleted
- Worktree removed: `.claude/worktrees/agent-ad8ab93a`
- Push: OK — `883535fb..6e9def79 main -> main`
- docs/TASKS.md: 1821b moved to Done (merged 2026-05-02)
- docs/data/project-stats.json: testBaselinePass=8565, totalTasksDone=450, toolCount=123
