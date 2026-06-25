# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c347 · 2026-06-25T08:43:51Z
### Audit Run Tier-1 (08:43–08:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (4h, RestartCount=0 BUILD-04:38Z sha=4ef240ed, mem=54.17% 1.083GiB/2GiB), rag-service (6m, RestartCount=118 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY +1 recycle), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 HTTP 200 PASS (no event-loop stall)
- A-30 mcp-server mem=54.17% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (38Gi avail, PASS)
- B-05 BCTC healthy-idle: queue pending, push-age ~200h << SLA-1714.5h out-of-window → PASS
- Crons: 100+ active, success ≥98% | Circuit breakers: 16/16 OK | No fire gaps
- RAW-PROBE: docker ps 12/12 up; health 5/5 200; mem 54.17%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

## c346 · 2026-06-25T08:13:38Z
### Audit Run Tier-1 (08:12–08:13 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (4h, RestartCount=0 BUILD-04:38Z sha=4ef240ed, mem=45.11% 923.9MiB/2GiB), rag-service (3h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-30 mcp-server mem=45.11% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi avail, 13Gi used, PASS)
- B-05 BCTC healthy-idle: queue pending, push-age ~200h << SLA-1714.5h out-of-window → PASS
- VPS proxy: prices OK 08:12:14, news OK 08:04:14, sbv OK 08:05:54, bctc stale 2026-06-16 18:02 (by-design off-season, not actionable per SLA)
- Crons: 100+ active, success ≥98% | Circuit breakers: 16/16 OK | No fire gaps
- RAW-PROBE: docker ps all 12 up; health 5/5 200; mem 45.11%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

## c345 · 2026-06-25T07:44:10Z
### Audit Run Tier-1 (07:43–07:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (3h, RestartCount=0 BUILD-04:38Z, mem=37.12% 760.3MiB/2GiB), rag-service (2h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 200 200) — no event-loop stall
- A-30 mcp-server mem=37.12% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=203h << SLA-1714.5h out-of-window → PASS
- Circuit breakers: 16/16 OK | Crons: 100+ active, success ≥98% | No gaps
- RAW-PROBE: docker ps all 12 up; health 5/5 200; mem 37.12%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

