# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c409 · 2026-06-24T05:15:00Z
### Audit Run Tier-3 (05:13–05:15 UTC 2026-06-24)
- Tier: 3 | Containers: 12/12 UP | DB checks: C-01–C-16 PASS
- Anomalies: 0 new | Status: HEALTHY
- Tier-1: All 12 host_runtime_set UP+healthy. A-20 pdf-extractor 3/3 ✓. mcp-server RestartCount=0 (65.13% mem, 1.303GiB/2GiB, <85%). rag=104 restarts (known FU-RAG). Disk 34% ok.
- Tier-2: C-06 8msg/3h ✓. C-07 247sig/24h ✓. B-09 0 SSC ✓. B-13 0 stale>72h ✓. Inter-svc: 4/4 ok.
- Tier-3 DB: C-01 708✓ C-02 808✓ C-03 32✓ C-04 0✓ C-05 0✓ C-08 0✓ C-09 3✓ C-10 0✓ C-11 0 (expected) C-12 ok✓ C-13 3.9MB✓ C-14 0.7%✓ C-15 ok✓ C-16 0✓. Tooling: pdftoppm✓ tesseract✓ vie✓. A-31 EPIPE=0✓. B-08 PDFs=80✓. Signal 7262 posted.

## c408 · 2026-06-24T05:13:28Z
### Audit Run Tier-2 (05:13 UTC 2026-06-24)
- Tier: 2 | Sources: 25+ checked | VPS routes: 4 healthy, 1 stale (bctc)
- Anomalies: 1 CRITICAL (bctc-discover stale 7d 10h) | Status: DEGRADED
- Findings: B-06 CRITICAL — VPS bctc proxy last_push 2026-06-16T18:02:24Z (7d 10h old); vn-bctc-fetch unhealthy; SLA breached 10591min vs 120min. C-06 PASS (8 market_messages 3h), C-07 PASS (246 signals 24h), B-09 PASS (0 ssc.gov.vn urls), B-13 PASS (0 stale >72h). Rate limits OK. All crons healthy. Signal posted (id=7261). Dedup_key=data_stale:bctc-discover:B-06 (NEW incident).

## c406 · 2026-06-24T04:43:40Z
### Audit Run Tier-1 (04:43 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L11-L22]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L27-L31]. mcp-server RestartCount=0, Memory 65.72% (1.314GiB / 2GiB, healthy <85%, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY ~1/hr—RECORD-AND-LEAVE, no spike). Disk 35% (26Gi avail) PASS. NO new signals emitted.

## c405 · 2026-06-24T04:13:56Z
### Audit Run Tier-1 (04:13–04:14 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L11-L22]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L27-L31]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 67.72% (1.354GiB / 2GiB, healthy <85%). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY ~1/hr—RECORD-AND-LEAVE). Disk 34% (27Gi avail) PASS. All 100+ cron jobs 100% success. NO new signals emitted.

## c404 · 2026-06-24T03:43:36Z
### Audit Run Tier-1 (03:43–03:45 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L11-L22]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L27-L31]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 57.55% (1.151GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, ~1 restart/hr normal—RECORD-AND-LEAVE). Disk 34% (27Gi avail / 233Gi) PASS. All cron jobs green (last fire gaps all within 2× cadence). Dedup: A-21/A-30 known-standing patterns—no escalation. NO new signals emitted.

## c403 · 2026-06-24T03:13:13Z
### Audit Run Tier-1 (03:13 UTC 2026-06-24)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy [RAW-PROBE L5-L16]. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200 [RAW-PROBE L21-L25]. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0, Memory 55.89% (1.118GiB / 2GiB, healthy, no OOMKilled). rag-service RestartCount=104 (known-standing FU-RAG-DEPLOY-MEMORY, ~1 restart/hr normal—RECORD-AND-LEAVE). Disk 33% (28Gi avail / 233Gi) PASS. All 100+ cron jobs 100% success rate last 7d. Dedup: A-21/A-30 known-standing patterns—no escalation. NO new signals emitted.
