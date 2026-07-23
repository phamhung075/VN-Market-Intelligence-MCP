# INCIDENT: MCP Server Outage — Docker Desktop Failure (2026-07-11T13:30–14:18Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Incident ID:** cowork-team-mcp-endpoint-outage-20260711T1345Z  
**Session UUID:** (current ops session)  
**Status:** UNRECOVERABLE — awaiting user system reboot  

**Symptom Timeline:**
- **13:30-13:45Z:** Endpoint timeouts (HTTP:000, 8-10s) — backend not responding
- **14:00Z+:** Endpoint returns HTTP 502 (Cloudflare reverse proxy up, origin down)
- **14:18Z:** Ops diagnosis complete → Docker Desktop daemon unresponsive

**Root Cause:**
Docker Desktop daemon socket hung/uninitialized. All recovery procedures exhausted:
- ✗ `docker ps` — socket connection refused
- ✗ Multiple `open -a Docker` restarts — daemon hung at startup
- ✗ Force-kill Docker processes + restart — socket won't recreate
- ✗ launchctl kickstart — unresponsive
- ✗ DOCKER_HOST env var override — both /var/run and ~/.docker locations unreachable

**Affected Service:**
- mcp-server container (localhost:3000 → Cloudflare tunnel → zenmidi.com/vn-market/mcp)
- Impacts all cowork-managed agents (news-scout, market-watcher, bctc-analyst, digest-predict, alert-commander, fb-market-poster)
- Blocks `cowork-team` dispatcher cron (*/15 * * * *)

**Infrastructure State:**
- Docker Desktop: ✗ Unresponsive (45+ second restart timeout exceeded)
- System resources: ✓ Adequate (1GB+ free memory, disk healthy)
- Cloudflare proxy: ✓ Online (returns 502 from origin)
- VPS proxy (125.212.251.27:8765): ✓ Online

**Recovery Actions Attempted:**
1. Restarted Docker Desktop (multiple attempts, 60-120s wait)
2. Force-killed Docker processes (`sudo pkill -9`)
3. Removed broken socket (`rm /Users/admin/.docker/run/docker.sock`)
4. Switched Docker context (`docker context use default`)
5. Attempted alternative socket paths (/var/run/docker.sock, /private/var/run/docker.sock)
6. Checked daemon.json and launchd services
7. Verified system is not OOM or disk-full

**Diagnostics Performed:**
- ✓ Confirmed endpoint is Cloudflare-proxied (TLS/cert valid, Cloudflare headers)
- ✓ Verified 502 is origin-server issue (proxy responds in <100ms)
- ✓ Checked Docker version and installation (Docker 29.5.2, Desktop 34.x)
- ✓ Verified no recent code changes caused this (infrastructure failure, not code)

**Decision:** Recovery impossible via ops tools. **System reboot required (user intervention).**

**Next Steps (for user after reboot):**
```bash
# After system restart:
docker ps --filter "name=mcp-server"  # Should show container running
curl -m 5 https://zenmidi.com/vn-market/mcp  # Should return HTTP 200 or valid MCP response
```

**Incident Record:** docs/signals/cowork-team-mcp-endpoint-outage-20260711T1345Z.json

Zone: `ops` | Infrastructure issue (Docker Desktop daemon)

---
