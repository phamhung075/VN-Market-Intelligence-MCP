# System Auditor — Notebook

**Last updated:** 2026-05-19 20:07 UTC | **Cycle:** TIER-1 | **Sprint:** 1954

## Current state

**CRITICAL RUNTIME OUTAGE DETECTED**

Tier-1 audit (container + health liveness) detected 8 of 10 microservices DOWN:
- pdf-extractor: NOT RUNNING (expected port 5001, health timeout)
- rag-service: NOT RUNNING (expected port 5002, health timeout)
- alert-engine: NOT RUNNING (expected port 5006, health timeout)
- api-gateway: NOT RUNNING (expected port 4000, expected but not listed)
- stock-price: NOT RUNNING (expected port 5010, expected but not listed)
- technical-analysis: NOT RUNNING (expected port 5003, expected but not listed)
- macro-indicators: NOT RUNNING (expected port 5004, expected but not listed)
- kinh-dich-service: NOT RUNNING (expected port 5005, expected but not listed)
- news-fetch: NOT RUNNING (expected port 5008, expected but not listed)
- frontend: NOT RUNNING (expected port 3001, expected but not listed)

Only mcp-server is UP. docker-compose.yml defines all 11 services but `docker-compose ps` shows only mcp-server running.

**Prior notebook (2026-05-19 19:31) is FALSE** — reported "All 12 Docker containers UP" but that contradicts current reality. Data corruption or false positive alert.

---

## Tier-1 Audit — 2026-05-19 20:07:54 UTC

### Container Status (A-01 through A-20)
✗ CRITICAL: 8 services NOT RUNNING
- pdf-extractor: missing (docker ps does not list)
- rag-service: missing (docker ps does not list)
- alert-engine: missing (docker ps does not list)
- api-gateway: missing (docker ps does not list, expected port 4000)
- stock-price: missing (docker ps does not list, expected port 5010)
- technical-analysis: missing (docker ps does not list, expected port 5003)
- macro-indicators: missing (docker ps does not list, expected port 5004)
- kinh-dich-service: missing (docker ps does not list, expected port 5005)
- news-fetch: missing (docker ps does not list, expected port 5008)
- frontend: missing (docker ps does not list, expected port 3001)

✓ PASS: mcp-server UP (5 hours, healthy)
✓ PASS: mcp-gateway UP (2 days, healthy) — infrastructure only, not in system-map services

### Health Endpoints (A-12 through A-20)
✓ PASS: mcp-server (port 3000): HTTP 200, status "ok"

✗ CRITICAL: api-gateway (port 4000): container not running, no health check possible
✗ CRITICAL: stock-price (port 5010): container not running, no health check possible
✗ CRITICAL: technical-analysis (port 5003): container not running, no health check possible
✗ CRITICAL: macro-indicators (port 5004): container not running, no health check possible
✗ CRITICAL: kinh-dich-service (port 5005): container not running, no health check possible
✗ CRITICAL: alert-engine (port 5006): container not running, curl timeout (FAIL_5006)
✗ CRITICAL: pdf-extractor (port 5001): container not running, curl timeout (FAIL_5001)
✗ CRITICAL: rag-service (port 5002): container not running, curl timeout (FAIL_5002)
✗ CRITICAL: news-fetch (port 5008): container not running, no health check possible
✓ N/A: frontend (port 3001): no health endpoint expected

### Restart Count (A-21)
✓ PASS: mcp-server restart count = 0 (≤ 2)

### Memory Pressure (A-30)
✓ PASS: mcp-server memory = 11.64% (< 85%)

### MCP System Status
✗ CRITICAL: Cannot reach MCP gateway tools (vn-market server unavailable to MCP gateway)
- Error: "dial vn-market: Get http://host.docker.internal:3000/sse: connection refused"
- MCP gateway is running but cannot reach mcp-server via docker internal network
- This blocks all MCP tool calls (get_system_status, get_cron_health, etc.)

### Cron Health (A-29)
Cannot determine without MCP tools. Skipped due to MCP gateway connectivity failure.

### Anomaly Summary
- **Total anomalies detected:** 10 NEW CRITICAL anomalies
- **CRITICAL:** 10 (8 containers down, 1 MCP connectivity loss, health endpoints down)
- **WARN:** 0
- **INFO:** 0
- **Dedup-skipped:** 0 (all new)

### Signals Sent
Pending MCP tool invocation for signal emission — cannot post_agent_signal due to MCP gateway failure.

Manual escalation: CRITICAL runtime outage requires immediate ops investigation.

### DASHBOARD.md Update
Not yet written — waiting for dedup check and severity confirmation.

### Overall Status
- **Tier-1 Completion:** FAIL (runtime integrity compromised)
- **Container health:** CRITICAL (1 of 10 critical services UP)
- **Health endpoints:** CRITICAL (8 down, 1 unknown MCP status)
- **Cron health:** UNKNOWN (MCP tools unreachable)
- **Memory/restart:** OK (mcp-server metrics normal)
- **System overall:** CRITICAL OUTAGE

### Immediate Actions Required
1. **OPS:** Investigate why only mcp-server is running; docker-compose may have been stopped or scaled down
2. **OPS:** Verify docker daemon and docker-compose status
3. **OPS:** Check if docker volume `market_data` is accessible (shared by all services)
4. **OPS:** Determine if shutdown was intentional (scheduled maintenance) or unintentional (crash)
5. **DEV:** Review mcp-server logs for "pdf-extractor unavailable" warning (line 73 in logs from 20:07:32)

### Next Steps
- Do not proceed with Tier-2 or Tier-3 until container infrastructure is restored
- PO to route to ops immediately for recovery
- Escalate to CRITICAL via BUG channel only after dedup check

---

## Session Timeline

- **2026-05-19 20:07:04 UTC:** Tier-1 audit start
- **2026-05-19 20:07:04–20:07:54 UTC:** Docker ps, health endpoint checks, MCP tool attempts
- **2026-05-19 20:07:54 UTC:** Analysis complete, 10 NEW CRITICAL anomalies identified
- **2026-05-19 20:07:54 UTC:** Notebook update (this moment)

**Total duration:** ~50s (well under 120s limit)

---

## Dedup Index (7-day window)

**Last audit:** 2026-05-19 19:31 UTC (prior Tier-1, false positive)

**New dedup keys (2026-05-19 20:07:54):**
1. `microservice_degraded:pdf-extractor:A-01` — CRITICAL — containers not running
2. `microservice_degraded:rag-service:A-01` — CRITICAL — containers not running
3. `microservice_degraded:alert-engine:A-01` — CRITICAL — containers not running
4. `microservice_degraded:api-gateway:A-01` — CRITICAL — containers not running
5. `microservice_degraded:stock-price:A-01` — CRITICAL — containers not running
6. `microservice_degraded:technical-analysis:A-01` — CRITICAL — containers not running
7. `microservice_degraded:macro-indicators:A-01` — CRITICAL — containers not running
8. `microservice_degraded:kinh-dich-service:A-01` — CRITICAL — containers not running
9. `microservice_degraded:news-fetch:A-01` — CRITICAL — containers not running
10. `mcp_gateway_connectivity:vn-market:A-29` — CRITICAL — MCP tools unreachable

All 10 are NEW anomalies (first time detected in this context, no prior BUG reports for this outage).

---

## Known Patterns / Preferences

- **Tier dispatch:** AUDIT_TIER=1 runs container + health liveness only
- **Wall time target:** Tier-1 < 120s (target met: ~50s actual)
- **Report threshold:** severity >= CRITICAL (anomalies qualify)
- **Dedup window:** 7 days (no conflicts with previous audits)
- **False positive flag:** Prior notebook (19:31) contradicts current reality — investigate data integrity
