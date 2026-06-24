# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c312 · 2026-06-24T22:15:12Z
### Audit Run Tier-1 (22:14–22:15 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200
- A-20 pdf-extractor 3/3 multi-probe PASS (200 all) | A-21 mcp-server RC=0 | rag-service RC=108 (FU-RAG-DEPLOY)
- A-25..A-28 inter-svc: 4/4 PASS | A-31 EPIPE: 0 (PASS) | Memory=84.22% (PASS <85%)
- A-32 disk=40% (PASS <85%) | Cron: 100+ jobs, all success rates ≥98.2%
- Anomalies: 0 new | Status: HEALTHY

## c457 · 2026-06-24T22:14:27Z
### Audit Run Tier-1 (22:13–22:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200
- A-21 mcp-server RestartCount=0 | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY) | Memory=83.94% (PASS no OOM)
- A-25..A-28 inter-svc: 4/4 PASS | A-31 EPIPE: 0 count PASS | A-32 disk=39% PASS
- DB checks C-01..C-07 all PASS; PRAGMA integrity_check=ok; WAL=4.1MB <50MB
- Cron health: 80+ jobs running, 98.2%–100% success rate; no gaps
- B-09 SSC portal URLS: 0 (PASS) | B-13 stale BCTC: 0 (PASS) | B-08 PDFs: 80 landed
- VPS BCTC last push: 2026-06-16 (8d old) — OUT-OF-SEASON normal (June, no earnings)
- Anomalies: 0 new | Status: HEALTHY

## c456 · 2026-06-24T21:44:10Z
### Audit Run Tier-1 (21:43–21:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, no jump, RECORD-AND-LEAVE)
- A-30 mcp-mem=86.07% (rides known ceiling per FIX-AUDITOR-MEMORY-PCT-DENOMINATOR, PASS no OOMKilled jump) | A-32 disk=39% PASS | Cron: 80+ jobs 98.2–100% success
- Anomalies: 0 new | Status: HEALTHY

## c455 · 2026-06-24T21:13:59Z
### Audit Run Tier-1 (21:13–21:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, RECORD-AND-LEAVE per dedup policy)
- A-30 mcp-mem=84.13% <85% PASS | A-32 disk=39% <85% PASS | Cron: 80+ jobs ≥98.2% success rate
- Anomalies: 0 new (all known-standing) | Status: HEALTHY

## c454 · 2026-06-24T20:44:03Z
### Audit Run Tier-1 (20:43–20:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health: 5/5 HTTP 200 | A-20 pdf-extractor 3/3 multi-probe PASS
- A-21 mcp-server RestartCount=0 PASS | A-21 rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY ~1/hr, RECORD-AND-LEAVE per dedup policy)
- A-30 mcp-mem=83.30% <85% PASS | A-32 disk=39% <85% PASS | Cron: 80+ jobs ≥98.2% success rate
- Anomalies: 0 new (all known-standing) | Status: HEALTHY
