# Task Report: 1779c — SSH Key Mount + known_hosts Seeding
date: 2026-04-30
outcome: APPROVED

## Summary

Docker infrastructure changes to allow `restart_vps_service` MCP tool (task 1779b) to authenticate
to the Vinahost VPS via SSH inside the mcp-server container.

## Files Changed

- `docker-compose.yml` — SSH key mount `~/.ssh/id_rsa:/run/secrets/vps_ssh_key:ro` + env vars
  `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY_PATH`
- `apps/mcp-server/Dockerfile` — `openssh-client` package, `/root/.ssh` dir (chmod 700),
  `COPY entrypoint.sh` + `RUN chmod +x`, `ENTRYPOINT ["/entrypoint.sh"]`
- `apps/mcp-server/entrypoint.sh` — `ssh-keyscan -H $VPS_HOST` at startup, fail-loud if no
  output, appends to known_hosts, `exec "$@"` handoff
- `.env.example` — documents `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY_PATH`
- `scripts/verify-ssh-docker.sh` — ops verification script (checks key perms + known_hosts)

## Test Results

- Unit tests: N/A (infrastructure-only change, no new TypeScript code)
- Full suite: 8280 pass / 18 fail (baseline maintained — 0 regressions)
- TypeScript: 0 errors (`bun tsc --noEmit`)

## DDD Compliance: PASS

No TypeScript source files modified. Docker + shell changes only. DDD layers unaffected.

## Security: PASS

- SSH key mount is read-only (`:ro`) — container cannot modify host key
- No private key content hardcoded anywhere in committed files
- No `process.env` in shell scripts (N/A — shell scripts use `$VAR` syntax, not Node.js)
- `VPS_SSH_KEY_PATH` default (`/run/secrets/vps_ssh_key`) documented but not embedded in code
- `entrypoint.sh` does NOT print key content — only runs `ssh-keyscan` against a host

## Checklist

- [x] docker-compose.yml: SSH key mount with `:ro` flag
- [x] docker-compose.yml: `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY_PATH` env vars
- [x] Dockerfile: `openssh-client` installed
- [x] Dockerfile: `/root/.ssh` created with chmod 700
- [x] Dockerfile: `RUN chmod +x /entrypoint.sh` (git mode 644 is acceptable — chmod applied at build time)
- [x] Dockerfile: `ENTRYPOINT ["/entrypoint.sh"]`
- [x] entrypoint.sh: `ssh-keyscan` runs against `$VPS_HOST`
- [x] entrypoint.sh: fail-loud if `ssh-keyscan` returns empty output (exit 1)
- [x] entrypoint.sh: `exec "$@"` to hand off to CMD
- [x] .env.example: new vars documented
- [x] scripts/verify-ssh-docker.sh: ops verification script present
- [x] bun tsc --noEmit: 0 errors
- [x] bun test: 8280 pass / 18 fail (no regressions)
- [x] Security: no hardcoded secrets, key mount read-only

## Issues Found

### Blocking
None.

### Non-Blocking
- `entrypoint.sh` git file mode is `100644` (not `100755`). Not a runtime issue — Dockerfile
  applies `chmod +x` at build time. Noted for hygiene.
- `entrypoint.sh` warns but does not exit if `VPS_HOST` is unset. This is correct behavior
  (allows container to start in environments without VPS access), but SSH calls will fail at
  runtime. Acceptable design choice with warning logged.

## Merge Status

Merged `task/1779c-docker-ssh-key` → `main` (no-ff merge commit).
Branch deleted locally.
TASKS.md: 1779c Done (2026-04-30), parent 1779 Done (2026-04-30).
