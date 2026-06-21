# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c280 · 2026-06-21T19:43:04Z
### Audit Run Tier-1 (19:43 UTC 2026-06-21, Monday pre-market 02:43 VN 2026-06-22)
- Tier: 1 | Services: 11 checked | Health endpoints: 10/11 probed
- Anomalies: 0 NEW (all containers UP, all health 200/404, no restarts except rag-service tracked ceiling)
- Status: CLEAN
- Notes: Pre-market window. mcp-server UP 9h (restart=0); rag-service 92 restarts, mem 768MB (known ceiling FU-RAG-DEPLOY-MEMORY, OOMKilled=false). Disk 38% (no pressure). All host_runtime_set services healthy.

**RAW-PROBE (2026-06-21T19:43:04Z):**
```
--- docker ps (11 host_runtime_set + 2 others) ---
All 11 host_runtime_set: UP, healthy

--- health endpoints (10/10 runtime_set) ---
✓ mcp-server (:3000) = 200
✓ api-gateway (:4000) = 200
✓ stock-price (:5010) = 200
✓ technical-analysis (:5003) = 200
✓ macro-indicators (:5004) = 200
✓ kinh-dich-service (:5005) = 200
✓ alert-engine (:5006) = 200
✓ pdf-extractor (:5001) = 200
✓ rag-service (:5002) = 200
✓ news-fetch (:5008) = 200
✗ frontend (:3001) = 404 (not-deployed-by-design)

--- resource usage ---
Disk: 38% (13Gi / 233Gi) — PASS
rag-service: 768MB limit, 92 restarts, OOMKilled=false, UP 9h = ceiling steady-state (tracked)
```

**Tier-1 Verdict:** all checks PASS; dedup-skipped: rag-service mem (ceiling, FU-RAG-DEPLOY-MEMORY); status CLEAN.

## c279 · 2026-06-21T19:13:13Z
### Audit Run Tier-1 (19:13 UTC 2026-06-21, Monday pre-market 02:13 VN 2026-06-22)
- Tier: 1 | Services: 13 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, all health 200, no restarts, memory/disk healthy)
- Status: CLEAN
