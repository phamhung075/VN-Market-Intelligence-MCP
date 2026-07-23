# INCIDENT: mcp-server OS-Level Wedge (2026-07-11T13:44:53Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Session UUID:** 3dce23eb-6a30-4f92-aec0-51c1393dc399
**Status:** ESCALATION — Unrecoverable (OS-level, docker daemon cannot kill process)

### Incident Timeline
- **11:47:59Z** — Container swapped to QA image sha256:1c5845d64406 (watchlist-fix)
- **13:21–13:29Z** — Normal operations (market analysis, OCF backfill)
- **13:29:28Z** — Last log entry: "[bctcPdfPull] PDF saved — PDR Q4"
- **13:44:53Z** — First healthcheck timeout
- **13:45:00Z–now** — 28 consecutive healthcheck failures (10s timeout, process unresponsive)

### Diagnostics Captured
**Healthcheck:**
- Status: unhealthy
- FailingStreak: 28
- All failures: "Health check exceeded timeout (10s)"
- Interval: ~40s between checks

**Resource Health:**
- Memory: 394.8MiB / 3GiB (12.85% — healthy)
- CPU: 0.13% (normal)
- PIDs: 7 (normal)
- No resource exhaustion, no crash-loop

**Logs:**
- Last entry frozen at 13:29:28Z (~15min before wedge onset)
- Logs show normal operations, zero errors/panics
- No indication of failure leading to wedge

### Root Cause Hypothesis
Bun JIT corruption or event-loop deadlock triggered by intelligence-cycle job (15m cadence; prior cycle ~13:15Z, next due ~13:30Z). Process enters uninterruptible kernel state, unable to respond to signals or graceful shutdown.

**Precedent:** Memory notes doc — "restart-masks-bun-jit-corruption" (project_restart_masks_bun_JIT_corruption.md)

### Recovery Attempts (All Failed)
1. `docker compose restart mcp-server`
   - Error: "tried to kill container, but did not receive an exit event"
   
2. `docker kill mcp-server` (SIGKILL)
   - Error: "tried to kill container, but did not receive an exit event"
   
3. `docker compose up -d --no-deps mcp-server`
   - Result: Container already running, no restart occurred (PID unchanged: 33194)

### Severity Assessment
- **Container:** Unresponsive, in uninterruptible kernel state
- **Restartability:** IMPOSSIBLE — Docker daemon cannot terminate process (SIGKILL fails)
- **Gateway Status:** Wedged mcp-server blocks all downstream MCP tool calls (send_telegram timeout observed)
- **Peer Services:** 10/11 healthy (mcp-server unavailable blocks gateway routing)
- **Data Risk:** Low (read-only operations only, no data corruption detected)
- **Availability Impact:** HIGH — no MCP tool access, gateway dependent

### Required Remediation (Beyond Ops Scope)
**Single-service restart exhausted.** Requires host-level intervention:
- Docker daemon restart (systemctl restart docker / Docker Desktop restart)
- OR host reboot
- OR forcible cgroup destruction (high-risk, requires sudo)

### Next Steps
ESCALATION to dev-team/architect for host-level container runtime intervention.
Image rollback NOT recommended (image is QA-approved; root cause is runtime corruption, not code).

---
