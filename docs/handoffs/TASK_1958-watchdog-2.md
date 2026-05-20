# TASK 1958-watchdog-2 — Bump RAG Service Healthcheck Start Period (30s → 60s)

**Status:** BACKLOG
**Assigned to:** dev-mcp-server (owns docker-compose.yml)
**Priority:** HIGH / Size: XS
**Zone:** apps/mcp-server / ops
**Estimate:** 15m (trivial edit + deployment test)
**Depends on:** —

---

## Context

RCA (task 1958-rca) identified that RAG service lifespan handler blocked on sentence-transformers model initialization under disk I/O contention. The 30-second healthcheck `start_period` was insufficient; timeout occurred at 30s while model load was still in progress.

This task increases the start_period to 60s to account for disk I/O latency and model loading time, allowing the service to complete startup before health checks commence.

---

## Acceptance Criteria

1. **docker-compose.yml updated**
   - File: `apps/mcp-server/docker-compose.yml`
   - Service: `rag-service`
   - Field: `healthcheck.start_period`
   - Change: `30s` → `60s`
   - Verify: line in compose file reads `start_period: 60s`

2. **Deployment test — healthcheck succeeds on restart**
   - Execute `docker compose up -d` (all services)
   - Manually restart rag-service: `docker restart vn-market-intelligence-mcp-rag-service-1`
   - Observe healthcheck progression:
     - 0–60s: status transitions `starting` → `healthy`
     - No timeout / unhealthy state during 0–60s window
   - Verify: `docker ps` shows rag-service `Up` + `(healthy)` after 60s

3. **Cold-start latency verification**
   - Stop all services: `docker compose down`
   - Start all services: `docker compose up -d`
   - Measure time to rag-service healthy:
     - Expected: ≤60s (was timing out at 30s pre-fix)
   - Verify: all 11 services Up + healthy within 4 min (baseline from 1958-recovery)

4. **Regression test — no side effects**
   - All other services remain healthy (no timeout changes to other services)
   - API gateway + mcp-server health endpoints still respond in <5s

---

## Work Items

### 1. Edit docker-compose.yml (5 min)

File: `apps/mcp-server/docker-compose.yml`

Locate the `rag-service` section:
```yaml
rag-service:
  image: vn-market-intelligence-mcp-rag-service:latest
  # ... other config ...
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:5002/health"]
    interval: 10s
    timeout: 5s
    retries: 3
    start_period: 30s   # <-- CHANGE THIS TO 60s
```

Change to:
```yaml
    start_period: 60s
```

### 2. Manual deployment test (10 min)

```bash
# Reload compose
docker compose up -d

# Wait for services to stabilize (~1 min)
sleep 60

# Check rag-service status
docker ps | grep rag-service
# Expected: "Up X seconds (healthy)"

# Force restart to verify healthcheck during startup
docker restart vn-market-intelligence-mcp-rag-service-1

# Monitor progression
watch -n 1 'docker ps | grep rag-service'
# Expected: status progresses starting → healthy within 60s

# Once healthy, verify API works
curl http://localhost:5002/health
# Expected: HTTP 200 + valid response
```

### 3. Verify no regressions (5 min)

```bash
# All services healthy
docker ps
# Expected: 11/11 services Up + healthy

# API endpoints responsive
curl http://localhost:3000/health  # mcp-server
curl http://localhost:3001/        # frontend
# Expected: HTTP 200
```

---

## Verification Steps

- [ ] `docker-compose.yml` field `rag-service.healthcheck.start_period` changed from 30s to 60s
- [ ] `docker compose up -d` executed; all services healthy
- [ ] Manual `docker restart rag-service` test: healthcheck status healthy within 60s
- [ ] Cold-start test: `docker compose down` + `docker compose up -d`; rag-service healthy <60s
- [ ] All 11 services Up + healthy (no timeout side effects)

---

## Success Criteria

- docker-compose.yml deployed with 60s start_period
- rag-service healthcheck no longer times out during cold-start
- All 11 services recover to healthy state within 4 min (baseline)
- Zero degradation to other services

---

## Files Modified

- `apps/mcp-server/docker-compose.yml` — `rag-service.healthcheck.start_period: 30s` → `60s` (1 line change)

---

## Notes

- **Trivial change:** single numeric edit, no code impact
- **Deployment risk:** very low; only affects healthcheck timing, not service logic
- **Future hardening:** once 1958-watchdog-3 (pre-cache model in Dockerfile) ships, startup latency should decrease, and this 60s window may be further tuned back down to 45s if desired
- **Related tasks:** 1958-watchdog-3 (pre-bake model) will reduce model load time; 1958-watchdog-6 (async-ify lifespan) will further reduce blocking time

---

## Acceptance Sign-Off

Confirm: (1) compose file edited + deployed, (2) healthcheck timing test PASS, (3) cold-start recovery <4 min, (4) no regressions to other services.
