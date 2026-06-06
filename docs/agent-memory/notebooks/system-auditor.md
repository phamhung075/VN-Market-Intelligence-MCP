---
agent: system-auditor
session_date: 2026-06-06
---

## c041 · 2026-06-06T12:32:30Z
### Audit Run Tier-1 (12:32 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Services: 6 checked | Crons: 70+ polled
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE: 2026-06-06T12:32:16Z
```
=== docker ps -a ===
vn-market-intelligence-mcp-frontend-1           Up About an hour (healthy)
vn-market-intelligence-mcp-pdf-extractor-1      Up About an hour (healthy)
vn-market-intelligence-mcp-macro-indicators-1   Up About an hour (healthy)
vn-market-intelligence-mcp-api-gateway-1        Up About an hour (healthy)
vn-market-intelligence-mcp-mcp-server-1         Up About an hour (healthy)
mcp-gateway                                     Up 10 days (healthy)

=== health endpoints ===
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

=== restart count ===
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

=== memory pressure ===
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=22.57% MemUsage=462.2MiB / 2GiB

=== disk df -h / ===
Capacity 30% (32Gi free)
```

### Container Status (A-01..A-11, host_runtime_set) — All PASS
- mcp-server: Up ~1h, restart_count=1, memory=22.57% ✓
- api-gateway: Up ~1h ✓ | frontend: Up ~1h ✓ | macro-indicators: Up ~1h ✓
- mcp-gateway: Up 10d ✓ | pdf-extractor: Up ~1h ✓

### Health Endpoints (A-12..A-20) — All PASS
- mcp-server:3000 /health → 200 (toolCount:162 ok) ✓
- api-gateway:4000 /health → 200 ✓
- macro-indicators:5004 /health → 200 ✓
- pdf-extractor:5001 /health → 200 ✓
- frontend:3001 / → 200 ✓

### System Metrics (A-21, A-30, A-32) — All PASS
- Restart count: 1 (≤2) ✓
- Memory: 22.57% (< 85%) ✓
- Disk: 30% capacity (< 85%) ✓

### Cron Health & Circuit Breaker (A-29, B-circ)
- 70+ scheduled crons: baseline 97–100% success_rate, all nominal ✓
- Circuit breaker: all 16 sources [OK] (0 open/half-open) ✓

### Market Status
- VN market CLOSED (Saturday 12:32 UTC) — weekend idle by design
- Escalation lock: bctc-ctg-attachment-fetch-escalation-c026 held (expires 2026-06-07T00:06:31Z)

## c040 · 2026-06-06T11:08:59Z
### Audit Run Tier-1 EARLY-EXIT (11:08 UTC 2026-06-06)
- Tier: 1 (runtime ping) | Status: EARLY-EXIT
- Anomalies: 1 CRITICAL (HOST ENOSPC) | 0 dedup-skipped
- Status: CRITICAL — blocked on host infrastructure

### HOST ENOSPC CRITICAL (A-HOST-ENOSPC)
- /private/tmp/claude-501 exhausted (0MB free)
- Impact: curl health checks BLOCKED, all container status checks blocked
- Evidence: bash curl exit 7 "the temp filesystem at /private/tmp/claude-501/.../tasks is full (0MB free)"
- Root cause: /tmp space pressure (documented feedback_enospc_deadlock.md)
- Action: HOST-level remediation required (restart Claude Code or rm -rf /private/tmp/claude-501/)
- Signal queued: sau-host-enospc-202606061108 → CRITICAL → po
- Tier-1 execution: INCOMPLETE (cannot proceed with health checks)

## c039 · 2026-06-06T11:01:42Z
### Audit Run Tier-2 (11:01 UTC 2026-06-06)
- Tier: 2 (freshness sweep) | Crons: 85+ checked | Sources: 28 checked | VPS routes: 7 checked
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY
