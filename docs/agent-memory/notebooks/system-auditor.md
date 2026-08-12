# System Auditor Notebook

[Notebook initialized - Tier-2 audit cycle c46]

## c46 · 2026-08-12T08:00Z
### Audit Run Tier-2 (10:17–10:20 UTC 2026-08-12)
- Tier: 2 | Services: 13 checked | Sources: partial fetch | DB checks: 2
- Anomalies: 2 new (0 critical, 2 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

**Key Findings:**
- A-30 memory creep: RAG service 92.79% (improved from 97.19%, fix deployed)
- B-05 BCTC stale: 20.7h since last push (expected off-season, no active queue)
- Pipeline/VPS service health endpoints unreachable (mcp-server partial outage)
- DB freshness: market_messages=2/3h, agent_signals=103/24h (PASS)
- Cron status: 90 layer_a crons, 8 unresolved-join (no fire-evidence)

**RAG Service Memory Detail:**
- Container: vn-market-intelligence-mcp-rag-service-1
- Usage: 950.1 MiB / 1 GiB (92.79%), free ~51.9 MiB
- Image: Created 2026-08-12T10:14:37Z (after fix commit 2026-08-12T06:16:02Z)
- Fix: malloc_trim + LanceDB IvfPq (commit 4c8c601e6)
- Verdict: WARN (above 85% threshold, but improving)

## c47 · 2026-08-12T10:30Z
### Audit Run Tier-1 (10:30–10:43 UTC 2026-08-12)
**Probe Status:** FAILURE (two findings from probe.sh)

### RAW-PROBE:
```
{
  "verdict": "FAILURE",
  "detail": "health_3000: http://localhost:3000/health -> HTTP CURL_ERR; mem_creep: mem >= 85% threshold (A-30 WARN boundary, mem-creep gate): vn-market-intelligence-mcp-rag-service-1(86.31%, 140.2MiB-free, STALE-ACK(tracked_by=FU-RAG-DEPLOY-MEMORY,status=DONE_VERIFIED)) ;",
  "last_healthy_at": "2026-08-11T19:32:31Z"
}
```

### Investigation Findings:

**Finding 1: health_3000 CURL_ERR — VERDICT: TRANSIENT/FALSE POSITIVE**
- Direct curl test to http://localhost:3000/health at 10:42Z: HTTP 200 OK
- Response: {"status":"ok","name":"vn-market","version":"1.0.0","toolCount":183,"sessions":19,"uptime":58600.98...}
- Container status: vn-market-intelligence-mcp-mcp-server-1 "Up 16 hours (healthy)"
- Health check logs: successful HTTP 200 responses across recent timestamps
- Conclusion: The probe's CURL_ERR was a transient condition. The endpoint is operational and healthy now.
- Root cause: likely a momentary network hiccup or probe timing issue, not a real outage

**Finding 2: mem_creep 86.31% on rag-service — VERDICT: REAL BUT RECOVERED**
- Probe timestamp (from c46 Tier-2 cycle): 2026-08-12T08:00–10:20Z → reported 92.79%
- Probe failure timestamp: unknown (before this Tier-1 cycle started), reported 86.31%
- Live check at 10:42Z: vn-market-intelligence-mcp-rag-service-1 memory usage = **3.34%** (34.24 MiB / 1 GiB)
- Container state: Started 2026-08-12T10:40:47.948Z (fresh restart ~2 minutes ago)
- Health status: "healthy" per docker ps output
- Health check logs: successful recent checks at 10:41:23Z, 10:41:53Z
- Stale-ACK label audit:
  - Probe claims task "FU-RAG-DEPLOY-MEMORY" with status="DONE_VERIFIED"
  - Current board state: FU-RAG-DEPLOY-MEMORY NOT FOUND in task_board (done_verified[], active_sprints[], backlog, etc.)
  - Dedup ledger shows 3rd recurrence: "microservice_degraded:rag-service:A-30:lancedb-undeployed-3rd-recurrence" at 2026-08-12T07:08:24Z
  - **Conclusion: STALE-ACK label is incorrect/outdated. The task is not in the board. The issue is REAL (3rd recurrence in dedup ledger) but was JUST resolved by a container restart**
- Timeline: ops appears to have initiated a container restart between 10:20Z (end of Tier-2 cycle) and 10:40:47Z (fresh start), bringing memory from 92.79% down to 3.34%
- Verdict: **REAL unresolved memory issue that recurred (3rd time), but has been operationally remediated by restart**

### A-30 Recurrence Context:
Per dedup ledger, rag-service A-30 findings span 2026-08-05 through today (2026-08-12):
- Multiple "mem_pressure", "memory_pressure", "microservice_degraded" entries
- Escalation pattern: floor-breach (06-08), loss-of-reclamation (06-07), BELOW-FLOOR (08-08), recurring-ceiling (08-08), lancedb-undeployed-3rd-recurrence (08-12)
- Most recent (today): "microservice_memory_leak:rag-service:escalating-post-restart-20260812" at 2026-08-12T02:22:10Z

### Findings Summary:
1. **health_3000**: No action required — transient curl issue, endpoint healthy
2. **mem_creep**: **Escalation needed** — recurring A-30 issue on rag-service (3rd recurrence per dedup); last fix did not hold; root cause remains unresolved (lancedb deployment state); recommend architectural review of rag-service memory architecture and lancedb configuration
