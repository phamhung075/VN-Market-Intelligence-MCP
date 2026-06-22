# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c290 · 2026-06-22T01:04:28Z
### Audit Run Tier-1 (01:04 UTC 2026-06-22, Monday 08:04 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 08:04 Monday, market opens 09:00). All 12 host_runtime_set UP + healthy. mcp-server UP 4h/healthy (restart=0, mem 32.44% 664MiB/2GiB). rag-service UP 4h/healthy (restart=94, tracked FU-RAG-DEPLOY-MEMORY). Disk 35% / (25Gi free). A-20 pdf-extractor 3/3 probes passed (event-loop OK). All A-01..A-32 checks PASS. No signal_queue.rows[] NEW. Dedup: 0 skipped.

### RAW-PROBE (2026-06-22T01:04:28Z):
```
=== AUDITOR PROBE 2026-06-22T01:04:28Z ===
--- docker ps -a ---
NAMES                                             STATUS                 IMAGE
vn-market-intelligence-mcp-frontend-1             Up 4 hours (healthy)
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 6 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 11 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 11 days (healthy)
mcp-gateway                                       Up 11 days (healthy)
--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)
--- A-20 pdf-extractor multi-probe ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
--- memory ---
mcp-server MemPerc=32.44% MemUsage=664.4MiB / 2GiB
--- disk ---
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%
```

**Tier-1 Verdict:** CLEAN — 12 host_runtime_set UP, all health 200, A-20 3/3 passed, memory/disk healthy, no new anomalies.

## c289 · 2026-06-22T00:14:28Z
### Audit Run Tier-1 (00:14 UTC 2026-06-22, Monday 07:14 VN 2026-06-22)
- Tier: 1 | Services: 13 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart ≤94, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 07:14 Monday, market opens 09:00). All 13 host_runtime_set UP + healthy. mcp-server UP 3h/healthy (restart=0). rag-service UP 3h/healthy (restart=94, tracked FU-RAG-DEPLOY-MEMORY). Disk 36% / (24Gi free). A-20 pdf-extractor 3/3 probes passed (event-loop OK). All A-01..A-32 checks PASS. No signal_queue.rows[] NEW. Dedup: 0 skipped.

## c288 · 2026-06-21T23:44:52Z
### Audit Run Tier-1 (23:44 UTC 2026-06-21, Monday 06:44 VN 2026-06-22)
- Tier: 1 | Services: 13 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 06:44 Monday, market opens 09:00). All 13 host_runtime_set UP + healthy. mcp-server UP 2h+/healthy (no restarts). rag-service UP 2h+/healthy (restart=94, steady ceiling 90.15% mem at 692.4MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). Disk 39% / (21Gi free). No C-06 market_messages (0 in 3h = expected pre-market, 1h before open). agent_signals UP (78 in 24h). No signal_queue.rows[] NEW. Dedup: 0 skipped (no WARN/CRITICAL candidates this cycle).

## c287 · 2026-06-21T23:13:47Z
### Audit Run Tier-1 (23:13 UTC 2026-06-21, Monday 06:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 06:13 Monday, market opens 09:00). mcp-server UP 2h/healthy (prev restart=0, current 0). rag-service UP 2h/healthy (restart=94, steady ceiling ~71% mem, tracked FU-RAG-DEPLOY-MEMORY). Disk 36% / (24Gi free). C-06 INFO (0 market_messages 3h = expected pre-market; live 1h before open). C-07 PASS (76 agent_signals 24h). B-08 PASS (80 PDFs). WAL: 4.1MB/0B (healthy). No signal_queue.rows[] NEW.
