# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c279 · 2026-06-21T19:13:13Z
### Audit Run Tier-1 (19:13 UTC 2026-06-21, Monday pre-market 02:13 VN 2026-06-22)
- Tier: 1 | Services: 13 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, all health 200, no restarts, memory/disk healthy)
- Status: CLEAN
- Notes: VN market closed (pre-09:00). mcp-server rebuilt ~30min ago (10:28Z per context, now 9.5h uptime per container restart=0); rag-service steady (50% mem = 1.002GiB, known ceiling). Disk 36% (no pressure).

**RAW-PROBE (2026-06-21T19:13:13Z):**
```
--- docker ps -a (13 containers) ---
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 9 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
headroom-proxy                                    Up 8 days
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints (5/5 probed) ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- mcp-server resource usage ---
RestartCount=0
MemPerc=50.08% (1.002GiB / 2GiB) — healthy
Disk: 36% used (13Gi / 233Gi available) — no pressure
```

**A-Series Verdict (Tier-1 checks A-01..A-32):**
- A-01..A-13 all containers UP ✓
- A-12..A-19 health endpoints 5/5 probed 200 ✓
- A-21 mcp-server RestartCount=0 ✓
- A-30 memory 50.08% PASS ✓
- A-32 disk 36% PASS ✓

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service mem ~ FU-RAG-DEPLOY-MEMORY) | Status: CLEAN

## c278 · 2026-06-21T18:43:48Z
### Audit Run Tier-1 (18:43 UTC 2026-06-21, Monday pre-market 01:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3 PASS
- Anomalies: 0 NEW (all PASS, stable, healthy)
- Status: CLEAN
- Notes: All containers Up/healthy; mcp-server ~8h uptime; disk 36%, mem 48.7%; pre-market window confirmed
