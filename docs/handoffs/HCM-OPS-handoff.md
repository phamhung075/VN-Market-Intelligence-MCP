---
sprint: HCM-DISAMBIG
task_id: HCM-OPS
title: Force-recreate mcp-server after HCM-D1 code change
zone: infrastructure/docker
size: S
priority: HIGH
owner: ops
depends_on: ["HCM-D1"]
blocks: ["HCM-QA"]
---

## TLDR

After HCM-D1 (extraction code change in `newsNormalizer.ts`) is committed to main, force-recreate (not restart) the `mcp-server` container. This ensures the new `GEOGRAPHIC_CONTEXT_MAP` entries (`"tp. hcm"` and `"tp-hcm"`) are compiled into the running service. Verify the container is healthy before unblocking HCM-QA.

## [PM] Planning Context

### Zone
Infrastructure / Docker — ops rebuild only. No code change by ops.

### Acceptance Criteria

| ID | Action | Pass Criterion |
|---|---|---|
| AC-OPS-01 | Force-recreate mcp-server (not restart) | Container fully rebuilt from current image |
| AC-OPS-02 | Verify container is healthy | `docker compose ps` shows `Up` status; `curl localhost:3000/health` returns `{status:ok}` |
| AC-OPS-03 | Confirm 146 tools are registered | `curl localhost:3000/health` includes `toolCount: 146` |

### Files to read first

- Memory: `feedback_rebuild_after_dev_change` (force-recreate, not restart — stale image concern)
- Memory: `project_mcp_server_write_wedge` (post-rebuild verification should check actual files, not just container health)
- `docker-compose.yml` (mcp-server service definition)

### Files to modify
None — ops rebuild is a container operation, not a code change.

### Knowledge needed

- Docker Compose commands (`docker compose down`, `docker compose up -d`)
- Health endpoint verification (`curl localhost:3000/health`)

## [Ops] Implementation Guidance

### Step 1: Verify HCM-D1 is committed

```bash
git log -1 --oneline | grep -i "hcm-disambig\|D1\|extraction"
# Should show a recent commit with HCM extraction changes
```

### Step 2: Force-recreate mcp-server

**DO NOT RESTART** — that uses the stale cached image. **FORCE-RECREATE** rebuilds and re-runs the image.

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
docker compose down mcp-server
docker compose up -d mcp-server
```

Or in one command:
```bash
docker compose up -d --force-recreate mcp-server
```

### Step 3: Verify container is healthy

```bash
# Wait ~5 seconds for startup
sleep 5

# Check container status
docker compose ps mcp-server
# Expected: Status = "Up X seconds"

# Health endpoint
curl -s http://localhost:3000/health | jq .
# Expected output includes:
# {
#   "status": "ok",
#   "toolCount": 146,
#   "sessions": <number>,
#   "uptime": <seconds>
# }
```

If `toolCount` is not 146, wait a few more seconds and retry (tools load on startup).

### Step 4: Commit confirmation (optional log entry)

If ops needs to record the rebuild in git (OPTIONAL, not required for this sprint):

```bash
git log -1 --pretty=format:"%h %s" > /tmp/rebuild_log.txt
# Just for ops records; do NOT commit a new change
```

### Exit Criteria

- [ ] `docker compose ps mcp-server` shows `Up` status
- [ ] `curl http://localhost:3000/health` returns `status: ok` and `toolCount: 146`
- [ ] Container is fully rebuilt (not restarted)
- [ ] No new errors in `docker compose logs mcp-server` (OK to have startup info logs)

---

## [PM] Task Completion

**Ship once health checks PASS.**

This task unblocks HCM-QA (which requires the live extraction code to be running).

---

## RETURN (to main terminal after completion)

```
DONE: HCM-OPS mcp-server force-recreate completed and verified healthy
CONTAINER_STATUS: Up (running)
HEALTH_CHECK: status=ok, toolCount=146
COMMIT: [HCM-D1 commit sha that triggered this rebuild]
NEXT: HCM-QA | acceptance gate (can now proceed with live extraction verification)
BLOCKED_BY: HCM-D1 (now released)
NOTE: HCM-D2 (chef.md) does NOT require a rebuild; unified-agent reads it fresh each tick
```
