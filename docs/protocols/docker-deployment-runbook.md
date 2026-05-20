# Docker Deployment Runbook

## Pre-flight

**Script:** `scripts/preflight-disk.sh`

Before running `docker compose up -d`, execute the pre-flight disk check to ensure sufficient disk space:

```bash
scripts/preflight-disk.sh
```

**Rationale:** Sprint 1958 RCA (signal `docs/signals/ops-1958-rca.json`) identified disk pressure (97% full) as the proximate cause of RAG cold-start hang during service initialization. The script prevents reproduction by enforcing a minimum 15 GB free disk threshold before Docker pulls images and starts containers.

**Expected output (healthy):**
```
OK: Docker disk has 33GB free (≥15GB threshold).
```

**If threshold not met:**
```
ERROR: Docker disk has 3GB free, need ≥15GB. Run disk-relief: docker builder prune -a -f && docker image prune -a -f
```

When the error appears, run the suggested disk-relief commands and retry the pre-flight check before attempting `docker compose up -d`.

---

## Deploy

After pre-flight passes, start the full stack:

```bash
docker compose up -d
```

Wait ~30 seconds for health checks to stabilize, then verify:

```bash
curl http://localhost:4000/health
```

Expected response (all 9 services healthy):
```json
{
  "status": "ok",
  "services": {
    "alert-engine": { "status": "ok", "latency_ms": 3 },
    "kinh-dich-service": { "status": "ok", "latency_ms": 3 },
    "macro-indicators": { "status": "ok", "latency_ms": 2 },
    "mcp-server": { "status": "ok", "latency_ms": 6 },
    "news-fetch": { "status": "ok", "latency_ms": 3 },
    "pdf-extractor": { "status": "ok", "latency_ms": 3 },
    "rag-service": { "status": "ok", "latency_ms": 4 },
    "stock-price": { "status": "ok", "latency_ms": 3 },
    "technical-analysis": { "status": "ok", "latency_ms": 3 }
  }
}
```

---

## Troubleshooting

### RAG service hangs on startup

If `docker logs rag-service` shows "Waiting for application startup" stuck for >30s under normal disk conditions (>15GB free):

1. Restart the service in isolation:
   ```bash
   docker restart vn-market-intelligence-mcp-rag-service-1
   ```

2. Poll the health endpoint until responding:
   ```bash
   for i in {1..30}; do curl -s http://localhost:5002/health && break; sleep 1; done
   ```

3. Verify full stack recovery:
   ```bash
   curl http://localhost:4000/health
   ```

### Disk pressure preventing startup

If any service fails with I/O errors or ENOSPC:

1. Check available disk:
   ```bash
   df -h /
   ```

2. Run disk relief (safe order):
   ```bash
   docker image prune -a -f
   docker builder prune -a -f
   ```

3. Retry pre-flight + deploy:
   ```bash
   scripts/preflight-disk.sh && docker compose up -d
   ```

---

## Related

- RCA: `docs/signals/ops-1958-rca.json`
- Disk relief signal: `docs/signals/ops-1958-disk-relief.json`
