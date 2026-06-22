# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c297 · 2026-06-22T03:14:20Z
### Audit Run Tier-1 (03:14 UTC 2026-06-22, Monday 10:14 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 10:14 Monday, market OPEN since 09:00). All 12 host_runtime_set UP+healthy. mcp-server UP 1h/healthy (restart=0, mem 22.46% 459.9MiB/2GiB). rag-service UP 1.5h/healthy (restart=96, mem 89.16% 684.7MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 35% (26Gi free). All A-01..A-32 checks PASS.

## c296 · 2026-06-22T02:44:01Z
### Audit Run Tier-1 (02:44 UTC 2026-06-22, Monday 09:44 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5 probed
- Anomalies: 0 NEW (all containers UP, healthy)
- Status: CLEAN
- Notes: Market-hours window (VN 09:44 Monday, market OPEN). All 12 host_runtime_set UP+healthy. mcp-server UP 46m/healthy (restart=0, mem 18.21% 372.9MiB/2GiB). rag-service UP healthy (restart=96, mem 84.72% 650.7MiB/768MiB, tracked FU-RAG-DEPLOY-MEMORY). A-20 pdf-extractor multi-probe 3/3 PASS. Disk 35% (26Gi free). All A-01..A-32 checks PASS.

## c295 · 2026-06-22T02:32:20Z
### Audit Run Tier-2 (02:32 UTC 2026-06-22, Monday 09:32 VN 2026-06-22)
- Tier: 2 | Sources checked: 12 | Cron gaps: 0 | Freshness: ALL PASS
- Anomalies: 0 NEW | Dedup-skipped: 0
- Status: CLEAN
- Context: Market-hours window (09:32 VN Monday, market OPEN). All sources within SLA.
- Freshness: ssc-iboard ✓ | foreign-flow (2802 events/30min) ✓ | bctc (SLA OUT-window, 168h) ✓ | sbv-vps ✓ | news ✓ | VPS proxy ✓
- DB: market_messages=2 (3h) ✓ | agent_signals=83 (24h) ✓ | BCTC SSC URLs=0 ✓ | stale pending=0 ✓ | cron gaps=0 ✓
