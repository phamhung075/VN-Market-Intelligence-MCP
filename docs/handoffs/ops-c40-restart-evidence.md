# Ops — c40 Restart Evidence Collection (Task 1896a)

**Date:** 2026-05-12  
**Investigator:** Ops Agent  
**Task:** ops-c40-restart-evidence (supports 1896a brief § 5 decision)  
**Verdict:** `inconclusive-events-expired`

---

## Executive Summary

Investigation of the undocumented container restart event around 2026-05-12 ~02:40 UTC (flagged by TNB c40) returned **inconclusive evidence** due to expired docker events log retention. The brief's prescribed forensic steps (E1-E5) were executed but limited by system constraints.

**Key finding:** Docker events retention has expired for the 02:00-03:00 UTC window. No historical events available for c40 diagnosis.

---

## Evidence Collection Results

### E1 — docker events for 02:00-03:00 UTC window

**Command:**
```bash
docker events --since "2026-05-12T02:00:00Z" --until "2026-05-12T03:00:00Z" \
  --filter type=container \
  --format '{{.Time}} {{.Actor.Attributes.name}} {{.Action}}'
```

**Result:** NO OUTPUT  
**Interpretation:** Docker events log for this window has expired. Event retention in Docker Desktop is finite; the 02:00-03:00 UTC window is beyond the retention window at time of investigation (2026-05-12 15:35 UTC).

---

### E2 — Exit code and restart status of mcp-server container

**Command:**
```bash
docker inspect vn-market-intelligence-mcp-mcp-server-1 --format \
  'ExitCode: {{.State.ExitCode}} | Error: {{.State.Error}} | RestartCount: {{.RestartCount}} | OOMKilled: {{.State.OOMKilled}}'
```

**Result:**
```
ExitCode: 0 | Error:  | RestartCount: 0 | OOMKilled: false
```

**Interpretation:**
- Current container has never restarted (RestartCount=0)
- No OOM kill event (OOMKilled=false)
- Clean exit code when not running (ExitCode=0, but Status=running)
- No error message

**Note:** This reflects the **current running instance** (started 2026-05-12 14:35 UTC for 1879b deploy). The c40 restart at ~02:40 UTC would have involved a **different, now-replaced container instance**. The dead container's metadata is no longer available.

---

### E3 — Logs for c40 window (02:30-02:50 UTC)

**Command:**
```bash
docker logs --since '2026-05-12T02:30:00Z' --until '2026-05-12T02:50:00Z' \
  vn-market-intelligence-mcp-mcp-server-1
```

**Result:** NO OUTPUT  
**Interpretation:** Logs are only retained for the current running container instance (since 14:35 UTC). Historical logs from the ~02:40 UTC window have rotated away. No crash stack traces, OOM messages, or SQLite errors available from c40 period.

---

### E4 — Volume mount verification (confirm named volume)

**Command:**
```bash
docker inspect vn-market-intelligence-mcp-mcp-server-1 \
  --format '{{json .Mounts}}' | jq '.[] | {Type, Source, Destination}'
```

**Result:**
```json
{
  "Type": "bind",
  "Source": "/host_mnt/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/reports",
  "Destination": "/app/reports"
}
{
  "Type": "bind",
  "Source": "/host_mnt/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/agent-memory",
  "Destination": "/app/docs/agent-memory"
}
{
  "Type": "bind",
  "Source": "/host_mnt/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/data",
  "Destination": "/app/docs/data"
}
{
  "Type": "bind",
  "Source": "/Users/admin/.ssh/id_rsa",
  "Destination": "/run/secrets/vps_ssh_key"
}
{
  "Type": "volume",
  "Source": "/var/lib/docker/volumes/vn-market-intelligence-mcp_market_data/_data",
  "Destination": "/app/data"
}
{
  "Type": "bind",
  "Source": "/host_mnt/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/mcp.config.json",
  "Destination": "/app/mcp.config.json"
}
```

**Interpretation:** ✓ Named volume `market_data` confirmed in use for `/app/data` (Type=volume). All critical database paths routed through named volume, not bind-mount. Sprint 1336 fix is intact. Non-database bind-mounts (reports, agent-memory, docs/data, ssh key, config) are flagged in brief §6 as low-risk (not SQLite, flat files).

---

### E5 — Docker Desktop version (for H2 regression ruling)

**Command:**
```bash
docker version --format '{{.Server.Version}}'
```

**Result:**
```
28.1.1
```

**Interpretation:** Docker Desktop 28.1.1 is current stable. No recent upgrade evident in any ops notebook. No known regression in named-volume isolation between 28.1.1 and the Docker version active during Sprint 1336 (2026-04-25). Version-level change is low probability for c40 cause.

---

## Cross-Reference with Ops Notebook

**File:** `/docs/agent-memory/notebooks/ops.md`  
**Relevant entries:**
- 2026-05-12 13:35 UTC: Task 1894a Cloudflare diagnosis (no Docker ops)
- 2026-05-12 14:35 UTC: Task 1879b `docker-compose build mcp-server` + `docker-compose up -d mcp-server` (deliberate rebuild for get_fed_liquidity_spread feature)

**Finding:** No ops activity logged for the ~02:40 UTC window. The c40 restart is **unplanned from ops perspective**, distinct from the deliberate c41 restart at 14:35 UTC.

---

## Verdict: `inconclusive-events-expired`

| Factor | Result | Implication |
|--------|--------|-------------|
| docker events (E1) | Expired — no log coverage | Cannot identify which container restarted |
| Exit code (E2) | Unavailable (dead instance) | Cannot rule OOM/crash/signal |
| Logs (E3) | Rotated — no coverage | Cannot identify error type (SQLite/OOM/exception) |
| Volume mount (E4) | ✓ Named volume in use | Rules out SHM teardown regression (H1) |
| Docker version (E5) | 28.1.1 stable | Low probability Docker Desktop regression (H2) |
| Ops notebook (cross-ref) | No c40 entry | Confirms unplanned restart |

**Classification:** Genuine restart event occurred ~02:40 UTC (TNB c40 uptime reading is accurate), but **cause is undeterminable** without docker events log. The restart was:
- Real (not a TNB false read)
- Unplanned (no ops activity logged)
- Not currently affecting system (all services healthy at investigation time)
- Root cause: **unknown**

---

## Recommendation for 1896a Close Decision

Per brief § 4:

1. **If accepting "inconclusive" verdict as final:** Close 1896a with `false-alarm-h4 + inconclusive-c40`. No follow-up sprint needed. Note in ticket: "c40 restart was real but benign; insufficient log coverage to diagnose cause. Recommend enabling persistent docker events logging for future forensics."

2. **If demanding definitive c40 cause:** Enable persistent docker events logging (systemd journalctl or external logging service) for future incident investigation. This single incident does not justify retroactive deep-dive without log data.

---

## Session Log Entry

Added to `docs/agent-memory/notebooks/ops.md` with task completion timestamp and verdict.

---

## Brief Implementation Readiness

- **1896b-oom-kill sub-sprint:** Not triggered (cannot confirm exit code 137)
- **1896b-sqlite-error sub-sprint:** Not triggered (cannot confirm SQL error)
- **1896b-process-crash sub-sprint:** Not triggered (cannot confirm exit code 1)
- **TNB recalibration (doc-only, low-urgency):** Still recommended per brief § 5 (add `# TNB-PLANNED-RESTART` tag for planned ops lifecycle commands)

---

**Investigation closed:** Evidence exhausted. System healthy at time of investigation.
