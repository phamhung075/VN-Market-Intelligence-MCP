# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c281 · 2026-06-21T20:14:05Z
### Audit Run Tier-1 (20:14 UTC 2026-06-21, Monday 03:14 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5/5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 03:14, opens 09:00). mcp-server up 10h (restart=0, mem 59%). A-20 pdf-extractor multi-probe 3/3=200 PASS. Disk 36% (no pressure). rag-service known ceiling tracked.

**RAW-PROBE (2026-06-21T20:14:05Z):**
```
--- docker ps -a ---
All 12 host_runtime_set: UP (healthy)
mcp-server: 10h up, restart=0, mem 59.24%
rag-service: 10h up (known ceiling FU-RAG-DEPLOY-MEMORY)
Others: 5-10 days up, healthy

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200) ✓
[health] api-gateway:4000/health OK (HTTP 200) ✓
[health] macro-indicators:5004/health OK (HTTP 200) ✓
[health] pdf-extractor:5001/health OK (HTTP 200) ✓
[health] frontend:3001/ OK (HTTP 200) ✓

--- A-20 multi-probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
Result: 3/3 PASS

--- system resources ---
mcp-server restart count: 0
mcp-server memory: 59.24% (1.185GiB / 2GiB) — PASS
Disk: 36% (13Gi / 233Gi, avail 24Gi) — PASS
```

**Dedup-skip:** rag-service mem ceiling (FU-RAG-DEPLOY-MEMORY — known tracking, 92 restarts steady-state).

**Tier-1 Verdict:** CLEAN — all services UP, all health 200/404, no new anomalies.

## c280 · 2026-06-21T19:43:04Z
### Audit Run Tier-1 (19:43 UTC 2026-06-21, Monday pre-market 02:43 VN 2026-06-22)
- Tier: 1 | Services: 11 checked | Health endpoints: 10/11 probed
- Anomalies: 0 NEW (all containers UP, all health 200/404, no restarts except rag-service tracked ceiling)
- Status: CLEAN
- Notes: Pre-market window. mcp-server UP 9h (restart=0); rag-service 92 restarts, mem 768MB (known ceiling FU-RAG-DEPLOY-MEMORY, OOMKilled=false). Disk 38% (no pressure). All host_runtime_set services healthy.
