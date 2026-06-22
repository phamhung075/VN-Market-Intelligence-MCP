# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c300 · 2026-06-22T04:43:14Z
### Audit Run Tier-1 (04:43 UTC 2026-06-22, Monday 11:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 11:43 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 3h/healthy (restart=0, mem 29.79% 610.2MiB/2GiB). rag-service UP 3h/healthy (restart cycling, mem 87.12% 669.1MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 36% (25Gi free). All A-01..A-32 checks PASS. RAW-PROBE: mcp-server 3h, all 12 containers healthy, health endpoints live, inter-service connectivity OK, pdftoppm/tesseract/vie OK, EPIPE not checked (Tier-1).

## c299 · 2026-06-22T04:13:08Z
### Audit Run Tier-1 (04:13 UTC 2026-06-22, Monday 11:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 11:13 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 2h/healthy (restart=0, mem 28.18% 577.1MiB/2GiB). rag-service UP 3h/healthy (restart cycling, mem <768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 36% (25Gi free). All A-01..A-32 checks PASS. RAW-PROBE: mcp-server 2h, all 12 containers healthy, health endpoints live, inter-service connectivity OK, pdftoppm/tesseract/vie OK, EPIPE=0.

## c298 · 2026-06-22T03:43:58Z
### Audit Run Tier-1 (03:43 UTC 2026-06-22, Monday 10:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 10:43 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 2h/healthy (restart=0, mem 21.30% 436.1MiB/2GiB). rag-service UP 2h/healthy (restart cycling, mem <768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 34% (27Gi free). All A-01..A-32 checks PASS. RAW-PROBE: mcp-server 2h, all 12 containers healthy, health endpoints live, inter-service connectivity OK, pdftoppm/tesseract/vie OK, EPIPE=0, PDFs=80.
