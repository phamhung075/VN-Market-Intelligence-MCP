# Task Report: 1815d — docker-compose mcp-server healthcheck curl→bun
date: 2026-05-02
outcome: APPROVED

## Test Results
- Full suite: 8647 pass / 19 fail / 38 skip
- Baseline (main before merge): 8645 pass / 21 fail
- Delta: +2 pass, -2 fail (strictly better than main)
- TypeScript: 0 errors (bun tsc --noEmit)

## DDD Compliance: N/A
Only file changed: docker-compose.yml (YAML config, no TypeScript source).

## Security: PASS
- Health check command is a static inline script: `bun -e "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"`
- No credentials, no secrets, no user input, no SQL, no file paths.
- Matches pattern used by all other Bun services in docker-compose.yml.

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Change Summary
Single line in docker-compose.yml: mcp-server healthcheck test command changed from
`["CMD", "curl", "-f", "http://localhost:3000/health"]`
to
`["CMD", "bun", "-e", "fetch('http://localhost:3000/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]`

Root cause: `curl` is not installed in the Bun base Docker image. The health check was silently failing on every container start. `bun` is always available in the Bun container image.

## Merge Status
- Merged to main: YES (no-ff merge commit)
- Branch deleted: task/1815d-mcp-healthcheck
- docs/TASKS.md: updated (1815d → Done)
- docs/data/project-stats.json: testBaseline 8646→8647, totalTasksDone 436→437
