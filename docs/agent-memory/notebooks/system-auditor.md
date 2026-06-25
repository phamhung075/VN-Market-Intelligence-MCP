# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c323 · 2026-06-25T02:31:32Z
### Audit Run Tier-2 (02:31 UTC 2026-06-25)
- Tier: 2 | Cron Fire: all 100+ jobs ≥98% success, no gaps detected
- Per-source freshness (pipeline_health): price=OK, news=OK, sbv_fx=OK, foreign_flow=OK (market-hours aware)
- SLA status: 4 ok (price/news/sbv/foreign), 1 breached (bctc stale 11869min)
- B-05/bctc-discover: stale ≥168h — DEDUP (VPS host up 8d+, pending queue=0, unreachable=false; FIX-BCTC-SLA-THRESHOLD-360 P1-ready)
- VPS proxy routes: 4 healthy (price/news/sbv/foreign) | 1 stale-artifact (bctc last push 2026-06-16, no new pushes in earnings-off-season)
- DB freshness spot: market_messages(3h)=4 PASS, agent_signals(24h)=232 PASS, bctc_ssc_urls=0 PASS, bctc_pending_72h=0 PASS
- Rate limits: 0/12 sources at 100%
- Anomalies: 0 new | Status: HEALTHY

## c322 · 2026-06-25T02:14:18Z
### Audit Run Tier-1 (02:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h healthy, RestartCount=1 expected), frontend (21h), macro-indicators (21h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (1h healthy, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-20 pdf-extractor multi-probe: 3/3 passed 200 OK (event-loop responsive)
- A-21 RestartCount: mcp-server=1 PASS | rag-service=109 KNOWN-STANDING (FU-RAG-DEPLOY 768MiB OOM cycle ~1/hr, no escalation)
- A-30 mcp-server mem=33.24% (680.7/2048 MiB, PASS <85%) | A-32 disk=40% (20Gi free, PASS)
- Cron: 100+ jobs all running, success rates ≥98%, no gaps
- B-05/bctc-discover: 197.5h stale (RECORD-AND-LEAVE: VPS vn-bctc-fetch='unhealthy' cosmetic artifact, pending queue=0, no signal)
- Anomalies: 0 new | Status: HEALTHY

## c321 · 2026-06-25T01:44:33Z
### Audit Run Tier-1 (01:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h2m healthy, RestartCount=1 recent start), frontend (20h), macro-indicators (21h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (51m, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM cycle), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-30 mcp-server MemPerc=30.90% (632.9/2048 MiB, healthy <85% ceiling) | A-32 disk=39% (21Gi free, PASS)
- Cron: all 100+ jobs running, latest success rates ≥98%, no gaps detected  
- Anomalies: 1 CRITICAL (bctc-discover stale 199.7h, VPS vn-bctc-fetch unhealthy 9d+) | Status: DEGRADED
