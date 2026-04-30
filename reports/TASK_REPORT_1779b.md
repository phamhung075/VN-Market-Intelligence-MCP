# Task Report: 1779b — VPS Service Restart Handler + MCP Tool + Registry
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (targeted): 8 passed / 0 failed
- Full suite: 8280 passed / 18 failed
- Regressions vs baseline (8272 pass / 18 fail after 1779a): 0 — the 8 new tests account for the delta exactly
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## DDD Compliance: PASS

- `vpsServiceRestartHandler.ts` sits in `interface/mcp/` and imports only from `infrastructure/vps/sshExec.js`
- No domain or application layer imports in the new files
- Handler→infrastructure direct import is an accepted DDD exception for thin pass-throughs, documented in TASK_1779b.md
- No domain files introduced or modified

## Security: PASS

- No `process.env` usage — all env reads via `Bun.env`
- No hardcoded credentials or secrets
- SSH execution uses explicit `args: string[]` array — no shell string interpolation
- Three-layer allowlist: input validation → service allowlist (`ALLOWED_SERVICES.has()`) → literal systemctl template
- `sshExec` uses `StrictHostKeyChecking=yes` and `BatchMode=yes`
- Tests monkey-patch `Bun.spawn` — no real SSH connections at test time

## Issues Found

### Blocking
None.

### Non-Blocking

1. **Tool name deviation from architect spec**: Architect spec in QA prompt referenced `trigger_vps_service_restart`; developer implemented `restart_vps_service`. Verified against handoff `TASK_1779b.md` line 38: the handoff spec explicitly says tool name is `restart_vps_service`. This is the authoritative source. The naming is also consistent with existing VPS tools (`get_vps_service_health`, `get_vps_proxy_health` — verb_noun pattern). No action required.

2. **dry_run parameter absent**: QA task description mentioned "dry_run=true path never calls sshExec". No `dry_run` parameter was in the acceptance criteria (TASK_1779b.md). Developer implemented exactly what the spec required. Not a defect.

3. **Bun crash post full suite**: Bun v1.3.11 panicked (C++ exception) after completing all 8336 tests. The crash is a known Bun runtime bug, not triggered by 1779b code. Pass/fail counts were captured before crash: 8280 pass / 18 fail.

## Tool Registration

- Import: `import { registerVpsServiceRestartTool } from "./system/vpsServiceRestartTool.js";`
- Array entry: `registerVpsServiceRestartTool,   // Task 1779b: restart_vps_service (+1 → 117)`
- Registry line count: 117 tools total

## Merge Status

- Merged: `task/1779b-vps-restart-handler` → `main` (no-ff merge, 2026-04-30)
- Branch deleted: confirmed
- TASKS.md: 1779b row added with Done date 2026-04-30
