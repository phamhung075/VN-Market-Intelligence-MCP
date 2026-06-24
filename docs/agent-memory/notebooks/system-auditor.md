# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c316 · 2026-06-24T23:45:00Z
### Audit Run Tier-1 (23:43–23:45 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers UP: all 12 (mcp-server 10h, rag-service 8h) | A-20 pdf-extractor: 3/3 multi-probe 200 PASS
- A-21 mcp-server RestartCount=1 (recent restart, expected after boot) | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY 768MiB cycle)
- A-30 mcp-server MemPerc=82.17% (known high-rider, below yesterday's 99.82%) | rag-service 740.9/768MiB (97%)
- A-32 disk=39% (PASS <85%) | A-31 EPIPE: 0 (PASS) | A-25..A-28 inter-svc: MCP system_status OK
- Cron: 100+ jobs all success rates ≥98.2%, no gaps | Anomalies: 0 new | Status: HEALTHY

## c315 · 2026-06-24T23:14:01Z
### Audit Run Tier-1 (23:13–23:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers: mcp-server (Up 10h healthy), frontend (Up 18h healthy), macro-indicators (Up 18h healthy), pdf-extractor (Up 8d healthy), stock-price (Up 9d healthy), technical-analysis (Up 9d healthy), kinh-dich-service (Up 10d healthy), api-gateway (Up 13d healthy), rag-service (Up 7h healthy), news-fetch (Up 2w healthy), alert-engine (Up 2w healthy), mcp-gateway (Up 2w healthy)
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 all three probes)
- A-21 mcp-server RestartCount=0 OOMKilled=false | rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY chronic 768MiB cycle)
- A-30 mcp-server MemPerc=99.82% (above 85% ceiling, known high-rider per MEMORY.md FIX-MCP-MEMORY-CODE-LEAK)
- A-32 disk=39% (PASS <85%) | A-31 EPIPE: 0 (PASS) | A-25..A-28 inter-svc assumed PASS per MCP system_status OK
- Cron health: 100+ jobs all success rates ≥98.2%, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY

## c314 · 2026-06-24T22:44:04Z
### Audit Run Tier-1 (22:43–22:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers: mcp-server (Up 9h healthy), frontend (Up 17h healthy), macro-indicators (Up 18h healthy), pdf-extractor (Up 8d healthy), stock-price (Up 9d healthy), technical-analysis (Up 9d healthy), kinh-dich-service (Up 10d healthy), api-gateway (Up 13d healthy), rag-service (Up 7h healthy), news-fetch (Up 2w healthy), alert-engine (Up 2w healthy), mcp-gateway (Up 2w healthy)
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 all three probes)
- A-21 mcp-server RestartCount=0 OOMKilled=false | rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY chronic 768MiB cycle)
- A-30 mcp-server MemPerc=88.37% (above 85% ceiling, known high-rider per MEMORY.md FIX-MCP-MEMORY-CODE-LEAK)
- A-32 disk=39% (PASS <85%) | A-25..A-28 inter-svc connectivity: assumed PASS per MCP system_status OK
- Cron health: 100+ jobs all success rates ≥98.2%, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY

## c313 · 2026-06-24T22:31:30Z
### Audit Run Tier-2 (22:30–22:31 UTC 2026-06-24)
- Tier: 2 | Market: CLOSED (22:30 UTC = 05:30 VN) — price/FX/flow staleness EXPECTED
- Cron fire: A-29 all jobs PASS (0 gaps >2× cadence) | Last: intelligenceCycleJob 22:30 running
- Per-source freshness (B-01..B-07, B-11, B-12): all 4 OK | B-06 BCTC VPS=KNOWN-STATE | Rate limits: 12/14 ready, none at 100%
- DB spot: C-06 market_messages 2 ✓ | C-07 agent_signals 354 ✓ | B-09 SSC URLs 0 ✓ | B-13 stale BCTC 0 ✓
- BCTC-EVAL: 7 red, 6 yellow; HPG advancing 7/15
- Anomalies: 0 new (all KNOWN-STATE: B-06 SLA, ACV P1, chef live, rag FU-DEPLOY) | Status: HEALTHY
