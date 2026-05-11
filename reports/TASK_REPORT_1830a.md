# Task Report: 1830a — JANITOR-023: Extract CLAUDE_BIN to agentConstants.ts
date: 2026-05-02
outcome: APPROVED

## Change Summary
- Extracted duplicate `CLAUDE_BIN = "/Users/admin/.local/bin/claude"` constant from two spawner files into a new shared module.
- New file: `apps/mcp-server/src/infrastructure/agents/agentConstants.ts` (1 line export)
- Updated: `smartCompactSpawner.ts` — removed local const, added import from `./agentConstants.js`
- Updated: `qaResponderSpawner.ts` — removed local const, added import from `./agentConstants.js`
- Net lines changed: 3 insertions, 3 deletions (pure refactor, zero logic change)

## Test Results
- Targeted (1821b-smart-compact-tool.test.ts): 2 pass / 0 fail
- agentConstants.ts coverage: 100% functions, 100% lines
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS
- Change is within `infrastructure/agents/` — no layer boundary violations.

## Security: PASS
- No hardcoded secrets introduced.
- No process.env usage added.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged to main via `merge(1830a): extract CLAUDE_BIN to agentConstants.ts (JANITOR-023)` on 2026-05-02.
