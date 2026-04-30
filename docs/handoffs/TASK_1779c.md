# TASK 1779c — SSH Key Mounting + known_hosts Verification

**Sprint:** SPRINT-S
**Parent:** 1779 — Add systemctl restart capability to VPS trigger tools
**Branch:** `task/1779c-ssh-docker-verify`
**Owner:** developer
**Priority:** high
**Type:** chore / infra-verify
**Estimate:** ~1h
**Depends on:** 1779a merged (needs sshExec.ts to inspect expected key path)

---

## Context

The `sshExec` executor (1779a) reads `VPS_SSH_KEY_PATH` from `Bun.env` and passes it via `-i` to the SSH binary inside the mcp-server Docker container. This task verifies and fixes (if needed) two Docker-level prerequisites:

1. The SSH private key is mounted into the container at the expected path.
2. The VPS host is pre-seeded in `known_hosts` so `StrictHostKeyChecking=yes` does not block the first connection.

---

## Acceptance Criteria

### docker-compose.yml

1. The `mcp-server` service has a volume or secret mount that places the SSH private key at `/run/secrets/vps_ssh_key` (or whichever path `VPS_SSH_KEY_PATH` resolves to).
2. File permissions on the mounted key are `0600` (SSH rejects keys with wider permissions).
3. `VPS_SSH_KEY_PATH` environment variable is set in the `mcp-server` service definition (or `.env` file referenced by compose).
4. `VPS_HOST` and `VPS_SSH_USER` are present in the compose env block (or `.env`).

### known_hosts seeding

5. The Dockerfile for `mcp-server` (or an entrypoint script) runs `ssh-keyscan -H $VPS_HOST >> /root/.ssh/known_hosts` at build time or container startup — so the first `sshExec` call does not fail with `Host key verification failed`.
6. If seeding is done at runtime (entrypoint), the script must exit non-zero if `ssh-keyscan` fails — no silent fallback.

### Verification script or manual check steps

7. Provide a one-shot verification command (added as a comment in docker-compose.yml or a script at `scripts/verify-ssh-docker.sh`) that an ops agent can run to confirm:
   - Key file exists and has correct permissions inside a running container
   - `known_hosts` contains the VPS host fingerprint

---

## Files to Modify / Create

```
docker-compose.yml   [add volume/secret mount + env vars for mcp-server service]
Dockerfile (mcp-server)   [or entrypoint.sh — add ssh-keyscan step]
scripts/verify-ssh-docker.sh   [new, optional but preferred]
```

---

## Risks / Notes

- If the project uses Docker secrets (`docker secret create`), prefer that over a bind-mount for the key file.
- If the Dockerfile does NOT have an entrypoint script, add a minimal `entrypoint.sh` that does the keyscan then `exec "$@"`.
- Do NOT commit the actual private key — only the mount path configuration.
- Check for existing `.env.example` and add the three new vars (`VPS_SSH_KEY_PATH`, `VPS_HOST`, `VPS_SSH_USER`) there too.

---

## Done When

- [ ] `docker-compose up mcp-server` starts without SSH config errors in logs
- [ ] `docker exec mcp-server ls -la /run/secrets/vps_ssh_key` shows `-rw-------`
- [ ] `docker exec mcp-server ssh-keygen -F $VPS_HOST` finds the fingerprint in known_hosts
- [ ] `.env.example` documents the three new vars
- [ ] PR opened against `main` with branch `task/1779c-ssh-docker-verify`
