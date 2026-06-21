# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c285 · 2026-06-21T22:13:09Z
### Audit Run Tier-1 (22:13 UTC 2026-06-21, Sunday 05:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 05:13 Sunday, opens 09:00 Monday). mcp-server/frontend restarted ~21:10-21:13Z (both healthy 59min). rag-service ~1h uptime (known ceiling tracking, FU-RAG-DEPLOY-MEMORY). Disk 35% (no pressure). No signal_queue.rows[] NEW.

**RAW-PROBE (2026-06-21T22:13:16Z):**
```
--- docker ps -a ---
vn-market-intelligence-mcp-frontend-1: Up 59 minutes (healthy)
vn-market-intelligence-mcp-mcp-server-1: Up 59 minutes (healthy)
vn-market-intelligence-mcp-pdf-extractor-1: Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1: Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1: Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1: Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1: Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1: Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1: Up About an hour (healthy)
vn-market-intelligence-mcp-news-fetch-1: Up 11 days (healthy)
vn-market-intelligence-mcp-alert-engine-1: Up 11 days (healthy)
mcp-gateway: Up 11 days (healthy)

--- health endpoints ---
mcp-server:3000/health OK (HTTP 200)
api-gateway:4000/health OK (HTTP 200)
macro-indicators:5004/health OK (HTTP 200)
pdf-extractor:5001/health OK (HTTP 200)
frontend:3001/ OK (HTTP 200)

--- A-20 multi-probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Verdict: 3/3 PASS

--- restart count ---
mcp-server: RestartCount=0

--- memory + disk ---
mcp-server: 50.51% MemPerc (1.01GiB / 2GiB) — healthy
Disk /: 35% used (13Gi / 233Gi, 25Gi free) — healthy
```

**Tier-1 Verdict:** CLEAN — all 12 host_runtime_set UP + healthy, all health probes 200, A-20 multi-probe 3/3, memory/disk healthy, no new anomalies.

## c284 · 2026-06-21T21:43:04Z
### Audit Run Tier-1 (21:43 UTC 2026-06-21, Monday 04:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 04:43, opens 09:00). mcp-server/frontend restarted ~21:10-21:13Z (both healthy 29min). rag-service 45min uptime (known ceiling tracking, FU-RAG-DEPLOY-MEMORY). Disk 36% (no pressure). No signal_queue.rows[] NEW.

**RAW-PROBE (2026-06-21T21:43:04Z):**
```
--- docker ps -a ---
mcp-server: Up 29 minutes (healthy)
frontend: Up 29 minutes (healthy)
api-gateway: Up 10 days (healthy)
macro-indicators: Up 6 days (healthy)
pdf-extractor: Up 5 days (healthy)
stock-price: Up 6 days (healthy)
technical-analysis: Up 6 days (healthy)
kinh-dich-service: Up 7 days (healthy)
alert-engine: Up 11 days (healthy)
rag-service: Up 45 minutes (healthy)
news-fetch: Up 10 days (healthy)
mcp-gateway: Up 11 days (healthy)

--- health endpoints (all 200) ---
mcp-server (3000): OK
api-gateway (4000): OK
macro-indicators (5004): OK
pdf-extractor (5001): OK
frontend (3001): OK

--- restart count ---
mcp-server: 0

--- memory + disk ---
mcp-server: 14.39% MemPerc (294.7MiB / 2GiB) — healthy
Disk /: 36% used (13Gi / 233Gi, 25Gi free) — healthy
```

**Tier-1 Verdict:** CLEAN — all 12 host_runtime_set UP + healthy, all health probes 200, memory/disk healthy, no new anomalies.
